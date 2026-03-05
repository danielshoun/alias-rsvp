/**
 * Background script for Alias-Safe RSVP.
 *
 * Orchestrates ICS extraction from messages, parsing, and sending
 * calendar reply emails with the correct alias as the ATTENDEE.
 */

// Default configuration
const DEFAULT_CONFIG = {
  aliasDomain: "shoun.dev",
};

/**
 * Read config from storage, merged with defaults.
 */
async function getConfig() {
  const stored = await browser.storage.local.get("config");
  return { ...DEFAULT_CONFIG, ...stored.config };
}

/**
 * Recursively find a text/calendar or application/ics MIME part.
 */
function findCalendarPart(part) {
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

/**
 * Find the attendee whose email matches the configured alias domain.
 */
function findAliasAttendee(attendees, aliasDomain) {
  const domainSuffix = "@" + aliasDomain.toLowerCase();
  return attendees.find((a) => a.email.toLowerCase().endsWith(domainSuffix));
}

/**
 * Map a PARTSTAT value to a human-readable subject prefix.
 */
function partstatToSubjectPrefix(partstat) {
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

/**
 * Map a PARTSTAT value to a human-readable verb for the email body.
 */
function partstatToVerb(partstat) {
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

/**
 * Extract and parse an ICS invite from the currently displayed message.
 * Returns { invite, alias } on success, or { error } on failure.
 */
async function getInviteFromActiveMessage(tabId) {
  const config = await getConfig();

  // Get the displayed message for this tab
  const message = await browser.messageDisplay.getDisplayedMessage(tabId);
  if (!message) {
    return { error: "No message is currently displayed." };
  }

  // Get the full MIME structure
  const full = await browser.messages.getFull(message.id);
  if (!full) {
    return { error: "Could not read message content." };
  }

  // Find the calendar part in the MIME tree
  const calPart = findCalendarPart(full);

  let icsText = null;

  if (calPart && calPart.body) {
    // Body is available inline (e.g. text/calendar without Content-Disposition: attachment)
    icsText = calPart.body;
  } else {
    // Body is empty — the calendar part is an attachment.
    // Fall back to messages.listAttachments + getAttachmentFile.
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

  // Parse the ICS
  const invite = parseICS(icsText);
  if (!invite) {
    return { error: "This is not a calendar invitation (METHOD:REQUEST)." };
  }

  // Find the alias attendee
  const alias = findAliasAttendee(invite.attendees, config.aliasDomain);
  if (!alias) {
    return {
      error: `No attendee found matching @${config.aliasDomain} in this invite.`,
    };
  }

  return { invite, alias, replyTo: message.author };
}

/**
 * Wrap a base64 string at 76 characters per line (MIME requirement).
 */
function wrapBase64(str) {
  const lines = [];
  for (let i = 0; i < str.length; i += 76) {
    lines.push(str.substring(i, i + 76));
  }
  return lines.join("\r\n");
}

/**
 * Build a complete MIME message with the ICS as an inline part of a
 * multipart/alternative body. This is the structure that Outlook/Exchange
 * requires to auto-process calendar replies (RFC 6047).
 *
 * Structure:
 *   multipart/alternative
 *   ├── text/plain (human-readable body)
 *   └── text/calendar; method=REPLY (machine-readable calendar action)
 */
function buildMIMEMessage({ from, to, subject, bodyText, icsContent }) {
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

/**
 * Handle an RSVP action: build a correctly structured MIME reply
 * and send it directly via SMTP (bypassing the compose engine which
 * strips Content-Type parameters like method=REPLY).
 */
async function handleRSVP(tabId, partstat) {
  const result = await getInviteFromActiveMessage(tabId);
  if (result.error) {
    return { error: result.error };
  }

  const { invite, alias, replyTo } = result;

  // Build the reply ICS
  const replyICS = buildReplyICS({
    uid: invite.uid,
    sequence: invite.sequence,
    organizer: invite.organizer,
    attendeeEmail: alias.email,
    attendeeCN: alias.cn,
    partstat: partstat,
    dtstart: invite.dtstart,
    dtend: invite.dtend,
    summary: invite.summary,
  });

  // Compose the subject and body
  const prefix = partstatToSubjectPrefix(partstat);
  const verb = partstatToVerb(partstat);
  const summary = invite.summary || "Calendar Event";
  const subject = `${prefix}: ${summary}`;
  const bodyText = `${alias.cn} has ${verb} the invitation to: ${summary}`;

  // Find the user's identity to send from
  const accounts = await browser.accounts.list();
  let identity = null;

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

  // Use the SimpleLogin proxy address (from the original email's From header)
  // instead of the real organizer email, so the reply comes from our alias.
  const sendTo = replyTo || invite.organizer.email;

  // Build the complete MIME message with correct structure
  const mimeMessage = buildMIMEMessage({
    from: fromHeader,
    to: sendTo,
    subject: subject,
    bodyText: bodyText,
    icsContent: replyICS,
  });

  // Send directly via XPCOM, bypassing the compose engine entirely
  await browser.calendarReply.sendRawMessage(
    identity.id,
    sendTo,
    mimeMessage
  );

  return { success: true };
}

// Listen for messages from the popup
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "getInvite") {
    return getInviteFromActiveMessage(message.tabId);
  }

  if (message.type === "rsvp") {
    return handleRSVP(message.tabId, message.partstat);
  }
});
