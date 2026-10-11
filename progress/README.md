# Ход работ над играми

Две учебные игры по заданиям из `prompts/`: «Ферма у реки» и «Оборона таблицы». Здесь лежат проектные документы и отчёты по этапам: что сделано, что осталось, что найдено и решено.

- [`00-konvencii.md`](00-konvencii.md) — общие конвенции для всех агентов.
- `ferma/` — «Ферма у реки»: [`00-proekt.md`](ferma/00-proekt.md) (проект), [`01-prototip.md`](ferma/01-prototip.md), [`02-polnaya-igra.md`](ferma/02-polnaya-igra.md).
- `oborona/` — «Оборона таблицы»: [`00-proekt.md`](oborona/00-proekt.md), [`01-prototip.md`](oborona/01-prototip.md), [`02-polnaya-igra.md`](oborona/02-polnaya-igra.md).
- [`03-sajt.md`](03-sajt.md) — сборка в `docs/`, иконки, ссылки.

## Итог

| Игра | Исходник | На сайте | Версия | Тестов |
|---|---|---|---|---|
| Ферма у реки | `plan/ferma.html` | `docs/ferma.html` | 1.0.1, сохранение v5 | 1118 |
| Оборона таблицы | `plan/oborona.html` | `docs/oborona.html` | 1.0.0, сохранение v1 | 518 |

Открытые вопросы для заказчика собраны в разделах «Осталось» и «Найдено и решено» отчётов `02-polnaya-igra.md` обеих игр.

Как работали: оркестратор (Fable) ставит задачи, аналитики и ревьюверы — Opus, кодеры — Sonnet. Тесты: `node tools/tests/ferma.test.cjs`, `node tools/tests/oborona.test.cjs`.
