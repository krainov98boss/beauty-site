// Пререндер статичных частей, которые рисует js/lashes.js:
//  - SVG-схемы эффектов прямо в index.html (видны и без JS);
//  - assets/img/eye-after.png — финальный кадр глаза (запасной вид hero и «до/после» без JS).
// Запуск из корня репозитория: node tools/render-static.cjs
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const port = 8790 + Math.floor(Math.random() * 100);

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(port), "-d", root], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: "networkidle" });

    const types = await page.$$eval("[data-lashmap]", (els) => els.map((e) => e.dataset.lashmap));
    const maps = await page.evaluate(async (list) => {
      const m = await import("/js/lashes.js");
      return Object.fromEntries(list.map((t) => [t, m.lashMapSVG(t)]));
    }, types);
    const file = path.join(root, "index.html");
    let html = fs.readFileSync(file, "utf8");
    html = html.replace(/(<div class="polaroid__img[^"]*" data-lashmap="([\w-]+)">)[\s\S]*?(<\/div>)/g, (all, open, type, close) =>
      `${open}${maps[type].replace(/\n\s*/g, "")}${close}`
    );
    fs.writeFileSync(file, html);

    const png = await page.evaluate(async () => {
      const { EyeRenderer } = await import("/js/lashes.js");
      const c = document.createElement("canvas");
      c.style.cssText = "position:fixed;left:0;top:0;width:920px;height:478px";
      document.body.append(c);
      new EyeRenderer(c, { tweezers: false, progress: 1 });
      return c.toDataURL("image/png");
    });
    fs.writeFileSync(path.join(root, "assets/img/eye-after.png"), Buffer.from(png.split(",")[1], "base64"));
    console.log(`maps: ${types.join(", ")}; eye-after.png written`);
  } finally {
    await browser.close();
    server.kill();
  }
})();
