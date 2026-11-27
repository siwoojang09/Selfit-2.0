"""Same-origin Selfit app server with persistent accounts, discussions and test orders."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import subprocess
import time
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get("SELFIT_WEB_DATA", ROOT / ".selfit-web-data")).resolve()
SESSION_AGE = 14 * 86400
COOKIE = "selfit_session"
TAGS = ("캐주얼", "미니멀", "스트리트", "오피스")
HEADERS = {"Cache-Control": "no-store"}
ASSET_DIRS = {"anatomy-assets", "assets", "catalog", "discovery-art", "looks", "textures", "vendor"}
EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
AUTH_ERROR = "이메일 또는 비밀번호를 확인해 주세요."


@contextmanager
def db():
    connection = sqlite3.connect(DATA / "selfit.sqlite3", timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        with connection:
            yield connection
    finally:
        connection.close()


def password_hash(password, salt):
    return hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt), n=1<<14, r=8, p=1).hex()


def token_hash(value):
    return hashlib.sha256(value.encode("ascii")).hexdigest()


@asynccontextmanager
async def lifespan(app):
    DATA.mkdir(mode=0o700, parents=True, exist_ok=True)
    raw = subprocess.check_output(["node","--input-type=module","-e",
        "import {shopProducts,editorialLooks} from './shop-data.mjs';console.log(JSON.stringify({shopProducts,editorialLooks}))"],
        cwd=ROOT, timeout=10)
    catalog = json.loads(raw)
    app.state.products = {item["id"]:item for item in catalog["shopProducts"]}
    app.state.editorial = catalog["editorialLooks"]
    with db() as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY, user TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS looks (
                id TEXT PRIMARY KEY, user TEXT REFERENCES users(id), title TEXT NOT NULL,
                body TEXT NOT NULL, tag TEXT NOT NULL, items TEXT NOT NULL, created INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS likes (
                look TEXT REFERENCES looks(id) ON DELETE CASCADE, user TEXT REFERENCES users(id), PRIMARY KEY(look,user)
            );
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY, look TEXT NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
                user TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reports (
                look TEXT REFERENCES looks(id) ON DELETE CASCADE, user TEXT REFERENCES users(id), reason TEXT NOT NULL,
                created INTEGER NOT NULL, PRIMARY KEY(look,user)
            );
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY, user TEXT REFERENCES users(id), request_id TEXT NOT NULL, items TEXT NOT NULL,
                total INTEGER NOT NULL, created INTEGER NOT NULL, UNIQUE(user,request_id)
            );
            CREATE TABLE IF NOT EXISTS attempts (
                key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL
            );
        """)
        for post in app.state.editorial:
            connection.execute("INSERT OR IGNORE INTO looks VALUES(?,NULL,?,?,?,?,0)",
                (post["id"],post["title"],post["body"],post["tag"],json.dumps(post["items"])))
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def protect(request, call_next):
    if request.url.path.startswith("/api/selfit/") and request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        configured = os.environ.get("SELFIT_WEB_ORIGIN","").rstrip("/")
        same_origin = configured or str(request.base_url).rstrip("/")
        if request.headers.get("sec-fetch-site") == "cross-site" or (origin and origin != same_origin):
            return JSONResponse({"detail":"요청 출처를 확인할 수 없습니다."},status_code=403,headers=HEADERS)
        if request.headers.get("content-type","").split(";",1)[0] != "application/json":
            return JSONResponse({"detail":"JSON 요청이 필요합니다."},status_code=415,headers=HEADERS)
    response = await call_next(request)
    if request.url.path.startswith("/api/selfit/"):
        response.headers.update(HEADERS)
    response.headers["X-Content-Type-Options"]="nosniff"
    return response


def current(request, required=True):
    raw = request.cookies.get(COOKIE,"")
    user = None
    if re.fullmatch(r"[0-9a-f]{64}",raw):
        with db() as connection:
            user = connection.execute("SELECT users.id,users.name FROM sessions JOIN users ON sessions.user=users.id WHERE token=? AND expires>?",
                (token_hash(raw),int(time.time()))).fetchone()
    if required and not user:
        raise HTTPException(401,"로그인 후 이용할 수 있습니다.")
    return dict(user) if user else None


def issue_session(request, response, user):
    now = int(time.time())
    raw = secrets.token_hex(32)
    previous = request.cookies.get(COOKIE,"")
    with db() as connection:
        connection.execute("DELETE FROM sessions WHERE expires<=?",(now,))
        if re.fullmatch(r"[0-9a-f]{64}",previous):
            connection.execute("DELETE FROM sessions WHERE token=?",(token_hash(previous),))
        connection.execute("INSERT INTO sessions VALUES(?,?,?)",(token_hash(raw),user["id"],now+SESSION_AGE))
    secure = request.url.scheme=="https" or os.environ.get("SELFIT_WEB_ORIGIN","").startswith("https://")
    response.set_cookie(COOKIE,raw,max_age=SESSION_AGE,httponly=True,samesite="lax",secure=secure,path="/")
    return {"user":user}


def auth_rate(request, action):
    key = f"{action}:{request.client.host if request.client else 'unknown'}"
    now = int(time.time())
    with db() as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("DELETE FROM attempts WHERE until<=?",(now,))
        connection.execute("INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",(key,now+300))
        count = connection.execute("SELECT count FROM attempts WHERE key=?",(key,)).fetchone()[0]
    if count>(20 if action=="login" else 12):
        raise HTTPException(429,"잠시 후 다시 시도해 주세요.")


class Credentials(BaseModel):
    email: str = Field(min_length=3,max_length=254)
    password: str = Field(min_length=1,max_length=128)


class Signup(Credentials):
    name: str = Field(min_length=2,max_length=24)


class Look(BaseModel):
    title: str = Field(min_length=2,max_length=80)
    body: str = Field(min_length=2,max_length=800)
    tag: str
    items: list[str] = Field(min_length=1,max_length=4)


class Comment(BaseModel):
    body: str = Field(min_length=1,max_length=400)


class Report(BaseModel):
    reason: str


class OrderRow(BaseModel):
    product: str
    size: str
    quantity: int = Field(ge=1,le=5,strict=True)


class Order(BaseModel):
    requestId: str = Field(pattern=r"^[0-9a-f-]{36}$")
    items: list[OrderRow] = Field(min_length=1,max_length=30)


def clean(value, min_length=1):
    value = value.strip()
    if len(value)<min_length:
        raise HTTPException(422,"내용을 입력해 주세요.")
    return value


@app.get("/api/selfit/session")
def session(request: Request):
    return {"user":current(request,False)}


@app.post("/api/selfit/signup",status_code=201)
def signup(data: Signup, request: Request, response: Response):
    auth_rate(request,"signup")
    name, email = clean(data.name,2), data.email.strip().lower()
    if not EMAIL.fullmatch(email) or len(data.password)<8:
        raise HTTPException(422,"이메일 형식과 비밀번호 8자 이상을 확인해 주세요.")
    user = {"id":secrets.token_hex(16),"name":name}
    salt = secrets.token_hex(16)
    try:
        with db() as connection:
            connection.execute("INSERT INTO users VALUES(?,?,?,?,?)",
                (user["id"],email,name,salt,password_hash(data.password,salt)))
    except sqlite3.IntegrityError:
        raise HTTPException(409,"이미 가입된 이메일입니다.")
    return issue_session(request,response,user)


@app.post("/api/selfit/login")
def login(data: Credentials, request: Request, response: Response):
    auth_rate(request,"login")
    with db() as connection:
        row = connection.execute("SELECT * FROM users WHERE email=?",(data.email.strip().lower(),)).fetchone()
    verified = password_hash(data.password,row["salt"] if row else "00"*16)
    if not hmac.compare_digest(verified,row["password"] if row else "00"*64) or not row:
        raise HTTPException(401,AUTH_ERROR)
    return issue_session(request,response,{"id":row["id"],"name":row["name"]})


@app.post("/api/selfit/logout")
def logout(request: Request, response: Response):
    raw = request.cookies.get(COOKIE,"")
    if re.fullmatch(r"[0-9a-f]{64}",raw):
        with db() as connection:
            connection.execute("DELETE FROM sessions WHERE token=?",(token_hash(raw),))
    response.delete_cookie(COOKIE,path="/")
    return {"user":None}


def require_look(connection, post):
    row = connection.execute("SELECT user FROM looks WHERE id=?",(post,)).fetchone()
    if row is None:
        raise HTTPException(404,"코디를 찾을 수 없습니다.")
    return row["user"]


@app.get("/api/selfit/looks")
def looks(request: Request):
    user = current(request,False)
    viewer = user["id"] if user else ""
    with db() as connection:
        posts = connection.execute("""
            SELECT l.*,coalesce(u.name,'SELFIT 편집팀') AS author,
              (SELECT count(*) FROM likes k WHERE k.look=l.id) AS likes,
              EXISTS(SELECT 1 FROM likes k WHERE k.look=l.id AND k.user=?) AS liked,
              (SELECT count(*) FROM comments c WHERE c.look=l.id) AS comment_count
            FROM looks l LEFT JOIN users u ON u.id=l.user ORDER BY created DESC,id LIMIT 100
        """,(viewer,)).fetchall()
    return {"looks":[{"id":row["id"],"title":row["title"],"body":row["body"],"tag":row["tag"],
        "items":json.loads(row["items"]),"author":row["author"],"editorial":row["user"] is None,"owned":row["user"]==viewer,
        "likes":row["likes"],"liked":bool(row["liked"]),"commentCount":row["comment_count"]} for row in posts]}


@app.post("/api/selfit/looks",status_code=201)
def post_look(data: Look, request: Request):
    user = current(request)
    if data.tag not in TAGS or len(set(data.items))!=len(data.items) or any(i not in app.state.products for i in data.items):
        raise HTTPException(422,"코디 태그와 상품을 확인해 주세요.")
    post = secrets.token_hex(16)
    with db() as connection:
        connection.execute("INSERT INTO looks VALUES(?,?,?,?,?,?,?)",
            (post,user["id"],clean(data.title,2),clean(data.body,2),data.tag,json.dumps(data.items),int(time.time())))
    return {"id":post}


@app.post("/api/selfit/looks/{post}/delete")
def delete_look(post: str, request: Request):
    user = current(request)
    with db() as connection:
        if require_look(connection,post)!=user["id"]:
            raise HTTPException(403,"본인이 작성한 코디만 삭제할 수 있습니다.")
        connection.execute("DELETE FROM looks WHERE id=?",(post,))
    return {"ok":True}


@app.get("/api/selfit/looks/{post}/comments")
def comments(post: str, request: Request):
    user = current(request,False)
    with db() as connection:
        require_look(connection,post)
        rows = connection.execute("SELECT c.*,u.name FROM comments c JOIN users u ON u.id=c.user WHERE c.look=? ORDER BY c.created,c.id LIMIT 100",(post,)).fetchall()
    return {"comments":[{"id":row["id"],"body":row["body"],"author":row["name"],"owned":bool(user and user["id"]==row["user"])} for row in rows]}


@app.post("/api/selfit/looks/{post}/comments",status_code=201)
def comment(post: str, data: Comment, request: Request):
    user = current(request)
    with db() as connection:
        require_look(connection,post)
        connection.execute("INSERT INTO comments VALUES(?,?,?,?,?)",
            (secrets.token_hex(16),post,user["id"],clean(data.body),int(time.time())))
    return {"ok":True}


@app.post("/api/selfit/looks/{post}/comments/{entry}/delete")
def delete_comment(post: str, entry: str, request: Request):
    user = current(request)
    with db() as connection:
        result=connection.execute("DELETE FROM comments WHERE id=? AND look=? AND user=?",(entry,post,user["id"]))
        if not result.rowcount:
            raise HTTPException(404,"삭제할 댓글을 찾을 수 없습니다.")
    return {"ok":True}


@app.post("/api/selfit/looks/{post}/like")
def like(post: str, request: Request):
    user = current(request)
    with db() as connection:
        connection.execute("BEGIN IMMEDIATE")
        require_look(connection,post)
        removed = connection.execute("DELETE FROM likes WHERE look=? AND user=?",(post,user["id"])).rowcount
        if not removed:
            connection.execute("INSERT INTO likes VALUES(?,?)",(post,user["id"]))
    return {"liked":not bool(removed)}


@app.post("/api/selfit/looks/{post}/report")
def report(post: str, data: Report, request: Request):
    user = current(request)
    if data.reason not in {"개인정보 노출","부적절한 내용","스팸"}:
        raise HTTPException(422,"신고 이유를 선택해 주세요.")
    with db() as connection:
        require_look(connection,post)
        connection.execute("INSERT OR IGNORE INTO reports VALUES(?,?,?,?)",(post,user["id"],data.reason,int(time.time())))
    return {"ok":True}


def order_payload(row):
    return {"id":row["id"],"items":json.loads(row["items"]),"total":row["total"],"created":row["created"]}


@app.get("/api/selfit/orders")
def orders(request: Request):
    user = current(request)
    with db() as connection:
        rows = connection.execute("SELECT * FROM orders WHERE user=? ORDER BY created DESC",(user["id"],)).fetchall()
    return {"orders":[order_payload(row) for row in rows]}


@app.post("/api/selfit/orders",status_code=201)
def order(data: Order,request: Request):
    user = current(request)
    with db() as connection:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute("SELECT * FROM orders WHERE request_id=? AND user=?",(data.requestId,user["id"])).fetchone()
        if existing:
            return order_payload(existing)
        items, seen, total = [], set(), 0
        for row in data.items:
            product = app.state.products.get(row.product)
            key = (row.product,row.size)
            if key in seen or not product or not product["demo"] or not any(
                option["label"]==row.size and option["stock"] for option in product["sizes"]
            ):
                raise HTTPException(422,"장바구니의 상품과 사이즈를 확인해 주세요.")
            seen.add(key)
            items.append({"product":row.product,"size":row.size,"quantity":row.quantity,
                "name":product["name"],"price":product["price"]})
            total += product["price"]*row.quantity
        entry = secrets.token_hex(8)
        connection.execute("INSERT INTO orders VALUES(?,?,?,?,?,?)",
            (entry,user["id"],data.requestId,json.dumps(items,ensure_ascii=False),total,int(time.time())))
        return order_payload(connection.execute("SELECT * FROM orders WHERE id=?",(entry,)).fetchone())


@app.get("/",include_in_schema=False)
@app.get("/{filename:path}",include_in_schema=False)
def static(filename: str="index.html"):
    filename = filename or "index.html"
    parts = Path(filename).parts
    allowed = (len(parts)==1 and Path(filename).suffix in {".html",".mjs",".js",".css",".webp"}) or (
        len(parts)>1 and parts[0] in ASSET_DIRS and not any(part.startswith(".") for part in parts))
    asset = (ROOT / filename).resolve()
    if not allowed or ROOT not in asset.parents or not asset.is_file():
        raise HTTPException(404)
    return FileResponse(asset,headers={"Cache-Control":"no-cache"})
