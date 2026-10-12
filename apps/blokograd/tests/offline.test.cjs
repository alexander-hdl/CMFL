// Офлайн-проверка «Блокограда» на собранном сайте: service worker кэширует страницу и местную копию
// three.js (vendor), поэтому после первого открытия игра стартует без сети. Запуск из корня:
//   node tools/test_app.mjs blokograd   (или напрямую node apps/blokograd/tests/offline.test.cjs)
// Сайт собирается здесь же (python3 tools/build_site.py) и раздаётся с localhost: service worker
// работает только по https или на localhost.
const fs = require("fs");
const http = require("http");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const DOCS = path.join(ROOT, "docs");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".webmanifest": "application/manifest+json", ".png": "image/png" };

function serve(dir) {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    const f = path.join(dir, u === "/" ? "index.html" : u);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, "localhost", () => ok({ srv, port: srv.address().port })));
}

(async () => {
  const results = [];
  const ok = (cond, name) => { results.push({ name, pass: !!cond }); console.log((cond ? "  ✓ " : "  ✗ ") + name); };
  execFileSync("python3", [path.join(ROOT, "tools", "build_site.py")], { cwd: ROOT, stdio: "ignore" });
  ok(fs.existsSync(path.join(DOCS, "vendor", "blokograd", "three.min.js")), "в сборке есть vendor/blokograd/three.min.js");
  const built = fs.readFileSync(path.join(DOCS, "blokograd.html"), "utf8");
  ok(!built.includes("cdnjs.cloudflare.com") && built.includes('src="vendor/blokograd/three.min.js"'), "собранная страница грузит three.js с сайта, а не с cdnjs");
  ok(/"vendor\/blokograd\/three\.min\.js"/.test(fs.readFileSync(path.join(DOCS, "sw.js"), "utf8")), "sw.js предзагружает three.js");

  const { srv, port } = await serve(DOCS);
  const base = `http://localhost:${port}/`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ru-RU" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    // 1. Первое открытие с сетью: игра стартует, service worker ставится и заполняет кэш.
    await page.goto(base + "blokograd.html");
    await page.waitForFunction(() => window.BLOKOGRAD && window.THREE, null, { timeout: 20000 });
    ok(true, "с сетью: игра загрузилась, three.js на месте");
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
    const cached = await page.waitForFunction(async () => {
      const keys = await caches.keys(); const k = keys.find((x) => x.startsWith("cmfl-")); if (!k) return false;
      const c = await caches.open(k);
      const need = ["blokograd.html", "vendor/blokograd/three.min.js", "index.html"];
      for (const n of need) if (!(await c.match(new URL(n, location.href).href))) return false;
      return true;
    }, null, { timeout: 30000 }).then(() => true, () => false);
    ok(cached, "service worker положил в кэш страницу, index.html и three.js");

    // Страница, которая зарегистрировала service worker, попадает под его управление только после
    // следующей загрузки: перезагружаем ещё раз с сетью и убеждаемся, что controller появился.
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 });
    ok(true, "страница под управлением service worker");

    // 2. Без сети: перезагрузка и открытие главной работают из кэша.
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.BLOKOGRAD && window.THREE, null, { timeout: 20000 }).then(() => ok(true, "без сети: игра загрузилась из кэша"), (e) => ok(false, "без сети игра не загрузилась: " + e.message));
    const title = await page.title();
    ok(title === "Блокоград", "заголовок страницы офлайн: " + title);
    await page.goto(base + "index.html");
    ok(/Блокоград/.test(await page.content()), "без сети: главная страница открывается из кэша");
    await context.setOffline(false);
    ok(errors.filter((e) => !/fonts\.g|ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e)).length === 0, "ошибок страницы нет (кроме шрифтов без сети)" + (errors.length ? " — было: " + errors.slice(0, 3).join(" | ") : ""));
  } catch (e) {
    ok(false, "исключение: " + (e && e.stack || e));
  }
  await browser.close();
  srv.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`Итого: ${results.length - failed} из ${results.length} проверок пройдено`);
  process.exit(failed ? 1 : 0);
})();
