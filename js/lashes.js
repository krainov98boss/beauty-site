// Иллюстрация закрытого глаза и сборки ресниц. Всё рисуется кодом;
// цвета берутся из css/tokens.css. Сцену можно заменить видео (см. README).

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const band = (p, a, b) => clamp((p - a) / (b - a));

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function cubic(c, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
  return { x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x, y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y };
}
function cubicD(c, t) {
  const u = 1 - t;
  return {
    x: 3 * u * u * (c[1].x - c[0].x) + 6 * u * t * (c[2].x - c[1].x) + 3 * t * t * (c[3].x - c[2].x),
    y: 3 * u * u * (c[1].y - c[0].y) + 6 * u * t * (c[2].y - c[1].y) + 3 * t * t * (c[3].y - c[2].y),
  };
}
const norm = (v) => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

function parseColor(str) {
  const s = str.trim();
  if (s.startsWith("#")) {
    const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = s.match(/\d+(\.\d+)?/g) || [0, 0, 0];
  return m.slice(0, 3).map(Number);
}
const mix = (a, b, t, alpha = 1) =>
  `rgba(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))},${alpha})`;
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const get = (n) => parseColor(cs.getPropertyValue(n) || "#000");
  return {
    skin: get("--skin"),
    skinShade: get("--skin-shade"),
    skinLine: get("--skin-line"),
    brow: get("--brow"),
    patch: get("--patch"),
    patchLine: get("--patch-line"),
    lashLight: get("--lash-light"),
    lashDark: get("--lash-dark"),
    rose: get("--rose"),
    roseSoft: get("--rose-soft"),
    gold: get("--gold"),
    goldLight: get("--gold-light"),
    paper: get("--paper"),
  };
}

/* ---------- Геометрия в условном пространстве 1000 × 600 ---------- */

const LASH_LINE = [
  { x: 168, y: 268 },
  { x: 330, y: 392 },
  { x: 672, y: 384 },
  { x: 842, y: 236 },
];
const CREASE = [
  { x: 186, y: 252 },
  { x: 318, y: 128 },
  { x: 690, y: 112 },
  { x: 832, y: 218 },
];
const BROW = [
  { x: 170, y: 118 },
  { x: 360, y: 44 },
  { x: 640, y: 34 },
  { x: 860, y: 112 },
];
const PATCH_BOTTOM = [
  { x: 214, y: 300 },
  { x: 330, y: 560 },
  { x: 700, y: 552 },
  { x: 822, y: 268 },
];
const MM = 11.5; // условных единиц в миллиметре
// Рамка, которую вписываем в холст (лишнее по краям — только растушёванная кожа).
const VIEW = { x: 110, y: 8, w: 780, h: 580 };

function lashFrame(t) {
  const p = cubic(LASH_LINE, t);
  const tan = norm(cubicD(LASH_LINE, t));
  let n = { x: -tan.y, y: tan.x };
  if (n.y < 0) n = { x: -n.x, y: -n.y };
  const dir = norm({ x: n.x + tan.x * (t - 0.5) * 1.25, y: n.y + tan.y * (t - 0.5) * 1.25 });
  return { p, tan, dir, side: t < 0.5 ? -1 : 1 };
}

// Ресница — сужающийся изогнутый штрих: заливка многоугольником.
function lashPath(ctx, base, dir, len, width, curl, side) {
  const tip = { x: base.x + dir.x * len, y: base.y + dir.y * len };
  const perp = { x: -dir.y * side, y: dir.x * side };
  const c = { x: base.x + dir.x * len * 0.52 + perp.x * len * curl, y: base.y + dir.y * len * 0.52 + perp.y * len * curl };
  const steps = 12;
  const left = [];
  const right = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const u = 1 - s;
    const x = u * u * base.x + 2 * u * s * c.x + s * s * tip.x;
    const y = u * u * base.y + 2 * u * s * c.y + s * s * tip.y;
    const dx = 2 * u * (c.x - base.x) + 2 * s * (tip.x - c.x);
    const dy = 2 * u * (c.y - base.y) + 2 * s * (tip.y - c.y);
    const l = Math.hypot(dx, dy) || 1;
    const w = (width / 2) * Math.pow(1 - s, 0.85) + 0.06;
    left.push([x - (dy / l) * w, y + (dx / l) * w]);
    right.push([x + (dy / l) * w, y - (dx / l) * w]);
  }
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  return tip;
}

function heartPath(ctx, x, y, s) {
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.9, y - s * 0.25, x - s * 0.45, y - s * 0.95, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 0.95, x + s * 0.9, y - s * 0.25, x, y + s * 0.35);
}

function curvePath(ctx, c, move = true) {
  if (move) ctx.moveTo(c[0].x, c[0].y);
  ctx.bezierCurveTo(c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y);
}
const reverse = (c) => [c[3], c[2], c[1], c[0]];

/* ---------- Данные ресниц (стабильные между кадрами) ---------- */

function buildLashes() {
  const r = rng(7);
  const natural = [];
  const N = 54;
  for (let i = 0; i < N; i++) {
    const t = 0.035 + (0.94 * i) / (N - 1) + (r() - 0.5) * 0.012;
    if (r() < 0.12) continue; // естественные пробелы
    const mm = (3.6 + 2.8 * Math.pow(Math.sin(Math.PI * clamp(t * 0.95 + 0.03)), 0.7)) * (0.78 + r() * 0.34);
    natural.push({ t, mm, curl: 0.06 + r() * 0.1, tilt: (r() - 0.5) * 0.16, w: 1.5 + r() * 0.6 });
  }
  const ext = [];
  const M = 38;
  for (let i = 0; i < M; i++) {
    const t = 0.055 + (0.9 * i) / (M - 1) + (r() - 0.5) * 0.008;
    const start = 6.6 + 1.2 * t;
    const end = 8 + 4.3 * smooth(clamp((t - 0.08) / 0.84)) - (t > 0.94 ? 0.8 : 0);
    ext.push({ t, start, end, key: t + r() * 0.22, tilt: (r() - 0.5) * 0.07, curl: 0.1 + r() * 0.05, seed: r() });
  }
  ext.slice().sort((a, b) => a.key - b.key).forEach((e, i) => (e.order = i));
  return { natural, ext };
}

export const STAGES = [
  { id: "natural", from: 0, to: 0.1 },
  { id: "isolation", from: 0.1, to: 0.42 },
  { id: "length", from: 0.42, to: 0.62 },
  { id: "volume", from: 0.62, to: 0.78 },
  { id: "color", from: 0.78, to: 1.01 },
];

export function stageState(p) {
  return {
    apply: band(p, 0.1, 0.4),
    length: easeInOut(band(p, 0.42, 0.62)),
    volume: easeInOut(band(p, 0.62, 0.78)),
    color: easeInOut(band(p, 0.78, 0.95)),
  };
}

export class EyeRenderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.opts = { tweezers: true, ...opts };
    this.data = buildLashes();
    this.pal = readPalette();
    this.p = opts.progress ?? 0;
    this.leaders = [];
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = Math.max(1, rect.width);
    this.ch = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.cw * dpr);
    this.canvas.height = Math.round(this.ch * dpr);
    this.dpr = dpr;
    const s = Math.min(this.cw / VIEW.w, this.ch / VIEW.h);
    this.scale = s;
    this.ox = (this.cw - VIEW.w * s) / 2 - VIEW.x * s;
    this.oy = (this.ch - VIEW.h * s) / 2 - VIEW.y * s;
    this.render(this.p, this.leaders);
  }

  // Точка из условного пространства в CSS-пиксели холста.
  toCss(pt) {
    return { x: this.ox + pt.x * this.scale, y: this.oy + pt.y * this.scale };
  }

  anchor(name, p = this.p) {
    const st = stageState(p);
    const extLen = (e) => MM * lerp(e.start, e.end, st.length);
    const at = (t, along) => {
      const f = lashFrame(t);
      const e = this.data.ext.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
      const len = along === 0 ? 0 : (st.apply > 0 ? extLen(e) : MM * 5.5) * along;
      return this.toCss({ x: f.p.x + f.dir.x * len, y: f.p.y + f.dir.y * len });
    };
    switch (name) {
      case "natural": return at(0.27, 0.55);
      case "isolation": return at(0.36, 0.08);
      case "length": return at(0.84, 0.98);
      case "volume": return at(0.62, 0.6);
      case "color": return at(0.46, 0.85);
      default: return at(0.5, 0.5);
    }
  }

  render(p, leaders = []) {
    this.p = p;
    this.leaders = leaders;
    const { ctx, pal, dpr } = this;
    const st = stageState(p);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    if (this.opts.leadersOnly) {
      this.drawLeaders(leaders);
      return;
    }
    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);

    this.drawSkin();
    this.drawBrow();
    this.drawLid();
    this.drawPatch();

    // Свои ресницы: светлые, короткие; под нарощенными постепенно темнеют.
    const natColor = mix(pal.lashLight, pal.lashDark, st.color * 0.55, 0.92);
    ctx.fillStyle = natColor;
    ctx.beginPath();
    for (const l of this.data.natural) {
      const f = lashFrame(l.t);
      const dir = rot(f.dir, l.tilt);
      lashPath(ctx, f.p, dir, l.mm * MM, l.w, l.curl, f.side);
    }
    ctx.fill();

    this.drawExtensions(st);
    if (this.opts.tweezers) this.drawTweezers(st);
    this.drawLashLine();
    ctx.restore();

    this.drawLeaders(leaders);
  }

  drawSkin() {
    const { ctx, pal } = this;
    ctx.save();
    ctx.translate(500, 300);
    ctx.scale(1, 0.6);
    const g = ctx.createRadialGradient(0, 0, 40, 0, 0, 500);
    g.addColorStop(0, rgba(pal.skin, 1));
    g.addColorStop(0.5, rgba(pal.skin, 0.9));
    g.addColorStop(0.86, rgba(pal.skin, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 500, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawBrow() {
    const { ctx, pal } = this;
    const r = rng(19);
    ctx.lineCap = "round";
    for (let i = 0; i < 210; i++) {
      const t = r();
      const p = cubic(BROW, t);
      const tan = norm(cubicD(BROW, t));
      const thick = lerp(26, 6, Math.pow(t, 1.4));
      const off = (r() - 0.5) * thick;
      const up = t < 0.25 ? -0.9 : -0.25;
      const d = norm({ x: tan.x + 0.05, y: tan.y + up * (1 - t) });
      const len = lerp(26, 14, t) * (0.7 + r() * 0.5);
      const x = p.x - tan.y * off;
      const y = p.y + tan.x * off;
      ctx.strokeStyle = rgba(pal.brow, 0.28 + r() * 0.3);
      ctx.lineWidth = 1.6 + r() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + d.x * len * 0.5 + 2, y + d.y * len * 0.5 - 2, x + d.x * len, y + d.y * len);
      ctx.stroke();
    }
  }

  drawLid() {
    const { ctx, pal } = this;
    ctx.beginPath();
    curvePath(ctx, CREASE);
    ctx.lineTo(LASH_LINE[3].x, LASH_LINE[3].y);
    curvePath(ctx, reverse(LASH_LINE), false);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 120, 0, 390);
    g.addColorStop(0, rgba(pal.skinShade, 0.95));
    g.addColorStop(0.45, rgba(pal.skin, 1));
    g.addColorStop(1, rgba(pal.skinShade, 0.7));
    ctx.fillStyle = g;
    ctx.fill();
    // блик на веке
    const h = ctx.createRadialGradient(520, 250, 10, 520, 250, 210);
    h.addColorStop(0, rgba(pal.paper, 0.55));
    h.addColorStop(1, rgba(pal.paper, 0));
    ctx.fillStyle = h;
    ctx.fill();
    // складка
    ctx.beginPath();
    curvePath(ctx, CREASE);
    ctx.strokeStyle = rgba(pal.skinLine, 0.55);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  drawPatch() {
    const { ctx, pal } = this;
    ctx.save();
    ctx.beginPath();
    // верх патча идёт чуть ниже линии ресниц, низ — мягкая дуга
    const top = [];
    for (let i = 0; i <= 24; i++) {
      const t = lerp(0.07, 0.93, i / 24);
      const f = lashFrame(t);
      const n = { x: -f.tan.y, y: f.tan.x };
      const k = n.y < 0 ? -1 : 1;
      top.push({ x: f.p.x + n.x * k * 12, y: f.p.y + n.y * k * 12 });
    }
    ctx.moveTo(top[0].x, top[0].y);
    for (const pt of top.slice(1)) ctx.lineTo(pt.x, pt.y);
    const b = top[0];
    ctx.bezierCurveTo(PATCH_BOTTOM[2].x, PATCH_BOTTOM[2].y, PATCH_BOTTOM[1].x, PATCH_BOTTOM[1].y, b.x, b.y);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 300, 0, 560);
    g.addColorStop(0, rgba(pal.paper, 1));
    g.addColorStop(1, rgba(pal.patch, 1));
    ctx.fillStyle = g;
    ctx.shadowColor = rgba(pal.skinLine, 0.25);
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = rgba(pal.patchLine, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.clip();
    // сердечки на патче
    ctx.fillStyle = rgba(pal.roseSoft, 0.55);
    const hearts = [
      [300, 470, 13], [420, 505, 10], [560, 500, 14], [680, 462, 11], [360, 430, 8], [620, 420, 8], [480, 455, 7],
    ];
    ctx.beginPath();
    for (const [x, y, s] of hearts) heartPath(ctx, x, y, s);
    ctx.fill();
    ctx.restore();
  }

  drawExtensions(st) {
    const { ctx, pal } = this;
    const M = this.data.ext.length;
    const spread = st.volume * 0.17;
    const color = mix(pal.lashLight, pal.lashDark, 0.25 + st.color * 0.75);
    const width = lerp(2.3, 3.1, st.color);
    for (const e of this.data.ext) {
      const a = clamp((st.apply * (M + 3) - e.order) / 3);
      if (a <= 0) continue;
      const f = lashFrame(e.t);
      const dir = rot(f.dir, e.tilt);
      const len = MM * lerp(e.start, e.end, st.length);
      // Пока ресничку несут пинцетом, она «въезжает» к основанию.
      const slide = (1 - smooth(a)) * 42;
      const base = { x: f.p.x + dir.x * (2 + slide) + f.tan.x * slide * 0.4, y: f.p.y + dir.y * (2 + slide) + f.tan.y * slide * 0.4 };
      const fibers = [
        { ang: 0, alpha: 1, k: 1 },
        { ang: -spread, alpha: clamp(st.volume * 2), k: 0.95 },
        { ang: spread * 0.9, alpha: clamp(st.volume * 2 - 0.6), k: 0.9 },
      ];
      for (const fb of fibers) {
        if (fb.alpha <= 0) continue;
        ctx.fillStyle = color.replace(/[\d.]+\)$/, `${(fb.alpha * lerp(0.4, 1, a)).toFixed(3)})`);
        ctx.beginPath();
        lashPath(ctx, base, rot(dir, fb.ang * f.side), len * fb.k, width * (fb.ang === 0 ? 1 : 0.85), e.curl, f.side);
        ctx.fill();
      }
    }
    // блеск глубокого чёрного
    if (st.color > 0.4) {
      ctx.strokeStyle = rgba(pal.paper, (st.color - 0.4) * 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const e of this.data.ext) {
        const f = lashFrame(e.t);
        const dir = rot(f.dir, e.tilt);
        const len = MM * lerp(e.start, e.end, st.length);
        ctx.moveTo(f.p.x + dir.x * len * 0.18, f.p.y + dir.y * len * 0.18);
        ctx.lineTo(f.p.x + dir.x * len * 0.42, f.p.y + dir.y * len * 0.42);
      }
      ctx.stroke();
    }
  }

  drawTweezers(st) {
    if (st.apply <= 0.005 || st.apply >= 0.995) return;
    const { ctx, pal } = this;
    const M = this.data.ext.length;
    const pos = st.apply * (M + 3) - 1.5;
    const sorted = this.data.ext.slice().sort((a, b) => a.order - b.order);
    const i0 = clamp(Math.floor(pos), 0, M - 1);
    const i1 = clamp(i0 + 1, 0, M - 1);
    const fr = smooth(clamp(pos - Math.floor(pos)));
    const target = (e) => {
      const f = lashFrame(e.t);
      const len = MM * e.start;
      return { x: f.p.x + f.dir.x * len * 0.55, y: f.p.y + f.dir.y * len * 0.55 };
    };
    const a = target(sorted[i0]);
    const b = target(sorted[i1]);
    const tip = { x: lerp(a.x, b.x, fr), y: lerp(a.y, b.y, fr) };
    const fade = Math.min(1, st.apply * 12, (1 - st.apply) * 12);
    const dir = norm({ x: 0.62, y: 0.78 });
    const L = 420;
    const end = { x: tip.x + dir.x * L, y: tip.y + dir.y * L };
    const perp = { x: -dir.y, y: dir.x };
    const g = ctx.createLinearGradient(tip.x, tip.y, end.x, end.y);
    g.addColorStop(0, rgba(pal.gold, fade));
    g.addColorStop(0.35, rgba(pal.goldLight, fade));
    g.addColorStop(0.6, rgba(pal.gold, fade * 0.8));
    g.addColorStop(0.85, rgba(pal.gold, 0));
    ctx.fillStyle = g;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      const t0 = { x: tip.x + perp.x * sgn * 1.2, y: tip.y + perp.y * sgn * 1.2 };
      const mid = { x: tip.x + dir.x * 120 + perp.x * sgn * 7, y: tip.y + dir.y * 120 + perp.y * sgn * 7 };
      const e = { x: end.x + perp.x * sgn * 9, y: end.y + perp.y * sgn * 9 };
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(mid.x + perp.x * sgn * 3.5, mid.y + perp.y * sgn * 3.5);
      ctx.lineTo(e.x + perp.x * sgn * 6, e.y + perp.y * sgn * 6);
      ctx.lineTo(e.x - perp.x * sgn * 1, e.y - perp.y * sgn * 1);
      ctx.lineTo(mid.x - perp.x * sgn * 1.5, mid.y - perp.y * sgn * 1.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawLashLine() {
    const { ctx, pal } = this;
    ctx.beginPath();
    curvePath(ctx, LASH_LINE);
    ctx.strokeStyle = rgba(pal.skinLine, 0.9);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  drawLeaders(leaders) {
    const { ctx, pal, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const l of leaders) {
      if (l.alpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = l.alpha;
      ctx.strokeStyle = rgba(pal.rose, 0.85);
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(l.from.x, l.from.y);
      const mx = (l.from.x + l.to.x) / 2;
      ctx.quadraticCurveTo(mx, l.from.y, l.to.x, l.to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(pal.paper, 1);
      ctx.beginPath();
      ctx.arc(l.from.x, l.from.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = rgba(pal.rose, 1);
      ctx.beginPath();
      ctx.arc(l.from.x, l.from.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

/* ---------- Схемы эффектов (SVG) ---------- */

const MAPS = {
  classic: { lens: (t) => 8 + 2.5 * smooth(t), fibers: 1, spread: 0 },
  "2d": { lens: (t) => 8 + 3 * smooth(t), fibers: 2, spread: 0.12 },
  "3d": { lens: (t) => 8.5 + 3 * smooth(t), fibers: 3, spread: 0.16 },
  wet: { lens: (t) => 8 + 3 * smooth(t), fibers: 1, spread: 0, wet: true },
  fox: { lens: (t) => 7 + 6 * Math.pow(t, 1.8), fibers: 2, spread: 0.1 },
  doll: { lens: (t) => 8 + 4 * Math.sin(Math.PI * t), fibers: 2, spread: 0.1 },
};

function polyString(base, dir, len, width, curl, side) {
  const pts = [];
  const ctx = {
    moveTo: (x, y) => pts.push([x, y]),
    lineTo: (x, y) => pts.push([x, y]),
    closePath: () => {},
  };
  lashPath(ctx, base, dir, len, width, curl, side);
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export function lashMapSVG(type) {
  const m = MAPS[type] || MAPS.classic;
  const line = [
    { x: 24, y: 36 },
    { x: 80, y: 82 },
    { x: 200, y: 80 },
    { x: 256, y: 30 },
  ];
  const r = rng(type.length * 31 + 5);
  const N = 26;
  const unit = 6.4;
  const polys = [];
  for (let i = 0; i < N; i++) {
    const t = 0.04 + (0.92 * i) / (N - 1);
    const p = cubic(line, t);
    const tan = norm(cubicD(line, t));
    let n = { x: -tan.y, y: tan.x };
    if (n.y < 0) n = { x: -n.x, y: -n.y };
    const side = t < 0.5 ? -1 : 1;
    let dir = norm({ x: n.x + tan.x * (t - 0.5) * 1.3, y: n.y + tan.y * (t - 0.5) * 1.3 });
    let len = m.lens(t) * unit;
    if (m.wet) {
      // лучики: соседние реснички сходятся в острые пучки
      const group = Math.floor(i / 3);
      const ct = 0.04 + (0.92 * (group * 3 + 1)) / (N - 1);
      const cf = norm({ x: n.x + tan.x * (ct - 0.5) * 1.3, y: n.y + tan.y * (ct - 0.5) * 1.3 });
      dir = norm({ x: dir.x * 0.4 + cf.x * 0.6, y: dir.y * 0.4 + cf.y * 0.6 });
      len *= i % 3 === 1 ? 1.08 : 0.9;
    }
    for (let f = 0; f < m.fibers; f++) {
      const ang = (f === 0 ? 0 : f === 1 ? -m.spread : m.spread) * side;
      polys.push(polyString(p, rot(dir, ang + (r() - 0.5) * 0.05), len * (f ? 0.94 : 1), 2.4, 0.12, side));
    }
  }
  return `<svg viewBox="0 0 280 170" aria-hidden="true" focusable="false">
    <path d="M24 36 C80 82 200 80 256 30" fill="none" stroke="var(--skin-line)" stroke-width="2.5" stroke-linecap="round"/>
    <g fill="var(--lash-dark)">${polys.map((p) => `<polygon points="${p}"/>`).join("")}</g>
  </svg>`;
}
