export interface ParsedProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

export interface Attendee {
  cn: string;
  email: string;
  partstat: string;
  rsvp: boolean;
  role: string;
}

export interface Organizer {
  cn: string;
  email: string;
}

export interface DateWithTZID {
  value: string;
  tzid: string;
}

export type ICSDate = string | DateWithTZID;

export interface ParsedInvite {
  method: string;
  uid: string | null;
  sequence: number;
  dtstamp: string | null;
  dtstart: ICSDate | null;
  dtend: ICSDate | null;
  summary: string | null;
  organizer: Organizer | null;
  attendees: Attendee[];
}

/**
 * Unfold iCalendar lines. RFC 5545 §3.1: long lines are folded by inserting
 * a CRLF followed by a single whitespace character (space or tab).
 */
export function unfold(text: string): string {
  return text.replace(/\r?\n([ \t])/g, "");
}

/**
 * Parse an iCalendar property line into { name, params, value }.
 */
export function parsePropertyLine(line: string): ParsedProperty | null {
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

  const tokens: string[] = [];
  let current = "";
  inQuote = false;

  for (let i = 0; i < paramPart.length; i++) {
    const ch = paramPart[i];
    if (ch === '"') {
      inQuote = !inQuote;
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
  const params: Record<string, string> = {};

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
 */
export function extractMailto(value: string): string {
  const match = value.match(/^mailto:(.+)$/i);
  return match ? match[1] : value;
}

/**
 * Parse an ATTENDEE or ORGANIZER property into a structured object.
 */
function parseAttendee(prop: ParsedProperty): Attendee {
  const email = extractMailto(prop.value);
  const cn = prop.params.CN || email;
  const partstat = prop.params.PARTSTAT || "NEEDS-ACTION";
  const rsvp = (prop.params.RSVP || "").toUpperCase() === "TRUE";
  const role = prop.params.ROLE || "REQ-PARTICIPANT";

  return { cn, email, partstat, rsvp, role };
}

/**
 * Parse an ICS text string and return structured invite data.
 * Returns null if not a valid REQUEST.
 */
export function parseICS(icsText: string): ParsedInvite | null {
  const unfolded = unfold(icsText);
  const lines = unfolded.split(/\r?\n/);

  let method: string | null = null;
  let uid: string | null = null;
  let sequence = 0;
  let dtstamp: string | null = null;
  let dtstart: ICSDate | null = null;
  let dtend: ICSDate | null = null;
  let summary: string | null = null;
  let organizer: Organizer | null = null;
  const attendees: Attendee[] = [];

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

    if (prop.name === "METHOD" && !inVEvent) {
      method = prop.value.toUpperCase();
    }

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
