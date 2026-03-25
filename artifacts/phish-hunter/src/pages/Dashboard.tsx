import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Filter, Trash2 } from "lucide-react";
import { StatsBar } from "@/components/StatsBar";
import { MessageCard } from "@/components/MessageCard";
import { MailboxScanner } from "@/components/MailboxScanner";
import { SMSThreatScanner } from "@/components/SMSThreatScanner";
import { Button } from "@/components/ui/button";
import { usePhishApi } from "@/hooks/use-phish-api";
import { cn } from "@/lib/utils";
import type { GetMessagesLabel, GetMessagesType } from "@workspace/api-client-react";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<GetMessagesLabel | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<GetMessagesType | 'all'>('all');
  
  const { useStats, useMessages, remove } = usePhishApi();
  
  const { data: stats, isLoading: statsLoading } = useStats();
  
  const { data: messagesData, isLoading: messagesLoading } = useMessages({
    label: activeTab === 'all' ? undefined : activeTab,
    type: typeFilter === 'all' ? undefined : typeFilter
  });

  const handleDelete = (id: number) => {
    remove.mutate({ id });
  };

  const handleClearAll = async () => {
    if (!messagesData?.messages.length || !window.confirm("Are you sure you want to delete all visible messages?")) return;
    Promise.all(messagesData.messages.map(m => remove.mutateAsync({ id: m.id })));
  };

  const tabs = [
    { id: 'all', label: 'All Traffic', count: stats?.total ?? 0, color: 'border-transparent' },
    { id: 'phishing', label: 'Phishing', count: stats?.phishing ?? 0, color: 'border-danger' },
    { id: 'suspicious', label: 'Suspicious', count: stats?.suspicious ?? 0, color: 'border-warning' },
    { id: 'safe', label: 'Safe', count: stats?.safe ?? 0, color: 'border-safe' },
  ] as const;

  return (
    <div className="min-h-screen bg-background relative selection:bg-primary/30 text-foreground overflow-x-hidden">
      {/* Cyber Background Setup */}
      <div 
        className="fixed inset-0 z-0 bg-[url('/images/cyber-grid.png')] bg-cover bg-center bg-no-repeat opacity-40 pointer-events-none"
        style={{ mixBlendMode: 'screen' }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-background/80 via-background to-background pointer-events-none" />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 relative z-10 space-y-8 max-w-7xl">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-12 h-12 bg-primary/10 rounded-xl border border-primary/30 shadow-[0_0_20px_rgba(0,229,255,0.2)]">
              <Shield className="w-6 h-6 text-primary" />
              <img src={`${import.meta.env.BASE_URL}images/radar-scan.png`} className="absolute inset-0 w-full h-full opacity-30 animate-spin" style={{ animationDuration: '4s'}} alt="" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold text-white tracking-wider">Phish<span className="text-primary">Hunter</span>.AI</h1>
              <p className="text-sm font-mono text-muted-foreground">Real-time threat intelligence dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            SYSTEM ONLINE
          </div>
        </header>

        {/* Stats Bar */}
        <StatsBar stats={stats} isLoading={statsLoading} />

        {/* Input Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MailboxScanner onNewResults={() => {}} />
          <SMSThreatScanner onNewResults={() => {}} />
        </div>

        {/* Filters & Tabs */}
        <div className="mt-12 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-panel/50 p-2 rounded-lg border border-white/5 backdrop-blur-md">
            
            <div className="flex flex-wrap items-center gap-1 w-full sm:w-auto">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "px-4 py-2 rounded-md text-sm font-display font-semibold tracking-wide transition-all duration-200 border-b-2",
                    activeTab === tab.id 
                      ? cn("bg-white/10 text-white", tab.color) 
                      : "text-muted-foreground border-transparent hover:bg-white/5 hover:text-white/80"
                  )}
                >
                  {tab.label} <span className="ml-2 px-1.5 py-0.5 rounded bg-black/50 text-[10px]">{tab.count}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center bg-black/40 rounded-md p-1 border border-white/10">
                <Filter className="w-4 h-4 text-muted-foreground ml-2 mr-1" />
                <select 
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as any)}
                  className="bg-transparent text-sm font-mono text-white/90 py-1 px-2 focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="all">All Sources</option>
                  <option value="email">Email Only</option>
                  <option value="sms">SMS Only</option>
                </select>
              </div>
              
              <Button variant="outline" size="sm" onClick={handleClearAll} disabled={!messagesData?.messages.length || remove.isPending} className="font-mono border-danger/30 hover:bg-danger/10 hover:text-danger text-muted-foreground">
                <Trash2 className="w-4 h-4 mr-2" />
                Clear View
              </Button>
            </div>
          </div>

          {/* Results Grid */}
          <div className="min-h-[400px]">
            {messagesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="glass-panel h-64 rounded-lg animate-pulse border border-white/5" />
                ))}
              </div>
            ) : messagesData?.messages.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/10 rounded-lg bg-panel/30"
              >
                <div className="w-20 h-20 bg-black/50 rounded-full flex items-center justify-center mb-4 border border-white/5">
                  <Shield className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <h3 className="text-xl font-display text-white/80 mb-2">No Threats Detected</h3>
                <p className="text-muted-foreground font-mono text-sm max-w-sm">
                  {activeTab !== 'all' || typeFilter !== 'all' 
                    ? "Try changing your filters to see more results." 
                    : "The database is clean. Connect your mailbox or phone above to begin analysis."}
                </p>
              </motion.div>
            ) : (
              <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <AnimatePresence>
                  {messagesData?.messages.map((msg) => (
                    <MessageCard 
                      key={msg.id} 
                      message={msg} 
                      onDelete={handleDelete}
                      isDeleting={remove.isPending && remove.variables?.id === msg.id}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
