// Ревью этапа 1: проверки, добавленные ревьюером, и скриншоты 1024×600 и 1920×1080 (флаг --shot).
// Как и 01-prototip.mjs, общаются с игрой только через window.OT и DOM-id.

const SETUP = () => { OT.manual(true); OT.seed(1); OT.newGame(); OT.loadLevel(1, 0); };
const run = (page, fn, arg) => page.evaluate(fn, arg);

export function register({ test, assert, eq }) {

  test("Ревью: надпись над врагом не прячется под подписью луча", async ({ page }) => {
    // Прямой луч: подпись стоит над дорогой, враг проходит прямо под ней.
    for (const [a, b] of [["A0", "B0"], ["A1", "B0"]]) {
      await run(page, SETUP);
      await run(page, ({ a, b }) => { OT.setWave([56, 56], { armored: [] }); OT.placeTower(a, 6); OT.placeTower(b, 7); OT.link(a, b); OT.startWave(); }, { a, b });
      const bad = await run(page, () => {
        const out = [], overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        for (let i = 0; i < 1800; i++) {
          OT.step(1 / 60);
          const dr = OT.drawn();
          for (const n of dr.notes) for (const l of dr.labels) if (overlap(n, l)) out.push({ t: i, note: n.text, nr: [n.x, n.y, n.w, n.h].map(Math.round), lr: [l.x, l.y, l.w, l.h].map(Math.round) });
          if (OT.state().phase !== "battle") break;
        }
        return out.slice(0, 3).concat(out.length ? [{ total: out.length }] : []);
      });
      eq(bad, [], `${a}-${b}: надпись над врагом налезает на подпись луча`);
      const seen = await run(page, () => OT.events().filter((e) => e.type === "enemy_passed_beam").length);
      assert(seen === 2, "оба врага должны пройти сквозь луч, прошло " + seen);
    }
  });

  test("Ревью: надпись босса «56 − 35 = 21» не прячется под подписью луча", async ({ page }) => {
    await run(page, SETUP);
    await run(page, () => { OT.setWave([56], { armored: [56] }); OT.placeTower("A0", 7); OT.placeTower("B0", 5); OT.link("A0", "B0"); OT.placeTower("A1", 4); OT.placeTower("B1", 9); OT.link("A1", "B1"); OT.startWave(); });
    const bad = await run(page, () => {
      const out = [], overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      for (let i = 0; i < 2400 && OT.state().phase === "battle"; i++) {
        OT.step(1 / 60);
        const dr = OT.drawn();
        for (const n of dr.notes) for (const l of dr.labels) if (overlap(n, l)) out.push({ t: i, note: n.text });
      }
      return out.length;
    });
    eq(bad, 0, "кадров, где надпись босса под подписью луча");
  });

  test("Ревью: после конца волны побеждённый враг и звёздочки не застывают", async ({ page }) => {
    await run(page, () => { OT.seed(1); OT.newGame(); OT.loadLevel(1, 0); OT.setWave([24]); OT.placeTower("A0", 4); OT.placeTower("B0", 6); OT.link("A0", "B0"); OT.manual(true); OT.startWave(); });
    await run(page, () => OT.runWave());
    eq(await run(page, () => OT.state().phase), "levelEnd");
    await run(page, () => OT.manual(false));             // дальше идёт настоящий цикл rAF, как у игрока
    await page.waitForTimeout(1200);
    const st = await run(page, () => ({ notes: OT.drawn().notes.length, fx: OT.state().fx, alive: OT.state().enemies.filter((e) => e.alive).length, enemyDrawn: OT.state().enemies.map((e) => e.outcome) }));
    eq(st.alive, 0);
    // fx и deadT в state не выведены: смотрим, что Render больше не рисует врага (пиксель на месте гибели — дорога, а не щит).
    const px = await run(page, () => {
      const cv = document.getElementById("field"), k = cv.width / 1600, c = cv.getContext("2d");
      const d = c.getImageData(Math.round(426 * k), Math.round(464 * k), 1, 1).data;   // центр щита врага у луча A0–B0
      return [d[0], d[1], d[2]];
    });
    // Щит белый (255,255,255); дорога песочная (#ecd29b ≈ 236,210,155).
    assert(!(px[0] > 245 && px[1] > 245 && px[2] > 245), "на месте гибели всё ещё нарисован щит врага: " + px.join(","));
  });

  test("Ревью: сердца не ниже 0, уровень доигрывается, state сериализуем", async ({ page }) => {
    await run(page, SETUP);
    const r = await run(page, () => {
      OT.setWave([12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]);
      OT.placeTower("A0", 3); OT.placeTower("B0", 5); OT.link("A0", "B0");
      OT.startWave();
      const st = OT.runWave();
      const s = JSON.stringify(st);
      return { same: JSON.stringify(JSON.parse(s)) === s, hearts: st.hearts, phase: st.phase, castle: OT.events().filter((e) => e.type === "enemy_reached_castle").map((e) => e.hearts) };
    });
    assert(r.same, "state() не сериализуется без потерь");
    eq(r.phase, "levelEnd");
    eq(r.hearts, 0, "12 врагов дошли до крепости: сердца не ниже 0");
    eq(r.castle, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0], "сердца по событиям");
  });

  test("Ревью: каждый луч срабатывает один раз на врага, враги выходят по одному", async ({ page }) => {
    await run(page, SETUP);
    const r = await run(page, () => {
      OT.setWave([56, 42, 56, 42, 56, 42, 56, 42]);
      // два луча-промаха и диагональ, которая пересекает дорогу рядом с прямым
      OT.placeTower("A0", 2); OT.placeTower("B0", 3); OT.link("A0", "B0");          // 6
      OT.placeTower("A1", 4); OT.link("A1", "B0");                                   // 12
      OT.placeTower("B1", 5); OT.link("A1", "B1");                                   // 20
      OT.startWave();
      const ds = [];
      for (let i = 0; i < 6000 && OT.state().phase === "battle"; i++) {
        OT.step(1 / 60);
        const en = OT.state().enemies.filter((e) => e.alive).map((e) => e.d).sort((a, b) => a - b);
        for (let j = 1; j < en.length; j++) ds.push(en[j] - en[j - 1]);
      }
      const ev = OT.events();
      const passes = {};
      for (const e of ev.filter((e) => e.type === "enemy_passed_beam")) { const k = e.id + ":" + e.product; passes[k] = (passes[k] || 0) + 1; }
      return { maxRepeat: Math.max(...Object.values(passes)), kinds: Object.keys(passes).length, spawns: ev.filter((e) => e.type === "enemy_spawn").length, minGap: Math.min(...ds) };
    });
    eq(r.maxRepeat, 1, "один луч сработал на врага больше одного раза");
    eq(r.kinds, 24, "8 врагов × 3 луча");
    eq(r.spawns, 8);
    assert(r.minGap > 140, "враги появились друг на друге: минимальный разрыв " + r.minGap);
  });

  test("Ревью: касание пальцем (touch): пауза кнопкой, стройка на паузе тапами и перетаскиванием", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
    const at = (x, y) => run(page, ({ x, y }) => OT.toScreen(x, y), { x, y });
    const tap = async (p) => { await touch("touchStart", p.x, p.y); await touch("touchEnd"); };
    const center = async (sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const types = [];
    await page.exposeFunction("__ptype", (t) => types.push(t));
    await run(page, () => window.addEventListener("pointerdown", (e) => window.__ptype(e.pointerType), true));
    await run(page, SETUP);
    await run(page, () => { OT.setWave([56]); OT.placeTower("A0", 6); OT.placeTower("B0", 7); OT.link("A0", "B0"); OT.startWave(); OT.step(2); });
    await tap(await center("#btn-pause"));                                  // пауза одним касанием
    await page.waitForTimeout(50);
    eq(await run(page, () => OT.state().phase), "paused", "пауза касанием #btn-pause");
    // на паузе: тап цифры 8, тап площадки A2; перетаскивание 7 на B2; два тапа по башням — луч
    await tap(await center('#hand [data-digit="8"]'));
    await tap(await at(1020, 280));
    const from = await center('#hand [data-digit="7"]'), to = await at(1020, 620);
    await touch("touchStart", from.x, from.y);
    for (let i = 1; i <= 8; i++) await touch("touchMove", from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8);
    await touch("touchEnd");
    await tap(await at(1020, 280)); await tap(await at(1020, 620));
    const st = await run(page, () => OT.state());
    eq([st.pads.find((p) => p.id === "A2").digit, st.pads.find((p) => p.id === "B2").digit], [8, 7], "цифры, поставленные касанием");
    const nb = st.beams.find((b) => b.a === "A2" && b.b === "B2");
    assert(nb && nb.label === "8 × 7 = 56" && nb.born === "pause", "луч касанием на паузе: " + JSON.stringify(st.beams));
    assert(types.length && types.every((t) => t === "touch"), "события указателя не touch: " + types.join(","));
    await tap(await center("#btn-resume"));
    await page.waitForTimeout(50);
    eq(await run(page, () => OT.state().phase), "battle", "продолжить касанием");
    const fin = await run(page, () => OT.runWave());
    assert((await run(page, () => OT.events())).some((e) => e.type === "enemy_killed" && e.beam.product === 56), "враг не побит лучом, построенным касанием");
    eq(fin.hearts, 10);
  });

  test("Ревью: DPR 2 и 3 — буфер canvas под экран и масштаб", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    for (const [w, h, dpr] of [[1024, 600, 2], [1280, 800, 3]]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
      await page.waitForTimeout(100);
      await run(page, SETUP);
      const r = await run(page, () => {
        const cv = document.getElementById("field"), b = cv.getBoundingClientRect();
        return { bw: cv.width, bh: cv.height, cssW: b.width, dpr: devicePixelRatio, scale: OT.state().scale };
      });
      const want = Math.min(dpr, 2);
      eq(r.dpr, dpr, "devicePixelRatio");
      assert(Math.abs(r.bw - r.cssW * want) <= 1, `${w}×${h}@${dpr}: буфер ${r.bw}, CSS ${r.cssW}`);
      assert(Math.abs(r.scale - Math.min(w / 1600, h / 900)) < 1e-9, "масштаб " + r.scale);
    }
  });

  for (const [w, h] of [[1024, 600], [1920, 1080]]) {
    test(`Ревью: скриншоты ${w}×${h} (бой, промах, босс, пауза)`, async ({ page, shot }) => {
      await page.setViewportSize({ width: w, height: h });
      await run(page, SETUP);
      await run(page, () => {
        OT.setWave([24, 56, 42, 12, 56, 24, 42, 12], { armored: [] });
        OT.placeTower("A0", 7); OT.placeTower("B0", 8); OT.link("A0", "B0");
        OT.link("B0", "A1") ; OT.placeTower("A1", 6); OT.link("B0", "A1");
        OT.placeTower("B1", 7); OT.link("A1", "B1");
        OT.placeTower("A2", 4); OT.link("B1", "A2");
        OT.placeTower("B2", 6); OT.link("A2", "B2");
      });
      await shot(`review-${w}x${h}-prep`);
      await run(page, () => { OT.startWave(); for (let i = 0; i < 400; i++) { OT.step(0.05); if (OT.drawn().notes.some((n) => /луч/.test(n.text))) break; } });
      await shot(`review-${w}x${h}-miss`);
      await run(page, () => OT.step(0.3));
      await shot(`review-${w}x${h}-miss2`);
      await run(page, () => { OT.step(4); OT.pause(); });
      await shot(`review-${w}x${h}-pause`);
      // Босс с висящей записью.
      await run(page, SETUP);
      await run(page, () => { OT.setWave([56, 21], { armored: [56] }); OT.placeTower("A0", 7); OT.placeTower("B0", 5); OT.link("A0", "B0"); OT.placeTower("A1", 3); OT.link("B0", "A1"); OT.startWave(); for (let i = 0; i < 300; i++) { OT.step(0.1); if (OT.state().enemies.some((e) => e.rem === 21 && e.armored && e.d > 520)) break; } });
      await shot(`review-${w}x${h}-boss`);
      await run(page, () => OT.runWave());
      await shot(`review-${w}x${h}-end`);
      eq(await run(page, () => OT.state().phase), "levelEnd");
    });
  }
}
