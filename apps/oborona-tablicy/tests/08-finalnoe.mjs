// Финальное ревью: удержание шестерёнки пальцем открывает экран взрослого и отпускание не закрывает его
// (на месте шестерёнки теперь «Назад»); подсказка новичку на первом уровне. Общаются с игрой через window.OT и DOM-id.

const run = (page, fn, arg) => page.evaluate(fn, arg);

export function register({ test, assert, eq }) {
  test("Финал: удержание шестерёнки пальцем 2 с открывает «Для взрослого», отпускание пальца не нажимает «Назад»", async ({ page }) => {
    await run(page, () => { OT.manual(true); OT.newGame(); OT.show("map"); });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    const b = await page.locator("#btn-parent").boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2, pt = [{ x, y, id: 1 }];
    const hold = async (ms, at) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at || pt });
      await page.waitForTimeout(ms);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(250);
    };
    await hold(900);
    eq(await run(page, () => OT.state().screen), "map", "короткое удержание не открывает экран");
    await hold(2300);
    eq(await run(page, () => OT.state().screen), "parent", "после удержания и отпускания экран взрослого открыт");
    assert(await page.isVisible("#btn-parent-back"), "«Назад» на месте");
    // Новое касание «Назад» работает как обычно.
    const bb = await page.locator("#btn-parent-back").boundingBox();
    await hold(60, [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, id: 2 }]);
    eq(await run(page, () => OT.state().screen), "map", "касание «Назад» закрывает экран");
  });

  test("Финал: подсказка новичку на первом уровне — цифра на круг, луч, все числа, «В бой!»; после прохождения 1-1 её нет", async ({ page }) => {
    const r = await run(page, () => {
      OT.manual(true); OT.seed(1); OT.newGame(); OT.loadLevel(1, 0);
      const out = [OT.drawn().coach];
      const plan = OT.state().wave.plan;
      OT.placeTower(plan[0].a, plan[0].da); OT.placeTower(plan[0].b, plan[0].db);
      out.push(OT.drawn().coach);
      OT.link(plan[0].a, plan[0].b);
      out.push(OT.drawn().coach);
      for (const p of plan) { OT.placeTower(p.a, p.da); OT.placeTower(p.b, p.db); }
      for (const p of plan) OT.link(p.a, p.b);
      out.push(OT.drawn().coach);
      OT.startWave(); out.push(OT.drawn().coach);
      OT.runWave(); OT.finishLevel(); OT.loadLevel(1, 0);
      out.push(OT.drawn().coach);
      OT.loadLevel(1, 1, { ignoreLimit: true }); out.push(OT.drawn().coach);
      return out;
    });
    eq(r.slice(0, 4), ["Перетащи цифру снизу на серый круг", "Коснись башни, потом башни за дорогой — будет луч", r[2], "Лучи готовы — жми «В бой!»"], "шаги подсказки");
    assert(r[2] === "Нужен луч под каждое число сверху" || r[2] === "Лучи готовы — жми «В бой!»", "после первого луча: " + r[2]);
    eq(r.slice(4), ["", "", ""], "в бою, после прохождения 1-1 и на других уровнях подсказки нет");
    assert(!r.some((t) => t.includes("?")), "без вопросительных знаков");
  });
}
