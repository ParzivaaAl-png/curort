# Lola Kurort Booking

Статический мобильный сайт для бронирования смен на курорте. Работает на GitHub Pages, а данные хранит в Supabase: даты, смены, заявки из WhatsApp и подтвержденные брони.

## Файлы

- `index.html` — публичная страница бронирования.
- `style.css` — общий mobile-first дизайн.
- `script.js` — календарь, выбор смены, создание pending-заявки и WhatsApp-ссылка.
- `config.js` — Supabase-ключи, название курорта и номер WhatsApp.
- `admin/index.html` — вход администратора и панель управления.
- `admin/admin.css` — стили админ-панели.
- `admin/admin.js` — вход через Supabase Auth, добавление дат, подтверждение и отмена броней.
- `supabase/schema.sql` — таблицы, статусы, RLS-политики и RPC-функции.
- `assets/resort-hero.png` — hero-изображение.

## Подключение Supabase

1. Создайте проект в Supabase.
2. Откройте SQL Editor и выполните файл `supabase/schema.sql`.
3. В Supabase откройте Authentication → Users и создайте администратора с email и паролем.
4. Скопируйте UUID созданного пользователя.
5. В SQL Editor выполните:

```sql
insert into public.admin_users (user_id)
values ('UUID_АДМИНА')
on conflict do nothing;
```

6. В Project Settings → API скопируйте Project URL и anon public key.
7. В `config.js` замените:

```js
export const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

Anon key можно хранить в GitHub Pages: безопасность держится на RLS-политиках. Service role key никогда не публикуйте.

## Как изменить WhatsApp

В `config.js` замените номер:

```js
export const WHATSAPP_PHONE = "77000000000";
```

Номер указывается только цифрами, без `+`, пробелов и скобок.

## Как админ подтверждает бронь

1. Откройте `/admin/`.
2. Войдите email и паролем администратора из Supabase Auth.
3. Добавьте доступные даты и смены.
4. Когда пользователь нажмет “Перейти в WhatsApp для оплаты”, появится заявка со статусом `pending`.
5. После оплаты нажмите “Подтвердить бронь”. Слот станет `booked` и пропадет как доступный для пользователей.
6. Чтобы вернуть слот в продажу, нажмите “Освободить”.

## Публикация на GitHub Pages

1. Загрузите файлы в GitHub-репозиторий.
2. В репозитории откройте Settings → Pages.
3. В Source выберите Deploy from a branch.
4. Выберите ветку `main` и папку `/root`.
5. Сохраните настройки.

После публикации сайт будет доступен по адресу GitHub Pages. Админка будет по адресу `/admin/`.

## Локальный просмотр

Откройте папку проекта и запустите простой локальный сервер:

```bash
python3 -m http.server 8080
```

Затем откройте `http://localhost:8080`.
