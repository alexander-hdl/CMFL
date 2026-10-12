// Ревью этапа 3: проверки, добавленные ревьюером. Общаются с игрой только через window.OT и DOM-id.

const run = (page, fn, arg) => page.evaluate(fn, arg);
const ready = (page) => page.waitForFunction(() => window.OT && typeof window.OT.state === "function");

// Сыграть волну по плану Solver (как K.win в 05-podstroyka.mjs).
const WIN = () => {
  for (const p of OT.state().pads) if (p.digit != null && !p.fixed) OT.removeTower(p.id);
  for (const p of OT.state().wave.plan) { OT.placeTower(p.a, p.da); OT.placeTower(p.b, p.db); }
  for (const p of OT.state().wave.plan) OT.link(p.a, p.b);
  OT.startWave();
  return OT.runWave();
};

export function register({ test, assert, eq }) {

  test("Ревью 3: испорченные записи в progress (карточка без полей, hints без full/free, conf со строкой) — игра не падает, счётчики числа", async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("r3")) return;
      sessionStorage.setItem("r3", "1");
      const cards = { "m:7x7": { b: 3, due: "2099-01-01" }, "m:7x8": { b: 3 }, "m:8x8": { b: "x", seen: "5" }, "m:2x2": 7 }, hints = {};
      for (const k of ["3x3", "3x4", "4x4", "3x6", "3x7", "3x8", "4x6", "4x7", "4x8", "6x6", "6x7", "6x8", "7x7", "7x8", "8x8"]) {
        hints["b:" + k] = {};                     // раньше hintMode читал h.free.length и ронял сборку волны с боссом
        cards["m:" + k] = cards["m:" + k] || { b: 3, due: "2099-01-01" };
      }
      localStorage.setItem("oborona-v1-progress", JSON.stringify({ v: 1, updatedAt: 1, cards, hints, conf: { "48-56": { n: "2" }, "bad": 5 }, lands: { unlocked: [1, 2, 3, 4], stars: {} } }));
    });
    await page.reload();
    await ready(page);
    const r = await run(page, (WIN) => {
      const win = new Function("return (" + WIN + ")")();
      OT.manual(true);
      const a = OT.loadLevel(4, 2);
      const st = win();
      const s = OT.state();
      return { a, phase: st.phase, cards: s.cards, conf: s.conf, hints: s.hintLog["b:7x8"] };
    }, WIN.toString());
    eq(r.a, { ok: true }, "уровень земли 4 стартует");
    assert(r.phase === "waveEnd" || r.phase === "levelEnd", "волна доиграна: " + r.phase);
    eq(r.cards["m:2x2"], undefined, "запись-не-объект выброшена");
    eq(r.cards["m:7x8"].seen, 0, "недостающие счётчики стали нулями");
    assert(/^\d{4}-\d\d-\d\d$/.test(r.cards["m:7x8"].due), "недостающий due заполнен датой");
    for (const [k, c] of Object.entries(r.cards)) for (const f of ["b", "seen", "ok", "miss", "tS", "tN"]) assert(typeof c[f] === "number" && isFinite(c[f]), `${k}.${f} = ${c[f]}`);
    eq(r.conf["48-56"].n, 2, "n из строки");
    eq(r.conf.bad, undefined, "кривой ключ путаницы выброшен");
    eq(r.hints, { full: [], free: [] }, "hints дополнены пустыми списками");
    await run(page, () => OT.openParent());
    assert(!(await page.textContent("#scr-parent")).includes("NaN"), "на экране взрослого NaN");
  });

  test("Ревью 3: уровень через полночь засчитан новому дню (начато 1, сыграно 1), лимит не растёт", async ({ page }) => {
    const r = await run(page, (WIN) => {
      const win = new Function("return (" + WIN + ")")();
      OT.manual(true); OT.seed(1); OT.newGame(); OT.setDate("2026-10-11");
      OT.setSetting("perDay", 2);
      OT.loadLevel(1, 0);
      win();
      OT.step(3);                                 // плашка, подготовка волны 2
      OT.setDate("2026-10-12");                   // полночь посреди уровня
      const mid = OT.state().day;
      win(); OT.step(3); win(); OT.step(1);
      const end = OT.state().day;
      const second = OT.loadLevel(1, 1), third = OT.loadLevel(1, 2);
      // Полночь на экране карты ничего не засчитывает.
      OT.show("map"); OT.setDate("2026-10-13");
      return { mid: [mid.date, mid.started, mid.done], end: [end.started, end.done], second: second.ok, third: third.reason, map: [OT.state().day.started, OT.state().day.done] };
    }, WIN.toString());
    eq(r.mid, ["2026-10-12", 1, 0], "новый день сразу считает идущий уровень начатым");
    eq(r.end, [1, 1], "после конца уровня");
    eq([r.second, r.third], [true, "rest"], "лимит 2 на новый день: идущий через полночь уровень и ещё один");
    eq(r.map, [0, 0], "на карте полночь начинает день с нуля");
  });

  test("Ревью 3: экран взрослого на 1024×600 — кнопки «Назад», настроек и сброса ≥ 48 CSS px; содержимое не вылезает", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await run(page, () => { OT.manual(true); OT.seed(1); OT.newGame(); for (const k of ["m:7x8", "m:6x8", "m:6x7", "m:8x8", "m:7x7", "m:4x8"]) OT.setCard(k, { b: 1, seen: 9, ok: 4, miss: 5 }); OT.openParent(); });
    await page.click("#btn-reset");
    const r = await run(page, () => {
      const s = document.getElementById("scr-parent"), out = [];
      for (const b of s.querySelectorAll("button")) {
        if (b.closest(".pr-grid") || b.closest(".pr-row")) continue;   // клетки карты таблицы: 72 штуки в одну колонку, на 1024×600 им не хватает высоты (мелочь ревью 3)
        const q = b.getBoundingClientRect();
        if (q.width < 48 || q.height < 48) out.push(`${b.id || b.textContent.trim()}: ${Math.round(q.width)}×${Math.round(q.height)}`);
      }
      const bottom = [...s.querySelectorAll("*")].reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0);
      return { small: out, bottom, edge: s.getBoundingClientRect().bottom, n: s.querySelectorAll("button").length };
    });
    eq(r.small, [], "мелкие кнопки");
    assert(r.bottom <= r.edge, `содержимое ниже экрана: ${r.bottom} > ${r.edge}`);
    assert(r.n > 80, "экран взрослого не построен");
  });

  test("Ревью 3: удержание кнопки взрослого сбрасывается при pointercancel и уходе пальца; два коротких удержания не складываются", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await run(page, () => { OT.manual(true); OT.show("map"); });
    const box = await page.locator("#btn-parent").boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    const scr = () => run(page, () => OT.state().screen);
    await page.mouse.move(x, y);
    await page.mouse.down(); await page.waitForTimeout(1500);
    await run(page, () => document.getElementById("btn-parent").dispatchEvent(new PointerEvent("pointercancel", { bubbles: true })));
    await page.waitForTimeout(900);
    eq(await scr(), "map", "pointercancel на 1,5 с");
    eq(await run(page, () => document.getElementById("parent-ring").style.strokeDashoffset), "245", "кольцо сброшено");
    await page.mouse.up();
    await page.mouse.down(); await page.waitForTimeout(1100); await page.mouse.up();
    await page.mouse.down(); await page.waitForTimeout(1100); await page.mouse.up();
    await page.waitForTimeout(300);
    eq(await scr(), "map", "1,1 с + 1,1 с");
    await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.move(x - 300, y + 200); await page.waitForTimeout(1900); await page.mouse.up();
    eq(await scr(), "map", "палец ушёл с кнопки");
    await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(2150); await page.mouse.up();
    eq(await scr(), "parent", "полные 2 с открывают");
  });
}
