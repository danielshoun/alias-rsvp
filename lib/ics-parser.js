/**
 * Lightweight iCalendar (RFC 5545) parser for extracting VEVENT invite data.
 */

/**
 * Unfold iCalendar lines. RFC 5545 §3.1: long lines are folded by inserting
 * a CRLF followed by a single whitespace character (space or tab).
 */
function unfold(text) {
  return text.replace(/\r?\n([ \t])/g, "");
}

/**
 * Parse an iCalendar property line into { name, params, value }.
 *
 * A property line looks like:
 *   ATTENDEE;CN="John Doe";PARTSTAT=NEEDS-ACTION:mailto:john@example.com
 *   DTSTART:20250310T140000Z
 *
 * The name is everything before the first `;` or `:`.
 * Parameters are between `;` separators before the `:`.
 * The value is everything after the `:` that separates params from value.
 */
function parsePropertyLine(line) {
  // Find the boundary between params and value.
  // We need to handle quoted strings in parameters that may contain colons.
  let inQuote = false;
  let paramEnd = -1;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ":" && !inQuote) {
      paramEnd = i;
      break;
    }
  }

  if (paramEnd === -1) {
    return null;
  }

  const paramPart = line.substring(0, paramEnd);
  const value = line.substring(paramEnd + 1);

  // Split paramPart into name and individual params.
  // Again, respect quoted strings which may contain semicolons.
  const tokens = [];
  let current = "";
  inQuote = false;

  for (let i = 0; i < paramPart.length; i++) {
    const ch = paramPart[i];
    if (ch === '"') {
      inQuote = !inQuote;
      // Don't include the quote character itself in the token value
      continue;
    } else if (ch === ";" && !inQuote) {
      tokens.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  tokens.push(current);

  const name = tokens[0].toUpperCase();
  const params = {};

  for (let i = 1; i < tokens.length; i++) {
    const eqIdx = tokens[i].indexOf("=");
    if (eqIdx !== -1) {
      const pName = tokens[i].substring(0, eqIdx).toUpperCase();
      const pValue = tokens[i].substring(eqIdx + 1);
      params[pName] = pValue;
    }
  }

  return { name, params, value };
}

/**
 * Extract an email address from a mailto: URI value.
 * Handles case-insensitive "mailto:" prefix.
 */
function extractMailto(value) {
  const match = value.match(/^mailto:(.+)$/i);
  return match ? match[1] : value;
}

/**
 * Parse an ATTENDEE or ORGANIZER property into a structured object.
 */
function parseAttendee(prop) {
  const email = extractMailto(prop.value);
  const cn = prop.params.CN || email;
  const partstat = prop.params.PARTSTAT || "NEEDS-ACTION";
  const rsvp = (prop.params.RSVP || "").toUpperCase() === "TRUE";
  const role = prop.params.ROLE || "REQ-PARTICIPANT";

  return { cn, email, partstat, rsvp, role };
}

/**
 * Parse an ICS text string and return structured invite data.
 *
 * @param {string} icsText - Raw iCalendar text
 * @returns {object|null} Parsed invite object or null if not a valid REQUEST
 *
 * Returned shape:
 * {
 *   method: "REQUEST",
 *   uid: "...",
 *   sequence: 0,
 *   dtstamp: "20250304T120000Z",
 *   dtstart: "20250310T140000Z",
 *   dtend: "20250310T150000Z",
 *   summary: "Team Standup",
 *   organizer: { cn: "Alice", email: "alice@company.com" },
 *   attendees: [
 *     { cn: "Bob", email: "bob@shoun.dev", partstat: "NEEDS-ACTION", rsvp: true, role: "REQ-PARTICIPANT" }
 *   ]
 * }
 */
function parseICS(icsText) {
  const unfolded = unfold(icsText);
  const lines = unfolded.split(/\r?\n/);

  let method = null;
  let uid = null;
  let sequence = 0;
  let dtstamp = null;
  let dtstart = null;
  let dtend = null;
  let summary = null;
  let organizer = null;
  const attendees = [];

  let inVEvent = false;

  for (const line of lines) {
    if (!line.trim()) continue;

    if (line.trim() === "BEGIN:VEVENT") {
      inVEvent = true;
      continue;
    }
    if (line.trim() === "END:VEVENT") {
      inVEvent = false;
      continue;
    }

    const prop = parsePropertyLine(line);
    if (!prop) continue;

    // METHOD is a VCALENDAR-level property (outside VEVENT)
    if (prop.name === "METHOD" && !inVEvent) {
      method = prop.value.toUpperCase();
    }

    // The remaining fields we care about are inside VEVENT
    if (!inVEvent) continue;

    switch (prop.name) {
      case "UID":
        uid = prop.value;
        break;
      case "SEQUENCE":
        sequence = parseInt(prop.value, 10) || 0;
        break;
      case "DTSTAMP":
        dtstamp = prop.value;
        break;
      case "DTSTART":
        dtstart = prop.params.TZID
          ? { value: prop.value, tzid: prop.params.TZID }
          : prop.value;
        break;
      case "DTEND":
        dtend = prop.params.TZID
          ? { value: prop.value, tzid: prop.params.TZID }
          : prop.value;
        break;
      case "SUMMARY":
        summary = prop.value;
        break;
      case "ORGANIZER":
        organizer = {
          cn: prop.params.CN || extractMailto(prop.value),
          email: extractMailto(prop.value),
        };
        break;
      case "ATTENDEE":
        attendees.push(parseAttendee(prop));
        break;
    }
  }

  if (method !== "REQUEST") {
    return null;
  }

  return {
    method,
    uid,
    sequence,
    dtstamp,
    dtstart,
    dtend,
    summary,
    organizer,
    attendees,
  };
}

// Export for use as ES module in the extension and for testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseICS, parsePropertyLine, unfold, extractMailto };
}
