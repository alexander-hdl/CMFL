// Счёт: Лейтнер, раунд таблицы, подбор примеров, опорные факты, часы и деньги, гонка, задачи, числовая прямая.
import { run, fresh, st, typeNumber, mathAnswer, waitMathStep, waitMathEnd, waitState, addDays, TODAY } from "./_helpers.mjs";

const TEXT = (page) => run(page, () => document.getElementById("view-math").innerText);

export function register({ test, assert, eq }) {

  test("Счёт 1: интервалы Лейтнера 0/1/3/7/14 дней, ошибка возвращает в ящик 1", async ({ page }) => {
    await fresh(page);
    const r = await run(page, (today) => {
      const out = { consts: OT.consts().INTERVALS, up: [], miss: [], newFast: null, newSlow: null };
      for (let b = 1; b <= 5; b++) {
        const s = OT.fn.leitnerMath({ b, n: 3, ok: 3, up: "2026-10-01", due: "2026-10-01" }, true, 1000, today);
        out.up.push([b, s.b, s.due]);
        const m = OT.fn.leitnerMath({ b, n: 3, ok: 3, up: "2026-10-01" }, false, 1000, today);
        out.miss.push([b, m.b, m.due]);
      }
      out.newFast = OT.fn.leitnerMath(null, true, 3000, today);
      out.newSlow = OT.fn.leitnerMath(null, true, 6000, today);
      return out;
    }, TODAY);
    eq(r.consts, { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 });
    const iv = r.consts;
    for (const [from, to, due] of r.up) {
      const expect = Math.min(5, from + 1);
      eq([to, due], [expect, addDays(TODAY, iv[expect])], `ящик ${from} → ${expect}`);
    }
    for (const [from, to, due] of r.miss) eq([to, due], [1, TODAY], `ошибка в ящике ${from}`);
    eq([r.newFast.b, r.newFast.due], [2, addDays(TODAY, 1)], "новый факт быстро — ящик 2, завтра");
    eq([r.newSlow.b, r.newSlow.due], [1, TODAY], "новый факт медленно — ящик 1, сегодня");
    // Слова: те же интервалы.
    const w = await run(page, (today) => [1, 2, 3, 4].map((b) => { const s = OT.fn.leitnerWord({ b, n: 1, ok: 1 }, true, today); return [s.b, s.due]; }), TODAY);
    eq(w, [[2, addDays(TODAY, 1)], [3, addDays(TODAY, 3)], [4, addDays(TODAY, 7)], [5, addDays(TODAY, 14)]]);
  });

  test("Счёт 2: ящик растёт раз в день и только при уверенном ответе; «освоен» — не раньше трёх разных дней", async ({ page }) => {
    await fresh(page);
    const r = await run(page, (today) => {
      const L = OT.fn.leitnerMath, add = OT.fn.addDays, out = {};
      // Тот же день дважды: второй ответ ящик не поднимает.
      let s = { b: 2, n: 2, ok: 2, up: "2026-10-01" };
      s = L(s, true, 1000, today); out.first = s.b;
      s = L(s, true, 1000, today); out.second = s.b;
      // Медленный ответ не поднимает: 6000 мс на ящике 2, 4000 мс на ящиках 3 и выше (порог 3500).
      out.slow2 = L({ b: 2, n: 2, ok: 2, up: "2026-10-01" }, true, 6000, today).b;
      out.slow3 = L({ b: 3, n: 2, ok: 2, up: "2026-10-01" }, true, 4000, today).b;
      out.edge3 = L({ b: 3, n: 2, ok: 2, up: "2026-10-01" }, true, 3500, today).b;
      out.edge2 = L({ b: 2, n: 2, ok: 2, up: "2026-10-01" }, true, 5000, today).b;
      // Новый факт за 3 с: ящик 2 и отметка «поднят сегодня».
      const f = L(null, true, 3000, today); out.newB = f.b; out.newUp = f.up;
      // Трёхдневный путь: D, D (второй раз в тот же день), D+1, D+2.
      const D = today, days = [D, D, add(D, 1), add(D, 2)];
      s = null; out.path = [];
      for (const d of days) { s = L(s, true, 1000, d); out.path.push(s.b); }
      return out;
    }, TODAY);
    eq([r.first, r.second], [3, 3], "тот же день: +1 только один раз");
    eq([r.slow2, r.slow3, r.edge3, r.edge2], [2, 3, 4, 3], "пороги 5000 мс и 3500 мс");
    eq([r.newB, r.newUp], [2, TODAY], "новый факт: ящик 2 и up = сегодня");
    eq(r.path, [2, 2, 3, 4], "ящик 4 впервые на третий день");
  });

  test("Счёт 3: раунд таблицы на странице — ошибка показывает пример и возвращает его позже, секунд нет", async ({ page }) => {
    await fresh(page);
    await run(page, () => OT.play("math", { items: [[7, 8, "m"], [6, 6, "m"], [9, 3, "m"]] }));
    const texts = [await TEXT(page)];
    await mathAnswer(page, false);                                   // ошибка в первом примере
    let s = await st(page);
    eq(s.ui.math.round.phase, "copy");
    assert((await TEXT(page)).includes("56"), "в фазе «Почти» должен быть виден верный ответ 56");
    texts.push(await TEXT(page));
    eq(s.ui.math.round.items.length, 4, "повтор вставлен");
    eq([s.ui.math.round.items[3].again, s.ui.math.round.items[3].k], [true, "m:7x8"], "повтор в конце (i + 3)");
    await typeNumber(page, "#m-pad", 55);                            // неверно в фазе «Почти» — ввод стирается
    eq((await st(page)).ui.math.round.phase, "copy", "нужен верный ввод");
    await mathAnswer(page, true);                                    // верный ввод идёт дальше
    for (let i = 1; i <= 3; i++) {
      await waitMathStep(page, i);
      texts.push(await TEXT(page));
      await mathAnswer(page);
    }
    await waitMathEnd(page);
    texts.push(await TEXT(page));
    for (const t of texts) assert(!/\d+,\d\s*с(?![а-яё])/.test(t), "в раунде не должно быть секунд: " + t.slice(0, 80));
    s = await st(page);
    eq(s.docs.math.sessions.length, 1);
    eq([s.docs.math.sessions[0].n, s.docs.math.sessions[0].ok], [4, 3], "4 ответа, 3 верных");
    const f = s.docs.math.facts;
    eq([f["m:7x8"].b, f["m:7x8"].due, f["m:6x6"].b, f["m:3x9"].b], [1, TODAY, 2, 2], "ящики после раунда");
    assert((await TEXT(page)).includes("Раунд окончен"));
  });

  test("Счёт 4: pickMath — до 4 трудных (только на сегодня), 5 новых начиная с лёгких, остальное знакомые, 200 сидов", async ({ page }) => {
    await fresh(page);
    const r = await run(page, (today) => {
      const pairs = OT.consts().PAIRS, key = (p) => OT.fn.factKey("m", p[0], p[1]);
      const freshPairs = [[2, 3], [2, 5], [5, 6], [5, 7], [9, 9], [6, 9], [3, 7], [6, 7]].map(key);
      const rest = pairs.map(key).filter((k) => !freshPairs.includes(k));
      const hardToday = rest.slice(0, 6), hardLater = rest.slice(6, 8), known = rest.slice(8);
      const facts = {};
      hardToday.forEach((k) => { facts[k] = { b: 1, n: 2, ok: 1, due: today }; });
      hardLater.forEach((k) => { facts[k] = { b: 2, n: 2, ok: 1, due: OT.fn.addDays(today, 1) }; });
      known.forEach((k) => { facts[k] = { b: 3, n: 3, ok: 3, due: today, up: "2026-10-01" }; });
      OT.set("math", { facts });
      const bad = [];
      for (let seed = 1; seed <= 200; seed++) {
        OT.seed(seed);
        const items = OT.fn.pickMath(), ks = items.map((i) => i.k);
        const hard = ks.filter((k) => hardToday.includes(k) || hardLater.includes(k)), fr = ks.filter((k) => freshPairs.includes(k));
        const problems = [];
        if (items.length !== 15) problems.push("размер " + items.length);
        if (new Set(ks).size !== 15) problems.push("повторы");
        if (hard.length !== 4 || hard.some((k) => !hardToday.includes(k))) problems.push("трудные " + hard);
        if (fr.length !== 5) problems.push("новые " + fr);
        const easy = ["m:2x3", "m:2x5", "m:5x6", "m:5x7", "m:9x9"];
        if (easy.some((k) => !fr.includes(k))) problems.push("новые не самые лёгкие: " + fr);
        if (ks.length - hard.length - fr.length !== 6) problems.push("знакомых не 6");
        if (problems.length) bad.push([seed, problems]);
      }
      return bad.slice(0, 5);
    }, TODAY);
    eq(r, [], "сиды с нарушениями");
  });

  test("Счёт 5: «Опорные факты» — разрезание 7 × 8, босс побеждён после двух дней по памяти, в один день засчитывается раз", async ({ page }) => {
    await fresh(page);
    const labels = await run(page, () => OT.fn.dfPaths(7, 8).map((p) => p.label));
    assert(labels.includes("5 × 8 + 2 × 8"), "нет разрезания 5 × 8 + 2 × 8: " + labels);
    const yesterday = addDays(TODAY, -1);
    await run(page, ([y, t]) => OT.set("math", { df: { facts: { "7x8": { lvl: 2, ok: 1, okDay: y, upDay: y, day: y }, "6x7": { lvl: 2, ok: 1, okDay: t, upDay: t, day: t } }, sessions: [] } }), [yesterday, TODAY]);
    await run(page, () => OT.play("df", { mode: "boss", items: [{ kind: "boss", r: 7, c: 8, ans: 56 }, { kind: "boss", r: 6, c: 7, ans: 42 }] }));
    eq((await st(page)).ui.math.df.phase, "direct", "знакомый босс — сразу вопрос по памяти");
    await typeNumber(page, "#df-pad", 56);
    await page.click("#df-next");
    await typeNumber(page, "#df-pad", 42);
    await page.click("#df-next");
    const s = await st(page);
    eq([s.docs.math.df.facts["7x8"].ok, s.docs.math.df.facts["7x8"].okDay], [2, TODAY], "7 × 8 побеждён");
    eq(s.docs.math.df.facts["6x7"].ok, 1, "6 × 7 уже засчитан сегодня — второй раз нет");
    const text = await TEXT(page);
    assert(text.includes("1 из 15"), "в итоге «побеждено 1 из 15»: " + text);
    eq(s.docs.math.df.sessions.length, 1);
    // Путь через разрезание: неверный шаг не засчитывает чистую победу.
    await run(page, () => { OT.reset(); OT.play("df", { mode: "boss", items: [{ kind: "boss", r: 7, c: 8, ans: 56 }] }); });
    eq((await st(page)).ui.math.df.phase, "path");
    await page.click('[data-path="0"]');
    await typeNumber(page, "#df-pad", 41);                         // 5 × 8 = 40: ошибка
    assert((await TEXT(page)).includes("Посмотри на точки"), "подсказка к шагу");
    eq((await st(page)).ui.math.df.errors, 1);
  });

  test("Счёт 6: «Часы» — стрелки мышью и кнопками, неверное показывает бледные стрелки", async ({ page }) => {
    await fresh(page);
    const set = (th, tm) => ({ type: "set", kind: "clockset", th, tm, q: `Поставь стрелки на ${th}:${String(tm).padStart(2, "0")}`, ans: `${th}:${String(tm).padStart(2, "0")}` });
    await run(page, (items) => OT.play("cm", { mode: "clock", items }), [set(4, 15), set(9, 30), set(2, 0)]);
    // 1. Мышью: длинная стрелка у края (радиус > 58), короткая у центра.
    const loc = page.locator("#clk-set");
    await loc.scrollIntoViewIfNeeded();
    const box = await loc.boundingBox();
    const k = box.width / 220, cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const at = (deg, r) => [cx + Math.sin(deg * Math.PI / 180) * r * k, cy - Math.cos(deg * Math.PI / 180) * r * k];
    const drag = async (deg, r) => { const [x, y] = at(deg, r); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up(); };
    await drag(90, 85);                                              // минутная на 3 → 15 минут
    await drag(127.5, 40);                                           // часовая на 4 (с учётом 15 минут)
    eq(await loc.getAttribute("aria-label"), "Часы показывают 4:15");
    await page.click("#cm-check");
    eq((await st(page)).ui.math.cm.right, true);
    assert((await TEXT(page)).includes("Верно!"));
    await page.click("#cm-next");
    // 2. Кнопками: часовая 12 → 9 (три раза назад), минутная 0 → 30.
    for (let i = 0; i < 3; i++) await page.click('[data-hh="-1"]');
    for (let i = 0; i < 6; i++) await page.click('[data-mm="5"]');
    eq(await page.locator("#clk-set").getAttribute("aria-label"), "Часы показывают 9:30");
    await page.click("#cm-check");
    eq((await st(page)).ui.math.cm.right, true);
    await page.click("#cm-next");
    // 3. Неверно: стрелки на 12:00, нужно 2:00.
    await page.click("#cm-check");
    eq((await st(page)).ui.math.cm.right, false);
    assert((await TEXT(page)).includes("Бледные стрелки — как надо"), "нет подсказки про бледные стрелки");
    await page.click("#cm-next");
    const s = await st(page);
    eq([s.docs.math.cm.sessions[0].n, s.docs.math.cm.sessions[0].ok], [3, 2]);
    eq(s.docs.math.cm.t.set, { n: 3, ok: 2 });
  });

  test("Счёт 7: монеты — ровно, перебор, лишние монеты, сдача", async ({ page }) => {
    await fresh(page);
    const coins = (target) => ({ type: "coins", kind: "coins", target, q: `Заплати ровно ${target} рублей.`, ans: target });
    const change = { type: "change", kind: "num", q: "Ты покупаешь мяч за 65 рублей и даёшь 100 р. Сколько сдачи?", ans: 35, unit: "р", why: "100 − 65 = 35 р." };
    await run(page, (items) => OT.play("cm", { mode: "money", items }), [coins(37), coins(37), coins(37), change]);
    const add = async (list) => { for (const v of list) await page.click(`[data-add="${v}"]`); };
    // 1. Ровно 37 пятью монетами: «Меньше монет не бывает».
    assert(await page.isDisabled("#cm-pay"), "пока 0 р, «Заплатить» неактивна");
    await add([10, 10, 10, 5, 2]);
    assert(!(await page.isDisabled("#cm-pay")), "37 р — «Заплатить» активна");
    await page.click("#cm-pay");
    assert((await TEXT(page)).includes("Меньше монет не бывает"), "пять монет — минимум");
    await page.click("#cm-next");
    // 2. Перебор: 50 после 37 уже не нужны; кнопка неактивна, лишнюю убираем нажатием.
    await add([10, 10, 10, 5, 2, 50]);
    assert((await TEXT(page)).includes("перебор"), "нет слова «перебор»");
    assert(await page.isDisabled("#cm-pay"), "при переборе «Заплатить» неактивна");
    await page.click('[data-rm="5"]');
    assert(!(await page.isDisabled("#cm-pay")), "лишнюю монету убрали — можно платить");
    await page.click("#cm-pay"); await page.click("#cm-next");
    // 3. Верно, но не меньшим числом монет.
    await add([10, 10, 10, 5, 1, 1]);
    await page.click("#cm-pay");
    assert((await TEXT(page)).includes("Можно и меньшим числом: хватит 5 шт"), "подсказка про 5 монет");
    await page.click("#cm-next");
    // 4. Сдача.
    await typeNumber(page, "#cm-pad", 35);
    eq((await st(page)).ui.math.cm.right, true);
    await page.click("#cm-next");
    const s = await st(page);
    eq([s.docs.math.cm.sessions[0].n, s.docs.math.cm.sessions[0].ok], [4, 4]);
  });

  test("Счёт 8: генераторы часов и денег (500 сидов) и склонение «рубль»", async ({ page }) => {
    await fresh(page);
    const r = await run(page, () => {
      const G = OT.fn.gen, bad = [];
      const num = (q, re) => +q.match(re)[1];
      for (let s = 1; s <= 500; s++) {
        OT.seed(s);
        const rd = G.read();
        if (rd.opts.length !== 3 || new Set(rd.opts).size !== 3 || !rd.opts.includes(rd.ans) || rd.m % 5 !== 0) bad.push(["read", s, rd.opts, rd.ans]);
        const ch = G.change(), pay = num(ch.q, /даёшь (\d+) р/);
        if (!(ch.ans > 0 && ch.ans < pay)) bad.push(["change", s, ch.q, ch.ans]);
        const en = G.enough(), wallet = num(en.q, /У тебя (\d+) р/), prices = [...en.q.matchAll(/за (\d+) р/g)].map((m) => +m[1]), sum = prices[0] + prices[1];
        if (en.yes !== (wallet >= sum) || en.ans !== Math.abs(wallet - sum)) bad.push(["enough", s, en.q, en.ans]);
        const co = G.coins();
        if (co.target < 13 || co.target > 189 || OT.fn.minCoins(co.target) < 1) bad.push(["coins", s, co.target]);
        for (const k of ["dur", "conv", "ice", "kop", "set"]) {
          const g = G[k]();
          if (k !== "set" && g.kind === "num" && !(Number.isInteger(g.ans) && g.ans > 0)) bad.push([k, s, g.q, g.ans]);
        }
      }
      const P = OT.fn.plural;
      return { bad: bad.slice(0, 5), min: OT.fn.minCoins(189), pl: [1, 2, 5, 11, 21, 112].map((n) => P(n, "рубль", "рубля", "рублей")) };
    });
    eq(r.bad, [], "нарушения генераторов");
    eq(r.min, 8, "189 = 100 + 50 + 3 × 10 + 5 + 2 × 2");
    eq(r.pl, ["рубль", "рубля", "рублей", "рублей", "рубль", "рублей"]);
  });

  test("Счёт 9: «Гонка на двоих» — ходы, проверка ошибок взрослого, пойманная, пропущенная и ложная тревога", async ({ page }) => {
    await fresh(page);
    await run(page, () => OT.play("race"));
    const R = () => run(page, () => OT.state().ui.math.race);
    // Ход ребёнка: карта, верный ответ с учётом батута/газа, звезда.
    const move = async (who, claim /* undefined — верный ответ */) => {
      await page.click("#race-draw");
      const s = await R();
      assert(s.turn === who && s.phase === "answer", "ход не того игрока: " + JSON.stringify([s.turn, s.phase]));
      const right = s.pos[who] + s.card.d;
      await typeNumber(page, "#race-pad", claim === undefined ? right : claim(right));
      return { right, pads: s.pads, from: s.pos[who] };
    };
    let m = await move(0);
    let s = await R();
    eq(s.pos[0], m.right + (m.pads[m.right] || 0), "позиция ребёнка с учётом батута или газа");
    eq([s.stars[0], s.phase, s.res.kind], [1, "result", "self"]);
    await page.click("#race-next");
    // Ход взрослого с ошибкой, ребёнок её ловит и исправляет.
    m = await move(1, (r) => r + 1);
    s = await R();
    eq([s.phase, s.claim], ["check", m.right + 1], "заявка взрослого ждёт проверки");
    await page.click('[data-rv="0"]');
    eq((await R()).phase, "fix", "ребёнок сказал «Ошибка» — нужно исправить");
    await typeNumber(page, "#race-pad", m.right);
    s = await R();
    eq(s.st.ct, [1, 1], "ошибка поймана и исправлена");
    eq(s.res.kind, "fixed");
    eq(s.pos[1], m.right + (m.pads[m.right] || 0), "взрослый встал на верное место");
    await page.click("#race-next");
    // Ребёнок ходит, взрослый ошибается снова, ребёнок соглашается: ошибка пропущена.
    await move(0); await page.click("#race-next");
    m = await move(1, (r) => r + 2);
    await page.click('[data-rv="1"]');
    s = await R();
    eq([s.res.kind, s.st.ct], ["missed", [2, 1]], "пропущенная ошибка");
    assert((await TEXT(page)).includes("Ошибка была!"), "ребёнку показано, что ошибка была");
    await page.click("#race-next");
    // Взрослый прав, а ребёнок кричит «Ошибка»: ложная тревога.
    await move(0); await page.click("#race-next");
    await move(1);
    await page.click('[data-rv="0"]');
    s = await R();
    eq(s.res.kind, "falsealarm");
    eq(s.st.ct, [2, 1], "верный ход не считается ошибкой взрослого");
  });

  test("Счёт 10: «Гонка» — пауза и продолжение после перезагрузки, финиш пишет игру и 3 гема", async ({ page }) => {
    await fresh(page);
    await run(page, () => { OT.set("math", { race: { check: false } }); OT.play("race"); });
    const R = () => run(page, () => OT.state().ui.math.race);
    const turn = async () => {
      await page.click("#race-draw");
      const s = await R();
      await typeNumber(page, "#race-pad", s.pos[s.turn] + s.card.d);
      await page.click("#race-next");
    };
    await turn(); await turn();
    const before = await R();
    eq(before.n, 2);
    await page.click("#race-pause");
    assert(await run(page, () => localStorage.getItem("arena-v1-race") !== null), "пауза пишет arena-v1-race");
    await page.reload();
    await page.waitForFunction(() => window.OT && OT.state);
    await page.click("#race-resume");
    const after = await R();
    eq([after.pos, after.stars, after.n, after.turn], [before.pos, before.stars, before.n, before.turn], "игра продолжилась с того же места");
    // Финиш: ребёнок на 99, ходит до победы.
    await run(page, () => OT.play("race", { patch: { pos: [99, 0] } }));
    for (let i = 0; i < 12; i++) {
      const s = await R();
      if (s.win !== null) break;
      await page.click("#race-draw");
      const t = await R();
      await typeNumber(page, "#race-pad", t.pos[t.turn] + t.card.d);
      if ((await R()).win !== null) break;
      await page.click("#race-next");
    }
    eq((await R()).win, 0, "ребёнок дошёл до 100");
    await page.click("#race-next");
    const s = await st(page);
    eq(s.docs.math.race.games.length, 1);
    eq([s.docs.math.race.games[0].w, s.docs.math.race.games[0].d], [0, TODAY]);
    eq(await run(page, () => localStorage.getItem("arena-v1-race")), null, "после финиша сохранённой игры нет");
    eq(s.gems.earned, 3, "игра со взрослым — 3 гема");
    assert((await TEXT(page)).includes("первым до 100"), "экран итогов");
  });

  test("Счёт 11: «Задачи бравлера» (действие, потом ответ, сегодняшние сведения), 300 сидов wpPick, числовая прямая", async ({ page }) => {
    await fresh(page);
    // Задачи: неверное действие, потом верное, неверный ответ.
    await run(page, () => OT.play("wp"));
    const W = () => run(page, () => OT.state().ui.math.wp);
    for (let i = 0; i < 3; i++) {
      let w = await W();
      const p = w.list[i];
      if (i === 0) {
        const wrong = ["+", "−", "×", ":"].find((o) => o !== p.ops[0]);
        await page.click(`.ops [data-op="${wrong}"]`);
        w = await W();
        eq(w.phase, "op", "неверное действие: остаёмся выбирать");
        assert(w.hintOp.startsWith("Подумай ещё"), "подсказка без ответа");
        assert(!(await TEXT(page)).includes("Правильный ответ"), "ответ не показан");
      }
      for (const o of p.ops) await page.click(`.ops [data-op="${o}"]`);
      eq((await W()).phase, "ans");
      await typeNumber(page, "#wp-pad", i === 2 ? p.ans + 1 : p.ans);
      eq((await W()).ansOk[i], i !== 2);
      if (i < 2) await page.click("#wp-next");
    }
    await page.click("#wp-next");
    const s = await st(page);
    eq([s.docs.math.wp[0].n, s.docs.math.wp[0].op, s.docs.math.wp[0].ans], [3, 2, 2], "действие сразу верно в 2 из 3, ответ верен в 2 из 3");
    const t = s.docs.math.wpt; const total = Object.values(t).reduce((a, x) => a + x.n, 0);
    eq(total, 3, "по типам записано 3 задачи");
    // 300 сидов по трём уровням: ответы целые и неотрицательные.
    const bad = [];
    for (const lv of ["one", "mix", "two"]) {
      await run(page, () => OT.reset()); await page.click(`[data-lv="${lv}"]`);
      const r = await run(page, () => { const b = []; for (let s = 1; s <= 100; s++) { OT.seed(s); for (const p of OT.fn.wpPick()) if (!Number.isInteger(p.ans) || p.ans < 0 || !p.steps.length) b.push([s, p.text, p.ans]); } return b.slice(0, 3); });
      bad.push(...r);
    }
    eq(bad, [], "задачи с дробным или отрицательным ответом");
    // Числовая прямая: промах считается в процентах, после двух точных сессий — линия до 1000.
    await run(page, () => { OT.reset(); OT.play("nl", { nums: [30, 50, 70, 10, 90, 20, 40, 60, 80, 15] }); });
    const nl = page.locator("#nl");
    const box = await nl.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    let n = await run(page, () => OT.state().ui.math.nl.shown);
    assert(Math.abs(n.err - 20) < 1.5, "цель 30, нажали у 50: промах около 20%, а не " + n.err);
    assert((await TEXT(page)).includes("Посмотри, где оно на самом деле"));
    await page.click("#nl-stop");
    const nls = (await st(page)).docs.math.nl;
    eq([nls.length, nls[0].range, nls[0].n], [1, 100, 1]);
    await run(page, () => { OT.reset(); OT.set("math", { nl: [{ d: "2026-10-10", range: 100, err: 3, n: 10 }, { d: "2026-10-11", range: 100, err: 4, n: 10 }] }); OT.play("nl"); });
    const s2 = await run(page, () => OT.state().ui.math.nl);
    eq(s2.range, 1000, "две точные сессии открывают линию до 1000");
    assert(s2.nums.every((x) => x >= 1 && x <= 999) && s2.nums.length === 10, "числа в пределах линии");
  });
}
