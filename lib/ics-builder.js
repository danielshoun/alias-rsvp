/**
 * ICS Reply Builder — constructs a METHOD:REPLY VCALENDAR per RFC 5546 (iTIP).
 */

/**
 * Escape special characters in an iCalendar text value per RFC 5545 §3.3.11.
 * Backslash, semicolon, and comma must be escaped. Newlines become literal \n.
 */
function escapeValue(str) {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a single content line to 75 octets per RFC 5545 §3.1.
 * Continuation lines begin with a single space.
 */
function foldLine(line) {
  if (line.length <= 75) return line;

  const parts = [];
  parts.push(line.substring(0, 75));
  let pos = 75;

  while (pos < line.length) {
    // Continuation lines start with a space, so max content per continuation is 74
    parts.push(" " + line.substring(pos, pos + 74));
    pos += 74;
  }

  return parts.join("\r\n");
}

/**
 * Format a Date object as an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ
 */
function formatUTCTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
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
function formatDateProp(name, dt) {
  if (dt && typeof dt === "object" && dt.tzid) {
    return `${name};TZID=${dt.tzid}:${dt.value}`;
  }
  return `${name}:${dt}`;
}

/**
 * Build a METHOD:REPLY VCALENDAR string.
 *
 * @param {object} params
 * @param {string} params.uid - Event UID from the original invite
 * @param {number} params.sequence - SEQUENCE from the original invite
 * @param {{ cn: string, email: string }} params.organizer - Organizer info
 * @param {string} params.attendeeEmail - The alias email responding
 * @param {string} params.attendeeCN - Display name for the attendee
 * @param {string} params.partstat - ACCEPTED, TENTATIVE, or DECLINED
 * @param {string} params.dtstart - DTSTART value from original invite
 * @param {string} [params.dtend] - DTEND value from original invite
 * @param {string} [params.summary] - Event summary from original invite
 * @param {Date} [params.now] - Override current time (for testing)
 * @returns {string} Valid VCALENDAR string with CRLF line endings
 */
function buildReplyICS({
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
}) {
  const dtstamp = formatUTCTimestamp(now || new Date());

  const lines = [
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildReplyICS, foldLine, escapeValue, formatUTCTimestamp };
}
