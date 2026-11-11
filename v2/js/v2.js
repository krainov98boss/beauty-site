import { lashMapSVG, EyeRenderer } from "../../js/lashes.js";

// Скрытые стартовые состояния включаются, только если скрипты загрузились.
document.documentElement.classList.add("js");

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Схемы длин в коллажах пакетов */
document.querySelectorAll("[data-lashmap]").forEach((el) => {
  el.innerHTML = lashMapSVG(el.dataset.lashmap);
});

/* Живой стикер в hero: медленный цикл наращивания (или своё видео) */
const loopCanvas = document.querySelector("[data-eye-loop]");
const heroVideo = document.querySelector("[data-hero-video]");
if (heroVideo) {
  heroVideo.playbackRate = 0.6;
  if (loopCanvas) loopCanvas.hidden = true;
} else if (loopCanvas) {
  const eye = new EyeRenderer(loopCanvas, { tweezers: true, progress: reduceMotion ? 1 : 0 });
  new ResizeObserver(() => eye.resize()).observe(loopCanvas);
  if (!reduceMotion) {
    const RUN = 16000; // мс на сборку
    const HOLD = 3500; // мс любуемся результатом
    let t0 = performance.now();
    let visible = true;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(loopCanvas);
    const tick = (now) => {
      if (visible && !document.hidden) {
        let t = now - t0;
        if (t > RUN + HOLD) {
          t0 = now;
          t = 0;
        }
        const k = Math.min(1, t / RUN);
        const p = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        eye.render(p);
        loopCanvas.style.opacity = t > RUN + HOLD - 600 ? String((RUN + HOLD - t) / 600) : t < 500 ? String(t / 500) : "1";
      } else {
        t0 += 16;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

/* Появления по прокрутке */
const reveals = [...document.querySelectorAll("[data-reveal], .reveal")];
if (reduceMotion || !("IntersectionObserver" in window)) {
  reveals.forEach((el) => el.classList.add("is-in"));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    },
    { threshold: 0.2, rootMargin: "0px 0px -6% 0px" }
  );
  reveals.forEach((el) => io.observe(el));
}

/* Прогресс секций и параллакс */
const nav = document.querySelector("[data-nav]");
const progressEls = [...document.querySelectorAll("[data-progress]")];
const parallax = [...document.querySelectorAll("[data-parallax]")];

function frame() {
  queued = false;
  const vh = window.innerHeight;
  nav?.classList.toggle("is-scrolled", window.scrollY > 24);
  for (const el of progressEls) {
    const r = el.getBoundingClientRect();
    const p = reduceMotion ? 1 : clamp((vh * 0.9 - r.top) / (vh * 0.6 + r.height * 0.25));
    el.style.setProperty("--p", p.toFixed(4));
  }
  if (!reduceMotion) {
    for (const el of parallax) {
      const k = Number(el.dataset.parallax) || 0;
      el.style.translate = `0 ${(clamp(window.scrollY / vh, 0, 1.5) * k).toFixed(1)}px`;
    }
  }
}
let queued = false;
const request = () => {
  if (!queued) {
    queued = true;
    requestAnimationFrame(frame);
  }
};
window.addEventListener("scroll", request, { passive: true });
window.addEventListener("resize", request);
frame();

/* Форма */
const form = document.querySelector("[data-form]");
if (form) {
  const body = form.querySelector(".form__body");
  const done = form.querySelector(".form__done");
  const status = form.querySelector(".form__status");
  const submit = form.querySelector("[type=submit]");
  const { name, phone } = form.elements;
  const setError = (input, show) => {
    const err = document.getElementById(`${input.id}-err`);
    input.setAttribute("aria-invalid", show ? "true" : "false");
    if (show) input.setAttribute("aria-describedby", err.id);
    else input.removeAttribute("aria-describedby");
    err.hidden = !show;
  };
  const okName = () => name.value.trim().length > 1;
  const okPhone = () => phone.value.replace(/\D/g, "").length >= 10;
  name.addEventListener("blur", () => name.value && setError(name, !okName()));
  phone.addEventListener("blur", () => phone.value && setError(phone, !okPhone()));

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const a = okName();
    const b = okPhone();
    setError(name, !a);
    setError(phone, !b);
    if (!a || !b) {
      (a ? phone : name).focus();
      return;
    }
    status.textContent = "";
    submit.disabled = true;
    submit.classList.add("is-loading");
    try {
      const endpoint = form.dataset.endpoint;
      if (!endpoint) {
        await new Promise((r) => setTimeout(r, 400));
        status.textContent = "Онлайн-заявки пока не подключены. Напиши в Telegram или позвони — контакты рядом.";
        return;
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (!res.ok) throw new Error(String(res.status));
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

  /* Цена → форма с выбранным пакетом */
  document.querySelectorAll("[data-effect]").forEach((a) =>
    a.addEventListener("click", () => {
      const opt = [...form.elements.effect.options].find((o) => o.text === a.dataset.effect);
      if (opt) form.elements.effect.value = opt.value;
    })
  );
}
