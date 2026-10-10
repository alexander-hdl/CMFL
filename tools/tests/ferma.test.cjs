// Приёмочные и модульные тесты «Фермы у реки», этап 1 (прототип).
// Запуск: node tools/tests/ferma.test.cjs
// Нумерация A1–A8 — приёмка из задания, M1–M13 — модульные проверки из раздела 11 проектного документа.
const { run } = require("./_harness.cjs");

run("ferma", async (t, page) => {
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const S = () => page.evaluate(() => FERMA.state());
  const api = (name, ...a) => page.evaluate(([n, args]) => FERMA.api[n](...args), [name, a]);
  const L = (name, ...a) => page.evaluate(([n, args]) => FERMA.logic[n](...args), [name, a]);
  const fresh = () => page.evaluate(() => { localStorage.clear(); FERMA.api.newGame({ seed: 1 }); });
  const text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText : ""; }, sel);
  const visible = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; }, sel);
  const dialog = async () => (await S()).ui.dialog;
  const sleep = (ms) => page.waitForTimeout(ms);
  // Покупка пакетиков: к магазину, корзина, касса, монеты по 10 ₽, оплата.
  async function buy(crop, count, tens) {
    await api("goTo", "shop"); await api("cart", crop, count); await api("toCashier");
    for (let i = 0; i < tens; i++) await api("coin", 1000);
    return api("submit");
  }

  /* ---------- M1. Согласование: plural, nounPhrase, nounForm ---------- */
  const NS = [1, 2, 5, 11, 21, 22, 25, 100, 101, 111];
  const FORMS = {
    "яблоко": ["яблоко", "яблока", "яблок", "яблок", "яблоко", "яблока", "яблок", "яблок", "яблоко", "яблок"],
    "рубль": ["рубль", "рубля", "рублей", "рублей", "рубль", "рубля", "рублей", "рублей", "рубль", "рублей"],
    "корзинка": ["корзинка", "корзинки", "корзинок", "корзинок", "корзинка", "корзинки", "корзинок", "корзинок", "корзинка", "корзинок"],
    "семя": ["семя", "семени", "семян", "семян", "семя", "семени", "семян", "семян", "семя", "семян"],
    "клетка": ["клетка", "клетки", "клеток", "клеток", "клетка", "клетки", "клеток", "клеток", "клетка", "клеток"],
    "пакетик": ["пакетик", "пакетика", "пакетиков", "пакетиков", "пакетик", "пакетика", "пакетиков", "пакетиков", "пакетик", "пакетиков"]
  };
  for (const noun of Object.keys(FORMS)) {
    const got = await page.evaluate(([n, ns]) => ns.map((k) => FERMA.logic.plural(k, ...FERMA.data.NOUNS[n].slice(0, 3))), [noun, NS]);
    t.eq(got, FORMS[noun], `M1 plural для слова «${noun}»: 1, 2, 5, 11, 21, 22, 25, 100, 101, 111`);
    const ph = await page.evaluate(([n, ns]) => ns.map((k) => FERMA.logic.nounPhrase(k, n, "и")), [noun, NS]);
    t.eq(ph, NS.map((k, i) => k + " " + FORMS[noun][i]), `M1 nounPhrase «${noun}» в именительном`);
  }
  t.eq(await page.evaluate(() => [[21, "морковка", "в"], [22, "морковка", "в"], [5, "морковка", "в"], [21, "рубль", "р"], [5, "рубль", "р"], [22, "рубль", "р"], [101, "яйцо", "в"], [111, "яйцо", "в"], [21, "копейка", "в"], [1, "копейка", "в"], [6, "клетка", "по"]].map((a) => FERMA.logic.nounPhrase(...a))),
    ["21 морковку", "22 морковки", "5 морковок", "21 рубля", "5 рублей", "22 рублей", "101 яйцо", "111 яиц", "21 копейку", "1 копейку", "6 клеток"], "M1 nounPhrase в винительном, родительном и после «по»");
  t.ok(await page.evaluate(() => { try { FERMA.logic.nounForm("яблоко", 21, "по"); return false; } catch (e) { return true; } }), "M1 «по 21 яблоку» не склоняется — nounForm бросает ошибку");
  t.eq(await page.evaluate(() => [6, 1, 21, 11, 2, 0].map((n) => FERMA.logic.poSafe(n))), [true, false, false, true, true, false], "M1 poSafe: безопасные числа после «по»");
  t.eq(await page.evaluate(() => [100, 200, 500, 1100, 2100, 2200, 2500].map((c) => [FERMA.logic.moneyDiffText(c), FERMA.logic.moneyDiffText(-c)])),
    [["Тут лишний 1 рубль.", "Не хватает 1 рубля."], ["Тут лишние 2 рубля.", "Не хватает 2 рублей."], ["Тут лишние 5 рублей.", "Не хватает 5 рублей."], ["Тут лишние 11 рублей.", "Не хватает 11 рублей."],
      ["Тут лишний 21 рубль.", "Не хватает 21 рубля."], ["Тут лишние 22 рубля.", "Не хватает 22 рублей."], ["Тут лишние 25 рублей.", "Не хватает 25 рублей."]], "M1 согласование в реплике о лишних и недостающих рублях");
  t.eq(await page.evaluate(() => [FERMA.logic.moneyDiffText(150), FERMA.logic.moneyDiffText(-50)]), ["Тут больше, чем нужно, на 1 рубль 50 копеек.", "Тут меньше, чем нужно, на 50 копеек."], "M1 реплики с копейками");
  t.eq(await page.evaluate(() => [FERMA.logic.moneyWords(6300), FERMA.logic.moneyWords(2100, "р"), FERMA.logic.moneyWords(150), FERMA.logic.moneyWords(50), FERMA.logic.fmtMoney(6350), FERMA.logic.fmtMoney(5000), FERMA.logic.fmtMoney(50)]),
    ["63 рубля", "21 рубля", "1 рубль 50 копеек", "50 копеек", "63 ₽ 50 к", "50 ₽", "50 к"], "M1 moneyWords и fmtMoney");
  t.eq(await page.evaluate(() => [1, 2, 5, 11, 21, 22, 25].map((n) => FERMA.logic.nounPhrase(n, "пакетик", "р"))), ["1 пакетика", "2 пакетиков", "5 пакетиков", "11 пакетиков", "21 пакетика", "22 пакетиков", "25 пакетиков"], "M1 родительный падеж: 1, 2, 5, 11, 21, 22, 25");
  t.eq(await page.evaluate(() => [FERMA.logic.weekdayForm(4, "к"), FERMA.logic.weekdayForm(1, "в"), FERMA.logic.weekdayForm(2, "до")]), ["к пятнице", "во вторник", "до среды"], "M1 weekdayForm");

  /* ---------- M2. Время, календарь, часы работы ---------- */
  t.eq(await page.evaluate(() => [940, 420, 1260].map((m) => FERMA.logic.clockAngles(m))), [{ h: 110, m: 240 }, { h: 210, m: 0 }, { h: 270, m: 0 }], "M2 углы стрелок для 15:40, 7:00, 21:00");
  t.eq(await page.evaluate(() => [FERMA.logic.fmtTime(940), FERMA.logic.fmtTime(545), FERMA.logic.parseTime("17:00"), FERMA.logic.dayPart(420), FERMA.logic.dayPart(715), FERMA.logic.dayPart(720), FERMA.logic.dayPart(1015), FERMA.logic.dayPart(1020)]),
    ["15:40", "9:05", 1020, "утро", "утро", "день", "день", "вечер"], "M2 fmtTime, parseTime, dayPart");
  t.eq(await page.evaluate(() => [1, 6, 31, 62].map((d) => { const o = FERMA.logic.dateOfDay(d); return [o.d, o.m, o.wd]; })), [[1, 6, 0], [6, 6, 5], [1, 7, 2], [1, 8, 5]], "M2 dateOfDay: 1, 6, 31, 62");
  t.eq(await page.evaluate(() => [FERMA.logic.dateOfDay(1).text, FERMA.logic.dateOfDay(6).text, FERMA.logic.dateOfDay(31).text, FERMA.logic.dateOfDay(1).short]), ["понедельник, 1 июня", "суббота, 6 июня", "среда, 1 июля", "Пн, 1 июня"], "M2 текст даты");
  t.eq(await page.evaluate(() => [FERMA.logic.nextWeekday(1, 5), FERMA.logic.nextWeekday(6, 5), FERMA.logic.nextWeekday(7, 5)]), [6, 6, 13], "M2 nextWeekday");
  t.eq(await page.evaluate(() => [["shop", 1, 1015], ["shop", 1, 1020], ["shop", 1, 1025], ["shop", 1, 535], ["shop", 1, 540], ["market", 6, 480], ["market", 5, 600], ["post", 7, 600], ["post", 6, 1075], ["post", 6, 1080]].map((a) => FERMA.logic.isOpen(...a))),
    [true, false, false, false, true, true, false, false, true, false], "M2 isOpen: магазин 9:00–17:00, рынок по субботам, почта пн–сб");
  t.eq(await page.evaluate(() => [FERMA.logic.canMakeIt(940, 30, "shop", 1), FERMA.logic.canMakeIt(1000, 30, "shop", 1), FERMA.logic.canMakeIt(480, 30, "shop", 1)]),
    [{ ok: true, arrive: 970, closesAt: 1020 }, { ok: false, arrive: 1030, closesAt: 1020, reason: "closed" }, { ok: false, arrive: 510, reason: "notYet", opensAt: 540 }], "M2 canMakeIt: успею, опоздаю, приду рано");
  t.eq(await page.evaluate(() => [FERMA.logic.actionAllowed(1250, 10), FERMA.logic.actionAllowed(1255, 10), FERMA.logic.durText(30), FERMA.logic.durText(60), FERMA.logic.durText(90), FERMA.logic.hoursText("shop")]),
    [true, false, "30 минут", "1 час", "1 час 30 минут", "Магазин семян. Открыт каждый день с 9:00 до 17:00."], "M2 actionAllowed, durText, hoursText");
  t.eq(await L("closedInfo", "shop", 1, 1025), { opensToday: false, lines: ["Магазин семян. Открыт каждый день с 9:00 до 17:00.", "Уже закрыто. Приходи завтра."] }, "M2 closedInfo после закрытия");
  t.eq((await L("closedInfo", "shop", 1, 510)).lines[1], "Ещё закрыто. Откроется в 9:00.", "M2 closedInfo до открытия");
  t.eq((await L("closedInfo", "market", 1, 600)).lines[1], "Сегодня закрыто. Ближайший день — суббота, 6 июня.", "M2 closedInfo в неподходящий день");
  t.eq(await L("planLines", 940, "farm", 1), ["Сейчас 15:40.", "Дорога 30 минут.", "Магазин закроется в 17:00.", "Почта закроется в 18:00.", "Рынок сегодня не работает: только в субботу."], "M2 planLines для 15:40 в понедельник");
  t.eq(await L("planLines", 940, "village", 1), ["Сейчас 15:40.", "Дорога 30 минут."], "M2 planLines по дороге домой — без строк о местах");

  /* ---------- M7 (часть): деньги, посев, карты, поиск пути ---------- */
  t.eq(await page.evaluate(() => [FERMA.logic.checkPay(6000, 7000), FERMA.logic.checkPay(6000, 5500), FERMA.logic.checkPay(6000, 6000)]),
    [{ ok: false, diff: 1000, text: "Тут лишние 10 рублей." }, { ok: false, diff: -500, text: "Не хватает 5 рублей." }, { ok: true, diff: 0 }], "M7 checkPay: лишние, не хватает, ровно");
  t.eq(await page.evaluate(() => [FERMA.logic.sumCoins([2000, 1000, 500, 200]), FERMA.logic.denoms({}), FERMA.logic.denoms({ kopecks: true })]), [3700, [100, 200, 500, 1000, 5000, 10000, 50000], [10, 50, 100, 200, 500, 1000, 5000, 10000, 50000]], "M7 sumCoins и denoms");
  t.eq(await page.evaluate(() => [FERMA.logic.sow(4, 6, 20), FERMA.logic.sow(4, 6, 30), FERMA.logic.sow(4, 6, 5).sown, FERMA.logic.sow(4, 6, 5).rowsUsed]),
    [{ sown: 20, empty: 4, left: 0, emptyCells: [20, 21, 22, 23], rowsUsed: 4 }, { sown: 24, empty: 0, left: 6, emptyCells: [], rowsUsed: 4 }, 5, 1], "M7 sow: 20 семян на 24 клетки, 30 семян, 5 семян");
  t.eq(await page.evaluate(() => [FERMA.logic.sowText(FERMA.logic.sow(4, 6, 20)), FERMA.logic.sowText(FERMA.logic.sow(4, 6, 30)), FERMA.logic.sowText(FERMA.logic.sow(4, 6, 23)), FERMA.logic.sowText(FERMA.logic.sow(4, 6, 3))]),
    ["Засеяно: 20 клеток. 4 клетки остались пустыми — семян не хватило.", "Засеяно: 24 клетки. В запасе осталось 6 семян.", "Засеяно: 23 клетки. 1 клетка осталась пустой — семян не хватило.", "Засеяно: 3 клетки. 21 клетка осталась пустой — семян не хватило."], "M7 sowText и согласование пустых клеток");
  t.eq(await page.evaluate(() => [FERMA.logic.packetsNeeded(24, 10), FERMA.logic.packetsNeeded(24, 8), FERMA.logic.packetsNeeded(25, 12), FERMA.logic.divRem(36, 10)]), [3, 3, 3, { q: 3, r: 6 }], "M7 packetsNeeded и divRem");
  t.eq(await page.evaluate(() => { const g = FERMA.world.grid("farm"); return FERMA.logic.bfs(g, [4, 7], [5, 8]); }), [[5, 7], [5, 8]], "M7 bfs: путь от двери дома в детерминированном порядке");
  t.eq(await page.evaluate(() => FERMA.logic.bfs(FERMA.world.grid("farm"), [4, 7], [4, 7])), [], "M7 bfs: путь до самого себя пустой");
  t.eq(await page.evaluate(() => FERMA.logic.bfs(FERMA.world.grid("farm"), [4, 7], [4, 4])), null, "M7 bfs: до дома (непроходимо) пути нет");
  t.ok(await page.evaluate(() => { try { FERMA.logic.parseMap(["TTT"]); return false; } catch (e) { return true; } }), "M7 parseMap бросает ошибку на неверный размер");
  t.eq(await page.evaluate(() => { const a = FERMA.logic.recordAttempt(null, false, "пример", 3), b = FERMA.logic.recordAttempt(a, true, "", 3); return [a.hist, b.hist, a.errors, b.n, b.ok, FERMA.logic.skillAcc([1, 1, 1, 0]), FERMA.logic.skillAcc([])]; }),
    [[0], [0, 1], [{ day: 3, t: "пример" }], 2, 1, 0.75, null], "M7 recordAttempt и skillAcc");
  t.eq(await page.evaluate(() => { let s = null; for (let i = 0; i < 10; i++) s = FERMA.logic.recordAttempt(s, true, "", 1); return s.level; }), 2, "M7 уровень растёт после 10 попыток с 9 верными");
  t.eq(await page.evaluate(() => { let s = FERMA.logic.recordAttempt(null, true, "", 1); s.level = 2; for (let i = 0; i < 6; i++) s = FERMA.logic.recordAttempt(s, i < 3 ? 1 : 0, "x", 1); return s.level; }), 1, "M7 уровень падает, если из 6 последних верных не больше 3");
  t.eq(await page.evaluate(() => { const m = FERMA.logic.migrate({ day: 3 }); return [m.v, m.day, m.money, m.beds.length]; }), [1, 3, 10000, 2], "M11 migrate({day:3}) даёт полное состояние");

  /* ---------- M12. Карты ---------- */
  await fresh();
  t.eq(await page.evaluate(() => ["farm", "village"].map((s) => [FERMA.data.MAPS[s].length, FERMA.data.MAPS[s].every((l) => l.length === 32)])), [[24, true], [24, true]], "M12 обе карты 32 × 24");
  t.ok(await page.evaluate(() => Object.keys(FERMA.data.OBJECTS).every((id) => { const o = FERMA.data.OBJECTS[id], st = FERMA.world.standOf(id); return FERMA.world.grid(o.scene)[st[1]][st[0]]; })), "M12 точка стояния каждого объекта проходима");
  t.ok(await page.evaluate(() => {
    const start = { farm: [4, 8], village: [30, 9] };
    return Object.keys(FERMA.data.OBJECTS).every((id) => { const o = FERMA.data.OBJECTS[id]; return FERMA.logic.bfs(FERMA.world.grid(o.scene), start[o.scene], FERMA.world.standOf(id)) !== null; });
  }), "M12 от двери дома и от въезда в деревню можно дойти до каждого объекта");
  t.ok(await page.evaluate(() => {
    // даже когда обе грядки разбиты на максимум (6 × 8), до выходов и друг до друга можно дойти
    FERMA.api.setBed(1, { rows: 6, cols: 8 }); FERMA.api.setBed(2, { rows: 6, cols: 8 });
    const g = FERMA.world.grid("farm"), ok = ["bed1", "bed2", "exitFarm", "house"].every((id) => FERMA.logic.bfs(g, [4, 8], FERMA.world.standOf(id)) !== null);
    FERMA.api.setBed(1, { rows: 0, cols: 0, sown: [] }); FERMA.api.setBed(2, { rows: 0, cols: 0, sown: [] }); return ok;
  }), "M12 крупные грядки не перекрывают дорогу");

  /* ---------- A1. Время меняется только от действий ---------- */
  await fresh();
  t.eq((await S()).time, 420, "A1 утро начинается в 7:00");
  await sleep(3000);
  t.eq((await S()).time, 420, "A1 за 3 секунды ожидания время не двинулось");
  await api("goTo", "bed1"); await api("act", "water");
  let s = await S();
  t.eq([s.time, s.beds[0].watered], [430, true], "A1 полив: +10 минут, грядка полита");
  await api("setTime", 600); await api("goTo", "shop"); await api("cart", "carrot", 2);
  const d0 = await dialog(); await sleep(3000); const d1 = await dialog();
  t.eq([(await S()).time, d1.kind, d1.reply, JSON.stringify(d1) === JSON.stringify(d0)], [600, "shop", null, true], "A1 на открытом диалоге магазина за 3 секунды ничего не изменилось: время то же, ответа нет, таймера нет");
  await api("setTime", 430);
  await api("close");
  await api("goTo", "bed1");
  t.ok(await page.evaluate(() => !document.querySelector("[data-timer]") && !/сек/.test(document.body.innerText)), "A1 в DOM нет таймеров и слов «осталось N секунд»");
  const btns = await page.evaluate(() => [...document.querySelectorAll("#ctx button.act")].map((b) => b.innerText.split("\n")[0]));
  t.ok(btns.length >= 3 && btns.every((x) => /— \d+ мин/.test(x)), "A1 каждая кнопка действия на грядке содержит «— N мин»: " + btns.join(" | "));
  t.eq(btns, ["Разметить грядку — 20 мин", "Посеять — 15 мин за ряд", "Полить — 10 мин"], "A1 тексты кнопок у грядки");
  t.ok(await visible("#ctx"), "A1 кнопки у грядки видны");

  /* ---------- M3. Подсматривание цифрового времени ---------- */
  await fresh();
  const peeks = [await api("peek"), await api("peek"), await api("peek")];
  t.eq(peeks, ["7:00", "7:00", "7:00"], "M3 три подсматривания дают время");
  t.eq(await text("#peekBubble"), "7:00 · больше нельзя", "M3 после третьего пузырь «больше нельзя»");
  t.eq(await api("peek"), null, "M3 четвёртое подсматривание — отказ");
  t.ok((await text("#peekBubble")).includes("Сегодня больше нельзя"), "M3 в пузыре «Сегодня больше нельзя»");
  await api("setSetting", "peekUnlimited", true);
  t.eq(await api("peek"), "7:00", "M3 взрослый разрешил без ограничений — снова строка");
  t.eq((await S()).time, 420, "M3 подсматривание не тратит время");
  await api("setSetting", "peekUnlimited", false); await fresh();
  await api("peek"); t.eq(await text("#peekBubble"), "7:00 · ещё 2 раза", "M3 первое подсматривание: «ещё 2 раза»");
  await api("peek"); t.eq(await text("#peekBubble"), "7:00 · ещё 1 раз", "M3 второе подсматривание: «ещё 1 раз»");
  await page.click("#clockBtn"); t.eq((await S()).peeks.used, 3, "M3 нажатие на часы мышью тоже считается");

  /* ---------- A2. Магазин в 17:05 закрыт, на двери часы работы ---------- */
  await fresh();
  await api("setTime", 17 * 60 + 5); await api("goTo", "shop");
  let dl = await dialog();
  t.eq(dl.kind, "closed", "A2 в 17:05 магазин закрыт");
  t.ok(["9:00", "17:00", "Приходи завтра"].every((w) => dl.lines.join(" ").includes(w)), "A2 в строках диалога часы работы и «Приходи завтра»");
  t.ok((await visible("#dlg")) && (await text("#dlg")).includes("с 9:00 до 17:00"), "A2 диалог виден и на нём «с 9:00 до 17:00»");
  t.eq(dl.buttons.map((b) => b.id), ["close"], "A2 после закрытия кнопки «подождать» нет");
  await api("setTime", 16 * 60 + 55); await api("goTo", "shop");
  t.eq((await dialog()).kind, "shop", "A2 в 16:55 магазин открыт");
  await api("setTime", 8 * 60 + 30); await api("goTo", "shop"); dl = await dialog();
  const wait = dl.buttons.find((b) => b.id === "wait");
  t.ok(dl.kind === "closed" && wait && wait.label === "Подождать до 9:00 — 30 мин", "A2 в 8:30 закрыто, есть кнопка «Подождать до 9:00 — 30 мин»");
  await api("choose", "wait");
  t.eq([(await S()).time, (await dialog()).kind], [540, "shop"], "A2 после ожидания время 9:00 и магазин открылся");
  await api("setDay", 7); await api("setTime", 600); await api("goTo", "post");
  t.ok((await dialog()).lines.join(" ").includes("Ближайший день — понедельник, 8 июня"), "A2 почта в воскресенье закрыта, подсказан понедельник");
  await api("setDay", 1); await api("setTime", 600); await api("goTo", "market");
  t.ok((await dialog()).lines.join(" ").includes("Рынок. Работает по субботам с 8:00 до 12:00."), "A2 рынок в понедельник закрыт, на двери его часы");
  await api("goTo", "post"); t.eq((await dialog()), null, "A2 почта днём в понедельник открыта: окна закрытия нет");
  await api("setTime", 600); await api("goTo", "shop");
  await page.evaluate(() => FERMA.render());
  const plaque = await page.evaluate(() => { FERMA.api.setTime(1025); FERMA.api.close(); FERMA.render(); const c = document.getElementById("cv").getContext("2d"); const p = c.getImageData(5 * 32 + 16, 8 * 32 - 26, 1, 1).data; return [p[0], p[1], p[2]]; });
  t.ok(plaque[0] > 150 && plaque[1] > 150, "A2 на двери магазина в 17:05 нарисована светлая табличка «ЗАКРЫТО»");

  /* ---------- A3. Грядка 4 × 6 и два пакетика по 10 ---------- */
  await fresh();
  await api("setTime", 600);
  let r = await buy("carrot", 2, 4);
  s = await S();
  t.ok(r.ok && s.inv["seed:carrot"] === 20, "A3 два пакетика моркови по 10: в рюкзаке 20 семян");
  t.eq([s.money, s.time], [6000, 605], "A3 оплата 40 ₽, покупка заняла 5 минут");
  t.eq((await dialog()).reply, "Спасибо! Приходи ещё.", "A3 продавщица благодарит");
  await api("goTo", "bed1");
  t.ok(!(await api("act", "sow", { crop: "carrot" })).ok, "A3 на неразмеченной грядке посеять нельзя");
  await api("act", "dig", { rows: 4, cols: 6 });
  s = await S();
  t.eq([s.beds[0].rows, s.beds[0].cols, s.time], [4, 6, 625], "A3 разметка 4 × 6 заняла 20 минут");
  r = await api("act", "sow", { crop: "carrot" });
  s = await S();
  t.ok(r.ok && s.beds[0].sown.reduce((a, b) => a + b, 0) === 20, "A3 засеяно 20 клеток");
  t.eq(s.beds[0].highlight, [20, 21, 22, 23], "A3 четыре пустые клетки подсвечены");
  t.ok(s.ui.dialog.reply.includes("4 клетки остались пустыми"), "A3 реплика: «4 клетки остались пустыми»: " + s.ui.dialog.reply);
  t.eq([s.inv["seed:carrot"], s.time], [0, 685], "A3 семена потрачены, посев 4 рядов — 60 минут");
  t.eq(s.skills.divrem.hist, [0], "A3 навык «деление с остатком»: попытка записана как неудачная");
  t.ok(s.skills.divrem.errors[0].t.includes("4 × 6") && s.skills.divrem.errors[0].t.includes("20 клеток"), "A3 пример ошибки: " + s.skills.divrem.errors[0].t);
  const px = await page.evaluate(() => { FERMA.render(); const d = document.getElementById("cv").getContext("2d").getImageData(14 * 32 + 16, 6 * 32 + 16, 1, 1).data; const e = document.getElementById("cv").getContext("2d").getImageData(10 * 32 + 16, 6 * 32 + 16, 1, 1).data; return [[d[0], d[1], d[2]], [e[0], e[1], e[2]]]; });
  t.ok(px[0][0] > 200 && px[0][1] > 170, "A3 на canvas пустая клетка 23 жёлтая: rgb(" + px[0].join(",") + ")");
  t.ok(px[1][0] < 150, "A3 засеянная клетка 19 не подсвечена: rgb(" + px[1].join(",") + ")");
  // досев: ещё один пакетик в тот же день заполняет пустые клетки
  await api("close"); await api("give", "seed:carrot", 10); await api("goTo", "bed1");
  r = await api("act", "resow"); s = await S();
  t.ok(r.ok && s.beds[0].sown.every((v) => v === 1) && s.beds[0].highlight.length === 0, "A3 досев закрывает пустые клетки, подсветка уходит");
  t.eq([s.inv["seed:carrot"], s.time, s.ui.dialog.reply], [6, 700, "Засеяно: 4 клетки. В запасе осталось 6 семян."], "A3 досев: 15 минут за один ряд, 6 семян в запасе");
  // три пакетика на грядку 4 × 6: 24 клетки, 6 семян в запасе
  await fresh(); await api("setTime", 600); await api("give", "seed:carrot", 30); await api("goTo", "bed2");
  await api("act", "dig", { rows: 4, cols: 6 }); r = await api("act", "sow", { crop: "carrot" }); s = await S();
  t.eq([s.beds[1].highlight, s.ui.dialog.reply, s.skills.divrem.hist], [[], "Засеяно: 24 клетки. В запасе осталось 6 семян.", [1]], "A3 30 семян на 24 клетки: ничего не пусто, 6 в запасе, попытка верная");
  // выбор культуры в диалоге посева
  await fresh(); await api("setTime", 600); await api("give", "seed:cabbage", 10); await api("give", "seed:zucchini", 5); await api("goTo", "bed1"); await api("act", "dig", { rows: 2, cols: 3 });
  await api("act", "sow"); dl = await dialog();
  t.eq([dl.kind, dl.buttons.map((b) => b.id)], ["sow", ["crop:zucchini", "crop:cabbage", "close"]], "A3 диалог посева предлагает культуры, на которые есть семена");
  t.ok(dl.buttons[0].label.includes("5 семян") && dl.buttons[1].label.includes("растёт 5 дней"), "A3 карточки культур: «5 семян», «растёт 5 дней»: " + dl.buttons[0].label + " / " + dl.buttons[1].label);
  await api("choose", "crop:cabbage"); s = await S();
  t.eq([s.beds[0].crop, s.beds[0].sown, s.inv["seed:cabbage"], s.skills.divrem.hist], ["cabbage", [1, 1, 1, 1, 1, 1], 4, [1]], "A3 посев капусты 2 × 3 из 10 семян");

  /* ---------- Оплата в магазине ---------- */
  await fresh(); await api("setTime", 600); await api("goTo", "shop"); await api("cart", "carrot", 1); await api("cart", "zucchini", 2);
  dl = await dialog();
  t.ok(dl.lines.join(" ").includes("1 пакетик моркови по 20 рублей") || dl.lines.join(" ").includes("1 пакетик моркови за 20 рублей"), "Оплата: корзина словами: " + dl.lines.join(" "));
  await api("cart", "zucchini", 0); await api("toCashier"); dl = await dialog();
  t.eq([dl.kind, dl.lines[0]], ["pay", "С тебя 20 рублей."], "Оплата: одна позиция — кассир называет сумму");
  await api("coin", 1000); await api("coin", 1000); await api("coin", 1000);
  r = await api("submit"); dl = await dialog();
  t.eq([r.ok, dl.reply, (await S()).money], [false, "Тут лишние 10 рублей.", 10000], "Оплата: 30 ₽ вместо 20 ₽ — «Тут лишние 10 рублей.», деньги целы");
  await api("uncoin", 1000); await api("uncoin", 1000); await api("coin", 500); r = await api("submit"); dl = await dialog();
  t.eq([r.ok, dl.reply], [false, "Не хватает 5 рублей."], "Оплата: 15 ₽ — «Не хватает 5 рублей.»");
  await api("coin", 500); r = await api("submit"); s = await S();
  t.eq([r.ok, s.money, s.inv["seed:carrot"], s.skills.pay.hist], [true, 8000, 10, [0]], "Оплата: исправил — куплено; первая попытка навыка «оплата» записана как неверная");
  t.ok(s.skills.pay.errors[0].t.includes("30 ₽") && s.skills.pay.errors[0].t.includes("20 ₽"), "Оплата: пример ошибки «" + s.skills.pay.errors[0].t + "»");
  await api("setMoney", 1500); await api("cart", "carrot", 1); await api("toCashier"); dl = await dialog();
  t.ok(dl.lines.join(" ").includes("В кошельке не хватает денег") && !dl.buttons.some((b) => b.id === "submit"), "Оплата: денег не хватает — предупреждение и только «Назад к полке»");
  t.eq((await api("coin", 1000)).ok && !(await api("coin", 1000)).ok, true, "Оплата: монет можно положить не больше, чем в кошельке");
  await api("choose", "back"); t.eq((await dialog()).kind, "shop", "Оплата: «Назад к полке» возвращает на полку");

  /* ---------- M4. План перед дорогой ---------- */
  await fresh(); await api("setTime", 940); await api("goTo", "exitFarm"); dl = await dialog();
  t.eq(dl.kind, "plan", "M4 у выхода открывается план");
  t.ok(["Сейчас 15:40.", "Дорога 30 минут.", "Магазин закроется в 17:00."].every((x) => dl.lines.includes(x)), "M4 в плане: время, дорога, закрытие магазина");
  t.ok(dl.buttons.find((b) => b.id === "go").enabled === false && dl.buttons.find((b) => b.id === "go").reason === "Сначала выбери, куда идёшь", "M4 «Идти» недоступна, пока не выбрана цель");
  t.ok(await visible("#planClock"), "M4 в плане нарисованы часы со стрелками");
  t.eq(dl.buttons.filter((b) => b.row === 1).map((b) => b.label), ["В магазин", "На почту", "На рынок", "К соседям"], "M4 цели: магазин, почта, рынок, соседи");
  await api("choose", "shop"); await api("choose", "go"); s = await S();
  t.eq([s.scene, s.time, s.skills.duration.hist, s.ui.dialog], ["village", 970, [1], null], "M4 дорога: деревня, 16:10, попытка «длительность» верная");
  await api("goTo", "shop"); t.eq((await dialog()).kind, "shop", "M4 в 16:10 магазин открыт");
  await fresh(); await api("setTime", 16 * 60 + 40); await api("travel", "shop"); await api("choose", "go"); s = await S();
  t.eq([s.time, s.skills.duration.hist], [1030, [0]], "M4 вышел в 16:40, пришёл в 17:10 — попытка неверная");
  t.ok(s.skills.duration.errors[0].t.includes("в магазин") && s.skills.duration.errors[0].t.includes("16:40"), "M4 пример ошибки: «" + s.skills.duration.errors[0].t + "»");
  await api("goTo", "shop"); t.ok((await dialog()).lines.join(" ").includes("Приходи завтра"), "M4 в 17:10 магазин закрыт");
  await api("goTo", "exitVillage"); dl = await dialog();
  t.eq([dl.title, dl.lines, dl.buttons.map((b) => b.id)], ["Дорога домой", ["Сейчас 17:10.", "Дорога 30 минут."], ["go", "stay"]], "M4 план по дороге домой: без выбора цели");
  await api("choose", "go"); s = await S();
  t.eq([s.scene, s.time, s.player.x, s.player.y], ["farm", 1060, 1, 19], "M4 дорога домой: двор, 17:40, персонаж у выхода");
  await api("goTo", "exitFarm"); await api("choose", "stay"); s = await S();
  t.eq([s.ui.dialog, s.time, s.player.x, s.player.y], [null, 1060, 1, 19], "M4 «Остаться»: окно закрыто, время то же, персонаж отошёл на тайл");
  await api("setTime", 1230); await api("travel", "market"); await api("choose", "go"); s = await S();
  t.ok(s.ui.dialog && s.ui.dialog.kind === "night" && s.ui.dialog.lines.includes("Уже 21:00. Пора домой. Ты дошёл до дома и лёг спать."), "M4 дорога закончилась в 21:00 в деревне: «Пора домой»");
  t.eq(s.skills.duration.hist.slice(-1), [0], "M4 на рынок в понедельник — попытка неверная");
  await fresh(); await api("setTime", 1235); await api("goTo", "exitFarm");
  t.ok(!(await dialog()).buttons.find((b) => b.id === "go").enabled && (await dialog()).buttons.find((b) => b.id === "go").reason === "До 21:00 не успеть", "M4 в 20:35 дорога (30 минут) не успевает");

  /* ---------- M5. Конец дня в 21:00 ---------- */
  await fresh(); await api("setTime", 1250); await api("goTo", "bed1"); await api("act", "water"); s = await S();
  t.eq([s.time, s.ui.dialog.kind, s.ui.dialog.source, s.ui.dialog.buttons.map((b) => b.id), s.ui.dialog.lines], [1260, "night", "system", ["sleep"], ["Уже 21:00. Пора спать."]], "M5 в 21:00 сразу диалог «Пора спать» с единственной кнопкой");
  t.ok(!(await api("close")).ok && (await dialog()).kind === "night", "M5 диалог ночи нельзя закрыть");
  await fresh(); await api("setTime", 1255); await api("goTo", "bed1"); s = await S();
  const water = s.ui.menu.buttons.find((b) => b.id === "water");
  t.eq([water.enabled, water.reason], [false, "До 21:00 не успеть"], "M5 в 20:55 кнопка «Полить» серая: «До 21:00 не успеть»");
  t.ok(!(await api("act", "water")).ok && (await S()).time === 1255, "M5 недоступное действие не меняет время");
  await api("choose", "sleep").catch(() => {});
  await fresh(); await api("setTime", 1260); await api("goTo", "bed1"); await api("act", "water");
  await api("setTime", 1250); await api("goTo", "bed1"); await api("act", "water");
  await api("choose", "sleep"); s = await S();
  t.eq([s.day, s.time, s.ui.screen, s.scene], [2, 420, "dayEnd", "farm"], "M5 «Спать» в диалоге: день 2, 7:00, экран итогов");
  t.ok((await text("#screen")).includes("Понедельник, 1 июня — день закончился") && (await text("#screen")).includes("Доброе утро!"), "M5 экран итогов: заголовок дня и кнопка «Доброе утро!»");

  /* ---------- Рост, дождь, сон ---------- */
  await fresh(); await api("setTime", 600); await api("give", "seed:carrot", 10); await api("goTo", "bed1"); await api("act", "dig", { rows: 2, cols: 5 }); await api("act", "sow", { crop: "carrot" }); await api("close"); await api("goTo", "bed1");
  await api("act", "water"); s = await S();
  t.eq([s.beds[0].watered, s.beds[0].growth, s.ui.menu.buttons.find((b) => b.id === "water").reason], [true, 0, "Уже полита"], "Рост: грядка полита, повторно поливать нельзя");
  await api("askSleep"); dl = await dialog();
  t.eq([dl.kind, dl.lines], ["confirm", ["Ещё светло. Точно спать?"]], "Сон: утром и днём один вопрос «Ещё светло. Точно спать?»");
  await api("choose", "close"); t.eq([(await dialog()), (await S()).day], [null, 1], "Сон: «Ещё поиграю» оставляет игру");
  await api("setTime", 1100); await api("askSleep"); s = await S();
  t.eq([s.day, s.ui.screen], [2, "dayEnd"], "Сон: вечером «Спать» сразу ведёт к итогам");
  const es = await text("#screen");
  t.ok(es.includes("Посеял морковь на грядке 1") && es.includes("Полил грядку 1") && es.includes("Кошелёк: было 100 ₽, стало 100 ₽.") && es.includes("Завтра: солнце."), "Итоги дня: события, кошелёк, прогноз: " + es.replace(/\n+/g, " | "));
  await api("wake"); s = await S();
  t.eq([s.ui.screen, s.day, s.time, s.beds[0].growth, s.beds[0].watered, s.peeks], [null, 2, 420, 1, false, { day: 2, used: 0 }], "Рост: за ночь политая грядка выросла на 1 день, сброс полива и подсматриваний");
  await api("sleep"); await api("wake"); s = await S();
  t.eq([s.day, s.beds[0].growth, s.beds[0].missed], [3, 1, 1], "Рост: неполитая грядка не растёт, пропуск записан");
  t.ok(s.ui.screen === "sleep", "Рост: два игровых дня за реальный день — ферма засыпает");
  await fresh(); await api("setDay", 4); await api("startDay"); await api("setBed", 1, { rows: 2, cols: 2, crop: "carrot", sown: [1, 1, 1, 1] }); await api("startDay"); await api("goTo", "bed1"); s = await S();
  const wb = s.ui.menu.buttons.find((b) => b.id === "water");
  t.eq([s.beds[0].watered, wb.enabled, wb.reason], [true, false, "Сегодня дождь — грядка полита"], "Погода: в дождливый день грядки политы сами");
  t.ok(s.ui.menu.title.includes("Созреет через 3 дня, в воскресенье."), "Меню грядки: «Созреет через 3 дня, в воскресенье.»: " + s.ui.menu.title);
  t.eq(await page.evaluate(() => [1, 4, 18, 14].map((d) => FERMA.logic.weatherOf(d))), ["sun", "rain", "rain", "rain"], "Погода детерминирована");

  /* ---------- Касание и ходьба ---------- */
  await fresh();
  await page.mouse.click(3 * 32 + 16, 4 * 32 + 16);
  await page.waitForFunction(() => FERMA.state().ui.menu && FERMA.state().ui.menu.obj === "house", null, { timeout: 5000 });
  s = await S();
  t.eq([s.ui.menu.obj, s.time, s.player.x, s.player.y], ["house", 420, 4, 7], "Ходьба: касание дома — персонаж идёт к двери бесплатно");
  t.eq(s.ui.menu.buttons.map((b) => b.id), ["sleep", "close"], "Меню дома: «Спать» и «Закрыть»");
  await page.mouse.click(12 * 32 + 16, 5 * 32 + 16);
  await page.waitForFunction(() => FERMA.state().ui.menu && FERMA.state().ui.menu.obj === "bed1", null, { timeout: 8000 });
  s = await S(); t.eq([s.player.x, s.player.y, s.time], [12, 7, 420], "Ходьба: касание участка — персонаж у грядки 1, время не потрачено");
  await api("tap", 20, 15); t.eq((await S()).ui.walking, true, "Ходьба: путь по сетке идёт кадр за кадром");
  await api("skipWalk"); s = await S(); t.eq([s.player.x, s.player.y, s.ui.walking], [20, 15, false], "Ходьба: skipWalk мгновенно доводит до цели");
  await api("tap", 0, 19); await api("skipWalk"); t.eq((await dialog()).kind, "plan", "Ходьба: касание выхода открывает план");
  t.ok(!(await api("tap", 5, 5)).ok, "Ходьба: пока открыт диалог, касания мира игнорируются");
  await api("close"); await api("tap", 2, 20); await api("skipWalk"); s = await S(); t.eq([s.player.x, s.player.y], [2, 20], "Ходьба: можно просто идти по траве");
  await api("tap", 5, 21); await api("skipWalk"); s = await S(); t.ok(s.player.y === 20, "Ходьба: нажатие на реку ведёт к ближайшему берегу");
  await api("goTo", "bed2"); await api("act", "dig", { rows: 6, cols: 8 }); s = await S();
  t.eq([s.player.x, s.player.y], [22, 9], "Грядка 6 × 8: персонаж переставлен к новой точке у нижнего края");
  await api("tap", 20, 5); await api("skipWalk"); s = await S(); t.ok(!(s.player.x === 20 && s.player.y === 5), "Грядка: по размеченной грядке пройти нельзя");

  /* ---------- Разметка грядки в диалоге ---------- */
  await fresh(); await api("goTo", "bed1"); await api("act", "dig"); dl = await dialog();
  t.eq([dl.kind, dl.lines[0], dl.data.rows, dl.data.cols], ["dig", "4 ряда по 6 клеток", 4, 6], "Разметка: диалог с сеткой 4 ряда по 6 клеток");
  t.ok((await page.locator(".dc").count()) === 48 && (await page.locator(".dc.sel").count()) === 24 && (await page.locator(".dc.hd").count()) === 1, "Разметка: сетка 8 × 6, выбрано 24 клетки, одна ручка");
  const cell = async (r, c) => { const b = await page.locator(`.dc[data-r="${r}"][data-c="${c}"]`).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  let [x0, y0] = await cell(3, 4); await page.mouse.move(x0, y0); await page.mouse.down();
  t.eq([(await dialog()).data.rows, (await dialog()).data.cols], [3, 4], "Разметка: касание клетки ставит ручку");
  [x0, y0] = await cell(5, 7); await page.mouse.move(x0, y0, { steps: 4 }); await page.mouse.up();
  dl = await dialog(); t.eq([dl.data.rows, dl.data.cols, dl.lines[0]], [5, 7, "5 рядов по 7 клеток"], "Разметка: ручку можно тянуть пальцем, подпись «5 рядов по 7 клеток»");
  await api("digSize", 1, 20); dl = await dialog(); t.eq([dl.data.rows, dl.data.cols], [2, 8], "Разметка: размер ограничен от 2 × 2 до 6 × 8");
  await api("digSize", 4, 6); await page.click("text=Разметить — 20 мин"); s = await S();
  t.eq([s.beds[0].rows, s.beds[0].cols, s.time, s.ui.dialog, s.ui.menu.obj], [4, 6, 440, null, "bed1"], "Разметка: кнопка тратит 20 минут и возвращает меню грядки");
  await api("act", "dig"); await api("close"); t.eq((await S()).time, 440, "Разметка: закрыл, не закончив — время не тратится");

  /* ---------- A8. Прогресс переживает перезагрузку, ферма спит до следующей даты ---------- */
  await page.evaluate(() => { localStorage.clear(); FERMA.api.setRealDate("2026-10-10"); FERMA.api.newGame(); });
  await api("goTo", "bed1"); await api("act", "water"); await api("setMoney", 4200); await api("give", "seed:carrot", 7);
  await t.reload();
  s = await S();
  t.eq([s.time, s.money, s.beds[0].watered, s.inv["seed:carrot"], s.ui.screen], [430, 4200, true, 7, null], "A8.1 после перезагрузки время, деньги, полив и семена на месте");
  await api("setSetting", "daysPerReal", 2); await api("sleep"); await api("wake"); s = await S();
  t.eq([s.day, s.ui.screen, s.real], [2, null, { date: "2026-10-10", daysToday: 1 }], "A8.2 первый игровой день закончен — второй начинается");
  await api("sleep"); await api("wake"); s = await S();
  t.eq([s.day, s.ui.screen], [3, "sleep"], "A8.2 второй день закончен — экран сна");
  t.ok((await visible("#screen")) && (await text("#screen")).includes("Куры спят, приходи завтра"), "A8.2 на экране «Куры спят, приходи завтра»");
  await t.reload(); s = await S();
  t.eq(s.ui.screen, "sleep", "A8.3 ферма спит и после перезагрузки");
  t.ok((await text("#screen")).includes("Куры спят, приходи завтра"), "A8.3 надпись на месте после перезагрузки");
  await page.evaluate(() => FERMA.api.setRealDate("2026-10-11")); await t.reload(); s = await S();
  t.eq([s.ui.screen, s.day, s.time, s.real.daysToday], [null, 3, 420, 0], "A8.4 на следующую реальную дату ферма просыпается: день 3, 7:00");
  await page.evaluate(() => FERMA.api.setRealDate(null));

  /* ---------- M10. Экран взрослого ---------- */
  await fresh();
  const ab = await page.locator("#adultBtn").boundingBox(), ax = ab.x + ab.width / 2, ay = ab.y + ab.height / 2;
  await page.mouse.move(ax, ay); await page.mouse.down(); await sleep(1000); await page.mouse.up();
  t.ok((await S()).ui.screen !== "adult", "M10 удержание 1 секунды экран взрослого не открывает");
  await page.mouse.move(ax, ay); await page.mouse.down(); await sleep(2200); await page.mouse.up();
  t.eq((await S()).ui.screen, "adult", "M10 удержание 2 секунд открывает экран взрослого");
  t.ok((await page.locator("#screen .skill").count()) === 12 && (await text("#screen")).includes("Игровых дней в сутки"), "M10 на экране 12 навыков и настройки");
  t.ok((await text("#screen")).includes("ещё не было"), "M10 навык без попыток — «ещё не было»");
  await page.click("text=Цифровое время без ограничения");
  t.eq((await S()).settings.peekUnlimited, true, "M10 настройка «Цифровое время без ограничения» включается сразу");
  await page.click("#screen button[data-arg='daysPerReal'][data-arg2='3']");
  t.eq((await S()).settings.daysPerReal, 3, "M10 «Игровых дней в сутки: 3»");
  await page.click("text=Крупный шрифт"); t.ok(await page.evaluate(() => document.getElementById("app").classList.contains("big")), "M10 «Крупный шрифт» включает класс .big");
  await page.click("#screen >> text=Закрыть"); t.eq((await S()).ui.screen, null, "M10 «Закрыть» возвращает в игру");
  await api("setSkill", "pay", { hist: [1, 0, 1], n: 3, ok: 2, level: 1, errors: [{ day: 1, t: "положил 70 ₽ вместо 60 ₽" }] }); await api("openAdult");
  t.ok((await text("#screen")).includes("положил 70 ₽ вместо 60 ₽") && (await text("#screen")).includes("2 из 3"), "M10 в точности по навыку и примеры ошибок");

  /* ---------- M11. Миграция сохранения ---------- */
  await page.evaluate(() => { localStorage.setItem("ferma-save", JSON.stringify({ day: 3 })); });
  await t.reload(); s = await S();
  t.eq([s.v, s.day, s.money, s.ui.screen], [1, 3, 10000, null], "M11 старое сохранение {day:3} дополняется до схемы v1, прогресс не потерян");
  await page.evaluate(() => { localStorage.setItem("ferma-save", "это не json"); });
  await t.reload(); s = await S();
  t.eq([s.v, s.day, s.ui.screen], [1, 1, "start"], "M11 битое сохранение — новая игра и стартовый экран");
  t.ok((await text("#screen")).includes("Ферма у реки"), "M11 стартовый экран с названием");
  await page.click("#screen >> text=Играть"); t.eq((await S()).ui.screen, null, "M11 «Играть» начинает игру");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ferma-save")));
  t.ok(saved.v === 1 && !("ui" in saved), "M11 в localStorage лежит JSON схемы v1 без S.ui");

  /* ---------- A7 (облегчённо). Тексты без ошибок, нет викторин ---------- */
  await fresh(); await api("setRealDate", "2026-12-01");
  const log = [], calls = new Set();
  async function step(name, ...a) {
    calls.add(name);
    const before = await S();
    await api(name, ...a);
    const now = await S(); await sleep(150);
    const later = await S();
    const body = await page.evaluate(() => document.body.innerText);
    log.push({ name, body, dlg: JSON.stringify(now.ui.dialog), menu: JSON.stringify(now.ui.menu), scr: now.ui.screen });
    if (now.ui.dialog) t.ok(calls.has(now.ui.dialog.source) || now.ui.dialog.source === "system", `A7 «${name}»: диалог «${now.ui.dialog.kind}» открыт нашим вызовом «${now.ui.dialog.source}», а не сам`);
    t.ok(JSON.stringify(later.ui.dialog) === JSON.stringify(now.ui.dialog) || (later.ui.dialog === null && now.ui.dialog === null), `A7 «${name}»: окно не меняется само`);
    return now;
  }
  await step("goTo", "exitFarm"); await step("choose", "shop"); await step("choose", "go"); await step("setTime", 600); await step("goTo", "shop"); await step("cart", "carrot", 3); await step("cart", "zucchini", 1); await step("toCashier");
  for (let i = 0; i < 7; i++) await step("coin", 1000); await step("coin", 500); await step("submit"); await step("coin", 1000);
  await step("close"); await step("goTo", "market"); await step("goTo", "exitVillage"); await step("choose", "go");
  await step("goTo", "bed1"); await step("act", "dig", { rows: 4, cols: 6 }); await step("act", "sow", { crop: "carrot" }); await step("close"); await step("act", "water"); await step("openBag"); await step("close");
  await step("peek"); await step("askSleep"); await step("choose", "close"); await step("setTime", 1200); await step("goTo", "bed2"); await step("act", "water"); await step("askSleep"); await step("wake");
  await step("goTo", "bed1"); await step("act", "water"); await step("openAdult"); await step("closeScreen"); await step("sleep");
  const bad = await page.evaluate((log) => {
    const out = [], forb = ["еще", "зеленые", "зеленых", "тетя", "Петр", "пришел", "принес", "растет", "дает", "несет", "ведра", "ждет", "четвертая", "желтый", "польет"];
    const forms = {}; Object.keys(FERMA.data.NOUNS).forEach((n) => FERMA.data.NOUNS[n].forEach((f) => { if (f) (forms[f] = forms[f] || new Set()).add(n); }));
    const text = log.map((l) => l.body + " " + l.dlg + " " + l.menu).join("\n");
    ["undefined", "NaN", "null", "[object"].forEach((w) => { if (log.some((l) => l.body.includes(w))) out.push("на экране «" + w + "»"); });
    forb.forEach((w) => { if (new RegExp("(^|[^а-яё])" + w + "($|[^а-яё])", "i").test(text)) out.push("слово без ё: " + w); });
    const seen = new Set();
    for (const m of text.matchAll(/(\d+) ([а-яё]+)/g)) {
      const n = +m[1], w = m[2], key = n + " " + w; if (seen.has(key) || !forms[w]) continue; seen.add(key);
      const ok = [...forms[w]].some((noun) => ["и", "в", "р"].some((c) => { try { return FERMA.logic.nounForm(noun, n, c) === w; } catch (e) { return false; } }));
      if (!ok) out.push("не согласовано: " + key);
    }
    return { out, seen: seen.size };
  }, log);
  t.eq(bad.out, [], "A7 за сессию на экране нет «undefined», «NaN», слов без ё и несогласованных чисел (проверено пар «число + слово»: " + bad.seen + ")");
  t.ok(log.every((l) => !/\?/.test(l.body.replace(/Ещё светло\. Точно спать\?/g, "").replace(/Куда идёшь\?/g, ""))), "A7 в сессии нет всплывающих вопросов-викторин: единственные вопросы — «Куда идёшь?» и «Ещё светло. Точно спать?»");

  /* ---------- Обычный игровой день по шагам: сколько нажатий и игровых часов ---------- */
  await fresh(); let clicks = 0;
  const click = async (n, ...a) => { clicks += n; return api(...a); };
  await click(4, "goTo", "bed1"); await api("act", "dig", { rows: 4, cols: 6 });            // тап, «Разметить», ручка, «Разметить — 20 мин»
  await click(4, "goTo", "bed2"); await api("act", "dig", { rows: 3, cols: 5 });
  await click(3, "goTo", "exitFarm"); await api("choose", "shop"); await api("choose", "go");   // тап по выходу, цель, «Идти»
  await click(1, "goTo", "shop"); s = await S();
  t.eq([s.scene, s.time, s.ui.dialog.kind], ["village", 490, "closed"], "День: в 8:10 у магазина табличка с часами работы");
  await click(1, "choose", "wait"); await click(3, "cart", "carrot", 2); await api("cart", "zucchini", 1); await click(1, "toCashier");
  for (let i = 0; i < 7; i++) await click(1, "coin", 1000);
  await click(1, "submit"); await click(3, "goTo", "exitVillage"); await api("choose", "go"); await api("close");
  await click(3, "goTo", "bed1"); await click(2, "act", "sow", { crop: "carrot" }); await click(1, "close"); await click(2, "act", "water");
  await click(2, "goTo", "bed2"); await click(2, "act", "sow", { crop: "zucchini" }); await click(1, "close"); await click(1, "act", "water");
  s = await S();
  t.ok(s.beds[0].crop === "carrot" && s.beds[1].crop === "zucchini" && s.beds[0].watered && s.beds[1].watered && s.time < 1020, "День: обе грядки засеяны и политы до 17:00, игровое время " + Math.floor(s.time / 60) + ":" + String(s.time % 60).padStart(2, "0"));
  const chores = s.time;
  await click(2, "askSleep"); await api("setTime", 1100); await api("askSleep"); await click(1, "wake");
  s = await S(); t.eq([s.day, s.beds[0].growth, s.beds[1].growth], [2, 1, 1], "День: утром второго дня обе культуры выросли на день");
  console.log(`  (оценка: обычный первый день — около ${clicks} нажатий, игровое время к концу дел ${Math.floor(chores / 60)}:${String(chores % 60).padStart(2, "0")})`);

  /* ---------- Экран: 1024×768 и 1366×768, кнопки от 48 px ---------- */
  await fresh(); await api("setTime", 600); await api("goTo", "shop"); await api("cart", "carrot", 1);
  for (const [w, h] of [[1024, 768], [1366, 768]]) {
    await page.setViewportSize({ width: w, height: h }); await sleep(200);
    const m = await page.evaluate(() => {
      const st = document.getElementById("stage").getBoundingClientRect(), small = [];
      document.querySelectorAll("#hud button, #bottom button, #dlg button, #dlg .coin, #dlg .note").forEach((b) => { const r = b.getBoundingClientRect(); if (r.width && (r.width < 48 || r.height < 48)) small.push(b.innerText + " " + Math.round(r.width) + "×" + Math.round(r.height)); });
      return { x: Math.round(st.x), w: Math.round(st.width), h: Math.round(st.height), small, scrollX: document.documentElement.scrollWidth > innerWidth };
    });
    t.ok(m.w === Math.round(1024 * Math.min(w / 1024, 768 / 768)) && m.h === 768 && m.x === Math.round((w - m.w) / 2) && !m.scrollX, `Экран ${w}×${h}: сцена ${m.w}×${m.h} по центру, прокрутки нет`);
    t.eq(m.small, [], `Экран ${w}×${h}: все кнопки не меньше 48 px`);
  }
  await page.setViewportSize({ width: 1024, height: 768 });

  /* ---------- M13. Ошибки страницы ---------- */
  t.eq(pageErrors, [], "M13 за все проверки на странице нет ошибок (window.claude отсутствует)");
  t.ok(await page.evaluate(() => typeof window.claude === "undefined" && FERMA.ready === true && FERMA.version === "0.1.0"), "M13 без window.claude игра работает из localStorage");
});
