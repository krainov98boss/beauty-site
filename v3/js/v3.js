// v3: сцены, которые «проигрываются» прокруткой. Каждая сцена получает --p (0→1),
// всё остальное делает CSS. Без JS и при reduced-motion — статичные разделы.

const root = document.documentElement;
root.classList.add("js");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

const scenes = [...document.querySelectorAll("[data-scene]")];
const nav = document.querySelector("[data-nav]");
const menu = document.querySelector('[data-scene="menu"]');
const track = menu?.querySelector("[data-track]");
const pages = track ? [...track.children] : [];

if (!reduce) root.classList.add("scroll");

function sizeMenu() {
  if (!menu || !track || reduce) return;
  const last = pages[pages.length - 1];
  const first = pages[0];
  const dist = Math.max(0, last.offsetLeft + last.offsetWidth / 2 - (first.offsetLeft + first.offsetWidth / 2));
  track.style.paddingLeft = `${Math.max(0, (innerWidth - first.offsetWidth) / 2)}px`;
  menu.style.setProperty("--h", `${innerHeight + dist}px`);
  menu.dataset.dist = String(dist);
}

function frame() {
  queued = false;
  const vh = innerHeight;
  nav?.classList.toggle("is-solid", scrollY > vh * 0.6);
  if (reduce) return;
  for (const s of scenes) {
    const r = s.getBoundingClientRect();
    const total = r.height - vh;
    const p = total > 0 ? clamp(-r.top / total) : 1;
    s.style.setProperty("--p", p.toFixed(4));
    if (s === menu && track) {
      const dist = Number(menu.dataset.dist || 0);
      track.style.transform = `translate3d(${(-dist * p).toFixed(1)}px,0,0)`;
      const cx = innerWidth / 2;
      for (const pg of pages) {
        const b = pg.getBoundingClientRect();
        const d = clamp((b.left + b.width / 2 - cx) / b.width, -1.5, 1.5);
        pg.style.setProperty("--d", d.toFixed(3));
      }
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
addEventListener("scroll", request, { passive: true });
addEventListener("resize", () => {
  sizeMenu();
  request();
});
addEventListener("load", () => {
  sizeMenu();
  request();
});
sizeMenu();
frame();

/* Видео: медленнее и только на экране */
document.querySelectorAll("video[data-slow]").forEach((v) => {
  const slow = () => (v.playbackRate = 0.75);
  v.addEventListener("loadedmetadata", slow);
  slow();
  if (reduce) {
    v.removeAttribute("autoplay");
    v.pause();
    return;
  }
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) {
      v.preload = "auto";
      v.play().catch(() => {});
    } else v.pause();
  }).observe(v);
});

/* Появление из размытия вне сцен */
const io = new IntersectionObserver(
  (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("is-in"), io.unobserve(e.target))),
  { threshold: 0.2 }
);
document.querySelectorAll(".contact .blur-in").forEach((el) => (reduce ? el.classList.add("is-in") : io.observe(el)));

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
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const a = okName();
    const b = okPhone();
    setError(name, !a);
    setError(phone, !b);
    if (!a || !b) return (a ? phone : name).focus();
    status.textContent = "";
    submit.disabled = true;
    submit.classList.add("is-loading");
    try {
      const endpoint = form.dataset.endpoint;
      if (!endpoint) {
        await new Promise((r) => setTimeout(r, 400));
        status.textContent = "Онлайн-заявки пока не подключены. Напишите в Instagram или ВКонтакте — ссылки слева.";
        return;
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (!res.ok) throw new Error(String(res.status));
      body.hidden = true;
      done.hidden = false;
      done.focus();
    } catch {
      status.textContent = "Не получилось отправить. Попробуйте ещё раз или напишите в Instagram.";
    } finally {
      submit.disabled = false;
      submit.classList.remove("is-loading");
    }
  });
}
