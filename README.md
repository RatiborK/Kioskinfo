# НавиКультура

Веб-платформа информации ДК «Кировский»: экран посетителя (`/screen`) и кабинет сотрудника (`/editor`).
Разрабатываем локально на ПК с VS Code; сервер `DESKTOP-OBLAKO` не задействован до завершения тестирования.

## Стек

Vue 3 + TypeScript + Vite, Fastify 5 + Node.js 26, PostgreSQL 18 для работы в локальной сети ДК.

## Локальный запуск без PostgreSQL

1. `npm.cmd install --no-audit --no-fund`
2. `npm.cmd run check`
3. Запустить задачу VS Code **Navikultura: Start API + Web** (или в двух терминалах `npm.cmd run dev:preview` и `npm.cmd run dev:web`).
4. Открыть `http://127.0.0.1:5173/editor`; использовать логин `admin` и **временный пароль из терминала API**.
5. Веб-форма расписания позволяет создавать, изменять и публиковать карточки. Опубликованные кнопки появляются на `/screen` через 10 секунд.
6. Файлы афиш добавляются в `content/posters` или через редактор.

Локальные данные хранятся в `content/schedule/records.json`, вне Git. **Этот режим только для одного ПК, не для локальной сети учреждения.**

## Серверный режим (позже)

Настроить отдельную PostgreSQL, выполнить `npm.cmd run migrate -w @navikultura/api`, создать администратора через `bootstrap:admin` и включить HTTPS перед предоставлением доступа сотрудникам. Прямое подключение Fastify к LAN не допускается.

## Контроль качества и этапы

`npm.cmd run check` запускает проверку типов, тесты и сборку. Подробности: `docs/LOCAL_DEVELOPMENT.md`, `docs/SCHEDULE_WEB_EDITOR.md`, `docs/STAGE03_ACCEPTANCE.md`, `docs/ROADMAP.md`.
