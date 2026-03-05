import { describe, it, expect } from "vitest";
import { parseICS, unfold, parsePropertyLine, extractMailto } from "../src/lib/ics-parser";

describe("unfold", () => {
  it("unfolds CRLF + space", () => {
    expect(unfold("ATTENDEE;CN=John\r\n  Doe:mailto:john@example.com")).toBe(
      "ATTENDEE;CN=John Doe:mailto:john@example.com"
    );
  });

  it("unfolds CRLF + tab", () => {
    expect(unfold("SUMMARY:A very long line that\r\n\t continues here")).toBe(
      "SUMMARY:A very long line that continues here"
    );
  });

  it("unfolds LF + space (lenient)", () => {
    expect(unfold("SUMMARY:A line that\n  continues with LF")).toBe(
      "SUMMARY:A line that continues with LF"
    );
  });
});

describe("parsePropertyLine", () => {
  it("parses a simple property", () => {
    const prop = parsePropertyLine("DTSTART:20250310T140000Z");
    expect(prop).not.toBeNull();
    expect(prop!.name).toBe("DTSTART");
    expect(prop!.value).toBe("20250310T140000Z");
    expect(Object.keys(prop!.params)).toHaveLength(0);
  });

  it("parses an attendee with params", () => {
    const prop = parsePropertyLine(
      "ATTENDEE;CN=John Doe;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:john@example.com"
    );
    expect(prop!.name).toBe("ATTENDEE");
    expect(prop!.params.CN).toBe("John Doe");
    expect(prop!.params.PARTSTAT).toBe("NEEDS-ACTION");
    expect(prop!.params.RSVP).toBe("TRUE");
    expect(prop!.value).toBe("mailto:john@example.com");
  });

  it("handles quoted CN with special characters", () => {
    const prop = parsePropertyLine(
      'ORGANIZER;CN="Doe, Jane":mailto:jane@company.com'
    );
    expect(prop!.name).toBe("ORGANIZER");
    expect(prop!.params.CN).toBe("Doe, Jane");
    expect(prop!.value).toBe("mailto:jane@company.com");
  });
});

describe("parseICS", () => {
  const sampleICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    "UID:abc123@google.com",
    "SEQUENCE:1",
    "DTSTAMP:20250304T120000Z",
    "DTSTART:20250310T140000Z",
    "DTEND:20250310T150000Z",
    "SUMMARY:Team Standup",
    'ORGANIZER;CN="Alice Smith":mailto:alice@company.com',
    "ATTENDEE;CN=Bob;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:bob@shoun.dev",
    "ATTENDEE;CN=Carol;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:carol@example.com",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("parses a standard REQUEST", () => {
    const result = parseICS(sampleICS);
    expect(result).not.toBeNull();
    expect(result!.method).toBe("REQUEST");
    expect(result!.uid).toBe("abc123@google.com");
    expect(result!.sequence).toBe(1);
    expect(result!.dtstamp).toBe("20250304T120000Z");
    expect(result!.dtstart).toBe("20250310T140000Z");
    expect(result!.dtend).toBe("20250310T150000Z");
    expect(result!.summary).toBe("Team Standup");
    expect(result!.organizer!.cn).toBe("Alice Smith");
    expect(result!.organizer!.email).toBe("alice@company.com");
    expect(result!.attendees).toHaveLength(2);
    expect(result!.attendees[0].email).toBe("bob@shoun.dev");
    expect(result!.attendees[0].partstat).toBe("NEEDS-ACTION");
    expect(result!.attendees[0].rsvp).toBe(true);
    expect(result!.attendees[1].email).toBe("carol@example.com");
    expect(result!.attendees[1].partstat).toBe("ACCEPTED");
    expect(result!.attendees[1].rsvp).toBe(false);
  });

  it("returns null for non-REQUEST method", () => {
    const cancelICS = sampleICS.replace("METHOD:REQUEST", "METHOD:CANCEL");
    expect(parseICS(cancelICS)).toBeNull();
  });

  it("handles folded lines", () => {
    const foldedICS = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:fold-test-123@example.com",
      "DTSTAMP:20250304T120000Z",
      "DTSTART:20250310T140000Z",
      "DTEND:20250310T150000Z",
      "SUMMARY:A very long event title that might get folded across multi",
      " ple lines in the ICS file",
      "ORGANIZER;CN=Host:mailto:host@example.com",
      "ATTENDEE;CN=Alias User;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:tes",
      " t@shoun.dev",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const result = parseICS(foldedICS);
    expect(result).not.toBeNull();
    expect(result!.summary).toBe(
      "A very long event title that might get folded across multiple lines in the ICS file"
    );
    expect(result!.attendees[0].email).toBe("test@shoun.dev");
  });

  it("handles missing optional fields", () => {
    const minimalICS = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:minimal@example.com",
      "DTSTAMP:20250304T120000Z",
      "DTSTART:20250310T140000Z",
      "ORGANIZER:mailto:host@example.com",
      "ATTENDEE;RSVP=TRUE:mailto:user@shoun.dev",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const result = parseICS(minimalICS);
    expect(result).not.toBeNull();
    expect(result!.sequence).toBe(0);
    expect(result!.dtend).toBeNull();
    expect(result!.summary).toBeNull();
    expect(result!.organizer!.cn).toBe("host@example.com");
    expect(result!.attendees[0].cn).toBe("user@shoun.dev");
    expect(result!.attendees[0].partstat).toBe("NEEDS-ACTION");
  });

  it("handles uppercase MAILTO", () => {
    const upperMailtoICS = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:mailto-test@example.com",
      "DTSTAMP:20250304T120000Z",
      "DTSTART:20250310T140000Z",
      "ORGANIZER:MAILTO:HOST@EXAMPLE.COM",
      "ATTENDEE;RSVP=TRUE:MAILTO:USER@SHOUN.DEV",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const result = parseICS(upperMailtoICS);
    expect(result).not.toBeNull();
    expect(result!.organizer!.email).toBe("HOST@EXAMPLE.COM");
    expect(result!.attendees[0].email).toBe("USER@SHOUN.DEV");
  });

  it("handles TZID on DTSTART/DTEND", () => {
    const tzidICS = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:tzid-test@google.com",
      "DTSTAMP:20260305T013456Z",
      "DTSTART;TZID=America/Denver:20260304T190000",
      "DTEND;TZID=America/Denver:20260304T200000",
      "SUMMARY:Test",
      "ORGANIZER;CN=Organizer Name:mailto:organizer@gmail.com",
      "ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=alias@shoun.dev:mailto:alias@shoun.dev",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const result = parseICS(tzidICS);
    expect(result).not.toBeNull();
    expect(typeof result!.dtstart).toBe("object");
    const dtstart = result!.dtstart as { value: string; tzid: string };
    expect(dtstart.value).toBe("20260304T190000");
    expect(dtstart.tzid).toBe("America/Denver");
    const dtend = result!.dtend as { value: string; tzid: string };
    expect(dtend.value).toBe("20260304T200000");
    expect(dtend.tzid).toBe("America/Denver");
  });
});
