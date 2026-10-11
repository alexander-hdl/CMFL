// Приёмочные и модульные тесты «Фермы у реки», этап 1 (прототип).
// Запуск: node tools/tests/ferma.test.cjs
// Нумерация A1–A8 — приёмка из задания, M1–M13 — модульные проверки из раздела 11 проектного документа,
// R1–R… — проверки по замечаниям ревьювера (раздел 15 проектного документа).
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
  const WAIT = process.env.FERMA_FAST ? 150 : 1500;   // пауза после каждого вызова в A7: по документу 1500 мс (FERMA_FAST=1 — быстрый прогон при отладке)
  // Покупка пакетиков: к магазину, корзина, касса, ровная оплата монетами 10 ₽ из щедрого кошелька.
  const PRICE = { carrot: 2000, zucchini: 3000, cabbage: 2500 };
  async function buy(crop, count) {
    await api("setWallet", { 100: 5, 500: 5, 1000: 20 });
    await api("goTo", "shop"); await api("cart", crop, count); await api("toCashier");
    let left = PRICE[crop] * count;
    for (; left >= 1000; left -= 1000) await api("coin", 1000);
    if (left) await api("coin", 500);
    return api("submit");
  }
  const waitIdle = () => page.waitForFunction(() => !FERMA.state().ui.walking, null, { timeout: 15000 });
  const giveAll = (o) => page.evaluate((o) => { Object.keys(o).forEach((k) => FERMA.api.give(k, o[k])); }, o);
  const ripeBed = (id, crop, sown, extra) => api("setBed", id, Object.assign({ rows: 4, cols: 6, crop, sown, growth: 9, missed: 0, watered: false }, extra || {}));
  const SOWN20 = [...new Array(20).fill(1), 0, 0, 0, 0];

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
  t.eq(await page.evaluate(() => [1, 2, 4, 5, 11, 12, 21, 22, 25].map((n) => FERMA.logic.sowText({ sown: 24 - n, empty: n, left: 0 }).split(". ")[1])),
    ["1 клетка осталась пустой — семян не хватило.", "2 клетки остались пустыми — семян не хватило.", "4 клетки остались пустыми — семян не хватило.", "5 клеток осталось пустыми — семян не хватило.", "11 клеток осталось пустыми — семян не хватило.",
      "12 клеток осталось пустыми — семян не хватило.", "21 клетка осталась пустой — семян не хватило.", "22 клетки остались пустыми — семян не хватило.", "25 клеток осталось пустыми — семян не хватило."], "R глагол при «пустых клетках» согласован: 1, 2, 4, 5, 11, 12, 21, 22, 25");
  t.eq(await page.evaluate(() => FERMA.logic.sowText({ sown: 4, empty: 0, left: 6 }, true)), "Досеяно: 4 клетки. В запасе осталось 6 семян.", "R досев: «Досеяно: 4 клетки», а не «Засеяно»");
  t.eq(await page.evaluate(() => [FERMA.logic.packetsNeeded(24, 10), FERMA.logic.packetsNeeded(24, 8), FERMA.logic.packetsNeeded(25, 12), FERMA.logic.divRem(36, 10)]), [3, 3, 3, { q: 3, r: 6 }], "M7 packetsNeeded и divRem");
  t.eq(await page.evaluate(() => { const g = FERMA.world.grid("farm"); return FERMA.logic.bfs(g, [4, 7], [5, 8]); }), [[5, 7], [5, 8]], "M7 bfs: путь от двери дома в детерминированном порядке");
  t.eq(await page.evaluate(() => FERMA.logic.bfs(FERMA.world.grid("farm"), [4, 7], [4, 7])), [], "M7 bfs: путь до самого себя пустой");
  t.eq(await page.evaluate(() => FERMA.logic.bfs(FERMA.world.grid("farm"), [4, 7], [4, 4])), null, "M7 bfs: до дома (непроходимо) пути нет");
  t.ok(await page.evaluate(() => { try { FERMA.logic.parseMap(["TTT"]); return false; } catch (e) { return true; } }), "M7 parseMap бросает ошибку на неверный размер");
  t.eq(await page.evaluate(() => { const a = FERMA.logic.recordAttempt(null, false, "пример", 3), b = FERMA.logic.recordAttempt(a, true, "", 3); return [a.hist, b.hist, a.errors, b.n, b.ok, FERMA.logic.skillAcc([1, 1, 1, 0]), FERMA.logic.skillAcc([])]; }),
    [[0], [0, 1], [{ day: 3, t: "пример" }], 2, 1, 0.75, null], "M7 recordAttempt и skillAcc");
  t.eq(await page.evaluate(() => { let s = null; for (let i = 0; i < 10; i++) s = FERMA.logic.recordAttempt(s, true, "", 1); return s.level; }), 2, "M7 уровень растёт после 10 попыток с 9 верными");
  t.eq(await page.evaluate(() => { let s = FERMA.logic.recordAttempt(null, true, "", 1); s.level = 2; for (let i = 0; i < 6; i++) s = FERMA.logic.recordAttempt(s, i < 3 ? 1 : 0, "x", 1); return s.level; }), 1, "M7 уровень падает, если из 6 последних верных не больше 3");
  t.eq(await page.evaluate(() => { const m = FERMA.logic.migrate({ day: 3 }); return [m.v, m.day, FERMA.logic.walletSum(m.wallet), m.beds.length]; }), [3, 3, 10000, 2], "M11 migrate({day:3}) даёт полное состояние схемы v3");

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
  await api("setBed", 1, { rows: 2, cols: 2, crop: "carrot", sown: [1, 1, 1, 1] });
  await api("goTo", "bed1"); await api("act", "water");
  let s = await S();
  t.eq([s.time, s.beds[0].watered], [430, true], "A1 полив посеянной грядки: +10 минут, грядка полита");
  await api("setTime", 600); await api("goTo", "shop"); await api("cart", "carrot", 2);
  const d0 = await dialog(); await sleep(3000); const d1 = await dialog();
  t.eq([(await S()).time, d1.kind, d1.reply, JSON.stringify(d1) === JSON.stringify(d0)], [600, "shop", null, true], "A1 на открытом диалоге магазина за 3 секунды ничего не изменилось: время то же, ответа нет, таймера нет");
  await api("setTime", 430);
  await api("close");
  await api("goTo", "bed2");
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
  t.ok((await L("closedInfo", "post", 7, 600)).lines.includes("Сегодня закрыто. Ближайший день — понедельник, 8 июня."), "A2 логика: почта в воскресенье закрыта, подсказан понедельник");
  await api("setDay", 1); await api("setTime", 600); await api("goTo", "market"); dl = await dialog();
  t.ok(dl.kind === "closed" && dl.lines.join(" ").includes("Рынок. Работает по субботам с 8:00 до 12:00.") && dl.lines.includes("Сегодня закрыто. Ближайший день — суббота, 6 июня."), "A2 рынок в понедельник закрыт: табличка с часами и ближайшим днём");
  await api("goTo", "post"); dl = await dialog(); s = await S();
  t.ok(dl === null && s.ui.menu.obj === "post", "A2 почта в 10:00 открыта: меню почты");
  await api("setTime", 1085); await api("goTo", "post"); dl = await dialog();
  t.ok(dl.kind === "closed" && dl.lines[0] === "Почта. Открыта с понедельника по субботу, с 9:00 до 18:00.", "A2 почта в 18:05 закрыта: табличка с часами работы");
  await api("setDay", 6); await api("setTime", 540); await api("goTo", "market"); t.eq((await S()).ui.menu.obj, "market", "A2 рынок в субботу в 9:00 открыт: меню рынка");
  await api("setDay", 1);
  await api("setTime", 600); await api("goTo", "shop");
  await page.evaluate(() => FERMA.render());
  // табличка «ЗАКРЫТО» над дверью магазина: светлая заливка с тёмной рамкой, текст помещается внутри
  const plaque = await page.evaluate(() => {
    FERMA.api.setTime(1025); FERMA.api.close(); FERMA.render(); const c = document.getElementById("cv").getContext("2d"), mx = 5 * 32 + 16, top = 8 * 32 - 52;
    const px = (x, y) => Array.from(c.getImageData(x, y, 1, 1).data).slice(0, 3);
    return { fill: px(mx - 38, top + 6), border: px(mx - 43, top + 15), outside: px(mx + 60, top + 15), textDark: (() => { let n = 0; const d = c.getImageData(mx - 40, top + 3, 80, 24).data; for (let i = 0; i < d.length; i += 4) if (d[i] < 90) n++; return n; })() };
  });
  t.ok(plaque.fill[0] > 200 && plaque.fill[1] > 200 && plaque.border[0] < 120 && plaque.textDark > 60, "A2 на двери магазина в 17:05 нарисована табличка «ЗАКРЫТО» с рамкой, текст внутри: " + JSON.stringify(plaque));

  /* ---------- A3. Грядка 4 × 6 и два пакетика по 10 ---------- */
  await fresh();
  await api("setTime", 600);
  await api("goTo", "shop"); await api("cart", "carrot", 2); await api("toCashier");
  for (const c of [1000, 1000, 1000, 500, 500]) await api("coin", c);
  let r = await api("submit");
  s = await S();
  t.ok(r.ok && s.inv["seed:carrot"] === 20, "A3 два пакетика моркови по 10: в рюкзаке 20 семян");
  t.eq([s.money, s.time, s.wallet], [6000, 605, { 100: 4, 200: 3, 500: 0, 1000: 0, 5000: 1, 10000: 0, 50000: 0 }], "A3 оплата 40 ₽ монетами 10, 10, 10, 5, 5: в кошельке 60 ₽ без этих монет, покупка заняла 5 минут");
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
  const px = await page.evaluate(() => { FERMA.render(); const c = document.getElementById("cv").getContext("2d"), at = (x, y) => Array.from(c.getImageData(x * 32 + 12, y * 32 + 9, 1, 1).data).slice(0, 3); return [[11, 6], [12, 6], [13, 6], [14, 6]].map((p) => at(p[0], p[1])).concat([at(10, 6), at(15, 6), at(9, 3)]); });
  t.ok(px.slice(0, 4).every((p) => p[0] > 200 && p[1] > 170), "A3 на canvas все четыре пустые клетки (20, 21, 22, 23) жёлтые: " + JSON.stringify(px.slice(0, 4)));
  t.ok(px.slice(4).every((p) => p[0] < 150), "A3 засеянные клетки 19, 5 и 0 не подсвечены: " + JSON.stringify(px.slice(4)));
  // досев: ещё один пакетик в тот же день заполняет пустые клетки
  await api("close"); await api("give", "seed:carrot", 10); await api("goTo", "bed1");
  r = await api("act", "resow"); s = await S();
  t.ok(r.ok && s.beds[0].sown.every((v) => v === 1) && s.beds[0].highlight.length === 0, "A3 досев закрывает пустые клетки, подсветка уходит");
  t.eq([s.inv["seed:carrot"], s.time, s.ui.dialog.reply], [6, 700, "Досеяно: 4 клетки. В запасе осталось 6 семян."], "A3 досев: 15 минут за один ряд, 6 семян в запасе, «Досеяно»");
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
  t.eq([r.ok, dl.reply, (await S()).money], [false, "Тут лишние 10 рублей.", 10000], "Оплата: 30 ₽ вместо 20 ₽, ровно заплатить можно (10 + 5 + 5) — «Тут лишние 10 рублей.», деньги целы");
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
  t.eq(dl.buttons.filter((b) => b.row === 1).map((b) => b.label), ["В магазин", "На почту", "На рынок"], "M4 цели: магазин, почта, рынок");
  await api("choose", "post"); dl = await dialog();
  t.ok(dl.data.target === "post" && dl.buttons.find((b) => b.id === "go").enabled && dl.buttons.find((b) => b.id === "post").cls === "sel", "R12 «На почту» выбирает цель, «Идти» доступна");
  await api("choose", "market"); t.eq((await dialog()).data.target, "market", "R12 «На рынок» тоже выбирает цель");
  t.eq((await S()).skills.duration, undefined, "R12 попытка навыка «длительность» не пишется, пока не нажата «Идти»");
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
  await api("setTime", 1230); await api("travel", "shop"); await api("choose", "go"); s = await S();
  t.ok(s.ui.dialog && s.ui.dialog.kind === "night" && s.ui.dialog.lines.includes("Уже 21:00. Пора домой. Ты дошёл до дома и лёг спать."), "M4 дорога закончилась в 21:00 в деревне: «Пора домой»");
  t.eq(s.skills.duration.hist.slice(-1), [0], "M4 в магазин в 20:30 — попытка неверная");
  await fresh(); await api("setTime", 600); await api("travel", "market"); t.eq([(await dialog()).data.target, (await dialog()).buttons.find((b) => b.id === "go").enabled], ["market", true], "R12 api.travel(«market») выбирает рынок");
  await api("choose", "go"); s = await S();
  t.eq([s.scene, s.skills.duration.hist], ["village", [0]], "M4 в понедельник пошёл на рынок: попытка «длительность» неверная");
  t.ok(s.skills.duration.errors[0].t.includes("на рынок") && s.skills.duration.errors[0].t.includes("сегодня не работает"), "M4 пример: «" + s.skills.duration.errors[0].t + "»");
  await fresh(); await api("setTime", 1235); await api("goTo", "exitFarm");
  t.ok(!(await dialog()).buttons.find((b) => b.id === "go").enabled && (await dialog()).buttons.find((b) => b.id === "go").reason === "До 21:00 не успеть", "M4 в 20:35 дорога (30 минут) не успевает");

  /* ---------- M5. Конец дня в 21:00 ---------- */
  const PLANTED = { rows: 2, cols: 2, crop: "carrot", sown: [1, 1, 1, 1] };
  await fresh(); await api("setBed", 1, PLANTED); await api("setTime", 1250); await api("goTo", "bed1"); await api("act", "water"); s = await S();
  t.eq([s.time, s.ui.dialog.kind, s.ui.dialog.source, s.ui.dialog.buttons.map((b) => b.id), s.ui.dialog.lines], [1260, "night", "system", ["sleep"], ["Уже 21:00. Пора спать."]], "M5 в 21:00 сразу диалог «Пора спать» с единственной кнопкой");
  t.ok(!(await api("close")).ok && (await dialog()).kind === "night", "M5 диалог ночи нельзя закрыть");
  await fresh(); await api("setBed", 1, PLANTED); await api("setTime", 1255); await api("goTo", "bed1"); s = await S();
  const water = s.ui.menu.buttons.find((b) => b.id === "water");
  t.eq([water.enabled, water.reason], [false, "До 21:00 не успеть"], "M5 в 20:55 кнопка «Полить» серая: «До 21:00 не успеть»");
  t.ok(!(await api("act", "water")).ok && (await S()).time === 1255, "M5 недоступное действие не меняет время");
  await fresh(); await api("setBed", 1, PLANTED); await api("setTime", 1250); await api("goTo", "bed1"); await api("act", "water");
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
  let wb = s.ui.menu.buttons.find((b) => b.id === "water");
  t.eq([s.beds[0].watered, wb.enabled, wb.reason], [true, false, "Сегодня дождь — грядка полита"], "Погода: в дождливый день грядки политы сами");
  t.ok(s.ui.menu.title.includes("Созреет через 3 дня, в воскресенье."), "Меню грядки: «Созреет через 3 дня, в воскресенье.»: " + s.ui.menu.title);
  t.eq(await page.evaluate(() => [1, 4, 18, 14].map((d) => FERMA.logic.weatherOf(d))), ["sun", "rain", "rain", "rain"], "Погода детерминирована");

  /* ---------- Касание и ходьба ---------- */
  await fresh();
  await page.mouse.click(3 * 32 + 16, 4 * 32 + 16);
  await page.waitForFunction(() => FERMA.state().ui.menu && FERMA.state().ui.menu.obj === "house", null, { timeout: 5000 });
  s = await S();
  t.eq([s.ui.menu.obj, s.time, s.player.x, s.player.y], ["house", 420, 4, 7], "Ходьба: касание дома — персонаж идёт к двери бесплатно");
  t.eq(s.ui.menu.buttons.map((b) => b.id), ["piggy", "sleep", "close"], "Меню дома: «Копилка», «Спать» и «Закрыть»");
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
  await api("setBed", 1, { rows: 2, cols: 2, crop: "carrot", sown: [1, 1, 1, 1] });
  await api("goTo", "bed1"); await api("act", "water"); await api("setMoney", 4200); await api("give", "seed:carrot", 7);
  await t.reload();
  s = await S();
  t.eq([s.time, s.money, s.beds[0].watered, s.beds[0].crop, s.inv["seed:carrot"], s.ui.screen], [430, 4200, true, "carrot", 7, null], "A8.1 после перезагрузки время, деньги, посеянная культура, полив и семена на месте");
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
  t.eq([s.v, s.day, s.money, s.ui.screen], [3, 3, 10000, null], "M11 старое сохранение {day:3} дополняется до схемы v3, прогресс не потерян");
  await page.evaluate(() => { localStorage.setItem("ferma-save", "это не json"); });
  await t.reload(); s = await S();
  t.eq([s.v, s.day, s.ui.screen], [3, 1, "start"], "M11 битое сохранение — новая игра и стартовый экран");
  t.eq(await page.evaluate(() => localStorage.getItem("ferma-save-bad")), "это не json", "R5 битая строка не пропала, а скопирована в ferma-save-bad");
  t.ok((await text("#screen")).includes("Ферма у реки"), "M11 стартовый экран с названием");
  await page.click("#screen >> text=Играть"); t.eq((await S()).ui.screen, null, "M11 «Играть» начинает игру");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ferma-save")));
  t.ok(saved.v === 3 && !("ui" in saved) && !("money" in saved) && saved.wallet && saved.goals, "M11 в localStorage лежит JSON схемы v3 без S.ui, с кошельком вместо числа");

  /* ---------- A7. Тексты без ошибок, нет викторин: после каждого вызова ждём 1500 мс ---------- */
  await fresh(); await api("setRealDate", "2026-12-01");
  const log = [];
  async function step(name, ...a) {
    const before = await S();
    await api(name, ...a);
    const now = await S(); await sleep(WAIT);
    const later = await S();
    const body = await page.evaluate(() => document.body.innerText);
    log.push({ name, body, dlg: JSON.stringify(now.ui.dialog), menu: JSON.stringify(now.ui.menu), scr: now.ui.screen });
    const nd = now.ui.dialog, bd = before.ui.dialog;
    // окно, которого не было до вызова, открыто именно этим вызовом (или это системное «пора спать»)
    if (nd && !(bd && bd.kind === nd.kind && bd.source === nd.source)) t.ok(nd.source === name || (nd.source === "system" && nd.kind === "night"), `A7 «${name}»: новое окно «${nd.kind}» открыто вызовом «${nd.source}», а не само`);
    const noPeek = (u) => JSON.stringify(Object.assign({}, u, { peek: 0, peekText: 0 }));   // пузырь подсказки времени гаснет сам через 3 с — это показ, не игровой таймер
    t.ok(noPeek(later.ui) === noPeek(now.ui) && later.time === now.time && later.day === now.day, `A7 «${name}»: за 1,5 с ни окно, ни экран, ни время не изменились сами`);
    return now;
  }
  await step("goTo", "exitFarm"); await step("choose", "post"); await step("choose", "shop"); await step("choose", "go"); await step("setTime", 600); await step("goTo", "shop"); await step("setWallet", { 100: 5, 500: 2, 1000: 10 });
  await step("cart", "carrot", 3); await step("cart", "zucchini", 1); await step("toCashier");
  for (let i = 0; i < 9; i++) await step("coin", 1000);
  await step("coin", 1000); await step("submit"); await step("uncoin", 1000); await step("submit");
  await step("cart", "carrot", 1); await step("toCashier"); await step("coin", 1000); await step("coin", 1000); await step("coin", 1000); await step("submit"); await step("choose", "back"); await step("close");
  await step("goTo", "market"); await step("close"); await step("goTo", "exitVillage"); await step("choose", "go");
  await step("goTo", "bed1"); await step("act", "dig", { rows: 4, cols: 6 }); await step("act", "sow", { crop: "carrot" }); await step("close"); await step("act", "water"); await step("openBag"); await step("close"); await step("openTasks"); await step("close");
  await step("give", "seed:cabbage", 13); await step("give", "seed:zucchini", 4); await step("goTo", "bed2"); await step("act", "dig", { rows: 3, cols: 5 }); await step("act", "sow", { crop: "cabbage" }); await step("close");
  await step("give", "seed:cabbage", 5); await step("goTo", "bed2"); await step("act", "resow"); await step("close"); await step("peek"); await step("askSleep"); await step("choose", "close");
  await step("setTime", 1200); await step("goTo", "bed2"); await step("act", "water"); await step("askSleep"); await step("wake");
  await step("goTo", "bed1"); await step("act", "water"); await step("openAdult"); await step("closeScreen"); await step("sleep");
  const bad = await page.evaluate((log) => {
    const out = [], forb = ["еще", "зеленые", "зеленых", "тетя", "Петр", "пришел", "принес", "растет", "дает", "несет", "ведра", "ждет", "четвертая", "желтый", "польет"];
    const forms = {}; Object.keys(FERMA.data.NOUNS).forEach((n) => FERMA.data.NOUNS[n].forEach((f) => { if (f) (forms[f] = forms[f] || new Set()).add(n); }));
    const text = log.map((l) => l.body + " " + l.dlg + " " + l.menu).join("\n");
    ["undefined", "NaN", "null", "[object", "{", "}"].forEach((w) => { if (log.some((l) => l.body.includes(w))) out.push("на экране «" + w + "»"); });
    forb.forEach((w) => { if (new RegExp("(^|[^а-яё])" + w + "($|[^а-яё])", "i").test(text)) out.push("слово без ё: " + w); });
    // запрещённые сочетания: после «Посеял/Досеял» только винительный падеж, после «Созрел/Созрела» — слово своего рода
    const acc = { "морковь": 1, "кабачок": 1, "капусту": 1 }, fem = { "морковь": 1, "капуста": 1 }, mas = { "кабачок": 1 };
    for (const m of text.matchAll(/(Посеял|Досеял) ([а-яё]+)/g)) if (!acc[m[2]]) out.push("падеж: «" + m[0] + "»");
    for (const m of text.matchAll(/[Сс]озрел(а?) ([а-яё]+)/g)) if (!(m[1] ? fem : mas)[m[2]]) out.push("род: «" + m[0] + "»");
    for (const m of text.matchAll(/(Посеял|Досеял) (капуста)/g)) out.push("именительный: «" + m[0] + "»");
    const seen = new Set();
    for (const m of text.matchAll(/(\d+) ([а-яё]+)/g)) {
      const n = +m[1], w = m[2], key = n + " " + w; if (seen.has(key) || !forms[w]) continue; seen.add(key);
      const ok = [...forms[w]].some((noun) => ["и", "в", "р"].some((c) => { try { return FERMA.logic.nounForm(noun, n, c) === w; } catch (e) { return false; } }));
      if (!ok) out.push("не согласовано: " + key);
    }
    return { out, seen: seen.size };
  }, log);
  t.eq(bad.out, [], "A7 за сессию на экране нет «undefined», «NaN», слов без ё, неверных падежей и несогласованных чисел (проверено пар «число + слово»: " + bad.seen + ")");
  const allText = log.map((l) => l.body + " " + l.dlg).join("\n");
  t.ok(["Посеял морковь на грядке 1", "Посеял капусту на грядке 2", "Досеял капусту на грядке 2", "Досеяно: 2 клетки", "2 клетки остались пустыми", "Тут лишние 10 рублей.", "Сдача", "Спасибо!"].filter((x) => !allText.includes(x)).length <= 1 && allText.includes("Посеял капусту на грядке 2") && allText.includes("Досеял капусту на грядке 2"),
    "A7 в сессии встретились фразы с падежами «Посеял капусту», «Досеял капусту» (проверка не пустая)");
  t.ok(log.every((l) => !/\?/.test(l.body.replace(/Ещё светло\. Точно спать\?/g, "").replace(/Куда идёшь\?/g, ""))), "A7 в сессии нет всплывающих вопросов-викторин: единственные вопросы — «Куда идёшь?» и «Ещё светло. Точно спать?»");

  /* ---------- Настоящий первый день: касания мыши, ходьба, кнопки (не вызовы api) ---------- */
  await page.evaluate(() => { localStorage.clear(); }); await t.reload();
  let clicks = 0;
  const tile = async (x, y) => { const r = await page.locator("#cv").boundingBox(), k = r.width / 1024; return [r.x + (x * 32 + 16) * k, r.y + (y * 32 + 16) * k]; };
  const tapTile = async (x, y) => { const [px, py] = await tile(x, y); clicks++; await page.mouse.click(px, py); await waitIdle(); await sleep(150); };
  const clickText = async (txt) => { clicks++; await page.locator("button:visible", { hasText: txt }).first().click(); await sleep(120); };
  const timeOf = async () => (await S()).time;
  s = await S(); t.eq(s.ui.screen, "start", "День: игра открывается стартовым экраном");
  await clickText("Играть"); s = await S(); t.eq([s.ui.screen, s.ui.dialog && s.ui.dialog.kind], [null, "tasks"], "День: после «Играть» открывается табличка «Дела на сегодня»");
  t.ok((await text("#dlg")).includes("Разметить грядку") && (await text("#dlg")).includes("вырастить первую морковь"), "День: на табличке дел цели и цель про морковь");
  await clickText("Понятно");
  await tapTile(12, 5); s = await S(); t.eq([s.ui.menu && s.ui.menu.obj, s.time], ["bed1", 420], "День: касание грядки — персонаж идёт сам, время не тратится");
  await clickText("Разметить грядку"); await clickText("Разметить — 20 мин"); await clickText("Закрыть");
  await tapTile(21, 5); await clickText("Разметить грядку");
  { const b = await page.locator('.dc[data-r="2"][data-c="5"]').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); clicks++; }
  await clickText("Разметить — 20 мин"); await clickText("Закрыть"); s = await S();
  t.eq([s.beds[0].rows, s.beds[0].cols, s.beds[1].rows, s.beds[1].cols, s.time], [4, 6, 2, 5, 460], "День: грядки 4 × 6 и 2 × 5 размечены, 7:40");
  await tapTile(0, 19); t.eq((await dialog()).kind, "plan", "День: у выхода план дороги");
  await clickText("В магазин"); await clickText("Идти"); s = await S(); t.eq([s.scene, s.time], ["village", 490], "День: в деревне 8:10");
  await tapTile(5, 6); t.eq((await dialog()).kind, "closed", "День: в 8:10 у магазина табличка с часами работы");
  await clickText("Подождать"); s = await S(); t.eq([s.time, (await dialog()).kind], [540, "shop"], "День: подождал до 9:00, магазин открылся");
  t.ok((await text("#dlg")).includes("Грядка 1: 4 ряда по 6 клеток") && (await text("#dlg")).includes("Грядка 2: 2 ряда по 5 клеток"), "День: в магазине видны размеры грядок: 4 ряда по 6 клеток и 2 ряда по 5 клеток");
  for (const [c, n] of [["carrot", 2], ["cabbage", 1]]) for (let i = 0; i < n; i++) { await page.locator(`.shopcard:has(canvas[data-crop="${c}"]) button[aria-label="Больше"]`).click(); clicks++; }
  await clickText("К кассе"); t.eq((await dialog()).lines[0], "С тебя 65 рублей.", "День: кассир называет сумму: 65 рублей");
  for (const c of ["50 ₽", "10 ₽", "5 ₽"]) { await page.locator("#dlg .slot button", { hasText: new RegExp("^" + c + "$") }).click(); clicks++; }
  await clickText("Заплатить"); s = await S();
  t.eq([s.money, s.time, s.inv["seed:carrot"], s.inv["seed:cabbage"]], [3500, 545, 20, 10], "День: куплено на 65 ₽ выложенными монетами: 50 + 10 + 5, осталось 35 ₽");
  await clickText("Закрыть"); await tapTile(31, 9); await clickText("Идти"); s = await S(); t.eq([s.scene, s.time], ["farm", 575], "День: вернулся домой, 9:35");
  await tapTile(12, 5); await clickText("Посеять"); await page.locator("#dlg button", { hasText: "Морковь" }).click(); clicks++; await sleep(120);
  t.ok((await dialog()).reply.includes("4 клетки остались пустыми"), "День: 20 семян на 24 клетки — «4 клетки остались пустыми»");
  await clickText("Закрыть"); await clickText("Полить"); await clickText("Закрыть");
  await tapTile(21, 5); await clickText("Посеять"); await page.locator("#dlg button", { hasText: "Капуста" }).click(); clicks++; await sleep(120); await clickText("Закрыть"); await clickText("Полить"); await clickText("Закрыть");
  s = await S();
  t.ok(s.beds[0].crop === "carrot" && s.beds[1].crop === "cabbage" && s.beds[0].watered && s.beds[1].watered && s.time < 1020, "День: обе грядки засеяны и политы до 17:00, игровое время " + Math.floor(s.time / 60) + ":" + String(s.time % 60).padStart(2, "0"));
  t.eq(await L("todayTasks", s).then((x) => [x.items.map((i) => i.done), x.obj]), [[true, true, true, true], "house"], "День: все дела сделаны, стрелка указывает на дом");
  const chores = s.time;
  await clickText("Спать"); t.eq((await dialog()).kind, "confirm", "День: днём «Спать» спрашивает «Ещё светло. Точно спать?»");
  await page.locator("#dlg button", { hasText: "Спать" }).click(); clicks++; await sleep(200);
  const night = await text("#screen");
  t.ok(night.includes("Грядка 1: морковь подросла.") && night.includes("Грядка 2: капуста подросла.") && night.includes("Посеял морковь на грядке 1"), "День: экран итогов — ночью подросли грядки: " + night.replace(/\n+/g, " | "));
  await clickText("Доброе утро!"); s = await S();
  t.eq([s.day, s.beds[0].growth, s.beds[1].growth, s.ui.screen], [2, 1, 1, null], "День: утром второго дня обе культуры выросли на день");
  console.log(`  (оценка: настоящий первый день — около ${clicks} нажатий, игровое время к концу дел ${Math.floor(chores / 60)}:${String(chores % 60).padStart(2, "0")})`);

  /* ====================== R. Проверки по замечаниям ревьювера ====================== */
  const consoleErrors = []; page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  const wallet100 = { 100: 4, 200: 3, 500: 2, 1000: 3, 5000: 1 };

  /* ---------- R1. После 17:00 купить уже нельзя, даже если окно магазина было открыто ---------- */
  await fresh(); await api("setWallet", { 100: 5, 1000: 20 }); await api("setTime", 1015);
  await api("goTo", "shop"); await api("cart", "carrot", 1); await api("toCashier"); await api("coin", 1000); await api("coin", 1000);
  r = await api("submit"); s = await S(); dl = s.ui.dialog;
  t.eq([r.ok, s.time, s.inv["seed:carrot"], dl.kind, dl.reply], [true, 1020, 10, "closed", "Спасибо! Магазин закрывается."], "R1 покупка в 16:55 проходит, после неё вместо полки «Спасибо! Магазин закрывается.»");
  t.ok(dl.lines.includes("Магазин семян. Открыт каждый день с 9:00 до 17:00.") && dl.lines.includes("Уже закрыто. Приходи завтра.") && !dl.buttons.some((b) => b.id === "wait"), "R1 окно «Закрыто» с часами работы, без «Подождать»");
  const m1 = (await S()).money;
  t.ok(!(await api("cart", "carrot", 1)).ok && !(await api("toCashier")).ok && !(await api("submit")).ok, "R1 вторая покупка в 17:00 отклонена: ни корзины, ни кассы");
  s = await S(); t.eq([s.time, s.inv["seed:carrot"], s.money], [1020, 10, m1], "R1 после отказа время, семена и деньги не изменились");
  await fresh(); await api("setWallet", { 100: 5, 1000: 20 }); await api("setTime", 1000); await api("goTo", "shop"); await api("cart", "carrot", 1); await api("setTime", 1025);
  r = await api("toCashier"); s = await S();
  t.eq([r.ok, s.ui.dialog.kind, s.time], [false, "closed", 1025], "R1 окно полки открыто, время ушло за 17:00 — «К кассе» отказывает и показывает табличку");
  await fresh(); await api("setWallet", { 100: 5, 1000: 20 }); await api("setTime", 1000); await api("goTo", "shop"); await api("cart", "carrot", 1); await api("toCashier"); await api("coin", 1000); await api("coin", 1000); await api("setTime", 1025);
  r = await api("submit"); s = await S();
  t.eq([r.ok, s.ui.dialog.kind, s.inv["seed:carrot"] || 0, s.money], [false, "closed", 0, 20500], "R1 касса открыта, магазин закрылся — «Заплатить» отказывает, семян нет");
  t.eq(s.wallet[1000], 20, "R1 при отказе монеты остаются в кошельке");

  /* ---------- R2. Русский язык: падежи и род культур во всех текстах ---------- */
  const CR = { carrot: { nom: "морковь", acc: "морковь", ripe: "созрела морковь", grew: "морковь подросла.", days: 3 }, zucchini: { nom: "кабачок", acc: "кабачок", ripe: "созрел кабачок", grew: "кабачок подрос.", days: 4 }, cabbage: { nom: "капуста", acc: "капусту", ripe: "созрела капуста", grew: "капуста подросла.", days: 5 } };
  for (const [crop, c] of Object.entries(CR)) {
    await fresh(); await api("setTime", 600); await api("give", "seed:" + crop, 20);
    await api("goTo", "bed1"); await api("act", "dig", { rows: 4, cols: 6 }); await api("act", "sow", { crop }); await api("close");
    await api("give", "seed:" + crop, 10); await api("goTo", "bed1"); await api("act", "resow"); await api("close"); s = await S();
    t.eq(s.log.today, ["Разметил грядку 1: 4 ряда по 6 клеток", "Посеял " + c.acc + " на грядке 1", "Досеял " + c.acc + " на грядке 1"], `R2 «${crop}»: события «Посеял ${c.acc}», «Досеял ${c.acc}» в винительном падеже`);
    await api("goTo", "bed1"); await api("act", "water"); await api("sleep"); s = await S();
    t.eq(s.ui.dayEnd.night, ["Грядка 1: " + c.grew], `R2 «${crop}»: ночью «${c.grew}»`);
    await api("wake"); await api("sleep"); s = await S();
    t.eq(s.ui.dayEnd.night, ["Грядка 1 не выросла: её не полили."], `R2 «${crop}»: неполитая грядка — «не выросла: её не полили»`);
    await api("setBed", 1, { growth: c.days - 1, watered: true }); await api("sleep"); s = await S();
    t.eq(s.ui.dayEnd.night, ["Грядка 1: " + c.ripe + "."], `R2 «${crop}»: созрела — «${c.ripe}»`);
    await api("wake"); await api("goTo", "bed1"); s = await S();
    t.ok(s.ui.menu.title === "Грядка 1: " + c.nom + ". Урожай созрел!" && (await text("#screen")).includes("На ферме ждёт урожай: " + c.nom + "."), `R2 «${crop}»: меню «Урожай созрел!» и экран сна «На ферме ждёт урожай: ${c.nom}.»`);
    t.ok(!/Созрела кабачок|созреет (морковь|кабачок|капуста)/.test(JSON.stringify(s.ui) + (await text("#screen"))), `R2 «${crop}»: нет «Созрела кабачок» и «созреет» про уже созревшее`);
  }

  /* ---------- R3. Окно не затирается концом ходьбы; время при ходьбе стоит ---------- */
  await fresh(); await api("tap", 0, 19); await sleep(400); s = await S();
  const mid = { x: s.player.x, y: s.player.y };
  t.ok(s.ui.walking && s.time === 420 && (mid.x !== 4 || mid.y !== 8), "R3 в середине длинной ходьбы время то же (7:00), персонаж уже сдвинулся: " + JSON.stringify(mid));
  await api("openBag"); s = await S();
  t.eq([s.ui.walking, s.ui.dialog.kind], [false, "bag"], "R3 «Рюкзак» во время ходьбы останавливает персонажа");
  const stop = { x: s.player.x, y: s.player.y }; await sleep(3500); s = await S();
  t.eq([s.ui.dialog && s.ui.dialog.kind, s.player.x, s.player.y, s.time], ["bag", stop.x, stop.y, 420], "R3 рюкзак остаётся открытым, план дороги не подменяет его, персонаж стоит на клетке остановки");
  await api("close"); await fresh(); await api("tap", 13, 9); await sleep(300); await api("askSleep"); await sleep(3000); s = await S();
  t.eq([s.ui.dialog && s.ui.dialog.kind, s.ui.walking, s.ui.menu], ["confirm", false, null], "R3 «Спать» во время ходьбы: вопрос остаётся, меню объекта не открывается под ним");
  await fresh(); await api("tap", 0, 19); await sleep(300); await api("openAdult"); await sleep(3500); s = await S();
  t.eq([s.ui.screen, s.ui.dialog, s.ui.walking], ["adult", null, false], "R3 экран взрослого во время ходьбы: под ним не открывается план дороги");
  await api("closeScreen"); s = await S(); t.eq([s.ui.screen, s.ui.dialog], [null, null], "R3 после закрытия экрана взрослого план дороги не появляется");
  await fresh(); await api("tap", 30, 19); await sleep(300); await api("skipWalk"); s = await S(); t.eq([s.time, s.player.x, s.player.y], [420, 30, 19], "R3 skipWalk доводит до цели, время не потрачено");

  /* ---------- R4. «Полить» только посеянное; «Посеять» серая, если ни одну культуру не успеть ---------- */
  await fresh(); await api("goTo", "bed1"); wb = (await S()).ui.menu.buttons.find((b) => b.id === "water");
  t.eq([wb.enabled, wb.reason, (await api("act", "water")).ok, (await S()).time], [false, "Сначала посей", false, 420], "R4 на неразмеченной земле «Полить» серая: «Сначала посей», время не тратится");
  await api("act", "dig", { rows: 4, cols: 6 }); wb = (await S()).ui.menu.buttons.find((b) => b.id === "water");
  t.eq([wb.enabled, wb.reason], [false, "Сначала посей"], "R4 на размеченной, но пустой грядке «Полить» тоже серая");
  await api("setBed", 1, { crop: "carrot", sown: new Array(24).fill(1) }); await api("goTo", "bed1"); wb = (await S()).ui.menu.buttons.find((b) => b.id === "water");
  t.eq([wb.enabled, wb.reason], [true, ""], "R4 после посева «Полить» доступна");
  await api("setBed", 1, { growth: 3 }); await api("goTo", "bed1"); wb = (await S()).ui.menu.buttons.find((b) => b.id === "water");
  t.eq([wb.enabled, wb.reason], [false, "Урожай уже созрел"], "R4 на созревшей грядке «Полить» серая: «Урожай уже созрел»");
  await fresh(); await api("setBed", 1, { rows: 4, cols: 6 }); await api("give", "seed:carrot", 30); await api("setTime", 1215); await api("goTo", "bed1");
  sb = (await S()).ui.menu.buttons.find((b) => b.id === "sow");
  t.eq([sb.enabled, sb.reason], [false, "До 21:00 не успеть"], "R4 в 20:15 на 30 семян нужно 60 минут — «Посеять» серая с причиной, а не активна");
  await api("give", "seed:carrot", -18); await api("goTo", "bed1"); sb = (await S()).ui.menu.buttons.find((b) => b.id === "sow");
  t.eq(sb.enabled, true, "R4 в 20:15 на 12 семян (2 ряда, 30 минут) «Посеять» доступна");
  await api("setTime", 1250); await api("goTo", "bed1"); sb = (await S()).ui.menu.buttons.find((b) => b.id === "sow");
  t.eq([sb.enabled, sb.reason], [false, "До 21:00 не успеть"], "R4 в 20:50 даже один ряд (15 минут) не успеть — «Посеять» серая");

  /* ---------- R5. Сохранения с битыми полями: игра не падает, холст не замирает ---------- */
  const BAD = [
    ['{"beds":null}', (st) => st.beds.length === 2 && st.beds[0].rows === 0], ['{"time":null,"day":2}', (st) => st.time === 420 && st.day === 2], ['{"inv":null}', (st) => typeof st.inv === "object" && st.inv !== null],
    ['{"beds":[{"id":1}]}', (st) => st.beds.length === 2 && st.beds[0].sown.length === 0], ['{"beds":[{"id":1,"rows":4,"cols":6,"sown":null,"crop":"carrot"}]}', (st) => st.beds[0].rows === 4 && st.beds[0].crop === null && st.beds[0].sown.length === 24],
    ['{"beds":[{"id":2,"rows":2,"cols":3,"sown":[1,1,1,1,1,1],"crop":"cabbage","growth":2}]}', (st) => st.beds.length === 2 && st.beds[1].crop === "cabbage" && st.beds[1].growth === 2], ['{"settings":{"daysPerReal":"x"}}', (st) => st.settings.daysPerReal === 2],
    ['{"real":null}', (st) => st.real && typeof st.real.date === "string"], ['{"wallet":null}', (st) => st.money === 10000], ['{"wallet":{"100":-5}}', (st) => st.money === 10000], ['{"wallet":{"1000":2}}', (st) => st.money === 2000],
    ['{"player":{"x":"a","y":null}}', (st) => st.player.x === 4 && st.player.y === 8], ['{"scene":"moon"}', (st) => st.scene === "farm"], ['{"time":99999}', (st) => st.time === 1260],
    ['{"time":423}', (st) => st.time === 420], ['{"skills":{"pay":null,"change":{"hist":"x"}}}', (st) => !("pay" in st.skills) && Array.isArray(st.skills.change.hist)], ['{"log":{"today":[1,"a"]}}', (st) => st.log.today.length === 1],
    ['{"v":1,"money":6300,"day":3}', (st) => st.v === 3 && st.money === 6300 && st.day === 3 && !("money" in st.wallet)], ['{"wallet":null,"money":4200}', (st) => st.money === 4200], ['{"day":-4}', (st) => st.day === 1]
  ];
  for (const [raw, check] of BAD) {
    await page.evaluate((r) => { localStorage.removeItem("ferma-save-bad"); localStorage.setItem("ferma-save", r); localStorage.removeItem("ferma-testDate"); }, raw);
    const e0 = pageErrors.length + consoleErrors.length;
    await t.reload(); await sleep(150);
    const res = await page.evaluate(() => {
      const st = FERMA.state(), c = document.getElementById("cv").getContext("2d"), pix = () => Array.from(c.getImageData(500, 300, 1, 1).data).join(",");
      const sane = Array.isArray(st.beds) && st.beds.length >= 2 && st.beds.every((b) => Array.isArray(b.sown) && b.sown.length === b.rows * b.cols && Array.isArray(b.highlight)) && st.time >= 420 && st.time <= 1260 && st.time % 5 === 0 &&
        Number.isInteger(st.day) && st.day >= 1 && Number.isFinite(st.money) && st.money >= 0 && (st.scene === "farm" || st.scene === "village") && Number.isInteger(st.player.x) && Number.isInteger(st.player.y);
      const before = pix(); FERMA.api.setTime(st.time < 900 ? 1255 : 480);
      return new Promise((ok) => setTimeout(() => ok({ sane, alive: pix() !== before, ready: FERMA.ready, st }), 160));
    });
    t.ok(res.ready && res.sane && res.alive && pageErrors.length + consoleErrors.length === e0 && check(res.st), `R5 сохранение ${raw}: ферма загрузилась, поля исправлены, холст живой, ошибок нет`);
  }
  for (const raw of ['{"beds":', "[]", "null", "12", '"текст"']) {
    await page.evaluate((r) => { localStorage.removeItem("ferma-save-bad"); localStorage.setItem("ferma-save", r); }, raw);
    await t.reload(); s = await S();
    t.ok((await page.evaluate(() => localStorage.getItem("ferma-save-bad"))) === raw && s.ui.screen === "start" && s.day === 1, `R5 сохранение ${raw} не объект: новая игра, исходная строка скопирована в ferma-save-bad`);
  }

  /* ---------- R6. Экран сна сверяет реальную дату без перезагрузки ---------- */
  const toSleep = async (date) => { await page.evaluate((d) => { localStorage.clear(); FERMA.api.setRealDate(d); FERMA.api.newGame(); FERMA.api.setSetting("daysPerReal", 1); }, date); await api("sleep"); await api("wake"); };
  await toSleep("2026-10-10"); s = await S(); t.eq(s.ui.screen, "sleep", "R6 после лимита дней ферма спит");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); t.eq((await S()).ui.screen, "sleep", "R6 дата та же — на visibilitychange ферма продолжает спать");
  await api("setRealDate", "2026-10-11"); await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); s = await S();
  t.eq([s.ui.screen, s.real, s.day], [null, { date: "2026-10-11", daysToday: 0 }, 2], "R6 дата сменилась без перезагрузки + visibilitychange — ферма проснулась");
  await toSleep("2026-10-10"); await api("setRealDate", "2026-10-11"); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); t.eq((await S()).ui.screen, null, "R6 по focus окна ферма тоже просыпается");
  await toSleep("2026-10-10"); await api("setRealDate", "2026-10-11"); await page.mouse.click(512, 300); await sleep(100); t.eq((await S()).ui.screen, null, "R6 по касанию экрана сна ферма просыпается");
  await api("setRealDate", null);

  /* ---------- R7. «Начать заново» не обходит лимит игровых дней ---------- */
  await toSleep("2026-10-10"); await api("setSetting", "daysPerReal", 2); await api("closeScreen"); await api("sleep"); await api("wake"); s = await S();
  t.eq([s.ui.screen, s.real.daysToday], ["sleep", 2], "R7 два игровых дня за реальную дату — ферма спит");
  await api("openAdult"); await api("resetGame"); s = await S();
  t.eq([s.day, s.real, s.ui.screen, s.settings.daysPerReal], [1, { date: "2026-10-10", daysToday: 2 }, "sleep", 2], "R7 после «Начать заново» счётчик дней сохранён: игра новая, но ферма по-прежнему спит");
  await page.evaluate(() => { localStorage.clear(); FERMA.api.setRealDate("2026-10-10"); FERMA.api.newGame(); }); await api("resetGame"); s = await S();
  t.eq([s.day, s.real.daysToday, s.ui.screen], [1, 0, null], "R7 в обычный день «Начать заново» сразу открывает игру");
  await api("setRealDate", null);

  /* ---------- R8. Кассир на уровне 1 всегда называет сумму ---------- */
  await fresh(); await api("setTime", 600); await api("goTo", "shop"); await api("cart", "carrot", 1); await api("cart", "zucchini", 1); await api("toCashier");
  t.eq((await dialog()).lines, ["С тебя 50 рублей."], "R8 уровень 1, две позиции: «С тебя 50 рублей.»");
  await api("choose", "back"); await api("cart", "carrot", 3); await api("toCashier");
  t.eq((await dialog()).lines, ["С тебя 90 рублей."], "R8 уровень 1, пакетики по 3 штуки: «С тебя 90 рублей.»");
  await api("choose", "back"); await api("setSkill", "pay", { level: 2 }); await api("toCashier");
  t.eq((await dialog()).lines, ["3 пакетика моркови по 20 рублей и 1 пакетик кабачка за 30 рублей."], "R8 уровень 2, две позиции: только состав, сумму считает ребёнок");
  await api("choose", "back"); await api("cart", "carrot", 1); await api("cart", "zucchini", 0); await api("toCashier");
  t.eq((await dialog()).lines, ["С тебя 20 рублей."], "R8 уровень 2, один пакетик: сумму называют");

  /* ---------- R13. Кошелёк из монет и правило кассира ---------- */
  t.eq(await page.evaluate(() => [6300, 3700, 0, 10000, 40, 12340, 150].map((k) => FERMA.logic.makeChange(k))), [{ 100: 1, 200: 1, 1000: 1, 5000: 1 }, { 200: 1, 500: 1, 1000: 3 }, {}, { 10000: 1 }, { 10: 4 }, { 10: 4, 100: 1, 200: 1, 1000: 2, 10000: 1 }, { 50: 1, 100: 1 }], "R13 makeChange жадно: 63 ₽, 37 ₽, 0, 100 ₽, 40 коп., 123 ₽ 40 коп., 1 ₽ 50 коп.");
  const cases = [[{ 5000: 1 }, 4000, false], [{ 5000: 1 }, 5000, true], [{ 10000: 1 }, 6300, false], [wallet100, 6300, true], [wallet100, 9900, true], [wallet100, 10000, true], [wallet100, 10100, false], [wallet100, 4700, true],
    [{ 1000: 1, 500: 1 }, 2000, false], [{ 1000: 1, 500: 1 }, 1500, true], [{ 1000: 1, 500: 1 }, 500, true], [{ 200: 2 }, 300, false], [{ 200: 3, 500: 1 }, 700, true], [wallet100, 0, true], [wallet100, 150, false]];
  t.eq(await page.evaluate((cs) => cs.map((c) => FERMA.logic.canPayExact(c[0], c[1])), cases), cases.map((c) => c[2]), "R13 canPayExact: можно ли набрать цену ровно (сумма подмножества монет)");
  t.eq(await page.evaluate((w) => [[4000, 4000], [4000, 5000], [4000, 3000], [6300, 10000]].map((c) => FERMA.logic.cashierRule(c[1] === 10000 ? { 10000: 1 } : w, c[0], c[1])), wallet100),
    [{ kind: "exact", ok: true, change: 0 }, { kind: "extra", ok: false, diff: 1000, text: "Тут лишние 10 рублей." }, { kind: "short", ok: false, diff: -1000, text: "Не хватает 10 рублей." }, { kind: "change", ok: true, change: 3700, text: "Сдача 37 рублей." }], "R13 правило кассира: ровно, лишние, не хватает, сдача");
  t.eq(await page.evaluate(() => [FERMA.logic.walletSum({ 100: 4, 5000: 1 }), FERMA.logic.changeText(100), FERMA.logic.changeText(2100), FERMA.logic.changeText(2200)]), [5400, "Сдача 1 рубль.", "Сдача 21 рубль.", "Сдача 22 рубля."], "R13 walletSum и «Сдача N рублей» с согласованием");
  await fresh(); s = await S(); t.eq([s.wallet, s.money], [{ 100: 4, 200: 3, 500: 2, 1000: 3, 5000: 1, 10000: 0, 50000: 0 }, 10000], "R13 старт: 100 ₽ = 50 + 3 × 10 + 2 × 5 + 3 × 2 + 4 × 1");
  t.eq(await text("#moneyChip"), "100 ₽", "R13 в HUD по-прежнему общая сумма кошелька");
  await api("setTime", 600); await api("goTo", "shop"); await api("cart", "carrot", 1); await api("toCashier");
  await api("coin", 5000); r = await api("submit"); dl = await dialog(); s = await S();
  t.eq([r.ok, dl.reply, s.money, s.skills.pay.hist], [false, "Тут лишние 30 рублей.", 10000, [0]], "R13 купюра 50 ₽ за пакетик за 20 ₽, когда ровно заплатить можно (10 + 5 + 5): «Тут лишние 30 рублей.»");
  await api("uncoin", 5000); await api("coin", 1000); r = await api("submit"); dl = await dialog();
  t.eq([r.ok, dl.reply], [false, "Не хватает 10 рублей."], "R13 монета 10 ₽ за пакетик 20 ₽: «Не хватает 10 рублей.»");
  await api("coin", 1000); r = await api("submit"); s = await S();
  t.eq([r.ok, (await dialog()).reply, s.money, s.wallet[1000]], [true, "Спасибо! Приходи ещё.", 8000, 1], "R13 ровно 10 + 10: «Спасибо! Приходи ещё.», монеты ушли из кошелька");
  await api("setWallet", { 10000: 1 }); await api("cart", "carrot", 2); await api("toCashier"); t.eq((await dialog()).lines[0], "С тебя 40 рублей.", "R13 кассир называет 40 рублей");
  t.ok(!(await api("coin", 5000)).ok && !(await api("coin", 1000)).ok && (await api("coin", 10000)).ok, "R13 выложить можно только монеты, которые есть: купюры 50 и монеты 10 нет, 100 ₽ есть");
  r = await api("submit"); s = await S(); dl = await dialog();
  t.eq([r.ok, dl.reply, s.wallet, s.money, s.time, s.skills.pay.hist.slice(-1)], [true, "Спасибо! Сдача 60 рублей.", { 100: 0, 200: 0, 500: 0, 1000: 1, 5000: 1, 10000: 0, 50000: 0 }, 6000, 610, [1]], "R13 одна купюра 100 ₽, ровно заплатить нечем: «Сдача 60 рублей.», монеты сдачи 50 + 10 легли в кошелёк, оплата верна");
  await api("openBag"); t.ok((await text("#dlg")).includes("Кошелёк: 60 ₽") && (await page.locator("#dlg .money .stack").count()) === 2, "R13 в рюкзаке виден кошелёк из конкретных монет и купюр");
  await api("setWallet", { 1000: 1 }); await api("close"); await api("goTo", "shop"); await api("cart", "carrot", 1); await api("toCashier");
  t.ok((await api("coin", 1000)).ok && !(await api("coin", 1000)).ok, "R13 одну монету нельзя выложить дважды");
  r = await api("submit"); t.eq([r.ok, (await dialog()).reply], [false, "Не хватает 10 рублей."], "R13 хватило бы целой суммой, но кошелька (10 ₽) на 20 ₽ не хватает — «Не хватает» (в окне кассы предупреждение)");

  /* ---------- R12. Дела на сегодня, стрелка, цель «первая морковь» ---------- */
  const TS = (o) => Object.assign({ beds: [{ id: 1, rows: 0, crop: null, growth: 0, watered: false }, { id: 2, rows: 0, crop: null, growth: 0, watered: false }], inv: {}, scene: "farm", goals: { firstCarrot: false } }, o);
  const tk = async (st) => page.evaluate((x) => { const r = FERMA.logic.todayTasks(x); return [r.items.map((i) => (i.done ? 1 : 0)).join(""), r.next, r.obj, r.allDone]; }, st);
  t.eq(await tk(TS()), ["0000", "dig", "bed1", false], "R12 todayTasks: в начале первое дело — разметить, стрелка на грядку 1");
  t.eq(await tk(TS({ beds: [{ id: 1, rows: 4, crop: null, growth: 0, watered: false }, { id: 2, rows: 0, crop: null, growth: 0, watered: false }] })), ["1000", "buy", "exitFarm", false], "R12 размечено — идти за семенами: стрелка на выход со двора");
  t.eq(await tk(TS({ scene: "village", beds: [{ id: 1, rows: 4, crop: null, growth: 0, watered: false }] })), ["1000", "buy", "shop", false], "R12 в деревне стрелка на магазин");
  t.eq(await tk(TS({ inv: { "seed:carrot": 10 }, beds: [{ id: 1, rows: 4, crop: null, growth: 0, watered: false }] })), ["1100", "sow", "bed1", false], "R12 семена куплены — посеять");
  t.eq(await tk(TS({ scene: "village", inv: { "seed:carrot": 10 }, beds: [{ id: 1, rows: 4, crop: null, growth: 0, watered: false }] })), ["1100", "sow", "exitVillage", false], "R12 семена куплены, а персонаж в деревне — стрелка «Домой»");
  t.eq(await tk(TS({ beds: [{ id: 1, rows: 4, crop: "carrot", growth: 0, watered: false }] })), ["1110", "water", "bed1", false], "R12 посеяно — полить");
  t.eq(await tk(TS({ beds: [{ id: 1, rows: 4, crop: "carrot", growth: 0, watered: true }] })), ["1111", null, "house", true], "R12 всё сделано — стрелка на дом, можно спать");
  t.eq(await tk(TS({ beds: [{ id: 1, rows: 4, crop: "carrot", growth: 3, watered: false }] })), ["1111", null, "house", true], "R12 созревшую грядку поливать не нужно");
  t.eq(await page.evaluate(() => [{ beds: [], goals: { firstCarrot: false } }, { beds: [{ crop: "carrot", growth: 2 }], goals: { firstCarrot: false } }, { beds: [{ crop: "cabbage", growth: 5 }], goals: { firstCarrot: false } }, { beds: [{ crop: "carrot", growth: 3 }], goals: { firstCarrot: true } }].map((x) => FERMA.logic.carrotGoal(x))),
    [{ done: false, days: 3, grown: 0, sown: false }, { done: false, days: 3, grown: 2, sown: true }, { done: false, days: 3, grown: 0, sown: false }, { done: true, days: 3, grown: 3, sown: true }], "R12 carrotGoal: цель «вырасти первую морковь — через 3 дня»");
  await fresh(); await api("closeScreen");
  t.ok((await text("#tasksBtn")) === "Дела 0/4" && (await visible("#tasksBtn")), "R12 в HUD кнопка «Дела 0/4»");
  await page.click("#tasksBtn"); dl = await dialog();
  t.ok(dl.kind === "tasks" && (await text("#dlg")).includes("Дела на сегодня") && (await page.locator("#dlg .task").count()) === 4 && (await page.locator("#dlg .task.next").count()) === 1 && (await page.locator("#dlg .pip").count()) === 3 && (await text("#dlg")).includes("Посей морковь — она растёт 3 дня."), "R12 табличка дел: 4 дела с галочками, подсвечено следующее, полоска цели из 3 делений");
  await api("close");
  const arrowPix = async (x, y) => page.evaluate(([x, y]) => { FERMA.render(); const d = document.getElementById("cv").getContext("2d").getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y]);
  const gold = (p) => p[0] > 240 && p[1] > 190 && p[2] < 120;
  const a1 = await arrowPix(12 * 32 + 16, 7 * 32 + 26); await sleep(400); const a2 = await arrowPix(12 * 32 + 16, 7 * 32 + 26); await sleep(400); const a3 = await arrowPix(12 * 32 + 16, 7 * 32 + 26);
  t.ok(gold(a1) && JSON.stringify(a1) === JSON.stringify(a2) && JSON.stringify(a2) === JSON.stringify(a3), "R12 стрелка над грядкой 1 золотая и неподвижная (не мигает): " + JSON.stringify([a1, a2, a3]));
  await api("setBed", 1, { rows: 2, cols: 2, crop: "carrot", sown: [1, 1, 1, 1], watered: true });
  t.ok(gold(await arrowPix(4 * 32 + 16, 7 * 32 + 26)), "R12 все дела сделаны — стрелка у двери дома");
  await api("setBed", 1, { rows: 2, cols: 2, crop: null, sown: [0, 0, 0, 0], watered: false });
  await api("goTo", "shop"); await api("close"); t.ok(gold(await arrowPix(5 * 32 + 16, 8 * 32 + 26)), "R12 в деревне, когда пора за семенами, стрелка у двери магазина");
  await api("setTime", 600); await api("goTo", "exitVillage"); await api("close");
  // цель: первая морковь созревает, один раз «Первый урожай!»
  await fresh(); await api("setSetting", "daysPerReal", 3); await api("setBed", 1, { rows: 2, cols: 2, crop: "carrot", sown: [1, 1, 1, 1], growth: 2, watered: true }); await api("sleep"); s = await S();
  t.eq([s.ui.dayEnd.first, s.goals.firstCarrot], [{ title: "Первый урожай!", text: "Морковь созрела на грядке 1." }, true], "R12 морковь созрела — «Первый урожай!»");
  t.ok((await text("#screen")).includes("Первый урожай! Морковь созрела на грядке 1."), "R12 «Первый урожай!» на экране итогов");
  await api("wake"); await api("setBed", 1, { growth: 2, watered: true }); await api("setBed", 2, { rows: 2, cols: 2, crop: "carrot", sown: [1, 1, 1, 1], growth: 2, watered: true }); await api("sleep");
  t.eq((await S()).ui.dayEnd.first, null, "R12 второй раз сообщение «Первый урожай!» не повторяется");
  await api("wake"); await api("openTasks"); t.ok((await text("#dlg")).includes("Первый урожай! Морковь выросла.") && (await page.locator("#dlg .pip.on").count()) === 3, "R12 на табличке дел цель выполнена, три деления закрашены");

  /* ---------- R14. Заметная обратная связь: мокрая земля, капли, крупные ростки, звук «готово» ---------- */
  const cellPx = async (x, y, f) => page.evaluate(([x, y, f]) => { FERMA.render(); const c = document.getElementById("cv").getContext("2d"), d = c.getImageData(x * 32, y * 32, 32, 32).data; return f === "green" ? (() => { let n = 0; for (let y = 2; y < 30; y++) for (let x = 2; x < 30; x++) { const i = (y * 32 + x) * 4; if (d[i + 1] > d[i] + 25 && d[i + 1] > d[i + 2] + 25) n++; } return n; })() : (() => { const o = (12 * 32 + 12) * 4; return [d[o], d[o + 1], d[o + 2]]; })(); }, [x, y, f]);
  await fresh(); await api("setBed", 1, { rows: 2, cols: 2, crop: "carrot", sown: [1, 1, 1, 1], growth: 0, watered: false });
  const dry = await cellPx(9, 3, "soil"), g0 = await cellPx(9, 3, "green");
  await api("setBed", 1, { watered: true }); const wet = await cellPx(9, 3, "soil");
  t.ok(wet[0] < dry[0] - 30 && dry[0] > 120 && wet[0] < 100, "R14 после полива земля заметно темнее: сухая " + dry + ", мокрая " + wet);
  const drop = await page.evaluate(() => { const d = document.getElementById("cv").getContext("2d").getImageData(9 * 32 + 5, 3 * 32 + 6, 1, 1).data; return [d[0], d[1], d[2]]; });
  t.ok(drop[2] > 230 && drop[0] > 120, "R14 на мокрой земле видны капли воды: " + drop);
  await api("setBed", 1, { growth: 1 }); const g1 = await cellPx(9, 3, "green"); await api("setBed", 1, { growth: 2 }); const g2 = await cellPx(9, 3, "green"); await api("setBed", 1, { growth: 3 }); const g3 = await cellPx(9, 3, "green");
  t.ok(g0 === 0 && g1 >= 36 && g2 > g1 && g3 > 40, "R14 ростки крупные: зелёных пикселей в клетке по стадиям " + [g0, g1, g2, g3] + " (росток не меньше 6 × 6)");
  await page.addInitScript(() => { window.__osc = 0; const AC = window.AudioContext || window.webkitAudioContext; if (AC) { const f = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__osc++; return f.apply(this, arguments); }; } });
  await t.reload(); await page.mouse.click(800, 40); await fresh(); await api("setBed", 1, { rows: 2, cols: 2, crop: "carrot", sown: [1, 1, 1, 1] }); await api("setTime", 600);
  const osc = () => page.evaluate(() => window.__osc);
  const o0 = await osc(); await api("goTo", "bed1"); await api("act", "water"); const o1 = await osc();
  await api("goTo", "bed2"); await api("act", "dig", { rows: 2, cols: 2 }); const o2 = await osc(); await api("give", "seed:carrot", 4); await api("close"); await api("goTo", "bed2"); await api("act", "sow", { crop: "carrot" }); const o3 = await osc();
  t.eq([o1 - o0, o2 - o1, o3 - o2], [3, 3, 3], "R14 звук «готово» (три тона) после полива, разметки и посева");
  await api("setSetting", "sound", false); await api("close"); await api("goTo", "bed1"); await api("setBed", 1, { watered: false }); await api("goTo", "bed1"); await api("act", "water"); t.eq((await osc()) - o3, 0, "R14 при выключенном звуке «готово» молчит");
  await api("setSetting", "sound", true);

  /* ---------- R11. Часы: 112 px и чёткие на экранах с плотностью 2 ---------- */
  t.ok(await page.evaluate(() => { const b = document.getElementById("clockBtn").getBoundingClientRect(); return b.width >= 110 && b.height >= 110; }), "R11 часы в HUD не меньше 110 px");

  /* ---------- R10, R11. Планшет: касание пальцем, touch-action, часы на плотности 2 ---------- */
  {
    const fsSrc = require("fs").readFileSync(t.file, "utf8");
    t.ok(/-webkit-touch-callout: none/.test(fsSrc) && /user-select: none/.test(fsSrc) && /touch-action: manipulation/.test(fsSrc) && /#cv \{[^}]*touch-action: none/.test(fsSrc), "R10 в CSS: manipulation на кнопках и body, none на canvas, -webkit-touch-callout: none, user-select: none");
    const ctx2 = await t.context.browser().newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, deviceScaleFactor: 2, locale: "ru-RU" });
    const p2 = await ctx2.newPage(), errs2 = []; p2.on("pageerror", (e) => errs2.push(e.message)); p2.on("console", (m) => { if (m.type() === "error") errs2.push(m.text()); });
    await p2.goto("file://" + t.file); await p2.waitForFunction(() => window.FERMA && FERMA.ready); await p2.evaluate(() => { localStorage.clear(); }); await p2.reload(); await p2.waitForFunction(() => window.FERMA && FERMA.ready);
    const cdp = await ctx2.newCDPSession(p2), S2 = () => p2.evaluate(() => FERMA.state());
    const tapXY = (x, y) => p2.touchscreen.tap(x, y);
    const tapBtn = async (txt) => { const bb = await p2.locator("button:visible", { hasText: txt }).first().boundingBox(); await tapXY(bb.x + bb.width / 2, bb.y + bb.height / 2); await p2.waitForTimeout(150); };
    const tapTileT = async (x, y) => { const r = await p2.locator("#cv").boundingBox(); await tapXY(r.x + x * 32 + 16, r.y + y * 32 + 16); await p2.waitForFunction(() => !FERMA.state().ui.walking, null, { timeout: 15000 }); await p2.waitForTimeout(150); };
    const css = await p2.evaluate(() => ["body", "#cv", "#bagBtn", ".card"].map((sel) => { const e = document.querySelector(sel) || document.body; return getComputedStyle(e).touchAction; }));
    t.eq(css, ["manipulation", "none", "manipulation", "pan-y"], "R10 touch-action: body и кнопки — manipulation, canvas — none, карточка — pan-y");
    t.eq((await S2()).ui.screen, "start", "R10 касание: стартовый экран");
    await tapBtn("Играть"); t.eq((await S2()).ui.dialog.kind, "tasks", "R10 касание по кнопке «Играть» открывает табличку дел");
    await tapBtn("Понятно");
    await tapTileT(12, 5); let s2 = await S2(); t.eq([s2.ui.menu && s2.ui.menu.obj, s2.time], ["bed1", 420], "R10 касание пальцем по объекту: персонаж идёт к грядке, меню открыто");
    await tapBtn("Разметить грядку");
    const cellC = async (r, c) => { const bb = await p2.locator(`.dc[data-r="${r}"][data-c="${c}"]`).boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
    const a = await cellC(2, 2), z = await cellC(5, 7);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a] });
    for (let i = 1; i <= 8; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x + (z.x - a.x) * i / 8, y: a.y + (z.y - a.y) * i / 8 }] }); await p2.waitForTimeout(16); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p2.waitForTimeout(150);
    s2 = await S2(); t.eq([s2.ui.dialog.data.rows, s2.ui.dialog.data.cols, s2.ui.dialog.lines[0]], [5, 7, "5 рядов по 7 клеток"], "R10 грядка растягивается пальцем: 5 рядов по 7 клеток");
    t.eq(await p2.evaluate(() => [scrollX, scrollY, visualViewport.scale]), [0, 0, 1], "R10 растягивание не прокрутило и не приблизило страницу");
    await tapBtn("Разметить — 20 мин"); s2 = await S2(); t.eq([s2.beds[0].rows, s2.beds[0].cols, s2.time], [5, 7, 440], "R10 касанием по кнопке грядка размечена 5 × 7, 7:20");
    await tapBtn("Закрыть");
    const [sx, sy] = [300, 500];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy }] }); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx + 70, y: sy }] }); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await p2.waitForTimeout(150); t.eq((await S2()).ui.walking, false, "R10 свайп пальцем по карте не запускает ходьбу");
    const dpr = await p2.evaluate(() => { const c = document.getElementById("clock"); return [c.width, c.height, c.style.width, devicePixelRatio]; });
    t.eq(dpr, [224, 224, "112px", 2], "R11 на экране с плотностью 2 холст часов 224 × 224 пикселя для 112 логических");
    await p2.evaluate(() => FERMA.api.goTo("exitFarm"));
    t.eq(await p2.evaluate(() => { const c = document.getElementById("planClock"); return [c.width, c.style.width]; }), [240, "120px"], "R11 маленькие часы плана дороги тоже учитывают плотность экрана");
    t.eq(errs2, [], "R10 на планшетной странице нет ошибок");
    await ctx2.close();
  }

  /* ---------- R9. Экраны 768×1024, 1366×657, 800×600, 1024×768, 1366×768: кнопки ≥ 48 px ---------- */
  const SIZES = [[1024, 768], [1366, 768], [1366, 657], [800, 600], [768, 1024]];
  const bigCheck = (sel) => page.evaluate((sel) => {
    const small = [];
    document.querySelectorAll(sel).forEach((b) => { const r = b.getBoundingClientRect(), vis = r.width > 0 && b.offsetParent !== null; if (vis && (r.width < 47.9 || r.height < 47.9)) small.push((b.innerText || b.id || b.className).split("\n")[0] + " " + Math.round(r.width) + "×" + Math.round(r.height)); });
    return small;
  }, sel);
  const setups = { "касса": async () => { await fresh(); await api("setTime", 600); await api("goTo", "shop"); await api("cart", "carrot", 1); await api("toCashier"); }, "меню грядки": async () => { await fresh(); await api("goTo", "bed2"); },
    "дела": async () => { await fresh(); await api("openTasks"); }, "план дороги": async () => { await fresh(); await api("goTo", "exitFarm"); }, "экран взрослого": async () => { await fresh(); await api("openAdult"); }, "итоги дня": async () => { await fresh(); await api("sleep"); },
    "амбарная книга": async () => { await fresh(); await ripeBed(1, "carrot", SOWN20); await api("goTo", "bed1"); await api("act", "harvest"); await api("close"); await api("goTo", "shed"); await api("act", "book"); await api("numpad", "21"); },
    "прилавок и сдача": async () => { await fresh(); await giveAll({ "apple:red": 9 }); await api("goTo", "stall"); await api("act", "serve"); await api("coin", 1000); },
    "весы": async () => { await fresh(); await giveAll({ "carrot:big": 30 }); await api("startWeigh", { item: "carrot", target: 2300 }); for (const g of [1000, 1000, 200, 100]) await api("weight", g); await api("submit"); await api("produce", 5); },
    "доска записок": async () => { await fresh(); await giveAll({}); await page.evaluate(() => { for (const [tpl, p] of [["T01", { n: 9, wd: 4 }], ["T07", { n: 6 }], ["T18", { c: 4, n: 28 }], ["T24", { n: 8 }]]) FERMA.api.addOrder(tpl, p, "board"); }); await api("goTo", "notes"); },
    "записка": async () => { await fresh(); const o = await api("addOrder", "T19", { k1: 2, k2: 2, B: 50000 }, "board"); await api("goTo", "notes"); await api("choose", "note:" + o.id); },
    "сдача заказа": async () => { await fresh(); await giveAll({ "zucchini:big": 3, "cabbage:big": 3, "apple:red": 9 }); await api("addOrder", "T19", { k1: 2, k2: 2, B: 50000 }, "active"); await api("goTo", "door_misha"); await api("act", "deliver"); await api("offer", { items: { "zucchini:big": 2 }, change: 30000 }); },
    "копилка": async () => { await fresh(); await api("goTo", "house"); await api("act", "piggy"); await api("coin", 5000); },
    "цены недели": async () => { await fresh(); await api("setDay", 6); await api("goTo", "prices"); },
    "поровну": async () => { await fresh(); await giveAll({ "apple:red": 40 }); await api("goTo", "shed"); await api("act", "share"); for (let i = 0; i < 7; i++) await api("basketTap", i % 3); },
    "корзинки": async () => { await fresh(); await giveAll({ "apple:red": 40 }); await api("goTo", "shed"); await api("act", "basket"); await api("setCount", 6, "baskets"); await api("basketTap", 2); } };
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h }); await sleep(200);
    const k = Math.min(w / 1024, h / 768); let allSmall = [];
    for (const name of Object.keys(setups)) { await setups[name](); await sleep(60); const sm = await bigCheck("button, .coin, .note"); sm.forEach((x) => allSmall.push(name + ": " + x)); }
    t.eq(allSmall, [], `Экран ${w}×${h} (масштаб ${k.toFixed(2)}): все кнопки, монеты и купюры не меньше 48 px`);
    const g = await page.evaluate(() => { const st = document.getElementById("stage").getBoundingClientRect(); return { x: st.x, y: st.y, w: st.width, h: st.height, scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight }; });
    t.ok(Math.abs(g.w - 1024 * k) < 1 && Math.abs(g.x - (w - g.w) / 2) < 1 && Math.abs(g.y - (h - g.h) / 2) < 1 && !g.scroll, `Экран ${w}×${h}: сцена ${Math.round(g.w)}×${Math.round(g.h)} по центру, прокрутки нет`);
    const portrait = h > w;
    const rot = await page.evaluate(() => { const e = document.getElementById("rotate"), st = document.getElementById("stage").getBoundingClientRect(); if (e.hidden) return null; const r = e.getBoundingClientRect(); return { text: e.innerText, overlaps: !(r.top >= st.bottom - 1 || r.bottom <= st.top + 1), inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; });
    t.ok(portrait ? (rot && rot.text.includes("Поверни планшет") && !rot.overlaps && rot.inside) : rot === null, `Экран ${w}×${h}: плашка «Поверни планшет» ${portrait ? "видна в свободной полосе, игру не закрывает" : "не показывается"}`);
    await page.evaluate(() => localStorage.removeItem("ferma-hint-small")); await t.reload(); await sleep(150);
    const hint = await visible("#smallHint");
    t.eq(hint, k < 0.8 && !portrait, `Экран ${w}×${h}: подсказка «Разверните окно пошире» ${k < 0.8 && !portrait ? "показана" : "не показана"}`);
    if (hint) {
      t.ok((await text("#smallHint")).includes("Разверните окно пошире"), "Подсказка: текст «Разверните окно пошире»");
      await page.click("#smallHint button"); await t.reload(); await sleep(150); t.eq(await visible("#smallHint"), false, "Подсказка показывается один раз: после «Понятно» и перезагрузки её нет");
    }
    if (portrait) { await fresh(); await api("goTo", "bed1"); const inside = await page.evaluate(() => { const r = document.getElementById("ctx").getBoundingClientRect(); return !document.getElementById("ctx").hidden && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }); t.ok(inside, "Портрет 768×1024: игра работает, меню грядки целиком на экране"); }
  }
  await page.setViewportSize({ width: 1024, height: 768 }); await sleep(100); await fresh();

  /* ====================== S. Этап 2а: деньги и заказы ====================== */
  const FORB = ["еще", "зеленые", "зеленых", "тетя", "Петр", "пришел", "принес", "растет", "дает", "несет", "ведра", "ждет", "четвертая", "желтый", "польет"];
  // Проверка набора текстов: нет «undefined», «NaN», слов без ё и несогласованных чисел («число + слово из словаря»).
  const langBad = (texts, jsons) => page.evaluate(([texts, jsons, forb]) => {
    const out = [], forms = {}; Object.keys(FERMA.data.NOUNS).forEach((n) => FERMA.data.NOUNS[n].forEach((f) => { if (f) (forms[f] = forms[f] || new Set()).add(n); }));
    const all = texts.concat(jsons).join("\n");
    ["undefined", "NaN", "null", "[object", "{", "}"].forEach((w) => { if (texts.join("\n").includes(w)) out.push("«" + w + "»"); });
    forb.forEach((w) => { if (new RegExp("(^|[^а-яё])" + w + "($|[^а-яё])", "i").test(all)) out.push("слово без ё: " + w); });
    const seen = new Set();
    for (const m of all.matchAll(/(\d+) ([а-яё]+)/g)) {
      const n = +m[1], w = m[2], key = n + " " + w; if (seen.has(key) || !forms[w]) continue; seen.add(key);
      const ok = [...forms[w]].some((noun) => ["и", "в", "р"].some((c) => { try { return FERMA.logic.nounForm(noun, n, c) === w; } catch (e) { return false; } }));
      if (!ok) out.push("не согласовано: " + key);
    }
    return { out, pairs: seen.size };
  }, [texts, jsons || [], FORB]);
  const wsum = (w) => Object.keys(w).reduce((a, k) => a + k * w[k], 0);
  const day1 = async (o) => { await page.evaluate((o) => { localStorage.clear(); FERMA.api.newGame(Object.assign({ seed: 1 }, o || {})); FERMA.api.closeScreen(); }, o); };

  /* ---------- A6. Согласование в записках: 1, 2, 5, 11, 21, 22, 25 и все 28 шаблонов ---------- */
  const N7 = [1, 2, 5, 11, 21, 22, 25];
  const render = (id, p) => page.evaluate(([id, p]) => FERMA.logic.renderNote(id, p).text, [id, p]);
  const want = { T01: ["1 морковку", "2 морковки", "5 морковок", "11 морковок", "21 морковку", "22 морковки", "25 морковок"], T05: ["1 яйцо", "2 яйца", "5 яиц", "11 яиц", "21 яйцо", "22 яйца", "25 яиц"],
    T11: ["1 литр", "2 литра", "5 литров", "11 литров", "21 литр", "22 литра", "25 литров"], T26: ["1 пакетик", "2 пакетика", "5 пакетиков", "11 пакетиков", "21 пакетик", "22 пакетика", "25 пакетиков"],
    T21: ["Через 1 день", "Через 2 дня", "Через 5 дней", "Через 11 дней", "Через 21 день", "Через 22 дня", "Через 25 дней"] };
  for (const id of Object.keys(want)) {
    const got = [];
    for (const n of N7) got.push((await render(id, { n, k: n, d: n, wd: 4, B: 10000 })).includes(want[id][N7.indexOf(n)]));
    t.eq(got, N7.map(() => true), `A6 записка ${id}: числа 1, 2, 5, 11, 21, 22, 25 согласованы (${want[id].join(", ")})`);
  }
  t.eq(await page.evaluate((ns) => ns.map((n) => FERMA.logic.renderNote("T18", { n, c: n }).text.match(/Разложи (\d+ \S+) в (\d+ \S+) поровну/).slice(1, 3).join("|")), N7),
    ["1 яблоко|1 корзинку", "2 яблока|2 корзинки", "5 яблок|5 корзинок", "11 яблок|11 корзинок", "21 яблоко|21 корзинку", "22 яблока|22 корзинки", "25 яблок|25 корзинок"], "A6 записка T18: «Разложи N яблок в M корзинок» — винительный падеж для 1, 2, 5, 11, 21, 22, 25");
  t.eq(await page.evaluate(() => [FERMA.logic.renderNote("T06", { c: 3, k: 6, wd: 4 }).text, FERMA.logic.renderNote("T01", { n: 21, wd: 4 }).text, FERMA.logic.renderNote("T21", { d: 5, n: 2 }).text]),
    ["Мне нужно 3 корзинки по 6 яблок. Только красных! Принеси до пятницы. — бабушка Нюра", "Привет! Принеси мне 21 морковку к пятнице. Только крупные! — Катя", "Через 5 дней ко мне приедет внучка. Принеси в тот день 2 кабачка. Кабачок растёт 4 дня! — бабушка Нюра"], "A6 записки из документа выглядят слово в слово");
  t.eq(await page.evaluate(() => FERMA.logic.splitSentences(FERMA.logic.renderNote("T01", { n: 21, wd: 4 }).text)), ["Привет!", "Принеси мне 21 морковку к пятнице.", "Только крупные!", "— Катя"], "A6 splitSentences режет по предложениям и отделяет подпись");
  t.eq(await page.evaluate(() => FERMA.logic.splitSentences("Отправь посылку до 12:00. Почта открывается в 9:00, дорога туда — 30 минут. — почтальон Вера")), ["Отправь посылку до 12:00.", "Почта открывается в 9:00, дорога туда — 30 минут.", "— почтальон Вера"], "A6 splitSentences не режет внутри «12:00» и «9:00»");
  // все 28 шаблонов с параметрами генератора: ни ошибок согласования, ни запрещённых написаний
  const tplTexts = await page.evaluate(() => {
    const L = FERMA.logic, ids = Object.keys(L.TPL), out = [], got = {};
    const nb = ["nyura", "misha", "katya", "vera", "egor", "petya", "galya", "olya"], big = { "carrot:big": 99, "apple:red": 99, "cabbage:big": 99, "zucchini:big": 99, potato: 99, "pumpkin:big": 99 };
    for (let day = 1; day <= 30; day++) for (let lvl = 1; lvl <= 3; lvl++) ids.forEach((id, i) => {
      const c = { day, wd: L.dateOfDay(day).wd, lvl: () => lvl, inv: big, beds: [], flags: {}, neighbors: nb, features: { animals: true, tape: true } };
      const p = L.TPL[id].gen(L.rng(day * 31 + i * 7 + lvl), c); if (!p) return;
      got[id] = (got[id] || 0) + 1; out.push(L.makeOrder(id, p, { day, seq: out.length + 1 }).text);
    });
    return { out, got, count: ids.length };
  });
  t.eq([tplTexts.count, Object.keys(tplTexts.got).length], [28, 28], "A6 в записках 28 шаблонов, и генератор выдаёт параметры для каждого из них");
  const tb = await langBad(tplTexts.out, []);
  t.eq(tb.out, [], "A6 все 28 шаблонов с параметрами генератора (" + tplTexts.out.length + " записок, проверено пар «число + слово»: " + tb.pairs + ") — без ошибок согласования, «undefined» и слов без ё");
  t.ok(tplTexts.out.every((x) => /— [А-Яа-яё ]+$/.test(x)), "A6 каждая записка подписана: «— Катя», «— дядя Миша»");

  /* ---------- M6. Цены и погода детерминированы, подбор заданий дня тоже ---------- */
  t.eq(await page.evaluate(() => [["apple", 1], ["apple", 6], ["apple", 8], ["zucchini", 3], ["carrot", 1], ["potato", 2], ["pumpkin", 6]].map((a) => FERMA.logic.priceOf(...a))), [1000, 1200, 1100, 3500, 500, 4000, 14000], "M6 priceOf: яблоко 10 ₽, суббота 12 ₽, 8-й день 11 ₽, кабачок в среду 35 ₽");
  t.eq(await page.evaluate(() => { const L = FERMA.logic, a = JSON.stringify(L.weekPrices(9, ["apple", "carrot", "potato"])); return [a === JSON.stringify(L.weekPrices(9, ["apple", "carrot", "potato"])), a === JSON.stringify(L.weekPrices(14, ["apple", "carrot", "potato"])), L.weekPrices(9, ["apple"]).days]; }), [true, true, [8, 9, 10, 11, 12, 13, 14]], "M6 доска цен: одна неделя — одни и те же цены на любой день недели, повторные вызовы дают то же");
  t.eq(await page.evaluate(() => { const L = FERMA.logic, r = []; for (let d = 1; d <= 60; d++) { const a = L.priceOf("apple", d), b = L.priceOf("apple", d); r.push(a === b && a >= 1000 && a <= 1500); } return r.every(Boolean); }), true, "M6 цены на 60 дней вперёд заданы заранее и лежат в границах");
  const srcAll = require("fs").readFileSync(t.file, "utf8");
  t.ok((srcAll.match(/Math\.random\(/g) || []).length === 1 && /setTimeout\(flush, 900 \+ Math\.random/.test(srcAll), "M6 случайности в деньгах и заказах нет: Math.random встречается только в паузе повтора записи в db");
  t.eq(await page.evaluate(() => [FERMA.logic.forecast(3), FERMA.logic.forecastText(3)]), [[{ day: 3, w: "cloud" }, { day: 4, w: "rain" }, { day: 5, w: "sun" }, { day: 6, w: "cloud" }], ["Сегодня облачно.", "Завтра дождь — поливать не нужно. Дождь сам польёт грядки.", "Послезавтра солнце.", "В субботу облачно."]], "M6 прогноз на 3 дня: forecast и forecastText по примерам");
  const planIn = (o) => Object.assign({ skills: {}, day: 1, flags: {}, neighbors: ["nyura", "misha", "katya", "vera"], inv: {}, beds: [], seed: 1, boardCount: 0, lastTpl: {}, features: {} }, o || {});
  t.eq(await page.evaluate((i) => JSON.stringify(FERMA.logic.planDay(i)) === JSON.stringify(FERMA.logic.planDay(i)), planIn()), true, "M6 planDay: два вызова с одним входом дают одно и то же");
  t.ok(await page.evaluate((i) => JSON.stringify(FERMA.logic.planDay(i)) !== JSON.stringify(FERMA.logic.planDay(Object.assign({}, i, { seed: 2 }))), planIn({ day: 3 })), "M6 planDay: другое зерно сохранения — другие записки");
  const weak = { change: { hist: [0, 1, 0, 0, 1, 0, 0, 1, 0, 1], n: 10, ok: 4, level: 1, atLevel: 10, last: 1, errors: [] } };
  const pw = await page.evaluate((i) => FERMA.logic.planDay(i), planIn({ skills: weak, inv: { "zucchini:big": 5, "cabbage:big": 5 } }));
  t.eq([pw.gate.length, pw.notes.some((n) => n.tpl === "T19"), pw.notes.length <= 2], [2, false, true], "M6 слабая «сдача» (40 %): в понедельник оба слота покупателей на месте, записок про сдачу нет");
  const days = await page.evaluate((i) => { const L = FERMA.logic, r = []; for (let d = 1; d <= 40; d++) { const p = L.planDay(Object.assign({}, i, { day: d, neighbors: d >= 12 ? ["nyura", "misha", "katya", "vera", "egor", "petya", "galya", "olya"] : i.neighbors })); r.push([L.dateOfDay(d).wd, p.notes.length, p.mailbox.length, p.gate.length, p.market.length, new Set(p.notes.concat(p.mailbox).map((n) => n.tpl)).size === p.notes.length + p.mailbox.length]); } return r; }, planIn({ inv: { "carrot:big": 30, "apple:red": 30 }, beds: [{ id: 1, rows: 4, cols: 6, crop: "cabbage", sown: new Array(24).fill(1), growth: 0, missed: 0 }] }));
  t.ok(days.every((r) => r[1] >= 1 && r[1] <= 2 && r[2] <= 1 && r[5]) && days.every((r) => (r[0] === 5 ? r[3] === 0 && r[4] === 4 : r[3] === 2 && r[4] === 0)), "M6 за 40 дней: 1–2 записки в день, не больше одной в ящик, повторов в день нет; по субботам 4 покупателя на рынке, в остальные дни 2 у калитки");

  /* ---------- M7. Деньги, весы, упаковка, массивы: чистые функции ---------- */
  t.eq(await page.evaluate(() => [[3000, 1], [5000, 1], [6300, 2], [23000, 4]].map((a) => FERMA.logic.payNote(...a))), [5000, 10000, 10000, 50000], "M7 payNote: купюра покупателя больше суммы");
  t.eq(await page.evaluate(() => [FERMA.logic.checkChange(6300, 10000, 3700), FERMA.logic.checkChange(6300, 10000, 4700), FERMA.logic.checkChange(6300, 10000, 2700)]),
    [{ ok: true, need: 3700, diff: 0 }, { ok: false, need: 3700, diff: 1000, text: "Тут лишние 10 рублей." }, { ok: false, need: 3700, diff: -1000, text: "Не хватает 10 рублей." }], "M7 checkChange: верная сдача, лишние, не хватает");
  t.eq(await page.evaluate(() => { const r = []; for (let g = 0; g <= 10000; g += 100) if (FERMA.logic.checkChange(6300, 10000, g).ok) r.push(g); return r; }), [3700], "A4 из всех сумм сдачи от 0 до 100 ₽ верна только одна: 37 ₽");
  t.eq(await page.evaluate(() => [2300, 1750, 900, 3100, 1400, 50].map((x) => FERMA.logic.weightsFor(x))), [[1000, 1000, 200, 100], [1000, 500, 200, 50], [500, 200, 200], null, [1000, 200, 200], [50]], "M7 weightsFor: гири из набора 1 кг, 500, 200, 100, 50 г");
  t.eq(await page.evaluate(() => [FERMA.logic.balance(2300, 2300), FERMA.logic.balance(2300, 2200), FERMA.logic.balance(2300, 2400), FERMA.logic.tilt(2300, 2200), FERMA.logic.tilt(0, 500), FERMA.logic.fmtMass(2300), FERMA.logic.fmtMass(50), FERMA.logic.fmtMass(2000), FERMA.logic.fmtLen(140)]),
    [0, -1, 1, -6, 12, "2 кг 300 г", "50 г", "2 кг", "1 м 40 см"], "M7 balance, tilt, fmtMass, fmtLen");
  t.eq(await page.evaluate(() => [FERMA.logic.pack(36, 10, 4), FERMA.logic.pack(36, 10, 3), FERMA.logic.pack(36, 10, 5), FERMA.logic.pack(8, 3, 2), FERMA.logic.packText(FERMA.logic.pack(36, 10, 4)), FERMA.logic.packText(FERMA.logic.pack(33, 10, 3))]),
    [{ full: 3, partial: 6, emptyBoxes: 0, outside: 0 }, { full: 3, partial: 0, emptyBoxes: 0, outside: 6 }, { full: 3, partial: 6, emptyBoxes: 1, outside: 0 }, { full: 2, partial: 0, emptyBoxes: 0, outside: 2 }, "3 полные коробки. В 4-й коробке — 6 яиц.", "3 полные коробки. 3 яйца не поместились."], "M7 pack и packText (3 яйца не поместились)");
  t.eq(await page.evaluate(() => [FERMA.logic.packText(FERMA.logic.pack(36, 10, 3)), FERMA.logic.packText(FERMA.logic.pack(31, 10, 3)), FERMA.logic.packText(FERMA.logic.pack(8, 3, 2), "jar")]), ["3 полные коробки. 6 яиц не поместилось.", "3 полные коробки. 1 яйцо не поместилось.", "2 полные банки. 2 литра не поместились."], "M7 packText: «6 яиц не поместилось», «1 яйцо не поместилось», банки и литры");
  t.eq(await page.evaluate(() => { const g = [...new Array(20).fill(1), 0, 0, 0, 0], rc = FERMA.logic.rowCounts(g, 4, 6); return [rc, FERMA.logic.runningTotals(rc), FERMA.logic.shareCheck([6, 6, 6, 6]), FERMA.logic.shareCheck([7, 5, 6, 6])]; }),
    [[6, 6, 6, 2], [6, 12, 18, 20], { equal: true, each: 6 }, { equal: false, diff: [0, 1] }], "M7 rowCounts, runningTotals, shareCheck");
  t.eq(await page.evaluate(() => { let h = []; let sk = null; for (let i = 0; i < 25; i++) { sk = FERMA.logic.recordAttempt(sk, i % 5 !== 0, i % 5 === 0 ? "ошибка " + i : "", 1); h = sk.hist; } return [h.length, sk.n, sk.errors.length, FERMA.logic.skillAcc(h)]; }), [20, 25, 5, 0.8], "Навыки: точность считается за последние 20 попыток из 25, ошибки хранятся как примеры");

  /* ---------- M8. checkOrder: четыре примера из документа, род соседа в реплике ---------- */
  const mk = (id, p, day) => page.evaluate(([id, p, day]) => FERMA.logic.makeOrder(id, p, { day, seq: 5 }), [id, p, day || 1]);
  const chk = (o, offer, ctx) => page.evaluate(([o, offer, ctx]) => FERMA.logic.checkOrder(o, offer, ctx), [o, offer, ctx || { day: 3, time: 600 }]);
  let o6 = await mk("T06", { c: 3, k: 6, wd: 4 });
  t.eq([o6.id, o6.from, o6.deadlineDay], ["o5", "nyura", 5], "M8 makeOrder T06: заказ o5 от Нюры, срок — пятница, 5-й день");
  let r8 = await chk(o6, { baskets: [{ item: "apple:green", n: 6 }, { item: "apple:green", n: 6 }, { item: "apple:green", n: 6 }] });
  t.eq([r8.ok, r8.reason, r8.text, r8.skills], [false, "variety", "Я просила красные.", { readQty: 1, readDetail: 0, readTime: 1 }], "M8 зелёные яблоки вместо красных: «Я просила красные.», страдает «детали»");
  r8 = await chk(o6, { baskets: [{ item: "apple:red", n: 6 }, { item: "apple:red", n: 6 }, { item: "apple:red", n: 6 }] }, { day: 5, time: 600 });
  t.eq([r8.ok, r8.reason], [true, null], "M8 T06: три корзинки по 6 красных в пятницу — принято");
  t.eq((await chk(o6, { baskets: [{ item: "apple:red", n: 6 }, { item: "apple:red", n: 6 }] })).text, "Я просила 3 корзинки.", "M8 не столько корзинок: «Я просила 3 корзинки.»");
  t.eq((await chk(o6, { baskets: [{ item: "apple:red", n: 5 }, { item: "apple:red", n: 6 }, { item: "apple:red", n: 6 }] })).text, "Я просила по 6 яблок в каждой корзинке.", "M8 не столько в корзинке: «Я просила по 6 яблок в каждой корзинке.»");
  let o1S = await mk("T01", { n: 18, wd: 4 });
  r8 = await chk(o1S, { items: { "carrot:big": 16 } });
  t.eq([r8.reason, r8.text, r8.skills.readQty], ["qty", "В записке — 18 морковок. А тут — 16 морковок.", 0], "M8 T01: 16 вместо 18 — «В записке — 18 морковок. А тут — 16 морковок.»");
  t.eq((await chk(o1S, { items: { "carrot:big": 12, "carrot:small": 6 } })).text, "Я просила крупные.", "M8 мелкая морковь вместо крупной: «Я просила крупные.» (Катя — ж. р.)");
  let o9 = await mk("T09", { k: 2, B: 10000 });
  r8 = await chk(o9, { items: { "errand:flour": 2 }, change: 1500 });
  t.eq([r8.reason, r8.text], ["change", "Тут лишние 5 рублей."], "M8 T09: сдача 15 ₽ вместо 10 ₽ — «Тут лишние 5 рублей.»");
  t.eq((await chk(o9, { items: { "errand:flour": 2 }, change: 1000 })).ok, true, "M8 T09: сдача 10 ₽ — принято");
  const o7 = await mk("T07", { n: 6 });
  t.eq([(await chk(o7, { items: { "apple:red": 6 } })).text, (await chk(o6, { baskets: [{ item: "apple:green", n: 6 }] })).text.includes("просила")], ["Я просил зелёные. Красные не надо!", true], "M8 сосед-мужчина говорит «просил», соседка — «просила»");
  const o16 = await mk("T16", { n: 3, wd: 4 });
  t.eq((await chk(o16, { items: { "cabbage:big": 2, "cabbage:small": 1 } })).text, "Маленькие не подойдут, я же писала.", "M8 Галя: «Маленькие не подойдут, я же писала.»");
  const o24 = await mk("T24", { n: 8 });
  t.eq([(await chk(o24, { items: { "apple:red": 6, "apple:green": 2 } })).text, (await chk(o24, { items: { "apple:red": 4, "apple:green": 4 } })).ok], ["Я просила поровну: 4 красных и 4 зелёных.", true], "M8 T24: «половину красных, половину зелёных»");
  const o3S = await mk("T03", { m1: 1000, m2: 500 });
  t.eq((await chk(o3S, { bags: [{ item: "apple", g: 1000 }, { item: "carrot", g: 600 }] })).text, "Тут 600 г. А нужно 500 г.", "M8 T03: мешочек моркови 600 г вместо 500 г");
  const o21 = await mk("T21", { d: 5, n: 2 }, 1);
  r8 = await chk(o21, { items: { "zucchini:big": 2 } }, { day: 3, time: 600 });
  t.eq([r8.reason, r8.text, r8.skills], ["early", "Внучка ещё не приехала. Приходи в субботу.", {}], "M8 T21: раньше срока — «Внучка ещё не приехала. Приходи в субботу.», навык не пишется");
  const o14 = await mk("T14", { n: 2, wd: 4, time: 660 });
  r8 = await chk(o14, { items: { "zucchini:big": 2 } }, { day: 5, time: 700 });
  t.eq([r8.reason, r8.text, r8.closed], ["late", "Оладьи я уже испекла. Приходи с кабачками в другой раз.", true], "M8 T14: после 11:00 в день срока — «Оладьи я уже испекла…», заказ закрыт");
  const o10 = await mk("T10", { wd: 4 }, 1); r8 = await chk(o10, { items: { "pumpkin:big": 1 } }, { day: o10.expireDay, time: 600 });
  t.eq([r8.ok, r8.late, r8.text], [true, true, "Я просила накануне, а праздник уже сегодня. Но всё равно спасибо!"], "M8 T10 в сам день рождения: принимает, но напоминает про «накануне»");
  t.eq(await page.evaluate(() => { const L = FERMA.logic, o = L.makeOrder("T06", { c: 3, k: 6, wd: 4 }, { day: 1, seq: 5 }); return [L.orderErrText(o, "variety", { baskets: [{ item: "apple:green", n: 6 }] }), L.orderErrText(L.makeOrder("T01", { n: 18, wd: 4 }, { day: 1, seq: 1 }), "qty", { items: { "carrot:big": 16 } }), L.orderErrText(L.makeOrder("T01", { n: 18, wd: 4 }, { day: 1, seq: 1 }), "late", {})]; }),
    ["принёс зелёные яблоки вместо красных", "принёс 16 морковок вместо 18", "не успел к пятнице с заказом Кати"], "M8 orderErrText — строки для экрана взрослого");

  /* ---------- Амбарная книга: урожай, пересчёт по рядам, а не «Неверно» ---------- */
  await day1(); await api("goTo", "shed"); s = await S();
  t.eq([s.ui.menu.buttons.find((b) => b.id === "book").enabled, s.ui.menu.buttons.find((b) => b.id === "book").reason], [false, "Нет урожая для записи"], "Книга: пока урожая нет, кнопка «Амбарная книга» серая");
  await ripeBed(1, "carrot", SOWN20); await api("goTo", "bed1"); s = await S();
  t.eq(s.ui.menu.buttons.map((b) => [b.id, b.enabled]), [["harvest", true], ["water", false], ["close", true]], "Урожай: на созревшей грядке есть «Собрать урожай», «Полить» серая");
  t.eq(s.ui.menu.buttons[0].label, "Собрать урожай — 5 мин за ряд", "Урожай: кнопка с длительностью «5 мин за ряд»");
  await api("act", "harvest"); s = await S();
  t.eq([s.time, s.beds[0].crop, s.beds[0].rows, s.harvest.length, s.harvest[0].big, s.harvest[0].small, s.ui.dialog.reply], [440, null, 4, 1, 20, 0, "Урожай в корзине. Запиши его в амбарную книгу в сарае."], "Урожай: 4 ряда — 20 минут, грядка пуста, 20 крупных ждут записи");
  t.ok(!s.inv["carrot:big"], "Урожай: пока он не записан, в рюкзаке его нет");
  await api("openBag"); t.ok((await text("#dlg")).includes("Не записан урожай: морковь, грядка 1"), "Урожай: в рюкзаке пометка «Не записан урожай»"); await api("close");
  await api("goTo", "shed"); t.ok((await text("#ctx")).includes("ждёт записи"), "Книга: у сарая подпись «Урожай ждёт записи в книгу»");
  await api("act", "book"); dl = await dialog(); t.eq([dl.kind, dl.lines[0]], ["book", "Морковь, грядка 1. Сколько собрано?"], "Книга: вопрос «Морковь, грядка 1. Сколько собрано?»");
  t.ok((await page.locator("#bookCv").count()) === 1 && (await text("#dlg")).includes("4 ряда по 6 клеток"), "Книга: рисунок урожая и подпись «4 ряда по 6 клеток»");
  await api("numpad", "24"); r = await api("submit"); dl = await dialog(); s = await S();
  t.eq([r.ok, dl.reply, s.skills.arrays.hist, dl.data.mode], [false, "Давай посчитаем ряды.", [0], "count"], "M9 ошибся (24 вместо 20): «Давай посчитаем ряды.», попытка «массивы» неверная");
  t.ok(s.skills.arrays.errors[0].t.includes("записал 24 вместо 20") && s.skills.arrays.errors[0].t.includes("4 ряда по 6"), "M9 пример ошибки: «" + s.skills.arrays.errors[0].t + "»");
  t.ok(!/неверн|ошибк|неправильн|не так/i.test(await text("#dlg")), "M9 в окне нет слов «неверно», «ошибка», «неправильно»");
  t.eq(await page.locator("#dlg .pad button:disabled").count(), 12, "M9 пока ряды не пересчитаны, клавиатура неактивна");
  await api("choose", "next"); await api("choose", "next"); dl = await dialog();
  t.eq(dl.lines.slice(1), ["Ряд 1: 6. Всего: 6.", "Ряд 2: 6. Всего: 12."], "M9 «Дальше» — ряд за рядом: «Ряд 2: 6. Всего: 12.»");
  await api("choose", "next"); await api("choose", "next"); dl = await dialog();
  t.ok(dl.lines.includes("Ряд 4: 2. Всего: 20.") && dl.reply === "Теперь запиши, сколько всего." && dl.buttons.every((b) => b.id !== "next"), "M9 после четырёх рядов: «Всего: 20», кнопки «Дальше» нет");
  t.eq(await page.locator("#dlg .pad button:disabled").count(), 0, "M9 после пересчёта клавиатура снова активна");
  await api("numpad", "20"); r = await api("submit"); s = await S();
  t.eq([r.ok, s.ui.dialog.reply, s.skills.arrays.hist, s.inv["carrot:big"], s.harvest.length, s.time, s.book[0].n, s.stats.harvested], [true, "Записано: 20 морковок.", [0], 20, 0, 445, 20, 20], "M9 верный ответ после пересчёта: «Записано: 20 морковок.», навык остаётся неверным, урожай в рюкзаке, 5 минут");
  await api("close"); await ripeBed(2, "cabbage", new Array(15).fill(1), { rows: 3, cols: 5 }); await api("goTo", "bed2"); await api("act", "harvest"); await api("close"); await api("goTo", "shed"); await api("act", "book");
  await page.click("#dlg .pad button:text-is('1')"); await page.click("#dlg .pad button:text-is('5')");
  t.eq(await text("#dlg .padval"), "15", "Книга: цифры набираются нажатием на крупные кнопки");
  await page.click("#dlg .pad button:text-is('←')"); t.eq(await text("#dlg .padval"), "1", "Книга: «←» стирает цифру");
  await page.keyboard.press("5"); t.eq(await text("#dlg .padval"), "15", "Книга: цифры с физической клавиатуры тоже работают");
  const keyBoxes = await page.locator("#dlg .pad button").evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  t.ok(keyBoxes.length === 12 && keyBoxes.every((b) => b[0] >= 64 && b[1] >= 64), "Книга: все 12 кнопок клавиатуры не меньше 64 px: " + JSON.stringify(keyBoxes[0]));
  await page.click("#dlg .pad button:text-is('Готово')"); s = await S();
  t.eq([s.ui.dialog.reply, s.skills.arrays.hist, s.inv["cabbage:big"]], ["Записано: 15 кочанов.", [0, 1], 15], "Книга: «Готово» записывает верный ответ с первой попытки — попытка «массивы» верная, «15 кочанов»");
  await api("close"); await ripeBed(1, "carrot", SOWN20, { missed: 2 }); await ripeBed(2, "potato", new Array(15).fill(1), { rows: 3, cols: 5 }); await api("goTo", "bed1"); await api("act", "harvest"); await api("close"); await api("goTo", "bed2"); await api("act", "harvest"); await api("close");
  await api("goTo", "shed"); await api("act", "book"); await api("numpad", "20"); await api("submit"); await api("close"); await api("goTo", "shed"); await api("act", "book"); await api("numpad", "15"); await api("submit"); s = await S();
  t.eq([s.inv["carrot:small"], s.inv["carrot:big"], s.inv.potato, s.book.length], [20, 20, 15, 4], "Урожай: пропущенный полив — мелкая морковь, картофель без размера; записи в книге");
  await day1(); await api("setTime", 1250); await ripeBed(1, "carrot", SOWN20); await api("goTo", "bed1"); s = await S();
  t.eq([s.ui.menu.buttons[0].id, s.ui.menu.buttons[0].enabled, s.ui.menu.buttons[0].reason], ["harvest", false, "До 21:00 не успеть"], "Урожай: в 20:50 четыре ряда не успеть — кнопка серая с причиной");

  /* ---------- Яблоки и раскладывание поровну ---------- */
  await day1(); await api("goTo", "treeRed"); s = await S();
  t.eq([s.ui.menu.buttons[0].label, s.ui.menu.buttons[0].enabled], ["Собрать яблоки — 10 мин", true], "Яблоки: кнопка «Собрать яблоки — 10 мин»");
  await api("act", "pickApples"); s = await S();
  t.eq([s.inv["apple:red"], s.time, s.ui.dialog.reply, s.trees.red.picked], [16, 430, "Собрано: 16 красных яблок.", 1], "Яблоки: красная яблоня даёт 16 яблок за 10 минут");
  await api("close"); s = await S(); t.eq(s.ui.menu.buttons[0].reason, "Яблоки сегодня уже собраны", "Яблоки: второй раз в тот же день — «Яблоки сегодня уже собраны»");
  await api("goTo", "treeGreen"); await api("act", "pickApples"); await api("close"); await api("goTo", "shed"); await api("act", "share"); dl = await dialog();
  t.ok(dl.kind === "share" && dl.data.phase === "fill" && /^Разложи \d+ яблок[а-яё]* в \d+ корзин[а-яё]* поровну\.$/.test(dl.lines[0]) && dl.data.n === dl.data.c * dl.data.k, "Поровну: задание «" + dl.lines[0] + "», яблок ровно столько, чтобы разделилось");
  const sh = dl.data;
  t.ok((await page.locator("#dlg .bskt").count()) === sh.c && (await page.locator("#dlg .bskt button").evaluateAll((bs) => bs.every((b) => { const r = b.getBoundingClientRect(); return r.width >= 64 && r.height >= 64; }))), "Поровну: корзинки с кнопками «+1» и «−» не меньше 64 px");
  for (let i = 0; i < sh.n - 1; i++) await api("basketTap", i % sh.c);
  await api("basketTap", 0); s = await S(); dl = s.ui.dialog; // последнее яблоко в первую корзинку — неровно
  t.ok(dl.data.phase === "fill" && dl.data.pile === 0 && dl.lines.includes("В корзинках поровну не получилось — переложи.") && (await page.locator("#dlg .bskt.warn").count()) > 0, "Поровну: яблок не осталось, корзинки неравны — подсказка «переложи» и оранжевые корзинки");
  r = await api("submit"); t.eq(r.ok, false, "Поровну: пока неравно, записать нельзя");
  await api("basketMove", 0, -1); await api("basketTap", sh.c - 1); dl = await dialog();
  t.ok(dl.data.phase === "write" && dl.lines.join("|") === "Поровну!|Подпиши корзинки: сколько в каждой?", "Поровну: переложил — «Поровну!» и «Подпиши корзинки: сколько в каждой?»");
  await api("numpad", String(sh.k + 1)); r = await api("submit"); s = await S();
  t.eq([r.ok, s.ui.dialog.reply, s.ui.dialog.data.hl, s.skills.divrem.hist], [false, "Посчитай яблоки в одной корзинке.", 0, [0]], "Поровну: неверно подписал — «Посчитай яблоки в одной корзинке.», одна корзинка подсвечена");
  await api("numpad", String(sh.k)); r = await api("submit"); s = await S();
  t.eq([r.ok, s.ui.dialog.reply, s.time], [true, "В каждой корзинке — " + sh.k + " яблок. Яблоки вернулись в рюкзак.", 450], "Поровну: верная подпись — «В каждой корзинке — 5 яблок. Яблоки вернулись в рюкзак.», 10 минут");
  t.eq([s.inv["apple:red"], s.inv["apple:green"], s.baskets.length], [16, 12, 0], "Поровну: учебное задание яблоки не тратит — они вернулись в рюкзак");
  t.eq(s.skills.divrem.hist, [0], "Поровну: после исправления попытка навыка остаётся неверной (пишется только первая)");
  await api("close"); await api("goTo", "shed"); await api("act", "basket"); dl = await dialog();
  t.eq([dl.kind, dl.buttons.map((b) => b.id)], ["basket", ["sort:apple:red", "sort:apple:green", "done", "close"]], "Корзинки: красные и зелёные яблоки, «Готово»");
  await api("setCount", 3, "baskets"); for (const i of [0, 0, 1, 2, 2, 2]) await api("basketTap", i); await api("choose", "sort:apple:green"); dl = await dialog();
  t.eq(dl.data.sort, "apple:green", "Корзинки: можно выбрать зелёные яблоки");
  await api("choose", "done"); s = await S();
  t.eq([s.baskets, s.inv["apple:green"], s.ui.dialog.reply], [[{ item: "apple:green", n: 2 }, { item: "apple:green", n: 1 }, { item: "apple:green", n: 3 }], 6, "Готово: 3 корзинки, всего 6 яблок."], "Корзинки: три корзинки по-разному, 6 зелёных яблок ушли из рюкзака");
  await api("close"); await api("goTo", "shed"); await api("act", "basket"); await api("choose", "unpack"); s = await S();
  t.eq([s.baskets.length, s.inv["apple:green"], s.ui.dialog.reply], [0, 12, "Яблоки вернулись в рюкзак."], "Корзинки: «Высыпать корзинки» возвращает яблоки");
  // поровну по записке T18
  await day1(); await giveAll({ "apple:red": 30 }); const a18 = await api("addOrder", "T18", { c: 3, n: 12 }, "active"); await api("goTo", "shed"); await api("act", "share"); dl = await dialog();
  t.eq([dl.data.phase, dl.lines[0]], ["config", "Сколько яблок и корзинок — написано в записке."], "Поровну по записке: ребёнок сам вводит числа из записки");
  await api("setCount", 13, "apples"); await api("setCount", 3, "baskets"); r = await api("choose", "start"); t.ok(!r.ok && (await dialog()).reply.startsWith("Поровну так не разложить"), "Поровну по записке: 13 яблок в 3 корзинки поровну не выйдет");
  await api("setCount", 12, "apples"); await api("choose", "start"); for (let i = 0; i < 12; i++) await api("basketTap", i % 3); await api("numpad", "4"); r = await api("submit"); s = await S();
  t.eq([r.ok, s.baskets.length, s.baskets[0].n, s.inv["apple:red"]], [true, 3, 4, 18], "Поровну по записке: три корзинки по 4 яблока, 12 яблок потрачено");
  await api("close"); await api("goTo", "door_katya"); await api("act", "deliver"); await api("toggleBasket", 0); r = await api("submit"); s = await S();
  t.ok(r.ok && s.ui.dialog.reply.startsWith("Вот спасибо! Держи") && s.baskets.length === 2 && s.orders.active.length === 0, "Поровну по записке: отдал одну корзинку Кате — «" + s.ui.dialog.reply + "»");

  /* ---------- A4. Продажа за 63 ₽: касса принимает только сдачу 37 ₽ ---------- */
  await day1(); const m0 = (await S()).money;
  await api("startSale", { price: 6300, paid: 10000 }); dl = await dialog();
  t.eq([dl.kind, dl.lines[0]], ["sale", "С меня 63 рубля. Вот 100 рублей."], "A4 покупатель: «С меня 63 рубля. Вот 100 рублей.»");
  for (const c of [1000, 1000, 1000, 1000, 500, 200]) await api("coin", c);
  r = await api("submit"); dl = await dialog();
  t.eq([r.ok, dl.reply, dl.kind, (await S()).money], [false, "Тут лишние 10 рублей.", "sale", m0], "A4 47 ₽ вместо 37 ₽ — «Тут лишние 10 рублей.», окно открыто, деньги не тронуты");
  await api("uncoin", 1000); await api("uncoin", 200); r = await api("submit"); t.eq([r.ok, (await dialog()).reply], [false, "Не хватает 2 рублей."], "A4 35 ₽ — «Не хватает 2 рублей.»");
  await api("coin", 200); r = await api("submit"); s = await S();
  t.eq([r.ok, s.money - m0, s.ui.dialog.reply, s.time, s.skills.change.hist], [true, 6300, "Спасибо!", 430, [0]], "A4 ровно 37 ₽ (10+10+10+5+2): принято, касса выросла на 63 ₽, +10 минут, первая попытка «сдачи» неверная");
  t.eq(s.skills.change.errors[0].t, "дал сдачу 47 ₽ вместо 37 ₽", "A4 пример ошибки для взрослого: «дал сдачу 47 ₽ вместо 37 ₽»");
  const noMoney = await api("coin", 1000); t.ok(!noMoney.ok, "A4 после продажи монеты в сдачу уже не кладутся");
  await api("close"); await api("startSale", { price: 6300, paid: 10000 }); for (const c of [1000, 1000, 1000, 500, 200]) await api("coin", c); await api("submit"); s = await S();
  t.eq(s.skills.change.hist, [0, 1], "A4 верная сдача с первого раза — попытка «сдачи» верная");
  await api("close"); await api("startSale", { price: 6300, paid: 10000 }); t.ok((await page.locator("#dlg button.coin").count()) === 4 && (await page.locator("#dlg button.note").count()) === 1, "A4 касса: монеты 1, 2, 5, 10 ₽ и купюра 50 ₽ (меньше 100 ₽) — без лимита, но без 100 ₽ и 500 ₽");

  /* ---------- Прилавок у калитки и рынок ---------- */
  await day1(); await giveAll({ "apple:red": 20, "carrot:big": 6 });
  const b1 = (await S()).buyers; await day1(); await giveAll({ "apple:red": 20 });
  t.eq([b1.day, b1.gate.length, b1.market.length, b1.gate.map((b) => b.name)], [1, 2, 0, (await S()).buyers.gate.map((b) => b.name)], "Прилавок: в понедельник 2 покупателя у калитки, имена от номера дня — повтор даёт тех же");
  await page.evaluate(() => { FERMA.api.newGame({ seed: 1, day: 6 }); }); s = await S();
  t.eq([s.buyers.gate.length, s.buyers.market.length], [0, 4], "Рынок: в субботу у калитки никого, на рынке 4 покупателя");
  await page.evaluate(() => { FERMA.api.newGame({ seed: 1, day: 7 }); }); s = await S(); t.eq([s.buyers.gate.length, s.buyers.market.length], [2, 0], "Прилавок: в воскресенье снова 2 покупателя у калитки");
  await day1(); await api("goTo", "stall"); s = await S();
  t.eq([s.ui.menu.title, s.ui.menu.buttons[0].enabled, s.ui.menu.buttons[0].reason], ["Прилавок у калитки. Сегодня у калитки ждут: 2 покупателя.", false, "Нечего продавать: в рюкзаке нет урожая"], "Прилавок: «ждут: 2 покупателя», без урожая кнопка серая");
  await giveAll({ "apple:red": 20, "carrot:big": 6 }); await api("goTo", "stall"); s = await S();
  t.eq(s.ui.menu.buttons[0].label, "Обслужить покупателя — 10 мин", "Прилавок: кнопка «Обслужить покупателя — 10 мин»");
  await api("act", "serve"); dl = await dialog(); let w1 = dl.lines[0].match(/^Возьму (\d+) яблок[а-яё]*\. С меня (\d+) рубл[а-яё]+\. Вот (\d+) рубл[а-яё]+\.$/);
  t.ok(w1 && +w1[2] === +w1[1] * 10 && +w1[3] === 50, "Прилавок: покупатель: «" + dl.lines[0] + "» (яблоко 10 ₽ в понедельник, купюра 50 ₽)");
  await page.evaluate((c) => { const g = FERMA.logic.makeChange(c); Object.keys(g).forEach((d) => { for (let i = 0; i < g[d]; i++) FERMA.api.coin(+d); }); }, (50 - +w1[2]) * 100);
  const aBefore = (await S()).inv["apple:red"]; r = await api("submit"); s = await S();
  t.ok(r.ok && s.inv["apple:red"] === aBefore - +w1[1] && s.buyers.gate[0].done && s.skills.change.hist.slice(-1)[0] === 1 && s.log.today.some((x) => x.startsWith("Продал " + w1[1] + " яблок") && x.endsWith("рублей")), "Прилавок: верная сдача — яблоки проданы, покупатель обслужен, событие дня: " + s.log.today.slice(-1));
  await api("close"); await api("goTo", "stall"); s = await S(); t.ok(s.ui.menu.title.includes("ждёт: 1 покупатель"), "Прилавок: «ждёт: 1 покупатель» — согласовано: " + s.ui.menu.title);
  await api("act", "serve"); await api("close"); await api("goTo", "stall"); await api("act", "serve"); dl = await dialog(); t.ok(dl.kind === "sale", "Прилавок: второй покупатель обслуживается");
  t.eq([(await S()).buyers.gate.filter((b) => !b.done).length], [1], "Прилавок: отменённая продажа не засчитывается");
  await api("close"); await day1(); await giveAll({ "apple:red": 20 }); await api("setSetting", "split", false);
  await api("setTime", 1255); await api("goTo", "stall"); s = await S(); t.eq([s.ui.menu.buttons[0].enabled, s.ui.menu.buttons[0].reason], [false, "До 21:00 не успеть"], "Прилавок: поздно вечером кнопка серая «До 21:00 не успеть»");
  // рынок по субботам
  await page.evaluate(() => { localStorage.clear(); FERMA.api.newGame({ seed: 1, day: 6 }); FERMA.api.closeScreen(); }); await giveAll({ "apple:red": 20, "carrot:big": 8, potato: 8 });
  await api("setTime", 470); await api("goTo", "market"); dl = await dialog(); t.ok(dl.kind === "closed" && dl.buttons.some((b) => b.id === "wait" && b.label === "Подождать до 8:00 — 10 мин"), "Рынок: в 7:50 закрыто, можно подождать до 8:00");
  await api("choose", "wait"); s = await S(); t.eq([s.time, s.ui.menu.obj, s.ui.menu.title], [480, "market", "Рынок. Покупателей в очереди: 4."], "Рынок: в субботу в 8:00 открыт, в очереди 4 покупателя");
  await api("act", "trade"); dl = await dialog(); t.ok(dl.kind === "sale" && dl.title === "Рынок", "Рынок: «Торговать» открывает продажу");
  const wishM = dl.data; await page.evaluate((c) => { const g = FERMA.logic.makeChange(c); Object.keys(g).forEach((d) => { for (let i = 0; i < g[d]; i++) FERMA.api.coin(+d); }); }, wishM.paid - wishM.price); await api("submit"); await api("close");
  await api("goTo", "market"); await api("act", "trade"); dl = await dialog();
  t.ok(dl.kind === "weigh" && dl.data.target && dl.data.item === "potato" && dl.lines[0].startsWith("Покупатель просит взвесить: ") && dl.lines[0].endsWith("картошки. Поставь гири."), "Рынок: второй покупатель просит взвесить картошку: «" + dl.lines[0] + "»");
  const tg = dl.data.target, wf = await L("weightsFor", tg); for (const g of wf) await api("weight", g); await api("submit"); await api("produce", tg / 250); r = await api("submit"); dl = await dialog(); s = await S();
  t.ok(r.ok && dl.kind === "sale" && dl.data.items[0].key === "potato" && s.inv.potato === 8 - tg / 250, "Рынок: взвесил картошку, покупатель платит: «" + dl.lines[0] + "», картошка из рюкзака ушла");
  await page.evaluate((c) => { const g = FERMA.logic.makeChange(c); Object.keys(g).forEach((d) => { for (let i = 0; i < g[d]; i++) FERMA.api.coin(+d); }); }, dl.data.paid - dl.data.price); r = await api("submit"); s = await S();
  t.ok(r.ok && s.buyers.market[1].done && s.skills.mass.hist[0] === 1, "Рынок: сдача верна — картошка продана по весу, навык «масса» записан");

  /* ---------- Доска цен ---------- */
  await day1(); await api("goTo", "prices"); dl = await dialog();
  t.ok(dl.kind === "prices" && (await page.locator("#dlg table.pt").count()) === 1 && (await page.locator("#dlg table.pt tr").count()) === 7 && (await page.locator("#dlg table.pt th.today").innerText()) === "Пн", "Цены: таблица «Эта неделя», 6 товаров и сегодняшний столбец «Пн» обведён");
  t.ok((await text("#dlg")).includes("Рынок — в субботу. У калитки покупают каждый день по этим же ценам."), "Цены: подпись про рынок и калитку");
  const row1 = await page.locator("#dlg table.pt tr:nth-child(2) td").allInnerTexts(); t.eq(row1, ["Яблоко, штука", "10 ₽", "10 ₽", "11 ₽", "11 ₽", "10 ₽", "12 ₽", "11 ₽"], "Цены: яблоко по дням недели — как в priceOf");
  await api("setDay", 6); await api("goTo", "prices"); t.eq([await page.locator("#dlg table.pt").count(), (await text("#dlg")).includes("Следующая неделя")], [2, true], "Цены: с субботы видна и следующая неделя");
  await api("setFlag", "kgCarrot", true); await api("goTo", "prices"); t.ok((await text("#dlg")).includes("Морковь, 1 кг") && (await text("#dlg")).includes("60 ₽"), "Цены: после амбара морковь есть и за килограмм");
  await api("setDay", 1); const pr1 = await page.evaluate(() => FERMA.logic.weekPrices(1, ["apple", "potato"])); await t.reload(); t.eq(await page.evaluate(() => FERMA.logic.weekPrices(1, ["apple", "potato"])), pr1, "Цены: после перезагрузки страницы цены недели те же (без случайности)");

  /* ---------- Копилка ---------- */
  await day1(); await api("goTo", "house"); await api("act", "piggy"); dl = await dialog();
  t.eq([dl.kind, dl.lines], ["piggy", ["Цель: Амбар — 900 ₽.", "Накоплено 0 ₽. Осталось 900 ₽."]], "Копилка: «Цель: Амбар — 900 ₽.», «Накоплено 0 ₽. Осталось 900 ₽.»");
  t.eq(dl.buttons.filter((b) => b.row === 1).map((b) => b.label), ["Амбар — 900 ₽", "Курятник — 300 ₽", "Лодка — 1500 ₽"], "Копилка: цели — амбар, курятник, лодка");
  await api("coin", 5000); await api("coin", 1000); await api("coin", 1000); s = await S(); dl = s.ui.dialog;
  t.eq([s.piggy.saved, s.money, dl.lines[1]], [7000, 3000, "Накоплено 70 ₽. Осталось 830 ₽."], "Копилка: положил 50 + 10 + 10 — накоплено 70 ₽, осталось 830 ₽");
  const buyBtn = dl.buttons.find((b) => b.id === "buy"); t.eq([buyBtn.enabled, buyBtn.reason], [false, "Не хватает 830 рублей"], "Копилка: «Купить» серая — «Не хватает 830 рублей»");
  await api("uncoin", 1000); s = await S(); t.eq([s.piggy.saved, s.money], [6000, 4000], "Копилка: монету можно взять обратно");
  t.ok(!(await api("coin", 50000)).ok && !(await api("coin", 5000)).ok, "Копилка: нельзя положить монету, которой нет в кошельке");
  await api("uncoin", 5000); await api("uncoin", 1000); await api("setWallet", { 50000: 1, 10000: 4 }); await api("coin", 50000); for (let i = 0; i < 4; i++) await api("coin", 10000); s = await S(); dl = s.ui.dialog;
  t.eq([s.piggy.saved, dl.buttons.find((b) => b.id === "buy").enabled, await page.locator("#dlg .bar i").evaluate((e) => e.style.width)], [90000, true, "100%"], "Копилка: 900 ₽ накоплено — «Купить: амбар» доступна, полоса полная");
  const barnPx = () => page.evaluate(() => { FERMA.render(); const d = document.getElementById("cv").getContext("2d").getImageData(130, 475, 1, 1).data; return [d[0], d[1], d[2]]; });
  const px0 = await barnPx(); await api("choose", "buy"); s = await S();
  t.eq([s.flags.barn, s.flags.kgCarrot, s.flags.tape, s.piggy.saved, s.piggy.bought, s.piggy.goal, s.ui.dialog.reply], [true, true, true, 0, ["barn"], 1, "Построен амбар!"], "Копилка: куплен амбар — флаги, копилка пуста, следующая цель — курятник");
  t.ok(s.log.today.includes("Построен амбар!"), "Копилка: событие дня «Построен амбар!»");
  const px1 = await barnPx(); t.ok(px0[0] > 200 && px1[0] < 200, "Копилка: на дворе вместо колышков появился амбар с воротами (пиксель " + JSON.stringify(px0) + " → " + JSON.stringify(px1) + ")");
  t.ok((await text("#dlg")).includes("Цель: Курятник — 300 ₽.") && (await api("choose", "goal:2")).ok && (await S()).piggy.goal === 2, "Копилка: цель переключается: курятник, затем лодка");
  await t.reload(); s = await S(); t.eq([s.piggy.bought, s.piggy.goal, s.flags.barn, s.piggy.saved], [["barn"], 2, true, 0], "Копилка: после перезагрузки купленное и цель на месте");
  await page.evaluate(() => { FERMA.api.setFlag("barn", false); FERMA.api.setFlag("coop", true); FERMA.api.setFlag("boat", true); FERMA.render(); });
  const farm1 = await page.screenshot({ clip: { x: 0, y: 96, width: 1024, height: 600 } }); t.ok(farm1.length > 5000, "Копилка: курятник с курами и лодка у причала рисуются без ошибок");
  await api("setFlag", "coop", false); await api("setFlag", "boat", false);

  /* ---------- A5. Весы ---------- */
  await day1(); await giveAll({ "carrot:big": 30 });
  t.eq(await page.evaluate(() => [FERMA.logic.balance(2300, 2300), FERMA.logic.balance(2300, 2200) !== 0, FERMA.logic.balance(2300, 2400) !== 0]), [0, true, true], "A5 balance: только равные массы дают 0");
  await api("startWeigh", { item: "carrot", target: 2300 }); dl = await dialog();
  t.eq([dl.kind, dl.lines[0]], ["weigh", "Нужно: 2 кг 300 г моркови. Поставь гири."], "A5 цель: «Нужно: 2 кг 300 г моркови. Поставь гири.»");
  for (const g of [1000, 1000, 200]) await api("weight", g); r = await api("submit"); dl = await dialog();
  t.eq([r.ok, dl.reply, dl.data.phase], [false, "Гири: 2 кг 200 г. А нужно 2 кг 300 г.", "weights"], "A5 гири 2 кг 200 г: «Гири: 2 кг 200 г. А нужно 2 кг 300 г.»");
  s = await S(); t.eq([s.skills.mass.hist, s.skills.mass.errors[0].t], [[0], "поставил гири 2 кг 200 г вместо 2 кг 300 г"], "A5 первая попытка «масса» неверная, пример для взрослого");
  t.ok(!(await api("produce", 1)).ok, "A5 пока гири не готовы, урожай на чашу не кладётся");
  await api("weight", 100); r = await api("submit"); t.eq([r.ok, (await dialog()).data.phase], [true, "produce"], "A5 гири 2 кг 300 г — «Гири готовы»");
  await api("produce", 22); dl = await dialog(); t.eq([dl.data.balanced, dl.buttons.find((b) => b.id === "bag").enabled], [false, false], "A5 22 морковки (2 кг 200 г): не уравновешено, «В мешок» серая");
  await api("produce", 1); dl = await dialog(); t.eq([dl.data.balanced, dl.buttons.find((b) => b.id === "bag").enabled, dl.lines.includes("Весы уравновешены!")], [true, true, true], "A5 23 морковки (2 кг 300 г): весы уравновешены, «В мешок» доступна");
  await api("produce", 1); dl = await dialog(); t.eq(dl.data.balanced, false, "A5 24 морковки — снова не уравновешено");
  r = await api("submit"); t.ok(!r.ok, "A5 неуравновешенные весы в мешок не отдают");
  await api("produce", -1); r = await api("submit"); s = await S();
  t.eq([r.ok, s.bags, s.inv["carrot:big"], s.time, s.skills.mass.hist], [true, [{ item: "carrot", g: 2300 }], 7, 425, [0]], "A5 в мешок: 2 кг 300 г моркови, 23 морковки ушли, 5 минут");
  const bal = await page.evaluate(async () => { const out = []; FERMA.api.close(); FERMA.api.give("carrot:big", 40); for (const target of [500, 1000, 1500, 2300, 2500]) { FERMA.api.startWeigh({ item: "carrot", target }); FERMA.logic.weightsFor(target).forEach((g) => FERMA.api.weight(g)); FERMA.api.submit(); for (let n = 0; n <= 30; n++) { FERMA.api.produce(n === 0 ? 0 : 1); if ((FERMA.state().ui.dialog.data.balanced) !== (n * 100 === target)) out.push(target + ":" + n); } FERMA.api.close(); } return out; });
  t.eq(bal, [], "A5 для пяти целей и 0–30 морковок весы уравновешены ровно тогда, когда масса точная");
  await api("close"); await api("goTo", "shed"); await api("act", "weigh"); dl = await dialog();
  t.ok(dl.data.phase === "free" && dl.buttons.some((b) => b.id === "item:carrot") && dl.lines[0] === "Положи гири на одну чашу, а урожай — на другую.", "Весы: свободный режим со вкладками урожая");
  await giveAll({ "apple:red": 10 }); await api("choose", "item:apple"); for (const g of [1000, 200, 200]) await api("weight", g); await api("produce", 7); dl = await dialog();
  t.eq([dl.data.balanced, dl.data.item], [true, "apple"], "Весы: 7 яблок по 200 г уравновешивают 1 кг 400 г");
  const w1S = await api("weight", 1000), w2 = await api("weight", 1000); t.eq([w1S.ok, w2.ok], [true, false], "Весы: гирь 1 кг только две, третью поставить нельзя");
  await api("unweight", 1000); await api("unweight", 1000); await api("unweight", 1000); dl = await dialog(); t.eq(dl.data.weights, [200, 200], "Весы: гирю с чаши можно снять");
  const wBtns = await page.locator("#dlg .wt").evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); })); t.ok(wBtns.length >= 5 && wBtns.every((v) => v >= 64), "Весы: гири-кнопки не меньше 64 px: " + wBtns);
  t.ok(await page.evaluate(() => { const c = document.getElementById("scaleCv"); return !!c && c.width >= 560; }), "Весы: чашечные весы нарисованы на холсте");

  /* ---------- Записки: доска, чтение, взятие ---------- */
  await page.evaluate(() => { localStorage.clear(); FERMA.api.newGame({ seed: 4, day: 2 }); FERMA.api.closeScreen(); }); s = await S();
  t.ok(s.orders.board.length >= 1 && s.orders.board.length <= 2 && s.orders.mailbox.length <= 1 && s.orders.board.every((o) => o.text.includes("—") && o.sentences.length >= 2), "Записки: в день на доске 1–2 записки, в ящике 0–1: " + s.orders.board.map((o) => o.tpl) + " / " + s.orders.mailbox.map((o) => o.tpl));
  await api("goTo", "notes"); dl = await dialog(); t.ok(dl.kind === "notes" && dl.buttons.filter((b) => b.id.startsWith("note:")).length === s.orders.board.length && (await page.locator("#dlg .notecard").count()) === s.orders.board.length, "Записки: доска у почты показывает записки бумажками");
  const nid = s.orders.board[0].id; await api("choose", "note:" + nid); dl = await dialog(); s = await S();
  t.eq([dl.kind, dl.lines, dl.buttons.map((b) => b.id)], ["note", [s.orders.board[0].text], ["take", "back"]], "Записки: записка целиком одним абзацем, «Взять заказ» и «Назад»");
  t.eq(await page.locator("#dlg .paper p").count(), 1, "Записки: в настройках по умолчанию текст одним абзацем");
  await api("setSetting", "split", true); await api("goTo", "notes"); await api("choose", "note:" + nid); dl = await dialog(); s = await S();
  t.eq([dl.lines, await page.locator("#dlg .paper p").count()], [s.orders.board[0].sentences, s.orders.board[0].sentences.length], "Записки: разбивка по предложениям — по одному на строке");
  t.ok(s.orders.board[0].sentences.length >= 2 && s.orders.board[0].sentences.length <= 5, "Записки: в записке от двух до пяти строк вместе с подписью: " + s.orders.board[0].sentences.length);
  await api("setSetting", "split", false);
  t.ok(!/вслух|озвуч|прослуш/i.test(await page.evaluate(() => document.body.innerText + JSON.stringify(FERMA.state().ui))), "Записки: кнопки «прочитать вслух» нет нигде");
  const nb0 = s.orders.board.length; await api("choose", "take"); s = await S(); t.eq([s.orders.active.length, s.orders.board.length, (await dialog()).kind, (await dialog()).reply, await text("#ordersBtn")], [1, nb0 - 1, "notes", "Заказ взят. Он в списке «Заказы».", "Заказы 1"], "Записки: «Взять заказ» — заказ в списке, на кнопке «Заказы 1»");
  await api("close"); await api("openOrders"); dl = await dialog(); t.ok(dl.kind === "orders" && dl.lines[0] === "Взято заказов: 1 из 3." && dl.buttons.some((b) => b.id.startsWith("note:")), "Записки: список «Заказы» показывает взятые записки");
  await api("close");
  await page.evaluate(() => { for (const [tpl, p] of [["T01", { n: 5, wd: 4 }], ["T07", { n: 5 }], ["T24", { n: 6 }]]) FERMA.api.addOrder(tpl, p, "board"); }); await api("goTo", "notes"); s = await S();
  await api("choose", "note:" + s.orders.board[0].id); await api("choose", "take"); await api("choose", "note:" + (await S()).orders.board[0].id); await api("choose", "take"); s = await S();
  t.eq(s.orders.active.length, 3, "Записки: можно взять три заказа");
  await api("choose", "note:" + s.orders.board[0].id); dl = await dialog(); const tk4 = dl.buttons.find((b) => b.id === "take"); t.eq([tk4.enabled, tk4.reason, (await api("choose", "take")).ok], [false, "Уже взято 3 заказа", false], "Записки: четвёртый заказ взять нельзя — «Уже взято 3 заказа»");
  await api("close"); await api("close");
  // почтовый ящик и посылки
  await day1(); await api("goTo", "mailbox"); dl = await dialog(); s = await S();
  t.ok(dl.kind === "notes" && s.orders.mailbox.length === 1 && s.orders.mailbox[0].from === "vera", "Ящик: в нечётный день в ящике записка от почтальона Веры");

  /* ---------- Сдача заказов: сосед говорит, что не так, и даёт исправить ---------- */
  const ready = async (extra, o) => { await page.evaluate((o) => { localStorage.clear(); FERMA.api.newGame(Object.assign({ seed: 1 }, o || {})); FERMA.api.closeScreen(); FERMA.api.setTime(600); }, o); await giveAll(extra || {}); };
  const give2 = async (door, offer) => { await api("close"); await api("goTo", door); const r = await api("act", "deliver"); if (!r.ok) return r; await api("offer", offer); return api("submit"); };
  // T06: красные корзинки; зелёные — реплика с причиной
  await ready({ "apple:red": 20, "apple:green": 20 }); await api("addOrder", "T06", { c: 3, k: 6, wd: 4 }, "active");
  await api("goTo", "shed"); await api("act", "basket"); await api("setCount", 3, "baskets"); for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) await api("basketTap", j); await api("choose", "sort:apple:green"); await api("choose", "done");
  r = await give2("door_nyura", { baskets: [0, 1, 2] }); s = await S();
  t.eq([r.ok, s.ui.dialog.reply, s.orders.active.length, s.baskets.length], [false, "Я просила красные.", 1, 3], "Заказ T06: зелёные яблоки вместо красных — «Я просила красные.», заказ остаётся, корзинки у ребёнка");
  t.eq([s.skills.readDetail.hist, s.skills.readDetail.errors[0].t, s.skills.readQty.hist, s.skills.readTime.hist], [[0], "принёс зелёные яблоки вместо красных", [1], [1]], "Заказ T06: навык «детали» неверный с примером «принёс зелёные яблоки вместо красных», «количество» и «срок» верные");
  await api("close"); await api("goTo", "shed"); await api("act", "basket"); await api("choose", "unpack"); await api("setCount", 3, "baskets"); for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) await api("basketTap", j); await api("choose", "done"); await api("close");
  await api("goTo", "door_nyura"); await api("act", "deliver"); await api("offer", { baskets: [0, 1] }); r = await api("submit"); t.eq([r.ok, (await dialog()).reply], [false, "Я просила 3 корзинки."], "Заказ T06: две корзинки вместо трёх — «Я просила 3 корзинки.»");
  await api("toggleBasket", 2); const mBefore = (await S()).money; r = await api("submit"); s = await S();
  t.ok(r.ok && s.ui.dialog.reply === "Вот спасибо! Держи 190 рублей." && s.money - mBefore === 19000 && s.orders.active.length === 0 && s.baskets.length === 0 && s.orders.done.length === 1, "Заказ T06: исправил — принято, награда 18 яблок × 10 ₽ + 10 ₽ = 190 рублей: «" + s.ui.dialog.reply + "»");
  t.eq([s.skills.readDetail.hist, s.skills.readQty.hist, s.time, s.stats.ordersDone, s.log.today.slice(-1)[0]], [[0], [1], 625, 1, "Выполнил заказ Нюры"], "Заказ T06: навыки пишутся по первой сдаче; событие «Выполнил заказ Нюры»");
  // T07 (мальчик), T01 (количество и размер), T16
  await ready({ "apple:red": 20, "carrot:big": 30, "carrot:small": 5, "cabbage:big": 5, "cabbage:small": 5 }, { day: 8 }); await api("addOrder", "T07", { n: 6 }, "active"); await api("addOrder", "T01", { n: 18, wd: 4 }, "active"); await api("addOrder", "T16", { n: 3, wd: 4 }, "active");
  r = await give2("door_egor", { items: { "apple:red": 6 } }); t.eq([r.ok, (await dialog()).reply], [false, "Я просил зелёные. Красные не надо!"], "Заказ T07: Петя (мальчик) — «Я просил зелёные. Красные не надо!»");
  r = await give2("door_katya", { items: { "carrot:big": 16 } }); s = await S(); t.eq([r.ok, s.ui.dialog.reply, s.skills.readQty.errors[0].t], [false, "В записке — 18 морковок. А тут — 16 морковок.", "принёс 16 морковок вместо 18"], "Заказ T01: 16 вместо 18 — «В записке — 18 морковок. А тут — 16 морковок.»");
  await api("offer", { items: { "carrot:big": 13, "carrot:small": 5 } }); await api("submit"); t.eq((await dialog()).reply, "Я просила крупные.", "Заказ T01: мелкие вместо крупных — «Я просила крупные.»");
  await api("offer", { items: { "carrot:big": 18 } }); r = await api("submit"); s = await S(); t.ok(r.ok && s.inv["carrot:big"] === 12 && s.inv["carrot:small"] === 5, "Заказ T01: 18 крупных — принято, из рюкзака ушли только крупные");
  r = await give2("door_galya", { items: { "cabbage:big": 2, "cabbage:small": 1 } }); t.eq([r.ok, (await dialog()).reply], [false, "Маленькие не подойдут, я же писала."], "Заказ T16: Галя — «Маленькие не подойдут, я же писала.»");
  // срок: T14 и T21
  await ready({ "zucchini:big": 5 }); await api("addOrder", "T21", { d: 5, n: 2 }, "active"); r = await give2("door_nyura", { items: { "zucchini:big": 2 } }); s = await S();
  t.eq([r.ok, s.ui.dialog.reply, s.skills.readTime], [false, "Внучка ещё не приехала. Приходи в субботу.", undefined], "Заказ T21: раньше срока — «Внучка ещё не приехала. Приходи в субботу.», навык не пишется");
  await api("setDay", 6); r = await give2("door_nyura", { items: { "zucchini:big": 2 } }); s = await S(); t.ok(r.ok && s.inv["seed:zucchini"] === 10, "Заказ T21: в день приезда внучки принято, в подарок пакетик семян кабачков");
  await ready({ "zucchini:big": 5 }, { day: 12 }); await api("addOrder", "T14", { n: 2, wd: 4, time: 660 }, "active"); await api("setTime", 700); r = await give2("door_olya", { items: { "zucchini:big": 2 } }); s = await S();
  t.eq([r.ok, s.ui.dialog.reply, s.orders.active.length], [false, "Оладьи я уже испекла. Приходи с кабачками в другой раз.", 0], "Заказ T14: после 11:00 в день срока — «Оладьи я уже испекла…», заказ закрыт");
  t.eq([s.skills.readTime.hist, s.log.today.slice(-1)[0]], [[0], "Не успел заказ Оли — срок был до 11:00"], "Заказ T14: «срок» неверный, событие «Не успел заказ Оли — срок был до 11:00»");
  // ночью заказ с истёкшим сроком закрывается
  await ready({ "carrot:big": 5 }); await api("addOrder", "T01", { n: 5, wd: 1 }, "active"); s = await S(); const dlDay = s.orders.active[0].deadlineDay;
  for (let i = s.day; i <= dlDay; i++) { await api("sleep"); await api("wake"); }
  s = await S(); t.eq([s.orders.active.length, s.skills.readTime.hist, s.skills.readTime.errors[0].t], [0, [0], "не успел ко вторнику с заказом Кати"], "Срок: ночью после срока заказ закрывается, «срок» неверный: «не успел ко вторнику с заказом Кати»");
  t.ok(s.log.days.some((d) => d.events.includes("Не успел заказ Кати — срок был до вторника")), "Срок: в событиях дня «Не успел заказ Кати — срок был до вторника»");
  // поручения с конвертом
  await ready({}); const e2 = await api("addOrder", "T02", { k: 2, p: 15, B: 10000, e: "dill", seed: "укропа" }, "active"); s = await S();
  t.eq([Object.keys(s.orders.envelopes), wsum(s.orders.envelopes[e2.id])], [[e2.id], 10000], "Поручение T02: при взятии в конверте 100 ₽ соседа");
  await api("goTo", "shop"); dl = await dialog(); t.ok(dl.buttons.some((b) => b.id === "errands" && b.label === "Для заказов"), "Поручение: в магазине появился раздел «Для заказов»");
  await api("choose", "errands"); await api("cartErrand", "errand:parsley", 2); r = await api("toCashier"); t.eq([r.ok, (await dialog()).reply], [false, "Для этого товара нет поручения."], "Поручение: петрушку по заказу не просили — касса отказывает");
  await api("cartErrand", "errand:dill", 2); await api("toCashier"); dl = await dialog(); t.eq([dl.lines[0], await text("#dlg h3:nth-of-type(2)")], ["2 пакетика укропа по 15 рублей.", "Конверт с деньгами"], "Поручение: касса называет состав, платить надо из конверта");
  await api("coin", 5000); r = await api("submit"); t.eq([r.ok, (await dialog()).reply], [false, "Тут лишние 20 рублей."], "Поручение: купюра 50 ₽ вместо 30 ₽, а ровно набрать можно — «Тут лишние 20 рублей.»");
  await api("uncoin", 5000); for (const c of [1000, 1000, 1000]) await api("coin", c); r = await api("submit"); s = await S();
  t.eq([r.ok, s.inv["errand:dill"], wsum(s.orders.envelopes[e2.id]), s.skills.twostep.hist, s.money], [true, 2, 7000, [0], 10000], "Поручение: заплатил из конверта 3 × 10 ₽, свои деньги целы, навык «задачи в 2 действия» записан");
  await api("close"); r = await give2("door_misha", { items: { "errand:dill": 2 } }); s = await S();
  t.ok(r.ok && s.money === 10000 + 7000 + 2000 && s.ui.dialog.reply === "Вот спасибо! Держи 20 рублей.", "Поручение T02: «сдачу оставь себе» — 70 ₽ из конверта и 20 ₽ награды ушли в кошелёк");
  await day1(); await api("goTo", "door_galya"); s = await S(); t.eq(s.ui.menu.title, "В этом доме пока никто не живёт.", "Поручение T09: тётя Галя переезжает только на 8-й день");
  await ready({}, { day: 8 }); const e9 = await api("addOrder", "T09", { k: 2, B: 10000 }, "active"); await api("goTo", "shop"); await api("choose", "errands"); await api("cartErrand", "errand:flour", 2); await api("toCashier");
  for (const c of [5000, 1000, 1000, 1000, 500, 500]) await api("coin", c); r = await api("submit"); s = await S(); t.eq([r.ok, wsum(s.orders.envelopes[e9.id])], [true, 1000], "Поручение T09: 2 мешка по 45 ₽ = 90 ₽ оплачены из конверта, в нём осталось 10 ₽");
  await api("close"); await api("goTo", "door_galya"); await api("act", "deliver"); await api("offer", { items: { "errand:flour": 2 } }); for (let i = 0; i < 3; i++) await api("coin", 200); r = await api("submit"); dl = await dialog();
  t.eq([r.ok, dl.reply], [false, "Не хватает 4 рублей."], "Поручение T09: «Сдачу принеси мне» — 6 ₽ вместо 10 ₽: «Не хватает 4 рублей.»");
  for (let i = 0; i < 4; i++) await api("coin", 100); r = await api("submit"); s = await S(); t.ok(r.ok && s.orders.active.length === 0 && s.skills.twostep.hist.slice(-1)[0] === 0, "Поручение T09: ровно 10 ₽ сдачи принято, навык «2 действия» по первой сдаче неверный");
  // T19 продажа соседу и T03 вес
  await ready({ "zucchini:big": 3, "cabbage:big": 3 }); await api("addOrder", "T19", { k1: 1, k2: 2, B: 50000 }, "active"); const pz = await page.evaluate(() => FERMA.logic.priceOf("zucchini", 1) + 2 * FERMA.logic.priceOf("cabbage", 1));
  await api("goTo", "door_misha"); await api("act", "deliver"); await api("offer", { items: { "zucchini:big": 1, "cabbage:big": 2 }, change: 50000 - pz + 500 }); r = await api("submit"); t.eq([r.ok, (await dialog()).reply], [false, "Тут лишние 5 рублей."], "Заказ T19: сдача на 5 ₽ больше — «Тут лишние 5 рублей.»");
  await api("offer", { change: 50000 - pz }); const mm = (await S()).money; r = await api("submit"); s = await S(); t.ok(r.ok && s.money - mm === pz && s.skills.change.hist.slice(-1)[0] === 0 && s.skills.twostep.hist.slice(-1)[0] === 0, "Заказ T19: ровная сдача по ценам с доски принята, деньги за товар получены, навыки по первой сдаче");
  await ready({ "apple:red": 20, "carrot:big": 30 }); await api("addOrder", "T03", { m1: 1000, m2: 500 }, "active"); await api("goTo", "shed"); await api("act", "weigh"); await api("choose", "item:apple"); await api("weight", 1000); await api("produce", 5); await api("submit");
  await api("close"); await api("goTo", "shed"); await api("act", "weigh"); await api("choose", "item:carrot"); for (const g of [500, 100]) await api("weight", g); await api("produce", 6); await api("submit"); s = await S();
  t.eq(s.bags, [{ item: "apple", g: 1000 }, { item: "carrot", g: 600 }], "Заказ T03: взвешены мешочки яблок 1 кг и моркови 600 г (ошибся на 100 г)");
  await api("close"); await api("goTo", "door_nyura"); await api("act", "deliver"); await api("toggleBag", 0); await api("toggleBag", 1); r = await api("submit"); s = await S();
  t.eq([r.ok, s.ui.dialog.reply, s.skills.mass.hist, s.skills.mass.errors[0].t], [false, "Тут 600 г. А нужно 500 г.", [0], "взвесил не ту массу (заказ Нюры)"], "Заказ T03: «Тут 600 г. А нужно 500 г.», навык «масса» неверный");

  /* ---------- Почта и встречи у колодца ---------- */
  await ready({}); await page.evaluate(() => { FERMA.api.setDay(3); }); const t4 = await api("addOrder", "T04", { time: 720 }, "mailbox"); await api("goTo", "mailbox"); await api("choose", "note:" + t4.id); await api("choose", "take"); s = await S();
  t.eq([s.inv.parcel, s.orders.active.length], [1, 1], "Почта T04: записка в ящике, посылка при взятии лежит в рюкзаке");
  await api("close"); await api("setTime", 640); await api("goTo", "post"); s = await S(); t.eq([s.ui.menu.buttons.map((b) => b.id), s.ui.menu.buttons[0].enabled], [["postSend", "postTake", "close"], true], "Почта: «Отправить посылку», «Забрать посылку»");
  await api("act", "postSend"); s = await S(); t.eq([s.ui.dialog.reply.startsWith("Посылка отправлена."), s.time, s.inv.parcel, s.skills.duration.hist, s.skills.clock.hist, s.orders.active.length], [true, 650, 0, [1], [1], 0], "Почта T04: отправил в 10:40 до 12:00 — принято, навыки «длительность» и «часы» верные");
  await ready({}); await page.evaluate(() => FERMA.api.setDay(3)); const t4b = await api("addOrder", "T04", { time: 720 }, "active"); await api("setTime", 715); await api("goTo", "post"); await api("act", "postSend"); s = await S();
  t.eq([s.ui.dialog.reply, s.skills.duration.hist, s.skills.clock.errors[0].t, s.orders.active.length], ["Уже поздно: посылку нужно было отправить до 12:00.", [0], "отправил посылку в 11:55, а нужно было до 12:00", 0], "Почта T04: в 11:55 уже не успеть — «Уже поздно…», навыки неверные с примером");
  await ready({}); await page.evaluate(() => FERMA.api.setDay(3)); await api("addOrder", "T13", {}, "active"); await api("goTo", "post"); await api("act", "postTake"); s = await S(); t.eq([s.inv["seed:carrot"], s.time, s.ui.dialog.reply], [20, 605, "Посылка получена. В ней — 2 пакетика семян моркови."], "Почта T13: забрал посылку — 2 пакетика (20 семян) моркови");
  await api("setTime", 1090); await api("goTo", "post"); t.eq((await dialog()).kind, "closed", "Почта: после 18:00 закрыта");
  await ready({}); await page.evaluate(() => FERMA.api.setDay(5)); await api("addOrder", "T08", { time: 900 }, "active"); await api("setTime", 840); await api("goTo", "well"); await api("act", "help"); dl = await dialog();
  t.eq([dl.kind, dl.lines[0], dl.buttons[0].label], ["meetWait", "Деда Егора ещё нет. Он будет в 15:00.", "Подождать до 15:00 — 60 мин"], "Встреча T08: пришёл в 14:00 — «Деда Егора ещё нет. Он будет в 15:00.» и «Подождать до 15:00 — 60 мин»");
  await api("choose", "wait"); s = await S(); t.ok(s.ui.dialog.kind === "info" && s.time === 930 && s.orders.active.length === 0 && s.skills.clock.hist[0] === 1 && s.money === 13000, "Встреча T08: подождал до 15:00, помог за 30 минут (15:30), награда 30 ₽, «часы» верно");
  await ready({}); await page.evaluate(() => FERMA.api.setDay(5)); await api("addOrder", "T08", { time: 900 }, "active"); await api("setTime", 940); await api("goTo", "well"); await api("act", "help"); s = await S();
  t.eq([s.ui.dialog.reply, s.skills.clock.hist, s.skills.clock.errors[0].t], ["Деда Егора уже нет. Он ждал в 15:00.", [0], "пришёл к колодцу в 15:40, а дед Егор ждал в 15:00"], "Встреча T08: пришёл в 15:40 — «Деда Егора уже нет», пример «пришёл к колодцу в 15:40, а дед Егор ждал в 15:00»");

  /* ---------- Соседи открываются по дням ---------- */
  await day1(); await api("goTo", "door_egor"); s = await S(); t.eq([s.ui.menu.title, s.ui.menu.buttons.map((b) => b.id), s.neighbors.includes("egor")], ["В этом доме пока никто не живёт.", ["close"], false], "Соседи: в доме деда Егора до 5-го дня никто не живёт");
  await api("setDay", 4); await api("sleep"); await api("wake"); s = await S(); t.ok(s.day === 5 && s.neighbors.includes("egor") && s.neighbors.includes("petya") && s.log.today.includes("В деревню переехал дед Егор"), "Соседи: на 5-й день переезжают Егор и Петя, событие «В деревню переехал дед Егор»");
  await api("goTo", "door_egor"); s = await S(); t.eq(s.ui.menu.title, "Дом: дед Егор и Петя", "Соседи: «Дом: дед Егор и Петя»");

  /* ---------- Рюкзак, экран взрослого с примерами ошибок, сохранение v3 ---------- */
  await day1(); await giveAll({ "carrot:big": 7, "errand:flour": 2, parcel: 1 }); await api("openBag"); const bg = await text("#dlg");
  t.ok(bg.includes("Морковь крупная: 7") && bg.includes("Мука: 2 мешка") && bg.includes("Посылка для почты"), "Рюкзак: урожай, покупки для заказов и посылка");
  await api("close");
  await api("setSkill", "change", { hist: [0, 0, 0, 0, 0].concat(new Array(19).fill(1), [0]), n: 25, ok: 19, level: 2, last: 5, errors: [{ day: 3, t: "дал сдачу 47 ₽ вместо 37 ₽" }] }); await api("setSkill", "readDetail", { hist: [1, 0], n: 2, ok: 1, level: 1, last: 4, errors: [{ day: 4, t: "принёс зелёные яблоки вместо красных" }] }); await api("openAdult"); const ad = await text("#screen");
  t.ok(ad.includes("дал сдачу 47 ₽ вместо 37 ₽") && ad.includes("принёс зелёные яблоки вместо красных") && ad.includes("день 3 —") && ad.includes("последний раз: день 5"), "Взрослый: примеры ошибок «дал сдачу 47 ₽ вместо 37 ₽» и «принёс зелёные яблоки вместо красных»");
  t.ok(ad.includes("19 из 20") && !ad.includes("из 25") && ad.includes("уровень 2") && ad.includes("1 из 2"), "Взрослый: точность — только последние 20 попыток («19 из 20», а не 22), уровень, «1 из 2»");
  t.eq(await page.locator("#screen .skill .sbar i").evaluateAll((es) => es.map((e) => e.style.width).slice(3, 4)), ["95%"], "Взрослый: полоса точности по последним 20 попыткам (95 %)");
  t.ok(ad.includes("Выполнено заказов: 0") && ad.includes("Записки по предложениям"), "Взрослый: сводка и настройка «Записки по предложениям»");
  await api("closeScreen");
  // схема v3 и миграция
  await page.evaluate(() => { localStorage.setItem("ferma-save", JSON.stringify({ v: 2, day: 4, wallet: { 5000: 1 }, inv: { "carrot:big": 3 } })); }); await t.reload(); s = await S();
  t.eq([s.v, s.day, s.money, s.inv["carrot:big"], s.orders.lastTpl, s.stats, s.piggy], [3, 4, 5000, 3, {}, { sold: 0, ordersDone: 0, harvested: 0, hseq: 0 }, { saved: 0, goal: 0, bought: [] }], "Схема v3: сохранение v2 дополняется заказами, статистикой и копилкой без потери прогресса");
  const BAD3 = [['{"orders":null}', (st) => Array.isArray(st.orders.board) && st.orders.seq === 0], ['{"orders":{"board":[{"id":"x"}],"active":"a"}}', (st) => st.orders.board.length === 0 && Array.isArray(st.orders.active)], ['{"buyers":"x"}', (st) => Array.isArray(st.buyers.gate)],
    ['{"piggy":{"saved":"много","goal":99,"bought":["дом"]}}', (st) => st.piggy.saved === 0 && st.piggy.goal === 0 && st.piggy.bought.length === 0], ['{"harvest":[{"id":"h1"},5,null]}', (st) => st.harvest.length === 0], ['{"stats":{"sold":-3}}', (st) => st.stats.sold === 0],
    ['{"bags":[{"item":"x","g":"y"}],"baskets":[{"item":"apple:red","n":3}]}', (st) => st.bags.length === 0 && st.baskets.length === 1], ['{"neighbors":["nyura",7,"никто"]}', (st) => st.neighbors.length === 1]];
  for (const [raw, check] of BAD3) {
    await page.evaluate((r) => { localStorage.removeItem("ferma-save-bad"); localStorage.setItem("ferma-save", r); }, raw); const e0 = pageErrors.length; await t.reload(); await sleep(100);
    const res = await page.evaluate(() => { const st = FERMA.state(); FERMA.render(); return { st, ready: FERMA.ready }; });
    t.ok(res.ready && pageErrors.length === e0 && res.st.v === 3 && check(res.st), `Схема v3: сохранение ${raw}: игра загружена, поля проверены, ошибок нет`);
  }
  // перезагрузка сохраняет заказы, копилку и конверт
  await page.evaluate(() => { localStorage.clear(); FERMA.api.newGame({ seed: 7, day: 3 }); FERMA.api.closeScreen(); FERMA.api.setTime(600); FERMA.api.setWallet({ 10000: 3, 1000: 2 }); });
  const o2S = await api("addOrder", "T09", { k: 3, B: 20000 }, "active"); await api("addOrder", "T06", { c: 2, k: 4, wd: 4 }, "board"); await api("goTo", "house"); await api("act", "piggy"); await api("coin", 10000); await api("close"); await giveAll({ "apple:red": 5 }); await api("goTo", "treeGreen"); await api("act", "pickApples"); await api("close");
  const before = await S(); await t.reload(); const after = await S();
  const strip = (st) => JSON.stringify([st.orders, st.piggy, st.buyers, st.harvest, st.inv, st.wallet, st.stats, st.trees, st.skills]);
  t.ok(strip(before) === strip(after) && after.orders.active.length === 1 && after.orders.board.length >= 1 && after.piggy.saved === 10000 && Object.keys(after.orders.envelopes).length === 1, "Сохранение: после перезагрузки заказы (взятые и на доске), конверт, копилка, покупатели, урожай и яблони на месте");
  await api("goTo", "door_galya"); t.eq((await S()).ui.menu.title, "В этом доме пока никто не живёт.", "Сохранение: Галя ещё не переехала (3-й день) — сдать ей нельзя");

  /* ---------- Настоящие нажатия мышью: продажа, сдача заказа, копилка ---------- */
  await day1(); await giveAll({ "apple:red": 10, "apple:green": 10 }); await api("goTo", "stall");
  await page.locator("#ctx button", { hasText: "Обслужить покупателя" }).click(); dl = await dialog(); const sd = dl.data;
  for (const [den, n] of Object.entries(await L("makeChange", sd.paid - sd.price))) for (let i = 0; i < n; i++) await page.locator("#dlg h3:has-text('Касса') + .money button", { hasText: new RegExp("^" + (den >= 100 ? den / 100 + " ₽" : den + " к") + "$") }).click();
  await page.locator("#dlg button", { hasText: "Отдать сдачу" }).click(); s = await S();
  t.ok(s.ui.dialog.reply === "Спасибо!" && s.stats.sold === 1 && s.skills.change.hist[0] === 1, "Мышь: продажа — монеты из кассы нажатием, «Отдать сдачу», «Спасибо!»");
  await page.locator("#dlg button", { hasText: "Закрыть" }).click(); await api("addOrder", "T24", { n: 4 }, "active"); await api("goTo", "door_katya");
  await page.locator("#ctx button", { hasText: "Отдать заказ" }).click();
  for (const sort of ["красные", "красные", "зелёные", "зелёные"]) await page.locator(`#dlg .orow:has-text('Яблоки ${sort}') button[aria-label='Больше']`).click();
  await page.locator("#dlg button", { hasText: /^Отдать$/ }).click(); s = await S();
  t.ok(s.ui.dialog.reply.startsWith("Вот спасибо! Держи") && s.orders.active.length === 0 && s.inv["apple:red"] === 6 && s.inv["apple:green"] === 8, "Мышь: сдача заказа нажатием «+» в строках урожая и «Отдать»: «" + s.ui.dialog.reply + "»");
  await page.locator("#dlg button", { hasText: "Закрыть" }).click(); await api("goTo", "house"); await page.locator("#ctx button", { hasText: "Копилка" }).click();
  await page.locator("#dlg h3:has-text('Кошелёк') + .money button", { hasText: /^10 ₽$/ }).click(); await page.locator("#dlg h3:has-text('Кошелёк') + .money button", { hasText: /^10 ₽$/ }).click(); s = await S();
  t.eq(s.piggy.saved, 2000, "Мышь: копилка — две монеты по 10 ₽ нажатием, накоплено 20 ₽");
  await page.locator("#dlg h3:has-text('В копилке') + .money button", { hasText: /^10 ₽$/ }).click(); t.eq((await S()).piggy.saved, 1000, "Мышь: монету можно вернуть из копилки нажатием");
  await api("close");

  /* ---------- A7b. Новые окна: ни слов без ё, ни несогласованных чисел, ни викторин ---------- */
  await page.evaluate(() => { localStorage.clear(); FERMA.api.setRealDate("2026-12-01"); FERMA.api.newGame({ seed: 5, day: 8 }); FERMA.api.closeScreen(); });
  await giveAll({ "apple:red": 30, "apple:green": 20, "carrot:big": 25, "carrot:small": 3, "zucchini:big": 4, "cabbage:big": 3, potato: 12, "pumpkin:big": 2 });
  await api("addOrder", "T09", { k: 2, B: 10000 }, "active"); await api("addOrder", "T03", { m1: 1400, m2: 500 }, "board"); await api("addOrder", "T24", { n: 8 }, "board"); await api("addOrder", "T19", { k1: 1, k2: 1, B: 50000 }, "board"); await api("addOrder", "T08", { time: 900 }, "board"); await api("addOrder", "T10", { wd: 4 }, "board");
  await api("setTime", 600);
  const a7 = [], a7j = [], seeText = async () => { await sleep(WAIT / 5); a7.push(await page.evaluate(() => document.body.innerText)); a7j.push(await page.evaluate(() => JSON.stringify(FERMA.state().ui.dialog) + " " + JSON.stringify(FERMA.state().ui.menu))); };
  for (const [name, a] of [["goTo", ["notes"]], ["choose", ["note:" + (await S()).orders.board[0].id]], ["choose", ["take"]], ["close", []], ["openOrders", []], ["close", []], ["goTo", ["stall"]], ["act", ["serve"]], ["close", []], ["goTo", ["shed"]], ["act", ["share"]], ["close", []], ["act", ["basket"]], ["close", []], ["act", ["weigh"]], ["weight", [1000]], ["weight", [200]], ["produce", [6]], ["close", []],
    ["goTo", ["prices"]], ["close", []], ["goTo", ["house"]], ["act", ["piggy"]], ["coin", [1000]], ["close", []], ["goTo", ["post"]], ["close", []], ["goTo", ["well"]], ["act", ["help"]], ["close", []], ["goTo", ["door_nyura"]], ["act", ["deliver"]], ["close", []], ["goTo", ["shop"]], ["choose", ["errands"]], ["cartErrand", ["errand:flour", 2]], ["toCashier", []], ["close", []], ["goTo", ["exitVillage"]], ["close", []]]) {
    const before2 = await S(); await api(name, ...a); const now2 = await S(); await seeText();
    const nd = now2.ui.dialog, bd = before2.ui.dialog; if (nd && !(bd && bd.kind === nd.kind && bd.source === nd.source)) t.ok(nd.source === name || nd.source === "system", `A7b «${name}»: окно «${nd.kind}» открыто вызовом «${nd.source}», а не само`);
  }
  const b7 = await langBad(a7, a7j); t.eq(b7.out, [], "A7b новые окна: нет «undefined», слов без ё, несогласованных чисел (проверено пар: " + b7.pairs + ")");
  const q7 = a7.map((x) => x.replace(/Ещё светло\. Точно спать\?/g, "").replace(/Куда идёшь\?/g, "").replace(/Сколько коробок будет полными\?/g, "")).filter((x) => /\?/.test(x)).map((x) => x.match(/.{0,60}\?.{0,20}/)[0]);
  t.eq(q7, [], "A7b за сессию в новых окнах нет ни одного вопроса-викторины");
  t.ok(a7.every((x) => !/(^|[^а-яё])(неверно|неправильно|ошибка)([^а-яё]|$)/i.test(x)), "A7b слов «Неверно», «Неправильно», «Ошибка» на экране нет");
  await api("setRealDate", null);
  t.ok(await page.evaluate(() => { const o = FERMA.logic.renderNote("T05", { n: 36 }).text; return o.includes("?"); }), "A7b единственная записка с вопросом — T05 про коробки: он часть текста записки (чтение), а не викторина; в этапе 2а она не выдаётся (животных ещё нет)");
  const gen2a = await page.evaluate(() => { const L = FERMA.logic, seen = new Set(); for (let sd = 1; sd <= 6; sd++) for (let d = 1; d <= 40; d++) { const p = L.planDay({ skills: {}, day: d, flags: {}, neighbors: d >= 12 ? ["nyura", "misha", "katya", "vera", "egor", "petya", "galya", "olya"] : d >= 8 ? ["nyura", "misha", "katya", "vera", "egor", "petya", "galya"] : d >= 5 ? ["nyura", "misha", "katya", "vera", "egor", "petya"] : ["nyura", "misha", "katya", "vera"], inv: { "carrot:big": 30, "zucchini:big": 5, "cabbage:big": 5, potato: 12 }, beds: [], seed: sd, boardCount: 0, lastTpl: {}, features: {} }); p.notes.concat(p.mailbox).forEach((n) => seen.add(n.tpl)); } return [...seen].sort(); });
  t.ok(["T05", "T11", "T12", "T25", "T28"].every((x) => !gen2a.includes(x)) && gen2a.length >= 18, "Записки этапа 2а: шаблоны про яйца, молоко и мерную ленту (T05, T11, T12, T25, T28) не выдаются, остальные " + gen2a.length + " шаблонов встречаются: " + gen2a.join(" "));

  /* ---------- M13. Ошибки страницы ---------- */
  t.eq(pageErrors, [], "M13 за все проверки на странице нет ошибок (window.claude отсутствует)");
  t.ok(await page.evaluate(() => typeof window.claude === "undefined" && FERMA.ready === true && FERMA.version === "0.2.0"), "M13 без window.claude игра работает из localStorage");
});
