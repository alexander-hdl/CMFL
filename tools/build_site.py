#!/usr/bin/env python3
"""Build the standalone site in docs/ from the Claude artifact sources in plan/.

The pages in plan/ are written for claude.ai artifacts: they have no <html>/<head>
skeleton and may use window.claude for shared storage and AI. Here each page gets a
full document, links between pages become relative, AI blocks say they live only in
the claude.ai version, and a service worker makes the site work offline after the
first visit. Run from the repository root:

    python3 tools/build_site.py
"""
import hashlib
import json
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "plan"
OUT = ROOT / "docs"
ICONS = ROOT / "tools" / "icons"

ARTIFACTS = {
    "NUnVhvzy88WsXPZpf4yvSm": "trenazhery.html",
    "LeApqezzcT228szk3Jidf2": "plan.html",
    "78TnnhbtiWef319zJ2SQM8": "komiksy.html",
}

PAGES = [
    # source, output, app name, short name, theme colour, icon set
    ("trenazhery.html", "trenazhery.html", "Тренировочная арена", "Арена", "#0e1d27", "arena"),
    ("plan-9-let.html", "plan.html", "План: планшет и диктанты", "План", "#f6f7f3", "plan"),
    ("komiksy.html", "komiksy.html", "Студия комиксов", "Комиксы", "#eef0f4", "comics"),
    ("oborona-tablicy.html", "oborona-tablicy.html", "Оборона таблицы", "Оборона", "#17324a", "tower"),
]

# Texts shown where a feature needs claude.ai; each must exist in the source.
REWORDS = {
    "trenazhery.html": [
        ("ИИ на этой странице сейчас недоступен. Тексты можно добавлять из его книг, ниже.",
         "В этой версии нет ИИ: истории от ИИ есть в версии на claude.ai. Тексты можно добавлять из его книг, ниже."),
        ("Новые квесты от ИИ сейчас недоступны на этой странице.",
         "Новые квесты от ИИ есть только в версии на claude.ai."),
        ("Новые сценки от ИИ сейчас недоступны на этой странице.",
         "Новые сценки от ИИ есть только в версии на claude.ai."),
    ],
}

RESET = "body{margin:0}[hidden]{display:none!important}"
SW_REGISTER = ('<script>if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) '
               'navigator.serviceWorker.register("sw.js").catch(function () {});</script>')


def relink(html):
    def sub(m):
        return ARTIFACTS[m.group(1)] + (m.group(2) or "")
    return re.sub(r"https://claude\.ai/artifact/(" + "|".join(ARTIFACTS) + r")(#[\w-]+)?", sub, html)


def page(src_name, out_name, name, color, icon):
    s = (SRC / src_name).read_text(encoding="utf-8")
    for old, new in REWORDS.get(src_name, []):
        if s.count(old) != 1:
            raise SystemExit(f"{src_name}: expected one copy of {old!r}")
        s = s.replace(old, new)
    s = relink(s)
    cut = s.index("</style>") + len("</style>")
    head, body = s[:cut].strip(), s[cut:].strip()
    manifest = f"manifest-{icon}.webmanifest"
    return (
        "<!doctype html>\n<html lang=\"ru\">\n<head>\n"
        "<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n"
        f"<meta name=\"theme-color\" content=\"{color}\">\n"
        f"<link rel=\"manifest\" href=\"{manifest}\">\n"
        f"<link rel=\"icon\" type=\"image/png\" href=\"icons/{icon}-192.png\">\n"
        f"<link rel=\"apple-touch-icon\" href=\"icons/{icon}-180.png\">\n"
        f"<meta name=\"apple-mobile-web-app-title\" content=\"{name}\">\n"
        f"<style>{RESET}</style>\n"
        f"{head}\n</head>\n<body>\n{body}\n{SW_REGISTER}\n</body>\n</html>\n"
    )


def manifest(name, short, start, color, icon):
    return json.dumps({
        "name": name, "short_name": short, "lang": "ru", "start_url": start, "scope": "./",
        "display": "standalone", "background_color": color, "theme_color": color,
        "icons": [
            {"src": f"icons/{icon}-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": f"icons/{icon}-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ],
    }, ensure_ascii=False, indent=2) + "\n"


INDEX = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f6f7f3">
<link rel="manifest" href="manifest-home.webmanifest">
<link rel="icon" type="image/png" href="icons/plan-192.png">
<title>Учебный уголок</title>
<style>
:root {
  --bg: #f6f7f3; --card: #ffffff; --ink: #1c2741; --muted: #5d667c; --line: #d8dee8; --accent: #2350b0;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #11151d; --card: #182030; --ink: #e5eaf4; --muted: #9aa4ba; --line: #2a3346; --accent: #86a9ff; color-scheme: dark; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 28px 16px 48px; display: grid; gap: 16px; }
h1 { font-size: 1.7rem; margin: 0; line-height: 1.2; }
p { margin: 0; }
.lead { color: var(--muted); }
.cards { display: grid; gap: 12px; }
a.card { display: grid; grid-template-columns: 56px 1fr; gap: 14px; align-items: center; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; text-decoration: none; color: inherit; }
a.card:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
a.card img { width: 56px; height: 56px; border-radius: 14px; }
a.card b { display: block; font-size: 1.1rem; }
a.card span { color: var(--muted); font-size: 0.95rem; }
.note { background: var(--card); border: 1px dashed var(--line); border-radius: 14px; padding: 14px 16px; display: grid; gap: 8px; font-size: 0.95rem; }
.note h2 { font-size: 1rem; margin: 0; }
.note ul { margin: 0; padding-left: 1.2em; display: grid; gap: 4px; }
footer { color: var(--muted); font-size: 0.85rem; }
footer a { color: var(--accent); }
</style>
</head>
<body>
<main>
  <h1>Учебный уголок</h1>
  <p class="lead">Тренажёры и игра для сына, план для родителей и студия комиксов. Всё работает прямо в браузере.</p>
  <div class="cards">
    <a class="card" href="trenazhery.html"><img src="icons/arena-192.png" alt=""><div><b>Тренировочная арена</b><span>Для сына: «Тренировка дня», счёт, чтение, слова, игры вместе</span></div></a>
    <a class="card" href="plan.html"><img src="icons/plan-192.png" alt=""><div><b>План для родителей</b><span>6 недель, распорядок, диктанты, планшет, дневник открытий</span></div></a>
    <a class="card" href="komiksy.html"><img src="icons/comics-192.png" alt=""><div><b>Студия комиксов</b><span>Для пера XP-PEN: рисовать и писать реплики</span></div></a>
    <a class="card" href="oborona-tablicy.html"><img src="icons/tower-192.png" alt=""><div><b>Оборона таблицы</b><span>Для сына: защита крепости, где оружие — таблица умножения</span></div></a>
  </div>
  <div class="note">
    <h2>Как пользоваться</h2>
    <ul>
      <li>Откройте нужную страницу и добавьте её на главный экран: «Поделиться» → «На экран „Домой“» (iPad) или меню ⋮ → «Добавить на главный экран» (Android).</li>
      <li>После первого открытия страницы работают и без интернета.</li>
      <li>Всё, что вы отмечаете, хранится только в этом браузере на этом устройстве и никуда не отправляется. Прогресс сына смотрите на том же планшете, вкладка «Прогресс».</li>
    </ul>
    <h2>Чем отличается от версии на claude.ai</h2>
    <ul>
      <li>Нет функций ИИ: историй, квестов, сценок и тем викторины от ИИ. Встроенные книга, сценки и вопросы есть.</li>
      <li>Прогресс не синхронизируется между устройствами.</li>
      <li>Альбом комиксов хранится в браузере; любимые комиксы лучше скачать картинкой.</li>
    </ul>
  </div>
  <footer>Исходники и исследования: <a href="https://github.com/alexander-hdl/CMFL">github.com/alexander-hdl/CMFL</a></footer>
</main>
<script>if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(function () {});</script>
</body>
</html>
"""

SW = """// Offline cache: stale-while-revalidate for this site and Google Fonts. CACHE changes with every build.
const CACHE = "cmfl-__HASH__";
const CORE = __CORE__;
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("cmfl-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const font = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== self.location.origin && !font) return;
  e.respondWith(caches.open(CACHE).then((cache) => cache.match(req, { ignoreSearch: !font }).then((hit) => {
    const net = fetch(req).then((res) => {
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  })));
});
"""

README = """# Автономная версия (GitHub Pages)

Эта папка — готовый сайт: тренажёры, «Оборона таблицы», план и студия комиксов без claude.ai. Её собирает скрипт `tools/build_site.py` из исходников в `plan/`. Руками здесь ничего не правьте: после следующей сборки правки пропадут.

## Как включить сайт

1. На GitHub откройте репозиторий → **Settings** → **Pages**.
2. В «Build and deployment» выберите **Source: Deploy from a branch**, ветку **main** и папку **/docs**, нажмите **Save**.
3. Через минуту-две сайт появится по адресу `https://alexander-hdl.github.io/CMFL/`.

## Как обновить после правок

```
python3 tools/build_site.py
```

Потом закоммитьте папку `docs/`. Открытые страницы подхватят новую версию при следующем запуске.

## Что отличается от версии на claude.ai

- Нет функций ИИ (истории, квесты, сценки и темы викторины от ИИ).
- Прогресс хранится только в браузере устройства и не синхронизируется.
- «Оборона таблицы» работает целиком: прогресс и экран для взрослого хранятся в браузере.
- Альбом комиксов хранится в браузере (IndexedDB), скачивание — обычной ссылкой.
- После первого открытия всё работает без интернета.
"""


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "icons").mkdir(parents=True)
    for f in ICONS.glob("*.png"):
        shutil.copy(f, OUT / "icons" / f.name)
    files = {}
    for src, out, name, short, color, icon in PAGES:
        files[out] = page(src, out, name, color, icon)
        files[f"manifest-{icon}.webmanifest"] = manifest(name, short, out, color, icon)
    files["index.html"] = INDEX
    files["manifest-home.webmanifest"] = manifest("Учебный уголок", "Уголок", "index.html", "#f6f7f3", "plan")
    files["README.md"] = README
    files[".nojekyll"] = ""
    core = ["./", "index.html"] + [p[1] for p in PAGES] + [f"manifest-{p[5]}.webmanifest" for p in PAGES] + ["manifest-home.webmanifest"] + \
        sorted("icons/" + f.name for f in (OUT / "icons").glob("*.png"))
    digest = hashlib.sha256("".join(files[k] for k in sorted(files)).encode("utf-8")).hexdigest()[:10]
    files["sw.js"] = SW.replace("__HASH__", digest).replace("__CORE__", json.dumps(core, ensure_ascii=False))
    for name, text in files.items():
        (OUT / name).write_text(text, encoding="utf-8")
    print(f"docs/ built: {len(files)} files, cache cmfl-{digest}")


if __name__ == "__main__":
    main()
