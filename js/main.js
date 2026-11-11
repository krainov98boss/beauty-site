import { EyeRenderer, STAGES, stageState } from "./lashes.js";

// Скрытые стартовые состояния анимаций включаются, только если скрипты загрузились.
document.documentElement.classList.add("js");

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isNarrow = () => window.innerWidth <= 760;

/* ---------- Навигация ---------- */

const nav = document.querySelector("[data-nav]");
const updateNav = () => nav?.classList.toggle("is-scrolled", window.scrollY > 24);

/* ---------- Hero: сборка ресниц по прокрутке ---------- */

const hero = document.querySelector("[data-hero]");
const stage = hero?.querySelector("[data-stage]");
const canvas = hero?.querySelector("[data-eye]");
const video = hero?.querySelector("video[data-scrub]");
const callouts = hero ? [...hero.querySelectorAll("[data-callout]")] : [];
const steps = hero ? [...hero.querySelectorAll("[data-step]")] : [];
const stepsList = hero?.querySelector("[data-steps]");
const mmOut = hero?.querySelector("[data-mm]");

// Когда какая подсказка видна (доля прокрутки hero).
const WINDOWS = {
  natural: [0, 0.09],
  isolation: [0.14, 0.4],
  length: [0.44, 0.61],
  volume: [0.65, 0.78],
  color: [0.82, 1.5],
};
// Где стоит карточка подсказки (условные координаты сцены 1000 × 600).
const PLACE = {
  natural: { x: 250, y: 470 },
  isolation: { x: 245, y: 530 },
  length: { x: 790, y: 500 },
  volume: { x: 770, y: 450 },
  color: { x: 265, y: 545 },
};

const eye = canvas ? new EyeRenderer(canvas, { tweezers: true }) : null;
if (eye && video) eye.opts.leadersOnly = true;

function heroProgress() {
  const r = hero.getBoundingClientRect();
  const total = r.height - window.innerHeight;
  return total > 0 ? clamp(-r.top / total) : 1;
}

function windowAlpha(id, p) {
  const [a, b] = WINDOWS[id];
  const f = 0.035;
  return Math.min(clamp((p - (a - f)) / f), clamp((b + f - p) / f));
}

let videoSeek = 0;
function updateHero() {
  if (!hero || !eye) return;
  const p = heroProgress();
  const st = stageState(p);
  hero.classList.toggle("is-moving", p > 0.02);
  stage.style.setProperty("--p", p.toFixed(4));

  if (video && video.duration) {
    const t = p * (video.duration - 0.05);
    if (Math.abs(t - videoSeek) > 0.01) {
      video.currentTime = t;
      videoSeek = t;
    }
  }

  if (mmOut) mmOut.textContent = String(Math.round(8 + 4 * st.length));

  const narrow = isNarrow();
  const sceneRect = canvas.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const leaders = [];

  for (const c of callouts) {
    const id = c.dataset.callout;
    const a = windowAlpha(id, p);
    c.style.opacity = a.toFixed(3);
    c.classList.toggle("is-on", a > 0.5);
    if (narrow || a <= 0) continue;
    const w = c.offsetWidth;
    const h = c.offsetHeight;
    const pt = eye.toCss(PLACE[id]);
    const left = c.dataset.side === "left";
    let x = left ? pt.x - w : pt.x;
    let y = pt.y - h / 2;
    // не выходить за края экрана
    const minX = stageRect.left - sceneRect.left + 16;
    const maxX = stageRect.right - sceneRect.left - w - 16;
    const maxY = sceneRect.height - h - 4;
    x = clamp(x, minX, maxX);
    y = Math.min(y, maxY);
    c.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    leaders.push({
      from: eye.anchor(id, p),
      to: { x: left ? x + w : x, y: y + h / 2 },
      alpha: a,
    });
  }

  eye.render(p, leaders);

  let active = 0;
  STAGES.forEach((s, i) => {
    if (p >= s.from) active = i;
  });
  steps.forEach((li, i) => {
    li.classList.toggle("is-active", i === active);
    li.classList.toggle("is-done", i < active);
  });
  stepsList?.style.setProperty("--p", clamp(p / 0.95).toFixed(4));
}

if (video) {
  video.pause();
  video.addEventListener("loadedmetadata", updateHero);
}

/* ---------- Прогресс секций (зачёркивание привычек) ---------- */

const progressEls = [...document.querySelectorAll("[data-progress]")];
function updateProgress() {
  const vh = window.innerHeight;
  for (const el of progressEls) {
    const r = el.getBoundingClientRect();
    const start = vh * 0.85;
    const span = vh * 0.45 + r.height * 0.5;
    el.style.setProperty("--p", clamp((start - r.top) / span).toFixed(4));
  }
}

/* ---------- Появления по прокрутке ---------- */

const reveals = [...document.querySelectorAll("[data-reveal]")];
if (reduceMotion || !("IntersectionObserver" in window)) {
  reveals.forEach((el) => el.classList.add("is-in"));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        e.target.dispatchEvent(new CustomEvent("reveal"));
        io.unobserve(e.target);
      }
    },
    { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
  );
  reveals.forEach((el) => io.observe(el));
}

/* ---------- До и после ---------- */

const compare = document.querySelector("[data-compare]");
if (compare) {
  const statics = [...compare.querySelectorAll("[data-eye-static]")].map(
    (c) => new EyeRenderer(c, { tweezers: false, progress: Number(c.dataset.eyeStatic) })
  );
  const range = compare.querySelector("input[type=range]");
  const setSplit = (v) => {
    compare.style.setProperty("--split", `${v}%`);
    range.value = String(Math.round(v));
  };
  range.addEventListener("input", () => setSplit(Number(range.value)));
  compare.addEventListener("reveal", () => {
    if (reduceMotion) return;
    const t0 = performance.now();
    const from = 88;
    const to = 50;
    const tick = (now) => {
      const k = clamp((now - t0) / 1600);
      const e = 1 - Math.pow(1 - k, 4);
      setSplit(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(tick);
    };
    setSplit(from);
    requestAnimationFrame(tick);
  });
  const ro = new ResizeObserver(() => statics.forEach((s) => s.resize()));
  statics.forEach((s) => ro.observe(s.canvas));
}

/* ---------- Форма записи ---------- */

const form = document.querySelector("[data-form]");
if (form) {
  const body = form.querySelector(".form__body");
  const done = form.querySelector(".form__done");
  const status = form.querySelector(".form__status");
  const submit = form.querySelector("[type=submit]");
  const name = form.elements.name;
  const phone = form.elements.phone;

  const setError = (input, show) => {
    const err = document.getElementById(`${input.id}-err`);
    input.setAttribute("aria-invalid", show ? "true" : "false");
    if (show) input.setAttribute("aria-describedby", err.id);
    else input.removeAttribute("aria-describedby");
    err.hidden = !show;
  };
  const validName = () => name.value.trim().length > 1;
  const validPhone = () => phone.value.replace(/\D/g, "").length >= 10;
  name.addEventListener("blur", () => name.value && setError(name, !validName()));
  phone.addEventListener("blur", () => phone.value && setError(phone, !validPhone()));
  name.addEventListener("input", () => name.getAttribute("aria-invalid") === "true" && setError(name, !validName()));
  phone.addEventListener("input", () => phone.getAttribute("aria-invalid") === "true" && setError(phone, !validPhone()));

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const okName = validName();
    const okPhone = validPhone();
    setError(name, !okName);
    setError(phone, !okPhone);
    if (!okName || !okPhone) {
      (okName ? phone : name).focus();
      return;
    }
    status.textContent = "";
    submit.disabled = true;
    submit.classList.add("is-loading");
    const data = Object.fromEntries(new FormData(form));
    try {
      const endpoint = form.dataset.endpoint;
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(String(res.status));
      } else {
        // Отправка ещё не подключена (см. README): честно говорим об этом.
        await new Promise((r) => setTimeout(r, 400));
        status.textContent = "Онлайн-заявки пока не подключены. Напиши в Telegram или позвони — контакты рядом.";
        return;
      }
      body.hidden = true;
      done.hidden = false;
      done.focus();
    } catch {
      status.textContent = "Не получилось отправить. Попробуй ещё раз или напиши в Telegram.";
    } finally {
      submit.disabled = false;
      submit.classList.remove("is-loading");
    }
  });
}

/* ---------- Папки цен: запись с выбранной услугой ---------- */

document.querySelectorAll("[data-effect]").forEach((a) => {
  a.addEventListener("click", () => {
    const select = form?.elements.effect;
    if (!select) return;
    const option = [...select.options].find((o) => o.text === a.dataset.effect);
    if (option) select.value = option.value;
  });
});

/* ---------- Цикл ---------- */

let queued = false;
function frame() {
  queued = false;
  updateNav();
  updateHero();
  updateProgress();
}
const request = () => {
  if (!queued) {
    queued = true;
    requestAnimationFrame(frame);
  }
};
window.addEventListener("scroll", request, { passive: true });
window.addEventListener("resize", () => {
  eye?.resize();
  request();
});
if (eye) new ResizeObserver(() => { eye.resize(); request(); }).observe(canvas);
frame();
