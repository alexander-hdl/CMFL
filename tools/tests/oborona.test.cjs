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
  const scr = await ev(() => ({ btns: Array.from(document.querySelectorAll("button")).filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== "hidden").map((b) => b.id || (b.classList.contains("tile") ? "tile" : b.className)), ids: Array.from(document.querySelectorAll("[id]")).map((e) => e.id) }));
  t.ok(scr.btns.every((b) => ["soundBtn", "pauseBtn", "fightBtn", "retryBtn", "tile"].includes(b)) && !scr.ids.some((i) => /map|night|adult|quiz|question/i.test(i)), "в DOM только поле, полосы и кнопки уровня: экранов карты, ночи, взрослого и викторины нет (видимые кнопки: " + Array.from(new Set(scr.btns)).join(", ") + ")");
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
  await api("reset");
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
  await api("reset"); await api("applySolution"); await api("fight");
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
  await ev(() => window.OBORONA.api.reset());
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
  await ev(() => window.OBORONA.api.reset());
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
  await api("reset"); await api("applySolution"); await api("fight");
  await ev(() => window.OBORONA.api.stepUntilWaveEnd());
  await ev(() => window.OBORONA.render());
  const win = await st();
  t.ok(win.frame.banner && win.frame.banner.text === "Волна отбита!" && win.frame.banner.stars === 3 && win.frame.banner.flags && win.sounds.includes("fanfare") && win.frame.banner.w >= 360, "победная волна: крупная плашка «Волна отбита!» с тремя звёздами, флажки на крепости, фанфара");
  const bn = win.frame.banner;
  t.ok(Math.abs(bn.x - 800) < 420 && Math.abs(bn.y - 450) < 300, "плашка ближе к центру поля, чем к краю (" + Math.round(bn.x) + ", " + Math.round(bn.y) + ")");
  // вход: холм и дорожка доходят до края окна, крепость и крыша внутри поля
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  await api("reset");
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
  await api("reset"); await api("applySolution"); await api("fight");
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
    await api("reset");
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
  await page.setViewportSize({ width: 1024, height: 768 });
  const fin = await ev(() => window.OBORONA.version);
  t.eq(fin, "0.1.0", "версия 0.1.0");
});
