import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Inbox, Wifi, WifiOff, Play, ChevronDown, ChevronUp, Lock, Server, Mail, Loader2, CheckCircle2, AlertCircle, Shield } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMessagesQueryKey, getGetMessageStatsQueryKey } from "@workspace/api-client-react";

interface ScanProgress {
  phase: "idle" | "connecting" | "fetching" | "analyzing" | "complete" | "error";
  message: string;
  fetched?: number;
  analyzed?: number;
  total?: number;
  summary?: {
    total: number;
    phishing: number;
    suspicious: number;
    safe: number;
  };
  error?: string;
}

interface MailboxForm {
  email: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  folder: string;
  limit: number;
}

const PRESETS: Record<string, Partial<MailboxForm>> = {
  gmail: { host: "imap.gmail.com", port: 993, tls: true },
  outlook: { host: "outlook.office365.com", port: 993, tls: true },
  yahoo: { host: "imap.mail.yahoo.com", port: 993, tls: true },
  zoho: { host: "imap.zoho.com", port: 993, tls: true },
};

export function MailboxScanner({ onNewResults }: { onNewResults?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<MailboxForm>({
    email: "",
    password: "",
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    folder: "INBOX",
    limit: 50,
  });
  const [progress, setProgress] = useState<ScanProgress>({ phase: "idle", message: "" });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  const applyPreset = (name: string) => {
    const preset = PRESETS[name];
    if (preset) setForm(prev => ({ ...prev, ...preset }));
  };

  const handleTest = async () => {
    if (!form.email || !form.password || !form.host) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/mailbox/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ success: true, message: data.message });
      } else {
        setTestResult({ success: false, message: data.details || data.error || "Connection failed" });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e?.message || "Network error" });
    } finally {
      setTesting(false);
    }
  };

  const handleScan = () => {
    if (!form.email || !form.password || !form.host) return;

    if (sseRef.current) {
      sseRef.current.close();
    }

    setProgress({ phase: "connecting", message: "Connecting to mailbox..." });

    const body = JSON.stringify(form);

    fetch("/api/mailbox/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Scan failed" }));
        setProgress({ phase: "error", message: err.error || "Scan failed" });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processChunk = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) continue;
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.phase === "connecting") {
                  setProgress({ phase: "connecting", message: data.message });
                } else if (data.phase === "fetching") {
                  setProgress(prev => ({
                    ...prev,
                    phase: "fetching",
                    message: data.message || `Fetching emails...`,
                    fetched: data.fetched,
                    total: data.total,
                  }));
                } else if (data.phase === "analyzing") {
                  setProgress(prev => ({
                    ...prev,
                    phase: "analyzing",
                    message: `Analyzing emails with AI...`,
                    analyzed: data.analyzed,
                    total: data.total,
                  }));
                  if (data.message) {
                    queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getGetMessageStatsQueryKey() });
                    onNewResults?.();
                  }
                } else if (data.summary) {
                  setProgress({
                    phase: "complete",
                    message: `Scan complete! Analyzed ${data.summary.total} emails.`,
                    summary: data.summary,
                  });
                  queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetMessageStatsQueryKey() });
                  onNewResults?.();
                } else if (data.message && !data.phase) {
                  setProgress({ phase: "error", message: data.message });
                }
              } catch {}
            }
          }
        }
      };

      processChunk().catch(() => {
        setProgress({ phase: "error", message: "Connection to server lost during scan." });
      });
    }).catch((err) => {
      setProgress({ phase: "error", message: err?.message || "Network error" });
    });
  };

  const isScanning = progress.phase === "connecting" || progress.phase === "fetching" || progress.phase === "analyzing";
  const scanPct = progress.total ? Math.round(((progress.analyzed ?? progress.fetched ?? 0) / progress.total) * 100) : 0;

  return (
    <div className="glass-panel rounded-lg overflow-hidden border border-white/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-md border border-primary/20">
            <Inbox className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <h2 className="text-base font-display font-bold text-white">Connect Real Mailbox</h2>
            <p className="text-xs text-muted-foreground font-mono">Auto-scan your inbox via IMAP</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {progress.phase === "complete" && (
            <span className="text-xs font-mono text-safe flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Scan done
            </span>
          )}
          {isScanning && (
            <span className="text-xs font-mono text-primary flex items-center gap-1.5 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning...
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 border-t border-white/5 space-y-5">

              {/* Provider Presets */}
              <div>
                <label className="text-xs font-mono text-primary uppercase tracking-wider block mb-2">Quick Setup</label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(PRESETS).map(name => (
                    <button
                      key={name}
                      onClick={() => applyPreset(name)}
                      className="px-3 py-1.5 text-xs font-mono rounded border border-white/10 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all capitalize"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <Mail className="w-3 h-3" /> Email Address
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="you@gmail.com"
                    className="w-full bg-input border border-white/10 rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <Lock className="w-3 h-3" /> App Password
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Use an App Password for 2FA accounts"
                    className="w-full bg-input border border-white/10 rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <Server className="w-3 h-3" /> IMAP Host
                  </label>
                  <input
                    type="text"
                    value={form.host}
                    onChange={e => setForm(p => ({ ...p, host: e.target.value }))}
                    placeholder="imap.gmail.com"
                    className="w-full bg-input border border-white/10 rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-primary uppercase tracking-wider">Port</label>
                    <input
                      type="number"
                      value={form.port}
                      onChange={e => setForm(p => ({ ...p, port: Number(e.target.value) }))}
                      className="w-full bg-input border border-white/10 rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-primary uppercase tracking-wider">Scan Limit</label>
                    <input
                      type="number"
                      value={form.limit}
                      min={1}
                      max={500}
                      onChange={e => setForm(p => ({ ...p, limit: Number(e.target.value) }))}
                      className="w-full bg-input border border-white/10 rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="text-xs font-mono text-muted-foreground/70 bg-black/30 border border-white/5 rounded p-3 flex items-start gap-2">
                <Shield className="w-4 h-4 text-primary/60 flex-shrink-0 mt-0.5" />
                <span>For Gmail/Outlook with 2-step verification, use an <strong className="text-white/70">App Password</strong> (not your regular password). Enable it at your provider's security settings. Credentials are used only for the scan and never stored.</span>
              </div>

              {/* Test Result */}
              {testResult && (
                <div className={cn(
                  "flex items-center gap-2 text-sm font-mono px-3 py-2 rounded border",
                  testResult.success
                    ? "bg-safe/10 border-safe/20 text-safe"
                    : "bg-danger/10 border-danger/20 text-danger"
                )}>
                  {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {testResult.message}
                </div>
              )}

              {/* Progress Bar */}
              {progress.phase !== "idle" && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-mono text-muted-foreground">
                    <span className={cn(
                      progress.phase === "error" ? "text-danger" :
                      progress.phase === "complete" ? "text-safe" : "text-primary animate-pulse"
                    )}>{progress.message}</span>
                    {progress.total && progress.phase !== "complete" && (
                      <span>{progress.analyzed ?? progress.fetched ?? 0} / {progress.total}</span>
                    )}
                  </div>
                  {isScanning && progress.total && (
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        animate={{ width: `${scanPct}%` }}
                        className="h-full bg-primary rounded-full"
                        transition={{ ease: "easeOut" }}
                      />
                    </div>
                  )}
                  {progress.phase === "complete" && progress.summary && (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="bg-danger/10 border border-danger/20 rounded p-2 text-center">
                        <div className="text-lg font-bold text-danger">{progress.summary.phishing}</div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase">Phishing</div>
                      </div>
                      <div className="bg-warning/10 border border-warning/20 rounded p-2 text-center">
                        <div className="text-lg font-bold text-warning">{progress.summary.suspicious}</div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase">Suspicious</div>
                      </div>
                      <div className="bg-safe/10 border border-safe/20 rounded p-2 text-center">
                        <div className="text-lg font-bold text-safe">{progress.summary.safe}</div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase">Safe</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing || isScanning || !form.email || !form.password || !form.host}
                  className="font-mono border-white/20 text-muted-foreground hover:text-white hover:border-primary/40"
                >
                  {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wifi className="w-4 h-4 mr-2" />}
                  Test Connection
                </Button>
                <Button
                  onClick={handleScan}
                  disabled={isScanning || !form.email || !form.password || !form.host}
                  className="flex-1 font-mono"
                >
                  {isScanning ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning Inbox...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" /> Scan Inbox for Threats</>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
