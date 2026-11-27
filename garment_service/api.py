"""Selfit hoodie import API and single durable worker."""

import base64
import binascii
import fcntl
import hashlib
import json
import logging
import os
import re
import sqlite3
import threading
import time
import uuid
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.concurrency import run_in_threadpool

from .generate import VERSION, build, preview
from .source import MAX_IMAGE, ROOT, InputError, canonical, clean, lookup, product_id, sizes

log = logging.getLogger(__name__)
DATA = Path(os.getenv("SELFIT_GARMENT_DATA", "./.garment-data")).resolve()
JOB_TTL = 3*24*3600
CACHE_TTL = 14*24*3600
MAX_PENDING = 30
ID = re.compile(r"[0-9a-f]{32}")
PHOTO_SLOT = re.compile(r"front|back|photo[0-9]{1,2}")
RETRY = {"lookup_running": "lookup_queued", "build_running": "build_queued"}


@contextmanager
def db():
    connection = sqlite3.connect(DATA / "jobs.sqlite3", timeout=15)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def get_job(token):
    if not ID.fullmatch(token):
        raise HTTPException(404, "가져오기 작업을 찾을 수 없습니다.")
    with db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE token=?", (token,)).fetchone()
    if not row:
        raise HTTPException(404, "가져오기 작업을 찾을 수 없습니다.")
    return dict(row)


def status(job):
    return {"id": job["token"], "status": job["status"], **json.loads(job["payload"])}


def write_atomic(path, content):
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}")
    try:
        tmp.write_bytes(content)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def update(token, state, payload, key=None, snapshot=None):
    with db() as conn:
        conn.execute("UPDATE jobs SET status=?,payload=?,updated=?,asset=?,inputs=? WHERE token=?",
                     (state, encode(payload), time.time(), key, snapshot, token))


def claim():
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        job = conn.execute("SELECT * FROM jobs WHERE status IN ('lookup_queued','build_queued') "
                           "ORDER BY updated LIMIT 1").fetchone()
        if job:
            conn.execute("UPDATE jobs SET status=?,updated=? WHERE token=?",
                         (job["status"].replace("_queued", "_running"), time.time(), job["token"]))
    return job


def perform_lookup(job):
    product, rows, views, photos, source, notice = lookup(job["product"])
    if not product["name"]:
        product["url"] = canonical(job["product"])
    folder = DATA / "jobs" / job["token"]
    payload = {"product": product, "sizes": rows, "photos": [], "source": source, "notice": notice}
    if product["type"] != "ziphoodie" and product["name"]:
        payload["notice"] = "현재는 후드 집업만 3D로 가져올 수 있습니다."
        update(job["token"], "unsupported", payload)
        return
    for slot in views:
        try:
            thumb = preview(photos[slot])
        except InputError:
            continue
        write_atomic(folder / slot, photos[slot])
        write_atomic(folder / f"{slot}.jpg", thumb)
        payload["photos"].append(slot)
    complete = bool(rows) and all(all(row[key] is not None for key in ("length", "shoulder", "chest", "sleeve"))
                                  for row in rows)
    update(job["token"], "review" if payload["photos"] and complete else "needs_input", payload)


def cache_digest(front, back, rows, asset=None):
    digest = hashlib.sha256(f"{VERSION}|".encode())
    for blob in (front, back or b"", encode(rows).encode(), asset or b""):
        digest.update(hashlib.sha256(blob).digest())
    return digest.hexdigest()


def perform_build(job):
    folder = DATA / "jobs" / job["token"]
    payload = json.loads(job["payload"])
    inputs = json.loads(job["inputs"])
    rows = inputs["sizes"]
    front = (folder / inputs["front"]).read_bytes()
    back = (folder / inputs["back"]).read_bytes() if inputs["back"] else None
    featured = next((row for row in rows if row["label"].upper() == "M"), rows[0])
    benchmark = (payload["source"] == "Selfit KC9315 샘플" and
                 inputs["front"] == "front" and not back and rows == payload["sizes"])
    try:
        fixture = (ROOT / "assets" / "adidas-kc9315.glb").read_bytes() if benchmark else None
        model_key = os.getenv("SELFIT_U2NETP_VERSION", "u2netp") if os.getenv("SELFIT_U2NETP_MODEL") else "fallback"
        key = cache_digest(front, back, rows, hashlib.sha256(fixture).digest() if fixture else model_key.encode())
        asset_path = DATA / "assets" / f"{key}.glb"
        note_path = asset_path.with_suffix(".json")
        if asset_path.exists() and note_path.exists():
            details = json.loads(note_path.read_text())
            os.utime(asset_path)
            os.utime(note_path)
        else:
            if fixture:
                data, details = fixture, {"color": "#1d1c20", "view": "catalog", "segmentation": []}
            else:
                data, details = build(front, back, featured)
            write_atomic(asset_path, data)
            write_atomic(note_path, encode(details).encode())
    except InputError as exc:
        update(job["token"], "needs_input", {**payload, "notice": str(exc)})
        return
    product = {**payload["product"], **inputs["product"]}
    result = {"product": product, "sizes": rows, "source": inputs["measurementSource"],
              "photos": payload["photos"], "appearance": details, "referenceSize": featured["label"],
              "thumbnail": f"{inputs['front']}.jpg", "assetKind": "catalog" if benchmark else "generated"}
    update(job["token"], "ready", result, key)


def clean_old():
    import shutil

    now = time.time()
    with db() as conn:
        old = conn.execute(
            "DELETE FROM jobs WHERE updated<? AND status NOT LIKE '%_running' AND status NOT LIKE '%_queued' "
            "RETURNING token", (now-JOB_TTL,)).fetchall()
        retained = {row["asset"] for row in conn.execute("SELECT asset FROM jobs WHERE asset IS NOT NULL")}
    for (token,) in old:
        shutil.rmtree(DATA / "jobs" / token, ignore_errors=True)
    for file in (DATA / "assets").iterdir():
        if file.stem not in retained and file.stat().st_mtime < now-CACHE_TTL:
            file.unlink(missing_ok=True)


def run_worker(stop):
    next_cleanup = 0
    with db() as conn:
        for before, after in RETRY.items():
            conn.execute("UPDATE jobs SET status=? WHERE status=?", (after, before))
    while not stop.is_set():
        try:
            if time.time() >= next_cleanup:
                clean_old()
                next_cleanup = time.time()+3600
            job = claim()
            if not job:
                stop.wait(.35)
                continue
            task = perform_lookup if job["status"] == "lookup_queued" else perform_build
            try:
                task(job)
            except Exception:
                log.exception("Garment task failed (%s)", job["status"])
                payload = json.loads(job["payload"])
                state = "needs_input" if job["status"] == "build_queued" else "failed"
                update(job["token"], state, {**payload, "notice": "처리 중 문제가 발생했습니다. 다시 시도해 주세요."})
        except Exception:
            log.exception("Garment worker could not process the queue")
            stop.wait(3)


@asynccontextmanager
async def lifespan(_app):
    for path in (DATA, DATA / "jobs", DATA / "assets"):
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (DATA / "worker.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with db() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("CREATE TABLE IF NOT EXISTS jobs (token TEXT PRIMARY KEY, product TEXT NOT NULL, "
                         "status TEXT NOT NULL, payload TEXT NOT NULL, updated REAL NOT NULL, asset TEXT, inputs TEXT)")
        stop = threading.Event()
        worker = threading.Thread(target=run_worker, args=(stop,), daemon=True)
        worker.start()
        try:
            yield
        finally:
            stop.set()
            worker.join()


app = FastAPI(title="Selfit Garment Import", lifespan=lifespan)
origins = os.getenv("SELFIT_ALLOWED_ORIGINS",
                    "http://localhost:3187,http://127.0.0.1:3187,https://siwoojang09.github.io").split(",")
app.add_middleware(CORSMiddleware, allow_origins=[item.strip() for item in origins],
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.exception_handler(InputError)
async def bad_input(_request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=422)


async def body_json(request, limit):
    if request.headers.get("content-type", "").split(";", 1)[0] != "application/json":
        raise HTTPException(415, "JSON 요청이 필요합니다.")
    raw = bytearray()
    async for piece in request.stream():
        raw.extend(piece)
        if len(raw) > limit:
            raise HTTPException(413, "업로드 크기가 너무 큽니다.")
    try:
        data = json.loads(raw)
    except (ValueError, RecursionError):
        raise InputError("입력 자료 형식을 확인해 주세요.")
    if not isinstance(data, dict):
        raise InputError("입력 자료 형식을 확인해 주세요.")
    return data


@app.get("/api/garment/health")
def health():
    return {"version": VERSION, "musinsa": "public" if os.getenv("SELFIT_MUSINSA_PUBLIC") == "1" else "fixture_or_feed",
            "segmentation": "u2netp" if os.getenv("SELFIT_U2NETP_MODEL") else "background"}


def limit_queue(conn):
    pending = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE status LIKE '%_queued' OR status LIKE '%_running'").fetchone()[0]
    if pending >= MAX_PENDING:
        raise HTTPException(429, "대기 중인 작업이 많습니다. 잠시 뒤에 다시 시도해 주세요.")


def new_job(url):
    identifier = product_id(url)
    token = uuid.uuid4().hex
    folder = DATA / "jobs" / token
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        limit_queue(conn)
        folder.mkdir(mode=0o700)
        conn.execute("INSERT INTO jobs VALUES (?,?,?,?,?,?,?)",
                     (token, identifier, "lookup_queued", "{}", time.time(), None, None))
    return status(get_job(token))


@app.post("/api/garment/jobs", status_code=202)
async def register(request: Request):
    data = await body_json(request, 8192)
    return await run_in_threadpool(new_job, data.get("url"))


@app.get("/api/garment/jobs/{token}")
def job_status(token: str):
    return JSONResponse(status(get_job(token)), headers={"Cache-Control": "no-store"})


def image_bytes(upload):
    if not isinstance(upload, str) or len(upload) > (MAX_IMAGE+2)//3*4:
        raise InputError("사진은 한 장당 12MB 이하로 올려 주세요.")
    try:
        blob = base64.b64decode(upload, validate=True)
    except (ValueError, binascii.Error):
        raise InputError("사진 데이터가 손상되었습니다.")
    if not 0 < len(blob) <= MAX_IMAGE:
        raise InputError("사진은 한 장당 12MB 이하로 올려 주세요.")
    return blob


def submit(token, data):
    job = get_job(token)
    if job["status"] not in {"review", "needs_input"}:
        raise HTTPException(409, "이미 처리 중이거나 완료된 작업입니다.")
    payload = json.loads(job["payload"])
    metadata = payload["product"]
    if not metadata["type"] and data.get("confirmZipHoodie") is not True:
        raise InputError("후드 집업 상품이 맞는지 확인해 주세요.")
    product = {key: metadata[key] or clean(data.get(key), limit)
               for key, limit in (("name", 90), ("brand", 45), ("code", 45), ("colourName", 45))}
    if not product["name"]:
        raise InputError("상품명을 입력해 주세요.")
    rows = sizes(data.get("sizes"))
    folder = DATA / "jobs" / token
    photos, uploads = {}, {}
    for view in ("front", "back"):
        upload, selected = data.get(f"{view}Upload"), data.get(view)
        if upload:
            blob = image_bytes(upload)
            uploads[view] = (blob, preview(blob))
            photos[view] = f"upload-{view}-{uuid.uuid4().hex}"
        elif isinstance(selected, str) and selected in payload["photos"]:
            photos[view] = selected
        else:
            photos[view] = None
    if not photos["front"]:
        raise InputError("정면 상품 사진을 선택하거나 올려 주세요.")
    if photos["front"] == photos["back"]:
        raise InputError("정면과 뒷면에는 서로 다른 사진을 선택해 주세요.")
    measurement_source = payload["source"] if rows == payload["sizes"] else "직접 확인한 실측"
    snapshot = {"sizes": rows, "product": {**product, "type": "ziphoodie"},
                "measurementSource": measurement_source, **photos}
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        limit_queue(conn)
        changed = conn.execute(
            "UPDATE jobs SET status='build_queued',inputs=?,updated=? WHERE token=? AND status IN ('review','needs_input')",
            (encode(snapshot), time.time(), token)).rowcount
        if not changed:
            raise HTTPException(409, "이미 처리 중이거나 완료된 작업입니다.")
        for view, (blob, thumb) in uploads.items():
            write_atomic(folder / photos[view], blob)
            write_atomic(folder / f"{photos[view]}.jpg", thumb)
        # Failed builds allow replacement uploads, but keep only the active ones.
        live = {name for slot in photos.values() if slot for name in (slot, f"{slot}.jpg")}
        for path in folder.glob("upload-*"):
            if path.name not in live:
                path.unlink()
    return status(get_job(token))


@app.post("/api/garment/jobs/{token}/build", status_code=202)
async def build_job(token: str, request: Request):
    data = await body_json(request, 2*((MAX_IMAGE+2)//3*4)+8192)
    return await run_in_threadpool(submit, token, data)


@app.get("/api/garment/jobs/{token}/photo/{slot}")
def photo(token: str, slot: str):
    job = get_job(token)
    payload = json.loads(job["payload"])
    allowed = {f"{name}.jpg" for name in payload.get("photos", []) if PHOTO_SLOT.fullmatch(name)}
    if job["status"] == "ready":
        allowed.add(payload["thumbnail"])
    if slot not in allowed:
        raise HTTPException(404, "상품 사진을 찾을 수 없습니다.")
    return FileResponse(DATA / "jobs" / token / slot, media_type="image/jpeg",
                        headers={"Cache-Control": "private, no-store", "Vary": "Origin"})


@app.get("/api/garment/jobs/{token}/asset")
def asset(token: str):
    job = get_job(token)
    if job["status"] != "ready":
        raise HTTPException(404, "완성된 3D 모델이 없습니다.")
    return FileResponse(DATA / "assets" / f"{job['asset']}.glb", media_type="model/gltf-binary",
                        headers={"Cache-Control": "private, no-store", "Vary": "Origin"})
