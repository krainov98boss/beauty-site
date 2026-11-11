import { EyeRenderer } from "./lashes.js";

// Скрытые стартовые состояния анимаций включаются, только если скрипты загрузились.
document.documentElement.classList.add("js");

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Навигация ---------- */

const nav = document.querySelector("[data-nav]");
const updateNav = () => nav?.classList.toggle("is-scrolled", window.scrollY > 24);

/* ---------- Hero: шторка с бантом ---------- */

const hero = document.querySelector("[data-hero]");
const stage = hero?.querySelector("[data-stage]");
const band = (p, a, b) => clamp((p - a) / (b - a));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function updateHero() {
  if (!hero || !stage) return;
  const r = hero.getBoundingClientRect();
  const total = r.height - window.innerHeight;
  const p = total > 0 ? clamp(-r.top / total) : 1;
  stage.style.setProperty("--u", easeInOut(band(p, 0.02, 0.32)).toFixed(4));
  stage.style.setProperty("--c", easeInOut(band(p, 0.28, 0.78)).toFixed(4));
  stage.style.setProperty("--v", easeInOut(band(p, 0.4, 0.86)).toFixed(4));
}

/* ---------- Иллюстрации глаза (рамка hero, «до и после») ---------- */

const eyes = [...document.querySelectorAll("[data-eye-static]")].map(
  (c) => new EyeRenderer(c, { tweezers: false, progress: Number(c.dataset.eyeStatic) })
);
const eyeRo = new ResizeObserver(() => eyes.forEach((e) => e.resize()));
eyes.forEach((e) => eyeRo.observe(e.canvas));

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
window.addEventListener("resize", request);
frame();
