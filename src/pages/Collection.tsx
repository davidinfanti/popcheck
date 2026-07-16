import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, BarChart3, Calendar, CheckCircle, Clock, Filter, Plus, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

type AuthenticationRow = Tables<"authentications">;
type StatusFilter = "all" | "completed" | "pending" | "attention";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function latestLabel(item: AuthenticationRow): { label: string; color: string; icon: typeof Clock } {
  if (isRecord(item.details) && item.details.phase1b === true && isRecord(item.details.decision)) {
    const title = typeof item.details.decision.userFacingTitle === "string"
      ? item.details.decision.userFacingTitle
      : "Phase 1B assessment";
    return { label: title, color: "text-primary", icon: CheckCircle };
  }
  if (typeof item.score === "number") {
    return { label: `Legacy V-STAMP ${item.score}/100 (uncalibrated)`, color: "text-warning", icon: AlertTriangle };
  }
  if (["failed", "evidence_required"].includes(item.status)) {
    return { label: item.status.replaceAll("_", " "), color: "text-warning", icon: AlertTriangle };
  }
  return { label: item.status === "completed" ? "Assessment history available" : "Analysis in progress", color: "text-muted-foreground", icon: Clock };
}

function matchesStatus(item: AuthenticationRow, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "completed") return item.status === "completed";
  if (filter === "pending") return item.status === "pending" || item.status === "analyzing";
  return item.status === "failed" || item.status === "evidence_required";
}

export default function Collection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AuthenticationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (!user) return;
    supabase.from("authentications").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => {
        setItems(data || []);
        setLoading(false);
      });
  }, [user]);

  const stats = useMemo(() => ({
    total: items.length,
    phase1b: items.filter((item) => isRecord(item.details) && item.details.phase1b === true).length,
    legacy: items.filter((item) => typeof item.score === "number").length,
    attention: items.filter((item) => ["failed", "evidence_required"].includes(item.status)).length,
  }), [items]);

  const filtered = useMemo(() => items.filter((item) => {
    const created = new Date(item.created_at);
    if (dateFrom && created < new Date(new Date(dateFrom).setHours(0, 0, 0, 0))) return false;
    if (dateTo && created > new Date(new Date(dateTo).setHours(23, 59, 59, 999))) return false;
    return matchesStatus(item, statusFilter);
  }), [items, dateFrom, dateTo, statusFilter]);

  return (
    <div className="min-h-screen bg-background">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-5 w-5" /></Button>
          <h2 className="font-display text-lg font-bold">My submissions</h2>
        </div>
        <Button size="sm" onClick={() => navigate("/upload")}><Plus className="mr-1 h-4 w-4" />New submission</Button>
      </nav>

      <main className="mx-auto max-w-4xl px-6 pb-20">
        {items.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Total" value={stats.total} />
            <Stat label="Phase 1B" value={stats.phase1b} />
            <Stat label="Legacy score rows" value={stats.legacy} />
            <Stat label="Needs attention" value={stats.attention} />
          </div>
        )}

        {items.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {(["all", "completed", "pending", "attention"] as const).map((filter) => (
              <Button key={filter} variant={statusFilter === filter ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(filter)} className="text-xs capitalize">
                {filter}
              </Button>
            ))}
            <DateFilter label="From" value={dateFrom} onChange={setDateFrom} />
            <DateFilter label="To" value={dateTo} onChange={setDateTo} />
            {(dateFrom || dateTo || statusFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setStatusFilter("all"); }}>
                <X className="mr-1 h-3 w-3" />Reset
              </Button>
            )}
            <span className="ml-auto text-xs font-mono text-muted-foreground">{filtered.length} / {items.length}</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><ScanLine className="h-8 w-8 animate-pulse text-primary" /></div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center">
            <ScanLine className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-sm text-muted-foreground">No submissions yet.</p>
            <Button onClick={() => navigate("/upload")}>Start your first assessment</Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((item, index) => {
              const info = latestLabel(item);
              const Icon = info.icon;
              return (
                <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                  <Card className="cursor-pointer border-border/50 transition-colors hover:border-primary/30" onClick={() => navigate(`/results/${item.id}`)}>
                    <CardContent className="flex gap-4 p-4">
                      {item.image_urls?.[0]
                        ? <img src={item.image_urls[0]} alt="Submitted evidence" className="h-14 w-14 rounded-lg border border-border object-cover" />
                        : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted"><ScanLine className="h-5 w-5 text-muted-foreground" /></div>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.pop_name || "Unidentified product"} {item.pop_number && `#${item.pop_number}`}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</p>
                        <div className="mt-2 flex items-start gap-1.5">
                          <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${info.color}`} />
                          <span className={`text-xs font-medium ${info.color}`}>{info.label}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <p className="mt-6 text-xs text-muted-foreground">
            Assessment history is append-only. Completed submissions cannot be deleted because prior runs must remain auditable.
          </p>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><span className="font-mono text-sm font-bold">{value}</span></div>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function DateFilter({ label, value, onChange }: { label: string; value?: Date; onChange: (date?: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("text-xs", value && "border-primary text-primary")}>
          <Calendar className="mr-1 h-3 w-3" />{value ? format(value, "dd MMM yyyy", { locale: enUS }) : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarPicker mode="single" selected={value} onSelect={onChange} initialFocus className="p-3" />
      </PopoverContent>
    </Popover>
  );
}
