// Этап 1 («прототип»): П1 (T1), П2, П3, П6а, П6б, Д1, Д2 плюс задел П4 (броня) и проверка настоящих касаний.
// Проверки общаются с игрой только через window.OT и DOM-id. Каждая начинается с manual(true), seed(1), newGame, loadLevel(1,0).

const SETUP = () => { OT.manual(true); OT.seed(1); OT.newGame(); OT.loadLevel(1, 0); };

// Вызывает функцию в странице; аргумент и результат — JSON.
const run = (page, fn, arg) => page.evaluate(fn, arg);

// Проверка подписей: по одной записи на каждый луч, текст «a × b = c», рамка внутри поля, подписи не налезают друг на друга.
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
    return bad;
  });
}

// Шагаем по 0.1 с, пока в журнале не появится событие нужного типа (или не кончится лимит).
const stepUntilEvent = (page, type, maxSec = 120) => run(page, ({ type, maxSec }) => {
  for (let t = 0; t < maxSec; t += 0.1) { OT.step(0.1); if (OT.events().some((e) => e.type === type)) return true; }
  return false;
}, { type, maxSec });

export function register({ test, assert, eq }) {

  test("П1 T1: над каждым лучом подпись «a × b = c» во всех фазах", async ({ page }) => {
    await run(page, SETUP);
    // Все возможные лучи на T1, в том числе два от одной башни и диагонали.
    const made = await run(page, () => {
      OT.setWave([56, 24, 42, 12]);
      const digits = { A0: 2, B0: 3, A1: 4, B1: 5, A2: 6, B2: 7 };
      for (const [p, d] of Object.entries(digits)) OT.placeTower(p, d);
      const adj = OT.state().adj, made = [];
      for (const a of Object.keys(adj)) for (const b of adj[a]) if (a < b) { const r = OT.link(a, b); if (r.ok) made.push(a + "-" + b); }
      return made;
    });
    assert(made.length >= 5, "ожидали минимум 5 лучей на T1, построено " + made.length + ": " + made.join(" "));
    await run(page, () => OT.step(0.1));
    eq(await labelsProblems(page), [], "подготовка");
    // Смена цифры башни тут же меняет подпись.
    const changed = await run(page, () => {
      OT.placeTower("A0", 9);
      const st = OT.state(), dr = OT.drawn();
      return st.beams.filter((b) => b.a === "A0" || b.b === "A0").map((b) => ({ label: b.label, drawn: dr.labels.find((l) => l.beamId === b.id).text, mine: b.a === "A0" ? b.da : b.db }));
    });
    assert(changed.length > 0, "у A0 нет лучей");
    for (const c of changed) { assert(c.mine === 9, "цифра башни не обновилась"); eq(c.drawn, c.label, "подпись после смены цифры"); assert(/9/.test(c.drawn), "в подписи нет 9: " + c.drawn); }
    eq(await labelsProblems(page), [], "после смены цифры");
    // Бой, пауза, серое мигание.
    await run(page, () => { OT.startWave(); OT.step(0.1); });
    eq(await run(page, () => OT.state().phase), "battle");
    eq(await labelsProblems(page), [], "бой");
    await run(page, () => { OT.pause(); OT.step(0.1); });
    eq(await run(page, () => OT.state().phase), "paused");
    eq(await labelsProblems(page), [], "пауза");
    await run(page, () => OT.resume());
    assert(await stepUntilEvent(page, "enemy_passed_beam"), "ни один враг не прошёл сквозь луч");
    const blinking = await run(page, () => { OT.step(0.1); return OT.state().beams.some((b) => b.blink); });
    assert(blinking, "нет серого мигания луча");
    eq(await labelsProblems(page), [], "серое мигание");
  });

  test("П1 T1: подписи не налезают друг на друга (два луча от башни, диагонали)", async ({ page }) => {
    const cases = [
      ["два луча от одной башни, обе диагонали", [["A1", 7], ["B0", 8], ["B2", 6]], [["A1", "B0"], ["A1", "B2"]]],
      ["прямой и диагональный из одной башни", [["A1", 7], ["B1", 8], ["B0", 6]], [["A1", "B1"], ["A1", "B0"]]],
      ["крест из двух диагоналей", [["A0", 3], ["B1", 4], ["A1", 5], ["B0", 6]], [["A0", "B1"], ["A1", "B0"]]],
      ["три прямых луча", [["A0", 2], ["B0", 9], ["A1", 3], ["B1", 8], ["A2", 4], ["B2", 7]], [["A0", "B0"], ["A1", "B1"], ["A2", "B2"]]],
    ];
    for (const [name, towers, links] of cases) {
      await run(page, SETUP);
      const oks = await run(page, ({ towers, links }) => {
        for (const [p, d] of towers) OT.placeTower(p, d);
        return links.map(([a, b]) => OT.link(a, b).ok);
      }, { towers, links });
      assert(oks.every(Boolean), name + ": не все лучи построились");
      eq(await labelsProblems(page), [], name);
    }
  });

  test("П1 T1: «10» и подпись самой длинной строки помещаются в поле", async ({ page }) => {
    await run(page, SETUP);
    await run(page, () => { OT.placeTower("A0", 10); OT.placeTower("B0", 10); OT.link("A0", "B0"); OT.placeTower("A2", 9); OT.placeTower("B1", 10); OT.link("A2", "B1"); });
    eq(await labelsProblems(page), []);
    eq(await run(page, () => OT.drawn().labels.map((l) => l.text)), ["10 × 10 = 100", "9 × 10 = 90"]);
  });

  test("П2: 56 проходит сквозь 6 × 7 и исчезает в 7 × 8 и в 8 × 7", async ({ page }) => {
    for (const [d1, d2] of [[7, 8], [8, 7]]) {
      await run(page, SETUP);
      await run(page, ({ d1, d2 }) => {
        OT.setWave([56]);
        OT.placeTower("A0", 6); OT.placeTower("B0", 7); OT.link("A0", "B0");
        OT.placeTower("A2", d1); OT.placeTower("B2", d2); OT.link("A2", "B2");
        OT.startWave();
      }, { d1, d2 });
      assert(await stepUntilEvent(page, "enemy_passed_beam"), "враг не дошёл до первого луча");
      await run(page, () => OT.step(0.1));
      const notes = await run(page, () => OT.drawn().notes.map((n) => n.text));
      assert(notes.includes("56, а луч даёт 42"), "нет надписи «56, а луч даёт 42»: " + JSON.stringify(notes));
      const st = await run(page, () => OT.runWave());
      const ev = await run(page, () => OT.events());
      const types = ev.map((e) => e.type);
      const ip = ev.findIndex((e) => e.type === "enemy_passed_beam"), ik = ev.findIndex((e) => e.type === "enemy_killed");
      assert(ip >= 0 && ik > ip, "порядок событий: " + types.join(","));
      eq([ev[ip].number, ev[ip].product], [56, 42]);
      eq([ev[ik].number, ev[ik].beam.product], [56, 56]);
      assert(!types.includes("enemy_reached_castle"), "враг дошёл до крепости");
      eq(st.hearts, 10, "сердца");
      eq(st.beams.find((b) => b.a === "A2").label, `${d1} × ${d2} = 56`, "подпись луча");
    }
  });

  test("П3: 24 исчезает и в 3 × 8, и в 4 × 6", async ({ page }) => {
    for (const [x, y] of [[3, 8], [4, 6]]) {
      await run(page, SETUP);
      const st = await run(page, ({ x, y }) => {
        OT.setWave([24]);
        OT.placeTower("A1", x); OT.placeTower("B1", y); OT.link("A1", "B1");
        OT.startWave();
        return OT.runWave();
      }, { x, y });
      const ev = await run(page, () => OT.events());
      const k = ev.find((e) => e.type === "enemy_killed");
      assert(k && k.number === 24 && k.beam.product === 24, `луч ${x} × ${y}: враг 24 не побеждён`);
      eq(st.hearts, 10, "сердца");
    }
  });

  test("П4 (задел): железный 56 теряет 35, затем 21, луч больше остатка не вредит", async ({ page }) => {
    await run(page, SETUP);
    await run(page, () => {
      OT.setWave([56], { armored: [56] });
      OT.placeTower("B0", 5); OT.placeTower("A1", 7); OT.placeTower("B1", 3);
      OT.link("B0", "A1"); OT.link("A1", "B1");          // цепочка 5 × 7 = 35, потом 7 × 3 = 21
      OT.startWave();
    });
    assert(await stepUntilEvent(page, "boss_hit"), "нет boss_hit");
    await run(page, () => OT.step(0.1));
    const mid = await run(page, () => ({ hit: OT.events().find((e) => e.type === "boss_hit"), rem: OT.state().enemies[0].rem, notes: OT.drawn().notes.map((n) => n.text) }));
    eq([mid.hit.from, mid.hit.to, mid.hit.product], [56, 21, 35]);
    eq(mid.rem, 21);
    assert(mid.notes.includes("56 − 35 = 21"), "нет записи «56 − 35 = 21»: " + JSON.stringify(mid.notes));
    await run(page, () => OT.runWave());
    const ev = await run(page, () => OT.events());
    assert(ev.some((e) => e.type === "enemy_killed" && e.number === 56 && e.beam.product === 21), "босс не побеждён лучом 7 × 3");
    // Луч сильнее остатка: босс идёт дальше невредимым.
    await run(page, SETUP);
    const st = await run(page, () => {
      OT.setWave([56], { armored: [56] });
      OT.placeTower("A0", 8); OT.placeTower("B0", 10); OT.link("A0", "B0");
      OT.startWave();
      return OT.runWave();
    });
    eq(st.enemies[0].rem, 56, "остаток не должен меняться");
    eq(st.hearts, 9, "босс дошёл до крепости");
  });

  test("П6а: в подготовке нет таймера, враги не выходят сами", async ({ page }) => {
    await run(page, () => { OT.seed(1); OT.newGame(); OT.loadLevel(1, 0); });   // без manual: цикл rAF работает как у игрока
    await page.waitForTimeout(3000);
    const st = await run(page, () => OT.step(600));
    eq(st.phase, "prep");
    eq(st.enemies.length, 0, "врагов в подготовке");
    assert(!(await run(page, () => OT.events())).some((e) => e.type === "wave_start"), "wave_start в подготовке");
    const dom = await run(page, () => ({
      timers: document.querySelectorAll("[data-timer], progress, meter").length,
      text: document.getElementById("stage").innerText,
      fight: !!document.getElementById("btn-fight").offsetParent,
    }));
    eq(dom.timers, 0, "элементы-таймеры");
    assert(!/сек|\d+\s*:\s*\d{2}/.test(dom.text), "в тексте экрана похоже на отсчёт: " + JSON.stringify(dom.text));
    assert(dom.fight, "нет видимой кнопки «В бой!»");
  });

  test("П6б: пауза в любой момент, на паузе лучи перестраиваются", async ({ page }) => {
    // Ранняя (0,1 с, через OT), средняя (3 с, настоящий клик по #btn-pause) и поздняя (за 1 с до последнего луча).
    for (const mode of ["early", "mid", "late"]) {
      await run(page, SETUP);
      const lane = mode === "late" ? "A2-B2" : "A0-B0";
      await run(page, ({ mode }) => {
        OT.setWave([56]);
        OT.placeTower("A0", 6); OT.placeTower("B0", 7); OT.link("A0", "B0");        // неверный луч 42 (на дорожке d = 480)
        if (mode === "late") { OT.placeTower("A2", 6); OT.placeTower("B2", 7); OT.link("A2", "B2"); }   // и ещё один у ворот (d = 1080)
        OT.startWave();
        if (mode === "early") OT.step(0.1);
        else if (mode === "mid") OT.step(3);
        else for (let i = 0; i < 400; i++) { OT.step(0.1); const e = OT.state().enemies[0]; if (e && e.d >= 1080 - 45) break; }
      }, { mode });
      if (mode === "mid") {
        await page.click("#btn-pause");
        assert(await page.isVisible("#btn-resume"), "после паузы нет #btn-resume");
      } else await run(page, () => OT.pause());
      const before = await run(page, () => OT.state());
      eq(before.phase, "paused", mode);
      assert(before.enemies.length === 1 && before.enemies[0].alive, mode + ": враг должен быть жив");
      if (mode === "late") assert(before.enemies[0].d >= 1080 - 46 && before.enemies[0].d < 1080, "поздняя пауза не там: d=" + before.enemies[0].d);
      const after = await run(page, () => OT.step(10));
      eq(after.enemies.map((e) => e.d), before.enemies.map((e) => e.d), mode + ": враги сдвинулись на паузе");
      // Перестройка на паузе: разорвать, поменять цифры, построить заново.
      const [a, b] = lane.split("-");
      const rb = await run(page, ({ a, b }) => [OT.unlink(a, b), OT.placeTower(a, 7), OT.placeTower(b, 8), OT.link(a, b)], { a, b });
      assert(rb.every((r) => r.ok), mode + ": перестройка на паузе не удалась " + JSON.stringify(rb));
      const nb = await run(page, ({ a, b }) => OT.state().beams.find((m) => m.a === a && m.b === b), { a, b });
      eq(nb.born, "pause", mode + ": born нового луча");
      eq(nb.label, "7 × 8 = 56");
      if (mode === "mid") { await page.click("#btn-resume"); eq(await run(page, () => OT.state().phase), "battle"); }
      else await run(page, () => OT.resume());
      const fin = await run(page, () => OT.runWave());
      const ev = await run(page, () => OT.events());
      const k = ev.find((e) => e.type === "enemy_killed");
      assert(k && k.beam.product === 56 && k.beam.a === a, mode + ": враг не побит новым лучом: " + JSON.stringify(ev.map((e) => e.type)));
      eq(fin.hearts, 10, mode + ": сердца");
    }
  });

  test("Д1: радиус ловли площадки 40 CSS px", async ({ page }) => {
    await run(page, SETUP);
    const r = await run(page, () => {
      const s = Math.min(innerWidth / 1600, innerHeight / 900), pad = OT.state().pads.find((p) => p.id === "A1"), edge = 48 + 40 / s;
      const out = {};
      out.far = OT.dropDigit(7, pad.x + edge + 4, pad.y);
      out.near = OT.dropDigit(7, pad.x + edge - 2, pad.y);
      out.digitAfter = OT.state().pads.find((p) => p.id === "A1").digit;
      out.vertical = OT.dropDigit(8, pad.x, pad.y + edge - 2);
      out.badDigit = OT.dropDigit(11, pad.x, pad.y);
      out.nowhere = OT.dropDigit(7, 800, 450);
      OT.startWave();
      out.inBattle = OT.dropDigit(7, pad.x, pad.y);
      out.edge = edge; out.s = s;
      return out;
    });
    eq(r.far, { ok: false, reason: "no_pad" }, "за границей радиуса");
    assert(r.near.ok && r.near.pad === "A1", "в пределах радиуса: " + JSON.stringify(r.near));
    eq(r.digitAfter, 7);
    assert(r.vertical.ok, "вертикаль в пределах радиуса");
    eq(r.badDigit.reason, "digit");
    eq(r.nowhere.reason, "no_pad");
    eq(r.inBattle.reason, "phase");
  });

  test("Д2: у башни не больше двух лучей", async ({ page }) => {
    await run(page, SETUP);
    const r = await run(page, () => {
      for (const [p, d] of [["A1", 4], ["B0", 5], ["B1", 6], ["B2", 7], ["A0", 3], ["A2", 2]]) OT.placeTower(p, d);
      const out = {};
      out.l1 = OT.link("A1", "B0"); out.l2 = OT.link("A1", "B1");
      out.third = OT.link("A1", "B2");                           // третий луч у A1
      out.beams = OT.state().beams.length;
      out.fromOther = OT.link("B2", "A1");                       // и с другой стороны
      out.dup = OT.link("B0", "A1");                             // тот же луч второй раз
      out.b1 = OT.link("A0", "B1");                              // у B1 теперь два луча (A1 и A0)
      out.b1third = OT.link("A2", "B1");                         // третий луч у B1
      out.sameSide = OT.link("B1", "B2");                        // B1–B2 не соседи
      OT.unlink("A1", "B0");
      out.afterUnlink = OT.link("A1", "B2");                     // место освободилось
      return out;
    });
    assert(r.l1.ok && r.l2.ok, "два первых луча должны строиться");
    eq(r.third, { ok: false, reason: "max_beams" });
    eq(r.beams, 2, "лучей после третьей попытки");
    eq(r.fromOther.reason, "max_beams");
    eq(r.dup.reason, "occupied");
    assert(r.b1.ok, "у B1 был один луч, второй должен строиться: " + JSON.stringify(r.b1));
    eq(r.b1third.reason, "max_beams", "третий луч у B1");
    eq(r.sameSide.reason, "not_adjacent");
    assert(r.afterUnlink.ok, "после разрыва луч снова строится");
  });

  test("Ввод: тап по цифре и площадке, перетаскивание, луч двумя тапами, ✕, автопауза", async ({ page }) => {
    await run(page, SETUP);
    const at = (x, y) => run(page, ({ x, y }) => OT.toScreen(x, y), { x, y });
    const click = async (x, y) => { const p = await at(x, y); await page.mouse.click(p.x, p.y); };
    const digitBtn = (d) => page.locator(`#hand [data-digit="${d}"]`);
    const digits = () => run(page, () => Object.fromEntries(OT.state().pads.map((p) => [p.id, p.digit])));
    // тап по цифре, потом тап по площадке
    await digitBtn(7).click();
    await click(420, 280);
    eq((await digits()).A0, 7, "тап цифры и площадки");
    // перетаскивание цифры из руки на площадку
    const bb = await digitBtn(8).boundingBox(), to = await at(420, 620);
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.down(); await page.mouse.move(to.x - 30, to.y - 30, { steps: 6 }); await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up();
    eq((await digits()).B0, 8, "перетаскивание цифры");
    // два тапа по башням — луч, третий и четвёртый — разрыв
    await click(420, 280); await click(420, 620);
    eq(await run(page, () => OT.state().beams.map((b) => b.label)), ["7 × 8 = 56"], "луч двумя тапами");
    // тап по подписи показывает ✕, тап по ✕ рвёт луч
    const lab = await run(page, () => OT.drawn().labels[0]);
    await click(lab.x + lab.w / 2, lab.y + lab.h / 2);
    await click(lab.x + lab.w + 44, lab.y + lab.h / 2);
    eq(await run(page, () => OT.state().beams.length), 0, "✕ у подписи");
    // перенос башни перетаскиванием и уборка на руку
    const a0 = await at(420, 280), a1 = await at(720, 280);
    await page.mouse.move(a0.x, a0.y); await page.mouse.down(); await page.mouse.move(a1.x, a1.y, { steps: 8 }); await page.mouse.up();
    let d = await digits();
    eq([d.A0, d.A1], [null, 7], "перенос башни");
    const hand = await at(800, 850), a1b = await at(720, 280);
    await page.mouse.move(a1b.x, a1b.y); await page.mouse.down(); await page.mouse.move(hand.x, hand.y, { steps: 8 }); await page.mouse.up();
    d = await digits();
    eq(d.A1, null, "башня унесена на руку");
    // в бою касание руки ставит паузу
    await run(page, () => { OT.setWave([56]); OT.startWave(); OT.step(1); });
    await digitBtn(5).dispatchEvent("pointerdown", { pointerId: 1, isPrimary: true, button: 0 });
    eq(await run(page, () => OT.state().phase), "paused", "автопауза от руки");
  });

  test("Масштаб: 1024×600 и 1920×1080 без скролла, кнопки ≥ 48 CSS px, в портрете #rotate", async ({ page }) => {
    for (const [w, h] of [[1024, 600], [1920, 1080], [1280, 800]]) {
      await page.setViewportSize({ width: w, height: h });
      await run(page, SETUP);
      await run(page, () => { OT.setWave([56]); });
      const r = await run(page, () => {
        const box = (sel) => { const e = document.querySelector(sel), b = e.getBoundingClientRect(); return { w: b.width, h: b.height, vis: !!e.offsetParent }; };
        const hand = [...document.querySelectorAll("#hand [data-digit]")].map((e) => { const b = e.getBoundingClientRect(); return Math.min(b.width, b.height); });
        const out = { fight: box("#btn-fight"), hand, noScroll: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight };
        OT.placeTower("A0", 7); OT.placeTower("B0", 8); OT.link("A0", "B0"); OT.startWave(); OT.step(0.5);
        out.pause = box("#btn-pause"); OT.pause(); OT.step(0.1);
        out.resume = box("#btn-resume"); out.menu = [...document.querySelectorAll("#pause-menu .btn")].map((e) => e.getBoundingClientRect().height);
        out.canvas = document.getElementById("field").getBoundingClientRect().toJSON();
        out.rotate = !document.getElementById("rotate").hidden;
        return out;
      });
      assert(r.noScroll, `${w}×${h}: есть скролл`);
      assert(r.fight.vis && Math.min(r.fight.w, r.fight.h) >= 48, `${w}×${h}: «В бой!» ${JSON.stringify(r.fight)}`);
      assert(r.hand.length === 9 && r.hand.every((m) => m >= 48), `${w}×${h}: кнопки руки ${JSON.stringify(r.hand)}`);
      assert(r.pause.vis && Math.min(r.pause.w, r.pause.h) >= 48, `${w}×${h}: «Пауза» ${JSON.stringify(r.pause)}`);
      assert(r.resume.vis && r.menu.every((m) => m >= 48), `${w}×${h}: меню паузы ${JSON.stringify(r.menu)}`);
      eq(Math.round(r.canvas.width / r.canvas.height * 1000), Math.round(1600 / 900 * 1000), `${w}×${h}: пропорции поля`);
      assert(!r.rotate, `${w}×${h}: #rotate в горизонтали`);
    }
    await page.setViewportSize({ width: 600, height: 1024 });
    await page.waitForTimeout(100);
    assert(await page.isVisible("#rotate"), "в портрете нет #rotate");
  });
}
