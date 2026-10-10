// Общий запуск браузера для приёмочных тестов игр. Используется так:
//   const { run } = require("./_harness.cjs");
//   run("ferma", async (t, page) => { await t.ok(cond, "описание"); ... });
// Запуск: node tools/tests/ferma.test.cjs  (браузер Chromium уже установлен в /opt/pw-browsers).
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");

function makeT() {
  const results = [];
  const t = {
    ok(cond, name) { results.push({ name, pass: !!cond }); console.log((cond ? "  ✓ " : "  ✗ ") + name); },
    eq(actual, expected, name) {
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      results.push({ name, pass });
      console.log((pass ? "  ✓ " : "  ✗ ") + name + (pass ? "" : `\n      ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`));
    },
    results,
  };
  return t;
}

async function run(game, body, opts = {}) {
  const file = opts.file || path.join(ROOT, "plan", game + ".html");
  const viewport = opts.viewport || { width: 1024, height: 768 };
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, locale: "ru-RU" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  const t = makeT();
  t.page = page;
  t.context = context;
  t.file = file;
  t.reload = async () => { await page.goto("file://" + file); await page.waitForFunction(() => window[game.toUpperCase()] && window[game.toUpperCase()].ready, null, { timeout: 10000 }); };
  console.log(`== ${game}: ${file}`);
  let fatal = null;
  try {
    await t.reload();
    await body(t, page);
  } catch (e) {
    fatal = e;
    console.log("  ✗ исключение: " + (e && e.stack || e));
  }
  await browser.close();
  const failed = t.results.filter((r) => !r.pass).length;
  if (errors.length) { console.log("Ошибки страницы:"); errors.forEach((e) => console.log("  " + e)); }
  console.log(`Итого: ${t.results.length - failed} из ${t.results.length} проверок пройдено${errors.length ? `, ошибок страницы: ${errors.length}` : ""}`);
  process.exit(failed || fatal || (errors.length && !opts.allowPageErrors) ? 1 : 0);
}

module.exports = { run, ROOT };
