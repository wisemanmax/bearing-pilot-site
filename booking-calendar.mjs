// Bearing booking calendar — a small, dependency-free, accessible date + time
// picker for the First Bearing request flow. There is no live-availability
// backend yet, so this collects the visitor's *preferred* weekday slots (up to
// three); the founder confirms one within two business days. The pure date
// helpers below take an explicit reference "today" so they stay deterministic
// and unit-testable; only mountCalendar() touches the DOM, and only when called.

const MS_DAY = 86_400_000;
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// A weekday from 9am to 4pm, on the hour — the founder's working window. Kept as
// plain labels: the request is interpreted in the visitor's stated timezone.
export const TIME_SLOTS = [
  "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
  "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM",
];
export const DEFAULT_TIME = "10:00 AM";
export const MAX_PICKS = 3;
export const BOOKING_HORIZON_DAYS = 56; // eight weeks of runway to choose from

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  return new Date(startOfDay(date).getTime() + n * MS_DAY);
}

export function isWeekend(date) {
  const g = new Date(date).getDay();
  return g === 0 || g === 6;
}

// Local YYYY-MM-DD (not UTC) — the calendar is a local-time affair.
export function formatISODate(date) {
  const d = startOfDay(date);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function formatLongDate(date) {
  const d = startOfDay(date);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function monthTitle(year, month) {
  return `${MONTHS[month]} ${year}`;
}

// First bookable day: the next weekday strictly after the reference day, so no
// one can request same-day or a weekend.
export function nextBookableFrom(refDate) {
  let d = addDays(refDate, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

export function maxBookable(refDate) {
  return addDays(refDate, BOOKING_HORIZON_DAYS);
}

export function isBookable(date, refDate) {
  const day = startOfDay(date);
  if (isWeekend(day)) return false;
  return day.getTime() >= nextBookableFrom(refDate).getTime() &&
    day.getTime() <= maxBookable(refDate).getTime();
}

// Six-week grid (Sunday-first) covering `month`, for rendering. Cells outside
// the month are included so the grid is always rectangular.
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const gridStart = addDays(first, -first.getDay());
  const weeks = [];
  for (let w = 0; w < 6; w += 1) {
    const week = [];
    for (let d = 0; d < 7; d += 1) week.push(addDays(gridStart, w * 7 + d));
    weeks.push(week);
  }
  return weeks;
}

function clampDate(date, min, max) {
  const t = startOfDay(date).getTime();
  if (t < min.getTime()) return startOfDay(min);
  if (t > max.getTime()) return startOfDay(max);
  return startOfDay(date);
}

// --- The interactive widget (DOM) ------------------------------------------
// Renders into calRoot (the grid) and picksRoot (the chosen-slot rows), manages
// selection state, and calls onChange({ count }) whenever the picks change.
// Returns { getPicks } → [{ date: "YYYY-MM-DD", label, time }].
export function mountCalendar({ calRoot, picksRoot, onChange, today = startOfDay(new Date()) } = {}) {
  const ref = startOfDay(today);
  const minDay = nextBookableFrom(ref);
  const maxDay = maxBookable(ref);

  // Picks keyed by ISO date, preserving selection order; each carries a time.
  const picks = new Map();
  let view = new Date(minDay.getFullYear(), minDay.getMonth(), 1);
  let focusISO = formatISODate(minDay);

  const emit = () => onChange?.({ count: picks.size, full: picks.size >= MAX_PICKS });

  function getPicks() {
    return [...picks.entries()].map(([iso, time]) => ({
      date: iso,
      label: formatLongDate(iso + "T00:00:00"),
      time,
    }));
  }

  function toggle(iso) {
    if (picks.has(iso)) {
      picks.delete(iso);
    } else if (picks.size < MAX_PICKS) {
      picks.set(iso, DEFAULT_TIME);
    }
    render();
    emit();
  }

  function moveFocus(deltaDays) {
    const next = clampDate(addDays(focusISO + "T00:00:00", deltaDays), ref, maxDay);
    focusISO = formatISODate(next);
    if (next.getMonth() !== view.getMonth() || next.getFullYear() !== view.getFullYear()) {
      view = new Date(next.getFullYear(), next.getMonth(), 1);
    }
    render(true);
  }

  function changeMonth(dir) {
    const candidate = new Date(view.getFullYear(), view.getMonth() + dir, 1);
    const floor = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const ceil = new Date(maxDay.getFullYear(), maxDay.getMonth(), 1);
    if (candidate < floor || candidate > ceil) return;
    view = candidate;
    render();
  }

  function onGridKey(event) {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in moves) {
      event.preventDefault();
      moveFocus(moves[event.key]);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(-new Date(focusISO + "T00:00:00").getDay());
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(6 - new Date(focusISO + "T00:00:00").getDay());
    } else if (event.key === "PageUp") {
      event.preventDefault();
      changeMonth(-1);
    } else if (event.key === "PageDown") {
      event.preventDefault();
      changeMonth(1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isBookable(focusISO + "T00:00:00", ref)) toggle(focusISO);
    }
  }

  function render(keepFocus = false) {
    const year = view.getFullYear();
    const month = view.getMonth();
    const prevDisabled = new Date(year, month, 1) <= new Date(ref.getFullYear(), ref.getMonth(), 1);
    const nextDisabled = new Date(year, month, 1) >= new Date(maxDay.getFullYear(), maxDay.getMonth(), 1);

    calRoot.innerHTML = "";

    const head = document.createElement("div");
    head.className = "cal-head";
    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "cal-nav";
    prev.setAttribute("aria-label", "Previous month");
    prev.textContent = "‹";
    prev.disabled = prevDisabled;
    prev.addEventListener("click", () => changeMonth(-1));
    const title = document.createElement("p");
    title.className = "cal-title";
    title.setAttribute("aria-live", "polite");
    title.textContent = monthTitle(year, month);
    const next = document.createElement("button");
    next.type = "button";
    next.className = "cal-nav";
    next.setAttribute("aria-label", "Next month");
    next.textContent = "›";
    next.disabled = nextDisabled;
    next.addEventListener("click", () => changeMonth(1));
    head.append(prev, title, next);

    const grid = document.createElement("div");
    grid.className = "cal-grid";
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", "Choose up to three preferred dates");
    grid.addEventListener("keydown", onGridKey);

    const dow = document.createElement("div");
    dow.className = "cal-row cal-dow";
    dow.setAttribute("role", "row");
    for (const name of WEEKDAYS_SHORT) {
      const cell = document.createElement("span");
      cell.className = "cal-dow-cell";
      cell.setAttribute("role", "columnheader");
      cell.setAttribute("aria-label", name);
      cell.textContent = name[0];
      dow.append(cell);
    }
    grid.append(dow);

    let focusTarget = null;
    for (const week of monthMatrix(year, month)) {
      const row = document.createElement("div");
      row.className = "cal-row";
      row.setAttribute("role", "row");
      for (const day of week) {
        const iso = formatISODate(day);
        const inMonth = day.getMonth() === month;
        const cell = document.createElement("span");
        cell.className = "cal-cell";
        cell.setAttribute("role", "gridcell");
        if (!inMonth) {
          cell.classList.add("cal-cell-empty");
          cell.setAttribute("aria-hidden", "true");
          row.append(cell);
          continue;
        }
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cal-day";
        btn.textContent = String(day.getDate());
        const bookable = isBookable(day, ref);
        const selected = picks.has(iso);
        btn.setAttribute("aria-label", `${formatLongDate(day)}${selected ? ", selected" : ""}`);
        btn.setAttribute("aria-pressed", selected ? "true" : "false");
        btn.tabIndex = iso === focusISO ? 0 : -1;
        if (selected) btn.classList.add("is-selected");
        if (!bookable) {
          btn.disabled = true;
          btn.classList.add("is-unavailable");
        } else {
          btn.addEventListener("click", () => { focusISO = iso; toggle(iso); });
        }
        if (iso === focusISO) focusTarget = btn;
        cell.append(btn);
        row.append(cell);
      }
      grid.append(row);
    }

    calRoot.append(head, grid);
    renderPicks();
    if (keepFocus && focusTarget) focusTarget.focus();
  }

  function renderPicks() {
    picksRoot.innerHTML = "";
    if (picks.size === 0) {
      const empty = document.createElement("p");
      empty.className = "cal-empty";
      empty.textContent = "No times chosen yet — pick up to three dates on the calendar.";
      picksRoot.append(empty);
      return;
    }
    for (const [iso, time] of picks) {
      const label = formatLongDate(iso + "T00:00:00");
      const row = document.createElement("div");
      row.className = "cal-pick";

      const dateEl = document.createElement("span");
      dateEl.className = "cal-pick-date";
      dateEl.textContent = label;

      const timeLabel = document.createElement("label");
      timeLabel.className = "cal-pick-time";
      const hidden = document.createElement("span");
      hidden.className = "visually-hidden";
      hidden.textContent = `Time for ${label}`;
      const select = document.createElement("select");
      for (const slot of TIME_SLOTS) {
        const opt = document.createElement("option");
        opt.value = slot;
        opt.textContent = slot;
        if (slot === time) opt.selected = true;
        select.append(opt);
      }
      select.addEventListener("change", () => { picks.set(iso, select.value); emit(); });
      timeLabel.append(hidden, select);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "cal-pick-remove";
      remove.setAttribute("aria-label", `Remove ${label}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => { picks.delete(iso); render(); emit(); });

      row.append(dateEl, timeLabel, remove);
      picksRoot.append(row);
    }
  }

  render();
  emit();
  return { getPicks };
}
