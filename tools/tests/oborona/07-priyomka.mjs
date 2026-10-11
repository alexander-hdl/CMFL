// Этап 4 («приёмка и сайт»): решения оркестратора после ревью этапа 3 (зачёт карточки, путаница только при настоящем
// проходе сквозь луч, запасная волна из 2–3 чисел), бот П7 (3 уровня без единой викторины), запреты из задания
// (grep исходника), собранная страница сайта docs/oborona-tablicy.html. Общаются с игрой только через window.OT и DOM-id.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const run = (page, fn, arg) => page.evaluate(fn, arg);
const ready = (page) => page.waitForFunction(() => window.OT && typeof window.OT.state === "function");

// Помощники внутри страницы (window.Q): сыграть волну по плану Solver, дата «сегодня + n» от заданной.
const HELPERS = () => {
  window.Q = {
    add(date, n) { const [y, m, d] = date.split("-").map(Number), t = new Date(y, m - 1, d + n); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); },
    build() {
      for (const p of OT.state().pads) if (p.digit != null && !p.fixed) OT.removeTower(p.id);
      const plan = OT.state().wave.plan;
      for (const p of plan) { OT.placeTower(p.a, p.da); OT.placeTower(p.b, p.db); }
      return plan.map((p) => OT.link(p.a, p.b).ok);
    },
    win() { Q.build(); OT.startWave(); return OT.runWave(); },
  };
};

// Проверка «нет викторины» в странице: список проблем (пустой — всё чисто). allowed — id экранов, которые сейчас можно видеть.
const AUDIT = (allowed) => {
  const problems = [];
  const vis = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (n.hidden) return false;
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  for (const el of document.querySelectorAll("input, select, textarea, [contenteditable='true'], [contenteditable='']")) if (vis(el)) problems.push("виден ввод: " + el.tagName + "#" + el.id);
  for (const el of document.querySelectorAll("[role='dialog'], [role='alertdialog'], [aria-modal='true'], dialog")) if (vis(el)) problems.push("виден диалог: " + (el.id || el.tagName));
  const seen = [];
  for (const el of document.querySelectorAll(".screen, #pause-menu")) if (vis(el)) seen.push(el.id);
  for (const id of seen) if (!allowed.includes(id)) problems.push("лишний экран: " + id + " (разрешены: " + allowed.join(", ") + ")");
  // Вопросительный знак допустим только в двух заранее известных местах: образец земли 5 на карте и подсказка земли в итогах.
  const tips = OT.lands().flatMap((l) => l.tips);
  const stage = document.getElementById("stage");
  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let tn = walker.nextNode(); tn; tn = walker.nextNode()) {
    const t = tn.nodeValue;
    if (!t.includes("?")) continue;
    const el = tn.parentElement;
    if (!vis(el)) continue;
    if (el.classList.contains("sample") || tips.some((x) => t.includes(x) || x.includes(t.trim()))) continue;
    problems.push("виден вопросительный знак: «" + t.trim().slice(0, 60) + "»");
  }
  // Кнопки-ответы: три и больше кнопок только с числом внутри одного контейнера (кроме руки и клеток уровней карты).
  for (const el of stage.querySelectorAll("div, section, ul")) {
    if (!vis(el) || el.id === "hand" || el.classList.contains("lvls")) continue;
    const nums = [...el.children].filter((c) => c.tagName === "BUTTON" && vis(c) && /^\s*\d+\s*$/.test(c.textContent));
    if (nums.length >= 3) problems.push("похоже на кнопки-ответы: " + (el.id || el.className));
  }
  const text = stage.innerText || "";
  const quiz = text.match(/Сколько будет|Чему равно|Выбери (правильный )?ответ|Правильный ответ|Ответь|Реши пример/i);
  if (quiz) problems.push("текст викторины: «" + quiz[0] + "»");
  const dr = JSON.stringify(OT.drawn());
  if (dr.includes("?")) problems.push("знак вопроса на поле: " + dr.slice(0, 120));
  return problems;
};

const READ_SRC = () => fs.readFileSync(path.join(ROOT, "plan", "oborona-tablicy.html"), "utf8");
// Исходник без комментариев (// и /* */, но не «://» в адресах).
const STRIP = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");

export function register({ test, assert, eq }) {

  // ---------- решения оркестратора после ревью этапа 3 ----------

  test("Зачёт: враг 12 побеждён лучом 2 × 6 три дня подряд — m:3x4 (из неё сделан враг) растёт вместе с m:2x6", async ({ page }) => {
    await run(page, HELPERS);
    const r = await run(page, () => {
      OT.manual(true); OT.seed(1); OT.newGame({ unlockAll: true });
      const start = OT.state().day.date, out = [];
      OT.setCard("m:2x6", { b: 1 });                         // пара 2 × 6 уже введена, 3 × 4 заведётся как карточка врагов
      for (const off of [0, 1, 4]) {                         // 1→2 (завтра), 2→3 (через 3 дня), 3→4: интервалы 0/1/3/7
        OT.setDate(Q.add(start, off));
        OT.loadLevel(2, 0, { ignoreLimit: true });
        OT.setWave([12, 12, 12], { cards: { 12: "m:3x4" } });
        OT.placeTower("A0", 2); OT.placeTower("B0", 6); OT.link("A0", "B0");
        OT.startWave(); OT.runWave();
        const ev = OT.events({ clear: true }).filter((e) => e.type === "enemy_killed").map((e) => e.beam.product);
        const c = OT.state().cards;
        out.push({ off, killed: ev, a: c["m:3x4"].b, b: c["m:2x6"].b, seen: c["m:3x4"].seen, ok: c["m:3x4"].ok });
      }
      return out;
    });
    for (const o of r) eq(o.killed, [12, 12, 12], "день +" + o.off + ": все три победы лучом 2 × 6");
    eq(r.map((o) => o.a), [2, 3, 4], "m:3x4 по дням: " + JSON.stringify(r));
    eq(r.map((o) => o.b), [2, 3, 4], "m:2x6 растёт так же (пара введена)");
    eq([r[2].seen, r[2].ok], [9, 9], "счётчики врага у m:3x4");
  });

  test("Зачёт: пара, которая ещё не введена, карточку не заводит — зачёт только карточке врага", async ({ page }) => {
    const r = await run(page, () => {
      OT.manual(true); OT.seed(1); OT.newGame({ unlockAll: true });
      OT.loadLevel(2, 0);
      OT.setWave([12, 12], { cards: { 12: "m:3x4" } });
      OT.placeTower("A0", 2); OT.placeTower("B0", 6); OT.link("A0", "B0");
      OT.startWave(); OT.runWave();
      const c = OT.state().cards;
      return { has26: "m:2x6" in c, b34: c["m:3x4"].b, ch: OT.events().filter((e) => e.type === "card_changed").map((e) => e.key) };
    });
    eq(r.has26, false, "m:2x6 не создана зачётом");
    eq(r.b34, 2, "m:3x4 поднялась");
    eq(r.ch, ["m:3x4"], "card_changed только у карточки врага");
  });

  test("Зачёт: враг дошёл до крепости — штраф только карточке, из которой он сделан; карточка пары не тронута", async ({ page }) => {
    const r = await run(page, () => {
      OT.manual(true); OT.seed(1); OT.newGame({ unlockAll: true });
      const today = OT.state().day.date;
      OT.setCard("m:2x6", { b: 3, due: today }); OT.setCard("m:3x4", { b: 3, due: today });
      OT.loadLevel(2, 0);
      OT.setWave([12], { cards: { 12: "m:3x4" } });             // луча нет: враг доходит
      OT.startWave(); OT.runWave();
      const c = OT.state().cards;
      return { a: c["m:3x4"].b, b: c["m:2x6"].b, miss: c["m:3x4"].miss };
    });
    eq([r.a, r.b, r.miss], [1, 3, 1], "3 × 4 в коробку 1, 2 × 6 не тронута");
  });

  test("Путаница: записывается, только если враг действительно прошёл сквозь неверный луч", async ({ page }) => {
    const r = await run(page, () => {
      const play = (first, second) => {
        OT.manual(true); OT.seed(1); OT.newGame({ veteran: true });
        OT.loadLevel(4, 0);
        OT.setWave([56]);
        OT.placeTower("A0", first[0]); OT.placeTower("B0", first[1]); OT.link("A0", "B0");       // ближе к началу дороги
        OT.placeTower("A1", second[0]); OT.placeTower("B1", second[1]); OT.link("A1", "B1");
        OT.startWave(); OT.runWave();
        const ev = OT.events({ clear: true });
        return { conf: ev.filter((e) => e.type === "confusion").map((e) => [e.a, e.b]), passed: ev.filter((e) => e.type === "enemy_passed_beam").map((e) => e.product), killed: ev.filter((e) => e.type === "enemy_killed").length, state: OT.state().conf };
      };
      return { never: play([7, 8], [6, 8]), passes: play([6, 8], [7, 8]) };
    });
    // 56 убит первым лучом 7 × 8 и до 6 × 8 = 48 не дошёл: путаницы нет.
    eq(r.never.passed, [], "56 не проходил сквозь 48");
    eq([r.never.killed, r.never.conf, r.never.state], [1, [], {}], "луч, до которого враг не дошёл, путаницей не записан");
    // Первым стоит 6 × 8: 56 прошёл сквозь него, затем убит 7 × 8.
    eq(r.passes.passed, [48]);
    eq([r.passes.killed, r.passes.conf], [1, [[48, 56]]], "прошёл сквозь 48 — путаница 48 ↔ 56");
    eq(r.passes.state["48-56"].n, 1);
  });

  test("Запасная волна: чередуются 2–3 числа земли, а не одно число n раз; решаема, без троих подряд", async ({ page }) => {
    const r = await run(page, () => {
      OT.manual(true);
      const tplOf = (land, idx) => (land === 5 ? "T5" : ["T1", "T2", "T3", "T3", "T4"][idx]);
      const out = [];
      for (let land = 1; land <= 6; land++) for (const idx of [0, 1, 4]) for (const seed of [1, 2]) {
        const w = OT.waveFor(land, idx, 1, seed, { budget: 0 });            // бюджет 0: основной цикл пропущен, сразу запасной вариант
        const nums = w.enemies.map((e) => e.number), distinct = new Set(nums).size;
        let run3 = false;
        for (let i = 2; i < nums.length; i++) if (nums[i] === nums[i - 1] && nums[i] === nums[i - 2]) run3 = true;
        const plan = w.plan.map((p) => ({ number: p.n, a: p.a, b: p.b, da: p.da, db: p.db }));
        const bad = OT.verifyPlan({ land, idx, template: tplOf(land, idx), plan, enemies: w.enemies, fixed: w.fixed });
        out.push({ land, idx, seed, n: nums.length, distinct, run3, bad, armored: w.enemies.some((e) => e.armored) });
      }
      return out;
    });
    const wrong = r.filter((o) => o.bad.length || o.run3 || o.n < 6 || o.n > 12 || o.armored);
    eq(wrong, [], "запасные волны с ошибками");
    const alt = r.filter((o) => o.distinct >= 2 && o.distinct <= 3).length;
    assert(alt >= r.length * 0.8, `запасная волна из 2–3 чисел в ${alt} из ${r.length} случаев; остальные — одно число (Solver не справился)`);
    assert(r.every((o) => o.distinct <= 3), "больше трёх различных чисел");
  });

  // ---------- П7: бот играет три уровня без единой викторины ----------

  test("П7: бот проходит 3 уровня (земли 1–2) по ленте; после каждой волны и каждого экрана нет ввода, диалогов, вопросов и лишних экранов", async ({ page }) => {
    await run(page, HELPERS);
    const dialogs = [];
    page.on("dialog", (d) => { dialogs.push(d.type() + ": " + d.message()); d.dismiss().catch(() => {}); });
    const log = [];
    const audit = async (label, allowed) => {
      const p = await run(page, AUDIT, allowed);
      if (p.length) throw new Error(`П7 «${label}»: ${p.join("; ")}`);
      log.push(label);
    };
    await run(page, () => { OT.manual(true); OT.seed(1); OT.newGame({ unlockAll: true }); OT.setDate("2026-10-11"); });
    await audit("титул", ["scr-title"]);                                   // титул — единственный стартовый экран
    await page.click("#btn-play");
    await audit("карта", ["scr-map"]);

    const levels = ["1-0", "1-1", "2-0"];
    let totalKilled = 0, totalEnemies = 0, waves = 0;
    for (let li = 0; li < levels.length; li++) {
      const lv = levels[li];
      if (li === 2) await run(page, () => OT.setSetting("perDay", 3));     // третий уровень — последний за день: ночь без «Ещё один уровень»
      await page.click(`#scr-map [data-level="${lv}"]`);
      await audit(`уровень ${lv}: подготовка`, []);
      for (let w = 0; w < 3; w++) {
        const s = await run(page, () => OT.state());
        eq(s.phase, "prep", `уровень ${lv}, волна ${w + 1}: подготовка`);
        // Лента: числа врагов; верные лучи берём по плану Solver и сверяем, что каждый нужен кому-то из ленты.
        const ribbon = s.ribbon.map((r) => r.number);
        assert(ribbon.length >= 6 && ribbon.length <= 12, "лента 6–12: " + ribbon.length);
        const built = await run(page, () => Q.build());
        assert(built.length && built.every(Boolean), `уровень ${lv}, волна ${w + 1}: лучи построены: ${built}`);
        const plan = await run(page, () => OT.state().wave.plan);
        for (const p of plan) assert(ribbon.includes(p.n), `луч ${p.da} × ${p.db} = ${p.n} не нужен ленте ${ribbon}`);
        await audit(`уровень ${lv}, волна ${w + 1}: лучи построены`, []);
        if (li === 0 && w === 0) {                                         // кнопки как у ребёнка: «В бой!», «Пауза», «Продолжить»
          await page.click("#btn-fight");
          await run(page, () => OT.step(2));
          await audit("бой", []);
          await page.click("#btn-pause");
          assert(await page.isVisible("#pause-menu"), "меню паузы не видно");
          await audit("пауза", ["pause-menu"]);
          await page.click("#btn-resume");
        } else await run(page, () => OT.startWave());
        const st = await run(page, () => OT.runWave());
        assert(st.phase === "waveEnd" || st.phase === "levelEnd", "волна доиграна: " + st.phase);
        const ev = await run(page, () => OT.events({ clear: true }));
        const we = ev.filter((e) => e.type === "wave_end").pop();
        totalKilled += we.killed; totalEnemies += we.total; waves++;
        eq(we.killed, we.total, `уровень ${lv}, волна ${w + 1}: бот побеждает всех`);
        await audit(`уровень ${lv}, волна ${w + 1}: конец волны`, []);
        if (st.phase === "waveEnd") { await run(page, () => OT.step(3)); await audit(`уровень ${lv}, после волны ${w + 1}: подготовка`, []); }
      }
      await run(page, () => OT.step(1));
      if (li < 2) {
        assert(await page.isVisible("#scr-level-end"), "нет экрана итогов уровня " + lv);
        await audit(`итоги ${lv}`, ["scr-level-end"]);
        await page.click("#btn-le-map");
        await audit("карта после уровня", ["scr-map"]);
      } else {
        assert(await page.isVisible("#scr-night"), "после третьего уровня нет «ночи»");
        await audit("ночь", ["scr-night"]);
        assert(await page.isVisible("#rest-msg") && !(await page.isVisible("#btn-more")), "в ночь при лимите 3 должно быть «отдыхает до завтра» без «Ещё один уровень»");
        await page.click("#btn-night-map");
        await audit("карта после ночи", ["scr-map"]);
        const r = await run(page, () => OT.loadLevel(1, 0));
        eq(r, { ok: false, reason: "rest" });
        await audit("отдых", ["scr-rest"]);
        await page.click("#btn-rest-map");
        await audit("карта после отдыха", ["scr-map"]);
      }
    }
    // Итоги земли 5 со словами «Какое число вместе с 7 даёт 56?»: подсказка, не вопрос с кнопками-ответами.
    await run(page, () => { OT.setSetting("perDay", 8); OT.setDate("2026-10-12"); OT.loadLevel(5, 0); OT.finishLevel(); OT.step(1); });
    await audit("итоги земли 5 (подсказка)", ["scr-level-end"]);
    await page.click("#btn-le-map");
    eq(dialogs, [], "родные диалоги браузера (alert/confirm/prompt)");
    eq([totalKilled, waves], [totalEnemies, 9], "9 волн сыграно");
    assert(log.length >= 30, "проверок мало: " + log.length);
  });

  test("П7: сам аудит работает — подложенные ввод, диалог, викторина и чужой экран ловятся", async ({ page }) => {
    await run(page, HELPERS);
    await run(page, () => { OT.manual(true); OT.newGame(); OT.loadLevel(1, 0); });
    eq(await run(page, AUDIT, []), [], "чистое поле");
    const bad = await run(page, (A) => {
      const audit = new Function("return (" + A + ")")();
      const box = document.createElement("div");
      box.id = "fake-quiz";
      box.style.cssText = "position:absolute;left:100px;top:100px;width:600px;height:200px;background:#fff;z-index:99";
      box.innerHTML = '<div role="dialog">Сколько будет 7 × 8 = ?</div><input id="fake-in"><div id="ans"><button>54</button><button>56</button><button>63</button></div>';
      document.getElementById("stage").appendChild(box);
      document.getElementById("scr-night").hidden = false;
      return audit([]);
    }, AUDIT.toString());
    const joined = bad.join(" | ");
    for (const part of ["виден ввод", "виден диалог", "вопросительный знак", "кнопки-ответы", "текст викторины", "лишний экран: scr-night"]) assert(joined.includes(part), `не поймано «${part}»: ${joined}`);
  });

  test("Запреты: в исходнике нет prompt/confirm/alert, setInterval, Math.random, сундуков, бонусов за вход, серий, рекламы и покупок", async () => {
    const raw = READ_SRC(), code = STRIP(raw);
    assert(code.length < raw.length, "комментарии не вырезаны");
    for (const re of [/\b(?:window\.)?(?:prompt|confirm|alert)\s*\(/, /\bsetInterval\b/, /Math\.random/, /\beval\s*\(/, /document\.write/]) {
      const m = code.match(re);
      assert(!m, `в коде (без комментариев) найдено ${re}: «${m && code.slice(Math.max(0, m.index - 40), m.index + 60)}»`);
    }
    // Слова запрещённых механик: нигде, даже в комментариях и строках.
    const words = [/сундук/i, /бонус/i, /серия/i, /серию/i, /серии/i, /реклам/i, /куп(?:ить|и)\b/i, /покупк/i, /за вход/i, /ежедневн/i, /лутбокс|lootbox|loot box/i, /премиум/i];
    for (const re of words) {
      const m = raw.match(re);
      assert(!m, `в тексте игры слово «${m && m[0]}»: …${m && raw.slice(Math.max(0, m.index - 40), m.index + 60).replace(/\n/g, " ")}…`);
    }
    assert(/const Util\b/.test(code) && /rng\s*[:(]/.test(code), "Util.rng (RNG с seed) не найден");
    // Внешних ресурсов только Google Fonts.
    const hosts = [...new Set([...raw.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => new URL(m[0]).host))];
    for (const h of hosts) assert(/^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(h), "внешний ресурс: " + h);
  });

  // ---------- сайт ----------

  test("Сайт: docs/oborona-tablicy.html открывается с file:// без ошибок, карточка в индексе, sw.js кеширует страницу, манифест и иконки есть", async ({ page }) => {
    const docs = path.join(ROOT, "docs"), built = path.join(docs, "oborona-tablicy.html");
    assert(fs.existsSync(built), "docs/oborona-tablicy.html не собран: python3 tools/build_site.py");
    const html = fs.readFileSync(built, "utf8"), src = READ_SRC();
    assert(html.startsWith("<!doctype html>") && html.includes('<meta name="viewport"'), "обёртка документа");
    const body = src.slice(src.indexOf("</style>") + 8).trim();
    assert(html.includes(body.slice(0, 400)) && html.includes(body.slice(-400)) && html.includes(src.slice(0, src.indexOf("</style>"))),
      "собранная страница устарела относительно plan/oborona-tablicy.html: python3 tools/build_site.py");
    const sw = fs.readFileSync(path.join(docs, "sw.js"), "utf8");
    assert(/const CORE = \[[^\]]*"oborona-tablicy\.html"[^\]]*"manifest-tower\.webmanifest"[^\]]*"icons\/tower-512\.png"/.test(sw), "sw.js: страницы, манифеста или иконок нет в CORE");
    const mf = JSON.parse(fs.readFileSync(path.join(docs, "manifest-tower.webmanifest"), "utf8"));
    eq([mf.name, mf.start_url, mf.display], ["Оборона таблицы", "oborona-tablicy.html", "standalone"]);
    for (const i of mf.icons) assert(fs.existsSync(path.join(docs, i.src)), "нет иконки " + i.src);
    for (const f of ["tower-180.png", "tower-192.png", "tower-512.png"]) assert(fs.existsSync(path.join(docs, "icons", f)), "нет иконки " + f);
    assert(html.includes('rel="manifest" href="manifest-tower.webmanifest"'), "страница не ссылается на манифест");
    const index = fs.readFileSync(path.join(docs, "index.html"), "utf8");
    assert(/href="oborona-tablicy\.html"/.test(index) && index.includes("Оборона таблицы"), "в docs/index.html нет карточки игры");
    assert(/Оборона таблицы/.test(fs.readFileSync(path.join(docs, "README.md"), "utf8")), "в docs/README.md нет игры");

    await page.goto("file://" + built);
    await ready(page);
    eq(await page.title(), "Оборона таблицы");
    await run(page, () => { OT.manual(true); OT.newGame(); });
    assert(await page.isVisible("#scr-title") && await page.isVisible("#btn-play"), "титул не виден");
    eq(await page.isVisible("#rotate"), false, "#rotate на горизонтальном экране");
    await page.setViewportSize({ width: 600, height: 1024 });
    await page.waitForTimeout(100);
    assert(await page.isVisible("#rotate"), "в портрете нет #rotate");
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(100);
    // Игра на собранной странице работает: карта, уровень, волна по плану.
    await page.click("#btn-play");
    await page.click('#scr-map [data-level="1-0"]');
    await run(page, HELPERS);
    const st = await run(page, () => Q.win());
    assert(st.phase === "waveEnd", "волна на собранной странице: " + st.phase);
    // Главная страница: карточка ведёт на игру.
    await page.goto("file://" + path.join(docs, "index.html"));
    eq(await page.locator('a.card[href="oborona-tablicy.html"]').count(), 1, "карточка на главной");
  });

  test("Сайт: Google Fonts недоступны — собранная страница рисуется системным шрифтом, ошибок игры нет", async ({ page, errors, shot }) => {
    const built = path.join(ROOT, "docs", "oborona-tablicy.html");
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto("file://" + built);
    await ready(page);
    await run(page, () => { OT.manual(true); OT.newGame(); OT.loadLevel(1, 0); });
    // Заблокированные шрифты дают в консоли только «Failed to load resource»; это не ошибка игры.
    const own = errors.filter((e) => !/Failed to load resource|ERR_FAILED|ERR_BLOCKED/i.test(e));
    errors.length = 0;
    eq(own, [], "ошибки игры без шрифтов");
    const fam = await run(page, () => getComputedStyle(document.body).fontFamily);
    assert(/sans-serif|system-ui|Arial|Segoe|Roboto/i.test(fam), "нет системного запасного шрифта в font-family: " + fam);
    const labels = await run(page, () => { OT.setWave([56]); OT.placeTower("A0", 7); OT.placeTower("B0", 8); OT.link("A0", "B0"); return OT.drawn().labels.map((l) => l.text); });
    eq(labels, ["7 × 8 = 56"], "подпись луча рисуется без веб-шрифтов");
    assert(await run(page, () => document.documentElement.scrollWidth <= innerWidth), "горизонтальный скролл без шрифтов");
    await shot("etap4-bez-shriftov");
  });
}
