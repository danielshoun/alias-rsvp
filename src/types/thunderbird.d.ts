/** Minimal type declarations for Thunderbird WebExtension APIs used by this extension. */

declare namespace browser {
  namespace messageDisplay {
    function getDisplayedMessage(
      tabId: number
    ): Promise<messages.MessageHeader | null>;
  }

  namespace messages {
    interface MessageHeader {
      id: number;
      author: string;
    }

    interface MessagePart {
      contentType?: string;
      body?: string;
      parts?: MessagePart[];
    }

    interface Attachment {
      contentType: string;
      partName: string;
      name: string;
      size: number;
    }

    function getFull(messageId: number): Promise<MessagePart>;
    function listAttachments(messageId: number): Promise<Attachment[]>;
    function getAttachmentFile(
      messageId: number,
      partName: string
    ): Promise<File>;
  }

  namespace accounts {
    interface MailIdentity {
      id: string;
      email: string;
      name: string;
    }

    interface MailAccount {
      id: string;
      identities: MailIdentity[];
    }

    function list(): Promise<MailAccount[]>;
  }

  namespace compose {
    function beginNew(details: Record<string, unknown>): Promise<unknown>;
  }

  namespace storage {
    namespace local {
      function get(
        key: string
      ): Promise<Record<string, unknown>>;
    }
  }

  namespace runtime {
    function sendMessage(message: unknown): Promise<unknown>;

    namespace onMessage {
      function addListener(
        callback: (
          message: Record<string, unknown>,
          sender: unknown
        ) => Promise<unknown> | void
      ): void;
    }
  }

  namespace tabs {
    interface Tab {
      id: number;
    }

    function query(queryInfo: {
      active?: boolean;
      currentWindow?: boolean;
    }): Promise<Tab[]>;
  }

  const calendarReply: CalendarReplyAPI;
}
