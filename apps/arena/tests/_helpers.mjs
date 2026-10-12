// Общие помощники тестов арены. Файл без register: запускатель его подгружает, но не запускает.
// Тесты общаются со страницей только через window.OT и DOM-id.

export const run = (page, fn, arg) => page.evaluate(fn, arg);

// 2026-10-12 — понедельник. Все тесты начинаются с этой даты и с одного и того же seed.
export const TODAY = "2026-10-12";

export async function fresh(page, date = TODAY, seed = 1) {
  await run(page, ([d, s]) => { OT.setDate(d); OT.seed(s); OT.reset(); }, [date, seed]);
}

export const st = (page) => run(page, () => OT.state());

// Дата «сегодня + n дней» без привязки к часовому поясу (чистая арифметика по календарю).
export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// Ввод числа с цифровой клавиатуры страницы (padSel — "#m-pad", "#cm-pad", "#race-pad" и т. д.), затем «Ответ».
export async function typeNumber(page, padSel, n, submit = true) {
  for (const ch of String(n)) await page.click(`${padSel} [data-k="${ch}"]`);
  if (submit) await page.click(`${padSel} [data-k="ok"]`);
}

export const waitState = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 8000 });

// Горизонтальной прокрутки у страницы нет.
export const noHScroll = (page) => run(page, () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

// Видимый текст страницы и окон (innerText видит только то, что показано).
export const pageText = (page) => run(page, () => document.body.innerText);

// Ответ на текущий пример раунда таблицы: верный или на единицу больше.
export async function mathAnswer(page, right = true) {
  const ans = await run(page, () => { const R = OT.state().ui.math.round; return R.items[R.i].ans; });
  await typeNumber(page, "#m-pad", right ? ans : ans + 1);
}
// Ждём, пока раунд перейдёт к примеру i (после «Верно!» страница сама идёт дальше через 650 мс) или закончится.
export const waitMathStep = (page, i) => waitState(page, (i) => { const R = OT.state().ui.math.round; return !R || (R.i === i && R.phase === "ask"); }, i);
export const waitMathEnd = (page) => waitState(page, () => !OT.state().ui.math.round);

// Мок db как в «Обороне таблицы»: sets — все записи, listeners — подписчики по пути, docs — пути подписок.
// reject: код ошибки, с которым set отклоняется (или null).
export function mockDb(page, reject = null) {
  return page.addInitScript((rej) => {
    const log = { sets: [], listeners: {}, docs: [] };
    window.__db = log;
    window.claude = { use: (name) => Promise.resolve(name !== "db" ? null : {
      doc: (path) => ({
        set: (d) => { log.sets.push({ path, data: JSON.parse(JSON.stringify(d)) }); return rej ? Promise.reject({ code: rej }) : Promise.resolve(); },
        onSnapshot: (ok) => { log.listeners[path] = ok; log.docs.push(path); ok({ exists: false, data: () => null }); return () => {}; },
      }),
    }) };
  }, reject);
}
export async function reloadWithDb(page) {
  await page.reload();
  await page.waitForFunction(() => window.OT && window.__db && window.__db.docs.length === 5 && OT.state().storeMode !== "local");
}
export async function reloadPlain(page) {
  await page.reload();
  await page.waitForFunction(() => window.OT && OT.state);
}

// ---- Слова с ошибками: список строится из констант страницы (OT.consts()) ----
const PAIR = { "о": "а", "а": "о", "е": "и", "и": "е" };
// Настоящие слова, которые получаются при замене гласной (леса, соды, гребной, соду, лису, робота, пинал) и могут законно встретиться на странице.
const REAL = new Set(["леса", "соды", "гребной", "соду", "лису", "робота", "пинал"]);
export const norm = (s) => s.normalize("NFD").replace(/́/g, "").normalize("NFC").toLowerCase().replace(/ё/g, "е");
function swap(word, i) {
  const ch = word[i], r = PAIR[ch.toLowerCase()];
  return r ? word.slice(0, i) + r + word.slice(i + 1) : null;
}
export function misspellings(C) {
  const out = new Set();
  const add = (w) => { if (w) { const n = norm(w); if (!REAL.has(n)) out.add(n); } };
  // Словарные и проверяемые слова: заглавная буква отмечает трудное место. -тся/-ться не проверяем: обе формы бывают верными.
  for (const w of C.STARTER) {
    if (w.cat === "tsya") continue;
    [...w.w].forEach((ch, i) => { if (ch !== ch.toLowerCase()) add(swap(w.w.toLowerCase(), i)); });
  }
  // Охота A: слова с отмеченными безударными гласными.
  for (const sent of C.HUNT_A) {
    for (const m of sent.matchAll(/\{([^}]+)\}/g)) {
      const [w, , idx] = m[1].split(":");
      (idx || "").split(",").filter(Boolean).forEach((i) => add(swap(w.toLowerCase(), +i)));
    }
  }
  // Семейки: слово с вставленной неверной буквой: «вада», «лисник».
  for (const f of C.FAMS) add(f.gap.replace("_", f.alt));
  return [...out].sort();
}
// Видимое и спрятанное в атрибутах, без кода страницы: текст, aria-label, title, placeholder и все data-*.
export const dumpPage = (page) => page.evaluate(() => {
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll("script, style").forEach((e) => e.remove());
  const parts = [document.body.innerText, clone.textContent];
  clone.querySelectorAll("*").forEach((e) => { for (const a of e.attributes) if (a.name === "aria-label" || a.name === "title" || a.name === "placeholder" || a.name.startsWith("data-")) parts.push(a.value); });
  return parts.join("\n");
});
// Какие из слов списка встречаются в тексте как отдельные слова (граница слова по кириллице).
export function found(text, list) {
  const t = norm(text);
  return list.filter((w) => new RegExp("(?<![а-я])" + w + "(?![а-я])").test(t));
}
