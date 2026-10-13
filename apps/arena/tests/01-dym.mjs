// Дым: страница, вкладки, окна шапки, кнопки не меньше 48 px, запоминание вкладки.
import { run, fresh, st, noHScroll } from "./_helpers.mjs";

const TABS = ["math", "read", "words", "games", "prog"];

export function register({ test, assert, eq }) {

  test("Дым 1: загрузка — OT есть, ключей прогресса нет, режим хранения local", async ({ page }) => {
    const r = await run(page, () => ({
      ot: typeof window.OT, fns: Object.keys(window.OT).sort(),
      keys: Object.keys(localStorage).filter((k) => k.startsWith("arena-v1-")),
      s: OT.state(),
    }));
    eq(r.ot, "object");
    eq(r.fns, ["close", "consts", "flush", "fn", "open", "play", "render", "reset", "save", "seed", "set", "setDate", "showTab", "state"], "14 функций верхнего уровня");
    eq(r.keys, [], "до первого действия в localStorage нет ключей арены");
    eq(r.s.tab, "math");
    eq(r.s.storeMode, "local");
    eq(Object.keys(r.s.docs).sort(), ["family", "math", "reading", "screen", "words"]);
    eq([r.s.docs.math.facts, r.s.docs.math.sessions, r.s.docs.words.prog, r.s.docs.words.sessions, r.s.docs.reading.runs], [{}, [], {}, [], []]);
    eq(r.s.overlay, null);
    eq(r.s.dateOverride, null, "без OT.setDate дата берётся из часов");
  });

  test("Дым 2: пять вкладок на 1280×800 и 390×844 — виден один раздел, без горизонтальной прокрутки", async ({ page, shot }) => {
    await fresh(page);
    for (const [w, h] of [[1280, 800], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const t of TABS) {
        await page.click("#tab-" + t);
        const r = await run(page, () => ({
          visible: ["math", "read", "words", "games", "prog"].filter((k) => !document.getElementById("view-" + k).hidden),
          sel: document.getElementById("tab-" + (OT.state().tab)).getAttribute("aria-selected"),
        }));
        eq(r.visible, [t], `${w}: виден только view-${t}`);
        eq(r.sel, "true");
        assert(await noHScroll(page), `${w}×${h}: горизонтальная прокрутка на вкладке ${t}`);
        await shot(`arena-${w}-${t}`);
      }
    }
  });

  test("Дым 3: все тренажёры открываются без ошибок и без горизонтальной прокрутки (390×844)", async ({ page, errors }) => {
    await fresh(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const kinds = [
      ["math", {}], ["nl", {}], ["df", { mode: "boss" }], ["df", { mode: "two" }], ["cm", { mode: "mix" }], ["wp", {}], ["race", {}],
      ["words", {}], ["hunt", { theme: "a" }], ["hunt", { theme: "b" }], ["fam", {}], ["quest", {}], ["play", { id: "pl-coach" }],
    ];
    for (const [kind, opts] of kinds) {
      const s = await run(page, ([k, o]) => { OT.reset(); return OT.play(k, o); }, [kind, opts]);
      const text = await run(page, () => document.querySelector("section:not([hidden])").innerText.trim());
      assert(text.length > 20, `${kind}: пустой экран`);
      assert(await noHScroll(page), `${kind}: горизонтальная прокрутка`);
      assert(s.tab === (["words", "hunt", "fam"].includes(kind) ? "words" : ["quest", "play"].includes(kind) ? "read" : "math"), `${kind}: не та вкладка ${s.tab}`);
    }
    // Чтение вслух: текст, «Начать чтение», «Дочитал».
    await run(page, () => OT.reset()); await page.click("#tab-read");
    await page.click('[data-tid="t-cat"]');
    await page.click("#r-start");
    await page.click("#r-stop");
    assert((await st(page)).ui.reading.view === "mark", "после «Дочитал» взрослый отмечает ошибки");
    assert(await noHScroll(page), "чтение: горизонтальная прокрутка");
    await run(page, () => OT.reset()); await page.click("#tab-read");
    // Таблица Шульте.
    await page.click("#sch-start");
    assert(await page.isVisible("#sch-grid"), "нет таблицы Шульте");
    assert(await noHScroll(page), "Шульте: горизонтальная прокрутка");
    // Суфлёр на весь экран.
    await run(page, () => OT.reset()); await run(page, () => OT.play("play", { id: "pl-coach" }));
    await page.click("#pl-prompter");
    eq((await st(page)).overlay, "prompter");
    await page.click("#pr-x");
    eq((await st(page)).overlay, null);
    // «Своя игра»: доска.
    await run(page, () => OT.reset()); await page.click("#tab-games");
    await page.click("#qz-start");
    eq((await st(page)).ui.quiz, true);
    assert(await page.isVisible(".qz-board"), "нет доски «Своей игры»");
    assert(await noHScroll(page), "«Своя игра»: горизонтальная прокрутка");
    eq(errors, [], "в консоли ошибок нет");
  });

  test("Дым 4: окна шапки — день, неделя, питомец, заметки открываются, закрываются кнопкой и клавишей Escape", async ({ page }) => {
    await fresh(page);
    const windows = [["#day-open", "day", "#day-x"], ["#wk-open", "week", "#wk-x"], ["#gem-btn", "pet", "#pet-x"], ["#note-btn", "notes", "#note-x"]];
    for (const [open, name, close] of windows) {
      await page.click(open);
      eq((await st(page)).overlay, name, `открылось окно ${name}`);
      await page.click(close);
      eq((await st(page)).overlay, null, `закрылось кнопкой ${name}`);
      await page.click(open);
      eq((await st(page)).overlay, name);
      await page.keyboard.press("Escape");
      eq((await st(page)).overlay, null, `закрылось Escape ${name}`);
    }
  });

  test("Дым 5: кнопки для ребёнка не меньше 48 px (390×844)", async ({ page }) => {
    await fresh(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const SCAN = () => {
      const out = [];
      const skip = (el) => el.closest("#view-prog") || el.closest(".q-del") || el.matches("[data-del], [data-qzdel], .x, input[type=checkbox]") || el.closest("details:not([open]) > :not(summary)");
      for (const el of document.querySelectorAll("button, a.btn, a.hdr-btn, [role=tab]")) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || skip(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        if (r.height < 47.9) out.push((el.id ? "#" + el.id : el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ").join(".") : "")) + " " + (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24) + " = " + Math.round(r.height * 10) / 10);
      }
      return out;
    };
    const small = [];
    const scan = async (label) => { for (const s of await run(page, SCAN)) small.push(label + ": " + s); };
    await scan("Счёт, главная");
    await run(page, () => OT.play("math")); await scan("раунд таблицы");
    await run(page, () => { OT.reset(); OT.play("df", { mode: "boss" }); }); await scan("опорные факты");
    await run(page, () => { OT.reset(); OT.play("cm", { mode: "mix" }); }); await scan("часы и деньги");
    await run(page, () => { OT.reset(); OT.play("wp"); }); await scan("задачи");
    await run(page, () => { OT.reset(); OT.play("race"); }); await scan("гонка");
    await run(page, () => { OT.reset(); OT.showTab("words"); }); await scan("слова: диктант");
    for (const m of ["hunt", "fam"]) { await page.click(`[data-wm="${m}"]`); await scan("слова: " + m); }
    await run(page, () => { OT.reset(); OT.play("words"); }); await scan("диктант, раунд");
    await run(page, () => { OT.reset(); OT.play("hunt", { theme: "a" }); }); await scan("охота A");
    await run(page, () => { OT.reset(); OT.play("fam"); }); await scan("семейка");
    await run(page, () => { OT.reset(); OT.showTab("read"); }); await scan("чтение");
    await run(page, () => { OT.reset(); OT.play("quest"); }); await scan("квест");
    await run(page, () => { OT.reset(); OT.play("play", { id: "pl-coach" }); }); await scan("суфлёр");
    // Суфлёр на весь экран, бегущий режим: «−» и «+» не уже 48 px.
    await page.click("#pl-prompter"); await page.click("#pr-auto"); await scan("суфлёр на экране");
    for (const s of await run(page, () => [...document.querySelectorAll("#prompter .pr-btn")].map((b) => [b.id, b.getBoundingClientRect().width]).filter(([, w]) => w < 47.9).map(([id, w]) => "#" + id + " шириной " + Math.round(w)))) small.push("суфлёр на экране: " + s);
    await page.click("#pr-x");
    await run(page, () => { OT.reset(); OT.showTab("games"); }); await scan("матчи");
    for (const [open, name] of [["#day-open", "день"], ["#wk-open", "неделя"], ["#gem-btn", "питомец"], ["#note-btn", "заметки"]]) {
      await run(page, () => OT.reset());
      if (name === "питомец") { await run(page, () => OT.set("family", { pet: { kind: "cat", name: "Кот" } })); }
      if (name === "заметки") { await run(page, () => OT.set("family", { notes: [{ id: "n1", ts: 1, d: "2026-10-12", kind: "idea", text: "x", where: "", done: false, reply: "", seen: true }] })); }
      await page.click(open); await scan("окно: " + name);
    }
    eq(small, [], "кнопки ниже 48 px");
  });

  test("Дым 7: ссылки на три игры в шапке и на вкладке «Матчи» ведут на Блокоград, Оборону и Ферму", async ({ page }) => {
    await run(page, () => OT.reset());
    const hdr = await page.$$eval("header a.hdr-btn", (as) => as.map((a) => a.getAttribute("href")));
    assert(hdr.some((h) => h.includes("6DiGYA6FVP3AJzrWKQjhSw")), "в шапке есть Блокоград");
    assert(hdr.some((h) => h.endsWith("/oborona-tablicy.html")), "в шапке есть Оборона таблицы");
    assert(hdr.some((h) => h.endsWith("/ferma.html")), "в шапке есть Ферма у реки");
    await run(page, () => OT.showTab("games"));
    const rows = await page.$$eval("#view-games .game-row", (rs) => rs.map((r) => ({ name: r.querySelector("b").textContent, href: r.querySelector("a").getAttribute("href"), h: r.querySelector("a").getBoundingClientRect().height })));
    eq(rows.map((r) => r.name.replace(/^\S+\s/, "")), ["Блокоград", "Оборона таблицы", "Ферма у реки"], "три игры по порядку");
    assert(rows.every((r) => r.h >= 48), "кнопки «Играть» не ниже 48 px");
    assert(rows[1].href.endsWith("/oborona-tablicy.html") && rows[2].href.endsWith("/ferma.html"), "адреса игр на сайте");
  });

  test("Дым 6: вкладка запоминается, #prog в адресе открывает «Прогресс», во время раунда вкладки заперты", async ({ page }) => {
    await fresh(page);
    await run(page, () => OT.showTab("words"));
    await page.reload();
    await page.waitForFunction(() => window.OT && OT.state);
    eq((await st(page)).tab, "words", "после перезагрузки та же вкладка");
    await page.goto(page.url().split("#")[0] + "#prog");
    await page.reload();
    await page.waitForFunction(() => window.OT && OT.state);
    eq((await st(page)).tab, "prog", "адрес #prog");
    await fresh(page);
    await run(page, () => OT.play("math"));
    await page.click("#tab-read");
    eq((await st(page)).tab, "math", "во время раунда таблицы вкладки заперты");
    await run(page, () => { OT.reset(); OT.play("words"); });
    await page.click("#tab-prog");
    eq((await st(page)).tab, "words", "во время диктанта вкладки заперты");
  });
}
