import { describe, it, expect } from "vitest";
import {
  buildReplyICS,
  foldLine,
  escapeValue,
  formatUTCTimestamp,
} from "../src/lib/ics-builder";
import { parseICS } from "../src/lib/ics-parser";

describe("escapeValue", () => {
  it("leaves plain text unchanged", () => {
    expect(escapeValue("Hello World")).toBe("Hello World");
  });

  it("escapes semicolons", () => {
    expect(escapeValue("a;b")).toBe("a\\;b");
  });

  it("escapes commas", () => {
    expect(escapeValue("a,b")).toBe("a\\,b");
  });

  it("escapes backslashes", () => {
    expect(escapeValue("a\\b")).toBe("a\\\\b");
  });

  it("escapes newlines", () => {
    expect(escapeValue("line1\nline2")).toBe("line1\\nline2");
  });

  it("escapes CRLF", () => {
    expect(escapeValue("line1\r\nline2")).toBe("line1\\nline2");
  });

  it("returns empty for empty string", () => {
    expect(escapeValue("")).toBe("");
  });

  it("returns empty for null", () => {
    expect(escapeValue(null)).toBe("");
  });
});

describe("foldLine", () => {
  it("leaves short lines unchanged", () => {
    expect(foldLine("SHORT")).toBe("SHORT");
  });

  it("does not fold exactly 75 chars", () => {
    expect(foldLine("A".repeat(75))).toBe("A".repeat(75));
  });

  it("folds a 100-char line into 2 parts", () => {
    const long = "A".repeat(100);
    const folded = foldLine(long);
    const parts = folded.split("\r\n");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(75);
    expect(parts[1]).toMatch(/^ /);
    expect(parts[1]).toHaveLength(26);
  });

  it("folds a 200-char line into 3 parts and roundtrips", () => {
    const long = "B".repeat(200);
    const folded = foldLine(long);
    const parts = folded.split("\r\n");
    expect(parts).toHaveLength(3);
    const unfolded = folded.replace(/\r\n /g, "");
    expect(unfolded).toBe(long);
  });
});

describe("formatUTCTimestamp", () => {
  it("formats correctly", () => {
    const date = new Date(Date.UTC(2025, 2, 4, 15, 30, 45));
    expect(formatUTCTimestamp(date)).toBe("20250304T153045Z");
  });

  it("pads single-digit values", () => {
    const date = new Date(Date.UTC(2025, 0, 1, 0, 0, 0));
    expect(formatUTCTimestamp(date)).toBe("20250101T000000Z");
  });
});

describe("buildReplyICS", () => {
  it("builds a standard ACCEPTED reply", () => {
    const fixedNow = new Date(Date.UTC(2025, 2, 4, 16, 0, 0));
    const ics = buildReplyICS({
      uid: "abc123@google.com",
      sequence: 1,
      organizer: { cn: "Alice Smith", email: "alice@company.com" },
      attendeeEmail: "bob@shoun.dev",
      attendeeCN: "Bob",
      partstat: "ACCEPTED",
      dtstart: "20250310T140000Z",
      dtend: "20250310T150000Z",
      summary: "Team Standup",
      now: fixedNow,
    });

    expect(ics).toContain("METHOD:REPLY");
    expect(ics).toContain("UID:abc123@google.com");
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).toContain("DTSTAMP:20250304T160000Z");
    expect(ics).toContain("DTSTART:20250310T140000Z");
    expect(ics).toContain("DTEND:20250310T150000Z");
    expect(ics).toContain("SUMMARY:Team Standup");
    expect(ics).toContain(
      "ORGANIZER;CN=Alice Smith:mailto:alice@company.com"
    );
    expect(ics).toContain(
      "ATTENDEE;CN=Bob;PARTSTAT=ACCEPTED:mailto:bob@shoun.dev"
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics).toMatch(/\r\n$/);
  });

  it("handles TENTATIVE without optional fields", () => {
    const fixedNow = new Date(Date.UTC(2025, 2, 4, 16, 0, 0));
    const ics = buildReplyICS({
      uid: "test@example.com",
      sequence: 0,
      organizer: { cn: "Host", email: "host@example.com" },
      attendeeEmail: "me@shoun.dev",
      attendeeCN: "Me",
      partstat: "TENTATIVE",
      dtstart: "20250310T140000Z",
      now: fixedNow,
    });

    expect(ics).toContain("PARTSTAT=TENTATIVE");
    expect(ics).not.toContain("DTEND");
    expect(ics).not.toContain("SUMMARY");
  });

  it("handles DECLINED", () => {
    const fixedNow = new Date(Date.UTC(2025, 2, 4, 16, 0, 0));
    const ics = buildReplyICS({
      uid: "test@example.com",
      sequence: 0,
      organizer: { cn: "Host", email: "host@example.com" },
      attendeeEmail: "me@shoun.dev",
      attendeeCN: "Me",
      partstat: "DECLINED",
      dtstart: "20250310T140000Z",
      now: fixedNow,
    });

    expect(ics).toContain("PARTSTAT=DECLINED");
  });

  it("escapes special characters", () => {
    const fixedNow = new Date(Date.UTC(2025, 2, 4, 16, 0, 0));
    const ics = buildReplyICS({
      uid: "special@example.com",
      sequence: 0,
      organizer: { cn: "Doe, Jane", email: "jane@example.com" },
      attendeeEmail: "me@shoun.dev",
      attendeeCN: "O'Brien; Jr.",
      partstat: "ACCEPTED",
      dtstart: "20250310T140000Z",
      summary: "Planning, Q1; Budget\\Review",
      now: fixedNow,
    });

    expect(ics).toContain("SUMMARY:Planning\\, Q1\\; Budget\\\\Review");
    expect(ics).toContain(
      "ORGANIZER;CN=Doe\\, Jane:mailto:jane@example.com"
    );
    expect(ics).toContain(
      "ATTENDEE;CN=O'Brien\\; Jr.;PARTSTAT=ACCEPTED"
    );
  });

  it("handles TZID datetime objects", () => {
    const fixedNow = new Date(Date.UTC(2026, 2, 5, 2, 0, 0));
    const ics = buildReplyICS({
      uid: "tzid-test@google.com",
      sequence: 0,
      organizer: { cn: "Organizer Name", email: "organizer@gmail.com" },
      attendeeEmail: "alias@shoun.dev",
      attendeeCN: "alias@shoun.dev",
      partstat: "ACCEPTED",
      dtstart: { value: "20260304T190000", tzid: "America/Denver" },
      dtend: { value: "20260304T200000", tzid: "America/Denver" },
      summary: "Test",
      now: fixedNow,
    });

    expect(ics).toContain("DTSTART;TZID=America/Denver:20260304T190000");
    expect(ics).toContain("DTEND;TZID=America/Denver:20260304T200000");
  });

  it("roundtrips through the parser", () => {
    const fixedNow = new Date(Date.UTC(2025, 2, 4, 16, 0, 0));
    const ics = buildReplyICS({
      uid: "roundtrip@test.com",
      sequence: 2,
      organizer: { cn: "Host", email: "host@example.com" },
      attendeeEmail: "alias@shoun.dev",
      attendeeCN: "Alias User",
      partstat: "ACCEPTED",
      dtstart: "20250310T140000Z",
      dtend: "20250310T150000Z",
      summary: "Roundtrip Test",
      now: fixedNow,
    });

    const asRequest = ics.replace("METHOD:REPLY", "METHOD:REQUEST");
    const parsed = parseICS(asRequest);

    expect(parsed).not.toBeNull();
    expect(parsed!.uid).toBe("roundtrip@test.com");
    expect(parsed!.sequence).toBe(2);
    expect(parsed!.dtstart).toBe("20250310T140000Z");
    expect(parsed!.dtend).toBe("20250310T150000Z");
    expect(parsed!.summary).toBe("Roundtrip Test");
    expect(parsed!.organizer!.email).toBe("host@example.com");
    expect(parsed!.attendees[0].email).toBe("alias@shoun.dev");
    expect(parsed!.attendees[0].partstat).toBe("ACCEPTED");
  });
});
