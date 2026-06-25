import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { FIREBASE_CONFIG, RESORT_NAME } from "../config.js?v=20260625-2";

const SHIFT_META = {
  first: { label: "Первая смена", time: "10:00–17:00", startTime: "10:00", endTime: "17:00" },
  second: { label: "Вторая смена", time: "18:00–00:00", startTime: "18:00", endTime: "00:00" },
};

const isConfigured =
  Boolean(FIREBASE_CONFIG.apiKey) &&
  Boolean(FIREBASE_CONFIG.projectId) &&
  !FIREBASE_CONFIG.apiKey.includes("YOUR_FIREBASE") &&
  !FIREBASE_CONFIG.projectId.includes("YOUR_PROJECT");

const app = isConfigured ? initializeApp(FIREBASE_CONFIG) : null;
const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;

const state = {
  slots: [],
  bookings: [],
  user: null,
};

const els = {
  loginPanel: document.querySelector("#loginPanel"),
  adminApp: document.querySelector("#adminApp"),
  loginForm: document.querySelector("#loginForm"),
  email: document.querySelector("#email"),
  password: document.querySelector("#password"),
  loginHint: document.querySelector("#loginHint"),
  logoutButton: document.querySelector("#logoutButton"),
  refreshButton: document.querySelector("#refreshButton"),
  addDateForm: document.querySelector("#addDateForm"),
  slotDate: document.querySelector("#slotDate"),
  slotsList: document.querySelector("#slotsList"),
  bookingsList: document.querySelector("#bookingsList"),
  stats: document.querySelector("#stats"),
  toast: document.querySelector("#toast"),
};

document.title = `${RESORT_NAME} — админ`;
document.querySelectorAll(".brand-text, .admin-title .eyebrow").forEach((node) => {
  if (node.textContent.trim() === "Lola Kurort") node.textContent = RESORT_NAME;
});

bindEvents();
initAuth();

function bindEvents() {
  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutButton.addEventListener("click", handleLogout);
  els.refreshButton.addEventListener("click", () => loadAdminData());
  els.addDateForm.addEventListener("submit", handleAddSlots);
  els.slotDate.min = toIsoDate(new Date());
}

function initAuth() {
  if (!isConfigured) {
    els.loginHint.textContent = "Заполните FIREBASE_CONFIG в config.js.";
    els.loginForm.querySelector("button").disabled = true;
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    updateAuthView();

    if (user) {
      await loadAdminData();
    } else {
      state.slots = [];
      state.bookings = [];
      render();
    }
  });
}

function updateAuthView() {
  const isLoggedIn = Boolean(state.user);
  els.loginPanel.hidden = isLoggedIn;
  els.adminApp.hidden = !isLoggedIn;
  els.logoutButton.hidden = !isLoggedIn;
}

async function handleLogin(event) {
  event.preventDefault();

  const button = els.loginForm.querySelector("button");
  button.disabled = true;
  button.textContent = "Входим...";

  try {
    await signInWithEmailAndPassword(auth, els.email.value.trim(), els.password.value);
    showToast("Вход выполнен.");
  } catch (error) {
    console.error(error);
    showToast("Не получилось войти. Проверьте логин и пароль.");
  } finally {
    button.disabled = false;
    button.textContent = "Войти";
  }
}

async function handleLogout() {
  await signOut(auth);
}

async function loadAdminData() {
  try {
    const [slotsSnapshot, bookingsSnapshot] = await Promise.all([
      getDocs(collection(db, "slots")),
      getDocs(query(collection(db, "bookings"), orderBy("createdAt", "desc"))),
    ]);

    state.slots = slotsSnapshot.docs
      .map((document) => ({ id: document.id, ...document.data() }))
      .filter(isValidSlot)
      .sort(sortSlots);
    state.bookings = bookingsSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));
    render();
  } catch (error) {
    console.error(error);
    showToast("Нет доступа к данным. Проверьте коллекцию admins и Firestore Rules.");
  }
}

function render() {
  renderStats();
  renderSlots();
  renderBookings();
}

function renderStats() {
  const available = state.slots.filter((slot) => isSlotFree(slot.status)).length;
  const pending = state.bookings.filter((booking) => booking.status === "pending").length;
  const booked = state.slots.filter((slot) => slot.status === "booked").length;
  const dates = new Set(state.slots.map((slot) => slot.date)).size;

  els.stats.innerHTML = [
    ["Даты", dates],
    ["Свободно", available],
    ["Заявки", pending],
    ["Занято", booked],
  ]
    .map(
      ([label, value]) => `
        <article class="stat-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `,
    )
    .join("");
}

function renderSlots() {
  if (!state.slots.length) {
    els.slotsList.innerHTML = `<div class="empty-admin">Пока нет доступных дат.</div>`;
    return;
  }

  els.slotsList.innerHTML = state.slots.map(renderSlotRow).join("");
  els.slotsList.querySelectorAll("[data-release-slot]").forEach((button) => {
    button.addEventListener("click", () => releaseSlot(button.dataset.releaseSlot));
  });
  els.slotsList.querySelectorAll("[data-delete-slot]").forEach((button) => {
    button.addEventListener("click", () => deleteSlot(button.dataset.deleteSlot));
  });
}

function renderSlotRow(slot) {
  const meta = SHIFT_META[slot.shift];
  return `
    <article class="slot-row">
      <div class="slot-row-top">
        <div class="row-title">
          <strong>${formatDateLong(slot.date)}</strong>
          <span>${meta.label}, ${meta.time}</span>
        </div>
        ${statusPill(slot.status)}
      </div>
      <div class="row-actions">
        <button class="ghost-button" type="button" data-release-slot="${slot.id}">Освободить</button>
        <button class="danger-button" type="button" data-delete-slot="${slot.id}">Удалить слот</button>
      </div>
    </article>
  `;
}

function renderBookings() {
  if (!state.bookings.length) {
    els.bookingsList.innerHTML = `<div class="empty-admin">Заявок пока нет.</div>`;
    return;
  }

  els.bookingsList.innerHTML = state.bookings.map(renderBookingRow).join("");
  els.bookingsList.querySelectorAll("[data-confirm-booking]").forEach((button) => {
    button.addEventListener("click", () => confirmBooking(button.dataset.confirmBooking));
  });
  els.bookingsList.querySelectorAll("[data-cancel-booking]").forEach((button) => {
    button.addEventListener("click", () => cancelBooking(button.dataset.cancelBooking));
  });
  els.bookingsList.querySelectorAll("[data-save-note]").forEach((button) => {
    button.addEventListener("click", () => saveNote(button.dataset.saveNote));
  });
}

function renderBookingRow(booking) {
  const meta = SHIFT_META[booking.shift];
  const name = escapeHtml(booking.clientName || "Имя не указано");
  const phone = escapeHtml(booking.clientPhone || "Телефон не указан");
  const note = escapeHtml(booking.adminNote || "");
  const canConfirm = booking.status === "pending";
  const canCancel = booking.status === "pending" || booking.status === "booked";

  return `
    <article class="booking-row">
      <div class="booking-row-top">
        <div class="row-title">
          <strong>${formatDateLong(booking.date)}</strong>
          <span>${meta.label}, ${meta.time}</span>
        </div>
        ${statusPill(booking.status)}
      </div>
      <div class="row-title">
        <span>${name}</span>
        <span>${phone}</span>
        <span>${formatDateTime(booking.createdAt)}</span>
      </div>
      <div class="note-line">
        <input data-note-input="${booking.id}" type="text" value="${note}" placeholder="Заметка администратора" />
        <button class="ghost-button" type="button" data-save-note="${booking.id}">Сохранить</button>
      </div>
      <div class="row-actions">
        <button class="secondary-button" type="button" data-confirm-booking="${booking.id}" ${canConfirm ? "" : "disabled"}>
          Подтвердить бронь
        </button>
        <button class="danger-button" type="button" data-cancel-booking="${booking.id}" ${canCancel ? "" : "disabled"}>
          Отменить бронь
        </button>
      </div>
    </article>
  `;
}

async function handleAddSlots(event) {
  event.preventDefault();

  const date = els.slotDate.value;
  const shifts = [...els.addDateForm.querySelectorAll('input[name="shift"]:checked')].map(
    (input) => input.value,
  );

  if (!date || !shifts.length) {
    showToast("Выберите дату и хотя бы одну смену.");
    return;
  }

  try {
    let added = 0;

    for (const shift of shifts) {
      const id = `${date}_${shift}`;
      const slotRef = doc(db, "slots", id);
      const existingSlot = await getDoc(slotRef);

      if (!existingSlot.exists()) {
        const meta = SHIFT_META[shift];
        await setDoc(slotRef, {
          date,
          shift,
          startTime: meta.startTime,
          endTime: meta.endTime,
          status: "available",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        added += 1;
      }
    }

    els.addDateForm.reset();
    els.addDateForm.querySelectorAll('input[name="shift"]').forEach((input) => {
      input.checked = true;
    });
    els.slotDate.min = toIsoDate(new Date());
    showToast(added ? "Слоты добавлены." : "Эти слоты уже существуют.");
    await loadAdminData();
  } catch (error) {
    console.error(error);
    showToast("Не получилось добавить слоты.");
  }
}

async function confirmBooking(id) {
  try {
    const bookingRef = doc(db, "bookings", id);
    const bookingSnapshot = await getDoc(bookingRef);

    if (!bookingSnapshot.exists()) throw new Error("booking_not_found");

    const booking = { id: bookingSnapshot.id, ...bookingSnapshot.data() };
    const slotRef = doc(db, "slots", booking.slotId);
    const slotSnapshot = await getDoc(slotRef);

    if (!slotSnapshot.exists()) throw new Error("slot_not_found");
    if (slotSnapshot.data().status === "booked" && booking.status !== "booked") {
      throw new Error("slot_already_booked");
    }

    const pendingSnapshot = await getDocs(
      query(collection(db, "bookings"), where("slotId", "==", booking.slotId)),
    );
    const batch = writeBatch(db);

    pendingSnapshot.docs.forEach((document) => {
      const item = document.data();
      if (document.id !== id && item.status === "pending") {
        batch.update(document.ref, {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
      }
    });

    batch.update(bookingRef, {
      status: "booked",
      updatedAt: serverTimestamp(),
    });
    batch.update(slotRef, {
      status: "booked",
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    showToast("Бронь подтверждена.");
    await loadAdminData();
  } catch (error) {
    console.error(error);
    showToast("Не получилось подтвердить бронь.");
  }
}

async function cancelBooking(id) {
  if (!window.confirm("Отменить эту бронь?")) return;

  try {
    const bookingRef = doc(db, "bookings", id);
    const bookingSnapshot = await getDoc(bookingRef);

    if (!bookingSnapshot.exists()) throw new Error("booking_not_found");

    const booking = { id: bookingSnapshot.id, ...bookingSnapshot.data() };
    await updateDoc(bookingRef, {
      status: "cancelled",
      updatedAt: serverTimestamp(),
    });
    await syncSlotStatus(booking.slotId);

    showToast("Бронь отменена.");
    await loadAdminData();
  } catch (error) {
    console.error(error);
    showToast("Не получилось отменить бронь.");
  }
}

async function releaseSlot(id) {
  if (!window.confirm("Освободить слот и отменить активные заявки по нему?")) return;

  try {
    const bookingsSnapshot = await getDocs(query(collection(db, "bookings"), where("slotId", "==", id)));
    const batch = writeBatch(db);

    bookingsSnapshot.docs.forEach((document) => {
      if (["pending", "booked"].includes(document.data().status)) {
        batch.update(document.ref, {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
      }
    });

    batch.update(doc(db, "slots", id), {
      status: "available",
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    showToast("Слот свободен.");
    await loadAdminData();
  } catch (error) {
    console.error(error);
    showToast("Не получилось освободить слот.");
  }
}

async function deleteSlot(id) {
  if (!window.confirm("Удалить слот? Связанные заявки тоже будут удалены.")) return;

  try {
    const bookingsSnapshot = await getDocs(query(collection(db, "bookings"), where("slotId", "==", id)));
    const batch = writeBatch(db);

    bookingsSnapshot.docs.forEach((document) => {
      batch.delete(document.ref);
    });
    batch.delete(doc(db, "slots", id));

    await batch.commit();
    showToast("Слот удален.");
    await loadAdminData();
  } catch (error) {
    console.error(error);
    showToast("Не получилось удалить слот.");
  }
}

async function saveNote(id) {
  const input = els.bookingsList.querySelector(`[data-note-input="${id}"]`);
  try {
    await updateDoc(doc(db, "bookings", id), {
      adminNote: input.value.trim(),
      updatedAt: serverTimestamp(),
    });
    showToast("Заметка сохранена.");
    await loadAdminData();
  } catch (error) {
    console.error(error);
    showToast("Не получилось сохранить заметку.");
  }
}

async function syncSlotStatus(slotId) {
  const bookingsSnapshot = await getDocs(query(collection(db, "bookings"), where("slotId", "==", slotId)));
  const hasBooked = bookingsSnapshot.docs.some((document) => document.data().status === "booked");

  await updateDoc(doc(db, "slots", slotId), {
    status: hasBooked ? "booked" : "available",
    updatedAt: serverTimestamp(),
  });
}

function statusPill(status) {
  const labels = {
    available: "Свободно",
    pending: "Ожидает",
    booked: "Занято",
    cancelled: "Отменено",
  };
  const className =
    status === "booked" || status === "cancelled" ? "busy" : status === "pending" ? "pending" : "";
  return `<span class="status-pill ${className}">${labels[status] ?? status}</span>`;
}

function isSlotFree(status) {
  return status === "available" || status === "pending";
}

function isValidSlot(slot) {
  return Boolean(slot?.date && slot?.shift && SHIFT_META[slot.shift] && slot?.status);
}

function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 3400);
}

function sortSlots(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return shiftOrder(a.shift) - shiftOrder(b.shift);
}

function shiftOrder(shift) {
  return shift === "first" ? 1 : 2;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateLong(isoDate) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseLocalDate(isoDate));
}

function formatDateTime(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date) return "Дата создаётся";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
