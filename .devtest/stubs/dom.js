// Minimal DOM stubs so the dressing-room modules can run headless inside QuickJS.
// Only what scene.mjs and its dependencies touch at runtime is implemented.
const images = globalThis.__IMAGES || {};

function decodeBase64(s) {
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = String(s).replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let bits = 0, acc = 0, p = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = C.indexOf(clean[i]);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[p++] = (acc >> bits) & 255;
    }
  }
  return out.subarray(0, p);
}
globalThis.__decodeBase64 = decodeBase64;

class Gradient {
  constructor(type, args) { this.type = type; this.args = args || []; this.stops = []; }
  addColorStop(offset, color) { this.stops.push({ offset, color }); }
  _at(t) {
    const stops = this.stops;
    if (!stops.length) return [0, 0, 0, 0];
    if (t <= stops[0].offset) return this._parse(stops[0].color);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i].offset) {
        const a = stops[i - 1], b = stops[i];
        const u = (t - a.offset) / Math.max(1e-6, b.offset - a.offset);
        const ca = this._parse(a.color), cb = this._parse(b.color);
        return [0, 1, 2, 3].map(k => ca[k] + (cb[k] - ca[k]) * u);
      }
    }
    return this._parse(stops[stops.length - 1].color);
  }
  _parse(color) {
    const s = String(color);
    const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
    if (hex) {
      return [parseInt(hex[1].slice(0, 2), 16), parseInt(hex[1].slice(2, 4), 16), parseInt(hex[1].slice(4, 6), 16),
        hex[2] ? parseInt(hex[2], 16) / 255 : 1];
    }
    const rgbm = /rgba?\(([^)]+)\)/.exec(s);
    if (rgbm) {
      const parts = rgbm[1].split(',').map(Number);
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
    }
    return [0, 0, 0, 1];
  }
}

class Ctx2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000';
    this._pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255);
    this._tx = 0; this._ty = 0; this._sx = 1; this._sy = 1; this._stack = [];
  }
  _resize() {
    const n = this.canvas.width * this.canvas.height * 4;
    if (this._pixels.length !== n) this._pixels = new Uint8ClampedArray(n).fill(255);
  }
  _sourcePixels(source) {
    if (source && source._ctx) return { pixels: source._ctx._pixels, width: source.width, height: source.height };
    if (source && source._pixels) return { pixels: source._pixels, width: source._width, height: source._height };
    return null;
  }
  createImageData(w, h) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) };
  }
  getImageData(x, y, w, h) {
    this._resize();
    const out = new Uint8ClampedArray(w * h * 4);
    const W = this.canvas.width, H = this.canvas.height;
    for (let row = 0; row < h; row++) {
      const sy = y + row;
      if (sy < 0 || sy >= H) continue;
      for (let col = 0; col < w; col++) {
        const sx = x + col;
        if (sx < 0 || sx >= W) continue;
        const s = (sy * W + sx) * 4, d = (row * w + col) * 4;
        out[d] = this._pixels[s]; out[d + 1] = this._pixels[s + 1];
        out[d + 2] = this._pixels[s + 2]; out[d + 3] = this._pixels[s + 3];
      }
    }
    return { width: w, height: h, data: out };
  }
  putImageData(img, dx, dy) {
    this._resize();
    const W = this.canvas.width, H = this.canvas.height;
    for (let row = 0; row < img.height; row++) {
      for (let col = 0; col < img.width; col++) {
        const x = dx + col, y = dy + row;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const s = (row * img.width + col) * 4, d = (y * W + x) * 4;
        this._pixels[d] = img.data[s]; this._pixels[d + 1] = img.data[s + 1];
        this._pixels[d + 2] = img.data[s + 2]; this._pixels[d + 3] = img.data[s + 3];
      }
    }
  }
  drawImage(source, a1, a2, a3, a4) {
    this._resize();
    // Supports the drawImage(source, dx, dy, dw, dh) form the codebase uses.
    const src = this._sourcePixels(source);
    if (!src) return;
    const dx = a1 || 0, dy = a2 || 0, dw = a3 || src.width, dh = a4 || src.height;
    const W = this.canvas.width, H = this.canvas.height;
    for (let row = 0; row < dh; row++) {
      const sy = Math.min(src.height - 1, Math.floor((row + .5) * src.height / dh));
      for (let col = 0; col < dw; col++) {
        const sx = Math.min(src.width - 1, Math.floor((col + .5) * src.width / dw));
        const x = dx + col, y = dy + row;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const s = (sy * src.width + sx) * 4, d = (y * W + x) * 4;
        this._pixels[d] = src.pixels[s]; this._pixels[d + 1] = src.pixels[s + 1];
        this._pixels[d + 2] = src.pixels[s + 2]; this._pixels[d + 3] = src.pixels[s + 3];
      }
    }
  }
  _fillColor() {
    return this.fillStyle;
  }
  fillRect(x, y, w, h) {
    this._resize();
    const fill = this.fillStyle;
    const W = this.canvas.width, H = this.canvas.height;
    if (fill && fill.stops) {
      // Transform-aware gradient fill (radial and linear) with alpha blending.
      for (let row = Math.max(0, y | 0); row < Math.min(H, Math.ceil(y + h)); row++) {
        for (let col = Math.max(0, x | 0); col < Math.min(W, Math.ceil(x + w)); col++) {
          const px = (col - this._tx) / this._sx, py = (row - this._ty) / this._sy;
          let t = 0;
          if (fill.type === 'radial') {
            const [x0, y0, r0, x1, y1, r1] = fill.args;
            const d = Math.hypot(px - x1, py - y1);
            t = r1 > 0 ? (d - r0) / (r1 - r0) : 1;
          } else if (fill.type === 'linear') {
            const [x0, y0, x1, y1] = fill.args;
            const dx = x1 - x0, dy = y1 - y0;
            const len = Math.hypot(dx, dy) || 1;
            t = ((px - x0) * dx + (py - y0) * dy) / (len * len);
          }
          const [r, g, b, a] = fill._at(Math.max(0, Math.min(1, t)));
          if (a <= 0) continue;
          const d = (row * W + col) * 4;
          const na = this._pixels[d + 3] / 255;
          this._pixels[d] = r * a + this._pixels[d] * (1 - a);
          this._pixels[d + 1] = g * a + this._pixels[d + 1] * (1 - a);
          this._pixels[d + 2] = b * a + this._pixels[d + 2] * (1 - a);
          this._pixels[d + 3] = 255;
          void na;
        }
      }
      return;
    }
    const color = String(fill);
    let r = 0, g = 0, b = 0;
    const hex = /^#([0-9a-f]{6})$/i.exec(color);
    const rgbm = /rgba?\(([^)]+)\)/.exec(color);
    if (hex) { r = parseInt(hex[1].slice(0, 2), 16); g = parseInt(hex[1].slice(2, 4), 16); b = parseInt(hex[1].slice(4, 6), 16); }
    else if (rgbm) {
      const parts = rgbm[1].split(',').map(Number);
      r = parts[0] || 0; g = parts[1] || 0; b = parts[2] || 0;
    }
    for (let row = Math.max(0, y | 0); row < Math.min(H, (y + h) | 0); row++) {
      for (let col = Math.max(0, x | 0); col < Math.min(W, (x + w) | 0); col++) {
        const d = (row * W + col) * 4;
        this._pixels[d] = r; this._pixels[d + 1] = g; this._pixels[d + 2] = b; this._pixels[d + 3] = 255;
      }
    }
  }
  createLinearGradient(x0, y0, x1, y1) { return new Gradient('linear', [x0, y0, x1, y1]); }
  createRadialGradient(x0, y0, r0, x1, y1, r1) { return new Gradient('radial', [x0, y0, r0, x1, y1, r1]); }
  setTransform() {}
  scale(sx, sy) { this._sx = sx; this._sy = sy; }
  translate(tx, ty) { this._tx = tx; this._ty = ty; }
  save() { this._stack.push([this._tx, this._ty, this._sx, this._sy, this.fillStyle]); }
  restore() { const s = this._stack.pop(); if (s) { this._tx = s[0]; this._ty = s[1]; this._sx = s[2]; this._sy = s[3]; this.fillStyle = s[4]; } }
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  arc() {}
  fill() {}
}

class CanvasStub {
  constructor() {
    this._width = 300; this._height = 150;
    this.style = {};
    this._ctx = null;
    this._listeners = {};
  }
  get width() { return this._width; }
  set width(v) { this._width = v; if (this._ctx) this._ctx._resize(); }
  get height() { return this._height; }
  set height(v) { this._height = v; if (this._ctx) this._ctx._resize(); }
  getContext(kind) {
    if (kind === '2d') {
      if (!this._ctx) this._ctx = new Ctx2D(this);
      return this._ctx;
    }
    return null; // no webgl: WebGLRenderer throws, scene falls back to software renderer
  }
  setAttribute(k, v) { this['attr_' + k] = v; }
  addEventListener(k, fn) { (this._listeners[k] = this._listeners[k] || []).push(fn); }
  removeEventListener() {}
  setPointerCapture() {}
  releasePointerCapture() {}
}

class ImageStub {
  constructor() {
    this.decoding = 'async';
    this.complete = false;
    this.naturalWidth = 0; this.naturalHeight = 0;
    this._pixels = null;
  }
  set src(url) {
    this._url = url;
    const match = Object.keys(images).find(key => url.indexOf(key) >= 0);
    if (match) {
      const raw = decodeBase64(images[match].b64);
      this._width = images[match].width;
      this._height = images[match].height;
      this.naturalWidth = this._width; this.naturalHeight = this._height;
      this._pixels = raw;
      this.complete = true;
      Promise.resolve().then(() => this.onload && this.onload());
    } else {
      Promise.resolve().then(() => this.onerror && this.onerror(new Error('no stub image for ' + url)));
    }
  }
  get src() { return this._url; }
  decode() { return Promise.resolve(); }
}

class URLStub {
  constructor(ref, base) { this.href = String(ref); }
  toString() { return this.href; }
}
globalThis.URL = URLStub;
class ImageDataStub {
  constructor(dataOrWidth, widthOrHeight, maybeHeight) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth; this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4);
    } else {
      this.data = dataOrWidth;
      this.width = widthOrHeight; this.height = maybeHeight;
    }
  }
}
globalThis.ImageData = ImageDataStub;
// QuickJS build here predates ES2022; the browsers the app targets have .at.
if (!Array.prototype.at) Array.prototype.at = function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return n >= 0 && n < this.length ? this[n] : undefined; };

const listeners = {};
globalThis.document = {
  hidden: false,
  createElement(tag) {
    if (tag === 'canvas') return new CanvasStub();
    return { style: {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {} }, appendChild() {} };
  },
  createElementNS(ns, tag) { return this.createElement(tag); },
  addEventListener() {},
  body: { appendChild() {}, style: {} }
};
globalThis.Image = ImageStub;
globalThis.window = {
  devicePixelRatio: 1,
  addEventListener(k, fn) { (listeners[k] = listeners[k] || []).push(fn); },
  removeEventListener() {},
  dispatchEvent() { return true; }
};
globalThis.addEventListener = globalThis.window.addEventListener;
globalThis.CustomEvent = class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } };
globalThis.ResizeObserver = class { constructor(cb) { this._cb = cb; } observe() { Promise.resolve().then(() => this._cb()); } unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = cb => { globalThis.__raf = cb; return 1; };
globalThis.performance = { now: () => Date.now() };
