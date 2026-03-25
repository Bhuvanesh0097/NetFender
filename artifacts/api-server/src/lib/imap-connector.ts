import { createRequire } from "module";

const require = createRequire(import.meta.url);
const imapSimple = require("imap-simple");
const { simpleParser } = require("mailparser");

export interface MailboxConfig {
  email: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  folder: string;
}

export interface ParsedEmail {
  uid: string;
  from: string;
  subject: string;
  body: string;
  date: Date;
  urls: string[];
}

function buildImapConfig(config: MailboxConfig) {
  return {
    imap: {
      user: config.email,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 15000,
    },
  };
}

export async function testConnection(config: MailboxConfig): Promise<{ success: boolean; count: number; message: string }> {
  let connection: any = null;
  try {
    connection = await imapSimple.connect(buildImapConfig(config));
    await connection.openBox(config.folder || "INBOX");
    const messages = await connection.search(["ALL"], { bodies: [], struct: false });
    const count = messages.length;
    connection.end();
    return { success: true, count, message: `Connected. Found ${count} emails in ${config.folder || "INBOX"}.` };
  } catch (err: any) {
    if (connection) { try { connection.end(); } catch {} }
    return { success: false, count: 0, message: err?.message || "Connection failed" };
  }
}

export async function fetchEmails(
  config: MailboxConfig,
  limit: number,
  onProgress?: (fetched: number, total: number) => void
): Promise<ParsedEmail[]> {
  const connection = await imapSimple.connect(buildImapConfig(config));

  try {
    await connection.openBox(config.folder || "INBOX");

    const allMessages: any[] = await connection.search(["ALL"], {
      bodies: [""],
      markSeen: false,
      struct: false,
    });

    if (allMessages.length === 0) {
      connection.end();
      return [];
    }

    const toProcess = limit > 0
      ? allMessages.slice(-Math.min(limit, allMessages.length))
      : allMessages;

    const parsed: ParsedEmail[] = [];
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

    for (let i = 0; i < toProcess.length; i++) {
      const msg = toProcess[i];
      try {
        const fullPart = msg.parts.find((p: any) => p.which === "");
        const rawBody = fullPart?.body ?? "";

        const mail = await simpleParser(rawBody);

        const from = mail.from?.text ?? "unknown@unknown.com";
        const subject = mail.subject ?? "(No Subject)";
        const textBody = (mail.text ?? "").trim();
        const htmlBody = (mail.html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const body = textBody || htmlBody;

        const allText = body + " " + (mail.html ?? "");
        const urls = [...new Set(allText.match(urlRegex) || [])];

        parsed.push({
          uid: String(msg.attributes.uid),
          from,
          subject,
          body: body.slice(0, 5000),
          date: mail.date ?? new Date(),
          urls: urls.slice(0, 20),
        });

        onProgress?.(i + 1, toProcess.length);
      } catch {
        onProgress?.(i + 1, toProcess.length);
      }
    }

    connection.end();

    // Sort by date descending so the most recently received emails come first
    parsed.sort((a, b) => b.date.getTime() - a.date.getTime());

    return parsed;
  } catch (err) {
    try { connection.end(); } catch {}
    throw err;
  }
}
