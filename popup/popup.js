/**
 * Popup script for Alias-Safe RSVP.
 *
 * Communicates with the background script to display invite details
 * and send RSVP responses.
 */

const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const inviteEl = document.getElementById("invite");
const summaryEl = document.getElementById("summary");
const whenEl = document.getElementById("when");
const organizerEl = document.getElementById("organizer");
const aliasEl = document.getElementById("alias");
const statusEl = document.getElementById("status");
const buttons = document.querySelectorAll(".buttons button");

/**
 * Format an iCalendar datetime string for display.
 * Handles both UTC (ending in Z) and basic date-time formats.
 * e.g. "20250310T140000Z" → "Mon, Mar 10, 2025, 2:00 PM"
 */
function formatDateTime(icsDate) {
  if (!icsDate) return "Unknown";

  // Handle { value, tzid } objects from parser
  const dateStr = typeof icsDate === "object" ? icsDate.value : icsDate;

  // Parse YYYYMMDDTHHMMSS(Z)
  const match = dateStr.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/
  );
  if (!match) return dateStr;

  const [, y, m, d, hh, mm, , isUTC] = match;

  let date;
  if (isUTC) {
    date = new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm));
  } else {
    date = new Date(+y, +m - 1, +d, +hh, +mm);
  }

  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Build a display string for the event time range.
 */
function formatWhen(dtstart, dtend) {
  const start = formatDateTime(dtstart);
  if (!dtend) return start;

  const end = formatDateTime(dtend);
  return `${start} \u2013 ${end}`;
}

function showError(message) {
  loadingEl.style.display = "none";
  inviteEl.style.display = "none";
  errorEl.style.display = "block";
  errorEl.textContent = message;
}

function showInvite(invite, alias) {
  loadingEl.style.display = "none";
  errorEl.style.display = "none";
  inviteEl.style.display = "block";

  summaryEl.textContent = invite.summary || "Calendar Event";
  whenEl.textContent = formatWhen(invite.dtstart, invite.dtend);
  organizerEl.textContent = invite.organizer.cn || invite.organizer.email;
  aliasEl.textContent = alias.email;
}

/**
 * Initialize: request invite data from the background script.
 */
async function init() {
  try {
    // Get the active tab in the message display
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      showError("No active message tab found.");
      return;
    }

    const tabId = tabs[0].id;
    const result = await browser.runtime.sendMessage({
      type: "getInvite",
      tabId: tabId,
    });

    if (result.error) {
      showError(result.error);
      return;
    }

    showInvite(result.invite, result.alias);

    // Wire up RSVP buttons
    for (const btn of buttons) {
      btn.addEventListener("click", () => handleRSVP(tabId, btn.dataset.partstat));
    }
  } catch (err) {
    showError("Error: " + err.message);
  }
}

/**
 * Handle an RSVP button click.
 */
async function handleRSVP(tabId, partstat) {
  // Disable all buttons and show status
  for (const btn of buttons) {
    btn.disabled = true;
  }
  statusEl.style.display = "block";
  statusEl.textContent = "Sending response...";

  // Fire the RSVP request — the background script handles sending.
  // We don't await the full result because the XPCOM send callback
  // doesn't propagate cleanly back through extension messaging.
  browser.runtime.sendMessage({
    type: "rsvp",
    tabId: tabId,
    partstat: partstat,
  });

  statusEl.textContent = "Response sent!";
  setTimeout(() => window.close(), 1200);
}

init();
