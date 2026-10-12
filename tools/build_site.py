"""Build the standalone site in docs/ from the apps in apps/*/.

Every app lives in apps/<name>/ with an app.json manifest and a page written for
claude.ai artifacts: no <html>/<head> skeleton, and it may use window.claude for
shared storage and AI. Here each page gets a full document, links between pages
become relative, AI blocks say they live only in the claude.ai version, and a
service worker makes the site work offline after the first visit. docs/ is not
committed: GitHub Actions builds it on every push to main (.github/workflows/pages.yml).
Run locally from the repository root:

    python3 tools/build_site.py

app.json fields: name, short (home-screen name), source (page file in the app folder),
out (file name on the site; keep it stable, links and installed icons depend on it),
color (theme), icon (prefix of docs/icons/<icon>-<size>.png; the app folder holds
icons/180.png, 192.png and 512.png), order (position on the home page), card (one line
under the title on the home page), title (optional card heading when it differs from name), artifact (optional claude.ai artifact id, so links
to it become relative on the site), rewords (optional [old, new] pairs for texts that
mention claude.ai-only features), tests (optional folder for tools/test_app.mjs),
vendor (optional {url: local file}: an external library the page loads from a CDN is
copied into docs/vendor/<app>/ and the page on the site uses that copy, so the service
worker can cache it and the site works offline).
"""
import hashlib
import json
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
APPS = ROOT / "apps"
OUT = ROOT / "docs"
HOME = {"name": "Учебный уголок", "short": "Уголок", "color": "#f6f7f3", "icon": "plan"}
SIZES = (180, 192, 512)


def load_apps():
    apps = []
    for folder in sorted(APPS.iterdir()):
        mf = folder / "app.json"
        if not mf.is_file():
            continue
        a = json.loads(mf.read_text(encoding="utf-8"))
        for key in ("name", "short", "source", "out", "color", "icon", "order", "card"):
            if key not in a:
                raise SystemExit(f"{mf}: нет поля {key!r}")
        a["dir"] = folder
        for size in SIZES:
            if not (folder / "icons" / f"{size}.png").is_file():
                raise SystemExit(f"{folder.name}: нет иконки icons/{size}.png")
        apps.append(a)
    outs = [a["out"] for a in apps]
    if len(set(outs)) != len(outs):
        raise SystemExit("два приложения с одинаковым out: " + ", ".join(outs))
    return sorted(apps, key=lambda a: (a["order"], a["out"]))


RESET = "body{margin:0}[hidden]{display:none!important}"
SW_REGISTER = ('<script>if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) '
               'navigator.serviceWorker.register("sw.js").then(function (reg) { '
               'reg.update().catch(function () {}); '
               'reg.addEventListener("updatefound", function () { var nw = reg.installing; if (!nw || !navigator.serviceWorker.controller) return; '
               'nw.addEventListener("statechange", function () { if (nw.state === "activated") location.reload(); }); }); '
               '}).catch(function () {});</script>')


def relink(html, artifacts):
    for art_id, out in artifacts.items():
        html = html.replace("https://claude.ai/artifact/" + art_id, out)
    return html


def page(a, artifacts):
    s = (a["dir"] / a["source"]).read_text(encoding="utf-8")
    for old, new in a.get("rewords", []):
        if s.count(old) != 1:
            raise SystemExit(f"{a['dir'].name}/{a['source']}: expected one copy of {old!r}")
        s = s.replace(old, new)
    s = relink(s, artifacts)
    for url, local in a.get("vendor", {}).items():
        if s.count(url) != 1:
            raise SystemExit(f"{a['dir'].name}/{a['source']}: ссылка {url!r} должна встречаться ровно один раз")
        s = s.replace(url, vendor_path(a, local))
    if "</style>" not in s:
        raise SystemExit(f"{a['dir'].name}/{a['source']}: нет </style>")
    cut = s.index("</style>") + len("</style>")
    head, body = s[:cut].strip(), s[cut:].strip()
    manifest = f"manifest-{a['icon']}.webmanifest"
    return (
        "<!doctype html>\n<html lang=\"ru\">\n<head>\n"
        "<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n"
        f"<meta name=\"theme-color\" content=\"{a['color']}\">\n"
        f"<link rel=\"manifest\" href=\"{manifest}\">\n"
        f"<link rel=\"icon\" type=\"image/png\" href=\"icons/{a['icon']}-192.png\">\n"
        f"<link rel=\"apple-touch-icon\" href=\"icons/{a['icon']}-180.png\">\n"
        f"<meta name=\"apple-mobile-web-app-title\" content=\"{a['name']}\">\n"
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
  <p class="lead">Тренажёры и игры для сына, план для родителей и студия комиксов. Всё работает прямо в браузере.</p>
  <div class="cards">
__CARDS__
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
__SW__
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

def vendor_path(a, local):
    """Путь на сайте для местной копии внешней библиотеки: vendor/<папка приложения>/<имя файла>."""
    return f"vendor/{a['dir'].name}/{pathlib.Path(local).name}"


def card(a):
    return (f'    <a class="card" href="{a["out"]}"><img src="icons/{a["icon"]}-192.png" alt="">'
            f'<div><b>{a.get("title", a["name"])}</b><span>{a["card"]}</span></div></a>')


def main():
    apps = load_apps()
    artifacts = {a["artifact"]: a["out"] for a in apps if a.get("artifact")}
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "icons").mkdir(parents=True)
    for a in apps:
        for size in SIZES:
            shutil.copy(a["dir"] / "icons" / f"{size}.png", OUT / "icons" / f"{a['icon']}-{size}.png")
    vendored = []
    for a in apps:
        for url, local in a.get("vendor", {}).items():
            src = a["dir"] / local
            if not src.is_file():
                raise SystemExit(f"{a['dir'].name}: нет файла {local} для {url}")
            dst = OUT / vendor_path(a, local)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, dst)
            vendored.append(vendor_path(a, local))
    files = {}
    for a in apps:
        files[a["out"]] = page(a, artifacts)
        files[f"manifest-{a['icon']}.webmanifest"] = manifest(a["name"], a["short"], a["out"], a["color"], a["icon"])
    files["index.html"] = INDEX.replace("__CARDS__", "\n".join(card(a) for a in apps)).replace("__SW__", SW_REGISTER)
    files["manifest-home.webmanifest"] = manifest(HOME["name"], HOME["short"], "index.html", HOME["color"], HOME["icon"])
    files[".nojekyll"] = ""
    core = ["./", "index.html"] + [a["out"] for a in apps] + [f"manifest-{a['icon']}.webmanifest" for a in apps] + ["manifest-home.webmanifest"] + \
        sorted("icons/" + f.name for f in (OUT / "icons").glob("*.png")) + sorted(vendored)
    digest = hashlib.sha256("".join(files[k] for k in sorted(files)).encode("utf-8")).hexdigest()[:10]
    files["sw.js"] = SW.replace("__HASH__", digest).replace("__CORE__", json.dumps(core, ensure_ascii=False))
    for name, text in files.items():
        (OUT / name).write_text(text, encoding="utf-8")
    print(f"docs/ built: {len(apps)} apps, {len(files)} files, cache cmfl-{digest}")


if __name__ == "__main__":
    main()
