import type { Attendee, ICSDate, ParsedInvite } from "../lib/ics-parser";

const loadingEl = document.getElementById("loading")!;
const errorEl = document.getElementById("error")!;
const inviteEl = document.getElementById("invite")!;
const summaryEl = document.getElementById("summary")!;
const whenEl = document.getElementById("when")!;
const organizerEl = document.getElementById("organizer")!;
const aliasEl = document.getElementById("alias")!;
const statusEl = document.getElementById("status")!;
const buttons = document.querySelectorAll<HTMLButtonElement>(".buttons button");

function formatDateTime(icsDate: ICSDate | null): string {
  if (!icsDate) return "Unknown";

  const dateStr = typeof icsDate === "object" ? icsDate.value : icsDate;

  const match = dateStr.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/
  );
  if (!match) return dateStr;

  const [, y, m, d, hh, mm, , isUTC] = match;

  let date: Date;
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

function formatWhen(dtstart: ICSDate | null, dtend: ICSDate | null): string {
  const start = formatDateTime(dtstart);
  if (!dtend) return start;

  const end = formatDateTime(dtend);
  return `${start} \u2013 ${end}`;
}

function showError(message: string): void {
  loadingEl.style.display = "none";
  inviteEl.style.display = "none";
  errorEl.style.display = "block";
  errorEl.textContent = message;
}

function showInvite(invite: ParsedInvite, alias: Attendee): void {
  loadingEl.style.display = "none";
  errorEl.style.display = "none";
  inviteEl.style.display = "block";

  summaryEl.textContent = invite.summary || "Calendar Event";
  whenEl.textContent = formatWhen(invite.dtstart, invite.dtend);
  organizerEl.textContent =
    invite.organizer?.cn || invite.organizer?.email || "Unknown";
  aliasEl.textContent = alias.email;
}

async function init(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tabs.length) {
      showError("No active message tab found.");
      return;
    }

    const tabId = tabs[0].id;
    const result = (await browser.runtime.sendMessage({
      type: "getInvite",
      tabId: tabId,
    })) as { invite?: ParsedInvite; alias?: Attendee; error?: string };

    if (result.error) {
      showError(result.error);
      return;
    }

    showInvite(result.invite!, result.alias!);

    for (const btn of buttons) {
      btn.addEventListener("click", () =>
        handleRSVP(tabId, btn.dataset.partstat!)
      );
    }
  } catch (err) {
    showError("Error: " + (err as Error).message);
  }
}

async function handleRSVP(tabId: number, partstat: string): Promise<void> {
  for (const btn of buttons) {
    btn.disabled = true;
  }
  statusEl.style.display = "block";
  statusEl.textContent = "Sending response...";

  browser.runtime.sendMessage({
    type: "rsvp",
    tabId: tabId,
    partstat: partstat,
  });

  statusEl.textContent = "Response sent!";
  setTimeout(() => window.close(), 1200);
}

init();
