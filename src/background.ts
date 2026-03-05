/**
 * Background script for Alias-Safe RSVP.
 */

import { parseICS, type Attendee, type ParsedInvite } from "./lib/ics-parser";
import { buildReplyICS } from "./lib/ics-builder";

interface Config {
  aliasDomain: string;
}

const DEFAULT_CONFIG: Config = {
  aliasDomain: "shoun.dev",
};

async function getConfig(): Promise<Config> {
  const stored = await browser.storage.local.get("config");
  return { ...DEFAULT_CONFIG, ...(stored.config as Partial<Config>) };
}

function findCalendarPart(
  part: browser.messages.MessagePart
): browser.messages.MessagePart | null {
  const ct = (part.contentType || "").toLowerCase();
  if (ct.startsWith("text/calendar") || ct.startsWith("application/ics")) {
    return part;
  }
  if (part.parts) {
    for (const child of part.parts) {
      const found = findCalendarPart(child);
      if (found) return found;
    }
  }
  return null;
}

function findAliasAttendee(
  attendees: Attendee[],
  aliasDomain: string
): Attendee | undefined {
  const domainSuffix = "@" + aliasDomain.toLowerCase();
  return attendees.find((a) => a.email.toLowerCase().endsWith(domainSuffix));
}

function partstatToSubjectPrefix(partstat: string): string {
  switch (partstat) {
    case "ACCEPTED":
      return "Accepted";
    case "TENTATIVE":
      return "Tentative";
    case "DECLINED":
      return "Declined";
    default:
      return partstat;
  }
}

function partstatToVerb(partstat: string): string {
  switch (partstat) {
    case "ACCEPTED":
      return "accepted";
    case "TENTATIVE":
      return "tentatively accepted";
    case "DECLINED":
      return "declined";
    default:
      return partstat.toLowerCase();
  }
}

interface InviteResult {
  invite?: ParsedInvite;
  alias?: Attendee;
  replyTo?: string;
  error?: string;
}

async function getInviteFromActiveMessage(tabId: number): Promise<InviteResult> {
  const config = await getConfig();

  const message = await browser.messageDisplay.getDisplayedMessage(tabId);
  if (!message) {
    return { error: "No message is currently displayed." };
  }

  const full = await browser.messages.getFull(message.id);
  if (!full) {
    return { error: "Could not read message content." };
  }

  const calPart = findCalendarPart(full);

  let icsText: string | null = null;

  if (calPart && calPart.body) {
    icsText = calPart.body;
  } else {
    const attachments = await browser.messages.listAttachments(message.id);
    const calAttachment = attachments.find((att) => {
      const ct = (att.contentType || "").toLowerCase();
      return ct.startsWith("text/calendar") || ct.startsWith("application/ics");
    });
    if (calAttachment) {
      const file = await browser.messages.getAttachmentFile(
        message.id,
        calAttachment.partName
      );
      icsText = await file.text();
    }
  }

  if (!icsText) {
    return { error: "No calendar invite found in this message." };
  }

  const invite = parseICS(icsText);
  if (!invite) {
    return { error: "This is not a calendar invitation (METHOD:REQUEST)." };
  }

  const alias = findAliasAttendee(invite.attendees, config.aliasDomain);
  if (!alias) {
    return {
      error: `No attendee found matching @${config.aliasDomain} in this invite.`,
    };
  }

  return { invite, alias, replyTo: message.author };
}

function wrapBase64(str: string): string {
  const lines: string[] = [];
  for (let i = 0; i < str.length; i += 76) {
    lines.push(str.substring(i, i + 76));
  }
  return lines.join("\r\n");
}

interface MIMEMessageParams {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  icsContent: string;
}

function buildMIMEMessage({
  from,
  to,
  subject,
  bodyText,
  icsContent,
}: MIMEMessageParams): string {
  const boundary = "----=_AliasRSVP_" + Date.now();
  const date = new Date().toUTCString();
  const icsBase64 = wrapBase64(btoa(icsContent));

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative;`,
    ` boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    bodyText,
    ``,
    `--${boundary}`,
    `Content-Type: text/calendar; method=REPLY; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    icsBase64,
    ``,
    `--${boundary}--`,
    ``,
  ].join("\r\n");
}

interface RSVPResult {
  success?: boolean;
  error?: string;
}

async function handleRSVP(
  tabId: number,
  partstat: string
): Promise<RSVPResult> {
  const result = await getInviteFromActiveMessage(tabId);
  if (result.error || !result.invite || !result.alias) {
    return { error: result.error || "Unknown error" };
  }

  const { invite, alias, replyTo } = result;

  const replyICS = buildReplyICS({
    uid: invite.uid!,
    sequence: invite.sequence,
    organizer: invite.organizer!,
    attendeeEmail: alias.email,
    attendeeCN: alias.cn,
    partstat: partstat,
    dtstart: invite.dtstart!,
    dtend: invite.dtend,
    summary: invite.summary,
  });

  const prefix = partstatToSubjectPrefix(partstat);
  const verb = partstatToVerb(partstat);
  const summary = invite.summary || "Calendar Event";
  const subject = `${prefix}: ${summary}`;
  const bodyText = `${alias.cn} has ${verb} the invitation to: ${summary}`;

  const accounts = await browser.accounts.list();
  let identity: browser.accounts.MailIdentity | null = null;

  for (const account of accounts) {
    if (account.identities && account.identities.length > 0) {
      identity = account.identities[0];
      break;
    }
  }

  if (!identity) {
    return { error: "No email identity configured in Thunderbird." };
  }

  const fromEmail = identity.email;
  const fromName = identity.name;
  const fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  const sendTo = replyTo || invite.organizer!.email;

  const mimeMessage = buildMIMEMessage({
    from: fromHeader,
    to: sendTo,
    subject: subject,
    bodyText: bodyText,
    icsContent: replyICS,
  });

  await browser.calendarReply.sendRawMessage(
    identity.id,
    sendTo,
    mimeMessage
  );

  return { success: true };
}

browser.runtime.onMessage.addListener((message) => {
  if (message.type === "getInvite") {
    return getInviteFromActiveMessage(message.tabId as number);
  }

  if (message.type === "rsvp") {
    return handleRSVP(message.tabId as number, message.partstat as string);
  }
});
