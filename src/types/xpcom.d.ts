// Thunderbird / Mozilla XPCOM type stubs used by experiment APIs

declare namespace ExtensionCommon {
  class ExtensionAPI {
    getAPI(context: unknown): Record<string, unknown>;
  }
}

interface nsIFile {
  path: string;
  append(name: string): void;
  createUnique(type: number, permissions: number): void;
  readonly NORMAL_FILE_TYPE: number;
}

interface nsIMsgIdentity {
  key: string;
  email: string;
}

interface nsIMsgAccount {
  key: string;
  identities: nsIMsgIdentity[];
}

interface nsIMsgCompFields {
  from: string;
  to: string;
}

interface nsIMsgCopyServiceListener {
  onStartCopy(): void;
  onProgress(progress: number, progressMax: number): void;
  setMessageKey(key: number): void;
  getMessageId(): string | null;
  onStopCopy(status: number): void;
}

interface nsIMsgSendListener {
  onStartSending(msgID: string, msgSize: number): void;
  onSendProgress(msgID: string, progress: number, progressMax: number): void;
  onStatus(msgID: string, msg: string): void;
  onStopSending(
    msgID: string,
    status: number,
    msg: string,
    returnFile: nsIFile | null,
  ): void;
  onGetDraftFolderURI(msgID: string, folderURI: string): void;
  onSendNotPerformed(msgID: string, status: number): void;
}

interface nsIMsgSend {
  nsMsgDeliverNow: number;
  sendMessageFile(
    identity: nsIMsgIdentity,
    accountKey: string,
    compFields: nsIMsgCompFields,
    file: nsIFile,
    deleteSendFileOnCompletion: boolean,
    digest: boolean,
    deliverMode: number,
    msgToReplace: null,
    listener: nsIMsgSendListener,
    statusFeedback: null,
    password: string,
  ): void;
}

interface nsITimer {
  TYPE_ONE_SHOT: number;
  initWithCallback(
    callback: { notify(): void },
    delay: number,
    type: number,
  ): void;
}

interface ContractInstance<T> {
  createInstance(iface: { name: string } | T): T;
}

declare const Cc: {
  [contractId: string]: {
    createInstance(iface: unknown): any;
  };
};

declare const Ci: {
  nsIFile: nsIFile & { NORMAL_FILE_TYPE: number };
  nsIMsgCompFields: nsIMsgCompFields;
  nsIMsgSend: nsIMsgSend;
  nsITimer: nsITimer;
};

declare const Services: {
  dirsvc: {
    get(key: string, iface: unknown): nsIFile;
  };
};

declare const IOUtils: {
  writeUTF8(path: string, content: string): Promise<void>;
};

declare const ChromeUtils: {
  importESModule(url: string): { MailServices: MailServicesType };
  generateQI(interfaces: string[]): (...args: unknown[]) => unknown;
};

interface MailServicesType {
  accounts: {
    allIdentities: nsIMsgIdentity[];
    accounts: nsIMsgAccount[];
  };
}
