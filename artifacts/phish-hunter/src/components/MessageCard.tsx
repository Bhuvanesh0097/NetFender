import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { Trash2, ChevronDown, Link as LinkIcon, ShieldAlert, AlertTriangle, ShieldCheck, Mail, MessageSquare } from "lucide-react";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import type { AnalyzedMessage } from "@workspace/api-client-react";

interface MessageCardProps {
  message: AnalyzedMessage;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}

export function MessageCard({ message, onDelete, isDeleting }: MessageCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getThemeConfig = () => {
    switch (message.label) {
      case "phishing":
        return {
          color: "text-danger",
          bg: "bg-danger/5",
          border: "border-danger/30",
          icon: ShieldAlert,
          glow: "shadow-[0_0_20px_var(--color-danger-glow)]",
          barColor: "bg-danger"
        };
      case "suspicious":
        return {
          color: "text-warning",
          bg: "bg-warning/5",
          border: "border-warning/30",
          icon: AlertTriangle,
          glow: "shadow-[0_0_15px_var(--color-warning-glow)]",
          barColor: "bg-warning"
        };
      case "safe":
        return {
          color: "text-safe",
          bg: "bg-safe/5",
          border: "border-safe/30",
          icon: ShieldCheck,
          glow: "",
          barColor: "bg-safe"
        };
    }
  };

  const theme = getThemeConfig();
  const Icon = theme.icon;
  const scorePercent = Math.round(message.riskScore * 100);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "glass-panel rounded-lg overflow-hidden transition-all duration-300 relative group",
        theme.border,
        theme.bg,
        expanded ? theme.glow : "hover:shadow-xl"
      )}
    >
      {/* Risk Score Top Bar */}
      <div className="h-1 w-full bg-white/5">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${scorePercent}%` }}
          transition={{ duration: 1, delay: 0.2 }}
          className={cn("h-full", theme.barColor)} 
        />
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-md border", theme.border, theme.bg)}>
              <Icon className={cn("w-5 h-5", theme.color)} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={message.label === 'phishing' ? 'destructive' : message.label === 'suspicious' ? 'warning' : 'safe'}>{message.label}</Badge>
                <Badge variant="outline" className="bg-background/50">
                  {message.type === 'email' ? <Mail className="w-3 h-3 mr-1" /> : <MessageSquare className="w-3 h-3 mr-1" />}
                  {message.type}
                </Badge>
                <span className="text-xs font-mono text-muted-foreground ml-2">
                  Risk: {scorePercent}%
                </span>
              </div>
              <div className="text-sm font-mono text-muted-foreground/80 flex items-center gap-2">
                {message.sender && <span className="text-white/80">{message.sender}</span>}
                {message.sender && <span>•</span>}
                <span>{format(new Date(message.analyzedAt), "MMM d, HH:mm:ss")}</span>
              </div>
            </div>
          </div>
          
          <button
            onClick={() => onDelete(message.id)}
            disabled={isDeleting}
            className="p-2 text-muted-foreground hover:text-danger hover:bg-danger/10 rounded-md transition-colors disabled:opacity-50"
            title="Delete record"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Subject line (for emails from mailbox) */}
        {(message as any).subject && (
          <div className="mb-3 px-3 py-2 bg-black/30 border border-white/5 rounded-md">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Subject</p>
            <p className="text-sm text-white/90 font-medium truncate">{(message as any).subject}</p>
          </div>
        )}

        {/* Content Preview */}
        <div className="mb-4">
          <div className="bg-black/40 border border-white/5 rounded-md p-3 font-mono text-sm text-white/90 whitespace-pre-wrap break-words max-h-[100px] overflow-hidden relative">
            {message.content}
            {!expanded && message.content.length > 150 && (
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/90 to-transparent" />
            )}
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 pt-2 pb-4 border-t border-white/5 mt-4">
                <div>
                  <h4 className="text-xs font-display text-primary uppercase tracking-wider mb-2">AI Analysis</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {message.explanation}
                  </p>
                </div>

                {message.signals.length > 0 && (
                  <div>
                    <h4 className="text-xs font-display text-primary uppercase tracking-wider mb-2">Detected Signals</h4>
                    <ul className="space-y-1">
                      {message.signals.map((signal, idx) => (
                        <li key={idx} className="text-sm text-white/80 flex items-start gap-2">
                          <span className={cn("mt-1 text-[10px]", theme.color)}>▶</span>
                          {signal}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {message.urls.length > 0 && (
                  <div>
                    <h4 className="text-xs font-display text-primary uppercase tracking-wider mb-2">Extracted URLs</h4>
                    <div className="flex flex-wrap gap-2">
                      {message.urls.map((url, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-black/50 border border-white/10 text-xs font-mono text-primary/80 break-all max-w-full">
                          <LinkIcon className="w-3 h-3 flex-shrink-0" />
                          {url}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-2 py-2 mt-2 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-white transition-colors border-t border-white/5"
        >
          {expanded ? "Collapse Details" : "Expand Details"}
          <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>
    </motion.div>
  );
}
