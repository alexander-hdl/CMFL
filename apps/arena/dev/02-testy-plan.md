# Тренировочная арена: план автотестов и `window.OT`

Аналитик, 2026-10-12, ветка `claude/optimistic-goldberg-xpsimp`. Строки указаны по `apps/arena/trenazhery.html` до правок (4594 строки). Закрывает замечание «важно» из `dev/STATUS.md`: тестов и отладочного интерфейса нет.

Главное: тесты общаются со страницей через `window.OT` и DOM-id, состояние готовят через `OT.set`, а не прокликиванием. Для ребёнка поведение не меняется, кроме трёх исправлений из раздела 4. Их находят сами тесты.

## 1. Карта модулей

Весь JS — один IIFE (строки 534–4593). Глобальных переменных нет, `boot` в конце.

| Модуль (строки) | Состояние | Ключевые функции | DOM | Чистое / DOM | Что ломается тихо |
|---|---|---|---|---|---|
| helpers (537–547) | — | `dayKey` 541, `addDays`, `shuffle`, `median`, `INTERVALS = {1:0,2:1,3:3,4:7,5:14}` 546 | — | чистое, кроме `new Date()` в `dayKey` и `Math.random` в `shuffle` | «сегодня» берётся из часов устройства, подменить нельзя |
| storage (549–581) | `data` {math, words, reading, screen, family}, `store` {mode, refs, timers, writing, again} | загрузка 559–561, `save` 563 (localStorage сразу, db через 700 мс), `flush` 570, `trim` | — | смешанное | битый JSON ловится, а битые типы внутри документа (`facts: null`, `sessions: {}`) роняют вкладку; снимок db перезаписывает поля верхнего уровня без сравнения дат; локальный прогресс уходит в пустой db только после первого `save` |
| content (583–634) | `PAIRS` (36), `TEXTS`, `STARTER` (33 слова, заглавные = трудные буквы), `CATS` | `factKey`, `mulHint`, `divHint`, `allWords`, `plain` | — | чистое | опечатка в заглавных ломает подсветку при самопроверке |
| tabs, header (636–684) | `current` | `showTab` 638, `busy` 654, `trophyCount` 657, `todayDone`, `renderHeader` 671 | `#tab-{math,read,words,games,prog}`, `#view-*`, `#today`, `#trophy-count`, `#day-strip`, `#week-strip` | DOM | `busy()` знает только `math.round` и `words.round` |
| таблица (686–922) | `math` {op, round, nl, df, cm, wp, race}; `data.math.facts[k]` {b, n, ok, due, last, up}, `sessions` | `pickMath` 701, `buildItem`, `startMath` 791, `key` 832, `answerMath` 853 (Лейтнер 859–872), `finishMath` 898 | `#math-start`, `.seg [data-op]`, `#m-pad [data-k]`, `#m-ans`, `#m-stop`, `#m-again`, `#m-home` | `pickMath` чистая, Лейтнер вшит в `answerMath` | новый факт сразу попадает в ящик 2 без `up`, поэтому «освоен» можно получить за 2 дня (см. 4.1) |
| числовая прямая (924–983) | `math.nl`, `data.math.nl` | `nlRange`, `startNL` 930, `finishNL` | `#nl-start`, `#nl`, `#nl-next`, `#nl-stop` | DOM | — |
| «Опорные факты» (985–1227) | `math.df`; `data.math.df` {facts{lvl, ok, okDay, upDay, day}, sessions} | `dfPaths`, `dfPickBosses`, `dfPickTwo`, `dfKey`, `nextDf` 1190 | `#df-start`, `#df-two`, `#df-ans` | генераторы чистые | победа засчитывается раз в день (`okDay`) |
| «Часы и деньги» (1229–1474) | `math.cm` {items, i, phase, h, m, tray, yn}; `data.math.cm` {t, sessions} | `genRead…genKop`, `cmItems`, `minCoins`, `moveHand` 1417, `cmKey`, `cmMark` 1446 | `#clk-set`, `[data-hh]`, `[data-mm]`, `#cm-check`, `[data-add]`, `[data-rm]`, `#cm-pay`, `#cm-pad`, `[data-opt]`, `[data-yn]`, `#cm-next`, `[data-cm]` | генераторы чистые | угол стрелки при перетаскивании; варианты ответа «Который час» могут совпасть |
| «Гонка на двоих» (1475–1725) | `math.race` (копия в `arena-v1-race`); `data.math.race` {games, names, check, lvl} | `racePads`, `raceCard`, `raceHops`, `raceSubmit` 1676, `raceVerdict` 1685, `raceMove`, `raceNext` | `#race-start`, `#race-resume`, `#race-draw`, `#race-pad`, `#race-ans`, `[data-rv]`, `#race-next`, `#race-pause` | карты и прыжки чистые | счёт пойманных ошибок `st.ct`, звёзды |
| «Задачи бравлера» (1727–1918) | `math.wp`; `data.math.wp`, `wpt`, `names` | `WP[]` (17 генераторов), `wpPick`, `chooseOp`, `wpKey`, `finishWp` | `#wp-start`, `[data-lv]`, `[data-op]`, `#wp-pad`, `#wp-next`, `#wp-stop` | генераторы чистые | ответ ≤ 0 или дробный при новых числах |
| чтение, Шульте (1920–2075) | `reading` {view, tid, …}; `data.reading` {custom, runs, schulte} | `renderRead` 1940, `tick`, `startSchulte` | `[data-tid]`, `#r-start`, `#r-stop`, `#sch-start`, `#sch-grid` | DOM | таймер `setInterval` |
| истории от ИИ (2076–2215) | `story` (`unavailable`), `sampleFn` | `generateStory`, `troubleWords` | `#st-*` | DOM, `claude.use("sample")` | тексты «недоступно» правятся на сайте через `rewords` |
| «Книга-квест» (2217–2535) | `quest` {q, page, cr, hist}; `data.reading` {ql, qp, quests}; `arena-v1-quest-<id>` | `questValid` 2402, `openQuest`, `questLogPage`, `questGo` | `[data-qid]`, `[data-go]`, `#q-back`, `#q-undo` | `questValid` чистая | счётчик страниц `ql` для «Тренировки дня» |
| «Суфлёр» (2537–2845) | `play`; `data.reading` {takes, plays} | `openPlay` 2657, `playStep`, `finishTake`, `openPrompter` | `#pl-*`, `#prompter`, `#pr-*` | DOM | таймер бегущего режима |
| «Своя игра» (2847–3135) | `quiz` {g, own}; `fam().quiz` {custom, games, seen, miss} | `fam` 2850, `startQuiz` 2932, `quizJudge` | `#qz-start`, `[data-qc]`, `[data-qzr]` | DOM | — |
| «Моя неделя» (3137–3260) | `fam().week` {goals[ws], notes[ws]} | `weekCounts` 3146, `goalOptions`, `goalNow` 3176, `renderWeekStrip` 3186, `renderWeek` 3206 | `#wk-open`, `#week-ov`, `[data-wgo]`, `#wk-own`, `#wk-proud`, `#wk-save`, `.wk-late` | счёт чистый | флаг `hit` пересчитывается при рендере |
| «Тренировка дня» (3262–3385) | `daily` {size, just}; `fam().daily[day]` {steps, base, moves, fin} | `sized` 3267, `dailyCounts`, `makePlan` 3277, `dailyCheck` 3286, `renderDay` 3320, `dailyLaunch` 3354 | `#day-open`, `#day-ov`, `#day-go`, `#day-skip`, `#day-moved`, `[data-dread]`, `#day-pill`, `#day-x` | `makePlan` чистая, кроме `save` | `sized()` режет уже перемешанный раунд (см. 4.2); чередование `day % 3` зависит от часового пояса |
| сводка (3387–3478) | `report` {days, text}; `fam().report` {obs, qs, dict} | `buildReport` 3392 | `[data-rpd]`, `#rp-obs`, `#rp-qs`, `#rp-dict`, `#rp-build`, `#rp-text`, `#rp-copy`, `#rp-msg` | `buildReport` чистая | заголовки разделов в верхнем регистре |
| гемы, питомец (3480–3662) | `GEM`, `SHOP`, `TREATS`, `PET_STAGES`; `fam().pet` {kind, name, buys, items, wear, maxTr, earnedMax} | `gemLedger` 3506 (пишет `earnedMax`), `petStage`, `renderPet` 3595 | `#gem-btn`, `#gem-count`, `#pet-btn`, `#pet-ov`, `[data-pk]`, `#pet-name`, `[data-buy]`, `[data-wear]`, `[data-treat]`, `#pet-pat` | расчёт чистый | лимит 30 в день; баланс не должен падать после обрезки журналов |
| заметки (3664–3746) | `note`; `fam().notes[]` {id, ts, d, kind, text, where, done, reply, seen} | `whereNow`, `renderNotes` 3686, `bindNotesProgress` 3727, `renderPetHeader` | `#note-btn`, `#note-badge`, `#note-ov`, `[data-nk]`, `#note-text`, `#note-add`, `[data-ndel]`, `[data-nrep]`, `[data-ndone]` | DOM | значок ответа, подсказка про чат на сайте |
| речь (3748–3802) | `ruVoice` | `speak`, `readAloud`, `canSpeak` | `#w-say` | DOM | в headless голоса нет, показывается «Показать взрослому» |
| слова: диктант (3804–3952) | `words` {cat, paper, round, mode, hunt, fam}; `data.words` {custom, prog[id] {b, n, ok, due}, sessions} | `pickWords` 3811, `startWords` 3870, `markWord` 3921 (Лейтнер 3923–3927), `finishWords` | `#w-check`, `#w-ok`, `#w-no`, `#w-stop`, `.reveal`, `.hot` | `pickWords` чистая | фаза `study` ждёт 3,5 с |
| охота (3954–4214) | `words.hunt`, `HUNT_A`, `HUNT_B`, `data.words.hunt` | `parseSent`, `startSentence`, `renderHuntA/B`, `finishHunt` | `[data-wm]`, `[data-ht]`, `#h-start`, `[data-j]`, `#h-check`, `#h-go`, `[data-ty]`, `[data-ck]`, `[data-q]`, `[data-e]`, `#h-next` | `parseSent` чистая | слово с ошибкой не должно появиться |
| семейка (4216–4307) | `words.fam`, `FAMS`, `data.words.fam` | `renderFam` 4217, `prepFam`, `finishFam` | `#f-start`, `[data-fw]`, `[data-fc]`, `[data-fl]`, `#f-next` | DOM | то же |
| лист для пера (4309–4342) | `sheet` | `initSheet` | canvas | DOM | только вручную |
| «Матчи» (4344–4490) | `data.screen` {budget, days[d] {n, self}, acts}; `games` | `scr`, `keyDate`, `weekStart`, `isWeekend`, `renderGames` 4377, `spin` | `#g-plus`, `#g-minus`, `#g-self`, `#w-spin`, `#b-wd`, `#b-we` | DOM | гемы сюда попадать не должны |
| прогресс (4492–4563) | — | `renderProgress` 4495 | `#view-prog`, `#store-note` | DOM | подсказка «5 минут» (см. 4.4) |
| boot (4565–4593) | — | `renderAll` 4567, восстановление вкладки, зеркало db 4572–4591 | — | DOM | — |

**Даты.** Везде используется `dayKey()` без аргумента (541). `new Date()` есть только в нём и в `keyDate` (4357, от ключа). `Date.now()` идёт только в id и `ts`. Значит, подмена даты в одном `dayKey` покрывает всё: интервалы Лейтнера, `todayPlan`, недели и воскресенье, лимит гемов.

**Случайность.** `Math.random` есть в `shuffle`, `buildItem`, `pickMath`, `startNL`, `rnd2`, `dfPickBosses`, `r3`, `pick`, `genEnough`, `genKop`, `raceCard`, `rnd`, `wpPick`, `spin` и в паузе повтора `flush`. Всего 19 вызовов. Код не меняем: `OT.seed(n)` подменяет `Math.random` на детерминированный mulberry32.

## 2. Спецификация `window.OT`

**Где подключить.** Новый блок `/* ---------- debug interface for tests (window.OT) ---------- */` ставится после восстановления вкладки из адреса (4570), перед `try` с зеркалом db (4572), синхронно. Все функции синхронные и возвращают JSON-совместимые значения. Ребёнок их не видит. Подмена даты срабатывает, только если её ключ есть в localStorage. Ключ ставит лишь `OT.setDate`.

**Мелкие правки ради `OT`** (поведение не меняют):
- `function blank()` возвращает документы по умолчанию (551–557); `data = blank()` и `OT.reset()` берут их отсюда.
- В helpers: `var OT_DATE = "arena-ot-date"`, `dateOverride` читается в `try` из localStorage. В `dayKey(d)` в начало добавляется `if (!d && dateOverride) return dateOverride;`. Ключ без префикса `arena-v1-`: его не стирает `reset()` и не видит тест на ключи.
- Лейтнер выносится в чистые функции без изменения правил: `leitnerMath(s, ok, ms, today) → s` (из 859–872) и `leitnerWord(s, ok, today) → s` (из 3923–3927). `answerMath` и `markWord` вызывают их.

| Вызов | Что делает |
|---|---|
| `OT.state()` | снимок: `{date, dateOverride, tab: current, storeMode: store.mode, docs: {math, words, reading, screen, family}` (JSON-копия `data`), `overlay: 'day'│'week'│'pet'│'notes'│'prompter'│null` (по наличию `#day-ov`…), `pill` (текст `#day-pill` или null), `ui: {math, words, reading: {view, tid}, quest: {q, page}, play: {id, i, pr}, quiz: !!quiz.g}` (JSON-копии объектов модулей), `daily: {plan: todayPlan(), size, just}`, `gems: gemLedger()`}. Побочный эффект `gemLedger` (запись `earnedMax`) тот же, что у каждого `renderHeader` |
| `OT.reset()` | удалить все ключи `arena-v1-*`, `data = blank()`, обнулить `math.*`, `words.round/hunt/fam`, `reading.view = 'list'`, `quest.q`, `quiz.g`, `daily`, `play.pr`; `stopTimer()`, `stopSpeech()`; убрать `#day-ov #week-ov #pet-ov #note-ov #prompter #day-pill`; `showTab('math')`, `renderAll()`. Дату и seed не трогает |
| `OT.setDate('YYYY-MM-DD')` / `OT.setDate(null)` | записать или снять подмену в `arena-ot-date` (переживает перезагрузку), затем `OT.render()`; вернуть `dayKey()` |
| `OT.seed(n)` / `OT.seed(null)` | `Math.random = mulberry32(n)` или вернуть родной; не сохраняется |
| `OT.showTab(name)` | `showTab` с проверкой имени, как клик без `busy()` |
| `OT.render()` | `renderAll()` плюс `render{Day,Week,Pet,Notes}()`, если окно открыто, и `renderProgress()` на «Прогрессе» |
| `OT.set(doc, patch)` | `Object.assign(data[doc], JSON-копия patch)`, `save(doc)`, `OT.render()`; вернуть `docs[doc]` |
| `OT.save(doc?)`, `OT.flush(doc?)` | `save` для одного или всех `DOCS`; `flush` снимает таймеры 700 мс и пишет в db сразу (только в режиме db) |
| `OT.play(kind, opts)` | запустить тренажёр как кнопка: `math` (`opts.items: [[a,b,op]]`), `nl`, `df` (`mode`), `cm` (`mode`, `items`: объекты генераторов), `wp`, `race` (`patch` в `math.race` после старта), `words` (`items`: id слов), `hunt` (`theme`, `list`: индексы), `fam` (`list`), `quest` (`id`), `play` (`id`). `opts.daily: true` задаёт `daily.size = DAILY_SIZE`. Вкладка переключается, `quietMath()` выполняется |
| `OT.open(name)`, `OT.close()` | `openDay/openWeek/openPet/openNotes` и закрытие всех окон |
| `OT.fn` | ссылки на чистые функции: `plural`, `dayKey`, `addDays`, `weekStart`, `isWeekend`, `factKey`, `pickMath`, `leitnerMath`, `pickWords`, `leitnerWord`, `trophyCount`, `dailyCounts`, `makePlan`, `gemLedger`, `petStage`, `buildReport`, `cmItems`, `gen: {read, set, dur, conv, coins, change, enough, ice, kop}`, `minCoins`, `raceCard`, `raceHops`, `racePads`, `wpPick`, `dfPaths`, `dfPickBosses`, `dfPickTwo`, `questValid`, `parseSent`, `weekCounts`, `goalNow`, `goalOptions` |
| `OT.consts()` | JSON-копия `INTERVALS, GEM, DAILY_SIZE, DAILY_NAMES, MOVES, PAIRS, BOSSES, STARTER, HUNT_A, HUNT_B, FAMS, QUESTS, SHOP, TREATS, PET_STAGES` |

Итого 14 функций верхнего уровня, 36 функций в `OT.fn` и `OT.consts()`.

## 3. Тесты

Пять файлов `apps/arena/tests/*.mjs` в стиле `oborona-tablicy/tests/05-podstroyka.mjs`: `const run = (page, fn, arg) => page.evaluate(fn, arg)`, в начале каждого теста `fresh(page)` = `OT.setDate('2026-10-12'); OT.seed(1); OT.reset()` (2026-10-12 — понедельник). Запускатель даёт каждому тесту новый контекст, поэтому localStorage уже пуст. Окно 1280×720, где нужно — `page.setViewportSize`. В `app.json` добавить `"tests": "tests"`.

**01-dym.mjs «Дым: страница, вкладки, окна»** (~25 с)

| # | Тест | Что делает и проверяет |
|---|---|---|
| 1 | Загрузка: OT есть, ключей нет, ошибок нет | `state().tab === 'math'`, ключей `arena-v1-*` нет, `docs` равны `blank()`, `storeMode === 'local'` |
| 2 | Пять вкладок на 1280×800 и 390×844 | клик по `#tab-*`: виден ровно один `#view-*`, `scrollWidth ≤ clientWidth`, скриншоты `--shot` |
| 3 | Все тренажёры открываются без ошибок | 390×844, `OT.play` всех видов, плюс текст (`[data-tid]`, `#r-start`, `#r-stop`), Шульте, суфлёр (`#pl-prompter`, `#pr-x`), «Своя игра» (`#qz-start`); после каждого нет горизонтальной прокрутки, `errors` пуст |
| 4 | Окна шапки открываются и закрываются | `#day-open`, `#wk-open`, `#gem-btn`, `#note-btn` → `state().overlay`; закрытие по `✕` и Escape |
| 5 | Кнопки для ребёнка не меньше 48 px | 390×844; видимые `button, a.btn, a.hdr-btn, [role=tab]` в «Счёте», раунде, «Словах» (3 режима), «Чтении», квесте, окнах дня, питомца и заметок: высота ≥ 48. Исключения для экранов взрослого: `#view-prog *`, `.q-del`, `[data-del]`, чекбоксы. Сейчас падает (см. 4.3) |
| 6 | Вкладка запоминается, `#prog` в адресе, во время раунда вкладки заперты | `showTab('words')` → перезагрузка → `words`; `goto(…#prog)` → `prog`; при `OT.play('math')` клик `#tab-read` не меняет вкладку |

**02-hranenie.mjs «Хранение и зеркало в db»** (~20 с)

| # | Тест | Что делает и проверяет |
|---|---|---|
| 7 | Только разрешённые ключи | после раунда, слов, квеста, гонки и окна дня ключи ⊆ `arena-v1-{math,words,reading,screen,family,tab,op,wplv,big,spaced,wpm,wcat,paper,wmode,htheme,race,quest-*}` |
| 8 | Прогресс переживает перезагрузку | раунд с заданными примерами и диктант → `reload` → `docs` равны, клетки карты и `#trophy-count` те же |
| 9 | Битый JSON не ломает страницу | `addInitScript` кладёт `"{oops"`, `"null"`, `"[1]"` в документы → без ошибок, документы по умолчанию, все вкладки рисуются |
| 10 | Зеркало в db: пять документов, запись с задержкой | мок `window.claude.use` как в «Обороне» (`__db.sets`, `listeners`); пути ровно `arena/{family,math,reading,screen,words}`; после раунда записей `arena/math` ≤ 3, в последней есть факты; настроек и `race` в db нет; `#store-note` про хранение вместе со страницей |
| 11 | Снимок из db | `listeners['arena/math']({exists: true, data: () => ({facts: …})})` → `docs.math.facts` и localStorage заменены; во время раунда снимок не трогает `ui.math.round` (тот же `i` и `phase`), шапка обновлена; при ожидающем таймере снимок пропускается |
| 12 | Ошибки db и тексты для сайта | `set` отклоняется с `not_granted` → `storeMode === 'readonly'`, localStorage пишется. Каждая строка `rewords` встречается в исходнике ровно один раз (`fs`, `app.src`); без `claude` три текста про ИИ видны на страницах. Если есть свежий `docs/trenazhery.html`: новых текстов там по одному, старых и «в чате Claude» нет |

**03-schet.mjs «Счёт: Лейтнер, часы и деньги, гонка, задачи»** (~40 с)

| # | Тест | Что делает и проверяет |
|---|---|---|
| 13 | Интервалы Лейтнера 0/1/3/7/14 | `leitnerMath` по ящикам 1→5: `due = addDays(today, INTERVALS[b])`; ошибка → `b = 1`, `due = today`; ящик не выше 5 |
| 14 | Ящик растёт раз в день и только при уверенном ответе | тот же день дважды → +1; 6000 мс (на ящиках 3+ — 4000 мс) → без роста; новый факт за 3 с → `b = 2`, `up = today`; ящик 4 впервые на третий день (D, D, D+1, D+2). Сейчас падает (4.1) |
| 15 | Раунд на странице | `OT.play('math', {items: [[7,8,'m'], …]})`, ввод через `#m-pad`; ошибка → `phase 'copy'`, в тексте «56», повтор вставлен на `i+3`, нужен верный ввод; конец → +1 в `sessions`; в раунде нет секунд (`/\d+,\d с/`) |
| 16 | Подбор `pickMath` | с `OT.set` (6 трудных на сегодня, 2 трудных на завтра, 20 знакомых пора, остальные новые) и 200 сидами: 15 примеров, трудных ≤ 4 и только сегодняшние, новых ≤ 5 и сначала лёгкие (`×2`) |
| 17 | «Опорные факты» | `dfPaths(7,8)` содержит «5 × 8 + 2 × 8»; босс с `lvl: 2, ok: 1, okDay: вчера`, решённый по памяти, → `ok: 2`, «побеждено 1 из 15»; второй раз в тот же день не считается |
| 18 | Часы: стрелки мышью и кнопками | `OT.play('cm', {items: [{type:'set', kind:'clockset', th:4, tm:15, …}, …]})`; `page.mouse` по `#clk-set` (минутная — радиус > 58, часовая — 40) → `aria-label` «Часы показывают 4:15», `#cm-check` → верно; второе задание через `[data-hh]`/`[data-mm]`; неверное → «Бледные стрелки — как надо» |
| 19 | Деньги: ровно, перебор, сдача | цель 37: `[data-add]` 10, 10, 10, 5, 2 → `#cm-pay` активна, «Меньше монет не бывает»; +50 → «перебор», кнопка неактивна; сдача — ввод через `#cm-pad` |
| 20 | Генераторы часов и денег, `plural` | 500 сидов: у `read` 3 разных варианта, среди них ответ, `m % 5 === 0`; у `change` 0 < ответ < `pay`; у `enough` `yes ⇔ wallet ≥ sum`, ответ равен разнице; `minCoins(189) = 8`; `plural`: 1, 2, 5, 11, 21, 112 рублей |
| 21 | Гонка: ходы и проверка ошибок взрослого | `#race-start` с проверкой; ребёнок: `#race-draw`, ввод `pos + card.d` → позиция с учётом `pads`, `stars[0] = 1`; взрослый: заявка `верно+1` → `phase 'check'`, `[data-rv="0"]` → `fix`, верный ввод → `st.ct = [1,1]`; ошибка, которую он пропустил, → `missed`; верная заявка с «Ошибка» → `falsealarm` |
| 22 | Гонка: пауза и финиш | после двух ходов `reload` → `#race-resume` возвращает позицию; `OT.play('race', {patch: {pos: [99, 0]}})` → финиш, запись в `data.math.race.games`, ключ `arena-v1-race` удалён, гемы +3 |
| 23 | «Задачи бравлера» и числовая прямая | `OT.play('wp')`: сначала `[data-op]`; неверное действие → подсказка без ответа, потом ввод числа → запись в `wp`/`wpt`. 300 сидов `wpPick`: ответы целые и ≥ 0. Прямая: клик по `#nl` на 50 % → промах в %; две сессии с `err < 5` → линия до 1000 |

**04-slova.mjs «Слова: диктант, охота, семейка»** (~30 с)

| # | Тест | Что делает и проверяет |
|---|---|---|
| 24 | Диктант: самопроверка по буквам | `OT.play('words', {items: ['d1','c1','s1']})`; `#w-check` → в `.reveal` 6 букв, `.hot` на индексе 1, «в слове 6 букв»; `#w-no` → `study`, через 3,5 с `listen` с `retry`; `#w-ok` → дальше; `prog.d1 = {b:1, due: today}` |
| 25 | Лейтнер слов и `pickWords` | `leitnerWord` растёт на каждом верном ответе без правила «раз в день» (решение из STATUS), ошибка → 1, интервалы как у таблицы; `pickWords`: сначала пора повторить (по ящику), новых ≤ 3, всего 8 |
| 26 | Слова с ошибками не показываются нигде | в node из `OT.consts()` строится список ошибочных написаний: замена отмеченной гласной о↔а, е↔и в `STARTER` (dict, check) и `HUNT_A`, `gap` с `alt` в `FAMS` («вада», «лисник»). Прогон с ошибками везде: диктант, охота A и B, семейка, затем «Прогресс» и сводка. После каждого шага `innerText` и атрибуты (`aria-label`, `title`, `data-*`) не содержат ни одного слова из списка (граница слова по кириллице). -тся/-ться не проверяем: обе формы бывают верными |
| 27 | «Охота на орфограммы» | `OT.play('hunt', {theme:'a', list:[1]})`: `[data-j]` по отмеченным словам и одному лишнему → `#h-check`, итог `found/total/fp`; объяснение `[data-ty]`, `[data-ck]`; тема B: `[data-q]`, `[data-e]`, на месте окончания «…ся»; запись в `data.words.hunt` |
| 28 | «Семейка слов» | `OT.play('fam', {list:[0]})`: «водитель» → `[data-fc]` «во́ды» → `[data-fl="о"]` → итог 1/1/1; путь с ошибками даёт 0 в «сразу верно» |

**05-den-i-semya.mjs «Тренировка дня, гемы, неделя, заметки, сводка»** (~50 с)

| # | Тест | Что делает и проверяет |
|---|---|---|
| 29 | Состав и порядок шагов | `OT.open('day')` на 3 дня подряд: шаги `math, words, move, X, read`, за три дня X ∈ {cm, wp, df} по разу (без привязки к конкретной дате из-за часового пояса); 3 разных упражнения из `MOVES`; надписи «6 примеров», «4 слова», «2 минуты», «7–10 минут» |
| 30 | Весь путь с «Дальше» | `#day-open` → `#day-go` → раунд из 6, все верно → `#day-pill` «Дальше: Слова» → 4 слова (`#w-check`, `#w-ok`) → `#day-moved` → `#day-skip` на применении → `[data-dread="quest"]` → один `[data-go]` (2 страницы) → `plan.fin`, «✓ Тренировка дня сделана», `gems.today ≥ 10`; следующий обычный раунд снова из 15 |
| 31 | Берёт то, что пора повторить | 3 трудных на сегодня, 30 знакомых не пора, новые; 20 сидов: в 6 примерах дня ≥ 2 трудных и ни одного «не пора». Слова: 2 «пора», остальные не пора → оба в четвёрке. Сейчас падает (4.2) |
| 32 | Шаг по счётчику, перезагрузка, новый день | `OT.set('words', {sessions: [{d: today, …}]})` → шаг `words` выполнен; `reload` → тот же план; `setDate(+1)` → плана нет, «▶ Тренировка дня» |
| 33 | Гемы: не больше 30 в день | 20 сессий сегодня → `today = 30`, вчера 20 → отдельно 30; 2 трофея → +10 сверх лимита; `sessions: []` → `earned` не уменьшился (`earnedMax`) |
| 34 | Гемы только на питомца, питомец не грустит | `[data-pk]` без имени → «Сначала придумай имя.»; с именем → питомец; покупка `cap` (20) → баланс −20, `wear.hat`; при нехватке кнопка неактивна; `docs.screen` до и после покупки равен; в окне нет /матч|экран/, на «Матчах» нет «💎» и «гем»; `setDate(+60)` без занятий → в окне нет /грус|скуча|голод|бол[её]|плач/; `petStage` 0, 149, 150, 449, 450 |
| 35 | «Моя неделя» | понедельник: `[data-wgo]` с «4 раунда» → 4 сессии через `OT.set` → «🎉 Цель выполнена», `hit`, гемы +15; воскресенье 2026-10-18 → `.wk-late`, `#wk-proud` + `#wk-save` → `.wk-late` нет; 2026-10-19 → «Выбери цель», в прошлых неделях «Горжусь» |
| 36 | «Мои заметки» | пусто → «Напиши хотя бы пару слов.»; `[data-nk="idea"]`, текст, `#note-add` → `where` «Счёт»; «Прогресс»: `[data-nrep]` + change → `#note-badge` «1»; открыть заметки → значок скрыт, ответ виден; `[data-ndone]`; удаление в два нажатия |
| 37 | Сводка для логопеда | сессии за 10 дней через `OT.set`, `#rp-obs`, `#rp-qs`, `[data-rpd="14"]`, `#rp-build` → в `#rp-text` разделы РЕГУЛЯРНОСТЬ, ЧТЕНИЕ, ПИСЬМО И ОРФОГРАФИЯ, СЧЁТ, ЧТО МЫ ЗАМЕЧАЕМ ДОМА, НАШИ ВОПРОСЫ и «из 14»; `navigator.clipboard.writeText` подменён в `addInitScript`: `#rp-copy` → текст совпал, «Скопировано.»; при отказе «Текст выделен» |

Всего 37 тестов, примерно 165 с с запасом. Самые медленные — фаза `study` (3,5 с) и автопереход раунда (650 мс): тесты ждут их через `page.waitForFunction` по `OT.state()`, без `waitForTimeout`.

## 4. Исправления по пути

1. **Лейтнер таблицы (важно, тот же PR).** Новый факт при уверенном ответе получает `b = 2` без `up` (строка 863). Второй раунд в тот же день поднимает его до 3, на следующий день он становится «освоен». Получается два дня, а в решении STATUS — три. Правка: `if (!s.b) { s.b = ms <= 5000 ? 2 : 1; if (s.b === 2) s.up = today; }`. Тест 14.
2. **«Тренировка дня» не гарантирует повторение (важно, решает оркестратор).** `sized(pickMath(), "math")` и `sized(pickWords(), "words")` берут первые 6 и 4 из уже перемешанного раунда. Трудные и «пора» слова могут не попасть, а знакомые «не пора» — попасть. Предложение: `pickMath(n)` и `pickWords(n)` с `n = daily.size && daily.size.math` (и `.words`). В `pickMath` доли сохраняются: трудных `Math.round(n*4/15)`, новых `Math.round(n/3)` (для 15 это те же 4 и 5, для 6 — 2 и 2). Перемешивание после отбора. В `pickWords` `WROUND` заменяется на `n`. Около 10 строк. Тест 31. Если оркестратор против — тест 31 пропускается, строка «важно» идёт в STATUS.
3. **Кнопки меньше 48 px (тот же PR, CSS).** По замеру в Chromium: `.seg button` 45 px (`min-height: 42px`, строка 66), вкладки 46 (строка 55), `.hdr-btn` 46 (425), `.blok-btn` 44 (429), `.btn.sm` 40 (450; это покупка в магазине питомца и удаление заметки). Правка: всем `min-height: 48px`, `.hdr-btn` `height: 48px; min-width: 48px`. Скриншоты шапки на 390×844 до и после: шапка остаётся в два ряда. Тест 5.
4. **«5 минут» (контент, тот же PR).** Строка 496: «Счёт, чтение и слова. Одна тренировка — 5 минут.» → «Счёт, чтение и слова. Тренировка дня — 7–10 минут.» Строка 4538: «1–2 тренировки в день по 5 минут.» → «Одна «Тренировка дня» на 7–10 минут, по желанию ещё один тренажёр.» Остальная часть пункта остаётся. «Хватит двух тренировок в день» (строка 678) с этим согласуется. «Разговор в воскресенье, 5 минут» (3239) — про другое, не трогаем.
5. **Подсказка про чат на сайте (тот же PR, `app.json`).** Новая пара в `rewords`: `["Чтобы я починил или добавил то, о чём он пишет, скажите мне в чате Claude: «прочитай заметки сына в арене».", "Заметки хранятся только в этом браузере. Чтобы Claude починил или добавил то, о чём он пишет, перепишите заметки в чат Claude."]`. Проверяют сборка и тест 12.
6. **Комментарий (тот же PR).** Строка 528: `<!-- PROGRESS -->` → `<!-- GAMES -->`, над `view-prog` добавить `<!-- PROGRESS -->`.
7. **Не чинить, записать в STATUS («мелочь»).** Битые типы внутри документа (`facts: null`) роняют вкладку: нормализовать при загрузке, как `dfData`. Пустой db получает локальный прогресс только после первого `save`. Чередование задания на применение зависит от часового пояса.

## 5. Порядок работы для кодера

1. Прочитать `dev/STATUS.md` и этот план.
2. Правки из раздела 2: `blank()`, подмена даты в `dayKey`, `leitnerMath`/`leitnerWord`, блок `window.OT` перед зеркалом db. Проверка: страница открывается, `OT.state()` отвечает, в консоли пусто.
3. Исправления 4.1, 4.3–4.6. Исправление 4.2 — после решения оркестратора.
4. В `app.json` добавить `"tests": "tests"`. Написать `tests/01-dym.mjs` … `05-den-i-semya.mjs` в порядке файлов, после каждого `node tools/test_app.mjs arena --grep <слово>`.
5. Полный прогон: `python3 tools/build_site.py && node tools/test_app.mjs arena` (ожидается < 3 мин), затем `--shot` для скриншотов в `dev/shots/` (вкладки 390×844, окно дня, питомец).
6. `git status` без `docs/`. Обновить `dev/STATUS.md`: «Как работать» (тесты, `window.OT`, `arena-ot-date`), принятые решения (подмена даты, `OT.seed` через `Math.random`), закрытые замечания (тесты, «5 минут», `rewords`, комментарий, 48 px, Лейтнер), новые «мелочи» из 4.7, история.

**Приёмка для ревьюера.**
- `node tools/test_app.mjs arena`: 37 из 37 (или 36 с пропущенным 31 и записью в STATUS), меньше 3 минут, два прогона подряд зелёные (с `seed` и `setDate` нет случайных падений).
- Без вызова `OT` поведение страницы прежнее. Дифф скрипта: только блок `OT`, `blank()`, строка в `dayKey`, вынос Лейтнера и исправления раздела 4.
- Тесты 14 и 5 падают на старом коде и проходят на новом. Проверить через `git stash` правок 4.1 и 4.3.
- `python3 tools/build_site.py` проходит, в `docs/trenazhery.html` нет «в чате Claude».
- STATUS обновлён, в «Проверить вручную» остались перо, голос, `db` на двух устройствах и офлайн.

## Решения оркестратора

1. Ошибка Лейтнера (новый факт в ящик 2 без отметки `up`): исправить, тест 14 обязателен.
2. «Тренировка дня»: отбор трудных фактов и слов на повторение до перемешивания (`pickMath(n)`, `pickWords(n)`): исправить, тест 31 обязателен. Причина: тренировка должна собираться из того, что пора повторить, это её смысл по README.
3. Кнопки меньше 48 px (`.seg`, вкладки, шапка, `.btn.sm`): исправить в CSS, тест 5 обязателен.
4. Мелочи из STATUS (текст «7–10 минут», подсказка про чат через `rewords`, комментарий): в этом же PR.
5. Пункт 8 (битые типы в документе, пустое db, часовой пояс): не исправлять, записать в STATUS как мелочи.
