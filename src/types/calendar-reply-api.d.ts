interface CalendarReplyAPI {
  sendRawMessage(
    identityId: string,
    to: string,
    mimeContent: string,
  ): Promise<boolean>;
}
