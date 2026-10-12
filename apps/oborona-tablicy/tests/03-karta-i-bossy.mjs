// Этап 2 («карта мира, боссы, деление, двузначные»): П1 (T4), П4, П5, Д7, Д8, Д9, Solver на всех шаблонах и землях,
// цикл «каждый босс побеждается по плану Solver», уровень из трёх волн, итоги, подсказка-путь, многодорожечные поля, скриншоты (--shot).
// Как и раньше, общаются с игрой только через window.OT и DOM-id.

const SETUP = ([land, idx]) => { OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(land, idx); };
const run = (page, fn, arg) => page.evaluate(fn, arg);

// Помощники внутри страницы (window.H): построить волну по плану Solver и доиграть её или весь уровень.
const HELPERS = () => {
  window.H = {
    clear() { for (const p of OT.state().pads) if (p.digit != null && !p.fixed) OT.removeTower(p.id); },
    build(plan) {
      H.clear();
      for (const p of plan) { OT.placeTower(p.a, p.da); OT.placeTower(p.b, p.db); }
      return plan.map((p) => OT.link(p.a, p.b).ok);
    },
    wave() { const s = OT.state(); H.build(s.wave.plan); OT.startWave(); return OT.runWave(); },
    level() {                                    // три волны по плану; возвращает состояние на level_end
      for (let w = 0; w < 3; w++) { const st = H.wave(); if (st.phase === "waveEnd") OT.step(3); }
      OT.step(1);
      return OT.state();
    },
    lose(n) {                                    // волна из n врагов без единого луча: все доходят до крепости
      OT.setWave(Array.from({ length: n }, () => 12));
      OT.startWave();
      return OT.runWave();
    },
  };
};

// Проверка подписей на поле: по одной на луч, «a × b = c», рамка в поле, подписи не налезают друг на друга и не закрывают цифру башни.
async function labelsProblems(page) {
  return run(page, () => {
    const st = OT.state(), dr = OT.drawn(), bad = [];
    if (dr.labels.length !== st.beams.length) bad.push(`подписей ${dr.labels.length}, лучей ${st.beams.length}`);
    for (const b of st.beams) {
      const ls = dr.labels.filter((l) => l.beamId === b.id);
      if (ls.length !== 1) { bad.push(`луч ${b.id}: подписей ${ls.length}`); continue; }
      const l = ls[0], m = /^(\d+) × (\d+) = (\d+)$/.exec(l.text);
      if (!m) { bad.push(`луч ${b.id}: «${l.text}» не по шаблону`); continue; }
      if (+m[3] !== b.product || +m[1] * +m[2] !== +m[3] || +m[1] !== b.da || +m[2] !== b.db) bad.push(`луч ${b.id}: «${l.text}» не совпадает с ${b.label}`);
      if (l.x < 0 || l.y < 110 || l.x + l.w > 1600 || l.y + l.h > 790) bad.push(`луч ${b.id}: рамка вне поля ${JSON.stringify(l)}`);
    }
    for (let i = 0; i < dr.labels.length; i++) for (let j = i + 1; j < dr.labels.length; j++) {
      const a = dr.labels[i], c = dr.labels[j];
      if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) bad.push(`подписи лучей ${a.beamId} и ${c.beamId} налезают друг на друга`);
    }
    for (const l of dr.labels) for (const p of st.pads) {          // цифра башни (диск 34 лп) остаётся видна
      if (p.digit == null) continue;
      const dx = Math.max(l.x - p.x, 0, p.x - (l.x + l.w)), dy = Math.max(l.y - p.y, 0, p.y - (l.y + l.h));
      if (Math.hypot(dx, dy) < 34) bad.push(`подпись «${l.text}» закрывает цифру башни ${p.id}`);
    }
    return bad;
  });
}

export function register({ test, assert, eq }) {

  // ---------- карта мира, титул, руки ----------

  test("Карта: титул → карта мира, 6 земель × 5 уровней, все открыты, звёзды после уровня", async ({ page }) => {
    await run(page, () => { OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); });
    assert(await page.isVisible("#scr-title"), "нет титульного экрана");
    await page.click("#btn-play");
    assert(await page.isVisible("#scr-map") && !(await page.isVisible("#scr-title")), "после «Играть» нет карты");
    eq(await page.locator("#scr-map [data-level]").count(), 30, "кнопок уровней");
    eq(await run(page, () => OT.state().unlocked), [1, 2, 3, 4, 5, 6], "newGame({ veteran }): все земли открыты (замки на карте проверяют Д4 и «Награды»)");
    const names = await run(page, () => [...document.querySelectorAll("#scr-map .land h3")].map((e) => e.textContent));
    eq(names.length, 6);
    for (let l = 1; l <= 6; l++) for (let i = 0; i < 5; i++) assert(await page.locator(`#scr-map [data-level="${l}-${i}"]`).count() === 1, `нет кнопки ${l}-${i}`);
    // Уровень 1-0 открывается кнопкой карты; рука 2–10.
    await page.click('#scr-map [data-level="1-0"]');
    let st = await run(page, () => OT.state());
    eq([st.screen, st.land, st.level, st.template, st.hand], ["game", 1, 0, "T1", [2, 3, 4, 5, 6, 7, 8, 9, 10]]);
    // Прохождение: три волны по плану → итоги, звёзды видны на карте.
    await run(page, HELPERS);
    st = await run(page, () => H.level());
    eq(st.phase, "levelEnd");
    assert(await page.isVisible("#scr-level-end"), "нет экрана итогов");
    eq(await run(page, () => OT.state().stars["1-0"]), 3);
    await page.click("#btn-le-map");
    assert(await page.isVisible("#scr-map"), "«На карту» не открыла карту");
    eq(await page.locator('#scr-map [data-level="1-0"]').evaluate((b) => b.parentElement.querySelector(".lvl-stars").dataset.stars), "3", "звёзды на карте");
    // Земля 6: в руке ещё 20, 30, 40; на землях 1–5 башни 20 нет.
    await page.click('#scr-map [data-level="6-0"]');
    eq(await run(page, () => OT.state().hand), [2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40]);
    eq(await page.locator("#hand [data-digit]").count(), 12);
    await run(page, () => OT.loadLevel(2, 0));
    eq(await page.locator("#hand [data-digit]").count(), 9);
    eq(await run(page, () => OT.placeTower("A0", 20)), { ok: false, reason: "digit" });
    // Кнопка «На карту» из меню паузы.
    await run(page, () => { OT.setWave([12]); OT.startWave(); OT.step(1); OT.pause(); });
    await page.click("#btn-to-map");
    assert(await page.isVisible("#scr-map"), "«На карту» в меню паузы");
  });

  test("Шаблоны: T1–T5 проходят validate, дороги и соседство как в чертеже", async ({ page }) => {
    await run(page, () => { OT.manual(true); });
    for (const t of ["T1", "T2", "T3", "T4", "T5"]) eq(await run(page, (t) => OT.validate(t), t), [], "validate " + t);
    const info = await run(page, () => {
      const out = {};
      for (const [t, land, idx] of [["T1", 1, 0], ["T2", 1, 1], ["T3", 1, 2], ["T4", 1, 4], ["T5", 5, 0]]) {
        OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(land, idx);
        const s = OT.state(), adj = s.adj, pairs = [];
        for (const a of Object.keys(adj)) for (const b of adj[a]) if (a < b) pairs.push([a, b]);
        out[t] = { template: s.template, pads: s.pads.length, lanes: s.lanes.length, pairs, adj };
      }
      return out;
    });
    eq([info.T1.pads, info.T2.pads, info.T3.pads, info.T4.pads, info.T5.pads], [6, 8, 8, 8, 8]);
    eq([info.T1.lanes, info.T2.lanes, info.T3.lanes, info.T4.lanes, info.T5.lanes], [1, 1, 2, 3, 1]);
    eq([info.T1.template, info.T2.template, info.T3.template, info.T4.template, info.T5.template], ["T1", "T2", "T3", "T4", "T5"]);
    // T5: заранее стоящие A0…A3 и свободные B0…B3; свободные не соседи друг другу (деление не обойти).
    for (const [a, b] of info.T5.pairs) assert(a[0] !== b[0], `T5: соседи одной стороны ${a} и ${b}`);
    for (const b of ["B0", "B1", "B2", "B3"]) assert(info.T5.adj[b].every((x) => x[0] === "A"), "T5: сосед свободной площадки не A: " + info.T5.adj[b]);
    // T3 и T4: у каждой площадки ствола луч пересекает все дорожки; у ветки — только свою.
    const cross = await run(page, () => {
      const out = {};
      for (const [t, land, idx, pairs] of [["T3", 1, 2, [["A0", "B0"], ["C0", "C1"]]], ["T4", 1, 4, [["A0", "B0"], ["A1", "B1"], ["D0", "D1"], ["A0", "D0"], ["B0", "D1"]]]]) {
        OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(land, idx);
        for (const [a, b] of pairs) {
          OT.placeTower(a, 7); OT.placeTower(b, 8);
          const r = OT.link(a, b);
          out[t + a + b] = r.ok ? Object.keys(OT.state().beams.find((m) => m.a === a && m.b === b).cross).map(Number) : r.reason;
          OT.unlink(a, b); OT.removeTower(a); OT.removeTower(b);
        }
      }
      return out;
    });
    eq(cross, { T3A0B0: [0, 1], T3C0C1: [0], T4A0B0: [0, 1, 2], T4A1B1: [0, 1, 2], T4D0D1: [1], T4A0D0: [0], T4B0D1: [2] });
  });

  test("Content.split: таблица разрезания 6.2 и двузначные по разрядам", async ({ page }) => {
    await run(page, () => OT.manual(true));
    const want = { "3x3": null, "3x4": [6, 6], "3x6": [9, 9], "3x7": [15, 6], "3x8": [15, 9], "4x4": [8, 8], "4x6": [12, 12], "4x7": [20, 8], "4x8": [20, 12],
      "6x6": [18, 18], "6x7": [30, 12], "6x8": [30, 18], "7x7": [35, 14], "7x8": [35, 21], "8x8": [40, 24] };
    for (const [k, v] of Object.entries(want)) eq(await run(page, (c) => OT.split(c), "b:" + k), v, "b:" + k);
    const two = { "3x12": [30, 6], "2x35": [60, 10], "4x14": [40, 16], "5x16": [50, 30], "3x25": [60, 15], "4x19": [40, 36], "4x23": [80, 12], "2x47": [80, 14] };
    for (const [k, v] of Object.entries(two)) eq(await run(page, (c) => OT.split(c), "m:" + k), v, "m:" + k);
    // Наборы земель из таблицы 6.1.
    const L = await run(page, () => OT.lands());
    eq(L.map((l) => l.cards.length), [23, 11, 7, 18, 36, 8]);
    eq(L[3].cards.slice(0, 3), ["m:7x7", "m:7x8", "m:8x8"]);
    eq(L[5].cards, ["m:3x12", "m:2x35", "m:4x14", "m:5x16", "m:3x25", "m:4x19", "m:4x23", "m:2x47"]);
    eq(new Set(L[4].cards).size, 36, "36 разных карточек деления");
    eq(L[4].cards[0], "d:2x2");
  });

  // ---------- Solver ----------

  test("Solver: каждое число каждой земли строится на каждом шаблоне (боссы и двузначные — по частям)", async ({ page }) => {
    await run(page, () => OT.manual(true));
    const r = await run(page, () => {
      const lands = OT.lands(), fails = [], cn = (k) => { const m = /(\d+)x(\d+)/.exec(k); return +m[1] * +m[2]; };
      let n = 0;
      for (const LD of lands) for (const tpl of OT.templates()) {
        const nums = new Set();
        for (const k of LD.cards) {
          if (k[0] === "b" || LD.id === 6) (OT.split(k) || [cn(k)]).forEach((x) => nums.add(x));
          else nums.add(cn(k));
        }
        for (const x of nums) { n++; const res = OT.solve({ land: LD.id, template: tpl, demands: [x] }); if (!res.ok) fails.push([LD.id, tpl, x]); }
      }
      return { n, fails };
    });
    assert(r.n > 400, "проверено слишком мало чисел: " + r.n);
    eq(r.fails, [], "не строятся");
    // Наборы по три числа: на каждом шаблоне.
    const sets = await run(page, () => {
      const out = [];
      for (const tpl of OT.templates()) for (const set of [[12, 24, 56], [18, 42, 63], [16, 30, 72], [20, 35, 45]]) if (!OT.solve({ land: 1, template: tpl, demands: set }).ok) out.push([tpl, set]);
      return out;
    });
    eq(sets, []);
    // Двузначные части в земле 6 строятся только с 20, 30, 40 в руке: в землях 1–5 такого спроса нет.
    eq(await run(page, () => OT.solve({ land: 1, template: "T1", demands: [80] }).ok), true, "80 = 8 × 10 и в землях с рукой до 10");
    eq(await run(page, () => OT.solve({ land: 1, template: "T1", demands: [14 * 7] }).ok), false, "98 не построить без 20, 30, 40");
  });

  test("Solver: деление — заранее стоящая цифра, пару даёт только напарник (36 карточек, обе стороны)", async ({ page }) => {
    await run(page, () => OT.manual(true));
    const bad = await run(page, () => {
      const out = [];
      for (const key of OT.lands()[4].cards) {
        const [a, b] = key.slice(2).split("x").map(Number);
        for (const [f, g] of [[a, b], [b, a]]) {
          // A0 с цифрой f; остальные заранее стоящие — «11» (на 11 ничего не делится), чтобы напарник был только у A0.
          const r = OT.solve({ land: 5, template: "T5", demands: [a * b], fixed: { A0: f, A1: 11, A2: 11, A3: 11 } });
          const p = r.ok && r.plan[0];
          if (!p || p.a !== "A0" || p.da !== f || p.db !== g) out.push([key, f, JSON.stringify(r.plan)]);
        }
      }
      return out;
    });
    eq(bad, []);
  });

  test("Боссы: каждый из «Трудных пятнадцати» и каждый двузначный побеждается на каждом шаблоне по плану Solver", async ({ page }) => {
    await run(page, () => OT.manual(true));
    await run(page, HELPERS);
    const r = await run(page, () => {
      const out = { runs: 0, fails: [] }, lands = OT.lands();
      const levels = [[0, "T1"], [1, "T2"], [2, "T3"], [4, "T4"]];                 // уровни земель 4 и 6 на каждом шаблоне
      for (const land of [4, 6]) {
        const bosses = lands[land - 1].boss;
        for (const [idx, tpl] of levels) for (const card of bosses) {
          const n = (() => { const m = /(\d+)x(\d+)/.exec(card); return +m[1] * +m[2]; })();
          OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(land, idx);
          if (OT.state().template !== tpl) { out.fails.push(["шаблон", land, idx, OT.state().template]); continue; }
          const parts = OT.split(card) || [n];
          const lanesN = OT.state().lanes.length;
          for (let lane = 0; lane < (card === "b:7x8" || card === "m:4x23" ? lanesN : 1); lane++) {
            if (lane) { OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(land, idx); }
            const enemies = [{ number: n, armored: true, lane }];
            const sol = OT.solve({ land, idx, template: tpl, demands: parts.map((p) => ({ n: p, lanes: [lane], tag: card, part: true })), enemies });
            if (!sol.ok) { out.fails.push(["нет плана", land, tpl, card, lane]); continue; }
            OT.setWave([n], { armored: [n], cards: { [n]: card }, lanes: [lane] });
            const plan = sol.plan.map((p) => ({ a: p.a, b: p.b, da: p.da, db: p.db }));
            const built = H.build(plan);
            if (!built.every(Boolean)) { out.fails.push(["не построилось", land, tpl, card, built]); continue; }
            OT.startWave();
            const st = OT.runWave();
            const ev = OT.events({ clear: true });
            const hits = ev.filter((e) => e.type === "boss_hit").length, killed = ev.filter((e) => e.type === "enemy_killed").length;
            out.runs++;
            if (killed !== 1 || st.hearts !== 10 || hits !== parts.length - 1)
              out.fails.push(["не побеждён", land, tpl, card, lane, { killed, hits, hearts: st.hearts, parts }]);
          }
        }
      }
      return out;
    });
    assert(r.runs >= 23 * 4, "прогонов слишком мало: " + r.runs);
    eq(r.fails, [], "боссы, которых не удалось победить по плану");
  });

  // ---------- П4: босс 56 ----------

  test("П4: босс 56 — «56 − 35 = 21», затем 7 × 3 побеждает; луч сильнее остатка проходит без вреда", async ({ page }) => {
    await run(page, () => { OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(4, 0); });
    // Цепочка B0=5 – A1=7 – B1=3 (общая башня 7): 5 × 7 = 35, потом 7 × 3 = 21.
    await run(page, () => {
      OT.setWave([56], { armored: [56] });
      OT.placeTower("B0", 5); OT.placeTower("A1", 7); OT.placeTower("B1", 3);
      OT.link("B0", "A1"); OT.link("A1", "B1");
      OT.startWave();
    });
    const until = (type) => run(page, (type) => { for (let t = 0; t < 120; t += 0.1) { OT.step(0.1); if (OT.events().some((e) => e.type === type)) return true; } return false; }, type);
    assert(await until("boss_hit"), "нет boss_hit");
    await run(page, () => OT.step(0.1));
    const mid = await run(page, () => ({ hit: OT.events().find((e) => e.type === "boss_hit"), e: OT.state().enemies[0], notes: OT.drawn().notes.map((n) => n.text) }));
    eq([mid.hit.from, mid.hit.to, mid.hit.product], [56, 21, 35]);
    eq([mid.e.rem, mid.e.armored, mid.e.number], [21, true, 56]);
    assert(mid.notes.includes("56 − 35 = 21"), "нет записи «56 − 35 = 21»: " + JSON.stringify(mid.notes));
    // Запись висит, пока нет следующего удара (3 секунды спустя та же).
    await run(page, () => OT.step(0.3));
    assert((await run(page, () => OT.drawn().notes.map((n) => n.text))).includes("56 − 35 = 21"), "запись пропала");
    const fin = await run(page, () => OT.runWave());
    const ev = await run(page, () => OT.events());
    const k = ev.find((e) => e.type === "enemy_killed");
    assert(k && k.number === 56 && k.beam.product === 21 && k.beam.da === 7 && k.beam.db === 3, "босс не побеждён лучом 7 × 3: " + JSON.stringify(k));
    eq(fin.hearts, 10);
    eq(ev.filter((e) => e.type === "boss_hit").length, 1);
    // Луч сильнее остатка: 35, потом 40 (босс 21 проходит, остаток не меняется, запись «21, а луч даёт 40» и возвращается «56 − 35 = 21»), потом 21 побеждает.
    await run(page, () => { OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(4, 0); OT.setWave([56], { armored: [56] }); });
    await run(page, () => {
      OT.placeTower("A0", 7); OT.placeTower("B0", 5); OT.link("A0", "B0");             // x = 420: 35
      OT.placeTower("A1", 5); OT.placeTower("B1", 8); OT.link("A1", "B1");             // x = 720: 40 — больше остатка
      OT.placeTower("A2", 7); OT.placeTower("B2", 3); OT.link("A2", "B2");             // x = 1020: 21
      OT.startWave();
    });
    assert(await until("enemy_passed_beam"), "босс не прошёл сквозь луч 40");
    await run(page, () => OT.step(0.2));
    const mid2 = await run(page, () => ({ rem: OT.state().enemies[0].rem, notes: OT.drawn().notes.map((n) => n.text), ev: OT.events().find((e) => e.type === "enemy_passed_beam") }));
    eq([mid2.rem, mid2.ev.product], [21, 40]);
    assert(mid2.notes.includes("21, а луч даёт 40"), "нет «21, а луч даёт 40»: " + JSON.stringify(mid2.notes));
    await run(page, () => OT.step(1.3));
    assert((await run(page, () => OT.drawn().notes.map((n) => n.text))).includes("56 − 35 = 21"), "после промаха запись удара не вернулась");
    const fin2 = await run(page, () => OT.runWave());
    eq(fin2.hearts, 10);
    assert((await run(page, () => OT.events())).some((e) => e.type === "enemy_killed" && e.beam.product === 21), "босс не побеждён лучом 21");
    // Целый луч 7 × 8 бьёт босса 56 сразу (решение 2 раздела 16).
    await run(page, () => { OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(4, 0); OT.setWave([56], { armored: [56] }); OT.placeTower("A0", 7); OT.placeTower("B0", 8); OT.link("A0", "B0"); OT.startWave(); OT.runWave(); });
    const whole = await run(page, () => OT.events());
    assert(whole.some((e) => e.type === "enemy_killed" && e.beam.product === 56) && !whole.some((e) => e.type === "boss_hit"), "целый луч не побил босса");
  });

  test("Босс: железный вид, число на щите уменьшается, три знака помещаются", async ({ page }) => {
    await run(page, () => { OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(6, 0); });
    // Рисунок: по пикселям — тёмный шлем и светлый квадратный щит у железного, фиолетовая клякса у обычного.
    await run(page, () => { OT.setWave([92, 21], { armored: [92] }); OT.startWave(); OT.step(18); });
    const px = await run(page, () => {
      const cv = document.getElementById("field"), k = cv.width / 1600, c = cv.getContext("2d");
      const out = {};
      const st = OT.state(), ln = st.lanes[0];
      const at = (d) => { let i = 0; const cum = [0]; for (let j = 1; j < ln.points.length; j++) cum.push(cum[j - 1] + Math.hypot(ln.points[j][0] - ln.points[j - 1][0], ln.points[j][1] - ln.points[j - 1][1])); while (i < ln.points.length - 2 && d > cum[i + 1]) i++; const p = ln.points[i], q = ln.points[i + 1], t = (d - cum[i]) / (cum[i + 1] - cum[i]); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
      const boss = st.enemies.find((e) => e.armored), [bx, by] = at(boss.d);
      const get = (x, y) => { const d = c.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return [d[0], d[1], d[2]]; };
      out.helmet = get(bx, by - 28);                  // шлем (тёмно-серый)
      out.shield = get(bx - 14, by + 52);             // квадратный щит (светлый), вне цифр
      out.boss = boss.rem;
      return out;
    });
    assert(px.helmet[0] < 90 && px.helmet[2] < 100 && Math.abs(px.helmet[0] - px.helmet[2]) < 40, "шлем босса не тёмно-серый: " + px.helmet);
    assert(px.shield[0] > 200 && px.shield[1] > 205, "щит босса не светлый: " + px.shield);
    eq(px.boss, 92);
  });

  // ---------- П5: земля деления ----------

  test("П5: земля деления — стоит 7, идёт 56: подходит только напарник 8; свободные площадки не соседи", async ({ page }) => {
    const hand = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const d of hand) {
      await run(page, () => { OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(5, 0); OT.setWave([56], { fixed: { A1: 7 } }); });
      if (d === hand[0]) {
        const r = await run(page, () => {
          const out = {};
          out.fixedPlace = OT.placeTower("A1", 3);
          out.fixedRemove = OT.removeTower("A1");
          out.fixedMove = OT.moveTower("A1", "B1");
          out.moveOnto = (OT.placeTower("B0", 4), OT.moveTower("B0", "A1"));
          out.freeLink = OT.link("B0", "B2");
          out.freeLink2 = OT.link("B1", "B2");
          out.digits = OT.state().pads.map((p) => p.id + ":" + p.digit + (p.fixed ? "F" : "")).join(" ");
          out.adjFree = ["B0", "B1", "B2", "B3"].map((b) => OT.state().adj[b].filter((x) => x[0] === "B"));
          return out;
        });
        eq(r.fixedPlace, { ok: false, reason: "fixed" });
        eq(r.fixedRemove.reason, "fixed");
        eq(r.fixedMove.reason, "fixed");
        eq(r.moveOnto.reason, "fixed");
        assert(!r.freeLink.ok && !r.freeLink2.ok, "свободные площадки связались: " + JSON.stringify([r.freeLink, r.freeLink2]));
        eq(r.adjFree, [[], [], [], []], "соседи среди свободных");
        assert(/A1:7F/.test(r.digits), "заранее стоящая 7 пропала: " + r.digits);
        await run(page, () => { OT.removeTower("B0"); });
      }
      await run(page, (d) => { OT.placeTower("B1", d); OT.link("A1", "B1"); OT.startWave(); OT.runWave(); }, d);
      const ev = await run(page, () => OT.events());
      const killed = ev.find((e) => e.type === "enemy_killed"), reached = ev.find((e) => e.type === "enemy_reached_castle");
      if (d === 8) assert(killed && !reached && killed.beam.da === 7 && killed.beam.db === 8, "с 8 враг должен быть побеждён: " + JSON.stringify(ev.map((e) => e.type)));
      else assert(!killed && reached, `с ${d} враг должен дойти до крепости (${7 * d})`);
    }
  });

  test("Земля 5: перед каждой волной свободные башни и лучи снимаются, заранее стоящие получают новые цифры", async ({ page }) => {
    await run(page, () => { OT.manual(true); OT.seed(2); OT.newGame({ veteran: true }); OT.loadLevel(5, 1); });
    await run(page, HELPERS);
    const r = await run(page, () => {
      const fixedOf = () => OT.state().pads.filter((p) => p.fixed).map((p) => p.id + p.digit).join(" ");
      const out = { fixed: [fixedOf()], free: [], beams: [], plan: [] };
      for (let w = 0; w < 3; w++) {
        const s = OT.state();
        out.free.push(s.pads.filter((p) => !p.fixed && p.digit != null).length);
        out.beams.push(s.beams.length);
        out.plan.push(s.wave.plan.length);
        const st = H.wave();
        out.after = out.after || [];
        out.after.push([st.hearts, st.beams.length, st.pads.filter((p) => !p.fixed && p.digit != null).length]);
        if (st.phase === "waveEnd") { OT.step(3); out.fixed.push(fixedOf()); }
      }
      return out;
    });
    eq(r.free, [0, 0, 0], "свободных башен в начале волны");
    eq(r.beams, [0, 0, 0], "лучей в начале волны");
    assert(r.after.every((a) => a[1] > 0 && a[2] > 0), "после волны башни и лучи остаются до следующей подготовки: " + JSON.stringify(r.after));
    eq(new Set(r.fixed).size, 3, "заранее стоящие цифры должны меняться от волны к волне: " + JSON.stringify(r.fixed));
    for (const f of r.fixed) eq(f.split(" ").length, 4, "заранее стоящих башен четыре: " + f);
    for (const a of r.after) eq(a[0], 10, "все волны побеждены по плану");
  });

  // ---------- волны ----------

  test("WaveGen: размер 6–12, боссы ≤ 3 и ≤ 2 различных во второй половине, земля 5 с заранее стоящими, все волны решаемы", async ({ page }) => {
    await run(page, () => OT.manual(true));
    const bad = await run(page, () => {
      const out = [], lands = OT.lands(), tplOf = (land, idx) => (land === 5 ? "T5" : ["T1", "T2", "T3", "T3", "T4"][idx]);
      let waves = 0;
      for (let land = 1; land <= 6; land++) for (let idx = 0; idx < 5; idx++) for (let w = 0; w < 3; w++) for (const seed of [1, 4, 11]) {
        const wave = OT.waveFor(land, idx, w, seed), n = wave.enemies.length, tag = [land, idx, w, seed];
        waves++;
        if (n < 6 || n > 12) out.push([...tag, "размер", n]);
        const bosses = wave.enemies.filter((e) => e.armored), cards = new Set(bosses.map((e) => e.card));
        if (bosses.length > 3 || cards.size > 2) out.push([...tag, "боссов", bosses.length, cards.size]);
        if ((land === 4 || land === 6) && !bosses.length) out.push([...tag, "нет босса"]);
        if (land !== 4 && land !== 6 && bosses.length) out.push([...tag, "босс вне земель 4 и 6"]);
        wave.enemies.forEach((e, i) => { if (e.armored && i < Math.ceil(n / 2)) out.push([...tag, "босс в первой половине", i]); });
        const nums = new Set(wave.enemies.map((e) => e.number));
        if (nums.size > (tplOf(land, idx) === "T1" ? 3 : 4) + (bosses.length ? 2 : 0)) out.push([...tag, "различных чисел", nums.size]);
        for (let i = 2; i < n; i++) if (wave.enemies[i].number === wave.enemies[i - 1].number && wave.enemies[i].number === wave.enemies[i - 2].number && wave.enemies[i].armored === wave.enemies[i - 1].armored && wave.enemies[i].armored === wave.enemies[i - 2].armored) out.push([...tag, "три подряд"]);
        wave.enemies.forEach((e, i) => { if (e.lane !== i % (tplOf(land, idx) === "T3" ? 2 : tplOf(land, idx) === "T4" ? 3 : 1)) out.push([...tag, "дорожка", i, e.lane]); });
        if (land === 5) {
          if (Object.keys(wave.fixed).sort().join() !== "A0,A1,A2,A3") out.push([...tag, "fixed", Object.keys(wave.fixed).join()]);
          for (const e of wave.enemies) if (!e.card.startsWith("d:") || e.armored) out.push([...tag, "карточка деления", e.card]);
          for (const e of wave.enemies) {                       // у каждого врага есть заранее стоящий множитель и напарник из 2–9
            const ok = Object.values(wave.fixed).some((f) => e.number % f === 0 && e.number / f >= 2 && e.number / f <= 9);
            if (!ok) out.push([...tag, "нет множителя для", e.number]);
          }
        } else if (Object.keys(wave.fixed).length) out.push([...tag, "fixed вне земли 5"]);
        // Решаемость: план, записанный в волне, независимо проверен — пары соседние, цифры согласованы, каждый враг побеждается по дороге.
        const plan = wave.plan.map((p) => ({ number: p.n, a: p.a, b: p.b, da: p.da, db: p.db }));
        const bad = OT.verifyPlan({ land, idx, template: tplOf(land, idx), plan, enemies: wave.enemies, fixed: wave.fixed });
        if (bad.length) out.push([...tag, "план", bad.join("; ")]);
      }
      return { out, waves, lands: lands.length };
    });
    assert(bad.waves === 270, "волн " + bad.waves);
    eq(bad.out, []);
  });

  test("WaveGen: первая волна новой игры — первые три карточки земли; новые карточки вводятся по порядку", async ({ page }) => {
    await run(page, () => OT.manual(true));
    // Этап 3: волна считается от прогресса ребёнка, поэтому «новая игра» — это пустой набор карточек (cards: {}), а не синтетический прогресс по умолчанию.
    const r = await run(page, () => {
      const first = OT.waveFor(1, 0, 0, 1, { cards: {} }).enemies.map((e) => e.card);
      const law = OT.lands()[0].cards, cards = {}, order = [];
      for (let idx = 0; idx < 5; idx++) for (let w = 0; w < 3; w++) {
        const fresh = [];
        for (const e of OT.waveFor(1, idx, w, 1 + idx * 3 + w, { cards }).enemies) if (!cards[e.card] && !fresh.includes(e.card)) fresh.push(e.card);
        fresh.sort((x, y) => law.indexOf(x) - law.indexOf(y));
        for (const k of fresh) { cards[k] = { b: 2, due: "2099-01-01" }; order.push(k); }
      }
      return { first: [...new Set(first)].sort(), law3: law.slice(0, 3).sort(), order, law: law.slice(0, order.length) };
    });
    eq(r.first, r.law3, "первая волна");
    eq(r.order, r.law, "новые карточки вводятся строго по порядку таблицы");
    assert(r.order.length >= 8, "за 15 волн должно быть введено не меньше 8 карточек, было " + r.order.length);
  });

  // ---------- уровень из трёх волн, итоги ----------

  test("Уровень: три волны, лента обновляется, «Следующая волна», плашка и итоги с задержкой 0,6 с, level_end один раз", async ({ page }) => {
    await run(page, () => { OT.manual(true); OT.seed(3); OT.newGame({ veteran: true }); OT.loadLevel(1, 2); });
    await run(page, HELPERS);
    const ribbons = [];
    for (let w = 0; w < 3; w++) {
      const s = await run(page, () => OT.state());
      eq([s.phase, s.waveIdx], ["prep", w]);
      assert((await page.locator("#wave-info").textContent()).includes(`${w + 1} из 3`), "номер волны: " + (await page.locator("#wave-info").textContent()));
      const rib = await page.locator("#ribbon .rc").allTextContents();
      eq(rib.map(Number), s.ribbon.map((r) => r.number), "лента = числа волны");
      ribbons.push(rib.join(","));
      assert(await page.locator("#ribbon-cap").textContent() === "Следующая волна", "подпись ленты");
      await run(page, () => H.wave());
      const end = await run(page, () => OT.state().phase);
      if (w < 2) {
        eq(end, "waveEnd");
        await run(page, () => OT.step(0.3));
        assert(!(await page.isVisible("#plaque")), "плашка «Волна отбита» появилась в тот же кадр, что и последняя победа");
        await run(page, () => OT.step(0.5));
        assert(await page.isVisible("#plaque"), "плашка не появилась через 0,8 с");
        assert((await page.locator("#plaque-text").textContent()).includes(`Волна ${w + 1} отбита`), "текст плашки");
        await run(page, () => OT.step(2.3));          // всего 3,1 с после конца волны: плашка ушла, началась подготовка
      } else eq(end, "levelEnd");
    }
    assert(new Set(ribbons).size === 3, "лента должна меняться от волны к волне: " + ribbons.join(" | "));
    // Экран итогов: не в тот же кадр.
    assert(!(await page.isVisible("#scr-level-end")), "итоги появились в тот же кадр, что и последняя победа");
    await run(page, () => OT.step(0.3));
    assert(!(await page.isVisible("#scr-level-end")), "итоги раньше 0,6 с");
    await run(page, () => OT.step(0.5));
    assert(await page.isVisible("#scr-level-end"), "итогов нет через 0,8 с");
    const ev = await run(page, () => OT.events().filter((e) => e.type === "level_end" || e.type === "wave_start" || e.type === "wave_end"));
    eq(ev.filter((e) => e.type === "wave_start").length, 3);
    eq(ev.filter((e) => e.type === "wave_end").length, 3);
    eq(ev.filter((e) => e.type === "level_end").length, 1);
    eq([ev.at(-1).land, ev.at(-1).level, ev.at(-1).hearts, ev.at(-1).stars], [1, 2, 10, 3]);
    eq(await page.locator("#le-stars svg.on").count(), 3);
    // «Дальше»: следующий уровень земли без трёх звёзд — это уровень 0.
    await page.click("#btn-le-next");
    eq(await run(page, () => [OT.state().screen, OT.state().land, OT.state().level, OT.state().phase]), ["game", 1, 0, "prep"]);
  });

  test("Итоги: подсказка земли и «24 можно было победить ещё лучом 4 × 6»", async ({ page }) => {
    await run(page, () => OT.manual(true));
    await run(page, HELPERS);
    const tips = { 1: ["×5 — половина от ×10"], 2: ["×4 — это удвоить дважды"], 3: ["×9 = ×10 минус одно", "×6 = ×5 плюс одно"], 4: ["Трудный пример режь на лёгкие"], 5: ["Какое число вместе с 7 даёт 56"], 6: ["Режь по разрядам: 23 × 4 = 20 × 4 + 3 × 4"] };
    for (let land = 1; land <= 6; land++) {
      await run(page, (land) => { OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(land, land === 5 ? 1 : 3); H.level(); }, land);
      const text = await page.locator("#le-lines").innerText();
      for (const t of tips[land]) assert(text.includes(t), `земля ${land}: нет подсказки «${t}» в «${text}»`);
      const lines = await page.locator("#le-lines p").count();
      assert(lines <= tips[land].length + 3 + 2, `земля ${land}: слишком много строк (${lines})`);
      assert(await page.isVisible("#btn-le-next") && await page.isVisible("#btn-le-map"), "кнопки итогов");
    }
    // Конкретно: 24 побеждён лучом 3 × 8 → итоги пишут про 4 × 6; 12 лучом 3 × 4 → про 2 × 6; не больше трёх строк.
    await run(page, () => {
      OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(2, 0);
      const waves = [[[24], ["A0", 3, "B0", 8]], [[12], ["A0", 3, "B0", 4]], [[36, 16, 18, 40], null]];
      for (let w = 0; w < 3; w++) {
        OT.setWave(waves[w][0]);
        if (waves[w][1]) { const [a, da, b, db] = waves[w][1]; OT.placeTower(a, da); OT.placeTower(b, db); OT.link(a, b); }
        else { OT.placeTower("A0", 4); OT.placeTower("B0", 9); OT.link("A0", "B0"); OT.placeTower("A1", 2); OT.placeTower("B1", 8); OT.link("A1", "B1"); OT.placeTower("A2", 3); OT.placeTower("B2", 6); OT.link("A2", "B2"); OT.placeTower("B0", 9); OT.placeTower("A1", 2); }
        OT.startWave(); OT.runWave(); if (OT.state().phase === "waveEnd") OT.step(3);
      }
      OT.step(1);
    });
    const alts = await page.locator("#le-lines p.alt").allTextContents();
    assert(alts.includes("24 можно было победить ещё лучом 4 × 6"), "нет строки про 24: " + JSON.stringify(alts));
    assert(alts.includes("12 можно было победить ещё лучом 2 × 6"), "нет строки про 12: " + JSON.stringify(alts));
    assert(alts.length <= 3, "строк больше трёх: " + alts.length);
  });

  test("Итоги: цепочка босса «56 − 35 − 21 = 0» и цепочка двузначного", async ({ page }) => {
    await run(page, () => OT.manual(true));
    await run(page, HELPERS);
    await run(page, () => { OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(4, 0); H.level(); });
    const chains = await page.locator("#le-lines p.chain").allTextContents();
    assert(chains.length >= 1 && chains.length <= 2, "цепочки боссов: " + JSON.stringify(chains));
    for (const c of chains) assert(/^\d+( − \d+)+ = 0$/.test(c), "цепочка не по шаблону: " + c);
  });

  // ---------- Д7: звёзды ----------

  test("Д7: звёзды 10/9 → 3, 8/6 → 2, 5/0 → 1; при 0 сердец волны идут дальше, level_end есть", async ({ page }) => {
    await run(page, () => OT.manual(true));
    await run(page, HELPERS);
    const cases = [[10, 3], [9, 3], [8, 2], [6, 2], [5, 1], [0, 1]];
    for (const [hearts, stars] of cases) {
      const r = await run(page, (hearts) => {
        OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(1, 0);
        const loss = hearts === 0 ? 12 : 10 - hearts, per = [Math.ceil(loss / 3), Math.ceil((loss - Math.ceil(loss / 3)) / 2), 0];
        per[2] = loss - per[0] - per[1];
        const waveEnds = [];
        for (let w = 0; w < 3; w++) {
          if (per[w] === 0) {                                   // волна без потерь: один враг побеждён
            OT.setWave([12]); OT.placeTower("A0", 3); OT.placeTower("B0", 4); OT.link("A0", "B0"); OT.startWave(); waveEnds.push(OT.runWave().hearts);
          } else waveEnds.push(H.lose(per[w]).hearts);
          if (OT.state().phase === "waveEnd") OT.step(3);
        }
        OT.step(1);
        const ev = OT.events().filter((e) => e.type === "level_end");
        return { waveEnds, ev, phase: OT.state().phase, stars: OT.state().stars["1-0"], domStars: document.querySelectorAll("#le-stars svg.on").length, hearts: OT.state().hearts };
      }, hearts);
      eq(r.phase, "levelEnd", `${hearts} сердец: фаза`);
      eq(r.hearts, hearts, `${hearts} сердец: итог`);
      eq(r.ev.length, 1, `${hearts} сердец: level_end`);
      eq([r.ev[0].hearts, r.ev[0].stars], [hearts, stars], `${hearts} сердец: звёзды`);
      eq(r.domStars, stars, `${hearts} сердец: звёзд на экране`);
      assert(r.waveEnds[0] >= hearts, "сердца не растут");
    }
    // Лучший результат хранится: сначала 1 звезда, потом 3, потом снова 1 — на карте остаётся 3.
    const best = await run(page, () => {
      OT.seed(1); OT.newGame({ veteran: true });
      const out = [];
      for (const loss of [12, 0, 12]) {
        OT.loadLevel(1, 1);
        for (let w = 0; w < 3; w++) { if (loss) H.lose(4); else { OT.setWave([12]); OT.placeTower("A0", 3); OT.placeTower("B0", 4); OT.link("A0", "B0"); OT.startWave(); OT.runWave(); } if (OT.state().phase === "waveEnd") OT.step(3); }
        out.push(OT.state().stars["1-1"]);
      }
      return out;
    });
    eq(best, [1, 3, 3], "лучший результат");
  });

  // ---------- подсказка-путь ----------

  test("Подсказка-путь: пунктир и призрак «7 × 5» у босса в подготовке и на паузе, исчезает после луча на паре", async ({ page }) => {
    await run(page, () => { OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(4, 0); OT.setWave([56, 24], { armored: [56] }); });
    const h = await run(page, () => ({ hints: OT.state().hints, drawn: OT.drawn().hints }));
    eq(h.hints.length, 1);
    eq([h.hints[0].card, h.hints[0].mode, h.hints[0].parts], ["b:7x8", "full", [35, 21]]);
    assert(/^\d+ × \d+$/.test(h.hints[0].ghost), "призрак без ответа: " + h.hints[0].ghost);
    const [x, y] = h.hints[0].ghost.split(" × ").map(Number);
    eq(x * y, 35, "призрак — первая часть разрезания 5 + остаток (7 × 5): " + h.hints[0].ghost);
    eq(h.drawn.length, 1);
    eq(h.drawn[0].pads, h.hints[0].pads);
    assert(h.drawn[0].ghost === h.hints[0].ghost && h.drawn[0].w > 0, "призрак не нарисован");
    // Луч на этой паре (любой) — пунктир исчезает; убрали луч — вернулся.
    const [a, b] = h.hints[0].pads;
    await run(page, ({ a, b }) => { OT.placeTower(a, 2); OT.placeTower(b, 3); OT.link(a, b); }, { a, b });
    eq(await run(page, () => OT.drawn().hints), [], "после луча на паре");
    await run(page, ({ a, b }) => OT.unlink(a, b), { a, b });
    eq((await run(page, () => OT.drawn().hints)).length, 1, "после разрыва луча");
    // В бою пунктира нет, на паузе есть.
    await run(page, () => { OT.startWave(); OT.step(0.5); });
    eq(await run(page, () => OT.drawn().hints), [], "в бою");
    await run(page, () => { OT.pause(); OT.step(0.1); });
    eq((await run(page, () => OT.drawn().hints)).length, 1, "на паузе");
    // Обычные враги подсказки не получают; 3 × 3 — целый луч.
    await run(page, () => { OT.resume(); OT.runWave(); OT.step(3); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(4, 0); OT.setWave([24, 12]); });
    eq(await run(page, () => OT.drawn().hints), []);
    await run(page, () => OT.setWave([9, 9], { armored: [9], cards: { 9: "b:3x3" } }));
    const nine = await run(page, () => OT.state().hints);
    eq([nine.length, nine[0].parts, nine[0].ghost], [1, [9], "3 × 3"]);
  });

  // ---------- многодорожечные поля ----------

  test("Многодорожечные уровни: ствол бьёт все дорожки, ветка — свою; враги разных дорожек не налезают друг на друга", async ({ page }) => {
    await run(page, () => OT.manual(true));
    // T3: ствол A0–B0 (7 × 8) бьёт 56 на обеих дорожках; ветка C0–C1 — только на дорожке 0.
    const t3 = await run(page, () => {
      const out = {};
      OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(1, 2); OT.setWave([56, 56], { lanes: [0, 1] });
      OT.placeTower("A0", 7); OT.placeTower("B0", 8); OT.link("A0", "B0"); OT.startWave(); OT.runWave();
      out.trunk = OT.events().filter((e) => e.type === "enemy_killed").map((e) => e.id).length;
      OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(1, 2); OT.setWave([56, 56], { lanes: [0, 1] });
      OT.placeTower("C0", 7); OT.placeTower("C1", 8); OT.link("C0", "C1"); OT.startWave(); const st = OT.runWave();
      out.branch = OT.events().filter((e) => e.type === "enemy_killed").map((e) => e.id);
      out.branchHearts = st.hearts;
      return out;
    });
    eq(t3.trunk, 2, "T3: ствол бьёт обе дорожки");
    eq([t3.branch.length, t3.branchHearts], [1, 9], "T3: ветка бьёт только дорожку 0");
    // T4: D0–D1 пересекает только среднюю дорожку; A1–B1 на стволе бьёт все три.
    const t4 = await run(page, () => {
      const out = {};
      OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(1, 4); OT.setWave([56, 56, 56], { lanes: [0, 1, 2] });
      OT.placeTower("D0", 7); OT.placeTower("D1", 8); OT.link("D0", "D1"); OT.startWave(); OT.runWave();
      out.mid = OT.events().filter((e) => e.type === "enemy_killed").map((e) => e.number);
      OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(1, 4); OT.setWave([56, 56, 56], { lanes: [0, 1, 2] });
      OT.placeTower("A1", 7); OT.placeTower("B1", 8); OT.link("A1", "B1"); OT.startWave(); const st = OT.runWave();
      out.trunk = OT.events().filter((e) => e.type === "enemy_killed").length; out.hearts = st.hearts;
      return out;
    });
    eq(t4.mid.length, 1, "T4: D0–D1 бьёт одну дорожку");
    eq([t4.trunk, t4.hearts], [3, 10], "T4: ствол бьёт три дорожки");
    // Расстояние между любыми двумя врагами на поле не меньше 90 лп за всю волну (запаздывание ветки выравнивает их на стволе).
    const gap = await run(page, () => {
      let min = 1e9;
      for (const [land, idx] of [[1, 2], [1, 4]]) {
        OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(land, idx);
        const pts = (ln, d) => { const P = ln.points, cum = [0]; for (let j = 1; j < P.length; j++) cum.push(cum[j - 1] + Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1])); d = Math.max(0, Math.min(d, cum.at(-1))); let i = 0; while (i < P.length - 2 && d > cum[i + 1]) i++; const t = (d - cum[i]) / (cum[i + 1] - cum[i]); return [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t]; };
        OT.setWave(Array.from({ length: 12 }, () => 56));
        OT.startWave();
        for (let t = 0; t < 400 && OT.state().phase === "battle"; t += 0.25) {
          const st = OT.step(0.25), en = st.enemies.filter((e) => e.alive && e.d > 0);
          for (let i = 0; i < en.length; i++) for (let j = i + 1; j < en.length; j++) {
            const a = pts(st.lanes[en[i].lane], en[i].d), b = pts(st.lanes[en[j].lane], en[j].d);
            min = Math.min(min, Math.hypot(a[0] - b[0], a[1] - b[1]));
          }
        }
      }
      return min;
    });
    assert(gap > 90, "враги налезают друг на друга: минимальный просвет " + Math.round(gap));
  });

  // ---------- П1 на T4 ----------

  test("П1 T4: над каждым лучом «a × b = c», подписи и надписи над врагами не налезают друг на друга", async ({ page }) => {
    const cases = [
      ["цепочка по стволу", [["A0", 2], ["B0", 3], ["A1", 4], ["B1", 5], ["A2", 6], ["B2", 7]], [["A0", "B0"], ["B0", "A1"], ["A1", "B1"], ["B1", "A2"], ["A2", "B2"]]],
      ["ветки и ствол", [["A0", 4], ["D0", 6], ["D1", 7], ["B0", 9]], [["A0", "D0"], ["D0", "D1"], ["D1", "B0"]]],
      ["диагонали ствола", [["A1", 3], ["B0", 8], ["B2", 6], ["B1", 7], ["A0", 4]], [["A1", "B0"], ["A1", "B2"], ["B1", "A0"]]],
      ["крест и прямая", [["A0", 3], ["B1", 4], ["A1", 5], ["B0", 6], ["A2", 9], ["B2", 8]], [["A0", "B1"], ["A1", "B0"], ["A2", "B2"]]],
      ["все три ветви", [["A0", 7], ["D0", 8], ["D1", 6], ["B0", 5], ["A1", 9], ["B1", 4]], [["A0", "D0"], ["D0", "D1"], ["D1", "B0"], ["A1", "B1"]]],
      ["двузначные башни", [["A0", 10], ["B0", 10], ["A1", 9], ["B1", 10]], [["A0", "B0"], ["A1", "B1"]]],
    ];
    for (const [name, towers, links] of cases) {
      await run(page, SETUP, [1, 4]);
      const oks = await run(page, ({ towers, links }) => {
        OT.setWave([56, 24, 42, 12, 56, 24, 42, 12]);
        for (const [p, d] of towers) OT.placeTower(p, d);
        return links.map(([a, b]) => OT.link(a, b).ok);
      }, { towers, links });
      assert(oks.every(Boolean), name + ": не все лучи построились " + JSON.stringify(oks));
      await run(page, () => OT.step(0.1));
      eq(await labelsProblems(page), [], name + ": подготовка");
      // Смена цифры одной из башен — подпись пересчитана.
      const changed = await run(page, ({ pad }) => {
        OT.placeTower(pad, 9);
        const st = OT.state(), dr = OT.drawn();
        return st.beams.filter((b) => b.a === pad || b.b === pad).map((b) => ({ label: b.label, drawn: dr.labels.find((l) => l.beamId === b.id).text }));
      }, { pad: links[0][0] });
      for (const c of changed) eq(c.drawn, c.label, name + ": подпись после смены цифры");
      eq(await labelsProblems(page), [], name + ": после смены цифры");
    }
    // Бой: враги на всех трёх дорожках проходят сквозь неверные лучи; надписи над ними не прячутся под подписями и друг под другом.
    await run(page, SETUP, [1, 4]);
    await run(page, () => {
      OT.setWave([56, 24, 42, 12, 56, 24, 42, 12, 56]);
      for (const [p, d] of [["A0", 2], ["B0", 3], ["A1", 4], ["B1", 5], ["A2", 6], ["B2", 7], ["D0", 8], ["D1", 9]]) OT.placeTower(p, d);
      for (const [a, b] of [["A0", "B0"], ["B0", "A1"], ["A1", "B1"], ["B1", "A2"], ["A2", "B2"], ["D0", "D1"]]) OT.link(a, b);
      OT.startWave();
    });
    const frames = await run(page, () => {
      const out = [], hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      let notes = 0;
      for (let i = 0; i < 3000 && OT.state().phase === "battle"; i++) {
        OT.step(0.1);
        const dr = OT.drawn();
        notes += dr.notes.length;
        for (const n of dr.notes) {
          if (n.y < 110 || n.y + n.h > 790 || n.x < 0 || n.x + n.w > 1600) out.push({ t: i, bad: "надпись вне поля", n: n.text });
          for (const l of dr.labels) if (hit(n, l)) out.push({ t: i, bad: "надпись под подписью луча", n: n.text, l: l.text });
        }
        for (let a = 0; a < dr.notes.length; a++) for (let b = a + 1; b < dr.notes.length; b++) if (hit(dr.notes[a], dr.notes[b])) out.push({ t: i, bad: "надписи налезают", a: dr.notes[a].text, b: dr.notes[b].text });
      }
      return { problems: out.slice(0, 5), total: out.length, notes };
    });
    assert(frames.notes > 20, "надписей над врагами почти не было: " + frames.notes);
    eq(frames.problems, [], "наложения в бою на T4: " + frames.total);
    // Во время серого мигания и на паузе подписи те же.
    await run(page, SETUP, [1, 4]);
    await run(page, () => {
      OT.setWave([56, 24, 42]);
      for (const [p, d] of [["A1", 3], ["B1", 8], ["A0", 7], ["B0", 9]]) OT.placeTower(p, d);
      OT.link("A1", "B1"); OT.link("A0", "B0"); OT.startWave();
      for (let i = 0; i < 600; i++) { OT.step(0.1); if (OT.state().beams.some((b) => b.blink)) break; }
    });
    assert(await run(page, () => OT.state().beams.some((b) => b.blink)), "нет серого мигания на T4");
    eq(await labelsProblems(page), [], "серое мигание на T4");
    await run(page, () => { OT.pause(); OT.step(0.1); });
    eq(await labelsProblems(page), [], "пауза на T4");
  });

  test("П1 T1: подписи диагоналей не касаются кромки дороги, надпись «141» помещается в щит", async ({ page }) => {
    await run(page, SETUP, [1, 0]);
    await run(page, () => {
      for (const [p, d] of [["A0", 2], ["B0", 3], ["A1", 4], ["B1", 5], ["A2", 6], ["B2", 7]]) OT.placeTower(p, d);
      for (const [a, b] of [["A0", "B0"], ["B0", "A1"], ["A1", "B1"], ["B1", "A2"], ["A2", "B2"]]) OT.link(a, b);
      OT.step(0.1);
    });
    eq(await labelsProblems(page), []);
    const touching = await run(page, () => OT.drawn().labels.filter((l) => l.y < 450 + 62 && l.y + l.h > 450 - 62).map((l) => l.text));
    eq(touching, [], "подписи на дороге (кромка 62 лп от оси)");
    // Трёхзначное число на щите обычного и железного врага: пиксели щита вокруг числа остаются белыми в границах круга.
    await run(page, SETUP, [6, 0]);
    const ink = await run(page, () => {
      OT.setWave([141, 100, 36], { armored: [36] });
      OT.startWave();
      for (let i = 0; i < 400; i++) { OT.step(0.1); if (OT.state().enemies.length >= 1) break; }
      OT.step(2.5);
      const en = OT.state().enemies[0], st = OT.state(), ln = st.lanes[0];
      const cv = document.getElementById("field"), k = cv.width / 1600, c = cv.getContext("2d");
      const P = ln.points, cum = [0];
      for (let j = 1; j < P.length; j++) cum.push(cum[j - 1] + Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]));
      let i = 0; while (i < P.length - 2 && en.d > cum[i + 1]) i++;
      const t = (en.d - cum[i]) / (cum[i + 1] - cum[i]), x = P[i][0] + (P[i + 1][0] - P[i][0]) * t;
      const y = P[i][1] + (P[i + 1][1] - P[i][1]) * t + (matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : Math.sin(st.simT * 5 + en.id * 1.3) * 3);   // покачивание врага
      // Щит: центр (x+6, y+14), радиус 30. Тёмные пиксели (число) должны лежать внутри круга радиуса 26.
      let outside = 0, inside = 0;
      for (let dy = -34; dy <= 34; dy += 1) for (let dx = -34; dx <= 34; dx += 1) {
        const px = x + 6 + dx, py = y + 14 + dy, d = c.getImageData(Math.round(px * k), Math.round(py * k), 1, 1).data;
        const dark = d[0] < 80 && d[1] < 80 && d[2] < 110;
        if (!dark) continue;
        const r = Math.hypot(dx, dy);
        if (r > 25.5 && r < 27.5) outside++; else if (r <= 24) inside++;
      }
      return { number: en.number, outside, inside };
    });
    eq(ink.number, 141);
    assert(ink.inside > 80, "число на щите не нарисовано: " + JSON.stringify(ink));
    assert(ink.outside < 40, "три знака вылезли на внутреннее кольцо щита: " + JSON.stringify(ink));
  });

  test("Меню паузы не закрывает крепость, кнопки ≥ 48 CSS px", async ({ page }) => {
    for (const [w, h] of [[1024, 600], [1280, 720], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h });
      await run(page, SETUP, [4, 1]);
      await run(page, () => { OT.startWave(); OT.step(1); OT.pause(); OT.step(0.1); });
      const r = await run(page, () => {
        const st = document.getElementById("stage").getBoundingClientRect(), s = st.width / 1600;
        const m = document.getElementById("pause-menu").getBoundingClientRect();
        return { bottom: (m.bottom - st.top) / s, top: (m.top - st.top) / s, left: (m.left - st.left) / s, btns: [...document.querySelectorAll("#pause-menu .btn")].map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)) };
      });
      assert(r.bottom <= 234, `${w}×${h}: меню паузы закрывает флаг крепости (низ ${Math.round(r.bottom)} лп)`);
      assert(r.btns.length === 3 && r.btns.every((b) => b >= 48), `${w}×${h}: кнопки меню ${JSON.stringify(r.btns)}`);
    }
  });

  test("Реальное время: цикл rAF ведёт волну по карте, пауза кнопкой, продолжение, плашка конца волны", async ({ page }) => {
    await run(page, () => { OT.seed(1); OT.newGame({ veteran: true }); OT.setSetting("speed", "fast"); OT.loadLevel(1, 0); OT.setWave([12, 12]); OT.placeTower("A0", 3); OT.placeTower("B0", 4); OT.link("A0", "B0"); });   // без manual
    await page.click("#btn-fight");
    await page.waitForTimeout(2500);
    const s1 = await run(page, () => OT.state());
    eq(s1.phase, "battle");
    assert(s1.enemies.length >= 1 && s1.enemies[0].d > 100, "враг не идёт: " + JSON.stringify(s1.enemies));
    await page.click("#btn-pause");
    const d0 = (await run(page, () => OT.state())).enemies[0].d;
    await page.waitForTimeout(700);
    eq((await run(page, () => OT.state())).enemies[0].d, d0, "на паузе враг стоит");
    await page.click("#btn-resume");
    await page.waitForFunction(() => OT.state().phase === "waveEnd", null, { timeout: 40000 });
    await page.waitForTimeout(900);
    assert(await page.isVisible("#plaque"), "нет плашки «Волна 1 отбита!»");
    eq((await run(page, () => OT.state().hearts)), 10);
    await page.waitForFunction(() => OT.state().phase === "prep" && OT.state().waveIdx === 1, null, { timeout: 8000 });
    assert(!(await page.isVisible("#plaque")), "плашка не ушла");
  });

  // ---------- Д8: звук ----------

  test("Д8: до жеста звук молчит (audioState 'none'), с sound:false осцилляторов нет, со звуком — блипы", async ({ page }) => {
    await run(page, () => { OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(1, 0); });
    eq(await run(page, () => OT.audioState()), "none", "до жеста");
    await run(page, () => { OT.setWave([56]); OT.placeTower("A0", 7); OT.placeTower("B0", 8); OT.link("A0", "B0"); OT.startWave(); OT.runWave(); });
    eq(await run(page, () => OT.audioStats()), { state: "none", osc: 0 }, "до жеста ничего не звучит");
    // Жест: касание страницы создаёт контекст.
    await run(page, () => { OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(1, 0); OT.setSetting("sound", false); });
    await page.mouse.click(5, 5);
    const state = await run(page, () => OT.audioState());
    assert(state === "running" || state === "suspended", "после жеста контекст не создан: " + state);
    // Звук выключен: события есть, осцилляторов нет.
    await run(page, () => { OT.setWave([56, 12]); OT.placeTower("A0", 7); OT.placeTower("B0", 8); OT.link("A0", "B0"); OT.startWave(); OT.runWave(); });
    eq((await run(page, () => OT.audioStats())).osc, 0, "sound:false — осцилляторов нет");
    // Звук включён: блипы на постройку (1), победу (2), удар по боссу (1), промах (1), дошёл (1), конец волны (3).
    await run(page, () => { OT.setSetting("sound", true); OT.step(3); OT.events({ clear: true }); });
    const before = (await run(page, () => OT.audioStats())).osc;
    await run(page, () => { OT.setWave([56, 12]); OT.placeTower("A0", 7); OT.placeTower("B0", 8); OT.unlink("A0", "B0"); OT.link("A0", "B0"); OT.startWave(); OT.runWave(); });
    const after = await run(page, () => OT.audioStats()), ev = await run(page, () => OT.events());
    const count = (t) => ev.filter((e) => e.type === t).length;
    const want = count("beam_built") + 2 * count("enemy_killed") + count("boss_hit") + count("enemy_passed_beam") + count("enemy_reached_castle") + 3 * count("wave_end");
    assert(want >= 8, "в сценарии должны быть все виды событий: " + want);
    if (after.state === "running") eq(after.osc - before, want, "осцилляторов по событиям");
    // Переключатель в меню паузы.
    await run(page, () => { OT.step(3); OT.setWave([56]); OT.startWave(); OT.step(1); OT.pause(); });
    await page.click("#btn-sound");
    eq(await run(page, () => OT.state().settings.sound), false);
    assert((await page.locator("#btn-sound").textContent()).includes("выкл"), "надпись переключателя");
  });

  // ---------- Д9: масштаб ----------

  test("Д9: 1024×600, 1280×800, 1920×1080 — без скролла, #btn-fight, рука, пауза, карта и итоги ≥ 48 CSS px; портрет показывает #rotate", async ({ page }) => {
    for (const [w, h] of [[1024, 600], [1280, 800], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h });
      await run(page, HELPERS);
      const noScroll = () => run(page, () => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight);
      const size = (sel) => run(page, (sel) => { const e = document.querySelector(sel), b = e.getBoundingClientRect(); return { m: Math.min(b.width, b.height), vis: !!e.offsetParent }; }, sel);
      // Титул и карта.
      await run(page, () => { OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); });
      assert(await noScroll(), `${w}×${h}: скролл на титуле`);
      assert((await size("#btn-play")).m >= 48, `${w}×${h}: «Играть»`);
      await run(page, () => OT.show("map"));
      assert(await noScroll(), `${w}×${h}: скролл на карте`);
      const lv = await run(page, () => [...document.querySelectorAll("#scr-map .lvl")].map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)));
      assert(lv.length === 30 && lv.every((m) => m >= 48), `${w}×${h}: кнопки уровней ${Math.min(...lv)}`);
      const fits = await run(page, () => { const st = document.getElementById("stage").getBoundingClientRect(), l = document.getElementById("lands").getBoundingClientRect(); return l.bottom <= st.bottom + 0.5 && l.top >= st.top - 0.5; });
      assert(fits, `${w}×${h}: карта не помещается`);
      // Бой на землях 1 и 6 (в руке 9 и 12 цифр).
      for (const [land, idx, digits] of [[1, 0, 9], [6, 4, 12]]) {
        await run(page, ({ land, idx }) => { OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(land, idx); }, { land, idx });
        assert(await noScroll(), `${w}×${h}: скролл в бою`);
        const f = await size("#btn-fight"), hand = await run(page, () => [...document.querySelectorAll("#hand [data-digit]")].map((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)));
        assert(f.vis && f.m >= 48, `${w}×${h}: «В бою!» ${f.m}`);
        assert(hand.length === digits && hand.every((m) => m >= 48), `${w}×${h} земля ${land}: рука ${JSON.stringify(hand)}`);
        const handFits = await run(page, () => { const b = document.getElementById("btn-fight").getBoundingClientRect(), last = [...document.querySelectorAll("#hand [data-digit]")].pop().getBoundingClientRect(); return last.right <= b.left + 0.5; });
        assert(handFits, `${w}×${h} земля ${land}: рука налезает на «В бой!»`);
        await run(page, () => { OT.startWave(); OT.step(0.5); });
        const p = await size("#btn-pause");
        assert(p.vis && p.m >= 48, `${w}×${h}: «Пауза» ${p.m}`);
        await run(page, () => { OT.pause(); OT.step(0.1); });
        const menu = await run(page, () => [...document.querySelectorAll("#pause-menu .btn")].map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)));
        assert(menu.length === 3 && menu.every((m) => m >= 48), `${w}×${h}: меню паузы ${JSON.stringify(menu)}`);
      }
      // Итоги уровня (земля 3: две подсказки, три строки «ещё лучом»), всё помещается.
      await run(page, () => { OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(3, 3); H.level(); });
      assert(await page.isVisible("#scr-level-end"), `${w}×${h}: нет итогов`);
      assert(await noScroll(), `${w}×${h}: скролл на итогах`);
      const le = await run(page, () => { const st = document.getElementById("stage").getBoundingClientRect(), b = document.getElementById("btn-le-next").getBoundingClientRect(), t = document.getElementById("le-title").getBoundingClientRect(); return { fit: b.bottom <= st.bottom && t.top >= st.top, m: Math.min(b.width, b.height, document.getElementById("btn-le-map").getBoundingClientRect().height) }; });
      assert(le.fit && le.m >= 48, `${w}×${h}: итоги ${JSON.stringify(le)}`);
      assert(!(await page.isVisible("#rotate")), `${w}×${h}: #rotate в горизонтали`);
    }
    await page.setViewportSize({ width: 600, height: 1024 });
    await page.waitForTimeout(100);
    assert(await page.isVisible("#rotate"), "в портрете нет #rotate");
  });

  // ---------- скриншоты (флаг --shot) ----------

  for (const [w, h] of [[1024, 600], [1920, 1080]]) {
    test(`Скриншоты этапа 2 ${w}×${h}`, async ({ page, shot }) => {
      await page.setViewportSize({ width: w, height: h });
      await run(page, HELPERS);
      const sfx = `${w}x${h}`;
      if (w === 1024) {
        // карта мира с несколькими звёздами
        await run(page, () => { OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); for (const [l, i] of [[1, 0], [1, 1], [2, 0]]) { OT.loadLevel(l, i); H.level(); } OT.show("map"); });
        await shot(`karta-mira-${sfx}`);
        // T4 с лучами: три дороги, ствол и ветки
        await run(page, () => {
          OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(1, 4);
          OT.setWave([56, 24, 42, 12, 56, 24, 42, 12]);
          for (const [p, d] of [["A0", 7], ["B0", 8], ["A1", 4], ["B1", 6], ["A2", 3], ["B2", 8], ["D0", 6], ["D1", 7]]) OT.placeTower(p, d);
          for (const [a, b] of [["A0", "B0"], ["A1", "B1"], ["A2", "B2"], ["D0", "D1"], ["A0", "B1"], ["B0", "D1"]]) OT.link(a, b);
          OT.startWave(); for (let i = 0; i < 600; i++) { OT.step(0.1); if (OT.state().enemies.filter((e) => e.alive).length >= 6) break; } OT.step(2);
        });
        await shot(`t4-tri-tropy-luchi-${sfx}`);
        // босс с висящей записью
        await run(page, () => {
          OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(4, 0);
          OT.setWave([56, 24, 56], { armored: [56] });
          OT.placeTower("A0", 7); OT.placeTower("B0", 5); OT.link("A0", "B0"); OT.placeTower("A1", 3); OT.link("B0", "A1");
          OT.placeTower("B1", 6); OT.placeTower("A2", 4); OT.link("B1", "A2");
        });
        await shot(`boss-podskazka-podgotovka-${sfx}`);
        await run(page, () => { OT.removeTower("B1"); OT.removeTower("A2"); OT.startWave(); for (let i = 0; i < 600; i++) { OT.step(0.1); const e = OT.state().enemies[0]; if (e && e.rem === 21 && e.d > 560) break; } });
        await shot(`boss-zametka-${sfx}`);
        // земля 5
        await run(page, () => {
          OT.seed(2); OT.newGame({ veteran: true }); OT.loadLevel(5, 2);
          const s = OT.state(); const f = s.pads.filter((p) => p.fixed);
          const plan = s.wave.plan.slice(0, 2); for (const p of plan) { OT.placeTower(p.a, p.da); OT.placeTower(p.b, p.db); OT.link(p.a, p.b); }
        });
        await shot(`zemlya5-zaranee-stoyashchie-${sfx}`);
        // земля 6: двузначный босс
        await run(page, () => {
          OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(6, 1);
          OT.setWave([92, 21, 76], { armored: [92, 76] });
          const plan = OT.state().wave.plan; for (const p of plan) { OT.placeTower(p.a, p.da); OT.placeTower(p.b, p.db); } for (const p of plan) OT.link(p.a, p.b);
          OT.startWave(); for (let i = 0; i < 900; i++) { OT.step(0.1); const e = OT.state().enemies.find((x) => x.armored && x.rem !== x.number); if (e) break; } OT.step(0.3);
        });
        await shot(`zemlya6-dvuznachnyj-boss-${sfx}`);
      }
      // итоги уровня (земля 3: две подсказки, строки «ещё лучом»)
      await run(page, () => { OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(3, 1); H.level(); });
      await shot(`itogi-urovnya-${sfx}`);
    });
  }
}
