/**
 * ICS Reply Builder — constructs a METHOD:REPLY VCALENDAR per RFC 5546 (iTIP).
 */

import type { ICSDate, Organizer } from "./ics-parser";

/**
 * Escape special characters in an iCalendar text value per RFC 5545 §3.3.11.
 */
export function escapeValue(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a single content line to 75 octets per RFC 5545 §3.1.
 */
export function foldLine(line: string): string {
  if (line.length <= 75) return line;

  const parts: string[] = [];
  parts.push(line.substring(0, 75));
  let pos = 75;

  while (pos < line.length) {
    parts.push(" " + line.substring(pos, pos + 74));
    pos += 74;
  }

  return parts.join("\r\n");
}

/**
 * Format a Date object as an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ
 */
export function formatUTCTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

/**
 * Format a date property, handling both plain strings and { value, tzid } objects.
 */
function formatDateProp(name: string, dt: ICSDate): string {
  if (typeof dt === "object" && dt.tzid) {
    return `${name};TZID=${dt.tzid}:${dt.value}`;
  }
  return `${name}:${dt}`;
}

export interface BuildReplyParams {
  uid: string;
  sequence: number;
  organizer: Organizer;
  attendeeEmail: string;
  attendeeCN: string;
  partstat: string;
  dtstart: ICSDate;
  dtend?: ICSDate | null;
  summary?: string | null;
  now?: Date;
}

/**
 * Build a METHOD:REPLY VCALENDAR string.
 */
export function buildReplyICS({
  uid,
  sequence,
  organizer,
  attendeeEmail,
  attendeeCN,
  partstat,
  dtstart,
  dtend,
  summary,
  now,
}: BuildReplyParams): string {
  const dtstamp = formatUTCTimestamp(now || new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AliasRSVP//Thunderbird Extension//EN",
    "METHOD:REPLY",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${dtstamp}`,
    formatDateProp("DTSTART", dtstart),
  ];

  if (dtend) {
    lines.push(formatDateProp("DTEND", dtend));
  }

  if (summary) {
    lines.push(`SUMMARY:${escapeValue(summary)}`);
  }

  lines.push(
    `ORGANIZER;CN=${escapeValue(organizer.cn)}:mailto:${organizer.email}`
  );
  lines.push(
    `ATTENDEE;CN=${escapeValue(attendeeCN)};PARTSTAT=${partstat}:mailto:${attendeeEmail}`
  );

  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
