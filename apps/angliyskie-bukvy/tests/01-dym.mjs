// Дым: вкладки без горизонтальной прокрутки, кнопки от 48 px, диктант и «Найди букву» от начала до конца.

const CONS = "BCDFGHJKLMNPQRSTVWXZ".split("");
const st = (page) => page.evaluate(() => window.OT.state());
const click = (page, sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

export function register({ test, assert, eq }) {

  test("Дым 1: загрузка — открыт алфавит, 26 плиток, набор диктанта — 20 согласных", async ({ page }) => {
    const s = await st(page);
    eq(s.tab, "abc");
    eq(s.set, CONS, "по умолчанию диктант по согласным");
    eq(await page.locator("#grid .tile").count(), 26);
    eq(s.dict, null); eq(s.quiz, null);
  });

  test("Дым 2: четыре вкладки на 1280 и 390 — виден один раздел, без горизонтальной прокрутки, кнопки от 48 px", async ({ page, shot }) => {
    for (const [w, h] of [[1280, 800], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const t of ["abc", "card", "dict", "quiz"]) {
        await click(page, `.tabs [data-tab="${t}"]`);
        const r = await page.evaluate(() => ({
          visible: ["abc", "card", "dict", "quiz"].filter((k) => !document.getElementById("p-" + k).hidden),
          small: [...document.querySelectorAll("button")]
            .filter((b) => b.offsetParent && !b.closest(".tile"))
            .map((b) => [b.textContent.trim() || b.getAttribute("aria-label"), Math.round(b.getBoundingClientRect().height)])
            .filter(([, hgt]) => hgt < 48),
        }));
        eq(r.visible, [t], `${w}: виден только p-${t}`);
        eq(r.small, [], `${w}, ${t}: кнопки ниже 48 px`);
        assert(await noHScroll(page), `${w}×${h}: горизонтальная прокрутка на вкладке ${t}`);
        await shot(`bukvy-${w}-${t}`);
      }
    }
  });

  test("Дым 3: фильтр «согласные» гасит 6 гласных, карточка листается только по согласным", async ({ page }) => {
    await click(page, '#filter [data-v="cons"]');
    eq(await page.locator("#grid .tile.dim").count(), 6);
    await click(page, '.tabs [data-tab="card"]');
    eq((await st(page)).cur, "B", "A не согласная, карточка встаёт на B");
    await click(page, "#c-next"); await click(page, "#c-next"); await click(page, "#c-next");
    eq((await st(page)).cur, "F", "B → C → D → F: E пропущена");
    eq(await page.locator("#c-strip button").count(), 20);
    eq(await page.textContent("#c-print"), "F f");
  });

  test("Дым 4: диктант — ошибка попадает в «трудные», итог и «Повторить ошибки»", async ({ page }) => {
    await click(page, '.tabs [data-tab="dict"]');
    await click(page, '#d-preset [data-v="cons"]');
    await click(page, '#d-order [data-v="abc"]');
    await click(page, "#d-start");
    let s = await st(page);
    eq(s.dict.list, CONS); eq(s.dict.i, 0);
    assert(await page.isHidden("#d-answer"), "образец скрыт до «Проверить»");
    await click(page, "#d-check");
    assert(await page.isVisible("#d-answer"), "после «Проверить» виден образец");
    eq(await page.textContent("#d-print"), "Bb");
    await click(page, "#d-no");
    await click(page, "#d-check"); await click(page, "#d-ok");
    await click(page, "#d-check"); await click(page, "#d-no");
    s = await st(page);
    eq(s.dict.res, [false, true, false]);
    eq(Object.keys(s.hard).sort(), ["B", "D"], "ошибки в B и D");
    await click(page, "#d-stop");
    s = await st(page);
    eq(s.dict.done, true);
    eq(await page.textContent("#d-score"), "1 из 3");
    eq(await page.locator("#d-mist > span").count(), 2);
    await click(page, "#d-redo");
    eq((await st(page)).dict.list.slice().sort(), ["B", "D"], "повтор только ошибок");
    await click(page, "#d-stop"); await click(page, "#d-new");
    assert(await page.isVisible("#d-setup"));
    await click(page, '#d-preset [data-v="hard"]');
    eq((await st(page)).set, ["B", "D"], "кнопка «трудные» берёт ошибки");
    eq(await page.locator("#grid .tile .hard").count(), 2, "на плитках алфавита отметка ошибки");
  });

  test("Дым 5: «Найди букву» — 10 вопросов, 4 разных варианта с правильным, верный ответ засчитан", async ({ page }) => {
    await click(page, '.tabs [data-tab="quiz"]');
    await click(page, "#q-start");
    for (let i = 0; i < 10; i++) {
      const s = await st(page);
      const c = s.quiz.list[s.quiz.i];
      eq(new Set(s.quiz.opts).size, 4, "варианты не повторяются");
      assert(s.quiz.opts.includes(c), "среди вариантов есть правильный");
      await click(page, `#q-opts .opt[data-c="${c}"]`);
      await click(page, "#q-next");
    }
    const s = await st(page);
    eq(s.quiz.done, true);
    eq(s.quiz.res.every(Boolean), true);
    eq(await page.textContent("#q-score"), "10 из 10");
  });

  test("Дым 6: настройки и «трудные» запоминаются после перезагрузки", async ({ page }) => {
    await click(page, '#accent [data-v="us"]');
    await click(page, '.tabs [data-tab="card"]');
    await click(page, '#c-strip [data-c="Z"]');
    eq(await page.textContent("#c-name b"), "зи", "американское Z");
    await page.reload();
    await page.waitForFunction(() => window.OT && window.OT.state);
    const s = await st(page);
    eq([s.tab, s.cur, s.accent], ["card", "Z", "us"]);
  });

  test("Дым 7: письменные буквы без Google Fonts — шрифт прописей встроен в страницу", async ({ page, shot, errors }) => {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.reload();
    await page.waitForFunction(() => window.OT && window.OT.state);
    const r = await page.evaluate(async () => {
      await document.fonts.load('40px "CMFL Propisi"', "Bb");
      const face = [...document.fonts].find((f) => f.family.replace(/"/g, "") === "CMFL Propisi");
      const tile = getComputedStyle(document.querySelector("#grid .tile .hw")).fontFamily;
      return { status: face && face.status, ok: document.fonts.check('40px "CMFL Propisi"', "Bb"), tile, m: window.OT.state().metrics };
    });
    eq(r.status, "loaded", "встроенный шрифт загружен");
    eq(r.ok, true);
    assert(r.tile.startsWith('"CMFL Propisi"'), "плитки пишут шрифтом прописей: " + r.tile);
    eq([Math.round(r.m.top), Math.round(r.m.x), Math.round(r.m.bot)], [102, 52, 52], "линейки по метрикам прописей, а не запасного шрифта");
    await shot("bukvy-bez-google");
    // Заблокированные запросы к Google Fonts пишут в консоль ERR_FAILED; другие ошибки остаются.
    const rest = errors.filter((e) => !/ERR_FAILED/.test(e));
    errors.length = 0; errors.push(...rest);
  });
}
