// Приёмочные и модульные тесты «Обороны таблицы»: этап 1 (прототип) и этап 2 (полная игра).
// Запуск: node tools/tests/oborona.test.cjs
const { run } = require("./_harness.cjs");

const DIG = [2, 3, 4, 5, 6, 7, 8, 9];
const F1 = { layout: "L1", hand: DIG, fixed: {}, hold: true, waves: [{ enemies: [], gap: 3000 }] };

run("oborona", async (t, page) => {
  // ---- помощники ----
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // после действий, меняющих экран, рисуем кадр (render() заодно обновляет DOM-полосы), чтобы проверки DOM не ждали requestAnimationFrame
  const api = (name, ...args) => ev(([n, a]) => { const r = window.OBORONA.api[n](...a); if (["reset", "demo", "loadLevel", "retry", "fight", "pause", "resume", "endWave"].includes(n)) window.OBORONA.render(); return r; }, [name, args]);
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
  // подпись проверяется независимо от игры: ожидаемые строки заданы в тесте, а на холсте в месте подписи стоит кремовая плашка
  const checkLabels = (expected) => ev((exp) => {
    window.OBORONA.render();
    const s = window.OBORONA.state(), v = s.view, cv = document.getElementById("field"), cx = cv.getContext("2d");
    const plateOk = (l) => { const d = cx.getImageData(Math.round((v.ox + (l.x - l.w / 2 + 6) * v.s) * (cv.width / v.W)), Math.round((v.oy + l.y * v.s) * (cv.width / v.W)), 1, 1).data; return Math.abs(d[0] - 255) < 8 && Math.abs(d[1] - 251) < 8 && Math.abs(d[2] - 230) < 10; };
    const texts = s.frame.labels.map((l) => l.text).sort();
    return {
      ok: JSON.stringify(texts) === JSON.stringify(exp.slice().sort()) && s.frame.labels.every((l) => l.w > 0 && l.h > 0 && plateOk(l)),
      n: s.beams.length, nl: s.frame.labels.length, texts, flash: s.beams.map((b) => b.flash)
    };
  }, expected);
  await load(F1);
  await setup({ A: 7, B: 8, C: 6, D: 3, E: 8, F: 4 }, [["A", "B"], ["C", "B"], ["D", "E"], ["F", "E"]]);
  const E4 = ["7 × 8 = 56", "6 × 8 = 48", "3 × 8 = 24", "4 × 8 = 32"];
  let c1 = await checkLabels(E4);
  t.ok(c1.ok && c1.n === 4 && c1.nl === 4, "подготовка: у четырёх лучей четыре подписи с ожидаемым текстом, на холсте видна плашка каждой");
  t.eq(c1.texts, ["3 × 8 = 24", "4 × 8 = 32", "6 × 8 = 48", "7 × 8 = 56"], "тексты подписей: «7 × 8 = 56», «6 × 8 = 48», «3 × 8 = 24», «4 × 8 = 32»");
  const gr = await ev(() => {
    const a = window.OBORONA.api;
    a.fight(); a.spawn(30);
    for (let i = 0; i < 300; i++) { const s = a.step(100); if (s.beams.some((b) => b.flash === "grey")) return true; }
    return false;
  });
  t.ok(gr, "луч мигнул серым (flash «grey») при проходе врага 30");
  c1 = await checkLabels(E4);
  t.ok(c1.ok && c1.flash.includes("grey"), "подписи на месте во время серой вспышки");
  await api("pause");
  c1 = await checkLabels(E4);
  t.ok(c1.ok, "подписи на месте на паузе");
  await api("placeTower", "C", 9);
  c1 = await checkLabels(["7 × 8 = 56", "9 × 8 = 72", "3 × 8 = 24", "4 × 8 = 32"]);
  t.ok(c1.ok && c1.texts.includes("9 × 8 = 72") && !c1.texts.includes("6 × 8 = 48"), "после смены цифры C на 9 подпись «9 × 8 = 72»");
  await api("removeTower", "D");
  c1 = await checkLabels(["7 × 8 = 56", "9 × 8 = 72", "4 × 8 = 32"]);
  t.ok(c1.ok && c1.n === 3 && !c1.texts.includes("3 × 8 = 24"), "после removeTower(D) луча D-E и его подписи нет");
  await load({ layout: "L1", hand: DIG.concat([10, 20, 30, 40]), fixed: {}, hold: true, waves: [{ enemies: [] }] });
  await setup({ A: 20, B: 4 }, [["A", "B"]]);
  c1 = await checkLabels(["20 × 4 = 80"]);
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
  let ui = await ev(() => ({ ph: window.OBORONA.state().phase, fight: getComputedStyle(document.getElementById("fightBtn")).visibility, pause: getComputedStyle(document.getElementById("pauseBtn")).display, pauseTxt: document.getElementById("pauseBtn").textContent, off: document.getElementById("hand").classList.contains("off"), title: getComputedStyle(document.querySelector(".rtitle")).display }));
  t.ok(ui.ph === "battle" && ui.fight === "hidden" && ui.pause !== "none" && ui.pauseTxt === "Пауза" && ui.off && ui.title === "none", "«В бой!»: фаза battle, кнопка «В бой!» скрыта, «Пауза» видна, плитки затемнены, заголовка ленты нет");
  await api("step", 500);
  await clickAt(await padPx("C"));
  await page.waitForTimeout(150);
  t.ok((await ev(() => document.getElementById("toast").textContent)) === "Нажми „Пауза“, чтобы перестроить лучи" && (await st()).towers.length === 2, "касание поля в бою: тост «Нажми „Пауза“, чтобы перестроить лучи», башни не меняются");
  await page.click("#pauseBtn");
  await page.waitForTimeout(100);
  ui = await ev(() => ({ paused: window.OBORONA.state().paused, note: getComputedStyle(document.getElementById("pauseNote")).display, txt: document.getElementById("pauseNote").innerText, btn: document.getElementById("pauseBtn").textContent, off: document.getElementById("hand").classList.contains("off"), ov: !!document.getElementById("pauseOv") }));
  t.ok(ui.paused && ui.note !== "none" && /Пауза/.test(ui.txt) && /Лучи можно перестроить/.test(ui.txt) && ui.btn === "Дальше" && !ui.off && !ui.ov, "пауза одним касанием: в полосе «Пауза / Лучи можно перестроить», кнопка «Пауза» стала «Дальше», плитки доступны, отдельной плашки нет");
  await dragMouse(await tilePx(9), await padPx("C"));
  t.ok((await st()).towers.some((x) => x.pad === "C" && x.value === 9), "на паузе башню можно поставить перетаскиванием");
  await page.keyboard.press("Space");
  t.ok(!(await st()).paused, "пробел снимает паузу");
  await page.keyboard.press("Escape");
  t.ok((await st()).paused, "Escape ставит паузу");
  await page.click("#pauseBtn");
  t.ok(!(await st()).paused && (await ev(() => document.getElementById("pauseBtn").textContent)) === "Пауза", "«Дальше» снимает паузу, кнопка снова «Пауза»");
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
  await api("demo");
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
  await api("demo"); await api("applySolution"); await api("fight");
  await api("stepUntilWaveEnd");
  await ev(() => window.OBORONA.render());
  t.ok((await st()).toast === "Волна отбита!", "prefers-reduced-motion: волна проходится так же");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // ================= П7 никаких вопросов =================
  console.log("-- П7 ни одного вопроса-викторины (демо)");
  const q = await st();
  const pats = [/^\d+, а луч даёт \d+$/, /^\d+ − \d+ = \d+$/, /^\d+( = \d+ × \d+)?$/, /^Останется \d+ — такого луча нет$/, /^Сначала поставь башню$/, /^У башни уже два луча$/];
  t.ok(q.textLog.length > 0 && q.textLog.every((x) => pats.some((p) => p.test(x))), "каждый текст в textLog подходит под шаблон: " + [...new Set(q.textLog)].slice(0, 4).join(" | "));
  const scr = await ev(() => ({ btns: Array.from(document.querySelectorAll("button")).filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== "hidden").map((b) => b.id || (b.classList.contains("tile") ? "tile" : b.className)), ids: Array.from(document.querySelectorAll("[id]")).map((e) => e.id) }));
  t.ok(scr.btns.every((b) => ["soundBtn", "pauseBtn", "fightBtn", "retryBtn", "tile"].includes(b)) && !scr.ids.some((i) => /quiz|question/i.test(i)), "на экране боя только поле, полосы и кнопки уровня, викторины нет (видимые кнопки: " + Array.from(new Set(scr.btns)).join(", ") + ")");
  const forms2 = await ev(() => ({ n: document.querySelectorAll("input, textarea, select, [contenteditable]").length, q: document.body.innerText.split("\n").filter((l) => /\?\s*$/.test(l)).length }));
  t.ok(forms2.n === 0 && forms2.q === 0, "на странице нет полей ввода и видимых текстов, оканчивающихся на «?»");

  // ================= Ревью: исправления =================
  console.log("-- Ревью 1: лента в бою, касания, выбор, touch-action, полосы");
  // (а) классы карточек ленты обновляются в бою (раньше ключ брал первую букву статуса: wait, walk, won — все «w»)
  const W3b = { layout: "L1", hand: DIG, fixed: {}, waves: [{ enemies: [56, 24, 18], gap: 3000 }] };
  const cardCls = () => ev(() => Array.from(document.querySelectorAll(".card")).map((c) => c.className));
  await load(W3b);
  await setup({ A: 8, B: 7 }, [["A", "B"]]);
  await api("fight");
  await page.waitForTimeout(120);
  let cls = await cardCls();
  t.ok(cls.length === 3 && cls.every((c) => /\bwait\b/.test(c)), "лента в начале боя: три карточки «wait»");
  await api("step", 100);
  await page.waitForTimeout(120);
  cls = await cardCls();
  t.ok(/\bwalk\b/.test(cls[0]) && /\bwait\b/.test(cls[1]) && (await st()).hearts === 10, "первый враг вышел: карточка 1 «walk», остальные «wait», сердечки те же (раньше DOM молчал)");
  await stepUntil("s => s.ribbon[0].status === 'won'");
  await page.waitForTimeout(120);
  cls = await cardCls();
  t.ok(/\bwon\b/.test(cls[0]) && !/\bwalk\b/.test(cls[0]) && (await st()).hearts === 10, "враг 56 побеждён лучом: у карточки класс «won» (галочка), сердечки не менялись");
  await stepUntil("s => s.ribbon[1].status === 'gate'");
  await page.waitForTimeout(120);
  cls = await cardCls();
  t.ok(/\bgate\b/.test(cls[1]) && (await st()).hearts === 9, "враг 24 дошёл до ворот: у карточки «gate», сердечек 9");
  // (п4) touch-action
  const ta = await ev(() => ["html", "body", "#app", "#bar", "#hand", "#toast", "#endCard", "#field"].map((q) => [q, getComputedStyle(document.querySelector(q)).touchAction]));
  t.ok(ta.every((x) => x[1] === "none"), "touch-action: none у html, body, #app, полос, тоста и карточки конца: щипок по полосе не масштабирует страницу (" + JSON.stringify(ta.filter((x) => x[1] !== "none")) + ")");
  t.eq(await ev(() => getComputedStyle(document.getElementById("fightBtn")).touchAction), "manipulation", "у кнопок touch-action: manipulation");
  // (п5) подготовка: «Пауза» не занимает место, лента не сжата
  await api("demo");
  const prepUI = await ev(() => {
    const pb = document.getElementById("pauseBtn"), cards = Array.from(document.querySelectorAll(".card")).map((c) => c.getBoundingClientRect()), rb = document.getElementById("ribbon").getBoundingClientRect();
    return { disp: getComputedStyle(pb).display, w: pb.getBoundingClientRect().width, cw: cards[0].width, right: cards[cards.length - 1].right, rbRight: rb.right, wave: document.getElementById("waveNo").textContent };
  });
  t.ok(prepUI.disp === "none" && prepUI.w === 0, "в подготовке кнопки «Пауза» нет совсем (display: none), её место отдано ленте");
  t.ok(prepUI.cw >= 60 && prepUI.right <= prepUI.rbRight + 0.5, "в подготовке карточки ленты не сжаты (" + Math.round(prepUI.cw) + " px) и целиком в полосе");
  t.eq(prepUI.wave, "Волна 1", "в демо написано «Волна 1», а не «Волна 1 из 1»");
  // (п9) рука: плитки не вылезают из-под «В бой!» на узких окнах
  const handFit = async (fx, widths) => {
    const bad = [];
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: 600 });
      await page.waitForTimeout(150);
      await load(fx);
      const r = await ev(() => {
        const tiles = Array.from(document.querySelectorAll(".tile")).map((x) => x.getBoundingClientRect()), fb = document.getElementById("fightBtn").getBoundingClientRect();
        return { last: Math.max(...tiles.map((x) => x.right)), first: Math.min(...tiles.map((x) => x.left)), fl: fb.left, n: tiles.length, size: tiles[0].width };
      });
      if (!(r.last <= r.fl - 8 && r.first >= 0)) bad.push(w + ": плитки до " + Math.round(r.last) + ", кнопка с " + Math.round(r.fl));
    }
    return bad;
  };
  t.eq(await handFit(F1, [800, 860, 900, 1024, 1366]), [], "рука 2–9: ни при какой ширине 800–1366 плитки не заходят под «В бой!»");
  t.eq(await handFit({ layout: "L1", hand: DIG.concat([10, 20, 30, 40]), fixed: {}, hold: true, waves: [{ enemies: [] }] }, [1024, 1366]), [], "рука земли 6 (12 плиток): плитки помещаются при 1024 и 1366");
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(150);

  // (п3, в) выбор не переживает паузу: после «Дальше» нет ни ✕, ни золотого кольца
  console.log("-- Ревью 2: выбор после паузы, касание пальцем");
  await load(F1);
  await setup({ A: 6, B: 7 }, [["A", "B"]]);
  await api("fight"); await api("spawn", 56); await api("step", 500); await api("pause");
  let Ap = await padPx("A");
  await clickAt(Ap);
  await ev(() => window.OBORONA.render());
  t.eq((await st()).frame.sel.tower, "A", "на паузе: башня A выбрана (золотое кольцо)");
  let lb = (await st()).frame.labels[0], vw = (await st()).view;
  await clickAt({ x: vw.ox + lb.x * vw.s, y: vw.oy + lb.y * vw.s });
  await ev(() => window.OBORONA.render());
  t.ok((await st()).frame.cross && (await st()).frame.sel.beam === "A-B", "на паузе: выбран луч A-B, виден «✕»");
  await clickAt(Ap);
  await ev(() => window.OBORONA.render());
  await clickAt(Ap);
  await page.click("#pauseBtn");
  await page.waitForTimeout(100);
  await ev(() => window.OBORONA.render());
  let after = await st();
  t.ok(!after.paused && after.frame.cross === null && after.frame.sel.tower === null && after.frame.sel.beam === null, "после «Дальше» выбор снят: нет «✕», нет кольца выбора");
  await api("pause");
  await clickAt(Ap);
  await ev(() => window.OBORONA.render());
  t.eq((await st()).frame.sel.tower, "A", "снова пауза: башню можно выбрать");
  await api("resume");
  await page.waitForTimeout(100);
  t.eq((await st()).frame.sel.tower, null, "resume() через api тоже снимает выбор");

  // (б) настоящие касания пальцем: контекст с hasTouch
  const tctx = await t.context.browser().newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, locale: "ru-RU" });
  const tp = await tctx.newPage();
  const terrs = [];
  tp.on("pageerror", (e) => terrs.push(e.message));
  await tp.goto("file://" + t.file);
  await tp.waitForFunction(() => window.OBORONA && window.OBORONA.ready);
  const tev = (fn, a) => tp.evaluate(fn, a);
  const tload = (fx) => tev((f) => { window.OBORONA.api.manual(true); window.OBORONA.api.loadLevel(f); window.OBORONA.render(); }, fx);
  const tpad = (id) => tev((i) => { const O = window.OBORONA, v = O.state().view, p = O.layouts[O.state().level.layout].padById[i]; return { x: v.ox + p.x * v.s, y: v.oy + p.y * v.s }; }, id);
  const ttile = (n) => tev((v) => { const r = document.querySelector('.tile[data-v="' + v + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, n);
  const tst = () => tev(() => window.OBORONA.state());
  await tload(F1);
  const tpt = await tp.evaluate(() => ({ touch: navigator.maxTouchPoints }));
  await tp.touchscreen.tap((await ttile(7)).x, (await ttile(7)).y);
  await tp.waitForTimeout(700);
  t.ok(tpt.touch > 0 && (await tev(() => !!document.querySelector(".tile.sel[data-v='7']"))), "касание пальцем по плитке 7 выбирает её, и выбор не слетает от следующего click (раньше слетал)");
  const Cp = await tpad("C");
  await tp.touchscreen.tap(Cp.x, Cp.y);
  await tp.waitForTimeout(300);
  t.ok((await tst()).towers.some((x) => x.pad === "C" && x.value === 7) && (await tev(() => !document.querySelector(".tile.sel"))), "касание плитки, затем площадки C пальцем: башня 7 стоит, выбор плитки снят");
  await tp.touchscreen.tap((await ttile(5)).x, (await ttile(5)).y);
  await tp.waitForTimeout(500);
  await tp.touchscreen.tap((await ttile(5)).x, (await ttile(5)).y);
  await tp.waitForTimeout(500);
  t.ok(await tev(() => !document.querySelector(".tile.sel")), "второе касание той же плитки пальцем снимает выбор");
  await tp.touchscreen.tap((await ttile(8)).x, (await ttile(8)).y);
  await tp.waitForTimeout(400);
  const Bp = await tpad("B");
  await tp.touchscreen.tap(Bp.x, Bp.y);
  await tp.waitForTimeout(300);
  await tp.touchscreen.tap(Cp.x, Cp.y);
  await tp.waitForTimeout(300);
  await tp.touchscreen.tap(Bp.x, Bp.y);
  await tp.waitForTimeout(300);
  const tb2 = await tst();
  t.ok(tb2.beams.length === 1 && tb2.beams[0].id === "B-C" && tb2.beams[0].label === "7 × 8 = 56", "касание башни C, потом B пальцем: луч B-C «7 × 8 = 56» (цифры по порядку касаний)");
  // второй палец и pointercancel
  const cdp = await tctx.newCDPSession(tp);
  await tload(F1);
  const t7 = await ttile(7), Bp2 = await tpad("B");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: t7.x, y: t7.y, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: t7.x, y: t7.y, id: 1 }, { x: Bp2.x, y: Bp2.y, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await tp.waitForTimeout(500);
  const sf = await tst();
  t.ok(sf.towers.length === 0 && (await tev(() => !!document.querySelector(".tile.sel[data-v='7']"))) && (await tev(() => document.getElementById("ghost").hidden)), "второй палец на площадке во время касания плитки игнорируется: башни нет, плитка 7 выбрана, призрака нет");
  await tload(F1);
  const t5 = await ttile(5);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: t5.x, y: t5.y, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: t5.x + 30, y: t5.y - 120, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Bp2.x, y: Bp2.y, id: 1 }] });
  const ghostWas = await tev(() => !document.getElementById("ghost").hidden);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await tp.waitForTimeout(300);
  t.ok(ghostWas && (await tev(() => document.getElementById("ghost").hidden)) && (await tst()).towers.length === 0, "pointercancel посреди перетаскивания: призрак исчез, башня не поставлена");
  await tload(F1);
  await tp.touchscreen.tap((await ttile(6)).x, (await ttile(6)).y);
  await tp.waitForTimeout(400);
  await tp.touchscreen.tap((await tpad("A")).x, (await tpad("A")).y);
  await tp.waitForTimeout(300);
  t.ok((await tst()).towers.some((x) => x.pad === "A" && x.value === 6), "после отмены нажатия касания снова работают: плитка 6, площадка A");
  t.eq(terrs, [], "в touch-странице нет ошибок");
  await tctx.close();

  // клавиатура: Enter и пробел на плитке (click по клавише раньше определялся по detail === 0)
  await load(F1);
  await page.focus('.tile[data-v="7"]');
  await page.keyboard.press("Enter");
  t.ok(await ev(() => !!document.querySelector(".tile.sel[data-v='7']")), "Enter на плитке выбирает её");
  await page.keyboard.press("Enter");
  t.ok(await ev(() => !document.querySelector(".tile.sel")), "второй Enter снимает выбор (ровно одно переключение за нажатие)");
  await page.keyboard.press("Space");
  t.ok(await ev(() => !!document.querySelector(".tile.sel[data-v='7']")), "пробел на плитке выбирает её");
  await clickAt(await padPx("B"));
  t.ok((await st()).towers.some((x) => x.pad === "B" && x.value === 7), "выбранная клавиатурой плитка 7 ставится касанием площадки B");
  await ev(() => document.activeElement && document.activeElement.blur());

  // ================= Ревью 3: тексты, хвостики, подписи во всех фазах =================
  console.log("-- Ревью 3: тексты «мимо», подписи, плашки, праздник");
  // (з) TTL «мимо» = 1000 мс
  await load(F1);
  await setup({ A: 6, B: 7 }, [["A", "B"]]);
  await api("fight"); await api("spawn", 30);
  const ttl0 = await stepUntil("s => s.texts.length > 0", 600, 17);
  const tx0 = ttl0.texts[0];
  t.ok(tx0 && tx0.text === "30, а луч даёт 42" && tx0.ttl >= 960 && tx0.ttl <= 1000, "текст «мимо» рождается с ttl 1000 мс (" + (tx0 && tx0.ttl) + ")");
  const ttl1 = await api("step", 900).then(st);
  t.ok(ttl1.texts.length === 1 && ttl1.texts[0].ttl > 0 && ttl1.texts[0].ttl < 120, "через 900 мс текст ещё на экране");
  const ttl2 = await api("step", 150).then(st);
  t.eq(ttl2.texts.filter((x) => /луч даёт/.test(x.text)).length, 0, "через 1050 мс текст «мимо» исчез");
  await load(F1);
  await setup({ A: 5, B: 7 }, [["B", "A"]]);
  await api("fight"); await api("spawn", 56, { kind: "boss" });
  const ttb = await stepUntil("s => s.texts.length > 0", 600, 17);
  t.ok(ttb.texts[0].text === "56 − 35 = 21" && ttb.texts[0].ttl > 1460 && ttb.texts[0].ttl <= 1500, "текст удара по броне живёт 1500 мс");

  // (п7, и) «мимо» при наличии нужного луча впереди — тихий проход
  await load(F1);
  await setup({ A: 6, B: 7, C: 8 }, [["A", "B"], ["B", "C"]]);
  await api("fight"); await api("spawn", 56);
  const q1s = await stepUntil("s => s.texts.length > 0", 600, 17);
  await ev(() => window.OBORONA.render());
  const q1f = await st();
  t.ok(q1s.texts[0].text === "56, а луч даёт 42" && q1s.texts[0].quiet && q1s.events.some((e) => e.type === "pass" && e.quiet) && q1f.frame.texts[0] && q1f.frame.texts[0].quiet, "56 проходит 6 × 7 при луче 7 × 8 впереди: текст «56, а луч даёт 42» есть, но тихий (бледный)");
  t.ok(!q1f.sounds.includes("pass"), "тихий проход без звука: низкого тона нет");
  const q1e = await stepUntil("s => s.enemies.length === 0");
  t.ok(q1e.events.some((e) => e.type === "kill") && q1e.sounds.includes("kill") && !q1e.sounds.includes("pass") && q1e.textLog.includes("56, а луч даёт 42"), "дальше победа с обычным звуком; текст остался в textLog");
  await load(F1);
  await setup({ A: 6, B: 7, C: 8 }, [["A", "B"]]);
  await api("fight"); await api("spawn", 56);
  const q2s = await stepUntil("s => s.texts.length > 0", 600, 17);
  t.ok(q2s.texts[0].text === "56, а луч даёт 42" && !q2s.texts[0].quiet && q2s.events.some((e) => e.type === "pass" && !e.quiet) && q2s.sounds.includes("pass"), "если подходящего луча впереди нет, реакция полная: текст ярче, звук «pass»");
  await load(F1);
  await setup({ A: 6, B: 7, C: 5 }, [["A", "B"], ["B", "C"]]);
  await api("fight"); await api("spawn", 56);
  const q3 = await stepUntil("s => s.enemies.length === 0 || s.hearts < 10", 900, 50);
  t.ok(q3.hearts === 9 && q3.events.filter((e) => e.type === "pass" && !e.quiet).length === 2, "оба луча не подходят (42 и 35): оба прохода с полной реакцией, враг дошёл");
  // демо: безупречная волна не шумит
  await api("demo"); await api("applySolution"); await api("fight");
  const quiet = await ev(() => {
    const a = window.OBORONA.api; a.stepUntilWaveEnd();
    const s = window.OBORONA.state();
    return { passes: s.events.filter((e) => e.type === "pass").length, loud: s.events.filter((e) => e.type === "pass" && !e.quiet).length, soundPass: s.sounds.filter((x) => x === "pass").length, kills: s.sounds.filter((x) => x === "kill").length, fan: s.sounds.includes("fanfare") };
  });
  t.ok(quiet.passes >= 8 && quiet.loud === 0 && quiet.soundPass === 0 && quiet.kills === 8 && quiet.fan, "безупречная демо-волна: проходов «мимо» " + quiet.passes + ", громких 0, низких тонов 0, 8 побед, в конце фанфара");

  // (г, д) подписи не перекрыты: ни текстами, ни плашкой праздника, ни вспышками, ни паузой
  const scan = (fx, towers, beams) => ev(([fxx, tw, bm]) => {
    const O = window.OBORONA, a = O.api;
    a.manual(true); a.loadLevel(fxx);
    Object.keys(tw).forEach((p) => a.placeTower(p, tw[p]));
    bm.forEach((b) => a.beam(b[0], b[1]));
    a.fight();
    const ov = (p, q) => Math.min(p.x + p.w / 2, q.x + q.w / 2) - Math.max(p.x - p.w / 2, q.x - q.w / 2) > 0 && Math.min(p.y + p.h / 2, q.y + q.h / 2) - Math.max(p.y - p.h / 2, q.y - q.h / 2) > 0;
    const cv = document.getElementById("field"), cx = cv.getContext("2d");
    const plateOk = (l, v) => {
      const d = cx.getImageData(Math.round((v.ox + (l.x - l.w / 2 + 6) * v.s) * (cv.width / v.W)), Math.round((v.oy + l.y * v.s) * (cv.width / v.W)), 1, 1).data;
      return Math.abs(d[0] - 255) < 8 && Math.abs(d[1] - 251) < 8 && Math.abs(d[2] - 230) < 10;
    };
    const out = { frames: 0, textFrames: 0, textOverLabel: [], bannerOverLabel: 0, labelCount: 0, labelMissing: 0, pixelBad: 0, flashes: {}, phases: {}, bannerFrames: 0, maxTexts: 0, tailOk: true, textOverText: 0 };
    for (let i = 0; i < 2400; i++) {
      a.step(100); O.render();
      const s = O.state(), v = s.view;
      out.frames++; out.phases[s.phase] = (out.phases[s.phase] || 0) + 1;
      out.labelCount += s.beams.length;
      if (s.frame.labels.length !== s.beams.length) out.labelMissing++;
      s.beams.forEach((b) => { if (b.flash) out.flashes[b.flash] = (out.flashes[b.flash] || 0) + 1; });
      s.frame.labels.forEach((l) => { if (!plateOk(l, v)) out.pixelBad++; });
      if (s.frame.texts.length) out.textFrames++;
      out.maxTexts = Math.max(out.maxTexts, s.frame.texts.length);
      s.frame.texts.forEach((tx, ti) => {
        s.frame.labels.forEach((l) => { if (ov(tx, l)) out.textOverLabel.push(tx.text + " / " + l.text); });
        s.frame.texts.forEach((ty, tj) => { if (tj > ti && ov(tx, ty)) out.textOverText++; });
      });
      if (s.frame.banner) { out.bannerFrames++; s.frame.labels.forEach((l) => { if (ov(s.frame.banner, l)) out.bannerOverLabel++; }); }
      if (s.phase === "levelEnd") { if (out.phases.levelEnd > 3) break; }
    }
    const fin = O.state();
    out.end = { phase: fin.phase, stars: fin.frame.banner && fin.frame.banner.stars, hearts: fin.hearts };
    return out;
  }, [fx, towers, beams]);
  const okScan = (o, name) => {
    t.ok(o.labelMissing === 0 && o.pixelBad === 0 && o.labelCount > 0, name + ": подпись каждого луча нарисована в каждом кадре (" + o.frames + " кадров, на экране плашка цвета подписи, ничем не закрыта)");
    t.eq(o.textOverLabel.slice(0, 3), [], name + ": плашки текстов не перекрывают подписи лучей (кадров с текстами: " + o.textFrames + ")");
    t.ok(o.bannerOverLabel === 0 && o.bannerFrames > 0, name + ": плашка «Волна отбита!» не лежит на подписях (кадров с плашкой " + o.bannerFrames + ")");
  };
  const sol = await api("solution");
  const demoScan = await scan({ layout: "L1", hand: DIG, fixed: {}, hearts: 10, waves: [{ enemies: [24, 56, 18, 42, 24, 56, 42, 18], gap: 3000 }] }, sol.pads, sol.beams);
  okScan(demoScan, "демо L1");
  t.ok((demoScan.flashes.win || 0) > 0 && (demoScan.flashes.grey || 0) > 0 && demoScan.phases.waveEnd > 0 && demoScan.phases.levelEnd > 0, "в демо были вспышки win и grey и фазы waveEnd, levelEnd — подписи на месте в каждой");
  const bossScan = await scan({ layout: "L1", hand: DIG, fixed: {}, hearts: 10, waves: [{ enemies: [{ value: 56, kind: "boss" }, 24, { value: 21, kind: "boss" }, 56, 30], gap: 2500 }] }, { A: 5, B: 7, C: 3, D: 8, E: 3 }, [["B", "A"], ["B", "C"], ["D", "E"]]);
  okScan(bossScan, "L1, боссы");
  t.ok((bossScan.flashes.hit || 0) > 0 && (bossScan.flashes.win || 0) > 0 && (bossScan.flashes.grey || 0) > 0, "вспышки hit, win, grey: подписи читаются во всех (" + JSON.stringify(bossScan.flashes) + ")");
  const l2Scan = await scan({ layout: "L2", hand: DIG, fixed: {}, hearts: 10, waves: [{ enemies: [12, 56, 20, { value: 56, kind: "boss", path: 1 }, 16, 30, 24, 18], gap: 2200 }] }, { A: 2, M: 3, C: 4, D: 5, E: 6, G: 7, H: 8, P: 9 }, [["A", "M"], ["M", "C"], ["D", "M"], ["G", "H"], ["P", "H"]]);
  okScan(l2Scan, "L2");
  const l3Scan = await scan({ layout: "L3", hand: DIG, fixed: {}, hearts: 10, waves: [{ enemies: [24, 56, 18, 42, 30, 16], gap: 3000 }] }, { A: 3, B: 8, C: 6, D: 7, E: 6, F: 7, G: 8, H: 3 }, [["A", "B"], ["B", "C"], ["C", "D"], ["E", "F"], ["F", "G"], ["G", "H"]]);
  okScan(l3Scan, "L3");
  const l4Scan = await scan({ layout: "L4", hand: DIG, fixed: { B: 7 }, hearts: 10, waves: [{ enemies: [56, 21, 63, 42, 28], gap: 2500 }] }, { A: 8, C: 3, D: 9 }, [["A", "B"], ["B", "C"], ["C", "D"]]);
  okScan(l4Scan, "L4");
  // хвостики и дистанция
  await load(F1);
  await setup({ A: 6, B: 7 }, [["A", "B"]]);
  await api("fight"); await api("spawn", 30); await api("spawn", 56, { t: 0.05 });
  await stepUntil("s => s.texts.length >= 1", 600, 17);
  await ev(() => window.OBORONA.render());
  const tl = await st();
  const dists = tl.frame.texts.filter((x) => x.tail).map((x) => { const e = tl.enemies.find((en) => Math.abs(en.x - x.x) < 400 && Math.abs(en.y - x.y) < 400); return !!e; });
  t.ok(tl.frame.texts.length >= 1 && tl.frame.texts.every((x) => x.tail) && dists.every(Boolean), "у текста «мимо» есть хвостик к своему врагу (frame.texts[].tail)");
  await load(F1);
  await api("fight"); await api("spawn", 56);
  const gt = await stepUntil("s => s.texts.some(x => /56 = 7/.test(x.text))", 3000, 100);
  await ev(() => window.OBORONA.render());
  t.ok((await st()).frame.texts.some((x) => /56 = 7 × 8/.test(x.text) && !x.tail), "текст у ворот «56 = 7 × 8» без хвостика");

  // (г) пауза и концовка ничего не кладут на поле: ни плашек, ни кнопок поверх поля, на всех раскладках и размерах
  const overlayBad = [];
  for (const [w, h] of [[1024, 768], [1024, 600], [1366, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    for (const lay of ["L1", "L2", "L3", "L4"]) {
      await load({ layout: lay, hand: DIG, fixed: {}, waves: [{ enemies: [56, 24], gap: 3000 }] });
      await api("fight"); await api("step", 700); await api("pause");
      await ev(() => window.OBORONA.render());
      const probe = () => ev(() => {
        const v = window.OBORONA.state().view, f = { l: v.ox, t: v.oy, r: v.ox + 1600 * v.s, b: v.oy + 900 * v.s };
        return Array.from(document.querySelectorAll("#app > *")).filter((el) => !["field", "bar", "hand", "ghost", "rotate"].includes(el.id) && !el.hidden && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none")
          .concat(Array.from(document.querySelectorAll("#bar > *, #bar #ribbon > *")).filter((el) => !el.hidden && getComputedStyle(el).display !== "none"))
          .map((el) => { const r = el.getBoundingClientRect(); return { id: el.id || el.className, hit: r.width > 0 && r.right > f.l && r.left < f.r && r.bottom > f.t && r.top < f.b }; }).filter((x) => x.hit);
      });
      const onPause = await probe();
      if (onPause.length) overlayBad.push(w + "×" + h + " " + lay + " пауза: " + JSON.stringify(onPause));
      await api("resume");
      await ev(() => { const a = window.OBORONA.api; a.endWave(); a.stepUntilWaveEnd(); window.OBORONA.render(); });
      const onEnd = await probe();
      if (onEnd.length) overlayBad.push(w + "×" + h + " " + lay + " конец: " + JSON.stringify(onEnd));
    }
  }
  t.eq(overlayBad, [], "пауза и экран конца: ни одна плашка, кнопка и надпись не заходят на поле (4 раскладки × 3 размера окна)");
  await ev(() => window.OBORONA.api.demo());
  await api("fight"); await api("pause");
  await page.waitForTimeout(100);
  const pz = await ev(() => { const b = document.getElementById("pauseBtn").getBoundingClientRect(), n = document.getElementById("pauseNote").getBoundingClientRect(), bar = document.getElementById("bar").getBoundingClientRect(); return { btnIn: b.top >= 0 && b.bottom <= bar.bottom, noteIn: n.top >= 0 && n.bottom <= bar.bottom && n.right <= b.left, btnH: b.height, noteTxt: document.getElementById("pauseNote").innerText.replace(/\s+/g, " ") }; });
  t.ok(pz.btnIn && pz.noteIn && pz.btnH >= 64 && pz.noteTxt === "Пауза Лучи можно перестроить", "пауза: «Дальше» (64 px) на месте «Пауза» в полосе, надпись «Пауза / Лучи можно перестроить» в полосе вместо заголовка ленты");
  await api("resume");

  // (е) пауза в реальном времени: часы не идут, пока стоит пауза
  console.log("-- Ревью 4: пауза в реальном времени, размеры окна, dpr, портрет, перерисовка");
  await load({ layout: "L1", hand: DIG, fixed: {}, hold: true, waves: [{ enemies: [] }] });
  await api("manual", false);
  await api("fight"); await api("spawn", 56);
  await page.waitForTimeout(700);
  const rt1 = await st();
  t.ok(rt1.enemies.length === 1 && rt1.enemies[0].t > 0.01 && rt1.battleMs > 400, "реальное время: враг идёт (t " + (rt1.enemies[0] && rt1.enemies[0].t.toFixed(3)) + ")");
  await page.click("#pauseBtn");
  const rp0 = await st();
  await page.waitForTimeout(1000);
  const rp1 = await st();
  t.ok(rp0.paused && rp1.enemies[0].t === rp0.enemies[0].t && rp1.battleMs === rp0.battleMs && rp1.texts.length === rp0.texts.length, "пауза в реальном времени: за секунду t врагов и battleMs не изменились");
  await page.click("#pauseBtn");
  await page.waitForTimeout(500);
  const rp2 = await st();
  t.ok(!rp2.paused && rp2.enemies[0].t > rp1.enemies[0].t + 0.005, "после «Дальше» враг снова идёт");
  await api("manual", true);

  // (ж) resize посреди боя
  await load(W3b);
  await setup({ A: 8, B: 7 }, [["A", "B"]]);
  await api("fight"); await api("step", 4000);
  const rs0 = await st();
  const resizeBad = [];
  for (const [w, h] of [[1366, 768], [1024, 600], [1920, 1080], [1024, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const r = await ev(() => {
      const O = window.OBORONA, s = O.state(), v = s.view, cv = document.getElementById("field"), cx = cv.getContext("2d"), l = s.frame.labels[0];
      const d = cx.getImageData(Math.round((v.ox + (l.x - l.w / 2 + 6) * v.s) * (cv.width / v.W)), Math.round((v.oy + l.y * v.s) * (cv.width / v.W)), 1, 1).data;
      return { W: v.W, H: v.H, cw: cv.width, ch: cv.height, iw: innerWidth, ih: innerHeight, plate: [d[0], d[1], d[2]], phase: s.phase, paused: s.paused, n: s.enemies.length, ox: v.ox, oy: v.oy, s: v.s };
    });
    if (!(r.W === w && r.H === h && r.cw === w && r.ch === h && r.plate[0] > 245 && r.plate[2] > 215 && r.phase === "battle" && !r.paused)) resizeBad.push(w + "×" + h + ": " + JSON.stringify(r));
  }
  t.eq(resizeBad, [], "resize посреди боя (1366×768, 1024×600, 1920×1080, 1024×768): холст по размеру окна, подпись луча нарисована, бой идёт");
  const rs1 = await st();
  t.ok(rs1.enemies.length === rs0.enemies.length && rs1.battleMs === rs0.battleMs && rs1.enemies.every((e, i) => e.t === rs0.enemies[i].t), "resize не двигает врагов и не трогает время боя");
  // dpr 2
  const dctx = await t.context.browser().newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, locale: "ru-RU" });
  const dp = await dctx.newPage();
  const derrs = [];
  dp.on("pageerror", (e) => derrs.push(e.message));
  await dp.goto("file://" + t.file);
  await dp.waitForFunction(() => window.OBORONA && window.OBORONA.ready);
  await dp.evaluate((f) => { const a = window.OBORONA.api; a.manual(true); a.loadLevel(f); window.OBORONA.render(); }, F1);
  const dpads = await dp.evaluate(() => { const O = window.OBORONA, v = O.state().view, P = O.layouts.L1.padById; return { A: { x: v.ox + P.A.x * v.s, y: v.oy + P.A.y * v.s }, B: { x: v.ox + P.B.x * v.s, y: v.oy + P.B.y * v.s }, tile: (() => { const r = document.querySelector('.tile[data-v="5"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })(), tile6: (() => { const r = document.querySelector('.tile[data-v="6"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })() }; });
  await dp.mouse.move(dpads.tile.x, dpads.tile.y); await dp.mouse.down(); await dp.mouse.move(dpads.A.x, dpads.A.y, { steps: 10 }); await dp.mouse.up();
  await dp.mouse.move(dpads.tile6.x, dpads.tile6.y); await dp.mouse.down(); await dp.mouse.move(dpads.B.x, dpads.B.y, { steps: 10 }); await dp.mouse.up();
  await dp.mouse.move(dpads.A.x, dpads.A.y); await dp.mouse.down(); await dp.mouse.up();
  await dp.mouse.move(dpads.B.x, dpads.B.y); await dp.mouse.down(); await dp.mouse.up();
  const dd2 = await dp.evaluate(() => {
    window.OBORONA.render();
    const s = window.OBORONA.state(), v = s.view, cv = document.getElementById("field"), cx = cv.getContext("2d"), l = s.frame.labels[0];
    const px = cx.getImageData(Math.round((v.ox + (l.x - l.w / 2 + 6) * v.s) * 2), Math.round((v.oy + l.y * v.s) * 2), 1, 1).data;
    return { cw: cv.width, ch: cv.height, dpr: devicePixelRatio, beams: s.beams.map((b) => b.label), plate: [px[0], px[1], px[2]], sw: cv.clientWidth };
  });
  t.ok(dd2.dpr === 2 && dd2.cw === 2048 && dd2.ch === 1536 && dd2.sw === 1024, "dpr 2: холст 2048×1536 при окне 1024×768");
  t.ok(dd2.beams.length === 1 && dd2.beams[0] === "5 × 6 = 30" && dd2.plate[0] > 245 && dd2.plate[2] > 215, "dpr 2: плитки и касания работают, подпись «5 × 6 = 30» нарисована в нужном месте");
  t.eq(derrs, [], "на dpr 2 нет ошибок страницы");
  await dctx.close();
  // портрет
  await load(W3b);
  await api("fight"); await api("step", 500);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(250);
  const pr = await ev(() => { const r = document.getElementById("rotate"), b = r.getBoundingClientRect(); return { disp: getComputedStyle(r).display, txt: r.innerText.replace(/\s+/g, " "), full: b.width === innerWidth && b.height === innerHeight, paused: window.OBORONA.state().paused, top: document.elementFromPoint(innerWidth / 2, innerHeight / 2).closest("#rotate") !== null }; });
  t.ok(pr.disp !== "none" && /Поверни планшет/.test(pr.txt) && pr.full && pr.top, "портрет 768×1024: на весь экран плашка «Поверни планшет», игра под ней недоступна");
  t.ok(pr.paused, "при повороте в портрет бой встаёт на паузу");
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(250);
  t.eq(await ev(() => getComputedStyle(document.getElementById("rotate")).display), "none", "в горизонтальной ориентации плашки нет");
  await api("resume");

  // перерисовка только при изменениях или анимации
  await load(F1);
  await page.waitForTimeout(150);
  const r0 = (await st()).renders;
  await page.waitForTimeout(600);
  const r1 = (await st()).renders;
  t.ok(r1 - r0 <= 1, "подготовка без лучей и выбора: за 0,6 с перерисовок " + (r1 - r0) + " (раньше 36)");
  await setup({ A: 6, B: 7 }, [["A", "B"]]);
  await page.waitForTimeout(500);
  const r2 = (await st()).renders;
  await page.waitForTimeout(500);
  const r3 = (await st()).renders;
  t.ok(r3 - r2 > 15, "лучи с бегущими искрами анимируются: кадры идут (" + (r3 - r2) + " за 0,5 с)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ev(() => window.OBORONA.render());
  await page.waitForTimeout(300);
  const r4 = (await st()).renders;
  await page.waitForTimeout(600);
  const r5 = (await st()).renders;
  t.ok(r5 - r4 <= 1, "prefers-reduced-motion: искры и пульсы стоят, перерисовок нет (" + (r5 - r4) + ")");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await ev(() => window.OBORONA.api.demo());
  await ev(() => { const a = window.OBORONA.api; a.applySolution(); a.fight(); a.stepUntilWaveEnd(); });
  await page.waitForTimeout(4500);
  const r6 = (await st()).renders;
  await page.waitForTimeout(600);
  const r7 = (await st()).renders;
  t.ok((await st()).phase === "levelEnd" && r7 - r6 <= 1, "экран конца: после праздника (3,5 с) перерисовка остановилась");
  await ev(() => window.OBORONA.api.manual(true));

  // ================= Ревью 5: внешний вид =================
  console.log("-- Ревью 5: внешний вид и праздник");
  const shapes = await ev(() => [24, 56, 18, 42, 12, 63].map((v) => window.OBORONA.logic.enemyShape({ value: v, start: v })));
  t.ok(new Set(shapes.slice(0, 4)).size === 3 && shapes[0] === shapes[0], "враги демо-волны (24, 56, 18, 42) имеют три разных силуэта: " + shapes.slice(0, 4).join(","));
  t.eq(await ev(() => window.OBORONA.logic.enemyShape({ value: 21, start: 56 })), await ev(() => window.OBORONA.logic.enemyShape({ value: 56, start: 56 })), "силуэт зависит от исходного числа: после удара по броне враг не меняется");
  // награда и фанфара: звёзды по сердечкам известны заранее (8–10 → 3, 4–7 → 2, 0–3 → 1)
  const starRun = async (n) => {
    await load({ layout: "L1", hand: DIG, fixed: {}, waves: [{ enemies: new Array(n).fill(56), gap: 3000 }] });
    await api("fight");
    await ev(() => window.OBORONA.api.stepUntilWaveEnd());
    await page.waitForTimeout(50);
    await ev(() => window.OBORONA.render());
    const s = await st();
    return { stars: s.frame.banner && s.frame.banner.stars, hearts: s.hearts, text: s.frame.banner && s.frame.banner.text, sounds: s.sounds.filter((x) => x === "chime" || x === "fanfare"), flags: s.frame.banner && s.frame.banner.flags };
  };
  const sr = [await starRun(2), await starRun(5), await starRun(9)];
  t.ok(sr[0].stars === 3 && sr[0].hearts === 8 && sr[1].stars === 2 && sr[1].hearts === 5 && sr[2].stars === 1 && sr[2].hearts === 1, "звёзды в плашке конца равны starsFor(сердечки): 8 → 3, 5 → 2, 1 → 1");
  t.ok(sr[0].text === "Волна позади: 0 из 2" && sr[0].sounds.join() === "chime" && sr[0].flags === false, "волна без побед: честный текст «Волна позади: 0 из 2», тихий звон вместо фанфары, флажков нет");
  await api("demo"); await api("applySolution"); await api("fight");
  await ev(() => window.OBORONA.api.stepUntilWaveEnd());
  await ev(() => window.OBORONA.render());
  const win = await st();
  t.ok(win.frame.banner && win.frame.banner.text === "Волна отбита!" && win.frame.banner.stars === 3 && win.frame.banner.flags && win.sounds.includes("fanfare") && win.frame.banner.w >= 360, "победная волна: крупная плашка «Волна отбита!» с тремя звёздами, флажки на крепости, фанфара");
  const bn = win.frame.banner;
  t.ok(Math.abs(bn.x - 800) < 420 && Math.abs(bn.y - 450) < 300, "плашка ближе к центру поля, чем к краю (" + Math.round(bn.x) + ", " + Math.round(bn.y) + ")");
  // вход: холм и дорожка доходят до края окна, крепость и крыша внутри поля
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  await api("demo");
  await ev(() => window.OBORONA.render());
  const px = await ev(() => {
    const O = window.OBORONA, v = O.state().view, cv = document.getElementById("field"), cx = cv.getContext("2d"), L = O.layouts.L1, get = (x, y) => Array.from(cx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
    const py = v.oy + L.paths[0].pts[0][1] * v.s;
    const edge = [get(2, py), get(v.ox * 0.5, py + 10), get(v.ox + 20 * v.s, py)];
    const fort = L.fortress, col = [];
    for (let yy = fort[1] - 140; yy <= fort[1] + 60; yy += 10) col.push(get(v.ox + 1603 * v.s, v.oy + yy * v.s));
    return { edge, col, ox: v.ox };
  });
  t.ok(px.ox > 100 && px.edge.every((c) => c[1] - c[0] < 20), "вход: пещера-холм и дорожка тянутся до левого края окна, посреди травы тёмного пятна нет (1366×768)");
  t.ok(px.col.every((c) => c[1] - c[0] > 40), "крыши крепости целиком внутри поля: правее 1600 только трава");
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(250);
  // отдельно: визуальные приёмы выключаются в reduced-motion, но волна и праздник те же
  await page.emulateMedia({ reducedMotion: "reduce" });
  await api("demo"); await api("applySolution"); await api("fight");
  await ev(() => window.OBORONA.api.stepUntilWaveEnd());
  await ev(() => window.OBORONA.render());
  const rm = await st();
  t.ok(rm.frame.banner && rm.frame.banner.stars === 3 && rm.frame.labels.length === 4, "prefers-reduced-motion: плашка со звёздами и все подписи на месте");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // ================= T1-7 размеры =================
  console.log("-- T1-7 размеры окна");
  for (const [w, h] of [[1024, 600], [1024, 768], [1366, 768], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await api("demo");
    const r = await ev(() => {
      const s = window.OBORONA.state(), v = s.view;
      const btn = Array.from(document.querySelectorAll("button")).filter((b) => b.getClientRects().length).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id || b.className, h: r.height, w: r.width }; });
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

  // ======================================================================
  // ЭТАП 2: полная игра
  // ======================================================================
  const resetAll = (date) => ev((d) => { const a = window.OBORONA.api; a.manual(true); a.reset(true); a.setToday(d || "2026-10-10"); return window.OBORONA.state().today; }, date);
  const playWaves = (n) => ev((cnt) => { const a = window.OBORONA.api, out = []; for (let i = 0; i < cnt; i++) { a.applySolution(); a.fight(); out.push(a.stepUntilWaveEnd()); } return out; }, n || 3);
  const playLevel = (id, seed, waves) => ev(([i, sd, w]) => {
    const O = window.OBORONA, a = O.api, r = a.startLevel(i, { seed: sd, waves: w });
    if (!r.ok) return r;
    for (let k = 0; k < 3; k++) { a.applySolution(); a.fight(); a.stepUntilWaveEnd(); }
    return Object.assign({ ok: true }, O.state().result);
  }, [id, seed || 1, waves || null]);
  const expSave = () => ev(() => window.OBORONA.api.exportSave());
  const imp = (o) => ev((x) => window.OBORONA.api.importSave(x), o);
  const mkWaves = (enemies, sol) => [0, 1, 2].map(() => ({ enemies: enemies.slice(), gap: 3000, solution: sol }));
  const DIG10 = DIG.concat([10]), DIG6 = DIG.concat([10, 20, 30, 40]);

  // ================= T2-1 раскладки L2–L4 =================
  console.log("-- T2-1 раскладки L1–L4");
  const lay2 = await ev(() => {
    const O = window.OBORONA, out = {};
    ["L1", "L2", "L3", "L4"].forEach((k) => { out[k] = O.layouts[k].links.map((l) => ({ id: l.id, lab: l.labelAt, cross: l.cross.map((c) => [c.path, c.t, c.x, c.y]) })); });
    return { out, val: ["L1", "L2", "L3", "L4"].map((k) => O.logic.validateLayout(O.layouts[k])), lens: ["L2", "L3", "L4"].map((k) => O.layouts[k].paths.map((p) => p.len)), mul: O.layouts.L3.speedMul };
  });
  const EXP = {
    L2: { "A-M": [248, 355, [[0, 0.1240, 184, 270]]], "M-C": [520, 185, [[0, 0.3064, 456, 270]]], "D-M": [248, 545, [[1, 0.1240, 184, 630]]], "M-E": [520, 715, [[1, 0.3064, 456, 630]]], "G-H": [1063, 365, [[0, 0.7915, 1130, 450], [1, 0.7915, 1130, 450]]], "P-H": [1260, 535, [[0, 0.8790, 1260, 450], [1, 0.8790, 1260, 450]]] },
    L3: { "A-B": [183, 130, [[0, 0.0870, 250, 215]]], "B-C": [443, 300, [[0, 0.1774, 510, 215]]], "C-D": [703, 130, [[0, 0.2678, 770, 215]]], "E-F": [1087, 605, [[0, 0.7357, 1020, 690]]], "F-G": [827, 775, [[0, 0.8261, 760, 690]]], "G-H": [567, 605, [[0, 0.9165, 500, 690]]] },
    L4: { "A-B": [163, 365, [[0, 0.1597, 230, 450]]], "B-C": [423, 535, [[0, 0.3403, 490, 450]]], "C-D": [683, 365, [[0, 0.5208, 750, 450]]], "D-E": [943, 535, [[0, 0.7014, 1010, 450]]], "E-F": [1203, 365, [[0, 0.8819, 1270, 450]]] }
  };
  ["L2", "L3", "L4"].forEach((k) => {
    const bad = [];
    lay2.out[k].forEach((l) => {
      const e = EXP[k][l.id];
      if (!e || !near(l.lab.x, e[0], 2) || !near(l.lab.y, e[1], 2) || l.cross.length !== e[2].length) { bad.push(l.id); return; }
      e[2].forEach((c, i) => { const g = l.cross[i]; if (g[0] !== c[0] || !near(g[1], c[1], 0.002) || !near(g[2], c[2], 2) || !near(g[3], c[3], 2)) bad.push(l.id + "#" + i); });
    });
    t.ok(bad.length === 0 && lay2.out[k].length === Object.keys(EXP[k]).length, k + ": cross и labelAt всех связей совпадают с разделом 4 (допуск 0,002 / 2 ед.)" + (bad.length ? " " + bad : ""));
  });
  t.eq(lay2.val, [[], [], [], []], "validateLayout(L1–L4) → []");
  t.ok(near(lay2.lens[0][0], 1487.2, 0.2) && near(lay2.lens[1][0], 2875, 0.5) && near(lay2.lens[2][0], 1440, 0.1) && lay2.mul === 1.25, "длины дорожек L2 ≈ 1487,2, L3 = 2875, L4 = 1440; у L3 speedMul 1,25");

  // ================= T2-2 чистые функции =================
  console.log("-- T2-2 splitHint, tipFor, addDays, Лейтнер, итоги");
  const l2 = await ev(() => {
    const L = window.OBORONA.logic;
    const split = {}; [[3, 4], [3, 6], [3, 7], [3, 8], [4, 4], [4, 6], [4, 7], [4, 8], [6, 6], [6, 7], [6, 8], [7, 7], [7, 8], [8, 8], [3, 3]].forEach((p) => { split[p.join("x")] = L.splitHint(p[0], p[1]); });
    const dig2 = {}; [[12, 3], [14, 4], [23, 4], [25, 3], [35, 2], [47, 2], [16, 5], [19, 4]].forEach((p) => { dig2[p.join("x")] = L.splitHint(p[0], p[1]); });
    const facts = { "7x8": { box: 2, due: "2026-10-09" }, "6x7": { box: 1, due: "2026-10-10" }, "2x2": { box: 3, due: "2026-10-12" } };
    const base = { box: 2, due: "2026-10-10", seen: 4 };
    return {
      split, dig2, nine: L.splitHint(7, 9), nine2: L.splitHint(9, 7), rev: L.splitHint(8, 7),
      tips: [L.tipFor(7, 9), L.tipFor(6, 7), L.tipFor(4, 7), L.tipFor(8, 7), L.tipFor(3, 7), L.tipFor(5, 7), L.tipFor(2, 7), L.tipFor(10, 7), L.tipFor(7, 8, { boss: true }), L.tipFor(23, 4, { boss: true }), L.tipFor(7, 7), L.tipFor(7, 9, { boss: true })],
      days: [L.addDays("2026-10-10", 3), L.addDays("2026-12-30", 3), L.addDays("2026-03-28", 1), L.addDays("2024-02-28", 1), L.addDays("2026-10-10", 0)],
      lu: [L.leitnerUpdate(base, "good", "2026-10-10"), L.leitnerUpdate({ box: 2, due: "2026-10-11" }, "good", "2026-10-10"), L.leitnerUpdate({ box: 4, due: "2026-10-10" }, "fail", "2026-10-10"), L.leitnerUpdate({ box: 5, due: "2026-10-01" }, "good", "2026-10-10"), L.leitnerUpdate(undefined, "none", "2026-10-10"), L.leitnerUpdate({ box: 2, due: "2026-10-10" }, "ok", "2026-10-10"), L.leitnerUpdate({ box: 1, due: "2026-10-10" }, "good", "2026-10-10")],
      immut: JSON.stringify(base),
      due: L.dueCards(facts, "2026-10-10"),
      wo: [L.waveOutcome([{ card: "7x8", res: "good" }, { card: "7x8", res: "fail" }]), L.waveOutcome([{ card: "7x8", res: "ok" }, { card: "7x8", res: "good" }, { card: "6x8", res: "none" }])],
      alt: [L.altPairLine(24, [3, 8], L.DIGITS), L.altPairLine(24, [6, 4], L.DIGITS), L.altPairLine(56, [7, 8], L.DIGITS), L.altPairLine(12, [3, 4], L.DIGITS)],
      iv: L.INTERVALS
    };
  });
  const SPL = { "3x4": [2, 2], "3x6": [3, 3], "3x7": [5, 2], "3x8": [5, 3], "4x4": [2, 2], "4x6": [3, 3], "4x7": [5, 2], "4x8": [5, 3], "6x6": [3, 3], "6x7": [5, 2], "6x8": [5, 3], "7x7": [5, 2], "7x8": [5, 3], "8x8": [5, 3] };
  t.ok(Object.keys(SPL).every((k) => { const [a, b] = k.split("x").map(Number), [p, q] = SPL[k], g = l2.split[k], x = Math.min(a, b), y = Math.max(a, b); return g && g.op === "+" && g.text === x + " × " + y + " = " + x + " × " + p + " + " + x + " × " + q && JSON.stringify(g.parts) === JSON.stringify([[x, p], [x, q]]) && JSON.stringify(g.beamParts) === JSON.stringify(g.parts); }) && l2.split["3x3"] === null, "splitHint: вся таблица «Трудных пятнадцати» (3x3 — null)");
  t.eq(l2.split["7x8"], { op: "+", text: "7 × 8 = 7 × 5 + 7 × 3", parts: [[7, 5], [7, 3]], beamParts: [[7, 5], [7, 3]] }, "splitHint(7, 8) целиком");
  t.eq(l2.nine, { op: "−", text: "7 × 9 = 7 × 10 − 7", parts: [[7, 10], [7, 1]], beamParts: [[7, 5], [7, 4]] }, "splitHint(7, 9): 10 минус одно, лучами 5 + 4");
  t.ok(JSON.stringify(l2.nine2) === JSON.stringify(l2.nine) && JSON.stringify(l2.rev) === JSON.stringify(l2.split["7x8"]), "splitHint не зависит от порядка аргументов");
  const D2 = { "12x3": [10, 2, 3], "14x4": [10, 4, 4], "23x4": [20, 3, 4], "25x3": [20, 5, 3], "35x2": [30, 5, 2], "47x2": [40, 7, 2], "16x5": [10, 6, 5], "19x4": [10, 9, 4] };
  t.ok(Object.keys(D2).every((k) => { const [big, small] = k.split("x").map(Number), [tens, ones, x] = D2[k], g = l2.dig2[k]; return g.text === big + " × " + x + " = " + tens + " × " + x + " + " + ones + " × " + x && JSON.stringify(g.beamParts) === JSON.stringify([[tens, x], [ones, x]]); }), "splitHint: двузначные по разрядам, 8 карточек земли 6 (23 × 4 = 20 × 4 + 3 × 4)");
  t.eq(l2.tips, [
    "×9 — это ×10 и минус одно: 7 × 9 = 7 × 10 − 7 = 70 − 7 = 63", "×6 — это ×5 и плюс одно: 6 × 7 = 5 × 7 + 7 = 35 + 7 = 42", "×4 — это удвоить дважды: 4 × 7: 7 → 14 → 28",
    "×8 — это удвоить трижды: 8 × 7: 7 → 14 → 28 → 56", "×3 — удвой и прибавь ещё раз: 3 × 7 = 14 + 7 = 21", "×5 — половина от ×10: 5 × 7 — половина от 70, это 35",
    "×2 — сложи число с собой: 2 × 7 = 7 + 7 = 14", "×10 — припиши ноль: 10 × 7 = 70", "Разрежь: 7 × 8 = 7 × 5 + 7 × 3 = 35 + 21 = 56",
    "Разрежь по разрядам: 23 × 4 = 20 × 4 + 3 × 4 = 80 + 12 = 92", "Разрежь: 7 × 7 = 7 × 5 + 7 × 2 = 35 + 14 = 49", "Разрежь: 7 × 9 = 7 × 10 − 7 = 70 − 7 = 63"], "tipFor: все приёмы раздела 10.5 (×9, ×6, ×4, ×8, ×3, ×5, ×2, ×10, разрезание, по разрядам, 7x7)");
  t.eq(l2.days, ["2026-10-13", "2027-01-02", "2026-03-29", "2024-02-29", "2026-10-10"], "addDays: через конец года, високосный февраль");
  t.ok(l2.lu[0].box === 3 && l2.lu[0].due === "2026-10-13" && l2.lu[0].seen === 4 && l2.lu[0].lastDay === "2026-10-10" && l2.lu[0].masteredOn === "2026-10-10", "leitnerUpdate: коробка 2 + good в срок → 3, due через 3 дня, masteredOn");
  t.ok(l2.lu[1].box === 2 && l2.lu[1].due === "2026-10-11", "leitnerUpdate: good до срока ничего не меняет (повышение раз в день)");
  t.ok(l2.lu[2].box === 1 && l2.lu[2].due === "2026-10-10", "leitnerUpdate: fail → коробка 1, due сегодня");
  t.ok(l2.lu[3].box === 5 && l2.lu[3].due === "2026-10-24", "leitnerUpdate: коробка 5 остаётся, due через 14 дней");
  t.ok(l2.lu[4].box === 1 && l2.lu[4].due === "2026-10-10" && l2.lu[5].box === 2 && l2.lu[6].box === 2 && l2.lu[6].due === "2026-10-11", "leitnerUpdate: новая карточка none → коробка 1; ok не меняет; 1 + good → 2, due завтра");
  t.eq(l2.immut, JSON.stringify({ box: 2, due: "2026-10-10", seen: 4 }), "leitnerUpdate не меняет вход");
  t.eq(l2.iv, { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 }, "INTERVALS: 0, 1, 3, 7, 14 дней");
  t.eq(l2.due, ["7x8", "6x7"], "dueCards: по due, затем по коробке");
  t.eq(l2.wo, [{ "7x8": "fail" }, { "7x8": "good", "6x8": "none" }], "waveOutcome: fail сильнее good, good сильнее ok, none отдельно");
  t.eq(l2.alt, ["24 можно было победить ещё лучом 4 × 6", "24 можно было победить ещё лучом 3 × 8", null, "12 можно было победить ещё лучом 2 × 6"], "altPairLine: другая пара того же числа или null");
  const ls = await ev(() => {
    const L = window.OBORONA.logic, mk = (keys, box) => { const f = {}; keys.forEach((k) => { f[k] = { box, bossDays: [], divDays: [] }; }); return f; };
    const l3 = L.LANDS[2].facts, f3 = mk(l3, 3), f3b = mk(l3, 3); f3b["6x7"].box = 2;
    const f4 = mk(L.LANDS[3].facts, 3), f4b = mk(L.LANDS[3].facts, 3); L.LANDS[3].facts.forEach((k) => { f4b[k].bossDays = ["2026-10-01"]; }); const f4c = JSON.parse(JSON.stringify(f4b)); f4c["7x8"].bossDays = [];
    const f5 = mk(L.LANDS[4].facts, 3); L.LANDS[4].facts.forEach((k) => { f5[k].divDays = ["2026-10-01"]; });
    const x7 = mk(["2x7", "3x7", "4x7", "5x7", "6x7", "7x7", "7x8", "7x9"], 3), x7b = JSON.parse(JSON.stringify(x7)); x7b["7x9"].box = 2;
    return { n: L.LANDS.map((l) => l.facts.length), lv: L.LEVELS.length, perLand: [1, 2, 3, 4, 5, 6].map((i) => L.LEVELS.filter((l) => l.land === i).length), s3: [L.landStudied(3, f3), L.landStudied(3, f3b)], s4: [L.landStudied(4, f4), L.landStudied(4, f4b), L.landStudied(4, f4c)], s5: [L.landStudied(5, f5), L.landStudied(5, mk(L.LANDS[4].facts, 3))], rw: [L.rewardsEarned(x7), L.rewardsEarned(x7b), L.rewardsEarned({})] };
  });
  t.eq(ls.n, [23, 11, 7, 15, 33, 8], "земли: 23, 11, 7, 15, 33 и 8 карточек (раздел 8.1)");
  t.ok(ls.lv === 25 && JSON.stringify(ls.perLand) === "[4,4,4,5,4,4]", "25 уровней: 4, 4, 4, 5, 4, 4");
  t.eq([ls.s3, ls.s4, ls.s5], [[true, false], [false, true, false], [true, false]], "landStudied: земля 3 — все box ≥ 3; земля 4 — ещё bossDays; земля 5 — ещё divDays");
  t.ok(ls.rw[0].includes("x7") && !ls.rw[1].includes("x7") && ls.rw[2].length === 0, "rewardsEarned: все карточки с 7 в коробке 3 → «x7»; без одной — нет");
  const rnd = await ev(() => {
    const L = window.OBORONA.logic, a = L.mulberry32(42), b = L.mulberry32(42), c = L.mulberry32(43);
    const xs = [a(), a(), a()], ys = [b(), b(), b()];
    return { same: JSON.stringify(xs) === JSON.stringify(ys), diff: xs[0] !== c(), range: xs.every((x) => x >= 0 && x < 1), h: [L.hashSeed("1-1|0|2026-10-10|0"), L.hashSeed("1-1|0|2026-10-10|0"), L.hashSeed("1-1|1|2026-10-10|0")] };
  });
  t.ok(rnd.same && rnd.diff && rnd.range && rnd.h[0] === rnd.h[1] && rnd.h[0] !== rnd.h[2] && Number.isInteger(rnd.h[0]) && rnd.h[0] >= 0, "mulberry32 и hashSeed: один seed — одна последовательность, значения в [0, 1)");
  const sw = await ev(() => {
    const O = window.OBORONA, L = O.logic, sol = L.solveWave(O.layouts.L1, [56, 42, 24, 18].map((v) => ({ value: v, kind: "normal" })), { hand: L.DIGITS });
    const sol4 = L.solveWave(O.layouts.L4, [{ value: 56, kind: "normal" }], { hand: L.DIGITS, fixed: { B: 7 } }), no = L.solveWave(O.layouts.L1, [7, 11].map((v) => ({ value: v, kind: "normal" })), { hand: L.DIGITS });
    const boss = L.solveWave(O.layouts.L1, [{ value: 56, kind: "boss", parts: [[7, 5], [7, 3]] }], { hand: L.DIGITS });
    return { sol, sol4, no, boss };
  });
  t.ok(sw.sol && sw.sol.beams.length === 4 && ["56", "42", "24", "18"].every((k) => sw.sol.paths[k] === 0), "solveWave(L1, 56, 42, 24, 18) → решение с 4 лучами");
  t.ok(sw.sol4 && sw.sol4.pads.B === 7 && (sw.sol4.pads.A === 8 || sw.sol4.pads.C === 8) && sw.no === null, "solveWave: неподвижная 7 на B даёт напарника 8; числа 7 и 11 без решения → null");
  t.ok(sw.boss && sw.boss.beams.length === 2 && sw.boss.paths["56b"] === 0, "solveWave: босс 56 по частям 7 × 5 и 7 × 3 — два луча");

  // ================= T2-3 Лейтнер в бою =================
  console.log("-- T2-3 Лейтнер в бою");
  const FL = { layout: "L1", hand: DIG, fixed: {}, track: true, waves: [{ enemies: [56], gap: 3000 }] };
  const card78 = async (setupFn) => {
    await resetAll();
    await imp({ facts: { "7x8": { box: 2, due: "2026-10-10" } } });
    await load(FL);
    await setupFn();
    await ev(() => { const a = window.OBORONA.api; if (window.OBORONA.state().phase === "prep") a.fight(); a.stepUntilWaveEnd(); });
    return (await expSave()).facts["7x8"];
  };
  let c78 = await card78(() => setup({ A: 6, B: 7, C: 8 }, [["B", "C"]]));
  t.ok(c78.box === 3 && c78.due === "2026-10-13" && c78.good === 1 && c78.seen === 1 && c78.lastDay === "2026-10-10", "луч 7 × 8 построен в подготовке: коробка 2 → 3, due 2026-10-13");
  c78 = await card78(async () => { await setup({ A: 6, B: 7, C: 8 }, [["B", "C"]]); await api("placeTower", "C", 6); await api("placeTower", "C", 8); });
  t.ok(c78.box === 2 && c78.ok === 1 && c78.good === 0, "луч перестроен дважды (смена цифры C на 6, потом на 8): коробка 2");
  c78 = await card78(async () => {
    await setup({ A: 6, B: 7, C: 8 }, []);
    await api("fight"); await api("step", 100); await api("pause"); await api("beam", "B", "C"); await api("resume");
  });
  t.ok(c78.box === 2 && c78.ok === 1, "луч построен на паузе (phase battle): коробка 2 — победа засчитана как ok, повышения нет");
  c78 = await card78(() => setup({ A: 6, B: 7, C: 8 }, []));
  t.ok(c78.box === 1 && c78.due === "2026-10-10" && c78.fail === 1, "враг дошёл до крепости: коробка 1, due сегодня, fail 1");
  c78 = await card78(async () => { await setup({ A: 6, B: 7, C: 8 }, [["B", "C"]]); await api("breakBeam", "B-C"); await api("beam", "B", "C"); });
  t.ok(c78.box === 3, "луч порвали и построили заново в подготовке (edits 2 — один раз перестраивали): всё равно good");
  // победа лучом другой пары того же числа: задуманная карточка получает none, карточка луча — good
  await resetAll();
  await imp({ facts: { "3x8": { box: 2, due: "2026-10-10" }, "4x6": { box: 2, due: "2026-10-10" } } });
  await load({ layout: "L1", hand: DIG, fixed: {}, track: true, waves: [{ enemies: [{ value: 24, card: "3x8" }], gap: 3000 }] });
  await setup({ A: 4, B: 6 }, [["A", "B"]]);
  await ev(() => { const a = window.OBORONA.api; a.fight(); a.stepUntilWaveEnd(); });
  const f24 = (await expSave()).facts;
  t.ok(f24["4x6"].box === 3 && f24["3x8"].box === 2 && f24["3x8"].seen === 1 && f24["3x8"].good === 0, "24 задумано как 3 × 8, побеждено лучом 4 × 6: карточка 4x6 — good (коробка 3), 3x8 — none (не меняется)");
  // даты: повышение не чаще раза в день, дальше по интервалам 1, 3, 7, 14 дней
  console.log("-- Лейтнер по датам");
  await resetAll("2026-10-10");
  const dayWave = async (date) => {
    await ev((d) => window.OBORONA.api.setToday(d), date);
    await load({ layout: "L1", hand: DIG, fixed: {}, track: true, waves: [{ enemies: [56], gap: 3000 }] });
    await setup({ A: 6, B: 7, C: 8 }, [["B", "C"]]);
    await ev(() => { const a = window.OBORONA.api; a.fight(); a.stepUntilWaveEnd(); });
    const c = (await expSave()).facts["7x8"];
    return c.box + "@" + c.due;
  };
  const seq = [];
  for (const d of ["2026-10-10", "2026-10-10", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-14", "2026-10-21", "2026-11-04"]) seq.push(await dayWave(d));
  t.eq(seq, ["2@2026-10-11", "2@2026-10-11", "2@2026-10-11", "3@2026-10-14", "3@2026-10-14", "4@2026-10-21", "5@2026-11-04", "5@2026-11-18"],
    "победа лучом из подготовки: день 1 — коробка 2 (повторы в тот же день ничего не меняют), 11-е — 3, 12-е — без изменений, 14-е — 4, 21-е — 5, 4 ноября — 5 с due через 14 дней");
  await resetAll("2026-10-10");
  await imp({ facts: { "7x8": { box: 4, due: "2026-10-17" } } });
  await ev(() => window.OBORONA.api.setToday("2026-10-17"));
  await load(FL); await ev(() => window.OBORONA.api.fight()); await ev(() => window.OBORONA.api.stepUntilWaveEnd());
  t.eq((await expSave()).facts["7x8"].box + "@" + (await expSave()).facts["7x8"].due, "1@2026-10-17", "через неделю без луча: враг дошёл — коробка 1 и due сегодня");

  // ================= T2-4 путаницы =================
  console.log("-- T2-4 путаницы и время луча");
  await resetAll();
  await load({ layout: "L1", hand: DIG, fixed: {}, track: true, waves: [{ enemies: [56], gap: 3000 }] });
  await setup({ A: 6, B: 8 }, [["A", "B"]]);
  await ev(() => { const a = window.OBORONA.api; a.fight(); a.stepUntilWaveEnd(); });
  let cf = (await expSave()).confusions;
  t.ok(cf["48|56"] && cf["48|56"].n === 1 && cf["48|56"].last === "2026-10-10", "врагу 56 построен только луч 6 × 8 = 48: путаница «48|56», n = 1");
  await load({ layout: "L1", hand: DIG, fixed: {}, track: true, waves: [{ enemies: [56, 48], gap: 3000 }] });
  await setup({ A: 6, B: 8 }, [["A", "B"]]);
  await ev(() => { const a = window.OBORONA.api; a.fight(); a.stepUntilWaveEnd(); });
  cf = (await expSave()).confusions;
  t.eq(cf["48|56"].n, 1, "волна [56, 48] с тем же лучом: 48 — число другого врага, путаница не записывается (n остался 1)");
  await resetAll();
  await load({ layout: "L1", hand: DIG, fixed: {}, track: true, waves: [{ enemies: [56], gap: 3000 }] });
  await setup({ A: 6, B: 7, C: 8 }, [["A", "B"], ["B", "C"]]);
  await ev(() => { const a = window.OBORONA.api; a.fight(); a.stepUntilWaveEnd(); });
  t.eq(Object.keys((await expSave()).confusions), [], "56 прошёл 6 × 7, но дальше есть нужный 7 × 8: путаницы нет");
  const tm = (await expSave()).facts;
  t.ok(tm["7x8"].msN === 1 && tm["7x8"].msSum >= 0 && tm["7x8"].msSum < 120000, "время построения луча 7 × 8 записано для взрослого (msN 1)");
  t.ok(!(await ev(() => document.body.innerText)).match(/построен|среднем/), "ребёнку время построения нигде не показывается");

  // ================= T2-5 боссы земли 6 =================
  console.log("-- T2-5 босс-разрезание на земле 6");
  const H6 = { layout: "L1", hand: DIG6, fixed: {}, hold: true, waves: [{ enemies: [] }] };
  await load(H6);
  t.eq(await ev(() => Array.from(document.querySelectorAll("#tiles .tile")).map((x) => Number(x.dataset.v))), DIG6, "рука земли 6: 2–9, 10, 20, 30, 40");
  await setup({ A: 20, B: 4, C: 3 }, [["A", "B"], ["B", "C"]]);
  await api("fight"); await api("spawn", 92, { kind: "boss" });
  const bs1 = await stepUntil("s => s.enemies.length && s.enemies[0].value !== 92");
  t.ok(bs1.enemies[0].value === 12 && bs1.texts.some((x) => x.text === "92 − 80 = 12"), "босс 92: луч 20 × 4 = 80 → «92 − 80 = 12», на щите 12");
  const bs2 = await stepUntil("s => s.enemies.length === 0");
  t.ok(bs2.enemies.length === 0 && bs2.events.some((e) => e.type === "kill" && e.beam === "B-C"), "луч 4 × 3 = 12 побеждает босса");
  await load(F1);
  await setup({ A: 6, B: 9 }, [["A", "B"]]);
  await api("fight"); await api("spawn", 56, { kind: "boss" });
  const bs3 = await stepUntil("s => s.texts.length > 0");
  t.ok(bs3.enemies[0].value === 56 && bs3.texts[0].text === "Останется 2 — такого луча нет", "тупик: босс 56 и луч 6 × 9 = 54 — «Останется 2 — такого луча нет», число 56");

  // ================= T2-6…T2-10 сборка волны =================
  console.log("-- T2-6…T2-10 buildWave");
  const injectT = () => ev(() => {
    const O = window.OBORONA, L = O.logic;
    window.__T = {
      ctx: (id, wi, unl, today) => { const lv = L.LEVELS.find((l) => l.id === id); return { land: lv.land, levelId: id, waveIndex: wi, layout: O.layouts[lv.layout], hand: L.LANDS[lv.land - 1].hand, fixed: lv.fixed, wave: lv.waves[wi], unlocked: unl || [1, 2, 3, 4, 5, 6].slice(0, lv.land), today: today || "2026-10-10" };},
      card: (box, due) => ({ box, due, seen: 3, good: 2, ok: 0, fail: 0, bossSeen: 0, bossDays: [], noHintDays: [], divDays: [], lastDay: "", masteredOn: "", msSum: 0, msN: 0 })
    };
  });
  await injectT();
  const det = await ev(() => {
    const T = window.__T, L = window.OBORONA.logic;
    const prof = () => ({ facts: { "3x3": T.card(1, "2026-10-09"), "3x4": T.card(2, "2026-10-20"), "4x4": T.card(3, "2026-10-20") }, confusions: {}, heavyStreak: 0, lightStreak: 0 });
    const a = L.buildWave(prof(), T.ctx("2-3", 1, [1, 2]), 42), b = L.buildWave(prof(), T.ctx("2-3", 1, [1, 2]), 42), c = L.buildWave(prof(), T.ctx("2-3", 1, [1, 2]), 43);
    const sigs = new Set(); for (let s = 1; s <= 12; s++) sigs.add(JSON.stringify(L.buildWave(prof(), T.ctx("2-3", 1, [1, 2]), s).enemies.map((e) => e.value)));
    return { same: JSON.stringify(a) === JSON.stringify(b), type: typeof c === "object" && Array.isArray(c.enemies), differs: sigs.size > 1, seed: a.meta.seed, keys: Object.keys(a), n: a.enemies.length, sp: a.enemies.map((e) => e.spawnAt) };
  });
  t.ok(det.same && det.seed === 42, "buildWave(profile, ctx, 42) дважды — одинаковый результат до последнего поля");
  t.ok(det.type && det.differs && ["enemies", "cards", "solution", "meta"].every((k) => det.keys.includes(k)), "с другим seed — другой порядок/состав (12 seed дали разные волны); выход: enemies, cards, solution, meta");
  t.ok(det.sp[0] === 0 && det.sp.every((v, i) => i === 0 || v - det.sp[i - 1] >= 3000), "spawnAt растёт с шагом не меньше 3000 мс");

  const solv = await ev(() => {
    const O = window.OBORONA, L = O.logic, A = O.api, T = window.__T;
    A.manual(true);
    const mkF = (land, kind) => { const f = {}; L.LANDS.forEach((l) => { if (l.id <= land) l.facts.forEach((k, i) => { if (kind === "all") f[k] = Object.assign(T.card(4, "2026-10-30"), { bossSeen: 3, bossDays: ["2026-10-01"], divDays: ["2026-10-01"] }); else if (kind === "mid" && i % 2 === 0) f[k] = Object.assign(T.card(1 + (i % 3), i % 4 === 0 ? "2026-10-10" : "2026-10-20"), { bossSeen: i % 3 }); }); }); return f; };
    const out = { waves: 0, bad: [], sims: 0, simBad: [], bosses: 0, kMax: {} };
    L.LEVELS.forEach((lv) => lv.waves.forEach((w, wi) => ["empty", "mid", "all"].forEach((pn) => {
      for (let seed = 1; seed <= 20; seed++) {
        const prof = { facts: mkF(lv.land, pn), confusions: {}, heavyStreak: seed % 7 === 0 ? 2 : 0, lightStreak: seed % 5 === 0 ? 2 : 0 };
        const easy = prof.heavyStreak >= 2, ctx = T.ctx(lv.id, wi);
        const r = L.buildWave(prof, ctx, seed);
        out.waves++;
        const nb = r.enemies.filter((e) => e.kind === "boss").length, kLimit = Math.max(easy ? Math.max(1, w.k - 1) : prof.lightStreak ? Math.min(4, w.k + 1) : w.k, w.b ? 3 : 1);
        if (!r.solution) out.bad.push([lv.id, wi, pn, seed, "нет решения"]);
        else if (r.enemies.length !== (easy ? 6 : w.n) || nb !== w.b || r.meta.k > kLimit || r.meta.easy !== easy) out.bad.push([lv.id, wi, pn, seed, "n " + r.enemies.length + " b " + nb + " k " + r.meta.k]);
        out.bosses += nb;
        if (r.solution) {
          A.loadLevel({ layout: lv.layout, hand: L.LANDS[lv.land - 1].hand, fixed: lv.fixed, hearts: 10, waves: [{ enemies: r.enemies, gap: r.meta.gap, solution: r.solution }] });
          A.applySolution(); A.fight(); A.stepUntilWaveEnd();
          const s = O.state(); out.sims++;
          if (s.events.filter((e) => e.type === "kill").length !== r.enemies.length || s.events.some((e) => e.type === "gate")) out.simBad.push([lv.id, wi, pn, seed]);
        }
      }
    })));
    return out;
  });
  t.eq(solv.bad.slice(0, 5), [], "T2-7: все 25 уровней × 3 волны × seed 1…20 × 3 профиля (" + solv.waves + " волн): решение есть, число врагов и боссов по таблице, k не больше табличного");
  t.ok(solv.sims === solv.waves && solv.simBad.length === 0, "T2-7: решение solveWave проходит через настоящую симуляцию — все враги побеждены, ни один не дошёл (" + solv.sims + " волн, провалов " + solv.simBad.length + (solv.simBad.length ? ": " + JSON.stringify(solv.simBad.slice(0, 3)) : "") + ")");
  t.ok(solv.bosses > 600, "в волнах с боссами боссы действительно стоят (" + solv.bosses + " боссов)");

  const ent = await ev(() => {
    const T = window.__T, L = window.OBORONA.logic, out = { waves: 0, bad: [], keys: new Set() };
    L.LEVELS.filter((l) => l.waves.some((w) => w.b)).forEach((lv) => lv.waves.forEach((w, wi) => {
      if (!w.b) return;
      for (let seed = 1; seed <= 6; seed++) {
        const f = {}; L.LANDS[lv.land - 1].facts.forEach((k, i) => { if ((i + seed) % 2) f[k] = Object.assign(T.card(2 + (i % 3), seed % 3 === 0 && i % 4 === 0 ? "2026-10-10" : "2026-10-20"), { bossSeen: (i + seed) % 4, bossDays: (i * seed) % 3 ? [] : ["2026-10-01"] }); });
        const r = L.buildWave({ facts: f, confusions: {}, heavyStreak: 0, lightStreak: 0 }, T.ctx(lv.id, wi), seed), vals = r.enemies.map((e) => e.value);
        const bosses = r.enemies.filter((e) => e.kind === "boss"); out.waves++;
        const [a, b] = bosses[0].card.split("x").map(Number), sp = L.splitHint(a, b);
        out.keys.add(bosses[0].card);
        if (sp && !sp.beamParts.every((p) => vals.includes(p[0] * p[1]))) out.bad.push([lv.id, wi, seed, bosses[0].card, vals.join()]);
        if (bosses.some((x) => x.card !== bosses[0].card)) out.bad.push([lv.id, wi, seed, "разные боссы"]);
      }
    }));
    return { waves: out.waves, bad: out.bad, keys: out.keys.size };
  });
  t.ok(ent.bad.length === 0 && ent.waves > 100 && ent.keys >= 3, "свита босса: рядом с боссом идут враги с числами его частей разрезания (7 × 5 = 35 и 7 × 3 = 21 для 7x8); два босса — одной карточки (" + ent.waves + " волн, " + ent.keys + " разных боссов)" + (ent.bad.length ? " " + JSON.stringify(ent.bad.slice(0, 2)) : ""));
  const mix = await ev(() => {
    const T = window.__T, L = window.OBORONA.logic, out = [];
    const mkProf = (hs) => { const f = {}; ["3x3", "3x4", "4x4"].forEach((k) => { f[k] = T.card(1, "2026-10-09"); }); ["3x6", "3x7", "3x8", "3x9"].forEach((k) => { f[k] = T.card(2, "2026-10-20"); }); return { facts: f, confusions: {}, heavyStreak: hs || 0, lightStreak: 0 }; };
    for (let seed = 1; seed <= 20; seed++) {
      const prof = mkProf(0), r = L.buildWave(prof, T.ctx("2-4", 1, [1, 2]), seed);
      const cards = Array.from(new Set(r.enemies.map((e) => e.card)));
      out.push({ seed, meta: [r.meta.newCount, r.meta.dueCount, r.meta.famCount, r.meta.n, r.meta.k], newC: cards.filter((k) => !prof.facts[k]).length, dueC: cards.filter((k) => prof.facts[k] && prof.facts[k].due <= "2026-10-10").length, famC: cards.filter((k) => prof.facts[k] && prof.facts[k].due > "2026-10-10").length });
    }
    const e1 = L.buildWave(mkProf(2), T.ctx("2-4", 1, [1, 2]), 5), e2 = L.buildWave(mkProf(2), T.ctx("2-1", 0, [1, 2]), 5), lt = L.buildWave(Object.assign(mkProf(0), { lightStreak: 2 }), T.ctx("2-1", 0, [1, 2]), 5);
    const prof2 = mkProf(2);
    return { out, e1: { easy: e1.meta.easy, n: e1.enemies.length, k: e1.meta.k, gap: e1.meta.gap, newC: Array.from(new Set(e1.enemies.map((e) => e.card))).filter((k) => !prof2.facts[k]).length, sp: e1.enemies.map((e) => e.spawnAt) }, e2: { k: e2.meta.k, n: e2.enemies.length }, lt: { k: lt.meta.k, easy: lt.meta.easy } };
  });
  t.ok(mix.out.every((o) => JSON.stringify(o.meta) === "[1,2,7,10,4]" && o.newC === 1 && o.dueC >= 1 && o.dueC <= 2 && o.famC >= 1), "T2-8: профиль с 4 новыми, 3 повторяемыми и 4 знакомыми карточками, n = 10, k = 4: 1 новый враг, 2 повторяемых, 7 знакомых; одна новая карточка и 1–2 повторяемых (20 seed)");
  t.ok(mix.e1.easy && mix.e1.n === 6 && mix.e1.k === 3 && mix.e1.gap === 4500 && mix.e1.newC === 0 && mix.e1.sp[1] === 4500, "T2-9: heavyStreak 2 → облегчённая волна: 6 врагов, k на 1 меньше (4 → 3), новых нет, интервал 4500 мс");
  t.ok(mix.e2.k === 1 && mix.e2.n === 6 && mix.lt.k === 3 && !mix.lt.easy, "T2-9: облегчённая волна с k 2 → 1; две лёгкие подряд (lightStreak 2) → на одно число больше (k 2 → 3)");
  // облегчение живьём: две тяжёлые волны подряд, затем облегчённая, после неё heavyStreak 0
  await resetAll();
  const hv = [];
  for (let i = 0; i < 2; i++) {
    await load({ layout: "L1", hand: DIG, fixed: {}, track: true, waves: [{ enemies: [56, 56, 56], gap: 3000 }] });
    await ev(() => { const a = window.OBORONA.api; a.fight(); a.stepUntilWaveEnd(); });
    hv.push((await expSave()).profile.heavyStreak);
  }
  t.eq(hv, [1, 2], "две тяжёлые волны подряд (враги дошли): heavyStreak 1, затем 2");
  const ez = await ev(() => { const O = window.OBORONA, a = O.api, r = a.startLevel("1-1", { seed: 3 }); return { r, meta: O.state().wave.meta, n: O.state().ribbon.length }; });
  t.ok(ez.r.ok && ez.meta.easy === true && ez.n === 6 && ez.meta.gap === 4500, "следующая волна настоящего уровня облегчённая: easy, 6 врагов, интервал 4500 мс");
  await playWaves(1);
  t.eq((await expSave()).profile.heavyStreak, 0, "после облегчённой волны heavyStreak сбрасывается в 0");
  // путаницы
  const cfw = await ev(() => {
    const T = window.__T, L = window.OBORONA.logic, out = [];
    for (let seed = 1; seed <= 20; seed++) {
      const facts = { "7x8": T.card(2, "2026-10-20"), "6x8": T.card(2, "2026-10-20"), "6x7": T.card(2, "2026-10-20"), "4x8": T.card(2, "2026-10-20"), "3x8": T.card(2, "2026-10-20") };
      const r = L.buildWave({ facts, confusions: { "48|56": { n: 2, last: "2026-10-09" } }, heavyStreak: 0, lightStreak: 0 }, T.ctx("4-1", 0, [1, 2, 3, 4]), seed);
      const vals = r.enemies.map((e) => e.value);
      out.push(vals.includes(56) && vals.includes(48));
    }
    const none = []; for (let seed = 1; seed <= 20; seed++) { const facts = { "7x8": T.card(2, "2026-10-20"), "6x8": T.card(2, "2026-10-20") }; const r = L.buildWave({ facts, confusions: { "48|56": { n: 1 } }, heavyStreak: 0, lightStreak: 0 }, T.ctx("4-1", 0, [1, 2, 3, 4]), seed); none.push(r.enemies.length); }
    return { out, none: none.length };
  });
  t.ok(cfw.out.every(Boolean), "T2-10: пара «48|56» с n = 2 и карточками 7x8, 6x8 в пуле → в волне есть и 56, и 48 (20 seed из 20)");

  // ================= Карта мира =================
  console.log("-- Карта мира");
  await resetAll();
  await ev(() => { window.OBORONA.api.toMap(); });
  const mp = await ev(() => {
    const s = window.OBORONA.state(), lands = Array.from(document.querySelectorAll(".land")), lv = Array.from(document.querySelectorAll(".lvl"));
    return {
      screen: s.screen, n: lands.length, nl: lv.length, closed: lands.filter((l) => l.classList.contains("closed")).length, enabled: lv.filter((b) => !b.disabled).map((b) => b.dataset.id),
      names: lands.map((l) => l.querySelector(".lname").textContent), sub: lands.map((l) => l.querySelector(".lsub").textContent), rw: document.querySelectorAll(".rw").length, rwOn: document.querySelectorAll(".rw.on").length,
      title: document.querySelector("#scrMap h1").textContent, adult: document.getElementById("adultBtn").textContent.trim(), rest: !!document.getElementById("mapRest"),
      small: Array.from(document.querySelectorAll("#scrMap button")).filter((b) => b.getClientRects().length && (b.getBoundingClientRect().height < 48 || b.getBoundingClientRect().width < 48)).map((b) => b.dataset.id || b.id),
      sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth
    };
  });
  t.ok(mp.screen === "map" && mp.n === 6 && mp.nl === 25 && mp.rw === 12 && mp.rwOn === 0 && mp.title === "Оборона таблицы", "карта мира: 6 земель, 25 кнопок уровней, 12 наград (все видны, ни одна не получена), заголовок");
  t.eq(mp.names, ["Долина двоек, пятёрок и десяток", "Холмы троек и четвёрок", "Лес девяток и шестёрок", "Горы «Трудные пятнадцать»", "Земля деления", "Крепость двузначных"], "названия земель");
  t.ok(mp.sub[0] === "Изучено 0 из 23" && mp.closed === 5 && mp.sub.slice(1).every((x) => x === "Откроется, когда изучишь примеры прошлой земли"), "земля 1: «Изучено 0 из 23»; остальные закрыты: «Откроется, когда изучишь примеры прошлой земли»");
  t.eq(mp.enabled, ["1-1"], "в начале открыт один уровень — 1-1");
  t.ok(mp.small.length === 0 && mp.adult === "Для взрослых" && !mp.rest, "кнопки карты от 48 px; кнопка «Для взрослых» на месте; надписи про отдых нет");
  t.eq((await api("startLevel", "1-2")).reason, "closed", "startLevel(«1-2») до прохождения 1-1 — «closed»");
  t.eq((await api("startLevel", "2-1")).reason, "closed", "startLevel(«2-1») при закрытой земле 2 — «closed»");
  t.eq((await api("startLevel", "9-9")).reason, "unknown", "неизвестный уровень — «unknown»");
  await page.click('.lvl[data-id="1-1"]');
  const st11 = await st();
  t.ok(st11.screen === "level" && st11.level.id === "1-1" && st11.level.layout === "L1" && st11.level.waveCount === 3 && st11.phase === "prep" && st11.level.practice === false, "касание кнопки уровня 1-1: экран level, раскладка L1, три волны, подготовка");
  t.eq(await ev(() => document.getElementById("waveNo").textContent), "Волна 1 из 3", "в полосе «Волна 1 из 3»");
  t.eq((await ev(() => Array.from(document.querySelectorAll("#tiles .tile")).map((x) => Number(x.dataset.v)))), DIG10, "рука земли 1: 2–9 и 10");
  t.ok(await ev(() => { const b = document.getElementById("mapBtn"); return !b.hidden && b.getBoundingClientRect().width >= 48; }), "в подготовке есть кнопка «На карту» (от 48 px)");
  const lv1 = await st();
  t.ok(lv1.ribbon.length === 6 && new Set(lv1.ribbon.map((r) => r.value)).size === 2 && lv1.wave.meta.n === 6 && lv1.wave.solution && lv1.wave.cards.length === 2, "волна 1 уровня 1-1: 6 врагов, 2 разных числа, решение есть");
  await page.click("#mapBtn");
  t.eq((await st()).screen, "map", "«На карту» из подготовки: экран map, уровень не засчитан");
  t.eq((await expSave()).today.levels, 0, "уход с уровня не засчитывается в лимит дня");
  // уровни: три волны, звёзды, открытие следующего
  const seedA = await ev(() => { const a = window.OBORONA.api; return a.startLevel("1-1", { seed: 77 }); });
  const seedB = await ev(() => window.OBORONA.state().ribbon.map((r) => r.value).join());
  await ev(() => window.OBORONA.api.startLevel("1-1", { seed: 77 }));
  t.ok(seedA.seed === 77 && seedB === (await ev(() => window.OBORONA.state().ribbon.map((r) => r.value).join())) && (await st()).level.seed === 77, "startLevel(id, {seed}): один seed — та же волна; seed хранится в state().level.seed");
  const pw = await playWaves(3);
  const r11 = await st();
  t.ok(pw.every((x) => x.ok) && r11.screen === "levelEnd" && r11.phase === "levelEnd" && r11.result.stars === 3 && r11.result.hearts === 10 && r11.hearts === 10, "уровень 1-1 пройден по решениям: три волны, 10 сердечек, 3 звезды, экран levelEnd");
  const le = await ev(() => { const e = document.getElementById("scrLevelEnd"); return { vis: !e.hidden, txt: e.innerText.replace(/\s+/g, " "), stars: e.querySelectorAll(".bigstars .st.on").length, btn: e.querySelector("#lvDone").getBoundingClientRect().height, endCard: getComputedStyle(document.getElementById("endCard")).visibility }; });
  t.ok(le.vis && /Уровень пройден!/.test(le.txt) && /Сохранено 10 сердечек из 10/.test(le.txt) && le.stars === 3 && le.btn >= 64 && /Дальше/.test(le.txt) && le.endCard === "hidden", "экран итогов: «Уровень пройден!», 3 звезды, «Сохранено 10 сердечек из 10», крупная «Дальше»");
  const sv = await expSave();
  t.ok(sv.levels["1-1"].stars === 3 && sv.levels["1-1"].plays === 1 && sv.today.levels === 1 && sv.today.session === 1 && sv.profile.lastLevel === "1-1" && sv.history.length === 1 && sv.history[0].lvl === "1-1" && sv.history[0].waves.length === 3, "сохранение: звёзды уровня, plays 1, today.levels 1, session 1, lastLevel, запись в history");
  await api("levelEndNext");
  t.eq((await st()).screen, "map", "«Дальше» после первого уровня — карта (сессия ещё не кончилась)");
  const mp2 = await ev(() => ({ enabled: Array.from(document.querySelectorAll(".lvl")).filter((b) => !b.disabled).map((b) => b.dataset.id), done: Array.from(document.querySelectorAll(".lvl.done")).map((b) => b.dataset.id), stars: document.querySelectorAll('.lvl[data-id="1-1"] .st.on').length }));
  t.ok(mp2.enabled.includes("1-1") && mp2.enabled.includes("1-2") && mp2.done[0] === "1-1" && mp2.stars === 3 && !mp2.enabled.includes("1-3"), "после 1-1 открыт 1-2; на кнопке пройденного уровня три звезды; 1-3 ещё закрыт");

  // звёзды по сердечкам и честная доигровка
  console.log("-- звёзды и сердечки");
  await resetAll();
  const bad1 = await ev(() => {
    const O = window.OBORONA, a = O.api;
    a.startLevel("1-1", { seed: 4 });
    for (let w = 0; w < 3; w++) { a.fight(); a.stepUntilWaveEnd(); }
    return O.state();
  });
  t.ok(bad1.screen === "levelEnd" && bad1.hearts === 0 && bad1.result.stars === 1 && bad1.result.text === "Волна позади: 0 из 6", "без лучей уровень доигрывается до конца: 0 сердечек, 1 звезда, честный итог волны (третья волна облегчённая: 6 врагов)");
  t.eq(bad1.save.levels["1-1"].stars, 1, "лучший результат уровня сохранён (1 звезда)");
  await api("levelEndNext");
  await ev(() => { const a = window.OBORONA.api; a.startLevel("1-1", { seed: 4 }); });
  await playWaves(3);
  t.eq((await expSave()).levels["1-1"], { stars: 3, plays: 2 }, "перепрохождение лучше — лучший результат 3 звезды, plays 2");

  // ================= T2-11 открытие земель =================
  console.log("-- T2-11 открытие земель");
  await resetAll();
  const L1facts = {}; ["2x2", "2x3", "2x4", "2x5", "5x5", "2x10", "3x10", "5x10", "2x6", "3x5", "4x5", "4x10", "2x7", "5x6", "6x10", "2x8", "5x7", "7x10", "2x9", "5x8", "8x10", "5x9", "9x10"].forEach((k) => { L1facts[k] = { box: 3, due: "2026-10-30" }; });
  await imp({ facts: L1facts });
  t.eq((await expSave()).unlocked, [1], "до конца уровня земля 2 ещё закрыта (importSave не открывает земли сам)");
  await playLevel("1-1", 9);
  t.eq((await expSave()).unlocked, [1, 2], "все карточки земли 1 в коробке 3 → после конца уровня открыта земля 2");
  await api("levelEndNext");
  const mp3 = await ev(() => ({ enabled: Array.from(document.querySelectorAll(".lvl")).filter((b) => !b.disabled).map((b) => b.dataset.id), sub: document.querySelector('.land[data-land="1"] .lsub').textContent, closed: document.querySelectorAll(".land.closed").length }));
  t.ok(mp3.enabled.includes("2-1") && !mp3.enabled.includes("2-2") && mp3.closed === 4 && mp3.sub === "Изучено 23 из 23", "на карте открыта земля 2 (уровень 2-1), в земле 1 «Изучено 23 из 23»");
  // земля 4 и 5: нужна победа в роли босса
  await resetAll();
  const allKeys = await ev(() => window.OBORONA.logic.LANDS.slice(0, 4).map((l) => l.facts));
  const f4 = {}; allKeys.forEach((arr) => arr.forEach((k) => { f4[k] = { box: 3, due: "2026-10-30" }; }));
  const HARD = await ev(() => window.OBORONA.logic.HARD15);
  HARD.forEach((k) => { f4[k] = { box: 3, due: "2026-10-30", bossDays: k === "7x8" ? [] : ["2026-10-01"] }; });
  await imp({ facts: f4, unlocked: [1, 2, 3, 4] });
  await playLevel("1-1", 9);
  const ul1 = (await expSave()).unlocked;
  t.ok(ul1.includes(4) && !ul1.includes(5), "земля 4 открыта, но у 7x8 bossDays пуст → земля 5 закрыта");
  const sv4 = await expSave(); sv4.facts["7x8"].bossDays = ["2026-10-02"];
  await imp(sv4);
  await playLevel("1-2", 9);
  t.ok((await expSave()).unlocked.includes(5), "bossDays есть у всех 15 карточек → земля 5 открыта");
  // земля деления: неподвижные башни, divDays
  console.log("-- земля деления на настоящем уровне");
  await imp({ unlocked: [1, 2, 3, 4, 5] });
  await ev(() => window.OBORONA.api.startLevel("5-1", { seed: 21 }));
  const d5l = await st();
  t.ok(d5l.level.land === 5 && d5l.level.layout === "L4" && JSON.stringify(d5l.level.fixed) === JSON.stringify({ B: 4, D: 7, F: 3 }) && d5l.towers.filter((x) => x.fixed).map((x) => x.pad + x.value).sort().join() === "B4,D7,F3", "уровень 5-1: раскладка L4, неподвижные башни B 4, D 7, F 3 стоят с начала");
  t.eq((await api("placeTower", "D", 5)).reason, "fixed", "неподвижную башню на реальном уровне нельзя сменить");
  const solve5 = await ev(() => window.OBORONA.state().wave.solution);
  t.ok(solve5 && solve5.beams.every((b) => ["B", "D", "F"].some((p) => b.includes(p))), "решение земли деления: каждый луч идёт от неподвижной башни");
  await playWaves(3);
  const dd = (await expSave()).facts;
  t.ok(Object.keys(dd).some((k) => dd[k].divDays && dd[k].divDays.length === 1 && dd[k].divDays[0] === "2026-10-10"), "победа лучом с неподвижной башней записывает divDays");

  // ================= T2-12 подсказка-путь =================
  console.log("-- T2-12 подсказка-путь и лампочка");
  await resetAll();
  const BOSSFX = () => ({ layout: "L1", hand: DIG, fixed: {}, track: true, waves: [{ enemies: [{ value: 35 }, { value: 56, kind: "boss", card: "7x8" }, { value: 21 }], gap: 3000, solution: { pads: { A: 5, B: 7, C: 3 }, beams: [["A", "B"], ["B", "C"]] } }] });
  await load(BOSSFX());
  const h1 = await st();
  t.ok(h1.hint && h1.hint.visible === true && h1.hint.link === "A-B" && h1.hint.text === "7 × 5" && h1.ribbon.every((r) => !r.lamp), "новый босс 7x8: подсказка видна сама — связь A-B, текст «7 × 5», лампочки нет");
  await ev(() => window.OBORONA.render());
  const hf = await st();
  t.ok(hf.frame.hint && hf.frame.hint.link === "A-B" && hf.frame.hint.text === "7 × 5", "подсказка нарисована: в frame.hint связь A-B и призрачная плашка «7 × 5»");
  const hpix = await ev(() => {
    const O = window.OBORONA, s = O.state(), v = s.view, cv = document.getElementById("field"), cx = cv.getContext("2d"), L = O.layouts.L1;
    // на дорожке между входом и связью A-B (t 0,1657): белый штрих рядом с осью
    let white = 0; for (let x = 20; x < 250; x += 2) { const d = cx.getImageData(Math.round((v.ox + x * v.s) * (cv.width / v.W)), Math.round((v.oy + 480 * v.s) * (cv.width / v.W)), 1, 1).data; if (d[0] > 240 && d[1] > 235 && d[2] > 225) white++; }
    return white;
  });
  t.ok(hpix > 8, "на оси дорожки от входа до точки пересечения A-B видны белые штрихи пунктира (" + hpix + " точек)");
  await setup({ A: 5, B: 7, C: 3 }, [["B", "A"], ["B", "C"]]);
  t.eq((await st()).frame.hint, null, "когда луч на этой связи построен, подсказка уходит с поля");
  await api("fight");
  await ev(() => window.OBORONA.api.stepUntilWaveEnd());
  const h2 = await expSave();
  t.ok(h2.facts["7x8"].bossSeen === 1 && h2.facts["7x8"].bossDays.length === 1 && h2.facts["7x8"].noHintDays.length === 0, "первая встреча: bossSeen 1, победа записана в bossDays; подсказка была видна, noHintDays пуст");
  await imp({ facts: { "7x8": { box: 3, due: "2026-10-20", bossSeen: 2 } } });
  await load(BOSSFX());
  const h3 = await st();
  t.ok(h3.hint && h3.hint.visible === false && h3.ribbon.filter((r) => r.lamp).length === 1 && h3.ribbon.find((r) => r.lamp).kind === "boss" && (await st()).frame.hint === null, "bossSeen 2: подсказка скрыта, на карточке босса в ленте лампочка (lamp: true)");
  t.ok(await ev(() => { const b = document.querySelector(".card.boss .lamp"); return !!b && b.getBoundingClientRect().width >= 48 && b.getBoundingClientRect().height >= 48; }), "лампочка в DOM: кнопка на карточке босса не меньше 48 px");
  await page.click(".card.boss .lamp");
  await ev(() => window.OBORONA.render());
  const h4 = await st();
  t.ok(h4.hint.visible && h4.frame.hint && h4.ribbon.every((r) => !r.lamp), "касание лампочки: подсказка видна до конца волны, лампочка гаснет");
  await setup({ A: 5, B: 7, C: 3 }, [["B", "A"], ["B", "C"]]);
  await api("fight"); await ev(() => window.OBORONA.api.stepUntilWaveEnd());
  t.eq((await expSave()).facts["7x8"].noHintDays, [], "победа с лампочкой не считается победой без подсказки");
  await load(BOSSFX());
  await setup({ A: 5, B: 7, C: 3 }, [["B", "A"], ["B", "C"]]);
  await api("fight"); await ev(() => window.OBORONA.api.stepUntilWaveEnd());
  t.eq((await expSave()).facts["7x8"].noHintDays, ["2026-10-10"], "победа без лампочки: сегодняшний день в noHintDays");
  await ev(() => window.OBORONA.api.setToday("2026-10-11"));
  await load(BOSSFX());
  t.ok((await st()).hint && (await st()).ribbon.some((r) => r.lamp), "в тот же день после победы без подсказки лампочка ещё есть, а на следующий день (1 запись) — тоже");
  await setup({ A: 5, B: 7, C: 3 }, [["B", "A"], ["B", "C"]]);
  await api("fight"); await ev(() => window.OBORONA.api.stepUntilWaveEnd());
  const h5 = (await expSave()).facts["7x8"];
  t.eq(h5.noHintDays, ["2026-10-10", "2026-10-11"], "победа без подсказки в два разных дня: noHintDays из двух дат");
  await load(BOSSFX());
  const h6 = await st();
  t.ok(h6.hint === null && h6.ribbon.every((r) => !r.lamp) && h6.frame.hint === null, "после двух дней подсказки нет совсем: hint null, лампочки нет");

  // ================= T2-13 итоги, «можно было ещё», ночь =================
  console.log("-- T2-13 итоги уровня и экран ночи");
  await resetAll();
  const W24 = mkWaves([24, 24], { pads: { A: 3, B: 8 }, beams: [["A", "B"]] });
  const r24 = await playLevel("1-1", 3, W24);
  t.ok(r24.ok && r24.alts.includes("24 можно было победить ещё лучом 4 × 6"), "24 побеждён лучом 3 × 8: в итогах «24 можно было победить ещё лучом 4 × 6»");
  const le2 = await ev(() => document.getElementById("scrLevelEnd").innerText.replace(/\s+/g, " "));
  t.ok(/24 можно было победить ещё лучом 4 × 6/.test(le2), "эта строка видна на экране итогов");
  t.ok(/Приём:/.test(le2) === false, "приём на итогах — только если на уровне были ошибки или неуверенные победы");
  const W24b = mkWaves([24], { pads: { A: 4, B: 6 }, beams: [["A", "B"]] });
  await api("levelEndNext");
  const r24b = await playLevel("1-2", 3, W24b);
  t.ok(r24b.alts.includes("24 можно было победить ещё лучом 3 × 8"), "тот же 24 лучом 4 × 6: «24 можно было победить ещё лучом 3 × 8»");
  // приём: после ошибки
  await api("levelEndNext");
  const WBAD = mkWaves([56], { pads: {}, beams: [] });
  const rb = await playLevel("1-3", 3, WBAD);
  t.ok(rb.tip && /^×8 — это удвоить трижды: 8 × 7: 7 → 14 → 28 → 56$/.test(rb.tip.text) && rb.stars === 2 && rb.hearts === 7, "враги дошли: на итогах «Приём:» для самой трудной карточки (7x8 → ×8 — удвоить трижды)");
  t.ok(/Приём:\s*×8/.test(await ev(() => document.getElementById("scrLevelEnd").innerText)), "приём виден на экране итогов");
  // три уровня за сессию — ночь
  const sess = await expSave();
  t.ok(sess.today.levels === 3 && sess.today.session === 3, "сыграно 3 уровня: today.levels 3, session 3");
  await api("levelEndNext");
  const nt = await ev(() => { const e = document.getElementById("scrNight"); return { screen: window.OBORONA.state().screen, txt: e.innerText.replace(/\s+/g, " "), more: !!e.querySelector("#nightMore"), map: !!e.querySelector("#nightMap"), btnH: Array.from(e.querySelectorAll("button")).map((b) => b.getBoundingClientRect().height) }; });
  t.ok(nt.screen === "night" && /Крепость закрывается на ночь/.test(nt.txt) && /Освоено сегодня:/.test(nt.txt) && /Завтра вернутся:/.test(nt.txt) && /Можно было ещё:/.test(nt.txt) && /Приём:/.test(nt.txt), "после трёх уровней экран night: «Крепость закрывается на ночь», «Освоено сегодня:», «Завтра вернутся:», «Можно было ещё:», «Приём:»");
  t.ok(/Пример становится освоенным, когда побеждаешь его в два разных дня/.test(nt.txt), "если за день ничего не освоено — подсказка «Пример становится освоенным, когда побеждаешь его в два разных дня»");
  t.ok(nt.more && nt.map && /Ещё один уровень/.test(nt.txt) && !/Крепость отдыхает до завтра/.test(nt.txt) && nt.btnH.every((h) => h >= 64), "до лимита (3 из 5) есть крупная кнопка «Ещё один уровень» и «На карту»; надписи про отдых нет");
  t.ok(/7 × 8/.test(nt.txt) && /24 можно было победить ещё лучом (3 × 8|4 × 6)/.test(nt.txt), "в «Завтра вернутся» — трудный пример 7 × 8, в «Можно было ещё» — строки за весь день");
  t.eq((await expSave()).today.session, 0, "после показа ночи session = 0");
  const nm = await api("nightMore");
  const sn = await st();
  t.ok(nm.ok && sn.screen === "level" && sn.level.id === "1-4", "«Ещё один уровень» открывает следующий после сыгранного уровень 1-4 и экран level (" + sn.level.id + ")");

  // ================= Лимит уровней в день =================
  console.log("-- лимит уровней в день");
  await resetAll();
  await ev(() => window.OBORONA.api.setSetting("perDay", 2));
  await playLevel("1-1", 5); await api("levelEndNext");
  t.eq((await st()).screen, "map", "первый уровень при лимите 2: после «Дальше» карта");
  await playLevel("1-2", 5);
  await api("levelEndNext");
  const lim = await ev(() => { const e = document.getElementById("scrNight"); return { screen: window.OBORONA.state().screen, txt: e.innerText.replace(/\s+/g, " "), more: !!e.querySelector("#nightMore"), vis: getComputedStyle(e.querySelector(".resttext")).visibility, font: parseFloat(getComputedStyle(e.querySelector(".resttext")).fontSize) }; });
  t.ok(lim.screen === "night" && /Крепость отдыхает до завтра/.test(lim.txt) && !lim.more && lim.vis === "visible" && lim.font >= 28, "лимит 2 из 2: на экране night крупная надпись «Крепость отдыхает до завтра», кнопки «Ещё один уровень» нет");
  t.eq((await api("nightMore")).reason, "limit", "nightMore после лимита — «limit»");
  await api("toMap");
  const lm = await ev(() => ({ txt: document.getElementById("mapRest") && document.getElementById("mapRest").innerText, enabled: Array.from(document.querySelectorAll(".lvl")).filter((b) => !b.disabled).length, vis: document.getElementById("mapRest") && getComputedStyle(document.getElementById("mapRest")).visibility }));
  t.ok(lm.txt === "Крепость отдыхает до завтра" && lm.enabled === 0 && lm.vis === "visible", "на карте та же надпись «Крепость отдыхает до завтра» и все кнопки уровней неактивны");
  t.eq((await api("startLevel", "1-2")).reason, "limit", "startLevel после лимита — «limit»");
  await page.reload(); await page.waitForFunction(() => window.OBORONA && window.OBORONA.ready); await injectT();
  await ev(() => window.OBORONA.api.manual(true));
  t.ok(await ev(() => { const s = window.OBORONA.state(); return s.screen === "map" && s.rest && /Крепость отдыхает до завтра/.test(document.getElementById("scrMap").innerText); }), "после перезагрузки страницы надпись «Крепость отдыхает до завтра» на месте");
  await ev(() => window.OBORONA.api.setToday("2026-10-11"));
  t.ok(await ev(() => { const s = window.OBORONA.state(); return !s.rest && !/Крепость отдыхает/.test(document.getElementById("scrMap").innerText) && window.OBORONA.api.startLevel("1-2", { seed: 1 }).ok; }), "на следующий день надписи нет, уровень запускается");

  // ================= T2-14 экран взрослого =================
  console.log("-- T2-14 экран взрослого");
  await resetAll();
  await imp({
    facts: { "7x8": { box: 3, due: "2026-10-13", seen: 7, good: 4, ok: 1, fail: 2, msSum: 38400, msN: 6, bossSeen: 2, bossDays: ["2026-10-09"] }, "6x8": { box: 1, due: "2026-10-10", seen: 4, good: 0, ok: 1, fail: 3 }, "2x2": { box: 5, due: "2026-11-01", seen: 2, good: 2 } },
    confusions: { "48|56": { n: 3, last: "2026-10-09" }, "42|48": { n: 1, last: "2026-10-09" } }
  });
  await api("toMap");
  const bb = await ev(() => { const r = document.getElementById("adultBtn").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height }; });
  t.ok(bb.h >= 48, "кнопка «Для взрослых» не меньше 48 px");
  await page.mouse.move(bb.x, bb.y); await page.mouse.down();
  await page.waitForTimeout(1000);
  const ring1 = await ev(() => parseFloat(getComputedStyle(document.querySelector("#adultBtn .hring rect")).strokeDashoffset));
  await page.mouse.up();
  const ring2 = await ev(() => parseFloat(getComputedStyle(document.querySelector("#adultBtn .hring rect")).strokeDashoffset));
  t.ok((await st()).screen === "map" && ring1 > 20 && ring1 < 80 && ring2 === 100, "удержание 1 с и отпускание: экран остался map, кольцо заполнялось (" + Math.round(ring1) + ") и сбросилось");
  await page.mouse.move(bb.x, bb.y); await page.mouse.down();
  await page.waitForTimeout(2200);
  await page.mouse.up();
  t.eq((await st()).screen, "adult", "удержание больше 2 с открывает экран взрослого");
  const ad = await ev(() => {
    const e = document.getElementById("scrAdult"), cell = e.querySelector('.gc[data-a="7"][data-b="8"]'), cell2 = e.querySelector('.gc[data-a="3"][data-b="4"]');
    return { n: e.querySelectorAll(".gc").length, txt: e.innerText.replace(/\s+/g, " "), c78: getComputedStyle(cell).backgroundColor, c34: getComputedStyle(cell2).backgroundColor, ch: cell.getBoundingClientRect().height, cw: cell.getBoundingClientRect().width, hd: Array.from(e.querySelectorAll(".agrid .ah")).map((x) => x.textContent).join("") };
  });
  t.ok(ad.n === 64 && ad.ch >= 48 && ad.cw >= 48, "в сетке 64 клетки (2–9 × 2–9), клетки от 48 px");
  t.eq(ad.hd.slice(0, 8) + "|" + ad.hd.slice(8), "23456789|23456789", "заголовки столбцов и строк 2–9");
  t.ok(ad.c78 === "rgb(255, 210, 74)" && ad.c34 === "rgb(42, 77, 93)", "цвет клетки — коробка Лейтнера: 7 × 8 (коробка 3) жёлтая, 3 × 4 (не было) тёмная");
  ["Карта таблицы", "Не было", "Самые трудные", "Частые путаницы", "Сегодня", "Сыграно уровней: 0 из 5", "Скорость врагов", "Медленно", "Обычно", "Быстрее", "Уровней в день", "Звук", "Крупный шрифт", "Сбросить прогресс", "Закрыть"].forEach((w) => t.ok(ad.txt.includes(w), "экран взрослого: «" + w + "»"));
  t.ok(ad.txt.includes("6 × 8 = 48 — коробка 1, ошибок 3") && ad.txt.includes("56 ↔ 48 — 3 раза"), "«Самые трудные»: «6 × 8 = 48 — коробка 1, ошибок 3»; «Частые путаницы»: «56 ↔ 48 — 3 раза»");
  await page.click('.gc[data-a="7"][data-b="8"]');
  t.eq(await ev(() => document.getElementById("adInfo").innerText), "7 × 8 = 56 · коробка 3 · верно 5 из 7 (71 %) · луч в среднем 6,4 с · босс побеждён в 1 день", "касание клетки 7 × 8: коробка, точность, среднее время луча, босс");
  await page.click('.gc[data-a="3"][data-b="4"]');
  t.eq(await ev(() => document.getElementById("adInfo").innerText), "3 × 4 = 12 · ещё не встречался", "клетка без карточки: «ещё не встречался»");
  // настройки
  await page.click('[data-act="speed"][data-v="slow"]');
  t.eq((await expSave()).settings.speed, "slow", "«Медленно» сохраняется сразу");
  await page.click('[data-act="perDay"][data-v="1"]'); await page.click('[data-act="perDay"][data-v="1"]');
  t.eq((await expSave()).settings.perDay, 7, "кнопка «+» увеличивает число уровней в день (5 → 7)");
  for (let i = 0; i < 12; i++) await page.click('[data-act="perDay"][data-v="-1"]');
  t.eq((await expSave()).settings.perDay, 1, "кнопка «−» не опускает ниже 1");
  for (let i = 0; i < 12; i++) await page.click('[data-act="perDay"][data-v="1"]');
  t.eq((await expSave()).settings.perDay, 10, "и не поднимает выше 10");
  await page.click('[data-act="perDay"][data-v="-1"]'); await page.click('[data-act="perDay"][data-v="-1"]'); await page.click('[data-act="perDay"][data-v="-1"]'); await page.click('[data-act="perDay"][data-v="-1"]'); await page.click('[data-act="perDay"][data-v="-1"]');
  t.eq((await expSave()).settings.perDay, 5, "перед уровнем вернули 5");
  await page.click('[data-act="sound"][data-v="false"]');
  t.eq((await expSave()).settings.sound, false, "звук выключен и сохранён");
  await page.click('[data-act="bigFont"][data-v="true"]');
  t.ok((await expSave()).settings.bigFont === true && (await ev(() => document.body.classList.contains("big"))), "«Крупный шрифт» включён: класс на странице и в сохранении");
  await page.click('[data-act="bigFont"][data-v="false"]');
  t.ok(await ev(() => !document.body.classList.contains("big") && !window.OBORONA.state().save.settings.bigFont), "«Крупный шрифт» выключается");
  // сброс: двойное подтверждение
  await page.click('[data-act="reset1"]');
  const rs = await ev(() => ({ txt: document.getElementById("scrAdult").innerText.replace(/\s+/g, " "), facts: Object.keys(window.OBORONA.state().save.facts).length }));
  t.ok(/Точно сбросить\? Это нельзя отменить/.test(rs.txt) && /Да, сбросить/.test(rs.txt) && rs.facts === 3, "«Сбросить прогресс»: первое касание только спрашивает «Точно сбросить? Это нельзя отменить», прогресс цел");
  await page.click('[data-act="reset0"]');
  t.ok(await ev(() => !/Точно сбросить/.test(document.getElementById("scrAdult").innerText)) && Object.keys((await expSave()).facts).length === 3, "«Отмена» прячет вопрос, прогресс цел");
  await page.click('[data-act="reset1"]'); await page.click('[data-act="reset2"]');
  const rs2 = await expSave();
  t.ok(Object.keys(rs2.facts).length === 0 && rs2.unlocked.length === 1 && rs2.settings.speed === "slow" && rs2.settings.sound === false && (await st()).screen === "map", "«Да, сбросить»: прогресс обнулён, настройки сохранены (скорость «Медленно», звук выкл.), открыта карта");
  await ev(() => window.OBORONA.api.setSetting("sound", true));
  // скорость в новом уровне
  await ev(() => window.OBORONA.api.openAdult());
  t.eq((await st()).screen, "adult", "api.openAdult() открывает экран без удержания");
  await page.click('[data-act="close"]');
  t.eq((await st()).screen, "map", "«Закрыть» — на карту");
  await ev(() => { const a = window.OBORONA.api; a.startLevel("1-1", { seed: 8 }); a.fight(); a.spawn(56); });
  const slow = (await api("step", 1000).then(st)).enemies[0];
  t.ok(Math.abs(slow.t - 35 / 1509.0725) < 1e-4, "скорость «Медленно» действует в новом уровне: за 1 с враг проходит 35 ед. (t = " + slow.t.toFixed(5) + ")");
  await ev(() => window.OBORONA.api.setSetting("speed", "normal"));

  // ================= T2-15 дублирование в db =================
  console.log("-- T2-15 db");
  const dbctx = await t.context.browser().newContext({ viewport: { width: 1024, height: 768 }, locale: "ru-RU" });
  const dbp = await dbctx.newPage();
  const dbperr = []; dbp.on("pageerror", (e) => dbperr.push(e.message));
  await dbp.addInitScript(() => {
    window.__sets = [];
    window.claude = { use: (n) => (n === "db" ? Promise.resolve({ doc: (path) => ({ set: (d) => { window.__sets.push({ path, v: d.v, facts: Object.keys(d.facts).length, at: d.updatedAt }); return Promise.resolve(); }, onSnapshot: (cb) => { window.__snap = cb; } }) }) : Promise.resolve(null)) };
  });
  await dbp.goto("file://" + t.file);
  await dbp.waitForFunction(() => window.OBORONA && window.OBORONA.ready);
  await dbp.evaluate(() => { const a = window.OBORONA.api; a.manual(true); a.setToday("2026-10-10"); a.startLevel("1-1", { seed: 2 }); for (let i = 0; i < 3; i++) { a.applySolution(); a.fight(); a.stepUntilWaveEnd(); } });
  await dbp.waitForTimeout(1300);
  const sets = await dbp.evaluate(() => window.__sets);
  t.ok(sets.length >= 1 && sets.every((x) => x.path === "oborona/save" && x.v === 1) && sets[sets.length - 1].facts > 0, "после уровня фейковая db получила set документа oborona/save с v: 1 и фактами (" + sets.length + " записей, склеены задержкой 700 мс)");
  const merged = await dbp.evaluate(() => {
    const O = window.OBORONA, before = O.api.exportSave().updatedAt;
    window.__snap({ exists: true, data: () => ({ v: 1, updatedAt: 5, facts: { "9x9": { box: 5, due: "2026-11-01" } } }) });
    const stale = !!O.api.exportSave().facts["9x9"];
    window.__snap({ exists: true, data: () => ({ v: 1, updatedAt: Date.now() + 100000, facts: { "9x9": { box: 4, due: "2026-11-01" } }, settings: { perDay: 7 } }) });
    return { stale, fresh: O.api.exportSave().facts["9x9"], pd: O.api.exportSave().settings.perDay, before };
  });
  t.ok(merged.stale === false && merged.fresh && merged.fresh.box === 4 && merged.pd === 7, "снимок db со старым updatedAt игнорируется, со свежим — применяется (выигрывает больший updatedAt)");
  t.eq(dbperr, [], "в странице с db нет ошибок");
  await dbctx.close();
  // без window.claude всё работает из localStorage (основная страница), ключ сохранения есть
  t.ok(await ev(() => !!localStorage.getItem("oborona-save") && JSON.parse(localStorage.getItem("oborona-save")).v === 1), "без window.claude сохранение лежит в localStorage[«oborona-save»] (v 1)");

  // ================= T2-16 миграция, типы, битая строка =================
  console.log("-- T2-16 миграция");
  const reloadPage = async () => { await page.reload(); await page.waitForFunction(() => window.OBORONA && window.OBORONA.ready); await injectT(); await ev(() => window.OBORONA.api.manual(true)); };
  await ev(() => { localStorage.setItem("oborona-save", JSON.stringify({ facts: { "7x8": { box: 3, due: "2026-10-13" } } })); localStorage.removeItem("oborona-save-bad"); });
  await reloadPage();
  const mg = await expSave();
  t.ok(mg.v === 1 && mg.settings.perDay === 5 && mg.settings.speed === "normal" && mg.facts["7x8"].box === 3 && mg.facts["7x8"].due === "2026-10-13" && mg.facts["7x8"].seen === 0 && Array.isArray(mg.facts["7x8"].bossDays) && JSON.stringify(mg.unlocked) === "[1]", "сохранение без v и без settings: после загрузки v 1, settings.perDay 5, факт на месте и дополнен полями");
  await ev(() => { localStorage.setItem("oborona-save", JSON.stringify({ v: 1, facts: { "7x8": { box: "много", due: 5, seen: null, bossDays: "нет" }, "кривой": 1, "3x4": null }, settings: { perDay: "a", speed: "turbo", sound: "yes", bigFont: 1 }, unlocked: null, levels: [], profile: null, today: 3, seenRewards: "x7", history: {} })); });
  await reloadPage();
  const ty = await expSave();
  t.ok(ty.facts["7x8"].box === 1 && /^\d{4}-\d{2}-\d{2}$/.test(ty.facts["7x8"].due) && ty.facts["7x8"].seen === 0 && Array.isArray(ty.facts["7x8"].bossDays) && !ty.facts["кривой"] && Object.keys(ty.facts).length === 2 && ty.facts["3x4"].box === 1, "проверка типов: box строкой, due числом, seen null, лишний ключ, null вместо карточки — умолчания");
  t.ok(ty.settings.perDay === 5 && ty.settings.speed === "normal" && ty.settings.sound === true && ty.settings.bigFont === false && JSON.stringify(ty.unlocked) === "[1]" && JSON.stringify(ty.levels) === "{}" && ty.profile.heavyStreak === 0 && ty.today.levels === 0 && JSON.stringify(ty.seenRewards) === "[]" && JSON.stringify(ty.history) === "[]", "неверные типы в settings, unlocked, levels, profile, today, seenRewards, history → умолчания");
  await ev(() => { localStorage.setItem("oborona-save", "{не json"); localStorage.removeItem("oborona-save-bad"); });
  await reloadPage();
  const bad = await ev(() => ({ bad: localStorage.getItem("oborona-save-bad"), save: window.OBORONA.api.exportSave() }));
  t.ok(bad.bad === "{не json" && Object.keys(bad.save.facts).length === 0 && bad.save.v === 1, "битая строка сохранения: игра стартует с умолчаний, а сама строка лежит в «oborona-save-bad»");
  await ev(() => { localStorage.setItem("oborona-save", JSON.stringify({ v: 7, newField: 1, facts: { "2x2": { box: 4, due: "2026-10-30" } }, unlocked: [1, 3, 9] })); });
  await reloadPage();
  const fut = await expSave();
  t.ok(fut.v === 7 && fut.facts["2x2"].box === 4 && JSON.stringify(fut.unlocked) === "[1,3]", "более новая версия схемы читается как есть (v 7), недостающее дополняется, лишние земли отбрасываются");
  await ev(() => { localStorage.setItem("oborona-save", "[1,2]"); });
  await reloadPage();
  t.ok(await ev(() => localStorage.getItem("oborona-save-bad") === "[1,2]"), "JSON, но не объект — тоже откладывается в «oborona-save-bad»");
  await resetAll();

  // ================= T2-17 награды =================
  console.log("-- T2-17 награды");
  const x7f = {}; ["2x7", "3x7", "4x7", "5x7", "6x7", "7x7", "7x8", "7x9"].forEach((k) => { x7f[k] = { box: 3, due: "2026-10-30" }; });
  await imp({ facts: x7f });
  t.ok((await ev(() => window.OBORONA.logic.rewardsEarned(window.OBORONA.api.exportSave().facts))).includes("x7"), "rewardsEarned(facts) содержит «x7» — все карточки с 7 в коробке 3");
  const rw1 = await playLevel("1-1", 3, W24);
  t.ok(rw1.newRewards.join() === "x7" && /Новая башня: башня-маяк/.test(await ev(() => document.getElementById("scrLevelEnd").innerText)), "на итогах строка «Новая башня: башня-маяк»");
  t.eq((await expSave()).seenRewards, ["x7"], "награда записана в seenRewards");
  await api("levelEndNext");
  t.ok(await ev(() => document.querySelectorAll(".rw.on").length === 1 && document.querySelector(".rw.on b").textContent === "Башня-маяк"), "на карте награда «Башня-маяк» цветная, остальные 11 — силуэты");
  const rw2 = await playLevel("1-2", 3, W24b);
  t.eq(rw2.newRewards, [], "второй раз та же награда не объявляется");
  await load({ layout: "L1", hand: DIG, fixed: {}, hold: true, waves: [{ enemies: [] }] });
  await setup({ A: 7, B: 5 }, []);
  await page.waitForTimeout(800);
  await ev(() => window.OBORONA.render());
  const lamp = await ev(() => {
    const O = window.OBORONA, s = O.state(), v = s.view, cv = document.getElementById("field"), cx = cv.getContext("2d"), P = O.layouts.L1.padById;
    const px = (x, y) => Array.from(cx.getImageData(Math.round((v.ox + x * v.s) * (cv.width / v.W)), Math.round((v.oy + y * v.s) * (cv.width / v.W)), 1, 1).data);
    return { seven: px(P.A.x, P.A.y - 36), five: px(P.B.x, P.B.y - 36) };
  });
  t.ok(lamp.seven[0] > 240 && lamp.seven[1] > 190 && lamp.seven[2] < 120 && !(lamp.five[0] > 240 && lamp.five[1] > 190 && lamp.five[2] < 120), "башня 7 нарисована маяком (жёлтая лампа над основанием), башня 5 — обычная");

  // ================= П7 за 15 минут ни одного вопроса (настоящие уровни) =================
  console.log("-- П7 15 минут игры без вопросов");
  await resetAll();
  await ev(() => window.OBORONA.api.setSetting("perDay", 10));
  const p7 = await ev(() => {
    const O = window.OBORONA, a = O.api, out = { ms: 0, levels: 0, waves: 0, badText: [], badScreens: [], forms: 0, q: 0, seen: [] };
    const pats = [/^\d+, а луч даёт \d+$/, /^\d+ − \d+ = \d+$/, /^\d+( = \d+ × \d+)?$/, /^Останется \d+ — такого луча нет$/, /^Сначала поставь башню$/, /^У башни уже два луча$/];
    const order = ["1-1", "1-2", "1-3", "1-4"];
    const scan = () => {
      out.forms += document.querySelectorAll("input, textarea, select, [contenteditable]").length;
      out.q += document.body.innerText.split("\\n").filter((l) => /\\?\\s*$/.test(l)).length;
    };
    while (out.ms < 900000 && out.levels < 12) {
      const id = order[out.levels % 4], r = a.startLevel(id, { seed: 100 + out.levels });
      if (!r.ok) { out.badScreens.push("startLevel " + id + " " + r.reason); break; }
      for (let w = 0; w < 3; w++) {
        a.applySolution(); a.fight();
        const rr = a.stepUntilWaveEnd(); out.ms += rr.ms; out.waves++;
        scan();
        const s = O.state();
        s.screensSeen.forEach((x) => { if (!["map", "level", "levelEnd", "night"].includes(x)) out.badScreens.push(x); });
        s.textLog.forEach((x) => { if (!pats.some((p) => p.test(x))) out.badText.push(x); });
      }
      scan();
      a.levelEndNext(); scan();
      if (O.state().screen === "night") { scan(); a.nightMore(); }
      out.levels++;
    }
    out.seen = O.state().screensSeen;
    return out;
  });
  t.ok(p7.ms >= 900000 && p7.waves >= 15, "сыграно 15 минут боевого времени (" + Math.round(p7.ms / 60000) + " мин, " + p7.levels + " уровней, " + p7.waves + " волн)");
  t.eq(p7.badText.slice(0, 3), [], "каждый текст на поле — один из шаблонов («56, а луч даёт 42», «56 − 35 = 21», «Останется 2 — такого луча нет», «56 = 7 × 8», отказы)");
  t.ok(p7.forms === 0 && p7.q === 0 && p7.badScreens.length === 0, "на всех экранах нет полей ввода, списков выбора и видимых текстов, оканчивающихся на «?»; экраны только из {map, level, levelEnd, night} (" + p7.seen.join(", ") + ")");

  // ================= П8 перезагрузка и лимит =================
  console.log("-- П8 прогресс переживает перезагрузку");
  await resetAll();
  await ev(() => window.OBORONA.api.setSetting("speed", "fast"));
  await playLevel("1-1", 31);
  await api("levelEndNext");
  const p8before = await expSave();
  await reloadPage();
  const p8after = await expSave();
  t.ok(JSON.stringify(p8before.facts) === JSON.stringify(p8after.facts) && JSON.stringify(p8before.levels) === JSON.stringify(p8after.levels) && JSON.stringify(p8before.today) === JSON.stringify(p8after.today) && JSON.stringify(p8before.unlocked) === JSON.stringify(p8after.unlocked) && JSON.stringify(p8before.settings) === JSON.stringify(p8after.settings), "после page.reload() факты, уровни, today, unlocked и настройки совпадают с тем, что было");
  t.ok(Object.keys(p8after.facts).length > 0 && p8after.levels["1-1"].stars === 3 && p8after.settings.speed === "fast", "прогресс на месте: факты есть, уровень 1-1 на 3 звезды, скорость «Быстрее»");
  t.ok(await ev(() => { const e = document.querySelector('.lvl[data-id="1-1"]'); return window.OBORONA.state().screen === "map" && e.classList.contains("done") && !document.querySelector('.lvl[data-id="1-2"]').disabled; }), "после перезагрузки на карте 1-1 пройден, 1-2 открыт");
  await ev(() => window.OBORONA.api.setSetting("speed", "normal"));
  // лимит через новую страницу с подменой даты (addInitScript, как в разделе 16)
  await ev(() => window.OBORONA.api.setSetting("perDay", 2));
  await playLevel("1-2", 32); await api("levelEndNext");
  const p8 = await ev(() => ({ screen: window.OBORONA.state().screen, rest: /Крепость отдыхает до завтра/.test(document.getElementById("scrMap").innerText) || /Крепость отдыхает до завтра/.test(document.getElementById("scrNight").innerText) }));
  t.ok(p8.screen === "night" && p8.rest, "лимит 2: после второго уровня экран night с «Крепость отдыхает до завтра»");
  const np = await t.context.newPage();
  await np.addInitScript(() => { window.OBORONA_TODAY = "2026-10-11"; });
  await np.goto("file://" + t.file);
  await np.waitForFunction(() => window.OBORONA && window.OBORONA.ready);
  const nxt = await np.evaluate(() => { const O = window.OBORONA; O.api.manual(true); return { rest: /Крепость отдыхает/.test(document.getElementById("scrMap").innerText), start: O.api.startLevel("1-2", { seed: 3 }).ok, today: O.state().today, levels: O.api.exportSave().today }; });
  t.ok(!nxt.rest && nxt.start && nxt.today === "2026-10-11", "новая страница с датой 2026-10-11: надписи нет, startLevel принимается (лимит новых суток)");
  await np.close();
  await ev(() => window.OBORONA.api.setToday("2026-10-10"));

  // ================= Прочее: ночь после 3 уровней без лимита, сессии =================
  console.log("-- сессии");
  await resetAll();
  const ses = await ev(() => {
    const O = window.OBORONA, a = O.api, out = [];
    ["1-1", "1-2", "1-3"].forEach((id) => { a.startLevel(id, { seed: 5 }); for (let i = 0; i < 3; i++) { a.applySolution(); a.fight(); a.stepUntilWaveEnd(); } a.levelEndNext(); out.push(O.state().screen); });
    return out;
  });
  t.eq(ses, ["map", "map", "night"], "два уровня подряд — на карту, после третьего — ночь");
  await ev(() => window.OBORONA.api.setToday("2026-10-11"));
  const ds = await expSave();
  t.ok(ds.today.levels === 0 && ds.today.session === 0 && ds.today.date === "2026-10-11", "на следующий день счётчики уровней и сессии обнуляются");
  const nt2 = await ev(() => { window.OBORONA.api.toMap(); return window.OBORONA.state().rest; });
  t.eq(nt2, false, "и надпись об отдыхе пропадает");
  await ev(() => window.OBORONA.api.setToday("2026-10-10"));

  await page.setViewportSize({ width: 1024, height: 768 });
  const fin = await ev(() => window.OBORONA.version);
  t.eq(fin, "1.0.0", "версия 1.0.0");
});
