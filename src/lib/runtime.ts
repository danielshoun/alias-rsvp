import type { Attendee, ParsedInvite } from "./ics-parser";

export type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; value: T })
  | { ok: false; error: string };

export interface InviteData {
  invite: ParsedInvite;
  alias: Attendee;
  replyTo?: string;
}

export interface GetInviteMessage {
  type: "getInvite";
  tabId: number;
}

export interface RSVPMessage {
  type: "rsvp";
  tabId: number;
  partstat: string;
}

export type RuntimeMessage = GetInviteMessage | RSVPMessage;

export type InviteResult = Result<InviteData>;
export type RSVPResult = Result;

export interface RuntimeResponseMap {
  getInvite: InviteResult;
  rsvp: RSVPResult;
}

export type RuntimeResponse = RuntimeResponseMap[RuntimeMessage["type"]];
