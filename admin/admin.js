import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RESORT_NAME, SUPABASE_ANON_KEY, SUPABASE_URL } from "../config.js";

const SHIFT_META = {
  first: { label: "Первая смена", time: "10:00–17:00", start_time: "10:00", end_time: "17:00" },
  second: { label: "Вторая смена", time: "18:00–00:00", start_time: "18:00", end_time: "00:00" },
};

const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_URL.includes(".supabase.co") &&
  !SUPABASE_URL.includes("YOUR_PROJECT") &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");

const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const state = {
  slots: [],
  bookings: [],
  session: null,
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
await initAuth();

function bindEvents() {
  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutButton.addEventListener("click", handleLogout);
  els.refreshButton.addEventListener("click", () => loadAdminData());
  els.addDateForm.addEventListener("submit", handleAddSlots);
  els.slotDate.min = toIsoDate(new Date());
}

async function initAuth() {
  if (!isConfigured) {
    els.loginHint.textContent = "Заполните SUPABASE_URL и SUPABASE_ANON_KEY в config.js.";
    els.loginForm.querySelector("button").disabled = true;
    return;
  }

  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  updateAuthView();

  if (state.session) await loadAdminData();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    updateAuthView();
    if (session) await loadAdminData();
  });
}

function updateAuthView() {
  const isLoggedIn = Boolean(state.session);
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
    const { error } = await supabase.auth.signInWithPassword({
      email: els.email.value.trim(),
      password: els.password.value,
    });

    if (error) throw error;
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
  await supabase.auth.signOut();
  state.slots = [];
  state.bookings = [];
  render();
}

async function loadAdminData() {
  try {
    const [slotsResult, bookingsResult] = await Promise.all([
      supabase
        .from("slots")
        .select("id,date,shift,start_time,end_time,status,created_at,updated_at")
        .order("date", { ascending: true })
        .order("shift", { ascending: true }),
      supabase
        .from("bookings")
        .select("id,slot_id,date,shift,client_name,client_phone,status,admin_note,created_at,updated_at")
        .order("created_at", { ascending: false }),
    ]);

    if (slotsResult.error) throw slotsResult.error;
    if (bookingsResult.error) throw bookingsResult.error;

    state.slots = slotsResult.data ?? [];
    state.bookings = bookingsResult.data ?? [];
    render();
  } catch (error) {
    console.error(error);
    showToast("Нет доступа к данным. Проверьте admin_users и RLS.");
  }
}

function render() {
  renderStats();
  renderSlots();
  renderBookings();
}

function renderStats() {
  const available = state.slots.filter((slot) => slot.status === "available").length;
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
  const name = escapeHtml(booking.client_name || "Имя не указано");
  const phone = escapeHtml(booking.client_phone || "Телефон не указан");
  const note = escapeHtml(booking.admin_note || "");
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
        <span>${formatDateTime(booking.created_at)}</span>
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

  const rows = shifts.map((shift) => ({
    date,
    shift,
    start_time: SHIFT_META[shift].start_time,
    end_time: SHIFT_META[shift].end_time,
    status: "available",
  }));

  try {
    const { error } = await supabase.from("slots").upsert(rows, { onConflict: "date,shift" });
    if (error) throw error;
    els.addDateForm.reset();
    els.addDateForm.querySelectorAll('input[name="shift"]').forEach((input) => {
      input.checked = true;
    });
    els.slotDate.min = toIsoDate(new Date());
    showToast("Слоты добавлены.");
    await loadAdminData();
  } catch (error) {
    console.error(error);
    showToast("Не получилось добавить слоты.");
  }
}

async function confirmBooking(id) {
  try {
    const { error } = await supabase.rpc("confirm_booking", { target_booking_id: id });
    if (error) throw error;
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
    const { error } = await supabase.rpc("cancel_booking", { target_booking_id: id });
    if (error) throw error;
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
    const { error } = await supabase.rpc("release_slot", { target_slot_id: id });
    if (error) throw error;
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
    const { error } = await supabase.from("slots").delete().eq("id", id);
    if (error) throw error;
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
    const { error } = await supabase
      .from("bookings")
      .update({ admin_note: input.value.trim() || null })
      .eq("id", id);
    if (error) throw error;
    showToast("Заметка сохранена.");
    await loadAdminData();
  } catch (error) {
    console.error(error);
    showToast("Не получилось сохранить заметку.");
  }
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

function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 3400);
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
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
