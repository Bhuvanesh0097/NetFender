import { ShieldAlert, AlertTriangle, ShieldCheck, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageStats } from "@workspace/api-client-react";

interface StatsBarProps {
  stats?: MessageStats;
  isLoading: boolean;
}

export function StatsBar({ stats, isLoading }: StatsBarProps) {
  const statCards = [
    {
      title: "Total Scanned",
      value: stats?.total ?? 0,
      icon: Activity,
      colorClass: "text-primary",
      bgClass: "bg-primary/10",
      borderClass: "border-primary/20",
    },
    {
      title: "Phishing Detected",
      value: stats?.phishing ?? 0,
      icon: ShieldAlert,
      colorClass: "text-danger",
      bgClass: "bg-danger/10",
      borderClass: "border-danger/20",
      glowClass: "shadow-[0_0_15px_var(--color-danger-glow)]",
    },
    {
      title: "Suspicious",
      value: stats?.suspicious ?? 0,
      icon: AlertTriangle,
      colorClass: "text-warning",
      bgClass: "bg-warning/10",
      borderClass: "border-warning/20",
    },
    {
      title: "Safe",
      value: stats?.safe ?? 0,
      icon: ShieldCheck,
      colorClass: "text-safe",
      bgClass: "bg-safe/10",
      borderClass: "border-safe/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((card, i) => (
        <div 
          key={i}
          className={cn(
            "glass-panel rounded-lg p-5 flex items-center gap-4 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden",
            card.borderClass,
            card.glowClass
          )}
        >
          {/* Subtle animated background gradient */}
          <div className={cn("absolute -inset-2 opacity-20 blur-xl", card.bgClass)} />
          
          <div className={cn("p-3 rounded-md relative z-10", card.bgClass, card.borderClass, "border")}>
            <card.icon className={cn("w-6 h-6", card.colorClass)} />
          </div>
          
          <div className="relative z-10">
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
              {card.title}
            </p>
            {isLoading ? (
              <div className="h-8 w-16 bg-white/5 animate-pulse rounded" />
            ) : (
              <h3 className="text-2xl font-bold font-display text-white">
                {card.value.toLocaleString()}
              </h3>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
