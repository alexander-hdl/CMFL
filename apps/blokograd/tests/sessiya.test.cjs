// Проверка конца сессии в «Блокограде»: после итогов дня город спит, перезагрузка не обходит лимит,
// взрослый может разрешить до трёх игровых дней, на новую дату можно играть снова.
// Запуск из корня: node apps/blokograd/tests/sessiya.test.cjs
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SRC = path.join(ROOT, "apps", "blokograd", "blokograd.html");
const THREE = path.join(ROOT, "apps", "blokograd", "vendor", "three.min.js");
const THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.158.0/three.min.js";

function wrap(src) {
  const cut = src.indexOf("</style>") + "</style>".length;
  return `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<style>body{margin:0}[hidden]{display:none!important}</style>\n${src.slice(0, cut).trim()}\n</head>\n<body>\n${src.slice(cut).trim()}\n</body>\n</html>\n`;
}

(async () => {
  const results = [];
  const ok = (cond, name) => { results.push({ name, pass: !!cond }); console.log((cond ? "  ✓ " : "  ✗ ") + name); };
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "blokograd-"));
  const tmp = path.join(tmpDir, "blokograd.html");
  fs.writeFileSync(tmp, wrap(fs.readFileSync(SRC, "utf8")));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ru-RU" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.route(THREE_URL, (r) => r.fulfill({ path: THREE, contentType: "application/javascript" }));
  // Фиксированная «сегодняшняя» дата, пока тест сам её не сменит.
  await page.addInitScript(() => { try { if (!localStorage.getItem("blokograd.testDate")) localStorage.setItem("blokograd.testDate", "2026-10-12"); } catch (e) {} });
  const open = async () => { await page.goto("file://" + tmp); await page.waitForFunction(() => window.BLOKOGRAD && window.BLOKOGRAD.state()); };
  const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
  const text = (sel) => page.evaluate((s) => document.querySelector(s).textContent, sel);
  const st = () => page.evaluate(() => { const S = window.BLOKOGRAD.state(); return { day: S.day, slept: S.slept, limit: S.limitDays, dayLog: S.dayLog, running: window.BLOKOGRAD.Game.running }; });
  // Ночь, итоги и «Спать» кнопками, как у ребёнка.
  const goToSleep = async () => {
    await page.evaluate(() => { window.BLOKOGRAD.state().t = 1; });
    await page.waitForSelector("#night:not([hidden])", { timeout: 10000 });
    await page.click("#b-sleep");
    await page.waitForSelector("#board .bhead h2");
    await page.click("#board button:has-text('Спать')");
    await page.waitForSelector("#start:not([hidden])", { timeout: 5000 });
  };
  try {
    await open();
    ok((await st()).limit === 1 && (await st()).dayLog.started === 1 && (await st()).dayLog.date === "2026-10-12", "новое сохранение: лимит 1, dayLog = {сегодня, 1}");
    ok((await vis("#b-play")) && !(await vis("#b-again")), "заставка: видна «Играть»");
    await page.click("#b-play");
    await page.waitForFunction(() => window.BLOKOGRAD.Game.running);
    ok(!(await vis("#start")), "после «Играть» игра идёт");

    await goToSleep();
    let s = await st();
    ok(s.slept && !s.running && s.day === 1, "«Спать»: slept, цикл остановлен, день не сменился");
    ok(/спит/.test(await text("#start-title")) && /отдыхает/.test(await text("#start-msg")), "экран отдыха: «Блокоград спит», «отдыхает до завтра»");
    ok(!(await vis("#b-play")) && !(await vis("#b-again")), "на экране отдыха нет кнопки игры");

    await open();
    s = await st();
    ok(s.slept && s.day === 1 && (await vis("#start")) && !(await vis("#b-play")) && !(await vis("#b-again")), "после перезагрузки город всё ещё спит, лимит не обойти");

    // Взрослый разрешает 2 дня на экране для взрослого (удержание ⚙ две секунды; заставку прячем, чтобы добраться до кнопки).
    await page.evaluate(() => { document.getElementById("start").hidden = true; });
    await page.dispatchEvent("#b-gear", "pointerdown");
    await page.waitForSelector("#board .btn.sq:has-text('+')", { timeout: 4000 });
    ok((await text("#board")).includes("Игровых дней за один настоящий день"), "на экране взрослого есть строка про игровые дни");
    const sqH = await page.evaluate(() => Math.min(...[...document.querySelectorAll("#board .btn.sq")].map((b) => b.getBoundingClientRect().height)));
    ok(sqH >= 48, "кнопки − и + не меньше 48 px (" + Math.round(sqH) + ")");
    await page.click("#board .btn.sq:has-text('+')");
    ok((await st()).limit === 2, "«+» ставит лимит 2 и сохраняет");
    await page.reload(); await page.waitForFunction(() => window.BLOKOGRAD && window.BLOKOGRAD.state());
    s = await st();
    ok(s.limit === 2 && s.slept, "лимит 2 пережил перезагрузку");
    ok((await vis("#b-again")) && /2 из 2/.test(await text("#start-msg")) && !(await vis("#b-play")), "виден «Ещё один день» (2 из 2)");

    await page.click("#b-again");
    await page.waitForFunction(() => window.BLOKOGRAD.Game.running);
    s = await st();
    ok(s.day === 2 && !s.slept && s.dayLog.started === 2 && !(await vis("#start")), "«Ещё один день»: день 2, dayLog.started = 2, игра идёт");
    ok(await page.evaluate(() => window.BLOKOGRAD.canStartDay()) === false, "canStartDay() = false, лимит выбран");

    await goToSleep();
    ok(!(await vis("#b-again")) && !(await vis("#b-play")) && /отдыхает/.test(await text("#start-msg")), "второй день закончен: снова отдых");
    await open();
    ok((await st()).slept && !(await vis("#b-again")), "перезагрузка после второго дня лимит не обходит");

    // Следующая настоящая дата.
    await page.evaluate(() => window.BLOKOGRAD.setDate("2026-10-13"));
    await open();
    ok((await vis("#b-again")) && /Играть/.test(await text("#b-again")) && !(await vis("#b-play")), "на новую дату предлагается «Играть»");
    await page.click("#b-again");
    await page.waitForFunction(() => window.BLOKOGRAD.Game.running);
    s = await st();
    ok(s.day === 3 && !s.slept && s.dayLog.date === "2026-10-13" && s.dayLog.started === 1, "новая дата: день 3, dayLog = {завтра, 1}");

    // Сохранение до этого изменения: без slept и dayLog.
    await page.evaluate(() => { const S = window.BLOKOGRAD.state(); delete S.slept; delete S.dayLog; delete S.limitDays; window.BLOKOGRAD.save(true); });
    await open();
    s = await st();
    ok(!s.slept && s.limit === 1 && s.dayLog.date === "2026-10-13" && s.dayLog.started === 1 && (await vis("#b-play")), "старое сохранение: день продолжается, dayLog = {сегодня, 1}");
    await page.click("#b-play");
    await page.waitForFunction(() => window.BLOKOGRAD.Game.running);
    ok((await st()).day === 3, "«Играть» продолжает текущий день");

    ok(errors.length === 0, "нет ошибок в консоли" + (errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""));
  } catch (e) {
    ok(false, "тест упал: " + (e && e.stack || e));
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(failed ? `\n${failed} из ${results.length} проверок не прошли` : `\nВсе проверки прошли (${results.length})`);
  process.exit(failed ? 1 : 0);
})();
