# Lola Kurort Booking

Статический мобильный сайт для бронирования смен на курорте. Сайт работает на GitHub Pages, а общие данные хранит в Firebase Firestore: даты, смены, заявки из WhatsApp и подтвержденные брони.

## Файлы

- `index.html` — публичная страница бронирования.
- `style.css` — общий mobile-first дизайн.
- `script.js` — календарь, выбор смены, создание `pending`-заявки и WhatsApp-ссылка.
- `config.js` — Firebase-конфиг, название курорта и номер WhatsApp.
- `admin/index.html` — вход администратора и панель управления.
- `admin/admin.css` — стили админ-панели.
- `admin/admin.js` — вход через Firebase Auth, добавление дат, подтверждение и отмена броней.
- `firebase/firestore.rules` — правила доступа Firestore.
- `assets/resort-hero.png` — hero-изображение.

## Подключение Firebase

1. Создайте проект в Firebase Console.
2. Откройте Project settings → General → Your apps и добавьте Web app.
3. Скопируйте объект `firebaseConfig`.
4. В `config.js` замените значения:

```js
export const FIREBASE_CONFIG = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID",
};
```

5. В Firebase Console откройте Build → Firestore Database и создайте базу.
6. В Firestore → Rules вставьте содержимое файла `firebase/firestore.rules` и нажмите Publish.
7. В Authentication → Sign-in method включите Email/Password.
8. В Authentication → Users создайте администратора.
9. Скопируйте UID администратора.
10. В Firestore создайте коллекцию `admins`, а в ней документ с ID, равным UID администратора. Можно добавить поля:

```json
{
  "email": "admin@example.com",
  "role": "admin"
}
```

После этого админ сможет войти на `/admin/`.

## Коллекции Firestore

`slots`:

- document id: `YYYY-MM-DD_first` или `YYYY-MM-DD_second`
- `date`
- `shift`
- `startTime`
- `endTime`
- `status`
- `createdAt`
- `updatedAt`

`bookings`:

- `slotId`
- `date`
- `shift`
- `clientName`
- `clientPhone`
- `status`
- `adminNote`
- `createdAt`
- `updatedAt`

`admins`:

- document id: Firebase Auth UID администратора.

## Как изменить WhatsApp

В `config.js` замените номер:

```js
export const WHATSAPP_PHONE = "77000000000";
```

Номер указывается только цифрами, без `+`, пробелов и скобок.

## Как админ подтверждает бронь

1. Откройте `/admin/`.
2. Войдите email и паролем администратора из Firebase Auth.
3. Добавьте доступные даты и смены.
4. Когда пользователь нажмет “Перейти в WhatsApp для оплаты”, появится заявка со статусом `pending`.
5. После оплаты нажмите “Подтвердить бронь”. Заявка станет `booked`, слот станет `booked`, а другие pending-заявки на этот слот будут отменены.
6. Чтобы вернуть слот в продажу, нажмите “Освободить”.

## Публикация на GitHub Pages

Репозиторий уже может публиковаться через GitHub Pages из ветки `main` и папки `/`.

Если нужно включить вручную:

1. В репозитории откройте Settings → Pages.
2. В Source выберите Deploy from a branch.
3. Выберите ветку `main` и папку `/ (root)`.
4. Сохраните настройки.

После публикации сайт доступен по адресу GitHub Pages, а админка — по адресу `/admin/`.

## Локальный просмотр

Откройте папку проекта и запустите простой локальный сервер:

```bash
python3 -m http.server 8080
```

Затем откройте `http://localhost:8080`.
