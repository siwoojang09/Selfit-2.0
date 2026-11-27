"""Product metadata from a permissioned feed or documented public page fields."""

import json
import os
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

import httpx
from lxml import html

ROOT = Path(__file__).resolve().parents[1]
SHOP_HOSTS = {"www.musinsa.com", "musinsa.com", "m.musinsa.com"}
IMAGE_HOSTS = {"image.msscdn.net", "img.musinsa.com"}
FIELDS = {
    "length": (33, 99), "shoulder": (28, 96), "chest": (32, 94),
    "sleeve": (7, 85), "hem": (30, 95),
}
ALIASES = {
    "length": ("총장", "옷길이"), "shoulder": ("어깨너비", "어깨넓이", "어깨단면"),
    "chest": ("가슴단면",), "sleeve": ("소매길이", "팔길이"), "hem": ("밑단단면",),
}
MAX_IMAGE = 12 * 1024 * 1024
USER_AGENT = "SelfitGarmentImporter/1.0"

class InputError(ValueError):
    pass


def safe_url(value, hosts):
    try:
        parts = urlsplit(value)
        if (parts.scheme == "https" and parts.netloc.lower() in hosts and
                not parts.fragment and len(value) <= 2048):
            return parts
    except (ValueError, AttributeError):
        pass
    raise InputError("지원하는 무신사 HTTPS 주소를 입력해 주세요.")


def product_id(value):
    if not isinstance(value, str):
        raise InputError("무신사 상품 링크를 입력해 주세요.")
    parts = safe_url(value.strip().split("#", 1)[0], SHOP_HOSTS)
    match = re.fullmatch(r"/products/([1-9][0-9]{0,11})/?", parts.path)
    if not match:
        raise InputError("무신사 상품 상세 링크(예: /products/5329359)를 입력해 주세요.")
    return match[1]


def canonical(identifier):
    return f"https://www.musinsa.com/products/{identifier}"


def sizes(data, partial=False):
    if not isinstance(data, list) or not 1 <= len(data) <= 20:
        raise InputError("사이즈를 1개 이상, 최대 20개 입력해 주세요.")
    rows, seen = [], set()
    for source in data:
        if not isinstance(source, dict) or not isinstance(source.get("label"), str):
            raise InputError("사이즈 이름을 입력해 주세요.")
        label = source["label"].strip()
        if not label or len(label) > 14 or label.casefold() in seen:
            raise InputError("사이즈 이름은 14자 이내로 서로 다르게 입력해 주세요.")
        seen.add(label.casefold())
        row = {"label": label}
        for key, (lo, hi) in FIELDS.items():
            raw = source.get(key)
            if (key == "hem" or partial) and raw in (None, "", "-", "—"):
                row[key] = None
                continue
            try:
                value = float(raw)
            except (TypeError, ValueError):
                value = 0
            if isinstance(raw, bool) or not lo <= value <= hi or round(value, 1) != value:
                raise InputError(f"{label} {ALIASES[key][0]}을 {lo}–{hi} cm 범위에서 입력해 주세요.")
            row[key] = value
        rows.append(row)
    return rows


def get_bytes(client, url, hosts, limit, mime_types):
    safe_url(url, hosts)
    with client.stream("GET", url, follow_redirects=False) as response:
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
        if content_type not in mime_types or int(response.headers.get("content-length") or 0) > limit:
            raise InputError("지원하는 상품 자료 형식이 아닙니다.")
        result = bytearray()
        for chunk in response.iter_bytes(65536):
            result.extend(chunk)
            if len(result) > limit:
                raise InputError("상품 자료의 최대 크기를 넘었습니다.")
        return bytes(result)


def robots_allowed(client, url, hosts):
    parts = safe_url(url, hosts)
    robots_url = f"https://{parts.netloc}/robots.txt"
    try:
        raw = get_bytes(client, robots_url, hosts, 256 * 1024, {"text/plain"})
    except httpx.HTTPStatusError as exc:
        return exc.response.status_code == 404
    parser = RobotFileParser()
    parser.parse(raw.decode("utf-8", "replace").splitlines())
    return parser.can_fetch(USER_AGENT, url)


def products(value):
    if isinstance(value, list):
        for item in value:
            yield from products(item)
    elif isinstance(value, dict):
        types = value.get("@type")
        if types == "Product" or (isinstance(types, list) and "Product" in types):
            yield value
        yield from products(value.get("@graph"))


def public_table(tree):
    for table in tree.xpath("//table"):
        records = [[re.sub(r"\s+", "", cell.text_content()) for cell in row.xpath("./th|./td")]
                   for row in table.xpath(".//tr")]
        for i, header in enumerate(records):
            units = " ".join(header + [cell for row in records[:i] for cell in row] +
                             table.xpath("./caption//text()"))
            if not re.search(r"(?:cm|센티미터)", units, re.I) or re.search(r"(?:inch|인치)", units, re.I):
                continue
            cols = {key: next((j for j, cell in enumerate(header)
                               if any(alias in cell for alias in aliases)), None)
                    for key, aliases in ALIASES.items()}
            label = next((j for j, col in enumerate(header) if col.lower() in ("사이즈", "size", "cm")), None)
            if label is None or any(cols[key] is None for key in ("length", "shoulder", "chest", "sleeve")):
                continue
            if len(set(cols.values()) - {None}) != sum(col is not None for col in cols.values()):
                continue
            rows = []
            for row in records[i+1:]:
                if len(row) != len(header) or not re.fullmatch(r"[A-Za-z0-9+./()-]{1,14}", row[label]):
                    continue
                values = {key: (row[col] if col is not None else None) for key, col in cols.items()}
                try:
                    rows.extend(sizes([{"label": row[label], **values}], partial=True))
                except InputError:
                    continue
            if rows:
                try:
                    return sizes(rows, partial=True)
                except InputError:
                    continue
    return []


def clean(value, limit):
    return value.strip()[:limit] if isinstance(value, str) else ""


def product_metadata(source, identifier):
    brand = source.get("brand")
    name = clean(source.get("name"), 90)
    return {
        "name": name, "brand": clean(brand.get("name") if isinstance(brand, dict) else brand, 45),
        "code": clean(source.get("sku"), 45), "colourName": clean(source.get("color"), 45),
        "type": "ziphoodie" if re.search(r"후드.{0,12}집\s*업|zip[\s-]*up.{0,25}hoodie|hoodie.{0,20}zip", name, re.I) else "",
        "url": canonical(identifier),
    }


def public_metadata(client, identifier):
    url = canonical(identifier)
    if not robots_allowed(client, url, SHOP_HOSTS):
        raise InputError("상품 사이트의 자동 접근 설정을 확인할 수 없습니다. 자료를 직접 추가해 주세요.")
    raw = get_bytes(client, url, SHOP_HOSTS, 4 * 1024 * 1024, {"text/html", "application/xhtml+xml"})
    tree = html.fromstring(raw)
    for script in tree.xpath('//script[@type="application/ld+json"]/text()'):
        try:
            records = list(products(json.loads(script)))
        except (ValueError, RecursionError):
            continue
        if len(records) != 1:
            continue
        source = records[0]
        if not isinstance(source.get("url"), str):
            continue
        try:
            if product_id(urljoin(url, source["url"])) != identifier:
                continue
        except InputError:
            continue
        product = product_metadata(source, identifier)
        if not product["name"]:
            continue
        images = source.get("image", [])
        images = images if isinstance(images, list) else [images]
        return product, public_table(tree), [
            item.get("url") if isinstance(item, dict) else item for item in images[:6]
        ]
    raise InputError("상품 페이지에서 상품과 색상 정보를 확인할 수 없었습니다. 자료를 직접 추가해 주세요.")


def catalog_example(identifier):
    script = (
        "import {adidas} from './catalog-data.mjs';"
        "process.stdout.write(JSON.stringify(adidas));"
    )
    from subprocess import check_output
    stored = json.loads(check_output(["node", "--input-type=module", "-e", script], cwd=ROOT, timeout=10))
    product = {key: stored[key] for key in ("name", "brand", "code", "colourName", "type")}
    product["url"] = canonical(identifier)
    return product, stored["sizes"], ["front"], {"front": (ROOT / stored["photo"]).read_bytes()}


def lookup(identifier):
    feed = os.getenv("SELFIT_MUSINSA_FEED")
    if feed and (path := Path(feed) / f"{identifier}.json").is_file():
        source = json.loads(path.read_text(encoding="utf-8"))
        product = product_metadata(source, identifier)
        if source.get("type") == "ziphoodie":
            product["type"] = "ziphoodie"
        verified_sizes = sizes(source["sizes"], partial=True) if source.get("sizes") else []
        asset_dir = path.parent.resolve()
        photos = {}
        for view in ("front", "back"):
            name = source.get(view)
            if name and Path(name).name == name:
                photo = (asset_dir / name).resolve()
                if photo.parent == asset_dir and photo.stat().st_size <= MAX_IMAGE:
                    photos[view] = photo.read_bytes()
        return product, verified_sizes, list(photos), photos, "제휴 상품 데이터", None

    if identifier == "5329359":
        product, rows, views, photos = catalog_example(identifier)
        return product, rows, views, photos, "Selfit KC9315 샘플", None

    empty = {"name": "", "brand": "", "code": "", "colourName": "", "type": "", "url": canonical(identifier)}
    if os.getenv("SELFIT_MUSINSA_PUBLIC") != "1":
        return empty, [], [], {}, "직접 입력", "가져올 수 있는 상품 자료가 없습니다. 상품명과 정면 사진, 실측을 추가해 주세요."
    try:
        with httpx.Client(timeout=8, headers={"User-Agent": USER_AGENT}, trust_env=False) as client:
            product, rows, images = public_metadata(client, identifier)
            photos = {}
            for index, image in enumerate(dict.fromkeys(i for i in images if isinstance(i, str))):
                try:
                    image = urljoin(product["url"], image)
                    if robots_allowed(client, image, IMAGE_HOSTS):
                        photos[f"photo{index}"] = get_bytes(
                            client, image, IMAGE_HOSTS, MAX_IMAGE, {"image/jpeg", "image/png", "image/webp"})
                except (InputError, httpx.HTTPError, ValueError):
                    continue
                if len(photos) == 4:
                    break
    except (InputError, httpx.HTTPError, ValueError):
        return empty, [], [], {}, "직접 입력", "상품 자료를 자동으로 가져올 수 없습니다. 상품 정보를 직접 추가해 주세요."
    return product, rows, list(photos), photos, "무신사 공개 상품 정보", None
