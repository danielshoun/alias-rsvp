/** Shape of the calendarReply experiment API exposed to WebExtension code. */
interface CalendarReplyAPI {
  sendRawMessage(
    identityId: string,
    to: string,
    mimeContent: string,
  ): Promise<boolean>;
}
