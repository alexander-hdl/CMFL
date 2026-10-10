#!/usr/bin/env node
// Автотесты «Обороны таблицы». Запуск из корня репозитория:
//
//     node tools/test_oborona.mjs            # все проверки
//     node tools/test_oborona.mjs --shot     # плюс скриншоты в tools/.shots/
//     node tools/test_oborona.mjs --grep луч # только проверки, в имени которых есть «луч»
//
// Исходник plan/oborona-tablicy.html оборачивается в полный документ так же, как это
// делает tools/build_site.py, и открывается в headless Chromium (Playwright). Игра
// выставляет отладочный интерфейс window.OT (см. dev/oborona-tablicy/01-arhitektura.md);
// проверки общаются с игрой только через него и через DOM.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Playwright может стоять глобально (как в облачной сессии): ищем его через require.
const { chromium } = createRequire(import.meta.url)("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "plan", "oborona-tablicy.html");
const TMP = path.join(ROOT, "tools", ".test-oborona.html");
const SHOTS = path.join(ROOT, "tools", ".shots");
const args = process.argv.slice(2);
const SHOT = args.includes("--shot");
const grepIdx = args.indexOf("--grep");
const GREP = grepIdx >= 0 ? args[grepIdx + 1] : null;

function wrap(src) {
  const cut = src.indexOf("</style>") + "</style>".length;
  if (cut < "</style>".length) throw new Error("plan/oborona-tablicy.html: нет </style>");
  const head = src.slice(0, cut).trim();
  const body = src.slice(cut).trim();
  return `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n` +
    `<style>body{margin:0}[hidden]{display:none!important}</style>\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }

export function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
export function eq(a, b, msg) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg || "not equal"}: ${sa} !== ${sb}`);
}

// Файлы с проверками лежат в tools/tests/oborona/*.mjs; каждый экспортирует register({ test, assert, eq }).

async function loadSuites() {
  const dir = path.join(ROOT, "tools", "tests", "oborona");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort()) {
    const mod = await import(path.join(dir, f));
    if (typeof mod.register === "function") mod.register({ test, assert, eq });
  }
}

async function main() {
  if (!fs.existsSync(SRC)) { console.error(`нет файла ${path.relative(ROOT, SRC)}`); process.exit(2); }
  fs.writeFileSync(TMP, wrap(fs.readFileSync(SRC, "utf8")));
  if (SHOT) fs.mkdirSync(SHOTS, { recursive: true });
  await loadSuites();
  const picked = tests.filter((t) => !GREP || t.name.includes(GREP));
  if (!picked.length) { console.log("проверок нет"); process.exit(0); }

  const browser = await chromium.launch();
  let failed = 0;
  for (const t of picked) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "ru-RU" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    const t0 = Date.now();
    try {
      await page.goto("file://" + TMP);
      await page.waitForFunction(() => window.OT && typeof window.OT.state === "function", null, { timeout: 5000 });
      await t.fn({ page, errors, shot: async (name) => { if (SHOT) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } });
      if (errors.length) throw new Error("ошибки в консоли: " + errors.join(" | "));
      console.log(`  ok   ${t.name} (${Date.now() - t0} мс)`);
    } catch (e) {
      failed++;
      console.log(`  FAIL ${t.name}\n       ${String(e.message || e).split("\n").join("\n       ")}`);
      if (SHOT) await page.screenshot({ path: path.join(SHOTS, `FAIL-${t.name.replace(/[^\wа-яё-]+/gi, "_")}.png`) }).catch(() => {});
    }
    await context.close();
  }
  await browser.close();
  fs.rmSync(TMP, { force: true });
  console.log(`\n${picked.length - failed} из ${picked.length} прошли`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
