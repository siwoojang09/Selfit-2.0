"""Segment flat lays, project their color onto the measured pattern and pack a GLB."""

import base64
import io
import json
import os
import struct
import subprocess
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError

from .source import InputError, ROOT

VERSION = "hoodie-2"
Image.MAX_IMAGE_PIXELS = 20_000_000


def jpeg(image, quality=89):
    stream = io.BytesIO()
    image.save(stream, format="JPEG", quality=quality, optimize=True, subsampling=0)
    return stream.getvalue()


def decode_image(data):
    try:
        with Image.open(io.BytesIO(data)) as original:
            if original.format not in {"JPEG", "PNG", "WEBP"} or original.width * original.height > Image.MAX_IMAGE_PIXELS:
                raise ValueError
            image = ImageOps.exif_transpose(original).convert("RGBA")
            image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise InputError("JPG, PNG 또는 WebP 의류 사진을 사용해 주세요.") from exc
    if min(image.size) < 100:
        raise InputError("가로·세로가 각각 100px 이상인 사진이 필요합니다.")
    return image


def preview(data):
    image = decode_image(data)
    image.thumbnail((400, 400))
    paper = Image.new("RGBA", image.size, "#f4f2ee")
    return jpeg(Image.alpha_composite(paper, image).convert("RGB"), 83)


@lru_cache(maxsize=1)
def segmentation_model(path):
    import onnxruntime as ort

    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    return ort.InferenceSession(path, sess_options=options, providers=["CPUExecutionProvider"])


def segment(image):
    rgba = np.asarray(image)
    if np.any(rgba[:, :, 3] < 100):
        return rgba[:, :, 3] > 150, "alpha"
    if path := os.environ.get("SELFIT_U2NETP_MODEL"):
        session = segmentation_model(path)
        pixels = np.asarray(image.convert("RGB").resize((320, 320)), dtype=np.float32) / 255
        normalized = (pixels - [.485, .456, .406]) / [.229, .224, .225]
        probability = session.run(None, {
            session.get_inputs()[0].name: normalized.transpose(2, 0, 1)[None].astype(np.float32)
        })[0].squeeze()
        if probability.shape != (320, 320) or not np.isfinite(probability).all():
            raise RuntimeError("Unexpected U2NETP output")
        mask = Image.fromarray((np.clip(probability, 0, 1) * 255).astype(np.uint8)).resize(image.size)
        return np.asarray(mask) > 135, "u2netp"

    pixels = rgba[:, :, :3].astype(np.float32)
    border = np.concatenate((pixels[:5].reshape(-1, 3), pixels[-5:].reshape(-1, 3),
                             pixels[:, :5].reshape(-1, 3), pixels[:, -5:].reshape(-1, 3)))
    paper = np.median(border, axis=0)
    background = np.linalg.norm(border - paper, axis=1)
    threshold = max(23, min(75, 1.7 * np.quantile(background, .8)))
    mask = Image.fromarray((np.linalg.norm(pixels - paper, axis=2) > threshold).astype(np.uint8) * 255)
    return np.asarray(mask.filter(ImageFilter.MedianFilter(5))) > 127, "background"


class FlatLay:
    def __init__(self, data):
        image = decode_image(data)
        mask, self.method = segment(image)
        y, x = np.nonzero(mask)
        if len(x) < mask.size * .07 or len(x) > mask.size * .94:
            raise InputError("옷 윤곽을 찾지 못했습니다. 한 벌만 펼친 사진이나 투명 배경 사진을 올려 주세요.")
        # Ignore isolated hanger hooks, shadows and labels at the image border.
        l, t, r, b = map(int, (*np.quantile(x, [.01]), *np.quantile(y, [.01]),
                              *np.quantile(x, [.99]), *np.quantile(y, [.99])))
        self.mask = mask[t:b+1, l:r+1]
        self.rgb = np.asarray(image.convert("RGB"))[t:b+1, l:r+1]
        self.height, self.width = self.mask.shape
        middle = self.rgb[self.height//3:3*self.height//4, self.width//3:2*self.width//3]
        core = self.mask[self.height//3:3*self.height//4, self.width//3:2*self.width//3]
        if self.height < 80 or self.width < 80 or core.mean() < .4:
            raise InputError("후드 집업 몸판을 찾지 못했습니다. 정면을 향해 평평하게 펼친 사진을 올려 주세요.")
        self.tone = np.median(middle[core], axis=0).astype(np.uint8)
        self.y0 = .23
        self.y1 = .98
        self.center = self.width // 2
        self.edges = self.body_edges()
        self.sleeves = self.sleeve_edges()

    def body_edges(self):
        left, right = [], []
        for y, row in enumerate(self.mask):
            # Below the armpit, a gap between body and sleeve establishes the
            # side seam. Above it, carry the width up from the lower rows.
            cut = np.flatnonzero(~row)
            anchors = cut[(cut < self.center) & (cut > self.width*.15)]
            counterparts = cut[(cut > self.center) & (cut < self.width*.85)]
            l = anchors[-1]+1 if anchors.size else self.width*.25
            r = counterparts[0]-1 if counterparts.size else self.width*.75
            if not row[self.center] or r-l < self.width*.22:
                l, r = self.width*.25, self.width*.75
            left.append(np.clip(l/self.width, .15, .38))
            right.append(np.clip(r/self.width, .62, .85))
        # A median window prevents speckle and printed icons from moving seams.
        window = max(5, self.height//30)
        edges = np.array([left, right])
        for i, line in enumerate(edges.copy()):
            edges[i] = [np.median(line[max(0, j-window):j+window+1]) for j in range(self.height)]
        return edges

    def sleeve_edges(self):
        scanlines = []
        for mask in (self.mask, self.mask[:, ::-1]):
            left, right = [], []
            for y, row in enumerate(mask):
                foreground = np.flatnonzero(row[:self.width//2])
                if foreground.size == 0:
                    left.append(.18)
                    right.append(.34)
                    continue
                outside = foreground[0] / self.width
                after_edge = np.flatnonzero(~row[foreground[0]+self.width//14:self.width//2])
                gap = (foreground[0]+self.width//14+after_edge[0]) / self.width if after_edge.size else .5
                height = y / self.height
                estimated_width = .15 if height > .78 else .14+.035*height
                inside = gap if .09 < gap-outside < .20 else outside+estimated_width
                left.append(outside)
                right.append(min(inside, .48))
            scanlines.append(np.array([left, right]))
        return scanlines

    def read(self, x, y):
        ix = np.clip(x*(self.width-1), 0, self.width-1).astype(int)
        iy = np.clip(y*(self.height-1), 0, self.height-1).astype(int)
        return np.where(self.mask[iy, ix, None], self.rgb[iy, ix], self.tone)

    def body(self, u, v):
        y = self.y0 + (self.y1-self.y0)*v
        l, r = self.edges[:, (y*(self.height-1)).astype(int)]
        return self.read(l + (r-l)*u, y)

    def sleeve(self, u, v, right, cuff):
        y = .90+.085*v if cuff else .26+.70*v
        l, r = self.sleeves[right][:, (y*(self.height-1)).astype(int)]
        # World X increases left to right on both sleeves, while the mask
        # scans from each sleeve's exterior toward the center of the photo.
        fraction = 1-u if right else u
        x = l+(r-l)*(.018+.94*fraction)
        return self.read(1-x if right else x, y)


def surface(front, back, role):
    u, v = np.meshgrid(np.linspace(0, 1, 768), np.linspace(0, 1, 512))
    a = u*2*np.pi
    x = .5 + .5*np.sin(a)*.975
    front_view = np.cos(a) >= 0
    reverse = back or front
    if role.startswith("arm"):
        right = role.startswith("arm1")
        cuff = role.endswith("cuff")
        forward = front.sleeve(x, v, right, cuff)
        backward = back.sleeve(1-x, v, not right, cuff) if back else np.broadcast_to(front.tone, forward.shape)
    elif role == "hood":
        forward = front.read(.5+(x-.5)*.36, .035+v*.18)
        backward = (back.read(.5+(x-.5)*.35, .035+v*.22)
                    if back else np.broadcast_to(front.tone, forward.shape))
    else:
        forward = front.body(x, v)
        backward = (reverse.body(1-x, v) if back else np.broadcast_to(front.tone, forward.shape))
        if role == "hem":
            forward = front.body(x, .92 + v*.075)
            if back:
                backward = back.body(1-x, .92 + v*.075)
    # Blend side seams between visible views. Missing views use sampled dye.
    amount = np.clip(.5+np.cos(a)*4, 0, 1)[..., None]
    blend = np.where(front_view[..., None], forward, backward)
    at_seam = (amount > 0) & (amount < 1)
    blend = np.where(at_seam, forward*amount + backward*(1-amount), blend)
    return Image.fromarray(blend.astype(np.uint8))


class BinaryModel:
    def __init__(self):
        self.binary = bytearray()
        self.doc = {
            "asset": {"version": "2.0", "generator": f"Selfit {VERSION}"},
            "scene": 0, "scenes": [{"nodes": []}],
        }
        for key in ("nodes", "meshes", "materials", "accessors", "bufferViews", "images", "textures"):
            self.doc[key] = []

    def add(self, key, record):
        self.doc[key].append(record)
        return len(self.doc[key])-1

    def view(self, payload, target=None):
        self.binary.extend(b"\x00" * (-len(self.binary) % 4))
        item = {"buffer": 0, "byteOffset": len(self.binary), "byteLength": len(payload)}
        if target:
            item["target"] = target
        self.binary.extend(payload)
        return self.add("bufferViews", item)

    def accessor(self, values, fmt, dtype, target, bounds=False):
        array = np.ascontiguousarray(values)
        item = {"bufferView": self.view(array.tobytes(), target), "componentType": dtype,
                "count": len(array), "type": fmt}
        if bounds:
            item.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        return self.add("accessors", item)

    def texture(self, data, mime="image/jpeg"):
        image = self.add("images", {"bufferView": self.view(data), "mimeType": mime})
        return self.add("textures", {"source": image})

    def finish(self):
        self.binary.extend(b"\x00" * (-len(self.binary) % 4))
        self.doc["buffers"] = [{"byteLength": len(self.binary)}]
        contents = json.dumps(self.doc, separators=(",", ":")).encode()
        contents += b" " * (-len(contents) % 4)
        return (struct.pack("<III", 0x46546c67, 2, 28+len(contents)+len(self.binary))
                + struct.pack("<II", len(contents), 0x4e4f534a) + contents
                + struct.pack("<II", len(self.binary), 0x004e4942) + self.binary)


def build(front_data, back_data, measurements):
    front = FlatLay(front_data)
    back = FlatLay(back_data) if back_data else None
    color = "#" + "".join(f"{value:02x}" for value in front.tone)
    pattern = subprocess.run(
        ["node", str(Path(__file__).with_name("pattern.mjs"))],
        input=json.dumps({"measurements": measurements, "color": color}),
        cwd=ROOT, text=True, capture_output=True, check=True, timeout=20)
    model = BinaryModel()
    materials = {}
    for i, piece in enumerate(json.loads(pattern.stdout)):
        name, frame = piece["name"], piece["frame"]
        role = None
        if name == "Measured garment body":
            role = "body"
        elif name in {"Ribbed waistband", "Folded bottom hem"}:
            role = "hem"
        elif name in {"Folded hood", "Lined hood opening"}:
            role = "hood"
        elif name == "Sleeve":
            role = frame
        elif name in {"Sleeve cuff", "Turned cuff edge"}:
            role = f"{frame}-cuff"
        if role:
            key = role
            appearance = {"metallicFactor": 0, "roughnessFactor": .91}
        else:
            key = (tuple(piece["color"]), piece["metal"])
            appearance = {"baseColorFactor": [*piece["color"], 1],
                          "metallicFactor": piece["metal"], "roughnessFactor": .48 if piece["metal"] else .92}
        if key not in materials:
            if role:
                appearance["baseColorTexture"] = {"index": model.texture(jpeg(surface(front, back, role)))}
            materials[key] = model.add("materials", {"doubleSided": True, "pbrMetallicRoughness": appearance})

        pos = np.frombuffer(base64.b64decode(piece["position"]), "<f4").reshape(-1, 3)
        normals = np.frombuffer(base64.b64decode(piece["normal"]), "<f4").reshape(-1, 3).copy()
        # A few collapsed pole triangles have no normal in the pattern mesh.
        normals[np.linalg.norm(normals, axis=1) < .5] = (0, 0, 1)
        uv = np.frombuffer(base64.b64decode(piece["uv"]), "<f4").reshape(-1, 2).copy()
        uv[:, 1] = 1-uv[:, 1]
        idx = np.frombuffer(base64.b64decode(piece["index"]), "<u4").astype("<u2")
        attrs = {"POSITION": model.accessor(pos, "VEC3", 5126, 34962, True),
                 "NORMAL": model.accessor(normals, "VEC3", 5126, 34962),
                 "TEXCOORD_0": model.accessor(uv, "VEC2", 5126, 34962)}
        primitive = {"attributes": attrs, "indices": model.accessor(idx, "SCALAR", 5123, 34963),
                     "material": materials[key]}
        node_name = f"{name}-{i}"
        mesh = model.add("meshes", {"primitives": [primitive]})
        node = model.add("nodes", {"mesh": mesh, "name": node_name})
        model.doc["scenes"][0]["nodes"].append(node)
    model.doc["extras"] = {"units": "metres", "referenceSizeCm": measurements, "approximate": True}
    return model.finish(), {"color": color, "view": "front_back" if back else "front_only",
                            "segmentation": [front.method, back.method] if back else [front.method]}
