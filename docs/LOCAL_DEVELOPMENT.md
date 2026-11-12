# Локальная разработка VS Code

Основной компьютер разработчика: `%USERPROFILE%\Navikultura`. Сервер DESKTOP-OBLAKO не используется до приёмки.

- Установить Node.js 26 LTS и Git.
- `npm.cmd install --no-audit --no-fund` и `npm.cmd run check`.
- **Terminal → Run Task → Navikultura: Start API + Web** — запускает API в read-only preview-режиме без PostgreSQL и Vite с HMR.
- Просмотр: http://127.0.0.1:5173/screen
- Редактор с правами и публикацией требует PostgreSQL Stage 01, отдельной задачи API (PostgreSQL).
- Шаблон Excel: `templates/Расписание_пример.xlsx`; скопировать в `content/schedule/raspisanie.xlsx`.
- Афиши: `content/posters/`.
- VS Code Auto Save не равно Git commit: сохраняются только файлы, коммиты создаются осознанно.
- Перед обновлением ветки проверить `git status --short`; при изменениях прекратить pull и разобраться, не применять force/reset.
- В GitHub нельзя помещать реальные данные посетителей, сотрудников, пароли, `.env`, резервные копии.
