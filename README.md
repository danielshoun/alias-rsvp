# Alias RSVP

A Thunderbird MailExtension that responds to calendar invites using your e-mail aliases instead of your real address.

## Why?

I am a huge proponent of using email aliasing services to cut down on spam and track address leaks. My services of choice for this are Proton Mail and SimpleLogin. One issue that I've run into with this setup is that Proton Mail does not allow users to accept calendar invitations addressed to one of their aliases. Interestingly, this actually *was* allowed at one point, but was disabled due to the fact that doing so reveals your true e-mail address. Rather than accepting the invitation on behalf of your alias address, your real one would be added to the event as a new participant. Calendar services that don't allow "party crashing" (Microsoft 365, for example) would ignore this entirely. Thunderbird also exhibits this behavior by default.

The problem is one of a lack of information. These e-mail clients don't know which of the participants is the one it is supposed to be acting on behalf of. This extension aims to solve that in a simple way: matching event participants against a configured alias domain.

## Installation

I am still working on getting this into a state where I'm comfortable putting it on the official Thunderbird extension site. In the meantime, you can clone this repo and package it manually.

Requires **Thunderbird 128+**.

1. `npm install`
2. `npm run package`
3. In Thunderbird: Add-ons Manager > Install Add-on From File > select `.zip` file from `dist-xpi/` folder.

## Usage

1. **Configure your alias domain**: Add-ons Manager > Alias RSVP > Add-on Options. Enter the domain used for your aliases (e.g. `shoun.dev`).
2. **Open a message** containing a calendar invite.
3. **Click the "Alias RSVP" button** in the message header toolbar.
4. The popup shows the event details and which alias address will be used.
5. **Click Accept, Tentative, or Decline** to send the response.

The reply is sent directly via SMTP from your alias address, so the organizer never sees your real email.

**NOTE:** This extension does NOT update your calendar in Thunderbird or any other services. You can manually add it to Thunderbird by accepting the invitation without sending a response. For external providers such as Proton Calendar, you will need to download and import the ICS attachment.

## How It Works

When you view a message with a calendar invite:

1. The background script reads the message's MIME tree and finds the `text/calendar` attachment.
2. The ICS is parsed to extract event details and attendees.
3. The attendee matching your configured alias domain is identified.
4. When you click an RSVP button, a `METHOD:REPLY` VCALENDAR is built and wrapped in a MIME message.
5. The message is sent via SMTP through Thunderbird's Experiment API.

### Why an Experiment API?

The basic Thunderbird APIs allow for opening Compose windows with specific content/attachments, or firing events before a message is sent. My earlier attempts at solving this issue attempted to use these methods, but I was unable to get certain necessary bits of data such as the `method=REPLY` portion of the ICS attachment's `Content-Type` to stick. *Some* calendar providers (Google) are less strict about these standards and would still process the response, but others (Outlook) would not. So far, this Experiment API is the only way I have been able to send responses that are accepted by both Google and Outlook.

## Development

```bash
npm run build        # Build to dist/
npm run typecheck    # TypeScript check
npm test             # Run tests (vitest)
npm run test:watch   # Tests in watch mode
```

## Disclaimer
I make no guarantee that this extension will work out of the box for your specific e-mail, aliasing, and calendar provider combination. If you have any problems, please open a GitHub issue with this information and I'll be happy to take a look. If you would like to try fixing it yourself, you can also open a Pull Request.
