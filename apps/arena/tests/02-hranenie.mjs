// Хранение: ключи localStorage, переживание перезагрузки, битый JSON, зеркало в db, тексты для сайта.
import fs from "node:fs";
import path from "node:path";
import { run, fresh, st, typeNumber, mathAnswer, waitMathStep, waitMathEnd, waitState, mockDb, reloadWithDb, reloadPlain, TODAY } from "./_helpers.mjs";

const ALLOWED = /^arena-v1-(math|words|reading|screen|family|tab|op|wplv|big|spaced|wpm|wcat|paper|wmode|htheme|race|quest-.+)$/;

export function register({ test, assert, eq }) {

  test("Хранение 1: в localStorage только разрешённые ключи arena-v1-*", async ({ page }) => {
    await fresh(page);
    // Раунд таблицы из одного примера, диктант из одного слова, квест, гонка на паузе, окно дня, настройки.
    await run(page, () => OT.play("math", { items: [[7, 8, "m"]] }));
    await mathAnswer(page); await waitMathEnd(page);
    await page.click("#m-home");
    await page.click('.seg [data-op="d"]');
    await run(page, () => OT.play("words", { items: ["d1"] }));
    await page.click("#w-check"); await page.click("#w-ok");
    await run(page, () => OT.play("quest"));
    await page.click("[data-go]");
    await page.click("#q-big");
    await run(page, () => OT.play("race"));
    await page.click("#race-pause");
    await run(page, () => OT.open("day"));
    const keys = await run(page, () => Object.keys(localStorage).filter((k) => k.startsWith("arena-v1-")).sort());
    const bad = keys.filter((k) => !ALLOWED.test(k));
    eq(bad, [], "лишние ключи");
    for (const k of ["arena-v1-math", "arena-v1-words", "arena-v1-reading", "arena-v1-family", "arena-v1-op", "arena-v1-race", "arena-v1-quest-q-arena", "arena-v1-big"]) {
      assert(keys.includes(k), "нет ключа " + k + ": " + keys);
    }
    const ot = await run(page, () => localStorage.getItem("arena-ot-date"));
    eq(ot, TODAY, "ключ подмены даты лежит отдельно от arena-v1-*");
  });

  test("Хранение 2: прогресс переживает перезагрузку — документы, карта таблицы, трофеи", async ({ page }) => {
    await fresh(page);
    await run(page, () => OT.set("math", { facts: { "m:3x3": { b: 4, n: 4, ok: 4, due: "2026-10-19", last: "2026-10-12", up: "2026-10-12" } } }));
    await run(page, () => OT.play("math", { items: [[7, 8, "m"], [6, 6, "m"]] }));
    await mathAnswer(page); await waitMathStep(page, 1);
    await mathAnswer(page); await waitMathEnd(page);
    await run(page, () => OT.play("words", { items: ["d1", "c1"] }));
    await page.click("#w-check"); await page.click("#w-ok");
    await page.click("#w-check"); await page.click("#w-ok");
    await waitState(page, () => !OT.state().ui.words.round);
    const snap = () => run(page, () => {
      const s = OT.state();
      OT.showTab("math"); OT.render();
      return { math: s.docs.math, words: s.docs.words, reading: s.docs.reading,
        cells: [...document.querySelectorAll("#view-math .map > div")].map((d) => d.textContent + "|" + d.style.background),
        trophies: document.getElementById("trophy-count").textContent };
    });
    const before = await snap();
    assert(before.math.facts["m:7x8"] && before.words.prog.d1 && before.words.prog.c1, "раунды не записали прогресс");
    eq(before.trophies, "1", "трофей за ящик 4");
    await reloadPlain(page);
    const after = await snap();
    eq(after.math, before.math, "документ math");
    eq(after.words, before.words, "документ words");
    eq(after.cells, before.cells, "клетки карты таблицы");
    eq(after.trophies, before.trophies, "число трофеев");
  });

  test("Хранение 3: битый JSON в документах не ломает страницу", async ({ page, errors }) => {
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem("broken")) {
          sessionStorage.setItem("broken", "1");
          localStorage.setItem("arena-v1-math", "{oops");
          localStorage.setItem("arena-v1-words", "null");
          localStorage.setItem("arena-v1-reading", "[1]");
          localStorage.setItem("arena-v1-screen", '"строка"');
          localStorage.setItem("arena-v1-family", "42");
          localStorage.setItem("arena-v1-tab", "words");
        }
      } catch (e) {}
    });
    await reloadPlain(page);
    const s = await st(page);
    eq(s.tab, "words");
    eq([s.docs.math.facts, s.docs.math.sessions, s.docs.words.prog, s.docs.words.sessions, s.docs.reading.runs], [{}, [], {}, [], []], "документы по умолчанию");
    for (const t of ["math", "read", "words", "games", "prog"]) {
      await page.click("#tab-" + t);
      const len = await run(page, (t) => document.getElementById("view-" + t).innerText.length, t);
      assert(len > 50, "вкладка " + t + " не нарисовалась");
    }
    eq(errors, []);
  });

  test("Хранение 4: зеркало в db — пять документов arena/*, запись с задержкой, настроек и гонки в db нет", async ({ page }) => {
    await mockDb(page);
    await reloadWithDb(page);
    await fresh(page);
    eq((await st(page)).storeMode, "db");
    // Раунд из одного примера: записи не на каждое действие.
    await run(page, () => OT.play("math", { items: [[7, 8, "m"]] }));
    await mathAnswer(page); await waitMathEnd(page);
    await page.waitForFunction(() => window.__db.sets.some((s) => s.path === "arena/math"));
    await page.waitForTimeout(900);
    const writes = await run(page, () => window.__db.sets.filter((s) => s.path === "arena/math"));
    assert(writes.length >= 1 && writes.length <= 3, "записей arena/math: " + writes.length);
    assert(writes[writes.length - 1].data.facts["m:7x8"], "в последней записи нет факта 7 × 8");
    // Десять быстрых изменений подряд — одна запись.
    const burst = await run(page, async () => {
      const before = window.__db.sets.filter((s) => s.path === "arena/screen").length;
      for (let i = 0; i < 10; i++) OT.set("screen", { budget: { wd: 20 + i, we: 28 } });
      await new Promise((r) => setTimeout(r, 1000));
      return window.__db.sets.filter((s) => s.path === "arena/screen").length - before;
    });
    eq(burst, 1, "десять изменений за раз — одна запись");
    // Настройки и гонка на паузе — только локально.
    await run(page, () => OT.reset());
    await page.click('.seg [data-op="d"]');
    await run(page, () => OT.play("race"));
    await page.click("#race-pause");
    await run(page, () => OT.flush());
    await page.waitForTimeout(150);
    const paths = await run(page, () => [...new Set(window.__db.sets.map((s) => s.path))].sort());
    eq(paths, ["arena/family", "arena/math", "arena/reading", "arena/screen", "arena/words"], "документы в db");
    const lastMath = await run(page, () => window.__db.sets.filter((s) => s.path === "arena/math").pop().data);
    assert(!("tab" in lastMath) && !("pos" in lastMath), "в arena/math нет настроек и гонки на паузе");
    await page.click("#tab-prog");
    assert((await run(page, () => document.getElementById("store-note").textContent)).includes("хранится вместе со страницей"), "подсказка про хранение в db");
  });

  test("Хранение 5: снимок из db заменяет данные, не трогает раунд, пропускается при ожидающей записи", async ({ page }) => {
    await mockDb(page);
    await reloadWithDb(page);
    await fresh(page);
    await run(page, () => OT.flush());
    await page.waitForTimeout(200);
    const SNAP = (facts) => ({ exists: true, data: () => ({ facts, sessions: [], nl: [] }) });
    const hard = { b: 4, n: 4, ok: 4, due: "2026-10-19", last: "2026-10-12", up: "2026-10-12" };
    // 1. Покой: снимок заменяет документ и localStorage.
    const r1 = await run(page, (hard) => {
      window.__db.listeners["arena/math"]({ exists: true, data: () => ({ facts: { "m:2x2": hard }, sessions: [], nl: [] }) });
      return { facts: Object.keys(OT.state().docs.math.facts), ls: Object.keys(JSON.parse(localStorage.getItem("arena-v1-math")).facts), trophies: document.getElementById("trophy-count").textContent };
    }, hard);
    eq(r1.facts, ["m:2x2"]); eq(r1.ls, ["m:2x2"], "localStorage тоже заменён"); eq(r1.trophies, "1", "шапка обновлена");
    // 2. Идёт раунд: данные заменены, раунд (пример, фаза) не тронут, шапка обновлена.
    await run(page, () => OT.play("math", { items: [[7, 8, "m"], [6, 6, "m"]] }));
    const r2 = await run(page, (hard) => {
      const R0 = OT.state().ui.math.round;
      window.__db.listeners["arena/math"]({ exists: true, data: () => ({ facts: { "m:2x2": hard, "m:3x3": hard }, sessions: [], nl: [] }) });
      const s = OT.state(), R = s.ui.math.round;
      return { before: [R0.i, R0.phase], after: [R.i, R.phase], facts: Object.keys(s.docs.math.facts).sort(), trophies: document.getElementById("trophy-count").textContent, hasPad: !!document.getElementById("m-pad") };
    }, hard);
    eq(r2.after, r2.before, "раунд не перерисован");
    eq(r2.facts, ["m:2x2", "m:3x3"]);
    eq(r2.trophies, "2");
    assert(r2.hasPad, "клавиатура раунда на месте");
    await run(page, () => OT.reset());
    // 3. Есть ожидающая запись: снимок пропускается.
    const r3 = await run(page, (hard) => {
      OT.set("math", { facts: { "m:9x9": hard } });
      window.__db.listeners["arena/math"]({ exists: true, data: () => ({ facts: { "m:5x5": hard }, sessions: [], nl: [] }) });
      return Object.keys(OT.state().docs.math.facts);
    }, hard);
    eq(r3, ["m:9x9"], "снимок при ожидающей записи пропущен");
  });

  test("Хранение 6: db отказывает — режим readonly, localStorage пишется; тексты для сайта в порядке (три про ИИ, подсказка про чат)", async ({ page, app }) => {
    await mockDb(page, "not_granted");
    await reloadWithDb(page);
    await fresh(page);
    await run(page, () => { OT.set("math", { facts: { "m:2x3": { b: 2, n: 1, ok: 1, due: "2026-10-13", last: "2026-10-12", up: "2026-10-12" } } }); OT.flush(); });
    await waitState(page, () => OT.state().storeMode === "readonly");
    const ls = await run(page, () => JSON.parse(localStorage.getItem("arena-v1-math")).facts["m:2x3"].b);
    eq(ls, 2, "localStorage пишется");
    await page.click("#tab-prog");
    assert((await run(page, () => document.getElementById("store-note").textContent)).includes("только в этом браузере"), "подсказка про readonly");

    // Каждая замена rewords встречается в исходнике ровно один раз.
    const src = fs.readFileSync(app.src, "utf8");
    const pairs = app.manifest.rewords;
    assert(pairs.length >= 4, "в rewords меньше четырёх пар");
    for (const [oldT] of pairs) eq(src.split(oldT).length - 1, 1, "в исходнике должно быть одно вхождение: " + oldT.slice(0, 50));
    // Тексты для сайта: с claude, но без sample (в моке use('sample') = null) три фразы про ИИ видны.
    await page.click("#tab-read");
    const read = await run(page, () => document.getElementById("view-read").innerText);
    for (const t of ["ИИ на этой странице сейчас недоступен", "Новые квесты от ИИ сейчас недоступны", "Новые сценки от ИИ сейчас недоступны"]) assert(read.includes(t), "нет текста: " + t);
    await run(page, () => OT.set("family", { notes: [{ id: "n1", ts: 1, d: "2026-10-12", kind: "idea", text: "хочу ещё игру", where: "Счёт", done: false, reply: "", seen: true }] }));
    await page.click("#tab-prog");
    const prog = await run(page, () => document.getElementById("view-prog").innerText);
    assert(prog.includes("в чате Claude"), "в исходнике подсказка про чат есть (на claude.ai она верна)");

    // Собранный сайт: проверяем, только если docs/trenazhery.html собран после последних правок.
    const built = path.join(app.docs, app.out);
    if (fs.existsSync(built) && fs.statSync(built).mtimeMs >= Math.max(fs.statSync(app.src).mtimeMs, fs.statSync(path.join(app.dir, "app.json")).mtimeMs)) {
      const html = fs.readFileSync(built, "utf8");
      for (const [oldT, newT] of app.manifest.rewords) {
        eq(html.split(newT).length - 1, 1, "на сайте новый текст один раз: " + newT.slice(0, 50));
        eq(html.split(oldT).length - 1, 0, "на сайте нет старого: " + oldT.slice(0, 50));
      }
      assert(!html.includes("в чате Claude"), "на сайте нет «в чате Claude»");
    }
  });
}
