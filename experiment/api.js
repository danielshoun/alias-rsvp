"use strict";

/* exported calendarReply */
/* global ExtensionCommon, Cc, Ci, IOUtils, Services, ChromeUtils */

var calendarReply = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { MailServices } = ChromeUtils.importESModule(
      "resource:///modules/MailServices.sys.mjs"
    );

    return {
      calendarReply: {
        /**
         * Send a pre-composed MIME message directly via SMTP.
         * This bypasses the compose engine entirely, preserving our
         * exact MIME structure (including Content-Type parameters
         * like method=REPLY that the compose engine strips).
         */
        async sendRawMessage(identityId, to, mimeContent) {
          // Find the identity by key
          const identity = MailServices.accounts.allIdentities.find(
            (id) => id.key === identityId
          );
          if (!identity) {
            throw new Error("Identity not found: " + identityId);
          }

          // Find the account for this identity (needed for account key)
          let accountKey = "";
          for (const account of MailServices.accounts.accounts) {
            for (const ident of account.identities) {
              if (ident.key === identityId) {
                accountKey = account.key;
                break;
              }
            }
            if (accountKey) break;
          }

          // Write MIME content to a temp file
          const tempFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
          tempFile.append("aliasrsvp-" + Date.now() + ".eml");
          tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
          await IOUtils.writeUTF8(tempFile.path, mimeContent);

          // Set up compFields for the SMTP envelope
          const compFields = Cc[
            "@mozilla.org/messengercompose/composefields;1"
          ].createInstance(Ci.nsIMsgCompFields);
          compFields.from = identity.email;
          compFields.to = to;

          // Send the message file
          const msgSend = Cc[
            "@mozilla.org/messengercompose/send;1"
          ].createInstance(Ci.nsIMsgSend);

          return new Promise((resolve, reject) => {
            const copyListener = {
              QueryInterface: ChromeUtils.generateQI([
                "nsIMsgCopyServiceListener",
              ]),
              onStartCopy() {},
              onProgress(progress, progressMax) {},
              setMessageKey(key) {},
              getMessageId() {
                return null;
              },
              onStopCopy(status) {
                if (status === 0) {
                  resolve(true);
                } else {
                  reject(new Error("Send failed with status: " + status));
                }
              },
            };

            const sendListener = {
              QueryInterface: ChromeUtils.generateQI(["nsIMsgSendListener"]),
              onStartSending(msgID, msgSize) {},
              onSendProgress(msgID, progress, progressMax) {},
              onStatus(msgID, msg) {},
              onStopSending(msgID, status, msg, returnFile) {
                if (status !== 0) {
                  reject(new Error("SMTP send failed: " + status));
                } else {
                  resolve(true);
                }
              },
              onGetDraftFolderURI(msgID, folderURI) {},
              onSendNotPerformed(msgID, status) {
                reject(new Error("Send not performed: " + status));
              },
            };

            try {
              msgSend.sendMessageFile(
                identity,
                accountKey,
                compFields,
                tempFile,
                true, // deleteSendFileOnCompletion
                false, // digest
                Ci.nsIMsgSend.nsMsgDeliverNow,
                null, // msgToReplace
                sendListener,
                null, // statusFeedback
                "" // password
              );

              // Fallback: resolve after 10s if neither listener fires
              let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
              timer.initWithCallback(
                { notify() { resolve(true); } },
                10000,
                Ci.nsITimer.TYPE_ONE_SHOT
              );
            } catch (ex) {
              reject(new Error("sendMessageFile failed: " + ex.message));
            }
          });
        },
      },
    };
  }
};
