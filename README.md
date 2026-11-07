# Smart Logistics

Учебный проект платформы складской телематики и отслеживания доставок.

## Структура

- [`backend/`](backend/README.md) — FastAPI, JWT/RBAC, REST и WebSocket API.
- [`frontend/`](frontend/README.md) — React, TypeScript, Vite и Tailwind CSS.
- [`simulator/`](simulator/README.md) — генератор показаний датчиков и GPS курьера.
- [`database-schema/`](database-schema/README.md) — ER-диаграмма и описание таблиц.

Бизнес-данные пользователей и заказов хранятся в `backend/business.db`, телеметрия — отдельно в `backend/telemetry.db`. В текущей версии оба хранилища — SQLite.

## Локальный запуск

1. Настройте backend по [`backend/README.md`](backend/README.md), установите Python-зависимости и запустите API на `http://127.0.0.1:8000`.
2. Для тестовых аккаунтов и примера заказа выполните из папки `backend` команду `python -m app.seed_demo`.
3. Из папки `frontend` выполните `npm install`, затем `npm run dev`. Откройте адрес Vite, обычно `http://localhost:5173`.
4. Для проверки потоков запустите симулятор согласно [`simulator/README.md`](simulator/README.md).

Демо-пароли предназначены только для локального тестирования. Не используйте их в опубликованном или производственном развёртывании.
