# НавиКультура

Информационная платформа ГДК «Кировский»: браузерный экран посетителя и кабинет сотрудника. Основной сервер планируется на Windows ПК `DESKTOP-OBLAKO`.

**Этап 01 — лабораторная версия, не развернута в локальной сети ДК.**

## Технологии

Vue 3 + TypeScript + Vite, Fastify + Node.js 26, PostgreSQL 18.

## Разработка

1. Установить Node.js 26, PostgreSQL 18; использовать **отдельную тестовую** БД и пользователя с минимальными правами.
2. Копировать `.env.example` в личное окружение, но не добавлять реальные пароли в git.
3. Создать `DATABASE_URL` и `EDITOR_ORIGIN=http://127.0.0.1:5173` для API процесса.
4. `npm install --no-audit --no-fund`
5. `npm run migrate -w @navikultura/api`
6. Создать админа через `npm run bootstrap:admin -w @navikultura/api -- admin`, подав пароль из stdin (не аргументом).
7. В двух терминалах: `npm run dev:api` и `npm run dev:web`.
8. Для новых сотрудников доступна команда `npm run create:user -w @navikultura/api -- LOGIN editor` (или `viewer`); пароль подаётся из stdin.
9. `http://127.0.0.1:5173/editor` и `http://127.0.0.1:5173/screen`.

## Контроль качества

`npm run check` включает typecheck, API tests и web build. CI см. `.github/workflows/ci.yml`.

## Статусы

Stage 00 — опубликованная рабочая ветка; Stage 01 — кандидат для лабораторной проверки. Афиши и Excel будут реализованы на следующих этапах. Текущий редактор сохраняет только демонстрационную страницу `welcome`.

Документация: `docs/STAGE01_ACCEPTANCE.md`, `docs/STAGE01_OBLAKO_PRECHECK.md`, `docs/ROADMAP.md`, `docs/SECURITY.md`.
