import { Router, type IRouter } from "express";
import { db, analyzedMessagesTable } from "@workspace/db";
import { detectPhishing } from "../lib/phishing-detector.js";
import { testConnection, fetchEmails } from "../lib/imap-connector.js";

const router: IRouter = Router();

router.post("/test", async (req, res) => {
  const { email, password, host, port = 993, tls = true, folder = "INBOX" } = req.body;

  if (!email || !password || !host) {
    res.status(400).json({ error: "email, password, and host are required" });
    return;
  }

  try {
    const result = await testConnection({ email, password, host, port, tls, folder });
    if (result.success) {
      res.json({ success: true, message: result.message, emailCount: result.count });
    } else {
      res.status(400).json({ error: "Connection failed", details: result.message });
    }
  } catch (err: any) {
    req.log.error({ err }, "Mailbox test failed");
    res.status(400).json({ error: "Connection failed", details: err?.message ?? String(err) });
  }
});

router.post("/scan", async (req, res) => {
  const { email, password, host, port = 993, tls = true, folder = "INBOX", limit = 100 } = req.body;

  if (!email || !password || !host) {
    res.status(400).json({ error: "email, password, and host are required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send("status", { phase: "connecting", message: "Connecting to mailbox..." });

    const testResult = await testConnection({ email, password, host, port, tls, folder });
    if (!testResult.success) {
      send("error", { message: testResult.message });
      res.end();
      return;
    }

    const totalInBox = testResult.count;
    const toFetch = limit > 0 ? Math.min(limit, totalInBox) : totalInBox;

    send("status", {
      phase: "fetching",
      message: `Connected. Fetching ${toFetch} of ${totalInBox} emails...`,
      total: toFetch,
    });

    const emails = await fetchEmails(
      { email, password, host, port, tls, folder },
      limit,
      (fetched, total) => {
        send("progress", { phase: "fetching", fetched, total });
      }
    );

    send("status", {
      phase: "analyzing",
      message: `Fetched ${emails.length} emails. Running AI analysis...`,
      total: emails.length,
    });

    const results: any[] = [];

    for (let i = 0; i < emails.length; i++) {
      const mail = emails[i];

      const combinedContent = `Subject: ${mail.subject}\nFrom: ${mail.from}\n\n${mail.body}`;

      try {
        const detection = await detectPhishing(combinedContent, "email", mail.from);

        const combinedUrls = [...new Set([...detection.urls, ...mail.urls])];

        const [inserted] = await db
          .insert(analyzedMessagesTable)
          .values({
            content: combinedContent,
            type: "email",
            sender: mail.from,
            subject: mail.subject,
            label: detection.label,
            riskScore: detection.riskScore,
            explanation: detection.explanation,
            signals: detection.signals,
            urls: combinedUrls,
          })
          .returning();

        const result = {
          id: inserted.id,
          content: inserted.content,
          type: inserted.type,
          sender: inserted.sender,
          subject: inserted.subject,
          label: inserted.label,
          riskScore: inserted.riskScore,
          explanation: inserted.explanation,
          signals: inserted.signals as string[],
          urls: inserted.urls as string[],
          analyzedAt: inserted.analyzedAt.toISOString(),
        };

        results.push(result);

        send("result", {
          phase: "analyzing",
          analyzed: i + 1,
          total: emails.length,
          message: result,
        });
      } catch (err) {
        req.log.error({ err, subject: mail.subject }, "Failed to analyze email");
        send("progress", { phase: "analyzing", analyzed: i + 1, total: emails.length, error: true });
      }
    }

    const summary = {
      total: results.length,
      phishing: results.filter((r) => r.label === "phishing").length,
      suspicious: results.filter((r) => r.label === "suspicious").length,
      safe: results.filter((r) => r.label === "safe").length,
    };

    send("complete", { summary, message: "Scan complete." });
    res.end();
  } catch (err: any) {
    req.log.error({ err }, "Mailbox scan failed");
    send("error", { message: err?.message ?? "Scan failed unexpectedly" });
    res.end();
  }
});

export default router;
