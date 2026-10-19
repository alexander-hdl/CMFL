// Проверка экспорта «Студии комиксов»: скачанная картинка и запись в альбоме содержат
// белый фон, рисунок и рамки. Запуск из корня: node tools/test_app.mjs komiksy
// (исходник оборачивается в документ так же, как в tools/test_app.mjs, и открывается в Chromium).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SRC = path.join(ROOT, "apps", "komiksy", "komiksy.html");
const RED = [229, 57, 53];                               // второй цвет палитры, #e53935

function wrap(src) {
  const cut = src.indexOf("</style>") + "</style>".length;
  return `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<style>body{margin:0}[hidden]{display:none!important}</style>\n${src.slice(0, cut).trim()}\n</head>\n<body>\n${src.slice(cut).trim()}\n</body>\n</html>\n`;
}

// Статистика пикселей PNG: доля белых, доля красных, размер. Считается внутри страницы через canvas.
async function stats(page, dataUrl) {
  return page.evaluate((url) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let white = 0, red = 0, transparent = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 250) transparent++;
        else if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) white++;
        else if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] < 90) red++;
      }
      const n = d.length / 4;
      res({ w: c.width, h: c.height, white: white / n, red: red / n, transparent: transparent / n });
    };
    img.src = url;
  }), dataUrl);
}

(async () => {
  const results = [];
  const ok = (cond, name) => { results.push({ name, pass: !!cond }); console.log((cond ? "  ✓ " : "  ✗ ") + name); };
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "komiksy-"));
  const tmp = path.join(tmpDir, "komiksy.html");
  fs.writeFileSync(tmp, wrap(fs.readFileSync(SRC, "utf8")));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ru-RU", acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  try {
    await page.goto("file://" + tmp);
    await page.waitForSelector("#c-paint");
    // Красный карандаш, толстая линия, штрих через первый кадр.
    await page.click('[data-color="#e53935"]');
    const sizes = await page.$$("#sizes [data-size]");
    if (sizes.length) await sizes[sizes.length - 1].click();
    const box = await page.$eval("#c-paint", (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const x0 = box.x + box.w * 0.15, y0 = box.y + box.h * 0.2;
    await page.mouse.move(x0, y0); await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(x0 + i * box.w * 0.015, y0 + i * box.h * 0.01);
    await page.mouse.up();
    const painted = await page.$eval("#c-paint", (c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
    ok(painted > 500, "штрих лёг на слой рисунка (" + painted + " пикселей)");

    // Кнопки скачивания и альбома живут на шаге «Проверь 2 слова».
    await page.click("#to-check");
    await page.waitForSelector("#dl", { state: "visible" });

    // 1. Скачать картинку.
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.click("#dl")]);
    const file = path.join(tmpDir, "out.png");
    await download.saveAs(file);
    const png = fs.readFileSync(file);
    ok(png.length > 2000 && png.slice(1, 4).toString() === "PNG", "скачан PNG (" + png.length + " байт)");
    const s1 = await stats(page, "data:image/png;base64," + png.toString("base64"));
    ok(s1.transparent < 0.001, "в скачанной картинке нет прозрачных пикселей (" + (s1.transparent * 100).toFixed(2) + " %)");
    ok(s1.white > 0.6, "фон белый (" + (s1.white * 100).toFixed(0) + " % белых)");
    ok(s1.red > 0.002, "красный штрих на месте (" + (s1.red * 100).toFixed(2) + " % красных)");
    ok(s1.white < 0.995, "рамки нарисованы (не только белое)");

    // 2. Сохранить в альбом (IndexedDB) и проверить сохранённый blob.
    await page.click("#save");
    await page.waitForFunction(() => /Сохранено|недоступен/.test(document.getElementById("save-msg").textContent), null, { timeout: 15000 });
    const msg = await page.textContent("#save-msg");
    ok(/Сохранено/.test(msg), "сохранение в альбом: " + msg.trim());
    const albumUrl = await page.evaluate(() => new Promise((res) => {
      const rq = indexedDB.open("komiksy", 1);
      rq.onsuccess = () => {
        const tx = rq.result.transaction("comics", "readonly"), all = tx.objectStore("comics").getAll();
        all.onsuccess = () => {
          const rows = all.result; if (!rows.length) return res(null);
          const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(rows[rows.length - 1].blob);
        };
      };
      rq.onerror = () => res(null);
    }));
    ok(!!albumUrl, "в альбоме есть запись с картинкой");
    if (albumUrl) {
      const s2 = await stats(page, albumUrl);
      ok(s2.transparent < 0.001 && s2.white > 0.6 && s2.red > 0.002, "картинка в альбоме: белый фон и красный штрих (" + (s2.white * 100).toFixed(0) + " % белых, " + (s2.red * 100).toFixed(2) + " % красных)");
    }
    ok(errors.length === 0, "ошибок в консоли нет" + (errors.length ? ": " + errors.join(" | ") : ""));
  } catch (e) {
    ok(false, "исключение: " + (e && e.stack || e));
  }
  await browser.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  const failed = results.filter((r) => !r.pass).length;
  console.log(`Итого: ${results.length - failed} из ${results.length} проверок пройдено`);
  process.exit(failed ? 1 : 0);
})();
