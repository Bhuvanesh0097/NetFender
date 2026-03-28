import { Router, type IRouter } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { db, analyzedMessagesTable } from "@workspace/db";
import { detectPhishing } from "../lib/phishing-detector.js";

const execAsync = promisify(exec);
const router: IRouter = Router();

async function isAdbAvailable(): Promise<boolean> {
  try {
    await execAsync("adb version");
    return true;
  } catch {
    return false;
  }
}

async function isDeviceConnected(): Promise<boolean> {
  try {
    const { stdout } = await execAsync("adb devices");
    const lines = stdout.trim().split("\n");
    return lines.some((line, i) => i > 0 && line.includes("\tdevice"));
  } catch {
    return false;
  }
}

async function readSmsFromDevice(limit: number): Promise<{ address: string; body: string; date: number }[]> {
  // Android 'content query' uses colons to separate projection columns, not commas.
  // Wrap the full command in quotes so Windows passes it correctly to adb shell.
  const cmd = `adb shell "content query --uri content://sms/inbox --projection address:body:date"`;

  const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
  const lines = stdout.trim().split("\n");
  const messages: { address: string; body: string; date: number }[] = [];

  for (const line of lines) {
    if (!line.startsWith("Row:")) continue;

    // Parse: Row: N address=..., body=..., date=...
    const addressMatch = line.match(/address=([^,]*)/);
    const dateMatch = line.match(/date=(\d+)/);
    // body can contain commas, so match everything between "body=" and ", date="
    const bodyMatch = line.match(/body=(.*?)(?:, date=)/);

    const address = addressMatch?.[1]?.trim() ?? "Unknown";
    const body = bodyMatch?.[1]?.trim() ?? "";
    const date = dateMatch ? parseInt(dateMatch[1]) : Date.now();

    if (body) {
      messages.push({ address, body, date });
    }
  }

  // Sort by date descending and apply limit (since we can't rely on --sort in content query)
  messages.sort((a, b) => b.date - a.date);
  const effectiveLimit = limit > 0 ? limit : 500;
  return messages.slice(0, effectiveLimit);
}

router.post("/test", async (req, res) => {
  try {
    const adbAvailable = await isAdbAvailable();
    if (!adbAvailable) {
      res.status(400).json({ error: "ADB not found. Ensure Android SDK tools are installed." });
      return;
    }

    const deviceConnected = await isDeviceConnected();
    if (!deviceConnected) {
      res.status(400).json({
        error: "No Android device detected. Connect your phone via USB with USB Debugging enabled.",
      });
      return;
    }

    const sampleSms = await readSmsFromDevice(5);
    res.json({
      success: true,
      message: `Device connected. Found ${sampleSms.length > 0 ? "messages in inbox" : "no messages yet"}. Ready to scan.`,
      smsCount: sampleSms.length,
    });
  } catch (err: any) {
    res.status(400).json({ error: "Connection test failed", details: err?.message ?? String(err) });
  }
});

// Read-only endpoint: fetches SMS from phone without analyzing
router.post("/read", async (req, res) => {
  const { limit = 50 } = req.body;
  try {
    const adbAvailable = await isAdbAvailable();
    if (!adbAvailable) {
      res.status(400).json({ error: "ADB not found. Ensure Android SDK tools are installed." });
      return;
    }

    const deviceConnected = await isDeviceConnected();
    if (!deviceConnected) {
      res.status(400).json({
        error: "No Android device detected. Connect your phone via USB with USB Debugging enabled.",
      });
      return;
    }

    const smsMessages = await readSmsFromDevice(limit);
    res.json({
      success: true,
      messages: smsMessages.map((sms) => ({
        content: sms.body,
        sender: sms.address,
        date: sms.date,
      })),
      count: smsMessages.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to read SMS", details: err?.message ?? String(err) });
  }
});

router.post("/scan", async (req, res) => {
  const { limit = 50 } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send("status", { phase: "connecting", message: "Checking USB connection..." });

    const adbAvailable = await isAdbAvailable();
    if (!adbAvailable) {
      send("error", { message: "ADB not found. Install Android SDK Platform Tools." });
      res.end();
      return;
    }

    const deviceConnected = await isDeviceConnected();
    if (!deviceConnected) {
      send("error", {
        message: "No Android device detected. Connect via USB with USB Debugging enabled.",
      });
      res.end();
      return;
    }

    send("status", { phase: "fetching", message: "Reading SMS inbox from device...", total: 0 });

    const smsMessages = await readSmsFromDevice(limit);

    if (smsMessages.length === 0) {
      send("complete", {
        summary: { total: 0, phishing: 0, suspicious: 0, safe: 0 },
        message: "No SMS messages found in inbox.",
      });
      res.end();
      return;
    }

    send("status", {
      phase: "fetching",
      message: `Retrieved ${smsMessages.length} SMS messages. Starting AI analysis...`,
      fetched: smsMessages.length,
      total: smsMessages.length,
    });

    send("status", {
      phase: "analyzing",
      message: `Analyzing ${smsMessages.length} SMS messages with AI...`,
      total: smsMessages.length,
    });

    const results: any[] = [];

    for (let i = 0; i < smsMessages.length; i++) {
      const sms = smsMessages[i];

      try {
        const detection = await detectPhishing(sms.body, "sms", sms.address);

        const [inserted] = await db
          .insert(analyzedMessagesTable)
          .values({
            content: sms.body,
            type: "sms",
            sender: sms.address,
            subject: null,
            label: detection.label,
            riskScore: detection.riskScore,
            explanation: detection.explanation,
            signals: detection.signals,
            urls: detection.urls,
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
          total: smsMessages.length,
          message: result,
        });
      } catch (err) {
        req.log.error({ err, address: sms.address }, "Failed to analyze SMS");
        send("progress", { phase: "analyzing", analyzed: i + 1, total: smsMessages.length, error: true });
      }
    }

    const summary = {
      total: results.length,
      phishing: results.filter((r) => r.label === "phishing").length,
      suspicious: results.filter((r) => r.label === "suspicious").length,
      safe: results.filter((r) => r.label === "safe").length,
    };

    send("complete", { summary, message: "SMS scan complete." });
    res.end();
  } catch (err: any) {
    req.log.error({ err }, "SMS scan failed");
    send("error", { message: err?.message ?? "SMS scan failed unexpectedly" });
    res.end();
  }
});

export default router;
