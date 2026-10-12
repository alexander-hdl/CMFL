// Перенос из ветки (сравнение с независимой реализацией, dev/07-sravnenie-s-vetkoy.md): земля открывается и при ошибках («был в коробке ≥ 3» —
// ever3, миграция), многодневная симуляция прогресса с ошибками, босс не доходит до остатка, который нельзя добить, пример «56 = 7 × 8» у ворот,
// рисование только при изменениях (счётчик кадров OT.frames, фон в кэше). Общаются с игрой только через window.OT и DOM-id.
//
// Симуляция по дням (две проверки) идёт всегда. Её время записано в dev/STATUS.md.

const run = (page, fn, arg) => page.evaluate(fn, arg);

// Помощники внутри страницы (window.S): построить волну по плану Solver; вести бота по дням с заданной долей ошибок.
export const HELPERS = () => {
  window.S = {
    add(date, n) { const [y, m, d] = date.split("-").map(Number), t = new Date(y, m - 1, d + n); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); },
    rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
    // Строит план волны и портит долю q лучей: у выбранного луча одна из его башен (если она не нужна другому лучу) получает чужую цифру.
    // Если обеих башен делят с другими лучами, луч просто не строится (ребёнок про него забыл).
    build(q, rnd) {
      for (const p of OT.state().pads) if (p.digit != null && !p.fixed) OT.removeTower(p.id);
      const st = OT.state(), plan = st.wave.plan, use = {};
      for (const p of plan) { use[p.a] = (use[p.a] || 0) + 1; use[p.b] = (use[p.b] || 0) + 1; }
      const skip = new Set(), wrong = [];
      plan.forEach((p, i) => {
        if (rnd() >= q) return;
        const own = use[p.a] === 1 ? ["a", "da"] : use[p.b] === 1 ? ["b", "db"] : null;
        if (!own) { skip.add(i); return; }
        const others = st.hand.filter((d) => d !== p[own[1]] && d * (own[0] === "a" ? p.db : p.da) !== p.da * p.db);
        wrong.push({ pad: p[own[0]], digit: others[Math.floor(rnd() * others.length)] });
      });
      for (const p of plan) { OT.placeTower(p.a, p.da); OT.placeTower(p.b, p.db); }
      plan.forEach((p, i) => { if (!skip.has(i)) OT.link(p.a, p.b); });
      for (const w of wrong) OT.placeTower(w.pad, w.digit);
      return { beams: plan.length, wrong: wrong.length, skipped: skip.size };
    },
    // Один день: n уровней земли land (по кругу 0–4), по три волны. Возвращает счётчики врагов за день.
    day(date, land, q, rnd, n, startIdx) {
      OT.setDate(date);
      let spawned = 0, castle = 0;
      for (let i = 0; i < n; i++) {
        const r = OT.loadLevel(land, (startIdx + i) % 5);
        if (!r.ok) return { stop: r.reason, spawned, castle };
        for (let w = 0; w < 3; w++) {
          S.build(q, rnd);
          OT.startWave();
          OT.runWave(300);
          const ev = OT.events({ clear: true });
          spawned += ev.filter((e) => e.type === "enemy_spawn").length;
          castle += ev.filter((e) => e.type === "enemy_reached_castle").length;
          if (OT.state().phase === "waveEnd") OT.step(3);
        }
      }
      return { spawned, castle, unlocked: OT.state().unlocked };
    },
  };
};

export function register({ test, assert, eq }) {
  test("Перенос 1: карточка, хоть раз побывавшая в коробке 3, остаётся изученной; без этого флага коробка 2 держит замок", async ({ page }) => {
    await run(page, HELPERS);
    const r = await run(page, () => {
      OT.manual(true); OT.seed(2); OT.newGame({ veteran: false });
      const cards = OT.lands()[0].cards, out = {};
      // Все карточки земли 1 были в коробке 3, затем ошибки вернули их в коробку 1: земля 2 всё равно откроется на конце волны.
      for (const k of cards) OT.setCard(k, { b: 3, due: "2099-01-01" });
      for (const k of cards) OT.setCard(k, { b: 1, due: "2099-01-01" });
      out.flags = cards.every((k) => OT.state().cards[k].ever3 === true && OT.state().cards[k].b === 1);
      OT.loadLevel(1, 0); OT.setWave([4]); OT.startWave(); OT.runWave();
      out.unlocked = OT.state().unlocked;
      out.ev = OT.events().filter((e) => e.type === "land_unlocked").map((e) => e.land);
      // Карточка, которой в коробке 3 не бывало, замок держит.
      OT.newGame({ veteran: false });
      for (const k of cards) OT.setCard(k, { b: 3, due: "2099-01-01" });
      OT.setCard("m:9x10", { b: 2, due: "2099-01-01", ever3: false });
      OT.loadLevel(1, 0); OT.setWave([4]); OT.startWave(); OT.runWave();
      out.held = OT.state().unlocked;
      return out;
    });
    eq(r.flags, true, "setCard с b ≥ 3 ставит ever3, смена коробки его не снимает");
    eq(r.unlocked, [1, 2], "земля 2 открыта, хотя все карточки сейчас в коробке 1");
    eq(r.ev, [2]);
    eq(r.held, [1], "одна карточка не бывала в коробке 3 — замок держит");
  });

  test("Перенос 1: враг в крепости возвращает карточку в коробку 1, но ever3 остаётся; «освоено» (коробка ≥ 4) от флага не зависит", async ({ page }) => {
    const r = await run(page, () => {
      OT.manual(true); OT.seed(3); OT.newGame({ veteran: false });
      OT.setCard("m:2x6", { b: 3, due: "2000-01-01" });
      OT.loadLevel(1, 0); OT.setWave([12], { cards: { 12: "m:2x6" } }); OT.startWave(); OT.runWave();   // луча нет: враг 12 доходит до крепости
      const c = OT.state().cards["m:2x6"];
      // Облик «маяк» (ряд ×7) требует коробку ≥ 4: ever3 при коробке 1 его не даёт.
      OT.newGame({ veteran: false });
      const row7 = [...new Set(OT.lands().flatMap((l) => l.cards))].filter((k) => { const m = /^m:(\d+)x(\d+)$/.exec(k); return m && +m[1] <= 10 && +m[2] <= 10 && (+m[1] === 7 || +m[2] === 7); });   // ряд ×7: 9 карточек
      for (const k of row7) OT.setCard(k, { b: 1, ever3: true, due: "2099-01-01" });
      OT.loadLevel(1, 0); OT.setWave([4]); OT.startWave(); OT.runWave();
      const none = OT.state().skins.got.slice();
      for (const k of row7) OT.setCard(k, { b: 4, due: "2099-01-01" });
      OT.loadLevel(1, 0); OT.setWave([4]); OT.startWave(); OT.runWave();
      return { c, none, got: OT.state().skins.got.slice(), row7: row7.length };
    });
    eq([r.c.b, r.c.ever3], [1, true], "после крепости: коробка 1, флаг остался");
    eq(r.none, [], "ever3 без коробки ≥ 4 облик не выдаёт");
    assert(r.row7 >= 3 && r.got.includes("mayak"), "при коробке 4 облик «маяк» выдан: " + JSON.stringify(r.got));
  });

  test("Перенос 1: миграция — в старом сохранении без ever3 флаг ставится по текущей коробке (≥ 3)", async ({ page }) => {
    await run(page, () => {
      OT.manual(true); OT.newGame({ veteran: false });
      const doc = JSON.parse(localStorage.getItem("oborona-v1-progress"));
      doc.cards = {
        "m:2x2": { b: 1, due: "2026-01-01", seen: 1, ok: 0, miss: 1, tS: 0, tN: 0, pd: "" },
        "m:2x3": { b: 3, due: "2026-01-01", seen: 1, ok: 1, miss: 0, tS: 0, tN: 0, pd: "" },
        "m:2x4": { b: 5, due: "2026-01-01", seen: 1, ok: 1, miss: 0, tS: 0, tN: 0, pd: "" },
        "m:2x5": { b: 2, due: "2026-01-01", ever3: true },
      };
      localStorage.setItem("oborona-v1-progress", JSON.stringify(doc));
    });
    await page.reload();
    await page.waitForFunction(() => window.OT && typeof window.OT.state === "function");
    const cards = await run(page, () => OT.state().cards);
    eq(["m:2x2", "m:2x3", "m:2x4", "m:2x5"].map((k) => [cards[k].b, cards[k].ever3]), [[1, false], [3, true], [5, true], [2, true]]);
  });

  // Земля 2 открывается у бота, который делает ошибки, но не вечно: на пяти seed медиана дня открытия и худший день. До правки (карточка должна была стоять
  // в коробке ≥ 3 одновременно) при 10 % ошибок земля не открывалась за 60 дней у двух seed из шести, при 20 % — ни у одного.
  for (const [q, medMax, worstMax] of [[0.10, 12, 25], [0.20, 20, 40]]) {
    test(`Перенос 2: симуляция по дням, ~${q * 100} % врагов доходят до крепости — земля 2 открывается: медиана не позже ${medMax}-го дня, худший случай не позже ${worstMax}-го`, async ({ page }) => {
      await run(page, HELPERS);
      const days = [], shares = [];
      for (const seed of [1, 2, 3, 4, 5]) {
        await run(page, () => { OT.manual(true); });
        const r = await simulate(page, q, worstMax, seed);
        days.push(r.day); shares.push(r.share);
      }
      const share = shares.reduce((a, b) => a + b, 0) / shares.length, sorted = days.slice().sort((a, b) => a - b), med = sorted[2];
      console.log(`       ~${q * 100} %: доходило ${(share * 100).toFixed(1)} % врагов; день открытия земли 2 по seed 1–5: ${days.join(", ")} (медиана ${med})`);
      assert(Math.abs(share - q) < 0.05, "доля дошедших не та: " + share);
      assert(days.every((d) => d > 0), "земля 2 не открылась за " + worstMax + " дней: " + days.join(", "));
      assert(med <= medMax, `медиана ${med} дня больше ${medMax}: ${days.join(", ")}`);
    });
  }

  test("Перенос 3: луч, после которого остаток босса не добить (56 − 54 = 2), не действует; «Останется 2 — такого луча нет»", async ({ page }) => {
    const r = await run(page, () => {
      OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(4, 0); OT.setWave([56], { armored: [56] });
      OT.placeTower("A0", 6); OT.placeTower("B0", 9); OT.link("A0", "B0");              // 6 × 9 = 54, остаток 2 — произведения нет
      OT.startWave();
      let guard = 0;
      while (!OT.events().some((e) => e.type === "enemy_passed_beam") && guard++ < 4000) OT.step(0.05);
      OT.step(0.1);
      const out = { rem: OT.state().enemies[0].rem, ev: OT.events().find((e) => e.type === "enemy_passed_beam"), notes: OT.drawn().notes.map((n) => n.text), blink: OT.state().beams[0].blink,
        hits: OT.events().filter((e) => e.type === "boss_hit").length };
      OT.runWave();
      out.castle = OT.events().filter((e) => e.type === "enemy_reached_castle").length;
      return out;
    });
    eq(r.rem, 56, "остаток босса не изменился");
    eq([r.ev.product, r.ev.rem, r.ev.dead, r.ev.left], [54, 56, true, 2]);
    assert(r.notes.includes("Останется 2 — такого луча нет"), "нет надписи над боссом: " + JSON.stringify(r.notes));
    eq(r.blink, true, "луч мигает серым");
    eq(r.hits, 0, "boss_hit не было");
    eq(r.castle, 1, "без другого луча босс дошёл");
  });

  test("Перенос 3: 56 против 7 × 5 даёт 21 как раньше; остаток, который есть в таблице (56 − 48 = 8 = 2 × 4), тоже режется; после 21 побеждает 7 × 3", async ({ page }) => {
    const r = await run(page, () => {
      OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(4, 0); OT.setWave([56], { armored: [56] });
      OT.placeTower("A0", 7); OT.placeTower("B0", 5); OT.link("A0", "B0");
      OT.placeTower("A1", 7); OT.placeTower("B1", 3); OT.link("A1", "B1");
      OT.startWave(); OT.runWave();
      const a = { ev: OT.events().filter((e) => e.type === "boss_hit").map((e) => [e.from, e.to, e.product]), killed: OT.events().some((e) => e.type === "enemy_killed"), passed: OT.events().filter((e) => e.type === "enemy_passed_beam").length };
      OT.newGame({ veteran: true }); OT.loadLevel(4, 0); OT.setWave([56], { armored: [56] });
      OT.placeTower("A0", 6); OT.placeTower("B0", 8); OT.link("A0", "B0");              // 48, остаток 8 = 2 × 4
      OT.placeTower("A1", 2); OT.placeTower("B1", 4); OT.link("A1", "B1");              // 8
      OT.startWave(); OT.runWave();
      const b = { ev: OT.events().filter((e) => e.type === "boss_hit").map((e) => [e.from, e.to, e.product]), killed: OT.events().some((e) => e.type === "enemy_killed"), passed: OT.events().filter((e) => e.type === "enemy_passed_beam").length };
      return { a, b };
    });
    eq(r.a.ev, [[56, 21, 35]]); eq(r.a.killed, true); eq(r.a.passed, 0);
    eq(r.b.ev, [[56, 8, 48]]); eq(r.b.killed, true); eq(r.b.passed, 0);
  });

  test("Перенос 3: ни одна волна с боссом на землях 4 и 6 не планируется через недобиваемый остаток (Solver и бой одинаковы)", async ({ page }) => {
    const r = await run(page, () => {
      OT.manual(true); OT.newGame({ veteran: true });
      const bad = [];
      let n = 0;
      for (const land of [4, 6]) for (let idx = 0; idx < 5; idx++) for (let w = 0; w < 3; w++) for (const seed of [1, 2, 3, 4]) {
        const wave = OT.waveFor(land, idx, w, seed);
        const arm = wave.enemies.filter((e) => e.armored);
        if (!arm.length) continue;
        n++;
        const hand = OT.lands()[land - 1].hand;
        const prods = new Set(); for (const x of hand) for (const y of hand) prods.add(x * y);
        // Каждая часть плана для босса: после неё остаток либо 0, либо произведение руки.
        for (const e of arm) {
          const parts = OT.split(e.card) || [e.number];
          let rem = e.number;
          for (const p of parts) { rem -= p; if (rem !== 0 && !prods.has(rem)) bad.push([land, idx, w, seed, e.number, p, rem]); }
        }
      }
      return { n, bad };
    });
    assert(r.n > 20, "волн с боссами слишком мало: " + r.n);
    eq(r.bad, [], "части разрезания приводят к недобиваемому остатку");
  });

  test("Перенос 4: у ворот висит верное равенство «12 = 3 × 4» ~2 с, в событии enemy_reached_castle есть example; пара — из карточки врага", async ({ page }) => {
    const r = await run(page, () => {
      OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(1, 0);
      OT.setWave([12, 56, 20], { cards: { 12: "m:3x4", 56: "m:7x8", 20: "m:4x5" } });
      OT.startWave();
      let guard = 0;
      while (!OT.events().some((e) => e.type === "enemy_reached_castle") && guard++ < 6000) OT.step(0.05);
      const out = { ev: OT.events().filter((e) => e.type === "enemy_reached_castle").map((e) => [e.number, e.example]), notes: OT.drawn().notes.filter((n) => n.gate).map((n) => n.text), hearts: OT.state().hearts };
      OT.step(1.5);
      out.later = OT.drawn().notes.filter((n) => n.gate).map((n) => n.text);
      OT.step(1.5);
      out.gone = OT.drawn().notes.filter((n) => n.gate).length;
      OT.runWave();
      out.all = OT.events().filter((e) => e.type === "enemy_reached_castle").map((e) => e.example);
      return out;
    });
    eq(r.ev[0], [12, "12 = 3 × 4"]);
    eq(r.notes, ["12 = 3 × 4"], "надпись у ворот в drawn().notes");
    eq(r.hearts, 9, "сердце снято как раньше");
    assert(r.later.includes("12 = 3 × 4"), "через 1,5 с надпись ещё висит");
    assert(r.all.includes("56 = 7 × 8") && r.all.includes("20 = 4 × 5"), "примеры остальных: " + JSON.stringify(r.all));
  });

  test("Перенос 4: у ворот только утверждение — ни вопросительного знака, ни «неверно»; на земле деления «56 : 7 = 8»; надпись не закрывает цифру башни", async ({ page }) => {
    const r = await run(page, () => {
      OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(5, 0);
      OT.startWave();
      let guard = 0;
      while (!OT.events().some((e) => e.type === "enemy_reached_castle") && guard++ < 6000) OT.step(0.05);
      const ev = OT.events().filter((e) => e.type === "enemy_reached_castle");
      const st = OT.state(), dr = OT.drawn();
      const g = dr.notes.filter((n) => n.gate);
      const hit = [];
      for (const gn of g) for (const p of st.pads) if (p.digit != null) {
        const dx = Math.max(gn.x - p.x, 0, p.x - (gn.x + gn.w)), dy = Math.max(gn.y - p.y, 0, p.y - (gn.y + gn.h));
        if (Math.hypot(dx, dy) < 36) hit.push(p.id);
      }
      return { ex: ev.map((e) => e.example), g: g.map((n) => n.text), hit, inField: g.every((n) => n.x >= 0 && n.x + n.w <= 1600 && n.y >= 100 && n.y + n.h <= 800) };
    });
    assert(r.ex.length >= 1 && r.ex.every((t) => /^\d+ : \d+ = \d+$/.test(t)), "пример деления: " + JSON.stringify(r.ex));
    assert(r.g.every((t) => !/[?]|неверн|ошиб/i.test(t)), "у ворот не должно быть вопроса: " + JSON.stringify(r.g));
    eq(r.hit, [], "надпись закрывает цифру башни");
    eq(r.inField, true);
  });

  test("Перенос 5: в подготовке без касаний кадры почти не рисуются (счётчик OT.frames), касание и мутация через OT будят рисование", async ({ page }) => {
    await run(page, () => { OT.seed(1); OT.newGame({ veteran: true }); OT.manual(true); OT.loadLevel(1, 0); OT.setWave([12, 12]); OT.placeTower("A0", 3); OT.placeTower("B0", 4); OT.link("A0", "B0"); OT.manual(false); });
    await page.waitForTimeout(300);
    const f0 = await run(page, () => OT.frames());
    await page.waitForTimeout(2000);
    const f1 = await run(page, () => OT.frames());
    assert(f1 - f0 <= 3, `в подготовке за 2 с нарисовано ${f1 - f0} кадров (60 fps дали бы 120)`);
    // Касание пальцем по пустому полю будит рисование.
    const box = await run(page, () => { const r = document.getElementById("field").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.mouse.move(box.x + box.w * 0.3, box.y + box.h * 0.9);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(200);
    const f2 = await run(page, () => OT.frames());
    assert(f2 > f1, "касание не вызвало кадр");
    // drawn() принудительно рисует кадр.
    const f3 = await run(page, () => { const a = OT.frames(); OT.drawn(); return OT.frames() - a; });
    assert(f3 >= 1, "drawn() не нарисовал кадр");
    // Бой: рисуется каждый кадр.
    await run(page, () => OT.startWave());
    const b0 = await run(page, () => OT.frames());
    await page.waitForTimeout(1000);
    const b1 = await run(page, () => OT.frames());
    assert(b1 - b0 >= 25, `в бою за секунду нарисовано только ${b1 - b0} кадров`);
  });

  test("Перенос 5: фон лежит в кэше и пересобирается при смене уровня и окна: центры площадок не травяные на всех шаблонах, дорога под ногами", async ({ page }) => {
    const sample = (w, h) => page.evaluate(() => {
      const out = [];
      for (const [land, idx] of [[1, 0], [1, 1], [1, 2], [1, 4], [5, 0]]) {
        OT.manual(true); OT.newGame({ veteran: true }); OT.loadLevel(land, idx);
        const cv = document.getElementById("field"), k = cv.width / 1600, c = cv.getContext("2d"), st = OT.state();
        const px = (x, y) => Array.from(c.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data);
        const green = (p) => p[1] > p[0] + 25 && p[1] > p[2] + 40;
        // площадка без башни — серый камень; у земли 5 башни стоят, поэтому берём точку на краю площадки (кольцо камня шире башни)
        const padsOk = st.pads.every((p) => { const q = px(p.x + 46, p.y); return !green(q); });
        const ln = st.lanes[0], mid = ln.points[Math.floor(ln.points.length / 2)], onRoad = px(mid[0], mid[1]);
        out.push({ land, idx, tpl: st.template, padsOk, roadOk: !green(onRoad) && onRoad[0] > 180, w: cv.width });
      }
      return out;
    });
    const a = await sample();
    for (const s of a) assert(s.padsOk && s.roadOk, "фон шаблона " + s.tpl + " нарисован неверно: " + JSON.stringify(s));
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(200);
    const b = await sample();
    for (const s of b) assert(s.padsOk && s.roadOk, "после смены окна фон " + s.tpl + " нарисован неверно: " + JSON.stringify(s));
    assert(b[0].w > a[0].w, "холст не вырос вместе с окном: " + a[0].w + " → " + b[0].w);
  });
}

// Бот по дням: земля 1, 5 уровней в день, доля q лучей с чужой цифрой. Возвращает день, когда открылась земля 2, и долю врагов, дошедших до крепости.
export async function simulate(page, q, maxDays, seed) {
  return page.evaluate(([q, maxDays, seed]) => {
    OT.manual(true); OT.setSetting("speed", "fast"); OT.seed(seed); OT.newGame({ veteran: false });
    const rnd = S.rng(seed + 1), start = "2026-03-02";
    let spawned = 0, castle = 0, day = 0, startIdx = 0;
    for (let d = 1; d <= maxDays; d++) {
      const r = S.day(S.add(start, d - 1), 1, q, rnd, 5, startIdx);
      if (r.stop) throw new Error("день " + d + ": " + r.stop);
      spawned += r.spawned; castle += r.castle; startIdx += 5;
      if (r.unlocked.includes(2)) { day = d; break; }
    }
    const cards = OT.state().cards, ks = OT.lands()[0].cards;
    return { day, share: castle / Math.max(1, spawned), spawned, castle, box3: ks.filter((k) => cards[k] && cards[k].b >= 3).length, total: ks.length };
  }, [q, maxDays, seed]);
}
