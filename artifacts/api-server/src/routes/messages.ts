import { Router, type IRouter } from "express";
import { db, analyzedMessagesTable } from "@workspace/db";
import { eq, count, and, sql } from "drizzle-orm";
import {
  AnalyzeMessagesBody,
  GetMessagesQueryParams,
  DeleteMessageParams,
} from "@workspace/api-zod";
import { detectPhishing } from "../lib/phishing-detector.js";

const router: IRouter = Router();

router.post("/analyze", async (req, res) => {
  const parseResult = AnalyzeMessagesBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request", details: String(parseResult.error) });
    return;
  }

  const { messages } = parseResult.data;

  if (!messages || messages.length === 0) {
    res.status(400).json({ error: "No messages provided" });
    return;
  }

  try {
    const analysisPromises = messages.map(async (msg) => {
      const result = await detectPhishing(msg.content, msg.type, msg.sender);
      return { msg, result };
    });

    const analyses = await Promise.all(analysisPromises);

    const inserted = await db
      .insert(analyzedMessagesTable)
      .values(
        analyses.map(({ msg, result }) => ({
          content: msg.content,
          type: msg.type,
          sender: msg.sender ?? null,
          subject: null,
          label: result.label,
          riskScore: result.riskScore,
          explanation: result.explanation,
          signals: result.signals,
          urls: result.urls,
        }))
      )
      .returning();

    const results = inserted.map((row) => ({
      id: row.id,
      content: row.content,
      type: row.type,
      sender: row.sender,
      subject: row.subject,
      label: row.label,
      riskScore: row.riskScore,
      explanation: row.explanation,
      signals: row.signals as string[],
      urls: row.urls as string[],
      analyzedAt: row.analyzedAt.toISOString(),
    }));

    const summary = {
      total: results.length,
      phishing: results.filter((r) => r.label === "phishing").length,
      suspicious: results.filter((r) => r.label === "suspicious").length,
      safe: results.filter((r) => r.label === "safe").length,
    };

    res.json({ results, summary });
  } catch (err) {
    req.log.error({ err }, "Failed to analyze messages");
    res.status(500).json({ error: "Analysis failed", details: String(err) });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const rows = await db
      .select({
        label: analyzedMessagesTable.label,
        type: analyzedMessagesTable.type,
        cnt: count(),
      })
      .from(analyzedMessagesTable)
      .groupBy(analyzedMessagesTable.label, analyzedMessagesTable.type);

    const stats = {
      total: 0,
      phishing: 0,
      suspicious: 0,
      safe: 0,
      emailCount: 0,
      smsCount: 0,
    };

    for (const row of rows) {
      stats.total += Number(row.cnt);
      if (row.label === "phishing") stats.phishing += Number(row.cnt);
      if (row.label === "suspicious") stats.suspicious += Number(row.cnt);
      if (row.label === "safe") stats.safe += Number(row.cnt);
      if (row.type === "email") stats.emailCount += Number(row.cnt);
      if (row.type === "sms") stats.smsCount += Number(row.cnt);
    }

    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Failed to get stats");
    res.status(500).json({ error: "Failed to retrieve stats" });
  }
});

router.get("/", async (req, res) => {
  const parseResult = GetMessagesQueryParams.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { label, type } = parseResult.data;

  try {
    const conditions = [];
    if (label) conditions.push(eq(analyzedMessagesTable.label, label));
    if (type) conditions.push(eq(analyzedMessagesTable.type, type));

    const rows = await db
      .select()
      .from(analyzedMessagesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${analyzedMessagesTable.analyzedAt} DESC`);

    const messages = rows.map((row) => ({
      id: row.id,
      content: row.content,
      type: row.type,
      sender: row.sender,
      subject: row.subject,
      label: row.label,
      riskScore: row.riskScore,
      explanation: row.explanation,
      signals: row.signals as string[],
      urls: row.urls as string[],
      analyzedAt: row.analyzedAt.toISOString(),
    }));

    res.json({ messages, total: messages.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get messages");
    res.status(500).json({ error: "Failed to retrieve messages" });
  }
});

router.delete("/:id", async (req, res) => {
  const parseResult = DeleteMessageParams.safeParse(req.params);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid message ID" });
    return;
  }

  const { id } = parseResult.data;

  try {
    await db.delete(analyzedMessagesTable).where(eq(analyzedMessagesTable.id, id));
    res.json({ success: true, message: "Message deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete message");
    res.status(500).json({ error: "Failed to delete message" });
  }
});

export default router;
