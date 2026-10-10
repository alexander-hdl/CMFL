// Приёмочные и модульные тесты «Обороны таблицы», этап 1 (прототип).
// Запуск: node tools/tests/oborona.test.cjs
const { run } = require("./_harness.cjs");

const DIG = [2, 3, 4, 5, 6, 7, 8, 9];
const F1 = { layout: "L1", hand: DIG, fixed: {}, hold: true, waves: [{ enemies: [], gap: 3000 }] };

run("oborona", async (t, page) => {
  // ---- помощники ----
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // после действий, меняющих экран, рисуем кадр (render() заодно обновляет DOM-полосы), чтобы проверки DOM не ждали requestAnimationFrame
  const api = (name, ...args) => ev(([n, a]) => { const r = window.OBORONA.api[n](...a); if (["reset", "loadLevel", "retry", "fight", "pause", "resume", "endWave"].includes(n)) window.OBORONA.render(); return r; }, [name, args]);
  const st = () => ev(() => window.OBORONA.state());
  const load = async (fx) => { await ev(() => window.OBORONA.api.manual(true)); return ev((f) => { const r = window.OBORONA.api.loadLevel(f); window.OBORONA.render(); return r; }, fx); };
  const setup = (towers, beams) => ev(([tw, bm]) => {
    const a = window.OBORONA.api;
    Object.keys(tw).forEach((p) => a.placeTower(p, tw[p]));
    bm.forEach((b) => a.beam(b[0], b[1]));
    window.OBORONA.render();
    return window.OBORONA.state();
  }, [towers, beams]);
  const padPx = (id) => ev((i) => { const O = window.OBORONA, v = O.state().view, p = O.layouts[O.state().level.layout].padById[i]; return { x: v.ox + p.x * v.s, y: v.oy + p.y * v.s, s: v.s }; }, id);
  const tilePx = (v) => ev((n) => { const r = document.querySelector('.tile[data-v="' + n + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, v);
  const dragMouse = async (from, to) => { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up(); };
  const clickAt = async (p) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };
  // шаги по 100 мс, пока условие (по state) не выполнится
  const stepUntil = (cond, maxIter = 600, stepMs = 100) => ev(([c, mi, sm]) => {
    const f = new Function("s", "return (" + c + ")(s)");
    for (let i = 0; i < mi; i++) { const s = window.OBORONA.api.step(sm); if (f(s)) return s; }
    return window.OBORONA.state();
  }, [cond, maxIter, stepMs]);

  // ================= T1-1 logic =================
  console.log("-- T1-1 logic");
  const forms = { star: ["звезда", "звезды", "звёзд"], enemy: ["враг", "врага", "врагов"], heart: ["сердечко", "сердечка", "сердечек"], level: ["уровень", "уровня", "уровней"] };
  const idx = { 1: 0, 2: 1, 5: 2, 11: 2, 21: 0, 22: 1, 25: 2, 100: 2, 101: 0, 111: 2 };
  const pl = await ev(([f, ix]) => {
    const L = window.OBORONA.logic, bad = [];
    Object.keys(f).forEach((k) => Object.keys(ix).forEach((n) => {
      const got = L.plural(Number(n), f[k][0], f[k][1], f[k][2]);
      if (got !== f[k][ix[n]]) bad.push(k + " " + n + ": " + got);
    }));
    return bad;
  }, [forms, idx]);
  t.eq(pl, [], "plural: 1, 2, 5, 11, 21, 22, 25, 100, 101, 111 для звезда/враг/сердечко/уровень");
  const lg = await ev(() => {
    const L = window.OBORONA.logic, D = L.DIGITS, H6 = D.concat([10, 20, 30, 40]);
    return {
      word: [L.word(8, "heart"), L.word(1, "heart"), L.word(3, "time"), L.word(2, "star")],
      fk: [L.factKey(8, 7), L.factKey(7, 8), L.factKey(23, 4), L.factKey(4, 20)],
      pk: L.parseKey("7x8"),
      bl: [L.beamLabel(7, 8), L.beamLabel(20, 4)],
      pf: [L.pairsFor(24), L.pairsFor(12), L.pairsFor(16), L.pairsFor(18), L.pairsFor(36), L.pairsFor(56), L.pairsFor(7), L.pairsFor(60, H6), L.pairsFor(80, H6)],
      pr: [Array.from(L.products(D)).sort((a, b) => a - b)],
      cf: [L.canFinish(21), L.canFinish(13), L.canFinish(11), L.canFinish(2), L.canFinish(0), L.canFinish(1), L.canFinish(3), L.canFinish(5), L.canFinish(7)],
      hit: [
        L.hitResult({ value: 56, kind: "normal" }, 56), L.hitResult({ value: 56, kind: "normal" }, 42), L.hitResult({ value: 56, kind: "boss" }, 35),
        L.hitResult({ value: 21, kind: "boss" }, 21), L.hitResult({ value: 56, kind: "boss" }, 63), L.hitResult({ value: 56, kind: "boss" }, 54),
        L.hitResult({ value: 92, kind: "boss" }, 80, H6), L.hitResult({ value: 21, kind: "boss" }, 35), L.hitResult({ value: 24, kind: "normal" }, 15)
      ],
      si: [L.segmentIntersection([0, 0], [10, 0], [5, -5], [5, 5]), L.segmentIntersection([0, 0], [10, 0], [0, 1], [10, 1]), L.segmentIntersection([0, 0], [4, 0], [5, -5], [5, 5])],
      pa: [L.pointAt(window.OBORONA.layouts.L4.paths[0], 0.5), L.pointAt(window.OBORONA.layouts.L1.paths[0], 0), L.pointAt(window.OBORONA.layouts.L1.paths[0], 1)],
      stars: [10, 8, 7, 4, 3, 0].map(L.starsFor),
      ck: [L.confusionKey(56, 48), L.confusionKey(48, 56)]
    };
  });
  t.eq(lg.word, ["8 сердечек", "1 сердечко", "3 раза", "2 звезды"], "word: «8 сердечек», «1 сердечко», «3 раза»");
  t.eq(lg.fk, ["7x8", "7x8", "4x23", "4x20"], "factKey: 8,7 и 7,8 — одна карточка");
  t.eq(lg.pk, [7, 8], "parseKey");
  t.eq(lg.bl, ["7 × 8 = 56", "20 × 4 = 80"], "beamLabel");
  t.eq(lg.pf[0], [[3, 8], [4, 6]], "pairsFor(24)");
  t.eq(lg.pf[1], [[2, 6], [3, 4]], "pairsFor(12)");
  t.eq(lg.pf[2], [[2, 8], [4, 4]], "pairsFor(16)");
  t.eq(lg.pf[3], [[2, 9], [3, 6]], "pairsFor(18)");
  t.eq(lg.pf[4], [[4, 9], [6, 6]], "pairsFor(36)");
  t.eq(lg.pf[5], [[7, 8]], "pairsFor(56)");
  t.eq(lg.pf[6], [], "pairsFor(7) — пар нет");
  t.eq(lg.pf[7], [[2, 30], [3, 20], [6, 10]], "pairsFor(60, рука земли 6)");
  t.eq(lg.pf[8], [[2, 40], [4, 20], [8, 10]], "pairsFor(80, рука земли 6)");
  t.ok(lg.pr[0][0] === 4 && lg.pr[0][lg.pr[0].length - 1] === 81 && ![5, 7, 11].some((x) => lg.pr[0].includes(x)) && lg.pr[0].includes(56), "products(2–9): от 4 до 81, без 5, 7, 11");
  t.eq(lg.cf, [true, true, false, false, false, false, false, false, false], "canFinish: 21 да, 13 да (4 + 9), 11/2/0/1/3/5/7 нет");
  t.eq(lg.hit[0], { kind: "kill", newValue: 0, text: "" }, "hitResult: 56 и луч 56 — kill");
  t.eq(lg.hit[1], { kind: "pass", newValue: 56, text: "56, а луч даёт 42" }, "hitResult: 56 и луч 42 — pass");
  t.eq(lg.hit[2], { kind: "reduce", newValue: 21, text: "56 − 35 = 21" }, "hitResult: босс 56 и луч 35 — «56 − 35 = 21»");
  t.eq(lg.hit[3].kind, "kill", "hitResult: босс 21 и луч 21 — kill");
  t.eq(lg.hit[4], { kind: "pass", newValue: 56, text: "56, а луч даёт 63" }, "hitResult: босс 56 и луч 63 — pass");
  t.eq(lg.hit[5], { kind: "pass", newValue: 56, text: "Останется 2 — такого луча нет" }, "hitResult: босс 56 и луч 54 — «Останется 2 — такого луча нет»");
  t.eq(lg.hit[6], { kind: "reduce", newValue: 12, text: "92 − 80 = 12" }, "hitResult: босс 92 и луч 80 (рука земли 6)");
  t.eq(lg.hit[7], { kind: "pass", newValue: 21, text: "21, а луч даёт 35" }, "hitResult: босс 21 и луч 35 — «21, а луч даёт 35»");
  t.eq(lg.hit[8], { kind: "pass", newValue: 24, text: "24, а луч даёт 15" }, "hitResult: обычный враг не теряет число от меньшего луча");
  t.eq(lg.si[0], { x: 5, y: 0, u: 0.5, v: 0.5 }, "segmentIntersection: пересечение в (5, 0)");
  t.eq([lg.si[1], lg.si[2]], [null, null], "segmentIntersection: параллельные и не доходящие — null");
  t.eq(lg.pa[0], { x: 720, y: 450 }, "pointAt(L4, 0,5) = (720, 450)");
  t.eq([lg.pa[1], lg.pa[2]], [{ x: 0, y: 480 }, { x: 1440, y: 300 }], "pointAt: начало и конец дорожки L1");
  t.eq(lg.stars, [3, 3, 2, 2, 1, 1], "starsFor: 10, 8 → 3; 7, 4 → 2; 3, 0 → 1");
  t.eq(lg.ck, ["48|56", "48|56"], "confusionKey(56, 48) = confusionKey(48, 56) = «48|56»");

  // ================= T1-2 раскладка =================
  console.log("-- T1-2 раскладка L1");
  const lay = await ev(() => {
    const O = window.OBORONA, L = O.logic.prepareLayout(O.logic.RAW_LAYOUTS.L1);
    return { links: L.links.map((l) => ({ id: l.id, a: l.a, b: l.b, cross: l.cross, lab: l.labelAt })), len: L.paths[0].len, val: O.logic.validateLayout(L), all: Object.keys(O.layouts).map((k) => [k, O.logic.validateLayout(O.layouts[k])]), first: L.links[0] };
  });
  const exp = [["A-B", 0.1657, 250, 480, 183, 395], ["B-C", 0.338, 510, 480, 443, 565], ["D-E", 0.7681, 1090, 300, 1023, 215], ["E-F", 0.9404, 1350, 300, 1283, 385]];
  const near = (a, b, e) => Math.abs(a - b) <= e;
  t.ok(lay.links.length === 4 && exp.every((e, i) => { const l = lay.links[i], c = l.cross[0]; return l.id === e[0] && l.cross.length === 1 && c.path === 0 && near(c.t, e[1], 0.002) && near(c.x, e[2], 2) && near(c.y, e[3], 2) && near(l.lab.x, e[4], 2) && near(l.lab.y, e[5], 2); }), "prepareLayout(L1): cross (допуск 0,002 / 2 ед.) и labelAt совпадают с разделом 4");
  t.ok(near(lay.len, 1509.1, 0.1), "длина дорожки L1 ≈ 1509,1");
  t.eq(lay.val, [], "validateLayout(L1) → []");
  t.eq(lay.all.map((x) => x[1].length), [0, 0, 0, 0], "validateLayout: L1–L4 без нарушений");
  t.eq([lay.first.id, lay.first.a, lay.first.b], ["A-B", "A", "B"], "prepareLayout(RAW.L1).links[0] — связь A-B");

  // ================= T1-3 правила башен =================
  console.log("-- T1-3 правила башен");
  await load(F1);
  await setup({ A: 7, C: 6 }, []);
  t.eq((await api("beam", "A", "C")).reason, "no-link", "луч между несвязанными A и C — «no-link»");
  t.eq((await api("beam", "A", "B")).reason, "no-tower", "луч к пустой площадке — «no-tower»");
  await api("placeTower", "B", 8);
  t.eq(await api("beam", "A", "B"), { ok: true, id: "A-B" }, "луч A → B построен");
  t.eq((await api("beam", "A", "B")).reason, "exists", "повторный луч — «exists»");
  t.eq((await api("beam", "B", "A")).reason, "exists", "обратный луч на той же связи — «exists»");
  t.eq((await api("beam", "A", "A")).reason, "same", "луч из башни в себя — «same»");
  t.eq((await api("beam", "A", "Z")).reason, "no-pad", "неизвестная площадка — «no-pad»");
  let s0 = await st();
  t.ok(s0.beams[0].label === "7 × 8 = 56" && s0.beams[0].product === 56 && s0.beams[0].edits === 1 && s0.beams[0].phase === "prep", "луч 7 × 8 = 56, edits 1, phase prep");
  t.eq(await api("placeTower", "A", 9), { ok: true, changed: true }, "смена цифры башни с лучом");
  s0 = await st();
  t.ok(s0.beams.length === 1 && s0.beams[0].product === 72 && s0.beams[0].label === "9 × 8 = 72" && s0.beams[0].edits === 2, "смена цифры: луч остался, product 72, подпись «9 × 8 = 72», edits 2");
  t.eq((await api("placeTower", "A", 10)).reason, "not-in-hand", "цифры 10 нет в руке 2–9");
  t.eq((await api("placeTower", "Q", 5)).reason, "no-pad", "placeTower: неизвестная площадка");
  await api("removeTower", "A");
  s0 = await st();
  t.ok(s0.beams.length === 0 && !s0.towers.some((x) => x.pad === "A"), "removeTower рвёт лучи башни");
  // «full»: у башни не больше двух лучей (на L1 у площадки не больше двух связей, поэтому L2: у M четыре связи)
  await load({ layout: "L2", hand: DIG, fixed: {}, hold: true, waves: [{ enemies: [] }] });
  await setup({ A: 2, M: 3, C: 4, D: 5, E: 6 }, []);
  t.ok((await api("beam", "A", "M")).ok && (await api("beam", "M", "C")).ok, "L2: два луча у башни M построены");
  t.eq((await api("beam", "D", "M")).reason, "full", "третий луч у M — «full»");
  t.eq((await api("beam", "M", "E")).reason, "full", "четвёртый луч у M — «full»");
  t.eq((await st()).towers.find((x) => x.pad === "M").beams, 2, "у M ровно два луча");
  // перестановка и обмен
  await load(F1);
  await setup({ A: 7, B: 8 }, [["A", "B"]]);
  t.eq(await api("moveTower", "A", "C"), { ok: true, swapped: false }, "moveTower на пустую площадку");
  s0 = await st();
  t.ok(s0.beams.length === 0 && s0.towers.some((x) => x.pad === "C" && x.value === 7) && !s0.towers.some((x) => x.pad === "A"), "переезд: башня на C, лучи порваны");
  await api("moveTower", "C", "B");
  s0 = await st();
  t.ok(s0.towers.find((x) => x.pad === "B").value === 7 && s0.towers.find((x) => x.pad === "C").value === 8, "moveTower на занятую — обмен цифрами");
  t.eq((await api("moveTower", "D", "E")).reason, "no-tower", "moveTower без башни — «no-tower»");

  // ================= П1 подпись над каждым лучом =================
  console.log("-- П1 подписи лучей");
  const checkLabels = () => ev(() => {
    window.OBORONA.render();
    const s = window.OBORONA.state(), L = window.OBORONA.logic;
    return {
      ok: s.beams.every((b) => b.label === L.beamLabel(b.a, b.b) && s.frame.labels.some((l) => l.beam === b.id && l.text === b.label && l.w > 0 && l.h > 0)) && s.frame.labels.length === s.beams.length,
      n: s.beams.length, nl: s.frame.labels.length, texts: s.frame.labels.map((l) => l.text).sort(), flash: s.beams.map((b) => b.flash)
    };
  });
  await load(F1);
  await setup({ A: 7, B: 8, C: 6, D: 3, E: 8, F: 4 }, [["A", "B"], ["C", "B"], ["D", "E"], ["F", "E"]]);
  let c1 = await checkLabels();
  t.ok(c1.ok && c1.n === 4, "подготовка: у всех 4 лучей есть подпись, число подписей = числу лучей");
  t.eq(c1.texts, ["3 × 8 = 24", "4 × 8 = 32", "6 × 8 = 48", "7 × 8 = 56"], "тексты подписей: «7 × 8 = 56», «6 × 8 = 48», «3 × 8 = 24», «4 × 8 = 32»");
  const gr = await ev(() => {
    const a = window.OBORONA.api;
    a.fight(); a.spawn(30);
    for (let i = 0; i < 300; i++) { const s = a.step(100); if (s.beams.some((b) => b.flash === "grey")) return true; }
    return false;
  });
  t.ok(gr, "луч мигнул серым (flash «grey») при проходе врага 30");
  c1 = await checkLabels();
  t.ok(c1.ok && c1.flash.includes("grey"), "подписи на месте во время серой вспышки");
  await api("pause");
  c1 = await checkLabels();
  t.ok(c1.ok, "подписи на месте на паузе");
  await api("placeTower", "C", 9);
  c1 = await checkLabels();
  t.ok(c1.ok && c1.texts.includes("9 × 8 = 72") && !c1.texts.includes("6 × 8 = 48"), "после смены цифры C на 9 подпись «9 × 8 = 72»");
  await api("removeTower", "D");
  c1 = await checkLabels();
  t.ok(c1.ok && c1.n === 3 && !c1.texts.includes("3 × 8 = 24"), "после removeTower(D) луча D-E и его подписи нет");
  await load({ layout: "L1", hand: DIG.concat([10, 20, 30, 40]), fixed: {}, hold: true, waves: [{ enemies: [] }] });
  await setup({ A: 20, B: 4 }, [["A", "B"]]);
  c1 = await checkLabels();
  t.ok(c1.ok && c1.texts[0] === "20 × 4 = 80", "рука земли 6: подпись «20 × 4 = 80»");

  // ================= П2 враг 56 =================
  console.log("-- П2 враг 56 и лучи 6 × 7, 7 × 8, 8 × 7");
  for (const flip of [false, true]) {
    await load(F1);
    await setup({ A: 6, B: 7, C: 8 }, [["A", "B"], flip ? ["C", "B"] : ["B", "C"]]);
    const lab = (await st()).beams.find((b) => b.id === "B-C").label;
    t.eq(lab, flip ? "8 × 7 = 56" : "7 × 8 = 56", "подпись луча B-C: " + lab);
    await api("fight"); await api("spawn", 56);
    const s1 = await stepUntil("s => s.enemies.length && s.enemies[0].t > 0.1657");
    t.ok(s1.enemies.length === 1 && s1.enemies[0].value === 56 && s1.texts.some((x) => x.text === "56, а луч даёт 42") && s1.events.some((e) => e.type === "pass" && e.beam === "A-B"), "56 прошёл 6 × 7 без урона: число 56, «56, а луч даёт 42»");
    const s2 = await stepUntil("s => s.enemies.length === 0");
    t.ok(s2.enemies.length === 0 && s2.events.some((e) => e.type === "kill" && e.beam === "B-C" && e.product === 56), "56 исчез в луче " + lab);
    t.eq(s2.hearts, 10, "сердечки целы");
  }

  // ================= П3 враг 24 =================
  console.log("-- П3 враг 24: 3 × 8 и 4 × 6");
  for (const [x, y] of [[3, 8], [4, 6]]) {
    await load(F1);
    await setup({ A: x, B: y }, [["A", "B"]]);
    await api("fight"); await api("spawn", 24);
    const s = await api("step", 7000).then(st);
    t.ok(s.enemies.length === 0 && s.events.some((e) => e.type === "kill" && e.beam === "A-B") && s.hearts === 10, "24 исчез в луче " + x + " × " + y);
  }

  // ================= П4 босс 56 =================
  console.log("-- П4 босс 56");
  await load(F1);
  await setup({ A: 5, B: 7, C: 3 }, [["B", "A"], ["B", "C"]]);
  t.eq((await st()).beams.map((b) => b.label).sort(), ["7 × 3 = 21", "7 × 5 = 35"], "подписи лучей босса: «7 × 5 = 35» и «7 × 3 = 21»");
  await api("fight"); await api("spawn", 56, { kind: "boss" });
  const b1 = await stepUntil("s => s.enemies.length && s.enemies[0].value !== 56");
  await ev(() => window.OBORONA.render());
  const b1f = await st();
  t.ok(b1.enemies[0].value === 21 && b1.texts.some((x) => x.text === "56 − 35 = 21") && b1f.frame.enemies[0].text === "21", "после 7 × 5: над боссом «56 − 35 = 21», на щите число 21");
  t.ok(b1.events.some((e) => e.type === "reduce" && e.beam === "A-B"), "событие reduce на луче A-B");
  const b2 = await stepUntil("s => s.enemies.length === 0");
  t.ok(b2.enemies.length === 0 && b2.events.some((e) => e.type === "kill" && e.beam === "B-C"), "луч 7 × 3 побеждает босса 21");
  await load(F1);
  await setup({ A: 5, B: 7 }, [["B", "A"]]);
  await api("fight"); await api("spawn", 21, { kind: "boss" });
  const b3 = await stepUntil("s => s.texts.length > 0");
  t.ok(b3.enemies[0].value === 21 && b3.texts.some((x) => x.text === "21, а луч даёт 35"), "босс 21 и луч 7 × 5: «21, а луч даёт 35», число 21");
  await load(F1);
  await setup({ A: 6, B: 9 }, [["A", "B"]]);
  await api("fight"); await api("spawn", 56, { kind: "boss" });
  const b4 = await stepUntil("s => s.texts.length > 0");
  t.ok(b4.enemies[0].value === 56 && b4.texts.some((x) => x.text === "Останется 2 — такого луча нет"), "босс 56 и луч 6 × 9 = 54: «Останется 2 — такого луча нет», число 56");

  // ================= П5 земля деления =================
  console.log("-- П5 земля деления: башня 7, враг 56");
  const L4 = { layout: "L4", hand: DIG, fixed: { B: 7 }, hold: true, waves: [{ enemies: [] }] };
  await load(L4);
  t.eq((await api("placeTower", "B", 5)).reason, "fixed", "неподвижную башню B нельзя сменить");
  t.eq((await api("moveTower", "B", "A")).reason, "fixed", "неподвижную башню B нельзя переставить");
  t.eq((await api("removeTower", "B")).reason, "fixed", "неподвижную башню B нельзя убрать");
  t.ok((await st()).towers.some((x) => x.pad === "B" && x.fixed && x.value === 7), "башня 7 стоит на B с начала уровня");
  const won = [];
  for (const d of DIG) {
    await load(L4);
    await api("placeTower", "A", d); await api("beam", "A", "B");
    await api("fight"); await api("spawn", 56);
    const s = await api("step", 10000).then(st);
    if (s.events.some((e) => e.type === "kill")) won.push(d);
  }
  t.eq(won, [8], "из напарников 2–9 к башне 7 врага 56 побеждает только 8");

  // ================= П6 подготовка без таймера, пауза =================
  console.log("-- П6 подготовка и пауза");
  const W3 = { layout: "L1", hand: DIG, fixed: {}, waves: [{ enemies: [56, 24, 18], gap: 3000 }] };
  await load(W3);
  await api("step", 600000);
  const p6 = await st();
  const dom = await ev(() => ({ timer: !!document.querySelector(".timer, [class*=timer], [id*=timer]"), clock: /\d+:\d\d/.test(document.body.innerText) }));
  t.ok(p6.phase === "prep" && p6.battleMs === 0 && p6.enemies.length === 0, "подготовка: после 10 минут фаза prep, battleMs 0, врагов нет");
  t.ok(!dom.timer && !dom.clock, "в DOM нет таймера и текста вида «м:сс»");
  t.ok(!Object.keys(p6).concat(Object.keys(p6.level)).some((k) => /timer|countdown|deadline|remaining/i.test(k)), "в state() нет полей с обратным отсчётом");
  await api("fight");
  let frozen = true;
  for (let i = 0; i < 20; i++) {
    await api("step", 500);
    const r = await api("pause");
    const a = await st();
    await api("step", 2000);
    const b = await st();
    if (!r.ok || JSON.stringify(a.enemies.map((e) => e.t)) !== JSON.stringify(b.enemies.map((e) => e.t)) || a.battleMs !== b.battleMs) frozen = false;
    await api("resume");
  }
  t.ok(frozen, "пауза 20 раз подряд: враги и battleMs стоят");
  t.ok((await st()).battleMs >= 10000, "после пауз время боя идёт дальше");
  await load(F1);
  await setup({ A: 6, B: 7 }, [["A", "B"]]);
  await api("fight"); await api("spawn", 56); await api("step", 1000); await api("pause");
  t.ok((await api("breakBeam", "A-B")).ok, "на паузе: луч A-B разорван");
  t.ok((await api("placeTower", "A", 8)).ok, "на паузе: смена цифры A на 8");
  t.eq(await api("beam", "A", "B"), { ok: true, id: "A-B" }, "на паузе: луч перестроен");
  const pb = await st();
  t.ok(pb.beams[0].phase === "battle" && pb.beams[0].label === "8 × 7 = 56", "у нового луча phase «battle», подпись «8 × 7 = 56»");
  await api("resume");
  const pk = await api("step", 6000).then(st);
  t.ok(pk.enemies.length === 0 && pk.events.some((e) => e.type === "kill" && e.beam === "A-B"), "после resume враг 56 побеждён новым лучом");
  await load(F1);
  await setup({ A: 6, B: 7 }, []);
  await api("fight");
  t.eq([(await api("beam", "A", "B")).reason, (await api("placeTower", "C", 5)).reason, (await api("removeTower", "A")).reason], ["locked", "locked", "locked"], "без паузы в бою постройка закрыта — «locked»");
  // луч, построенный на паузе позади врага, на него не действует
  await load(F1);
  await setup({ A: 6, B: 7, C: 8 }, [["A", "B"]]);
  await api("fight"); await api("spawn", 56);
  await stepUntil("s => s.enemies.length && s.enemies[0].t > 0.2");
  await api("pause"); await api("beam", "B", "C"); await api("resume");
  t.eq((await api("step", 15000).then(st)).events.filter((e) => e.type === "kill").length, 1, "луч B-C построен на паузе впереди врага (t 0,2 < 0,338) — действует");
  await load(F1);
  await setup({ A: 6, B: 7, C: 8 }, []);
  await api("fight"); await api("spawn", 56);
  await stepUntil("s => s.enemies.length && s.enemies[0].t > 0.4");
  await api("pause"); await api("beam", "B", "C"); await api("resume");
  t.eq((await api("step", 3000).then(st)).events.filter((e) => e.type === "kill").length, 0, "луч B-C, построенный на паузе позади врага (t 0,4 > 0,338), на него не действует");

  // ================= T1-4 касания =================
  console.log("-- T1-4 захват 40 px, касания");
  await load(F1);
  let B = await padPx("B");
  const R1 = 44 * B.s;
  await dragMouse(await tilePx(7), { x: B.x, y: B.y + R1 + 35 });
  t.ok((await st()).towers.some((x) => x.pad === "B" && x.value === 7), "плитка 7 отпущена в PAD_R·s + 35 px от B — башня 7 на B");
  await load(F1);
  await dragMouse(await tilePx(7), { x: B.x, y: B.y + R1 + 50 });
  t.eq((await st()).towers.length, 0, "плитка 7 отпущена в PAD_R·s + 50 px от B — башни нет");
  await load(F1);
  await dragMouse(await tilePx(5), await padPx("A"));
  await dragMouse(await tilePx(6), B);
  t.eq((await st()).towers.map((x) => x.pad + x.value).sort(), ["A5", "B6"], "перетаскиванием поставлены две башни");
  const Apx = await padPx("A");
  await clickAt(Apx); await clickAt(B);
  const bt = await st();
  t.ok(bt.beams.length === 1 && bt.beams[0].id === "A-B" && bt.beams[0].a === 5 && bt.beams[0].b === 6 && bt.beams[0].label === "5 × 6 = 30", "касание башни A, затем соседней B — луч «5 × 6 = 30» (по порядку касаний)");
  // выбор луча, ✕
  await ev(() => window.OBORONA.render());
  const lbl = (await st()).frame.labels[0], v1 = (await st()).view;
  await clickAt({ x: v1.ox + lbl.x * v1.s, y: v1.oy + lbl.y * v1.s });
  await ev(() => window.OBORONA.render());
  const cr = (await st()).frame.cross;
  t.ok(cr && cr.beam === "A-B" && cr.r * 2 * v1.s >= 47.9, "касание плашки выбирает луч: рядом кнопка «✕» от 48 px");
  await clickAt({ x: v1.ox + cr.x * v1.s, y: v1.oy + cr.y * v1.s });
  t.eq((await st()).beams.length, 0, "касание «✕» рвёт луч");
  // касание плитки, затем площадки
  await clickAt(await tilePx(7));
  t.ok(await ev(() => !!document.querySelector(".tile.sel[data-v='7']")), "касание плитки выбирает её (золотая рамка)");
  await clickAt(await padPx("C"));
  t.ok((await st()).towers.some((x) => x.pad === "C" && x.value === 7), "касание плитки, затем площадки C — башня 7 на C");
  // перетаскивание башни: переезд, обмен, убирание
  const Cpx = await padPx("C"), Epx = await padPx("E");
  await dragMouse(Cpx, Epx);
  t.ok((await st()).towers.some((x) => x.pad === "E" && x.value === 7) && !(await st()).towers.some((x) => x.pad === "C"), "башня перетащена с C на E");
  await dragMouse(Epx, Apx);
  t.eq((await st()).towers.filter((x) => x.pad === "A" || x.pad === "E").map((x) => x.pad + x.value).sort(), ["A7", "E5"], "перетаскивание на занятую площадку — обмен цифрами");
  await dragMouse(Epx, { x: Epx.x + 40, y: Epx.y + 200 });
  t.ok(!(await st()).towers.some((x) => x.pad === "E"), "башня, отпущенная вне площадок, убирается");
  // отказы с текстом
  await load(F1);
  await setup({ A: 5 }, []);
  await clickAt(await padPx("A")); await clickAt(await padPx("B"));
  t.ok((await st()).textLog.includes("Сначала поставь башню"), "башня выбрана, касание пустой связанной площадки — «Сначала поставь башню»");
  await load({ layout: "L2", hand: DIG, fixed: {}, hold: true, waves: [{ enemies: [] }] });
  await setup({ A: 2, M: 3, C: 4, D: 5 }, [["A", "M"], ["M", "C"]]);
  await clickAt(await padPx("D")); await clickAt(await padPx("M"));
  t.ok((await st()).textLog.includes("У башни уже два луча") && (await st()).beams.length === 2, "третий луч у M: «У башни уже два луча»");

  // ================= бой и пауза руками =================
  console.log("-- кнопки «В бой!», «Пауза», касания в бою");
  await load(W3);
  await setup({ A: 8, B: 7 }, [["A", "B"]]);
  await page.click("#fightBtn");
  let ui = await ev(() => ({ ph: window.OBORONA.state().phase, fight: getComputedStyle(document.getElementById("fightBtn")).visibility, pause: getComputedStyle(document.getElementById("pauseBtn")).visibility, off: document.getElementById("hand").classList.contains("off"), title: getComputedStyle(document.querySelector(".rtitle")).display }));
  t.ok(ui.ph === "battle" && ui.fight === "hidden" && ui.pause === "visible" && ui.off && ui.title === "none", "«В бой!»: фаза battle, кнопка «В бой!» скрыта, «Пауза» видна, плитки затемнены, заголовка ленты нет");
  await api("step", 500);
  await clickAt(await padPx("C"));
  await page.waitForTimeout(150);
  t.ok((await ev(() => document.getElementById("toast").textContent)) === "Нажми „Пауза“, чтобы перестроить лучи" && (await st()).towers.length === 2, "касание поля в бою: тост «Нажми „Пауза“, чтобы перестроить лучи», башни не меняются");
  await page.click("#pauseBtn");
  await page.waitForTimeout(100);
  ui = await ev(() => ({ paused: window.OBORONA.state().paused, ov: getComputedStyle(document.getElementById("pauseOv")).visibility, txt: document.getElementById("pauseOv").innerText, off: document.getElementById("hand").classList.contains("off") }));
  t.ok(ui.paused && ui.ov === "visible" && /Пауза/.test(ui.txt) && /Лучи можно перестроить/.test(ui.txt) && /Дальше/.test(ui.txt) && !ui.off, "пауза одним касанием: плашка «Пауза / Лучи можно перестроить / Дальше», плитки доступны");
  await dragMouse(await tilePx(9), await padPx("C"));
  t.ok((await st()).towers.some((x) => x.pad === "C" && x.value === 9), "на паузе башню можно поставить перетаскиванием");
  await page.keyboard.press("Space");
  t.ok(!(await st()).paused, "пробел снимает паузу");
  await page.keyboard.press("Escape");
  t.ok((await st()).paused, "Escape ставит паузу");
  await page.click("#resumeBtn");
  t.ok(!(await st()).paused, "«Дальше» снимает паузу");
  await page.click("#soundBtn");
  t.eq(await ev(() => document.getElementById("soundBtn").getAttribute("aria-pressed")), "false", "выключатель звука работает");
  await page.click("#soundBtn");

  // ================= T1-5 крепость =================
  console.log("-- T1-5 крепость");
  await load(F1);
  await api("fight"); await api("spawn", 56);
  const g1 = await api("step", 40000).then(st);
  t.ok(g1.hearts === 9 && g1.textLog.includes("56 = 7 × 8") && g1.events.some((e) => e.type === "gate") && g1.ribbon.length === 0 && g1.enemies.length === 0, "без лучей враг 56 дошёл: сердечек 9, текст «56 = 7 × 8», событие gate");
  await load(F1);
  await api("fight");
  for (let i = 0; i < 11; i++) await api("spawn", 42);
  const g2 = await api("step", 40000).then(st);
  t.ok(g2.hearts === 0 && g2.events.filter((e) => e.type === "gate").length === 11, "11 врагов подряд: сердечек 0, не меньше");
  t.ok(g2.phase === "battle" && g2.result === null, "при 0 сердечек уровень не кончился досрочно");
  await load({ layout: "L1", hand: DIG, fixed: {}, waves: [{ enemies: [56, 56], gap: 3000 }] });
  await api("fight");
  const g3 = await api("stepUntilWaveEnd");
  const g3s = await st();
  t.ok(g3.ok && g3s.hearts === 8 && g3s.phase === "levelEnd" && g3s.toast === "Волна позади: 0 из 2", "волна без лучей: «Волна позади: 0 из 2», сердечек 8, уровень закончен");
  await ev(() => window.OBORONA.render());
  t.ok(await ev(() => { const e = document.getElementById("endCard"); return getComputedStyle(e).visibility === "visible" && /Волна позади: 0 из 2/.test(e.innerText) && /Сохранено 8 сердечек из 10/.test(e.innerText) && /Ещё раз/.test(e.innerText); }), "экран конца: «Волна позади: 0 из 2», «Сохранено 8 сердечек из 10», «Ещё раз»");

  // ================= T1-6 демо-волна =================
  console.log("-- T1-6 демонстрационная волна");
  await ev(() => window.OBORONA.api.manual(true));
  await api("reset");
  const d0 = await st();
  t.eq(d0.ribbon.map((r) => r.value), [24, 56, 18, 42, 24, 56, 42, 18], "лента демо-волны: 24, 56, 18, 42, 24, 56, 42, 18");
  t.ok(d0.phase === "prep" && d0.hearts === 10 && d0.level.waveCount === 1 && d0.towers.length === 0, "демо открывается в подготовке, 10 сердечек, пустое поле");
  t.eq(await ev(() => document.querySelector(".rtitle").innerText), "Следующая волна", "заголовок ленты «Следующая волна»");
  t.eq((await api("applySolution")).ok, true, "applySolution");
  const d1 = await st();
  t.eq(d1.towers.map((x) => x.pad + x.value).sort(), ["A8", "B7", "C6", "D8", "E3", "F6"], "решение демо: A 8, B 7, C 6, D 8, E 3, F 6");
  t.eq(d1.beams.map((b) => b.label).sort(), ["3 × 6 = 18", "7 × 6 = 42", "8 × 3 = 24", "8 × 7 = 56"], "лучи решения: 56, 42, 24, 18");
  await api("fight");
  const d2 = await api("stepUntilWaveEnd");
  const d3 = await st();
  t.ok(d2.ok && d3.hearts === 10 && d3.events.filter((e) => e.type === "kill").length === 8 && d3.events.every((e) => e.type !== "gate"), "демо-волна: все 8 врагов побеждены, сердечки целы");
  t.ok(d3.ribbon.every((r) => r.status === "won") && d3.toast === "Волна отбита!" && d3.phase === "levelEnd", "тост «Волна отбита!», фаза levelEnd");
  t.ok(d2.ms > 40000 && d2.ms < 90000, "демо-волна идёт около минуты (" + Math.round(d2.ms / 1000) + " с)");
  await ev(() => window.OBORONA.render());
  t.ok(await ev(() => { const e = document.getElementById("endCard"); return getComputedStyle(e).visibility === "visible" && /Волна отбита!/.test(e.innerText) && /Сохранено 10 сердечек из 10/.test(e.innerText); }), "экран конца: «Волна отбита!», «Сохранено 10 сердечек из 10»");
  await page.click("#retryBtn");
  const d4 = await st();
  t.ok(d4.phase === "prep" && d4.hearts === 10 && d4.towers.length === 6 && d4.beams.length === 4 && d4.ribbon.every((r) => r.status === "wait") && d4.enemies.length === 0, "«Ещё раз»: новая попытка, башни и лучи остались, лента заново");
  await api("fight");
  await api("stepUntilWaveEnd");
  t.eq((await st()).toast, "Волна отбита!", "вторая попытка тоже проходится");
  await api("retry"); await api("removeTower", "E"); await api("fight");
  await api("stepUntilWaveEnd");
  const d5 = await st();
  t.ok(d5.toast === "Волна позади: 4 из 8" && d5.hearts === 6, "без башни E (лучи D-E и E-F порваны): «Волна позади: 4 из 8», сердечек 6");

  // ================= прочее: скорость, боссы в ленте, конец волны =================
  console.log("-- прочее");
  await load(F1);
  await api("fight"); await api("endWave");
  const ew = await st();
  t.ok(ew.phase === "waveEnd" && ew.toast === "Волна отбита!", "endWave() при hold: волна кончается, тост «Волна отбита!»");
  t.eq(await api("setSetting", "speed", "slow"), { ok: true }, "setSetting(speed, slow)");
  await load({ layout: "L1", hand: DIG, fixed: {}, hold: true, waves: [{ enemies: [] }] });
  await api("setSetting", "speed", "slow");
  await api("fight"); await api("spawn", 56);
  const sp = (await api("step", 1000).then(st)).enemies[0];
  t.ok(Math.abs(sp.t - 35 / 1509.0725) < 1e-4, "скорость «Медленно»: за 1 с враг проходит 35 ед. (t = " + sp.t.toFixed(5) + ")");
  await api("setSetting", "speed", "normal");
  await load({ layout: "L1", hand: DIG, fixed: {}, hold: true, waves: [{ enemies: [] }] });
  await api("fight"); await api("spawn", 56, { kind: "boss" });
  const spb = (await api("step", 1000).then(st)).enemies[0];
  t.ok(Math.abs(spb.t - 40 / 1509.0725) < 1e-4, "босс идёт со скоростью 0,8 от обычной (40 ед./с)");
  await load({ layout: "L1", hand: DIG, fixed: {}, waves: [{ enemies: [56, { value: 56, kind: "boss" }, 24], gap: 3000 }] });
  t.ok(await ev(() => document.querySelectorAll(".card.boss").length === 1), "в ленте у босса своя рамка (карточка .boss)");
  await api("fight");
  const q1 = await api("step", 4400).then(st), q2 = await api("step", 200).then(st);
  t.ok(q1.queue === 2 && q2.queue === 1, "перед боссом пауза на 1500 мс: второй враг выходит в 4500 мс, а не в 3000");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await api("reset"); await api("applySolution"); await api("fight");
  await api("stepUntilWaveEnd");
  await ev(() => window.OBORONA.render());
  t.ok((await st()).toast === "Волна отбита!", "prefers-reduced-motion: волна проходится так же");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // ================= П7 никаких вопросов =================
  console.log("-- П7 ни одного вопроса-викторины (демо)");
  const q = await st();
  const pats = [/^\d+, а луч даёт \d+$/, /^\d+ − \d+ = \d+$/, /^\d+( = \d+ × \d+)?$/, /^Останется \d+ — такого луча нет$/, /^Сначала поставь башню$/, /^У башни уже два луча$/];
  t.ok(q.textLog.length > 0 && q.textLog.every((x) => pats.some((p) => p.test(x))), "каждый текст в textLog подходит под шаблон: " + [...new Set(q.textLog)].slice(0, 4).join(" | "));
  t.ok(q.screensSeen.every((x) => ["map", "level", "levelEnd", "night"].includes(x)), "screensSeen ⊆ {map, level, levelEnd, night}");
  const forms2 = await ev(() => ({ n: document.querySelectorAll("input, textarea, select, [contenteditable]").length, q: document.body.innerText.split("\n").filter((l) => /\?\s*$/.test(l)).length }));
  t.ok(forms2.n === 0 && forms2.q === 0, "на странице нет полей ввода и видимых текстов, оканчивающихся на «?»");

  // ================= T1-7 размеры =================
  console.log("-- T1-7 размеры окна");
  for (const [w, h] of [[1024, 600], [1024, 768], [1366, 768], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await api("reset");
    const r = await ev(() => {
      const s = window.OBORONA.state(), v = s.view;
      const btn = Array.from(document.querySelectorAll("button")).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id || b.className, h: r.height, w: r.width }; });
      const cards = Array.from(document.querySelectorAll(".card")).map((c) => c.getBoundingClientRect());
      const bar = document.getElementById("bar").getBoundingClientRect(), hand = document.getElementById("hand").getBoundingClientRect();
      return {
        v, iw: innerWidth, ih: innerHeight,
        sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), sh: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        small: btn.filter((b) => b.h < 48 || b.w < 48), nbtn: btn.length, cardsOk: cards.every((c) => c.right <= bar.right && c.bottom <= bar.bottom + 0.5 && c.top >= 0),
        barH: bar.height, handTop: hand.top, handBottom: hand.bottom
      };
    });
    const v = r.v;
    t.ok(v.ox >= -0.5 && v.oy >= v.barH - 0.5 && v.oy + 900 * v.s <= r.ih - v.handH + 0.5 && v.ox + 1600 * v.s <= r.iw + 0.5, w + "×" + h + ": поле целиком между полосами (s = " + v.s.toFixed(3) + ")");
    t.ok(r.sw <= r.iw && r.sh <= r.ih, w + "×" + h + ": прокрутки нет");
    t.ok(r.small.length === 0 && r.nbtn >= 10, w + "×" + h + ": все " + r.nbtn + " кнопок от 48 px" + (r.small.length ? " (малы: " + JSON.stringify(r.small) + ")" : ""));
    t.ok(r.cardsOk && Math.abs(r.barH - v.barH) < 1 && Math.abs(r.handBottom - r.handTop - v.handH) < 1, w + "×" + h + ": карточки ленты внутри полосы, высоты полос по формуле");
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  const fin = await ev(() => window.OBORONA.version);
  t.eq(fin, "0.1.0", "версия 0.1.0");
});
