// Этап 3 («подстройка, сессия, взрослый, сохранение»): П8а, П8б, Д3, Д4, Д5, Д6, Д10, Д11, Д12, экран взрослого (удержание 2 с), зеркало в db,
// время постройки не видно ребёнку, скорость WaveGen при замедлении CPU, подписи лучей не закрывают цифры башен. Скриншоты — с флагом --shot.
// Общаются с игрой только через window.OT и DOM-id.

const run = (page, fn, arg) => page.evaluate(fn, arg);

// Помощники внутри страницы (window.K): сыграть волну по плану Solver, весь уровень, дата «сегодня + n».
const HELPERS = () => {
  window.K = {
    day(n) { const [y, m, d] = OT.state().day.date.split("-").map(Number), t = new Date(y, m - 1, d + n); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); },
    build() {
      for (const p of OT.state().pads) if (p.digit != null && !p.fixed) OT.removeTower(p.id);
      const plan = OT.state().wave.plan;
      for (const p of plan) { OT.placeTower(p.a, p.da); OT.placeTower(p.b, p.db); }
      return plan.map((p) => OT.link(p.a, p.b).ok);
    },
    win() { K.build(); OT.startWave(); return OT.runWave(); },
    wave(nums, o) { OT.setWave(nums, o); return K.win(); },
    level() { for (let w = 0; w < 3; w++) { const st = K.win(); if (st.phase === "waveEnd") OT.step(3); } OT.step(1); return OT.state(); },
    fresh(land = 1, idx = 0, o) { OT.manual(true); OT.seed(1); OT.newGame(o); return OT.loadLevel(land, idx); },
  };
};
const SETUP = (page) => run(page, HELPERS);

export function register({ test, assert, eq }) {

  test("П8а: прогресс переживает перезагрузку — карточки, day.started, звёзды", async ({ page }) => {
    await SETUP(page);
    await run(page, () => K.fresh(1, 0));
    const before = await run(page, () => { const s = K.level(); return { cards: s.cards, started: s.day.started, stars: s.stars, phase: s.phase }; });
    eq(before.phase, "levelEnd");
    assert(Object.keys(before.cards).length >= 3, "карточки не завелись: " + Object.keys(before.cards).length);
    assert(Object.values(before.cards).some((c) => c.b === 2), "ни одна карточка не поднялась в коробку 2");
    eq(before.stars["1-0"], 3);
    await page.reload();
    await page.waitForFunction(() => window.OT && typeof window.OT.state === "function");
    const after = await run(page, () => { const s = OT.state(); return { cards: s.cards, started: s.day.started, stars: s.stars, screen: s.screen }; });
    eq(after.cards, before.cards, "карточки после перезагрузки");
    eq(after.started, 1, "day.started после перезагрузки");
    eq(after.stars, before.stars, "звёзды после перезагрузки");
    const keys = await run(page, () => Object.keys(localStorage).filter((k) => k.startsWith("oborona-v1-")).sort());
    eq(keys, ["oborona-v1-day", "oborona-v1-progress", "oborona-v1-settings"].filter((k) => keys.includes(k)), "ключи localStorage");
    assert(keys.includes("oborona-v1-progress") && keys.includes("oborona-v1-day"), "нет ключей progress и day: " + keys);
    // Звёзды видны на карте после перезагрузки.
    await page.click("#btn-play");
    eq(await page.locator('#scr-map [data-level="1-0"]').evaluate((b) => b.parentElement.querySelector(".lvl-stars").dataset.stars), "3");
  });

  test("П8б: после лимита уровней в день — «Крепость отдыхает до завтра»; завтра можно снова", async ({ page }) => {
    await SETUP(page);
    const r = await run(page, () => {
      OT.manual(true); OT.seed(1); OT.newGame(); OT.setSetting("perDay", 2);
      const a = [];
      for (let i = 0; i < 2; i++) { a.push(OT.loadLevel(1, 0).ok); OT.finishLevel(); }
      const third = OT.loadLevel(1, 0);
      return { a, third, st: OT.state(), tomorrow: K.day(1) };
    });
    eq(r.a, [true, true]);
    eq(r.third, { ok: false, reason: "rest" });
    eq([r.st.screen, r.st.day.started, r.st.day.done], ["rest", 2, 2]);
    assert(await page.isVisible("#scr-rest"), "нет экрана отдыха");
    assert((await page.textContent("#scr-rest")).includes("Крепость отдыхает до завтра"), "нет надписи");
    assert(!(await page.isVisible("#hand")) && !(await page.isVisible("#scr-map")), "в отдыхе виден лишний экран");
    await page.click("#btn-rest-map");
    assert(await page.isVisible("#scr-map"), "«На карту» из экрана отдыха");
    const t = await run(page, (tm) => { OT.setDate(tm); return OT.loadLevel(1, 0); }, r.tomorrow);
    eq(t.ok, true, "завтра уровень доступен");
    eq(await run(page, () => OT.state().day.started), 1, "завтра счётчик начат заново");
    // Брошенный уровень (на карту из паузы) засчитан как начатый.
    await run(page, () => { OT.setSetting("perDay", 2); OT.setWave([12]); OT.startWave(); OT.step(1); OT.pause(); });
    await page.click("#btn-to-map");
    eq(await run(page, () => [OT.loadLevel(1, 0).ok, OT.loadLevel(1, 0).reason]), [true, "rest"], "брошенный уровень считается начатым");
  });

  test("Д3: Лейтнер — 1→2 (завтра), в тот же день без изменений, +1 день 2→3, крепость → 1, пауза и три переделки не повышают", async ({ page }) => {
    await SETUP(page);
    // 1 → 2, повтор в тот же день, следующий день 2 → 3.
    const addDays = (key, n) => { const [y, m, d] = key.split("-").map(Number), t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
    let r = await run(page, () => {
      K.fresh(1, 0);
      const today = OT.state().day.date;
      K.wave([12]);
      const a = OT.state().cards["m:2x6"], ev = OT.events().filter((e) => e.type === "card_changed" && e.key === "m:2x6");
      OT.step(3); K.wave([12]);
      const b = OT.state().cards["m:2x6"];
      OT.setDate(K.day(1)); OT.loadLevel(1, 0); K.wave([12]);
      return { a, b, c: OT.state().cards["m:2x6"], ev, today };
    });
    eq([r.a.b, r.a.due], [2, addDays(r.today, 1)], "1→2, повтор завтра");
    eq([r.b.b, r.b.due], [2, addDays(r.today, 1)], "тот же день: без изменений");
    eq([r.c.b, r.c.due], [3, addDays(r.today, 1 + 3)], "+1 день: 2→3, повтор через 3 дня");
    eq(r.ev.map((e) => [e.from, e.to]), [[1, 2]], "событие card_changed");
    // Крепость → коробка 1, ключ в day.down.
    r = await run(page, () => {
      OT.setCard("m:2x6", { b: 4, due: OT.state().day.date });
      OT.loadLevel(1, 0); OT.setWave([12]); OT.startWave(); OT.runWave();
      const s = OT.state();
      return { c: s.cards["m:2x6"], down: s.day.down, hearts: s.hearts };
    });
    eq([r.c.b, r.c.miss], [1, 1], "враг дошёл: коробка 1");
    eq(r.c.due, await run(page, () => OT.state().day.date), "повтор сегодня");
    assert(r.down.includes("m:2x6") && r.hearts === 9);
    // Луч, построенный на паузе, не повышает.
    r = await run(page, () => {
      OT.setCard("m:2x6", { b: 2, due: OT.state().day.date });
      OT.loadLevel(1, 0); OT.setWave([12]); OT.startWave(); OT.step(0.5); OT.pause();
      K.build(); const born = OT.state().beams.map((b) => b.born);
      OT.resume(); OT.runWave();
      return { c: OT.state().cards["m:2x6"], born, kills: OT.events().filter((e) => e.type === "enemy_killed").length };
    });
    eq([r.c.b, r.born, r.kills > 0], [2, ["pause"], true], "пауза: враг побеждён, карточка не повышена");
    // Пара переделана 3 раза — без повышения; ровно 2 раза — повышение.
    const edits = () => run(page, () => {
      OT.setCard("m:2x6", { b: 2, due: OT.state().day.date });
      OT.loadLevel(1, 0); OT.setWave([12]); OT.events({ clear: true });
      OT.placeTower("A0", 3); OT.placeTower("B0", 6); OT.link("A0", "B0");        // правка 1 (3 × 6 = 18)
      OT.placeTower("A0", 2);                                                      // правка 2 (2 × 6 = 12)
      OT.placeTower("A0", 4); OT.placeTower("A0", 2);                              // правки 3 и 4
      const rb = OT.state().beams[0].rebuilds;
      OT.startWave(); OT.runWave();
      return { rb, b: OT.state().cards["m:2x6"].b, killed: OT.events().some((e) => e.type === "enemy_killed") };
    });
    const two = await run(page, () => {
      OT.setCard("m:2x6", { b: 2, due: OT.state().day.date });
      OT.loadLevel(1, 0); OT.setWave([12]);
      OT.placeTower("A0", 3); OT.placeTower("B0", 6); OT.link("A0", "B0"); OT.placeTower("A0", 2);
      const rb = OT.state().beams[0].rebuilds; OT.startWave(); OT.runWave();
      return { rb, b: OT.state().cards["m:2x6"].b };
    });
    eq([two.rb, two.b], [1, 3], "две правки пары — ещё засчитывается");
    const three = await edits();
    eq([three.rb, three.b, three.killed], [3, 2, true], "много правок пары: враг побеждён, повышения нет");
  });

  test("Д4: земля открывается, когда у всех карточек прошлой земли коробка ≥ 3; одна карточка в коробке 2 держит замок", async ({ page }) => {
    await SETUP(page);
    const r = await run(page, () => {
      K.fresh(1, 0);
      const cards = OT.lands()[0].cards;
      for (const k of cards) OT.setCard(k, { b: 3, due: "2099-01-01" });
      OT.setCard("m:9x10", { b: 2, due: "2099-01-01" });
      const locked0 = OT.loadLevel(2, 0);
      K.wave([4]);
      const after1 = { unlocked: OT.state().unlocked, ev: OT.events().filter((e) => e.type === "land_unlocked").length, again: OT.loadLevel(2, 0) };
      OT.loadLevel(1, 0);
      OT.setCard("m:9x10", { b: 3, due: "2099-01-01" });
      K.wave([4]);
      const unl = OT.events().filter((e) => e.type === "land_unlocked").map((e) => e.land);
      return { locked0, after1, unl, unlocked: OT.state().unlocked, open: OT.loadLevel(2, 0), total: cards.length };
    });
    eq(r.locked0, { ok: false, reason: "locked" });
    eq(r.after1.unlocked, [1], "одна карточка в коробке 2: земля 2 закрыта");
    eq([r.after1.ev, r.after1.again], [0, { ok: false, reason: "locked" }]);
    eq(r.unl, [2], "после того как все в коробке 3: land_unlocked{2}");
    eq(r.unlocked, [1, 2]);
    eq(r.open.ok, true, "земля 2 открыта навсегда");
    assert(r.total === 23);
    // Строка на карте закрытой земли: «Откроется, когда освоишь факты Долины: k из 23».
    await run(page, () => { OT.newGame(); OT.setCard("m:2x2", { b: 3, due: "2099-01-01" }); OT.setCard("m:2x3", { b: 3, due: "2099-01-01" }); OT.show("map"); });
    const txt = await page.textContent('#scr-map .land[data-land="2"]');
    assert(txt.includes("Откроется, когда освоишь факты Долины: 2 из 23"), "надпись закрытой земли: " + txt);
    eq(await page.locator("#scr-map [data-level]").count(), 5, "на карте только земля 1");
    // Земля 5 открывается за землёй 4 (18 карточек), земля 6 — за землёй 5 (36 карточек).
    const t = await run(page, () => {
      OT.newGame();
      const L = OT.lands();
      for (const k of L[3].cards) OT.setCard(k, { b: 3, due: "2099-01-01" });
      for (const k of L[0].cards.concat(L[1].cards, L[2].cards)) OT.setCard(k, { b: 3, due: "2099-01-01" });
      OT.loadLevel(1, 0); K.wave([4]);
      return OT.state().unlocked;
    });
    eq(t, [1, 2, 3, 4, 5], "землю 5 открывает освоенная земля 4, земля 6 ещё закрыта");
  });

  test("Д5: 200 волн на синтетических карточках — доли 10/20/70 в пределах ±10 %, решаемы, размер 6–12, различных чисел ≤ 4 (≤ 3 на T1), лёгкая волна без новых", async ({ page }) => {
    await SETUP(page);
    const r = await run(page, () => {
      OT.manual(true);
      const today = OT.state().day.date, tplOf = (land, idx) => (land === 5 ? "T5" : ["T1", "T2", "T3", "T3", "T4"][idx]);
      const kinds = { fresh: 0, due: 0, known: 0, n: 0 }, bad = [], easyBad = [];
      const classify = (cards, e) => { const c = cards[e.card]; return !c ? "fresh" : c.due <= today ? "due" : "known"; };
      const lands = [1, 2, 3, 4, 5, 6];
      for (let i = 0; i < 200; i++) {
        const land = lands[i % lands.length], idx = i % 5, w = (i >> 2) % 3, seed = 100 + i, cards = OT.synth(land, seed);
        const wave = OT.waveFor(land, idx, w, seed, { cards }), n = wave.enemies.length, tag = [land, idx, w, seed];
        for (const e of wave.enemies) { kinds[classify(cards, e)]++; kinds.n++; }
        if (n < 6 || n > 12) bad.push([...tag, "размер", n]);
        const nums = new Set(wave.enemies.filter((e) => !e.armored).map((e) => e.number)), bosses = new Set(wave.enemies.filter((e) => e.armored).map((e) => e.card));
        if (nums.size + bosses.size > (tplOf(land, idx) === "T1" ? 3 : 4)) bad.push([...tag, "различных", nums.size, bosses.size]);
        const plan = wave.plan.map((p) => ({ number: p.n, a: p.a, b: p.b, da: p.da, db: p.db }));
        const pb = OT.verifyPlan({ land, idx, template: tplOf(land, idx), plan, enemies: wave.enemies, fixed: wave.fixed });
        if (pb.length) bad.push([...tag, "план", pb.join("; ")]);
      }
      // Лёгкий режим: новых нет, врагов на 2 меньше, различных чисел на 1 меньше.
      let easyN = 0;
      for (let i = 0; i < 60; i++) {
        const land = lands[i % lands.length], idx = i % 5, w = (i >> 2) % 3, seed = 500 + i, cards = OT.synth(land, seed);
        const hard = OT.waveFor(land, idx, w, seed, { cards }), wave = OT.waveFor(land, idx, w, seed, { cards, easy: true });
        easyN++;
        if (wave.enemies.some((e) => classify(cards, e) === "fresh")) easyBad.push([land, idx, w, seed, "новая в лёгкой"]);
        if (!wave.easy) easyBad.push([land, idx, w, seed, "easy не помечен"]);
        if (wave.enemies.length > Math.max(6, hard.enemies.length)) easyBad.push([land, idx, w, seed, "лёгкая длиннее", wave.enemies.length, hard.enemies.length]);
        if (wave.enemies.length < 6) easyBad.push([land, idx, w, seed, "меньше 6"]);
        if (wave.enemies.filter((e) => e.armored).length > 1) easyBad.push([land, idx, w, seed, "больше одного босса"]);
      }
      return { shares: { fresh: kinds.fresh / kinds.n, due: kinds.due / kinds.n, known: kinds.known / kinds.n }, n: kinds.n, bad, easyBad, easyN };
    });
    eq(r.bad, [], "размер, различные числа, решаемость");
    eq(r.easyBad, [], "лёгкие волны");
    assert(Math.abs(r.shares.fresh - 0.1) <= 0.1 && Math.abs(r.shares.due - 0.2) <= 0.1 && Math.abs(r.shares.known - 0.7) <= 0.1, "доли new/due/known: " + JSON.stringify(r.shares));
    // Тот же допуск по землям 1–3 без боссов (там корзины считаются по всем врагам волны).
    const r2 = await run(page, () => {
      const today = OT.state().day.date, k = { fresh: 0, due: 0, known: 0, n: 0 };
      for (let i = 0; i < 200; i++) {
        const land = 1 + (i % 3), idx = i % 5, w = (i >> 2) % 3, seed = 900 + i, cards = OT.synth(land, seed);
        for (const e of OT.waveFor(land, idx, w, seed, { cards }).enemies) { const c = cards[e.card]; k[!c ? "fresh" : c.due <= today ? "due" : "known"]++; k.n++; }
      }
      return [k.fresh / k.n, k.due / k.n, k.known / k.n];
    });
    assert(Math.abs(r2[0] - 0.1) <= 0.05 && Math.abs(r2[1] - 0.2) <= 0.05 && Math.abs(r2[2] - 0.7) <= 0.06, "доли на землях 1–3: " + r2.map((x) => x.toFixed(3)));
  });

  test("Д5б: две тяжёлые волны подряд включают лёгкий режим, волна с ≥ 80 % его выключает; новая игра — первые три карточки", async ({ page }) => {
    await SETUP(page);
    const r = await run(page, () => {
      K.fresh(1, 0);
      const out = [];
      const lose = (nums) => { OT.setWave(nums); OT.startWave(); OT.runWave(); out.push(JSON.stringify(OT.state().diff)); OT.step(3); };
      lose([12, 12, 12, 12, 12, 12]);                 // 0 % побеждено
      lose([12, 12, 12, 12, 12, 12]);                 // второй тяжёлый подряд
      const easyWave = OT.state(), size = easyWave.wave.numbers.length;
      const e1 = easyWave.diff.easy;
      return { out, e1, size, phase: easyWave.phase };
    });
    eq(r.out, ['{"hard":1,"easy":false}', '{"hard":2,"easy":true}']);
    assert(r.size <= 7 && r.size >= 6, "после двух тяжёлых волн следующая лёгкая (6–7 врагов в волне 3 уровня 1): " + r.size);
    const r2 = await run(page, () => {
      const s = OT.state(), nums = s.wave.numbers;
      K.win();                                       // лёгкую волну проходим верно: easy выключается
      return { diff: OT.state().diff, nums };
    });
    eq(r2.diff, { hard: 0, easy: false });
    // Новая игра: первая волна — первые три карточки земли, а за ними по одной новой в волне.
    const first = await run(page, () => { K.fresh(1, 0); return [...new Set(OT.state().wave.numbers)].sort((a, b) => a - b); });
    eq(first, [4, 6, 8], "первые три карточки: 2×2, 2×3, 2×4");
  });

  test("Д6: путаница 48 ↔ 56 записывается и чаще сводит эти числа в одну волну", async ({ page }) => {
    await SETUP(page);
    const r = await run(page, () => {
      K.fresh(4, 0, { veteran: true });
      OT.setWave([56, 24]);
      OT.placeTower("A0", 6); OT.placeTower("B0", 8); OT.link("A0", "B0");       // 6 × 8 = 48: не нужен ни 56, ни 24
      OT.startWave(); OT.runWave();
      const ev = OT.events().filter((e) => e.type === "confusion").map((e) => [e.a, e.b]);
      const c1 = JSON.parse(JSON.stringify(OT.state().conf));
      return { ev, c1 };
    });
    eq(r.ev, [[48, 56]], "событие confusion{48,56}");
    eq(r.c1["48-56"].n, 1);
    // Правильный луч для числа волны путаницей не считается (луч 7 × 8 для 56, 3 × 8 для 24).
    const r2 = await run(page, () => {
      OT.events({ clear: true });
      OT.step(3); OT.setWave([56, 24]); K.win();
      const ev1 = OT.events().filter((e) => e.type === "confusion").length;
      OT.step(3); OT.setWave([56, 24]);
      OT.placeTower("A0", 6); OT.placeTower("B0", 8); OT.link("A0", "B0"); OT.startWave(); OT.runWave();
      return { ev1, conf: OT.state().conf };
    });
    eq(r2.ev1, 0, "верные лучи — не путаница");
    eq(r2.conf["48-56"].n, 2, "вторая запись той же пары");
    // Частота совместного появления в сгенерированных волнах: с записью заметно выше.
    const f = await run(page, () => {
      const mk = () => { const c = {}; for (const k of ["m:7x7", "m:7x8", "m:8x8", "m:6x8", "m:6x7", "m:6x6", "m:5x8", "m:4x8", "b:7x8", "b:6x8", "b:6x7"]) c[k] = { b: 3, due: "2099-01-01", seen: 3, ok: 3, miss: 0, tS: 0, tN: 0, pd: "" }; return c; };
      const count = (conf) => {
        let both = 0, adj = 0;
        for (let seed = 1; seed <= 200; seed++) for (const idx of [0, 1, 2]) {
          const wv = OT.waveFor(4, idx, seed % 3, seed, { cards: mk(), conf });
          const nums = wv.enemies.filter((e) => !e.armored).map((e) => e.number);
          if (nums.includes(56) && nums.includes(48)) { both++; if (nums.some((v, i) => (v === 56 && nums[i + 1] === 48) || (v === 48 && nums[i + 1] === 56))) adj++; }
        }
        return { both, adj };
      };
      return { none: count({}), conf: count({ "48-56": { n: 2, last: "x" } }), once: count({ "48-56": { n: 1, last: "x" } }) };
    });
    assert(f.conf.both >= 4 * Math.max(1, f.none.both) && f.conf.both - f.none.both >= 40, "совместно: без записи " + f.none.both + ", с записью " + f.conf.both);
    assert(f.once.both <= f.none.both + 15, "одна запись (n < 2) ещё не меняет волны: " + JSON.stringify(f.once));
    assert(f.conf.adj >= f.conf.both * 0.5, "пара идёт в ленте рядом чаще чем в половине волн: " + JSON.stringify(f.conf));
  });

  test("Д10: подсказка боссов full → line → none по датам; пунктир исчезает после луча на паре", async ({ page }) => {
    await SETUP(page);
    const step = (wholeBeam) => run(page, (whole) => {
      OT.loadLevel(4, 0);
      OT.setWave([56], { armored: [56] });
      const h = OT.state().hints[0] || null, d = h ? OT.drawn().hints.map((x) => ({ ghost: x.ghost, mode: x.mode })) : [];
      if (whole) { OT.placeTower("A0", 7); OT.placeTower("B0", 8); OT.link("A0", "B0"); } else K.build();
      const after = OT.drawn().hints.length;
      OT.startWave(); OT.runWave();
      const s = OT.state();
      return { mode: h && h.mode, ghost: d[0] && d[0].ghost, dashes: d.length, after, killed: OT.events().filter((e) => e.type === "enemy_killed").length, log: s.hintLog["b:7x8"], date: s.day.date };
    }, wholeBeam);
    await run(page, () => K.fresh(4, 0, { veteran: true }));
    const d1 = await step(false);
    eq([d1.mode, d1.ghost, d1.dashes, d1.after], ["full", "7 × 5", 1, 0], "день 1: полная подсказка, пунктир гаснет после луча на паре");
    eq(d1.log.full.length, 1);
    assert(d1.killed >= 1, "босс побеждён");
    await run(page, () => OT.setDate(K.day(1)));
    const d2 = await step(false);
    eq([d2.mode, d2.dashes], ["full", 1], "день 2: ещё полная");
    eq(d2.log.full.length, 2, "второй день с подсказкой");
    await run(page, () => OT.setDate(K.day(1)));
    const d3 = await step(true);                   // режим line: пунктир без «7 × 5»; побеждён целым лучом — это «без подсказки»
    eq([d3.mode, d3.ghost, d3.dashes], ["line", null, 1], "день 3: только пунктир");
    eq([d3.log.full.length, d3.log.free.length], [2, 1]);
    await run(page, () => OT.setDate(K.day(1)));
    const d4 = await step(true);
    eq([d4.mode, d4.log.free.length], ["line", 2], "день 4: ещё пунктир, второй самостоятельный день");
    await run(page, () => OT.setDate(K.day(1)));
    const d5 = await run(page, () => { OT.loadLevel(4, 0); OT.setWave([56], { armored: [56] }); return { hints: OT.state().hints, dr: OT.drawn().hints }; });
    eq([d5.hints.length, d5.dr.length], [0, 0], "день 5: подсказки нет");
    // Тот же день дважды не считается за два.
    const same = await run(page, () => { K.fresh(4, 0, { veteran: true }); const out = []; for (let i = 0; i < 2; i++) { OT.setWave([56], { armored: [56] }); K.win(); out.push(OT.state().hintLog["b:7x8"].full.length); OT.step(3); } return out; });
    eq(same, [1, 1], "два раза в один день — одна дата");
  });

  test("Д11: в localStorage {v:99} — игра не падает и не перезаписывает ключ", async ({ page }) => {
    await page.addInitScript(() => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("oborona-v1-progress", '{"v":99,"future":true}'); sessionStorage.setItem("seeded", "1"); } } catch (e) {} });
    await page.reload();
    await page.waitForFunction(() => window.OT && typeof window.OT.state === "function");
    await SETUP(page);
    const r = await run(page, () => {
      OT.manual(true); OT.seed(1);
      const s0 = OT.state();
      OT.newGame(); OT.loadLevel(1, 0); K.win(); OT.setSetting("perDay", 4);
      OT.finishLevel();
      return { ro: s0.readonly, started: OT.state().day.started, progress: localStorage.getItem("oborona-v1-progress"), settings: localStorage.getItem("oborona-v1-settings"), day: localStorage.getItem("oborona-v1-day"), cards: Object.keys(OT.state().cards).length };
    });
    eq(r.ro, true, "данные новее известных: режим только чтения");
    eq(r.progress, '{"v":99,"future":true}', "ключ progress не перезаписан");
    eq([r.settings, r.day], [null, null], "остальные документы тоже не пишутся");
    assert(r.cards > 0 && r.started === 1, "играть в памяти можно");
  });

  test("Д12: после третьего уровня за день — «Крепость закрывается на ночь»; «Ещё один уровень» пока не достигнут лимит, иначе «отдыхает до завтра»", async ({ page }) => {
    await SETUP(page);
    await run(page, () => { K.fresh(1, 0); K.wave([12]); });                     // 2 × 6 поднимается в коробку 2: это «вернётся завтра»
    await run(page, () => OT.finishLevel());
    assert(await page.isVisible("#scr-level-end") && !(await page.isVisible("#scr-night")), "после первого уровня — итоги");
    await run(page, () => { OT.loadLevel(1, 1); OT.finishLevel(); });
    assert(await page.isVisible("#scr-level-end") && !(await page.isVisible("#scr-night")), "после второго уровня — итоги");
    await run(page, () => { OT.loadLevel(1, 2); OT.finishLevel(); });
    assert(await page.isVisible("#scr-night"), "после третьего — ночь");
    assert((await page.textContent("#scr-night")).includes("Крепость закрывается на ночь"), "заголовок ночи");
    assert(await page.isVisible("#btn-more") && !(await page.isVisible("#rest-msg")), "под лимитом (5) есть «Ещё один уровень»");
    assert((await page.textContent("#nt-back")).includes("2 × 6"), "завтра вернётся 2 × 6: " + (await page.textContent("#nt-back")));
    assert((await page.textContent("#nt-done")).includes("2 × 6"), "освоено сегодня 2 × 6");
    eq(await run(page, () => OT.events().filter((e) => e.type === "session_end").length), 1, "session_end");
    await run(page, () => OT.setSetting("perDay", 3));
    assert(!(await page.isVisible("#btn-more")) && (await page.isVisible("#rest-msg")), "при perDay = 3 кнопки нет, виден #rest-msg");
    assert((await page.textContent("#rest-msg")).includes("Крепость отдыхает до завтра"), "надпись #rest-msg");
    // Ещё один уровень с perDay = 5.
    await run(page, () => OT.setSetting("perDay", 5));
    await page.click("#btn-more");
    const st = await run(page, () => OT.state());
    eq([st.screen, st.phase, st.day.started], ["game", "prep", 4]);
    // Четвёртый и пятый уровни: после каждого снова ночь; после пятого кнопки нет.
    await run(page, () => OT.finishLevel());
    assert(await page.isVisible("#scr-night") && await page.isVisible("#btn-more"), "четвёртый уровень: ночь с кнопкой");
    await page.click("#btn-more");
    await run(page, () => OT.finishLevel());
    assert(await page.isVisible("#scr-night") && !(await page.isVisible("#btn-more")) && await page.isVisible("#rest-msg"), "пятый уровень: лимит");
    await page.click("#btn-night-map");
    assert(await page.isVisible("#scr-map"));
    eq(await run(page, () => OT.loadLevel(1, 0).reason), "rest");
  });

  test("Экран взрослого: открывается только удержанием #btn-parent 2 с; карта таблицы по коробкам, касание клетки, трудные факты, путаницы, настройки, сброс", async ({ page }) => {
    await SETUP(page);
    const dialogs = [];
    page.on("dialog", (d) => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });
    await run(page, () => {
      K.fresh(4, 0, { veteran: true });
      // путаница 48 ↔ 56, три записи
      for (let i = 0; i < 3; i++) { OT.setWave([56, 24]); OT.placeTower("A0", 6); OT.placeTower("B0", 8); OT.link("A0", "B0"); OT.startWave(); OT.runWave(); OT.step(3); }
      OT.setCard("m:7x8", { b: 1, due: OT.state().day.date, seen: 7, ok: 5, miss: 2, tS: 31000, tN: 5 });
      OT.setCard("m:6x7", { b: 5, due: "2099-01-01", seen: 4, ok: 4, miss: 0 });
      OT.setCard("m:2x2", { b: 4, due: "2099-01-01", seen: 3, ok: 3, miss: 0 });
      OT.show("map");
    });
    const box = await page.locator("#btn-parent").boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    assert(box.width >= 48 && box.height >= 48, "кнопка взрослого меньше 48 px: " + JSON.stringify(box));
    await page.mouse.click(cx, cy);                                           // простое касание
    assert(!(await page.isVisible("#scr-parent")), "касание открыло экран взрослого");
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.waitForTimeout(1000);
    assert(!(await page.isVisible("#scr-parent")), "через 1 с экран уже открыт");
    const ring = await page.locator("#parent-ring").evaluate((c) => parseFloat(c.style.strokeDashoffset));
    assert(ring < 245 && ring > 0, "кольцо заполняется: " + ring);
    await page.mouse.up();
    await page.waitForTimeout(2300);
    assert(!(await page.isVisible("#scr-parent")), "раннее отпускание должно сбросить удержание");
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.waitForTimeout(1500);
    assert(!(await page.isVisible("#scr-parent")), "через 1,5 с экран ещё закрыт");
    await page.waitForTimeout(800);
    assert(await page.isVisible("#scr-parent"), "после 2 с удержания экран открыт");
    await page.mouse.up();
    // Карта таблицы: 64 клетки 2–9 × 2–9 и 8 клеток ×10, цвет по коробке.
    eq(await page.locator("#scr-parent .pr-grid [data-k]").count(), 64);
    eq(await page.locator("#scr-parent .pr-row [data-k]").count(), 8);
    const colors = await run(page, () => {
      const bg = (k) => getComputedStyle(document.querySelector(`#scr-parent [data-k="${k}"]`)).backgroundColor;
      return { b1: bg("m:7x8"), b3: bg("m:2x3"), b4: bg("m:2x2"), b5: bg("m:6x7") };
    });
    assert(new Set([colors.b1, colors.b3, colors.b4, colors.b5]).size === 4, "разные коробки — разные цвета: " + JSON.stringify(colors));
    // Касание клетки: точность, среднее время, коробка, следующая дата.
    await page.click('#scr-parent [data-k="m:7x8"]');
    const det = await page.textContent("#pr-detail");
    assert(/7 × 8 = 56 · верно 5 из 7 \(71 %\) · среднее время постройки 6,2 с · коробка 1 · снова \d\d\.\d\d/.test(det), "подпись клетки: " + det);
    const txt = await page.textContent("#scr-parent");
    assert(txt.includes("Самые трудные факты") && txt.includes("7 × 8") && txt.includes("ошибок 2 из 7"), "трудные факты");
    assert(/56 ↔ 48 \(3 раза\)/.test(txt), "путаницы: " + txt.slice(txt.indexOf("Частые"), txt.indexOf("Частые") + 120));
    assert(txt.includes("Боссы: освоено") && txt.includes("Деление: освоено") && txt.includes("Двузначные: освоено"), "сводки");
    // Настройки.
    await page.click('[data-speed="normal"]');
    await page.click("#pr-per-plus"); await page.click("#pr-per-plus");
    await page.click("#pr-sound");
    await page.click("#pr-big");
    let s = await run(page, () => OT.state().settings);
    eq([s.speed, s.perDay, s.sound, s.big], ["normal", 7, false, true]);
    assert(await page.evaluate(() => document.getElementById("app").classList.contains("big")), "крупный шрифт включён");
    for (let i = 0; i < 8; i++) await page.click("#pr-per-minus");
    eq(await run(page, () => OT.state().settings.perDay), 2, "уровней в день не меньше 2");
    for (let i = 0; i < 9; i++) await page.click("#pr-per-plus");
    eq(await run(page, () => OT.state().settings.perDay), 8, "уровней в день не больше 8");
    await page.click("#pr-big");                                              // обратно
    // Сброс: подтверждение на странице, не confirm(); настройки остаются.
    await page.click("#btn-reset");
    assert(await page.isVisible("#btn-reset-yes"), "нет второй кнопки подтверждения");
    await page.click("#btn-reset-no");
    assert(!(await page.isVisible("#btn-reset-yes")), "«Отмена» не скрыла подтверждение");
    assert(Object.keys(await run(page, () => OT.state().cards)).length > 3, "после «Отмена» прогресс на месте");
    await page.click("#btn-reset");
    await page.waitForTimeout(5300);
    assert(!(await page.isVisible("#btn-reset-yes")), "подтверждение видно дольше 5 с");
    await page.click("#btn-reset"); await page.click("#btn-reset-yes");
    s = await run(page, () => OT.state());
    eq([Object.keys(s.cards).length, Object.keys(s.conf).length, s.unlocked, s.settings.speed], [0, 0, [1], "normal"], "сброс стёр прогресс, но не настройки");
    eq(dialogs, [], "alert/confirm/prompt не вызывались");
    await page.click("#btn-parent-back");
    assert(await page.isVisible("#scr-map") && !(await page.isVisible("#scr-parent")), "«Назад» ведёт на карту");
    eq(await page.locator("#scr-parent").evaluate((e) => e.innerHTML), "", "экран взрослого очищен после закрытия");
  });

  test("Крупный шрифт: подписи лучей и цифры руки крупнее, подписи по-прежнему не закрывают цифры", async ({ page }) => {
    await SETUP(page);
    const r = await run(page, () => {
      K.fresh(1, 0);
      OT.setWave([12, 18]);
      OT.placeTower("A0", 2); OT.placeTower("B0", 6); OT.link("A0", "B0"); OT.placeTower("A1", 3); OT.placeTower("B1", 6); OT.link("A1", "B1");
      const h0 = OT.drawn().labels.map((l) => l.h), f0 = parseFloat(getComputedStyle(document.querySelector('#hand [data-digit="7"]')).fontSize);
      OT.setSetting("big", true);
      const dr = OT.drawn(), h1 = dr.labels.map((l) => l.h), f1 = parseFloat(getComputedStyle(document.querySelector('#hand [data-digit="7"]')).fontSize);
      const fs = parseFloat(getComputedStyle(document.getElementById("app")).fontSize);
      const st = OT.state(), bad = [];
      for (const l of dr.labels) for (const p of st.pads) { if (p.digit == null) continue; const dx = Math.max(l.x - p.x, 0, p.x - (l.x + l.w)), dy = Math.max(l.y - p.y, 0, p.y - (l.y + l.h)); if (Math.hypot(dx, dy) < 36) bad.push(l.text); }
      OT.setSetting("big", false);
      return { h0, h1, f0, f1, fs, bad, back: OT.drawn().labels.map((l) => l.h) };
    });
    assert(r.h1.every((h, i) => h > r.h0[i] * 1.15), "подписи крупнее: " + JSON.stringify([r.h0, r.h1]));
    assert(r.f1 > r.f0 * 1.15, "цифры руки крупнее: " + r.f0 + " → " + r.f1);
    eq(r.bad, [], "подписи не закрывают цифры башен");
    eq(r.back, r.h0, "выключение возвращает размер");
  });

  test("Облики башен и награды: ряд ×7 освоен → «башня-маяк», все 15 → «крепостная пушка»; награды видны на карте заранее, облик включается и выключается", async ({ page }) => {
    await SETUP(page);
    const r = await run(page, () => {
      K.fresh(1, 0);
      OT.show("map");
      const text0 = document.getElementById("rewards").innerText;
      const titles0 = [...document.querySelectorAll("#rw-list .rw")].map((e) => e.title);
      const row7 = OT.lands().flatMap((l) => l.cards).filter((k) => /^m:/.test(k) && (() => { const [a, b] = k.slice(2).split("x").map(Number); return b <= 10 && (a === 7 || b === 7); })());
      OT.loadLevel(1, 0);
      for (const k of row7.slice(0, 5)) OT.setCard(k, { b: 4, due: "2099-01-01" });
      K.wave([12]);
      OT.show("map");
      const mid = document.querySelector('#rw-list [data-skin="mayak"] .pg').textContent;
      OT.loadLevel(1, 0);
      for (const k of row7) OT.setCard(k, { b: 4, due: "2099-01-01" });
      K.wave([12]);
      const ev = OT.events().filter((e) => e.type === "skin_unlocked").map((e) => e.id);
      OT.show("map");
      const got = document.querySelector('#rw-list [data-skin="mayak"]');
      return { text0, titles0, n7: row7.length, mid, ev, gotClass: got.className, skins: OT.state().skins };
    });
    eq(r.n7, 9, "ряд ×7 — 9 карточек");
    assert(r.titles0.includes("Освой все ×7 — получишь башню-маяк: 0 из 9"), "награда видна заранее: " + r.titles0.join(" | "));
    assert(r.text0.includes("башня-маяк") && r.text0.includes("крепостная пушка") && r.text0.includes("0 из 9"), "награды на карте: " + r.text0);
    assert(/5 из 9/.test(r.mid), "прогресс ряда: " + r.mid);
    eq(r.ev, ["mayak"], "skin_unlocked{mayak} один раз");
    assert(/got/.test(r.gotClass) && /on/.test(r.gotClass), "облик получен и включён: " + r.gotClass);
    eq(r.skins.on["7"], "mayak");
    // Выключить и включить нажатием; другая цифра обликов не меняет.
    await run(page, () => OT.show("map"));
    await page.click('#rw-list [data-skin="mayak"]');
    eq(await run(page, () => OT.state().skins.on["7"]), undefined, "выключен");
    await page.click('#rw-list [data-skin="mayak"]');
    eq(await run(page, () => OT.state().skins.on["7"]), "mayak", "включён снова");
    // Все 15 «Трудных» → пушка для всех башен.
    const g = await run(page, () => {
      OT.loadLevel(1, 0);
      for (const k of OT.lands()[3].boss) OT.setCard(k, { b: 4, due: "2099-01-01" });
      K.wave([12]);
      return { ev: OT.events().filter((e) => e.type === "skin_unlocked").map((e) => e.id), on: OT.state().skins.on };
    });
    eq(g.ev.includes("pushka"), true);
    eq(g.on.all, "pushka");
  });

  test("Зеркало в db: с window.claude документы пишутся в oborona/*, свежий снимок применяется, старый — нет; без него только localStorage", async ({ page }) => {
    await page.addInitScript(() => {
      const log = { sets: [], listeners: {}, docs: [] };
      window.__db = log;
      window.claude = { use: (name) => Promise.resolve(name !== "db" ? null : {
        doc: (path) => ({
          set: (d) => { log.sets.push({ path, data: JSON.parse(JSON.stringify(d)) }); return Promise.resolve(); },
          onSnapshot: (ok) => { log.listeners[path] = ok; log.docs.push(path); ok({ exists: false, data: () => null }); return () => {}; },
        }),
      }) };
    });
    await page.reload();
    await page.waitForFunction(() => window.OT && window.__db && window.__db.docs.length === 3);
    await SETUP(page);
    eq(await run(page, () => OT.state().storeMode), "db");
    await run(page, () => { K.fresh(1, 0); K.wave([12]); OT.setSetting("perDay", 6); });
    await page.waitForTimeout(1300);
    const paths = await run(page, () => [...new Set(window.__db.sets.map((s) => s.path))].sort());
    eq(paths, ["oborona/day", "oborona/progress", "oborona/settings"], "документы в db");
    const last = await run(page, () => { const p = window.__db.sets.filter((s) => s.path === "oborona/progress").pop().data; return { v: p.v, b: p.cards["m:2x6"].b, upd: p.updatedAt > 0 }; });
    eq(last, { v: 1, b: 2, upd: true });
    assert(await run(page, () => window.__db.sets.filter((s) => s.path === "oborona/progress").length) <= 3, "запись с задержкой, а не на каждое действие");
    // Снимок новее применяется, старее — нет.
    const r0 = await run(page, () => {
      const p = JSON.parse(localStorage.getItem("oborona-v1-progress"));
      const old = Object.assign({}, p, { updatedAt: 1, cards: { "m:3x3": { b: 5, due: "2099-01-01", seen: 1, ok: 1, miss: 0, tS: 0, tN: 0, pd: "" } } });
      window.__db.listeners["oborona/progress"]({ exists: true, data: () => old });
      return Object.keys(OT.state().cards);
    });
    await page.waitForTimeout(200);                  // устаревший снимок в db заменяется нашими данными: идёт запись, потом снимки снова принимаются
    const r = await run(page, (afterOld) => {
      const p = JSON.parse(localStorage.getItem("oborona-v1-progress"));
      const fresh = Object.assign({}, p, { updatedAt: Date.now() + 100000, cards: { "m:3x3": { b: 5, due: "2099-01-01", seen: 1, ok: 1, miss: 0, tS: 0, tN: 0, pd: "" } } });
      window.__db.listeners["oborona/progress"]({ exists: true, data: () => fresh });
      return { afterOld, afterFresh: Object.keys(OT.state().cards) };
    }, r0);
    assert(r.afterOld.includes("m:2x6") && !r.afterOld.includes("m:3x3"), "старый снимок применился: " + r.afterOld);
    eq(r.afterFresh, ["m:3x3"], "новый снимок применяется");
    // Снимок посреди волны ждёт конца волны и не меняет поле.
    const mid = await run(page, () => {
      OT.loadLevel(1, 0); OT.setWave([12]); K.build();
      const beams = OT.state().beams.length, p = JSON.parse(localStorage.getItem("oborona-v1-progress"));
      const fresh = Object.assign({}, p, { updatedAt: Date.now() + 200000, cards: { "m:4x4": { b: 5, due: "2099-01-01", seen: 1, ok: 1, miss: 0, tS: 0, tN: 0, pd: "" } } });
      window.__db.listeners["oborona/progress"]({ exists: true, data: () => fresh });
      const during = Object.keys(OT.state().cards), beams2 = OT.state().beams.length;
      OT.startWave(); OT.runWave();
      return { during, beams, beams2, after: Object.keys(OT.state().cards).sort() };
    });
    eq([mid.beams, mid.beams2], [mid.beams, mid.beams], "поле во время волны не меняется");
    assert(!mid.during.includes("m:4x4"), "во время подготовки снимок не лёг в данные");
    assert(mid.after.includes("m:4x4") && mid.after.includes("m:2x6"), "после волны данные из db + итог волны: " + mid.after);
  });

  test("Без window.claude прогресс пишется только в localStorage", async ({ page }) => {
    await SETUP(page);
    const r = await run(page, () => {
      K.fresh(1, 0); K.wave([12]); OT.setSetting("speed", "fast");
      return { claude: typeof window.claude, mode: OT.state().storeMode, keys: Object.keys(localStorage).filter((k) => k.startsWith("oborona-v1-")).sort(), p: JSON.parse(localStorage.getItem("oborona-v1-progress")), s: JSON.parse(localStorage.getItem("oborona-v1-settings")) };
    });
    eq([r.claude, r.mode], ["undefined", "local"]);
    eq(r.keys, ["oborona-v1-day", "oborona-v1-progress", "oborona-v1-settings"]);
    eq([r.p.v, r.p.cards["m:2x6"].b, r.s.speed, r.s.v], [1, 2, "fast", 1]);
  });

  test("Время постройки сохраняется для взрослого и нигде не видно ребёнку", async ({ page }) => {
    await SETUP(page);
    const seen = [];
    const child = async (tag) => {
      const t = await page.evaluate(() => document.body.innerText + "\n" + [...document.querySelectorAll("[aria-label],[title]")].map((e) => (e.getAttribute("aria-label") || "") + " " + (e.title || "")).join("\n") + "\n" + document.getElementById("scr-parent").innerHTML);
      const d = await page.evaluate(() => { const dr = OT.drawn(); return dr.labels.map((l) => l.text).concat(dr.notes.map((n) => n.text), dr.hints.map((h) => h.ghost || "")).join("\n"); });
      seen.push(tag);
      assert(!/время постройки|среднее время|\d,\d с(?![а-яё])|\d+ мс|сек/i.test(t + "\n" + d), "время постройки видно в «" + tag + "»: " + (t + d).slice(0, 200));
    };
    await run(page, () => { K.fresh(1, 0); OT.setWave([12]); });
    await child("подготовка");
    await page.waitForTimeout(250);
    await run(page, () => { K.build(); });
    await run(page, () => { OT.startWave(); OT.step(5); });
    await child("бой");
    const tN = await run(page, () => { OT.runWave(); return OT.state().cards["m:2x6"]; });
    assert(tN.tN === 1 && tN.tS >= 100, "время постройки записано: " + JSON.stringify(tN));
    await child("конец волны");
    await run(page, () => { OT.finishLevel(); });
    await child("итоги уровня");
    await run(page, () => { OT.loadLevel(1, 1); OT.finishLevel(); OT.loadLevel(1, 2); OT.finishLevel(); });
    await child("ночь");
    await run(page, () => OT.show("map"));
    await child("карта");
    await run(page, () => OT.show("rest"));
    await child("отдых");
    await run(page, () => OT.openParent());
    const adult = await page.textContent("#scr-parent");
    assert(adult.includes("Для взрослого"), "экран взрослого открыт");
    await page.click('#scr-parent [data-k="m:2x6"]');
    assert(/среднее время постройки \d,\d с/.test(await page.textContent("#pr-detail")), "взрослый видит время: " + (await page.textContent("#pr-detail")));
    await run(page, () => OT.show("map"));
    eq(await page.locator("#scr-parent").evaluate((e) => e.innerHTML), "", "после закрытия в DOM ничего нет");
    assert(seen.length === 7);
  });

  test("WaveGen: худшая волна не дольше 150 мс при замедлении CPU в 4 раза (общий бюджет Solver)", async ({ page }) => {
    await SETUP(page);
    const cdp = await page.context().newCDPSession(page);
    const seeds = Array.from({ length: 10 }, (_, i) => i * 17 + 3);
    const out = {};
    for (const rate of [1, 4]) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      const r = await run(page, (s) => OT.timeWaves(s), seeds);
      r.sort((a, b) => b[0] - a[0]);
      out[rate] = { n: r.length, worst: r[0][0], where: r[0].slice(1).join("/"), avg: r.reduce((a, c) => a + c[0], 0) / r.length, p99: r[Math.floor(r.length * 0.01)][0] };
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    console.log("       WaveGen, " + out[1].n + " волн: 1× худшая " + out[1].worst.toFixed(0) + " мс (" + out[1].where + "), среднее " + out[1].avg.toFixed(2) + " мс; 4× худшая " + out[4].worst.toFixed(0) + " мс (" + out[4].where + "), среднее " + out[4].avg.toFixed(2) + ", p99 " + out[4].p99.toFixed(0));
    assert(out[4].worst <= 150, "худшая волна при 4× замедлении " + out[4].worst.toFixed(0) + " мс (" + out[4].where + "), цель ≤ 150");
    // Бюджет не ломает качество: волны по-прежнему решаемы и с боссами там, где они должны быть.
    const q = await run(page, () => {
      let boss = 0, tot = 0, tiny = 0;
      for (let land of [4, 6]) for (let idx = 0; idx < 5; idx++) for (let w = 0; w < 3; w++) for (let seed = 1; seed <= 8; seed++) {
        const wv = OT.waveFor(land, idx, w, seed * 5); tot++;
        if (wv.enemies.some((e) => e.armored)) boss++;
        if (new Set(wv.enemies.map((e) => e.number)).size < 2) tiny++;
      }
      return { boss, tot, tiny };
    });
    assert(q.boss / q.tot >= 0.9, "волны земель 4 и 6 с боссом: " + q.boss + " из " + q.tot);
    assert(q.tiny / q.tot <= 0.05, "запасных волн из одного числа слишком много: " + q.tiny + " из " + q.tot);
  });

  test("Подписи лучей не закрывают цифры башен на полных полях T3, T4, T5 (и T1, T2)", async ({ page }) => {
    await SETUP(page);
    const r = await run(page, () => {
      const out = [], variants = [[6, 9, 7, 8, 5, 4, 3, 2], [9, 8, 7, 6, 9, 8, 7, 6], [7, 8, 9, 6, 4, 3, 5, 2], [3, 4, 5, 6, 7, 8, 9, 2], [8, 6, 9, 7, 8, 6, 9, 7]];
      let boards = 0, small = 0;
      for (const [land, idx, fixedSet] of [[2, 2, null], [2, 3, null], [2, 4, null], [2, 1, null], [1, 0, null],
        [5, 0, { A0: 6, A1: 7, A2: 8, A3: 9 }], [5, 0, { A0: 9, A1: 9, A2: 8, A3: 8 }], [5, 0, { A0: 7, A1: 6, A2: 7, A3: 6 }], [5, 0, { A0: 8, A1: 9, A2: 6, A3: 7 }]]) {
        for (let v = 0; v < variants.length; v++) {
          OT.manual(true); OT.seed(1); OT.newGame({ unlockAll: true }); OT.loadLevel(land, idx);
          if (fixedSet) OT.setWave([56], { fixed: fixedSet });
          const s = OT.state(), digits = variants[v];
          s.pads.forEach((p, i) => { if (!p.fixed) OT.placeTower(p.id, digits[i % digits.length]); });
          for (const a of Object.keys(s.adj)) for (const b of s.adj[a]) if (a < b) OT.link(a, b);
          const dr = OT.drawn(), st = OT.state(), tag = st.template + "/" + v;
          boards++;
          if (dr.labels.length !== st.beams.length || st.beams.length < 5) out.push(tag + ": лучей " + st.beams.length + ", подписей " + dr.labels.length);
          for (const l of dr.labels) {
            if (l.fs < 34) small++;
            if (l.x < 0 || l.y < 110 || l.x + l.w > 1600 || l.y + l.h > 790) out.push(tag + ": «" + l.text + "» вне поля");
            for (const p of st.pads) {
              if (p.digit == null) continue;
              const dx = Math.max(l.x - p.x, 0, p.x - (l.x + l.w)), dy = Math.max(l.y - p.y, 0, p.y - (l.y + l.h));
              if (Math.hypot(dx, dy) < 36) out.push(tag + ": «" + l.text + "» закрывает цифру " + p.digit + " на " + p.id);
            }
          }
          for (let i = 0; i < dr.labels.length; i++) for (let j = i + 1; j < dr.labels.length; j++) {
            const a = dr.labels[i], c = dr.labels[j];
            if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) out.push(tag + ": подписи налезают друг на друга");
          }
        }
      }
      return { out, boards, small };
    });
    eq(r.out, [], "подписи на полных полях");
    assert(r.boards === 45, "полей " + r.boards);
  });

  test("Скриншоты этапа 3 1024×600: ночь, отдых, экран взрослого, карта с замками и наградами", async ({ page, shot }) => {
    await SETUP(page);
    await page.setViewportSize({ width: 1024, height: 600 });
    const play = () => run(page, () => {
      K.fresh(1, 0);
      for (const k of ["m:2x2", "m:2x3", "m:2x4", "m:2x5", "m:5x5", "m:2x10", "m:3x10"]) OT.setCard(k, { b: 3, due: OT.state().day.date });
      K.wave([12]); OT.step(3); K.wave([18]); OT.finishLevel();
      OT.loadLevel(1, 1); OT.finishLevel(); OT.loadLevel(1, 2); OT.finishLevel();
    });
    await play();
    assert(await page.isVisible("#scr-night"));
    await shot("etap3-noch-1024x600");
    await run(page, () => { OT.setSetting("perDay", 3); });
    await shot("etap3-noch-limit-1024x600");
    await run(page, () => { OT.loadLevel(1, 3); });
    assert(await page.isVisible("#scr-rest"));
    await shot("etap3-otdyh-1024x600");
    await run(page, () => {
      OT.setSetting("perDay", 5);
      OT.newGame();
      OT.loadLevel(1, 0);                          // три записи путаницы 12 ↔ 14: для списка «Частые путаницы»
      for (let i = 0; i < 3; i++) { OT.setWave([12, 18]); OT.unlink("A0", "B0"); OT.placeTower("A0", 2); OT.placeTower("B0", 7); OT.link("A0", "B0"); OT.startWave(); OT.runWave(); OT.step(3); }
      const L = OT.lands();
      const mk = (k, b, seen, miss, tS) => OT.setCard(k, { b, due: "2099-01-01", seen, ok: seen - miss, miss, tS, tN: 5 });
      let i = 0;
      for (let a = 2; a <= 9; a++) for (let b = a; b <= 9; b++) { const k = `m:${a}x${b}`; if (L.flatMap((l) => l.cards).includes(k)) mk(k, 1 + (i * 7) % 5, 6, (i * 3) % 4, 3000 + 700 * ((i * 5) % 9)); i++; }
      for (let a = 2; a <= 9; a++) mk(`m:${a}x10`, 2 + (a % 4), 5, a % 3, 2500 + 400 * a);
      OT.show("map");
    });
    await shot("etap3-karta-zamki-nagrady-1024x600");
    await run(page, () => { OT.setCard("m:7x8", { b: 1, due: OT.state().day.date, seen: 7, ok: 5, miss: 2, tS: 31000, tN: 5 }); OT.openParent(); });
    await page.click('#scr-parent [data-k="m:7x8"]');
    await shot("etap3-vzroslyj-1024x600");
    // Все облики на поле: цифры 2–9 на T2, пушка выключена.
    await run(page, () => {
      OT.newGame({ unlockAll: true });
      OT.loadLevel(2, 1);
      for (const row of [2, 3, 4, 5, 6, 7, 8, 9]) for (const k of OT.lands().flatMap((l) => l.cards)) { const [a, b] = k.slice(2).split("x").map(Number); if (k[0] === "m" && b <= 10 && (a === row || b === row)) OT.setCard(k, { b: 4, due: "2099-01-01" }); }
      OT.setWave([12]); K.win(); OT.step(3); OT.setWave([12]);
      OT.state().pads.forEach((p, i) => OT.placeTower(p.id, 2 + i));
      for (const [a, b] of [["A0", "B0"], ["A1", "B1"], ["A2", "B2"], ["A3", "B3"]]) OT.link(a, b);
    });
    await shot("etap3-obliki-bashen-1024x600");
  });
}
