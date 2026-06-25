import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RESORT_NAME, SUPABASE_ANON_KEY, SUPABASE_URL, WHATSAPP_PHONE } from "./config.js";

const SHIFT_META = {
  first: {
    label: "Первая смена",
    time: "10:00–17:00",
    startTime: "10:00",
    endTime: "17:00",
  },
  second: {
    label: "Вторая смена",
    time: "18:00–00:00",
    startTime: "18:00",
    endTime: "00:00",
  },
};

const state = {
  slots: [],
  selectedDate: null,
  selectedShift: null,
  visibleMonth: startOfMonth(new Date()),
  loading: false,
};

const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_URL.includes(".supabase.co") &&
  !SUPABASE_URL.includes("YOUR_PROJECT") &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");

const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const els = {
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarMonth: document.querySelector("#calendarMonth"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  shiftGrid: document.querySelector("#shiftGrid"),
  summaryPanel: document.querySelector("#summaryPanel"),
  summaryDate: document.querySelector("#summaryDate"),
  summaryShift: document.querySelector("#summaryShift"),
  whatsappButton: document.querySelector("#whatsappButton"),
  clientName: document.querySelector("#clientName"),
  clientPhone: document.querySelector("#clientPhone"),
  toast: document.querySelector("#toast"),
  setupNotice: document.querySelector("#setupNotice"),
};

document.title = `${RESORT_NAME} — бронирование`;
document.querySelectorAll(".brand-text, .eyebrow").forEach((node) => {
  if (node.textContent.trim() === "Lola Kurort") node.textContent = RESORT_NAME;
});

initReveal();
bindEvents();
await loadSlots();

function bindEvents() {
  document.querySelector("[data-scroll-to-booking]").addEventListener("click", () => {
    document.querySelector("#booking").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  els.prevMonth.addEventListener("click", () => {
    state.visibleMonth = addMonths(state.visibleMonth, -1);
    render();
  });

  els.nextMonth.addEventListener("click", () => {
    state.visibleMonth = addMonths(state.visibleMonth, 1);
    render();
  });

  els.whatsappButton.addEventListener("click", handleWhatsAppClick);
  window.addEventListener("focus", () => {
    if (isConfigured) loadSlots({ quiet: true });
  });
}

async function loadSlots(options = {}) {
  if (!isConfigured) {
    els.setupNotice.hidden = false;
    state.slots = [];
    render();
    return;
  }

  try {
    state.loading = true;
    render();

    const todayIso = toIsoDate(new Date());
    const { data, error } = await supabase
      .from("slots")
      .select("id,date,shift,start_time,end_time,status")
      .gte("date", todayIso)
      .order("date", { ascending: true })
      .order("shift", { ascending: true });

    if (error) throw error;

    state.slots = data ?? [];
    const firstAvailable = state.slots.find((slot) => isSlotFreeForPublic(slot.status));
    if (!state.selectedDate && firstAvailable) {
      state.selectedDate = firstAvailable.date;
      state.visibleMonth = startOfMonth(parseLocalDate(firstAvailable.date));
    }
  } catch (error) {
    if (!options.quiet) showToast("Не получилось загрузить даты. Проверьте Supabase.");
    console.error(error);
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  renderCalendar();
  renderShifts();
  renderSummary();
}

function renderCalendar() {
  els.calendarMonth.textContent = formatMonth(state.visibleMonth);
  els.calendarGrid.innerHTML = "";

  const year = state.visibleMonth.getFullYear();
  const month = state.visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayOffset = (firstDay.getDay() + 6) % 7;

  for (let index = 0; index < mondayOffset; index += 1) {
    els.calendarGrid.append(createSpacer());
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const iso = toIsoDate(date);
    const slots = slotsForDate(iso);
    const hasSlots = slots.length > 0;
    const hasAvailableSlot = slots.some((slot) => isSlotFreeForPublic(slot.status));
    const isFull = hasSlots && !hasAvailableSlot;
    const isPast = iso < toIsoDate(new Date());
    const isAvailable = hasAvailableSlot && !isPast;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-button";
    button.textContent = String(day);
    button.disabled = !isAvailable;
    button.setAttribute("aria-label", `${day} ${formatMonth(date)}`);

    if (isAvailable) button.classList.add("is-available");
    if (isFull) button.classList.add("is-full");
    if (iso === state.selectedDate) {
      button.classList.add("is-selected");
      button.setAttribute("aria-pressed", "true");
    }
    if (iso === toIsoDate(new Date())) button.classList.add("is-today");

    button.addEventListener("click", () => {
      state.selectedDate = iso;
      state.selectedShift = null;
      render();
      document.querySelector(".shift-section").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    els.calendarGrid.append(button);
  }
}

function renderShifts() {
  els.shiftGrid.innerHTML = "";

  if (state.loading) {
    els.shiftGrid.append(createEmptyState("Загружаем доступные смены."));
    return;
  }

  if (!state.selectedDate) {
    els.shiftGrid.append(createEmptyState("Сначала выберите доступную дату в календаре."));
    return;
  }

  const slotsByShift = new Map(slotsForDate(state.selectedDate).map((slot) => [slot.shift, slot]));

  els.shiftGrid.append(createShiftCard("first", slotsByShift.get("first")));
  els.shiftGrid.append(createBreakCard());
  els.shiftGrid.append(createShiftCard("second", slotsByShift.get("second")));
}

function createShiftCard(shift, slot) {
  const meta = SHIFT_META[shift];
  const isFree = slot && isSlotFreeForPublic(slot.status);
  const isSelected = state.selectedShift === shift;

  const card = document.createElement("article");
  card.className = "shift-card";
  if (isSelected) card.classList.add("is-selected");
  if (!isFree) card.classList.add("is-disabled");

  const statusText = isFree ? "Свободно" : "Занято";
  const statusClass = isFree ? "" : " busy";

  card.innerHTML = `
    <div class="shift-top">
      <div class="shift-name">
        <strong>${meta.label}</strong>
        <span>${meta.time}</span>
      </div>
      <span class="status-pill${statusClass}">${statusText}</span>
    </div>
  `;

  const button = document.createElement("button");
  button.className = isFree ? "secondary-button" : "ghost-button";
  button.type = "button";
  button.disabled = !isFree;
  button.textContent = isSelected ? "Выбрано" : "Выбрать смену";
  button.addEventListener("click", () => {
    state.selectedShift = shift;
    render();
    els.summaryPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  card.append(button);
  return card;
}

function createBreakCard() {
  const card = document.createElement("article");
  card.className = "break-card";
  card.innerHTML = `
    <div class="shift-top">
      <div class="shift-name">
        <strong>Перерыв</strong>
        <span>17:00–18:00</span>
      </div>
      <span class="status-pill busy">Недоступно</span>
    </div>
  `;
  return card;
}

function renderSummary() {
  const slot = getSelectedSlot();
  const hasSelection = Boolean(state.selectedDate && state.selectedShift && slot);
  els.summaryPanel.hidden = !hasSelection;

  if (!hasSelection) return;

  els.summaryDate.textContent = formatDateLong(state.selectedDate);
  els.summaryShift.textContent = `${SHIFT_META[state.selectedShift].label}, ${SHIFT_META[state.selectedShift].time}`;
  els.whatsappButton.disabled = !isConfigured || !isSlotFreeForPublic(slot.status);
}

async function handleWhatsAppClick() {
  const slot = getSelectedSlot();
  if (!slot) return;

  if (!isConfigured) {
    showToast("Сначала подключите Supabase в config.js.");
    return;
  }

  const message = buildWhatsAppMessage();
  const url = `https://wa.me/${normalizePhone(WHATSAPP_PHONE)}?text=${encodeURIComponent(message)}`;

  els.whatsappButton.disabled = true;
  els.whatsappButton.textContent = "Готовим заявку...";

  try {
    const { error } = await supabase.rpc("create_pending_booking", {
      target_slot_id: slot.id,
      client_name: cleanInput(els.clientName.value),
      client_phone: cleanInput(els.clientPhone.value),
    });

    if (error) throw error;
    window.location.href = url;
  } catch (error) {
    console.error(error);
    showToast("Слот мог измениться. Обновляем доступные даты.");
    await loadSlots({ quiet: true });
  } finally {
    els.whatsappButton.disabled = false;
    els.whatsappButton.textContent = "Перейти в WhatsApp для оплаты";
  }
}

function buildWhatsAppMessage() {
  return [
    "Здравствуйте! Хочу забронировать посещение курорта.",
    `Дата: ${formatDateLong(state.selectedDate)}`,
    `Время: ${SHIFT_META[state.selectedShift].time}`,
    "Прошу подтвердить бронь и отправить данные для оплаты.",
  ].join("\n");
}

function getSelectedSlot() {
  if (!state.selectedDate || !state.selectedShift) return null;
  return state.slots.find((slot) => slot.date === state.selectedDate && slot.shift === state.selectedShift);
}

function slotsForDate(isoDate) {
  return state.slots.filter((slot) => slot.date === isoDate);
}

function isSlotFreeForPublic(status) {
  return status === "available" || status === "pending";
}

function createSpacer() {
  const spacer = document.createElement("div");
  spacer.className = "calendar-spacer";
  return spacer;
}

function createEmptyState(text) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.textContent = text;
  return node;
}

function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 3400);
}

function initReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { threshold: 0.12 },
  );

  document.querySelectorAll(".reveal").forEach((node) => observer.observe(node));
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, "");
}

function cleanInput(value) {
  return value.trim() || null;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
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

function formatMonth(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateLong(isoDate) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseLocalDate(isoDate));
}
