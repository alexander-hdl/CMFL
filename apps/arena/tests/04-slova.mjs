// Слова: диктант с самопроверкой по буквам, Лейтнер слов, слова с ошибками не показываются, охота, семейка.
import { run, fresh, st, waitState, misspellings, dumpPage, found, TODAY, addDays } from "./_helpers.mjs";

const TEXT = (page) => run(page, () => document.getElementById("view-words").innerText);

export function register({ test, assert, eq }) {

  test("Слова 1: диктант — самопроверка по буквам, «Была ошибка» показывает слово заново, ящик 1 на сегодня", async ({ page }) => {
    await fresh(page);
    await run(page, () => OT.play("words", { items: ["d1", "c1", "s1"] }));
    await page.click("#w-check");
    const rev = await run(page, () => ({
      n: document.querySelectorAll(".reveal span").length,
      hot: [...document.querySelectorAll(".reveal span")].findIndex((s) => s.classList.contains("hot")),
      text: document.getElementById("view-words").innerText,
    }));
    eq([rev.n, rev.hot], [6, 1], "кОрова: шесть букв, жёлтая вторая");
    assert(rev.text.includes("в слове 6 букв"), "подпись про число букв");
    await page.click("#w-no");
    let s = await st(page);
    eq(s.ui.words.round.phase, "study", "после ошибки слово показывают ещё раз");
    eq([s.docs.words.prog.d1.b, s.docs.words.prog.d1.due], [1, TODAY], "ящик 1, повтор сегодня");
    await waitState(page, () => { const R = OT.state().ui.words.round; return R.phase === "listen" && R.retry === true; });
    assert((await TEXT(page)).includes("Посмотрел? Теперь напиши по памяти"), "после показа — писать по памяти");
    await page.click("#w-check"); await page.click("#w-ok");
    s = await st(page);
    eq([s.ui.words.round.i, s.docs.words.prog.d1.b], [1, 1], "повторный верный ответ ящик не меняет, идём к следующему слову");
    await page.click("#w-check"); await page.click("#w-ok");       // c1
    await page.click("#w-check"); await page.click("#w-ok");       // s1
    s = await st(page);
    eq(s.ui.words.round, null);
    eq([s.docs.words.sessions[0].n, s.docs.words.sessions[0].ok], [3, 2]);
    assert((await TEXT(page)).includes("кОрова".toLowerCase()), "итог: «Эти слова вернутся завтра» — верное написание");
  });

  test("Слова 2: Лейтнер слов без правила «раз в день», подбор pickWords — сначала то, что пора, новых не больше трёх", async ({ page }) => {
    await fresh(page);
    const r = await run(page, (today) => {
      const L = OT.fn.leitnerWord, out = {};
      let s = null; out.same = [];
      for (let i = 0; i < 3; i++) { s = L(s, true, today); out.same.push(s.b); }
      out.miss = L(s, false, today).b;
      const ids = OT.consts().STARTER.map((w) => w.id);
      const tomorrow = OT.fn.addDays(today, 1);
      // 4 слова в ящике 1 и 4 в ящике 2 пора повторить, 2 в ящике 4 тоже, остальные новые.
      const prog = {};
      ids.slice(0, 4).forEach((id) => { prog[id] = { b: 1, n: 1, ok: 0, due: today }; });
      ids.slice(4, 8).forEach((id) => { prog[id] = { b: 2, n: 1, ok: 1, due: today }; });
      ids.slice(8, 10).forEach((id) => { prog[id] = { b: 4, n: 1, ok: 1, due: today }; });
      OT.set("words", { prog });
      const bad = [];
      for (let seed = 1; seed <= 50; seed++) {
        OT.seed(seed);
        const got = OT.fn.pickWords().map((w) => w.id).sort();
        if (JSON.stringify(got) !== JSON.stringify(ids.slice(0, 8).sort())) bad.push([seed, got]);
      }
      // Мало «пора»: 3 слова пора, 6 не пора (завтра), остальные новые → 3 пора, ровно 3 новых, остальные из «не пора».
      const prog2 = {};
      ids.slice(0, 3).forEach((id) => { prog2[id] = { b: 2, n: 1, ok: 1, due: today }; });
      ids.slice(3, 9).forEach((id) => { prog2[id] = { b: 3, n: 1, ok: 1, due: tomorrow }; });
      OT.set("words", { prog: prog2 });
      const bad2 = [];
      for (let seed = 1; seed <= 50; seed++) {
        OT.seed(seed);
        const got = OT.fn.pickWords().map((w) => w.id);
        const nDue = got.filter((id) => ids.slice(0, 3).includes(id)).length, nNew = got.filter((id) => !prog2[id]).length;
        if (got.length !== 8 || nDue !== 3 || nNew !== 3 || new Set(got).size !== 8) bad2.push([seed, got.length, nDue, nNew]);
      }
      // Короткий диктант (4) берёт сначала то, что пора, самые трудные первыми.
      OT.set("words", { prog });
      OT.seed(7);
      const four = OT.fn.pickWords(4).map((w) => w.id).sort();
      return { out, bad, bad2: bad2.slice(0, 3), four, hard: ids.slice(0, 4).sort() };
    }, TODAY);
    eq(r.out.same, [1, 2, 3], "ящик растёт на каждом верном ответе, даже в один день");
    eq(r.out.miss, 1);
    eq(r.bad.slice(0, 3), [], "8 слов «пора»: лёгких новых и «не пора» среди них нет");
    eq(r.bad2, [], "3 пора + 3 новых + 2 из «не пора»");
    eq(r.four, r.hard, "в четвёрке дня самые трудные из «пора»");
  });

  test("Слова 3: слова с ошибками не показываются нигде — диктант, охота A и B, семейка, «Прогресс», сводка", async ({ page }) => {
    await fresh(page);
    const C = await run(page, () => OT.consts());
    const bad = misspellings(C);
    assert(bad.length >= 35, "список ошибочных написаний подозрительно короткий: " + bad.length);
    const hits = [];
    const scan = async (where) => { const f = found(await dumpPage(page), bad); if (f.length) hits.push(where + ": " + f.join(", ")); };
    // Базовая страница.
    for (const t of ["math", "read", "words", "games", "prog"]) { await page.click("#tab-" + t); await scan("вкладка " + t); }
    // 1. Диктант по всем 33 словам: «Проверить» → «Написал верно»; два слова с ошибкой (показ слова заново).
    const ids = C.STARTER.map((w) => w.id);
    await run(page, (ids) => OT.play("words", { items: ids }), ids);
    for (let i = 0; i < ids.length; i++) {
      await scan("диктант, слушаем " + ids[i]);
      await page.click("#w-check");
      await scan("диктант, сверяем " + ids[i]);
      if (i === 0 || i === 20) {
        await page.click("#w-no"); await scan("диктант, показ слова " + ids[i]);
        await waitState(page, () => OT.state().ui.words.round.phase === "listen"); await scan("диктант, второй раз " + ids[i]);
        await page.click("#w-check"); await page.click("#w-ok");
      } else await page.click("#w-ok");
    }
    await scan("диктант, итоги");
    // 2. Охота A по всем предложениям: ничего не находим, выбираем неверный способ и неверное проверочное слово.
    await run(page, (n) => OT.play("hunt", { theme: "a", list: Array.from({ length: n }, (_, i) => i) }), C.HUNT_A.length);
    for (let guard = 0; guard < 400; guard++) {
      const h = await run(page, () => { const H = OT.state().ui.words.hunt; return H ? { phase: H.phase, step: H.step } : null; });
      if (!h) break;
      await scan(`охота A ${h.phase}/${h.step}`);
      if (h.phase === "find") await page.click("#h-check");
      else if (h.phase === "result") await page.click("#h-go");
      else if (h.step === "type") {
        const k = await run(page, () => { const H = OT.state().ui.words.hunt; const t = H.toks[H.q[H.qi]]; return t.mark.k; });
        await page.click(`[data-ty="${k === "c" ? "d" : "c"}"]`);       // неверный способ
      } else if (h.step === "chk") {
        const wrong = await run(page, () => { const H = OT.state().ui.words.hunt; return H.toks[H.q[H.qi]].mark.wrong; });
        await page.click(`[data-ck="${wrong}"]`);                           // неверное проверочное
        await scan("охота A, после неверного проверочного");
        const right = await run(page, () => { const H = OT.state().ui.words.hunt; return H.toks[H.q[H.qi]].mark.chk; });
        await page.click(`[data-ck="${right}"]`);
      } else await page.click("#h-next");
    }
    // 3. Охота B: сначала неверный вопрос, потом неверное окончание.
    await run(page, (n) => OT.play("hunt", { theme: "b", list: Array.from({ length: n }, (_, i) => i) }), C.HUNT_B.length);
    for (let guard = 0; guard < 400; guard++) {
      const h = await run(page, () => { const H = OT.state().ui.words.hunt; return H ? { step: H.step, k: H.toks[H.q[H.qi]].mark.k } : null; });
      if (!h) break;
      await scan(`охота B ${h.step}`);
      if (h.step === "type") { await page.click(`[data-q="${h.k === "t" ? "tt" : "t"}"]`); await scan("охота B, неверный вопрос"); await page.click(`[data-q="${h.k}"]`); }
      else if (h.step === "end") { await page.click(`[data-e="${h.k === "t" ? "tt" : "t"}"]`); await scan("охота B, неверное окончание"); await page.click(`[data-e="${h.k}"]`); }
      else await page.click("#h-next");
    }
    // 4. Семейка: все 12, неверное лишнее, неверное проверочное, неверная буква.
    await run(page, (n) => OT.play("fam", { list: Array.from({ length: n }, (_, i) => i) }), C.FAMS.length);
    for (let i = 0; i < C.FAMS.length; i++) {
      const f = C.FAMS[i];
      await scan("семейка, лишнее " + i);
      await page.click(`[data-fw="${f.m[0][0]}"]`); await scan("семейка, неверное лишнее " + i);
      await page.click(`[data-fw="${f.imp}"]`);
      await scan("семейка, проверочное " + i);
      const wrongChk = f.m.find((x) => !x[1]), rightChk = f.m.find((x) => x[1]);
      await page.click(`[data-fc="${wrongChk[0]}"]`); await scan("семейка, неверное проверочное " + i);
      await page.click(`[data-fc="${rightChk[0]}"]`);
      await scan("семейка, буква " + i);
      await page.click(`[data-fl="${f.alt}"]`); await scan("семейка, неверная буква " + i);
      await page.click(`[data-fl="${f.ans}"]`); await scan("семейка, готово " + i);
      await page.click("#f-next");
    }
    // 5. «Прогресс» и сводка для логопеда после всех ошибок.
    await page.click("#tab-prog"); await scan("прогресс");
    await page.click("#rp-build"); await scan("сводка");
    eq(hits, [], "слова с ошибками на экране");
  });

  test("Слова 4: «Охота на орфограммы» — найдено, лишнее, способ проверки, тема -тся/-ться", async ({ page }) => {
    await fresh(page);
    await run(page, () => OT.play("hunt", { theme: "a", list: [1] }));
    for (const w of ["Лиса", "бежит", "лес"]) await page.click(`[data-j]:text-is("${w}")`);
    await page.click("#h-check");
    let H = (await st(page)).ui.words.hunt;
    eq([H.stats.total, H.stats.found, H.stats.fp], [2, 2, 1]);
    assert((await TEXT(page)).includes("Найдено 2 из 2. Лишних отметок: 1."));
    await page.click("#h-go");
    await page.click('[data-ty="c"]');                                // Лиса: верно — проверяемое
    await page.click('[data-ck="лисёнок"]');
    assert((await TEXT(page)).includes("тоже без ударения"), "подсказка про неверное проверочное");
    await page.click('[data-ck="ли́сы"]');
    assert((await TEXT(page)).includes("пишем и"), "после верного: пишем и");
    await page.click("#h-next");
    await page.click('[data-ty="d"]');                                // бежит: неверно — это проверяемое
    assert((await TEXT(page)).includes("Это слово можно проверить"), "подсказка про проверяемое");
    await page.click('[data-ck="бег"]');
    await page.click("#h-next");
    const hunt = (await st(page)).docs.words.hunt;
    eq(hunt.length, 1);
    eq([hunt[0].theme, hunt[0].total, hunt[0].found, hunt[0].fp, hunt[0].n, hunt[0].ok], ["a", 2, 2, 1, 2, 1]);
    // Тема B.
    await run(page, () => { OT.reset(); OT.play("hunt", { theme: "b", list: [0] }); });
    await page.click('[data-q="tt"]');
    assert((await TEXT(page)).includes("Вопрос без ь"), "подсказка к вопросу");
    await page.click('[data-q="t"]');
    await page.click('[data-e="tt"]');
    assert((await TEXT(page)).includes("мягкого знака нет"), "подсказка к окончанию");
    await page.click('[data-e="t"]');
    assert((await TEXT(page)).includes("Верно: прячется"));
    await page.click("#h-next");
    const b = (await st(page)).docs.words.hunt[0];
    eq([b.theme, b.total, b.found, b.n, b.ok], ["b", 1, 0, 1, 0], "с первой попытки не угадал ни вопрос, ни окончание");
  });

  test("Слова 5: «Семейка слов» — лишнее, проверочное, буква; ошибки не дают «сразу верно»", async ({ page }) => {
    await fresh(page);
    const C = await run(page, () => OT.consts());
    const f0 = C.FAMS[0], f1 = C.FAMS[1];
    await run(page, () => OT.play("fam", { list: [0] }));
    await page.click(`[data-fw="${f0.imp}"]`);
    await page.click(`[data-fc="${f0.m[0][0]}"]`);
    await page.click(`[data-fl="${f0.ans}"]`);
    assert((await TEXT(page)).includes("Корень: -вод-"), "корень после верной буквы");
    await page.click("#f-next");
    eq((await st(page)).docs.words.fam[0], { d: TODAY, n: 1, imp: 1, chk: 1, letter: 1 }, "всё сразу верно");
    await run(page, () => { OT.reset(); OT.play("fam", { list: [1] }); });
    await page.click(`[data-fw="${f1.m[0][0]}"]`);                    // родственник вместо лишнего
    assert((await TEXT(page)).includes("родственник"), "подсказка про родственника");
    await page.click(`[data-fw="${f1.imp}"]`);
    await page.click(`[data-fc="${f1.m.find((x) => !x[1])[0]}"]`);    // слово с ударением мимо
    assert((await TEXT(page)).includes("ударение падает на другую гласную"));
    await page.click(`[data-fc="${f1.m.find((x) => x[1])[0]}"]`);
    await page.click(`[data-fl="${f1.alt}"]`);
    assert((await TEXT(page)).includes("какая там гласная под ударением"), "подсказка про букву");
    await page.click(`[data-fl="${f1.ans}"]`);
    await page.click("#f-next");
    eq((await st(page)).docs.words.fam[0], { d: TODAY, n: 1, imp: 0, chk: 0, letter: 0 }, "после ошибок «сразу верно» ноль");
  });
}
