// Тренировка дня, гемы, питомец, «Моя неделя», «Мои заметки», сводка для логопеда.
import { run, fresh, st, mathAnswer, waitMathStep, waitMathEnd, waitState, addDays, TODAY } from "./_helpers.mjs";

const TEXT = (page, sel) => run(page, (sel) => document.querySelector(sel).innerText, sel);
const session = (d, extra = {}) => Object.assign({ d, n: 15, ok: 12, med: 3000, op: "m" }, extra);

export function register({ test, assert, eq }) {

  test("День 1: состав и порядок шагов — math, words, move, (часы | задачи | факты), read; на три дня все три прикладных", async ({ page }) => {
    await fresh(page);
    const C = await run(page, () => OT.consts());
    assert((await TEXT(page, "#day-strip")).includes("7–10 минут"), "на кнопке «7–10 минут»");
    const applied = [], moves = new Set();
    for (let d = 0; d < 3; d++) {
      await run(page, (day) => { OT.close(); OT.setDate(day); OT.open("day"); }, addDays(TODAY, d));
      const s = await st(page);
      const steps = s.daily.plan.steps.map((x) => x.k);
      eq([steps[0], steps[1], steps[2], steps[4]], ["math", "words", "move", "read"]);
      applied.push(steps[3]);
      eq(s.daily.plan.moves.length, 3);
      assert(new Set(s.daily.plan.moves).size === 3 && s.daily.plan.moves.every((m) => C.MOVES.includes(m)), "3 разных упражнения из MOVES");
      s.daily.plan.moves.forEach((m) => moves.add(m));
      const text = await TEXT(page, "#day-ov");
      for (const t of ["6 примеров", "4 слова", "2 минуты движения"]) assert(text.includes(t), `в окне дня нет «${t}»`);
    }
    eq(applied.slice().sort(), ["cm", "df", "wp"], "за три дня прикладное задание — по разу каждое");
  });

  test("День 2: весь путь с «Дальше» — 6 примеров, 4 слова, перемена, пропуск, 2 страницы квеста; потом обычный раунд из 15", async ({ page }) => {
    await fresh(page);
    await page.click("#day-open");
    await page.click("#day-go");
    let s = await st(page);
    eq([s.tab, s.ui.math.round.items.length], ["math", 6], "в тренировке дня 6 примеров");
    for (let i = 0; i < 6; i++) { await mathAnswer(page); if (i < 5) await waitMathStep(page, i + 1); }
    await waitMathEnd(page);
    s = await st(page);
    assert(s.pill && s.pill.includes("Дальше: Слова"), "плашка «Дальше: Слова», а не " + s.pill);
    await page.click("#day-pill");
    await page.click("#day-go");
    s = await st(page);
    eq([s.tab, s.ui.words.round.items.length], ["words", 4], "в тренировке дня 4 слова");
    for (let i = 0; i < 4; i++) { await page.click("#w-check"); await page.click("#w-ok"); }
    s = await st(page);
    assert(s.pill && s.pill.includes("Дальше: Перемена"), "плашка «Дальше: Перемена», а не " + s.pill);
    await page.click("#day-pill");
    await page.click("#day-moved");
    await page.click("#day-skip");                                  // прикладное задание пропущено
    await page.click('[data-dread="quest"]');
    await page.click("[data-go]");                                  // первая страница уже в счёте, вторая после перехода
    s = await st(page);
    eq(s.daily.plan.fin, true, "тренировка дня доведена до конца");
    eq(s.pill, "✓ Тренировка дня готова!");
    assert((await TEXT(page, "#day-strip")).includes("✓ Тренировка дня сделана"));
    assert(s.gems.today >= 10, "гемов за день: " + s.gems.today);
    eq(s.daily.plan.steps.map((x) => x.done ? "done" : x.skip ? "skip" : "open"), ["done", "done", "done", "skip", "done"]);
    await page.click("#tab-math");
    await page.click("#m-again");
    eq((await st(page)).ui.math.round.items.length, 15, "обычный раунд снова из 15");
  });

  test("День 3: тренировка берёт то, что пора повторить — трудные примеры и слова «пора» попадают в шесть и в четыре", async ({ page }) => {
    await fresh(page);
    const keys = await run(page, (today) => {
      const pairs = OT.consts().PAIRS.map((p) => OT.fn.factKey("m", p[0], p[1]));
      const facts = {}, tomorrow = OT.fn.addDays(today, 1);
      pairs.slice(0, 3).forEach((k) => { facts[k] = { b: 1, n: 2, ok: 1, due: today }; });             // трудные на сегодня
      pairs.slice(3, 7).forEach((k) => { facts[k] = { b: 3, n: 3, ok: 3, due: today, up: "2026-10-01" }; });   // знакомые, пора
      pairs.slice(7, 31).forEach((k) => { facts[k] = { b: 3, n: 3, ok: 3, due: tomorrow, up: "2026-10-01" }; }); // знакомые, не пора
      OT.set("math", { facts });
      const ids = OT.consts().STARTER.map((w) => w.id), prog = {};
      ids.slice(0, 2).forEach((id) => { prog[id] = { b: 1, n: 2, ok: 1, due: today }; });
      ids.slice(2).forEach((id) => { prog[id] = { b: 3, n: 3, ok: 3, due: tomorrow }; });
      OT.set("words", { prog });
      return { hard: pairs.slice(0, 3), notDue: pairs.slice(7, 31), dueWords: ids.slice(0, 2) };
    }, TODAY);
    const bad = [];
    for (let seed = 1; seed <= 20; seed++) {
      const r = await run(page, (seed) => {
        OT.seed(seed);
        const m = OT.play("math", { daily: true }).ui.math.round.items.map((i) => i.k);
        const w = OT.play("words", { daily: true }).ui.words.round.items.map((i) => i.id);
        return { m, w };
      }, seed);
      const hardIn = r.m.filter((k) => keys.hard.includes(k)).length, stale = r.m.filter((k) => keys.notDue.includes(k));
      if (r.m.length !== 6 || hardIn < 2 || stale.length) bad.push(["math", seed, r.m.length, hardIn, stale]);
      if (r.w.length !== 4 || !keys.dueWords.every((id) => r.w.includes(id))) bad.push(["words", seed, r.w]);
    }
    eq(bad, [], "тренировка дня пропустила то, что пора повторить");
  });

  test("День 4: шаг засчитывается по счётчику, план переживает перезагрузку, на следующий день плана нет", async ({ page }) => {
    await fresh(page);
    await run(page, () => { OT.open("day"); OT.close(); });
    const plan0 = (await st(page)).daily.plan;
    eq(plan0.steps.map((x) => x.done), [false, false, false, false, false]);
    await run(page, (d) => OT.set("words", { sessions: [{ d, n: 4, ok: 4, cat: "all" }] }), TODAY);
    let s = await st(page);
    eq(s.daily.plan.steps.map((x) => x.done), [false, true, false, false, false], "шаг слов засчитан по счётчику");
    await page.reload();
    await page.waitForFunction(() => window.OT && OT.state);
    s = await st(page);
    eq(s.daily.plan.steps.map((x) => x.done), [false, true, false, false, false], "после перезагрузки тот же план");
    eq([s.daily.plan.at, s.daily.plan.moves], [plan0.at, plan0.moves]);
    assert((await TEXT(page, "#day-strip")).includes("шаг 2 из 5"), "кнопка показывает шаг 2 из 5");
    await run(page, (d) => OT.setDate(d), addDays(TODAY, 1));
    s = await st(page);
    eq(s.daily.plan, null, "на новый день плана нет");
    assert((await TEXT(page, "#day-strip")).includes("▶ Тренировка дня"), "снова «▶ Тренировка дня»");
  });

  test("День 5: гемы — за занятия не больше 30 в день, трофеи сверх лимита, обрезка журнала гемы не отнимает", async ({ page }) => {
    await fresh(page);
    const yesterday = addDays(TODAY, -1);
    const many = (d) => Array.from({ length: 20 }, () => session(d));
    await run(page, ([a, b]) => OT.set("math", { sessions: a.concat(b) }), [many(TODAY), many(yesterday)]);
    let g = (await st(page)).gems;
    eq([g.today, g.earned], [30, 60], "сегодня 30 из 40, вчера отдельно 30");
    eq(await TEXT(page, "#gem-count"), "60");
    const two = { "m:2x2": { b: 4, n: 4, ok: 4, due: TODAY, up: TODAY }, "m:2x3": { b: 4, n: 4, ok: 4, due: TODAY, up: TODAY } };
    await run(page, (f) => OT.set("math", { facts: f }), two);
    g = (await st(page)).gems;
    eq(g.earned, 70, "2 трофея = +10 сверх лимита");
    await run(page, () => OT.set("math", { sessions: [] }));
    g = (await st(page)).gems;
    eq(g.earned, 70, "журнал обрезан, заработанное осталось");
    eq(await TEXT(page, "#gem-count"), "70");
  });

  test("День 6: гемы тратятся только на питомца; питомец не грустит; стадии роста 0/150/450", async ({ page }) => {
    await fresh(page);
    await run(page, (d) => OT.set("math", { sessions: Array.from({ length: 10 }, () => ({ d, n: 15, ok: 12, med: 3000, op: "m" })) }), TODAY);
    await page.click("#gem-btn");
    await page.click('[data-pk="cat"]');
    assert((await TEXT(page, "#pet-ov")).includes("Сначала придумай имя."), "без имени питомца не выбрать");
    await page.fill("#pet-name", "Мурка");
    await page.click('[data-pk="cat"]');
    let s = await st(page);
    eq([s.docs.family.pet.kind, s.docs.family.pet.name], ["cat", "Мурка"]);
    eq(s.gems.balance, 20, "10 раундов = 20 гемов");
    const screenBefore = s.docs.screen;
    assert(await page.isDisabled('[data-buy="wizard"]'), "колпак за 50 не по карману");
    assert(!(await page.isDisabled('[data-buy="cap"]')), "кепка за 20 по карману");
    await page.click('[data-buy="cap"]');
    s = await st(page);
    eq([s.gems.balance, s.gems.spent, s.docs.family.pet.wear.hat], [0, 20, "cap"], "кепка куплена и надета");
    eq(s.docs.screen, screenBefore, "гемы не трогают «Матчи»");
    eq(await page.locator('[data-buy="cap"]').count(), 0, "купленное второй раз не продаётся: вместо цены «Снять»");
    const t = await run(page, () => document.getElementById("pet-ov").textContent);
    assert(!/матч|экран/i.test(t), "в окне питомца нет слов про матчи и экран");
    await page.click("#pet-x");
    await page.click("#tab-games");
    const games = (await TEXT(page, "#view-games")).toLowerCase();
    assert(!games.includes("💎") && !games.includes("гем"), "на «Матчах» про гемы ни слова");
    // Два месяца без занятий: питомец не грустит, не болеет, не голодает.
    await run(page, (d) => OT.setDate(d), addDays(TODAY, 60));
    await page.click("#gem-btn");
    const later = await run(page, () => document.getElementById("pet-ov").textContent);
    assert(!/грус|скуч|голод|бол[её]|плач/i.test(later), "питомец грустит: " + later.slice(0, 200));
    const stages = await run(page, () => [0, 149, 150, 449, 450].map((n) => OT.fn.petStage(n).n));
    eq(stages, ["Малыш", "Малыш", "Подросток", "Подросток", "Взрослый"]);
  });

  test("День 7: «Моя неделя» — цель, выполнение, итоги в воскресенье, новая неделя с прошлыми итогами", async ({ page }) => {
    await fresh(page);                                                // понедельник 12 октября
    await page.click("#wk-open");
    assert((await TEXT(page, "#week-ov")).includes("Выбери одну цель"));
    await page.locator("[data-wgo]", { hasText: "4 раунда" }).click();
    await page.click("#wk-x");
    let s = await st(page);
    const ws = "2026-10-12", goal = s.docs.family.week.goals[ws];
    eq([goal.k, goal.target], ["math", 4]);
    assert((await TEXT(page, "#week-strip")).includes("Цель недели"));
    await run(page, (d) => OT.set("math", { sessions: Array.from({ length: 4 }, () => ({ d, n: 15, ok: 12, med: 3000, op: "m" })) }), TODAY);
    s = await st(page);
    eq(s.docs.family.week.goals[ws].hit, true, "цель взята");
    assert((await TEXT(page, "#week-strip")).includes("🎉 Цель выполнена"));
    eq(s.gems.earned, 4 * 2 + 15, "4 раунда по 2 гема и 15 за цель недели");
    // Воскресенье: «подведи итоги», пока нет записи «горжусь».
    await run(page, () => OT.setDate("2026-10-18"));
    assert(await page.isVisible("#week-strip .wk-late"), "в воскресенье нужна подсказка «подведи итоги»");
    await page.click("#wk-open");
    await page.fill("#wk-proud", "сам выключил игру в среду");
    await page.click("#wk-save");
    assert((await TEXT(page, "#week-ov")).includes("Сохранено."));
    await page.click("#wk-x");
    eq(await page.locator("#week-strip .wk-late").count(), 0, "после записи подсказки нет");
    // Понедельник: новая неделя без цели, в прошлых неделях — «Горжусь».
    await run(page, () => OT.setDate("2026-10-19"));
    assert((await TEXT(page, "#week-strip")).includes("Выбери цель на эту неделю"));
    await page.click("#wk-open");
    const t = await TEXT(page, "#week-ov");
    assert(t.includes("Прошлые недели") && t.includes("Горжусь: сам выключил игру в среду"), "прошлая неделя с записью");
    assert(t.includes("✓ Пройти 4 раунда"), "прошлая цель отмечена выполненной");
  });

  test("День 8: «Мои заметки» — запись, ответ взрослого, значок, «Сделано», удаление в два нажатия", async ({ page }) => {
    await fresh(page);
    await page.click("#note-btn");
    await page.click("#note-add");
    assert((await TEXT(page, "#note-ov")).includes("Напиши хотя бы пару слов."));
    await page.click('[data-nk="idea"]');
    await page.fill("#note-text", "Хочу игру про космос");
    await page.click("#note-add");
    let n = (await st(page)).docs.family.notes;
    eq([n.length, n[0].kind, n[0].text, n[0].where], [1, "idea", "Хочу игру про космос", "Счёт"]);
    assert((await TEXT(page, "#note-ov")).includes("Записано! Спасибо, тестировщик."));
    await page.click("#note-x");
    // Взрослый отвечает на «Прогрессе».
    await page.click("#tab-prog");
    const reply = page.locator("[data-nrep]");
    await reply.fill("Хорошая идея, подумаем");
    await reply.dispatchEvent("change");
    eq(await TEXT(page, "#note-badge"), "1");
    assert(await page.isVisible("#note-badge"), "значок ответа виден");
    await page.click("#note-btn");
    assert((await TEXT(page, "#note-ov")).includes("Ответ взрослого: Хорошая идея, подумаем"), "ответ виден ребёнку");
    await page.click("#note-x");
    assert(!(await page.isVisible("#note-badge")), "прочитал — значок скрыт");
    await page.click("[data-ndone]");
    assert((await run(page, () => OT.state().docs.family.notes[0].done)), "отмечено «Сделано»");
    await page.click("#note-btn");
    assert((await TEXT(page, "#note-ov")).includes("✓ Сделано"));
    await page.click("[data-ndel]");
    assert((await TEXT(page, "#note-ov")).includes("Точно удалить?"));
    eq((await st(page)).docs.family.notes.length, 1, "после первого нажатия заметка на месте");
    await page.click("[data-ndel]");
    eq((await st(page)).docs.family.notes.length, 0, "после второго удалена");
  });

  test("День 9: сводка для логопеда — разделы, период, копирование и запасной вариант", async ({ page }) => {
    await fresh(page);
    const days = Array.from({ length: 10 }, (_, i) => addDays(TODAY, -i));
    await run(page, ([days, today]) => {
      OT.set("math", { sessions: days.map((d) => ({ d, n: 15, ok: 13, med: 3000, op: "m" })) });
      OT.set("words", { sessions: days.slice(0, 6).map((d) => ({ d, n: 8, ok: 6, cat: "all" })) });
      OT.set("reading", { runs: days.slice(0, 3).map((d, i) => ({ d, tid: "t-cat", wcpm: 60 + i * 5, err: 2, sec: 60, words: 60 })) });
    }, [days, TODAY]);
    await page.click("#tab-prog");
    await page.fill("#rp-obs", "Пропускает буквы в конце слова");
    await page.fill("#rp-qs", "Какие слова добавить?");
    await page.click('[data-rpd="14"]');
    await page.click("#rp-build");
    const text = await TEXT(page, "#rp-text");
    for (const h of ["РЕГУЛЯРНОСТЬ", "ЧТЕНИЕ", "ПИСЬМО И ОРФОГРАФИЯ", "СЧЁТ", "ЧТО МЫ ЗАМЕЧАЕМ ДОМА", "НАШИ ВОПРОСЫ"]) assert(text.includes(h), "нет раздела " + h);
    assert(text.includes("Дней с занятиями: 10 из 14"), "регулярность за 14 дней: " + text.slice(0, 300));
    assert(text.includes("Пропускает буквы в конце слова") && text.includes("Какие слова добавить?"));
    // Копирование: подменённый буфер, затем отказ.
    await run(page, () => {
      window.__clipFail = false; window.__clip = null;
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t) => window.__clipFail ? Promise.reject(new Error("denied")) : (window.__clip = t, Promise.resolve()) } });
    });
    await page.click("#rp-copy");
    await waitState(page, () => window.__clip !== null);
    const same = await run(page, () => window.__clip === document.getElementById("rp-text").textContent);
    assert(same, "в буфер ушёл тот же текст");
    eq(await TEXT(page, "#rp-msg"), "Скопировано.");
    await run(page, () => { window.__clipFail = true; });
    await page.click("#rp-copy");
    await waitState(page, () => document.getElementById("rp-msg").textContent.includes("выделен"));
    eq(await TEXT(page, "#rp-msg"), "Текст выделен — скопируйте его.");
  });
}
