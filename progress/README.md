# Ход работ над играми

Две учебные игры по заданиям из `prompts/`: «Ферма у реки» и «Оборона таблицы». Здесь лежат проектные документы и отчёты по этапам: что сделано, что осталось, что найдено и решено.

- [`00-konvencii.md`](00-konvencii.md) — общие конвенции для всех агентов.
- `ferma/` — «Ферма у реки»: `00-proekt.md`, `01-prototip.md`, `02-polnaya-igra.md`.
- `oborona/` — «Оборона таблицы»: `00-proekt.md`, `01-prototip.md`, `02-polnaya-igra.md`.
- `03-sajt.md` — сборка в `docs/`, иконки, ссылки.

Как работали: оркестратор (Fable) ставит задачи, аналитики и ревьюверы — Opus, кодеры — Sonnet. Тесты: `node tools/tests/ferma.test.cjs`, `node tools/tests/oborona.test.cjs`.
