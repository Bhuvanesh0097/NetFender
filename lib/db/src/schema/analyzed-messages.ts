import { pgTable, serial, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const analyzedMessagesTable = pgTable("analyzed_messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  type: text("type").notNull(),
  sender: text("sender"),
  subject: text("subject"),
  label: text("label").notNull(),
  riskScore: real("risk_score").notNull(),
  explanation: text("explanation").notNull(),
  signals: jsonb("signals").notNull().$type<string[]>(),
  urls: jsonb("urls").notNull().$type<string[]>(),
  analyzedAt: timestamp("analyzed_at").notNull().defaultNow(),
});

export const insertAnalyzedMessageSchema = createInsertSchema(analyzedMessagesTable).omit({
  id: true,
  analyzedAt: true,
});

export type InsertAnalyzedMessage = z.infer<typeof insertAnalyzedMessageSchema>;
export type AnalyzedMessageRow = typeof analyzedMessagesTable.$inferSelect;
