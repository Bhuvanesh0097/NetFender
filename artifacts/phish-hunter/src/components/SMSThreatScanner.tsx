import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone,
  Wifi,
  Play,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Shield,
  ClipboardPaste,
  Upload,
  RefreshCcw,
  MessageSquare,
} from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMessagesQueryKey, getGetMessageStatsQueryKey } from "@workspace/api-client-react";
import { usePhishApi } from "@/hooks/use-phish-api";
import { useToast } from "@/hooks/use-toast";

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
}

interface ManualSms {
  id: string;
  content: string;
}

export function SMSThreatScanner({ onNewResults }: { onNewResults?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [smsLimit, setSmsLimit] = useState(50);
  const [progress, setProgress] = useState<ScanProgress>({ phase: "idle", message: "" });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [manualSmsQueue, setManualSmsQueue] = useState<ManualSms[]>([]);
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { analyze } = usePhishApi();
  const { toast } = useToast();

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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

  const handleReadFromPhone = () => {
    setProgress({ phase: "connecting", message: "Checking USB connection..." });

    fetch("/api/sms/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: smsLimit }),
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
                    message: data.message || "Reading SMS from phone...",
                    fetched: data.fetched,
                    total: data.total,
                  }));
                } else if (data.phase === "analyzing") {
                  setProgress(prev => ({
                    ...prev,
                    phase: "analyzing",
                    message: "Analyzing SMS with AI...",
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
                    message: `Scan complete! Analyzed ${data.summary.total} SMS messages.`,
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

  const handlePasteAdd = () => {
    if (!pasteText.trim()) return;
    const newItems: ManualSms[] = pasteText
      .split(/\n\s*\n/)
      .filter(s => s.trim().length > 0)
      .map(content => ({
        id: `${Date.now()}-${Math.random()}`,
        content: content.trim(),
      }));
    setManualSmsQueue(prev => [...prev, ...newItems]);
    setPasteText("");
    toast({ title: `${newItems.length} SMS added to queue` });
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const newItems: ManualSms[] = text
        .split(/\n\s*\n/)
        .filter(s => s.trim().length > 0)
        .map(content => ({
          id: `${Date.now()}-${Math.random()}`,
          content: content.trim(),
        }));
      setManualSmsQueue(prev => [...prev, ...newItems]);
      toast({ title: `${newItems.length} SMS imported from file` });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleClearQueue = () => {
    setManualSmsQueue([]);
  };

  const handleScanManual = () => {
    if (manualSmsQueue.length === 0) return;
    const messages = manualSmsQueue.map(sms => ({
      content: sms.content,
      type: "sms" as const,
      sender: undefined,
    }));

    analyze.mutate({ data: { messages } }, {
      onSuccess: (data) => {
        toast({
          title: "SMS Scan Complete",
          description: `Analyzed ${data.results.length} SMS message(s).`,
        });
        setManualSmsQueue([]);
        onNewResults?.();
      },
      onError: (error) => {
        toast({
          title: "Scan Failed",
          description: error.message || "Something went wrong during analysis.",
          variant: "destructive",
        });
      },
    });
  };

  const isScanning =
    progress.phase === "connecting" ||
    progress.phase === "fetching" ||
    progress.phase === "analyzing";
  const scanPct =
    progress.total
      ? Math.round(((progress.analyzed ?? progress.fetched ?? 0) / progress.total) * 100)
      : 0;

  return (
    <div className="glass-panel rounded-lg overflow-hidden border border-white/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-md border border-primary/20">
            <Smartphone className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <h2 className="text-base font-display font-bold text-white">SMS Threat Scanner</h2>
            <p className="text-xs text-muted-foreground font-mono">Connect phone via USB or paste SMS</p>
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
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
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

              {/* USB Connection Section */}
              <div>
                <label className="text-xs font-mono text-primary uppercase tracking-wider block mb-3">
                  Connect Phone via USB
                </label>
                <div className="text-xs font-mono text-muted-foreground/70 bg-black/30 border border-white/5 rounded p-3 flex items-start gap-2 mb-4">
                  <Smartphone className="w-4 h-4 text-primary/60 flex-shrink-0 mt-0.5" />
                  <span>
                    Connect your Android phone via <strong className="text-white/70">USB cable</strong> with{" "}
                    <strong className="text-white/70">USB Debugging</strong> enabled. No apps needed — SMS is read directly from your phone.
                  </span>
                </div>

                <div className="space-y-1.5 mb-4">
                  <label className="text-xs font-mono text-primary uppercase tracking-wider">SMS Limit</label>
                  <input
                    type="number"
                    value={smsLimit}
                    min={1}
                    max={500}
                    onChange={e => setSmsLimit(Number(e.target.value))}
                    className="w-full bg-input border border-white/10 rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 font-mono"
                  />
                </div>

                {testResult && (
                  <div
                    className={cn(
                      "flex items-center gap-2 text-sm font-mono px-3 py-2 rounded border mb-3",
                      testResult.success
                        ? "bg-safe/10 border-safe/20 text-safe"
                        : "bg-danger/10 border-danger/20 text-danger"
                    )}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    {testResult.message}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={testing || isScanning}
                    className="font-mono border-white/20 text-muted-foreground hover:text-white hover:border-primary/40"
                  >
                    {testing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Wifi className="w-4 h-4 mr-2" />
                    )}
                    Test Connection
                  </Button>
                  <Button
                    onClick={handleReadFromPhone}
                    disabled={isScanning}
                    className="flex-1 font-mono"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" /> Read SMS from Phone
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Progress */}
              {progress.phase !== "idle" && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-mono text-muted-foreground">
                    <span
                      className={cn(
                        progress.phase === "error"
                          ? "text-danger"
                          : progress.phase === "complete"
                          ? "text-safe"
                          : "text-primary animate-pulse"
                      )}
                    >
                      {progress.message}
                    </span>
                    {progress.total && progress.phase !== "complete" && (
                      <span>
                        {progress.analyzed ?? progress.fetched ?? 0} / {progress.total}
                      </span>
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

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-3 text-xs font-mono text-muted-foreground/60 uppercase tracking-widest">
                    or add manually
                  </span>
                </div>
              </div>

              {/* Manual Queue Status */}
              <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-md px-3 py-2">
                <span className="text-xs font-mono text-muted-foreground flex items-center gap-2">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      manualSmsQueue.length > 0 ? "bg-primary animate-pulse" : "bg-white/20"
                    )}
                  />
                  {manualSmsQueue.length > 0
                    ? `${manualSmsQueue.length} SMS in queue`
                    : "No SMS in queue"}
                </span>
                {manualSmsQueue.length > 0 && (
                  <button
                    onClick={handleClearQueue}
                    className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    <RefreshCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Paste area */}
              <div className="space-y-2">
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="Paste SMS text here... (separate multiple with blank line)"
                  className="w-full min-h-[80px] bg-input border border-white/10 rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 resize-none font-mono"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePasteAdd}
                  disabled={!pasteText.trim()}
                  className="font-mono border-white/20 text-muted-foreground hover:text-white hover:border-primary/40"
                >
                  <ClipboardPaste className="w-4 h-4 mr-2" />
                  Paste SMS
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-mono border-white/20 text-muted-foreground hover:text-white hover:border-primary/40"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import File
                </Button>
                <input
                  type="file"
                  accept=".txt,.csv"
                  ref={fileInputRef}
                  onChange={handleImportFile}
                  className="hidden"
                />
              </div>

              <Button
                onClick={handleScanManual}
                disabled={manualSmsQueue.length === 0 || analyze.isPending}
                className="w-full font-mono"
              >
                {analyze.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" /> Scan SMS for Threats
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
