import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Plus, CheckCircle, AlertTriangle, XCircle, Clock, ScanLine,
  Trash2, Calendar, Filter, X, ShieldCheck, ShieldAlert, ShieldX, BarChart3
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "original" | "uncertain" | "fake";

const STATUS_TABS: { key: StatusFilter; label: string; icon: any; color: string }[] = [
  { key: "all", label: "All", icon: BarChart3, color: "text-foreground" },
  { key: "original", label: "Original", icon: ShieldCheck, color: "text-success" },
  { key: "uncertain", label: "Uncertain", icon: ShieldAlert, color: "text-warning" },
  { key: "fake", label: "Fake", icon: ShieldX, color: "text-destructive" },
];

const classify = (score: number | null | undefined, status: string): StatusFilter => {
  if (status === "analyzing" || status === "pending" || score == null) return "all";
  if (score >= 80) return "original";
  if (score >= 50) return "uncertain";
  return "fake";
};

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number | string; icon: any; tone: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2.5 flex items-center gap-2.5">
      <Icon className={cn("w-4 h-4 shrink-0", tone)} />
      <div className="min-w-0">
        <div className={cn("text-sm font-mono font-bold leading-tight", tone)}>{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</div>
      </div>
    </div>
  );
}

export default function Collection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("authentications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setItems(data || []);
        setLoading(false);
      });
  }, [user]);

  const stats = useMemo(() => {
    const scored = items.filter((i) => typeof i.score === "number");
    const original = scored.filter((i) => i.score >= 80).length;
    const uncertain = scored.filter((i) => i.score >= 50 && i.score < 80).length;
    const fake = scored.filter((i) => i.score < 50).length;
    const avg = scored.length ? Math.round(scored.reduce((a, i) => a + i.score, 0) / scored.length) : 0;
    return { total: items.length, original, uncertain, fake, avg };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const d = new Date(item.created_at);
      if (dateFrom && d < new Date(dateFrom.setHours(0, 0, 0, 0))) return false;
      if (dateTo && d > new Date(new Date(dateTo).setHours(23, 59, 59, 999))) return false;
      if (statusFilter !== "all") {
        if (classify(item.score, item.status) !== statusFilter) return false;
      }
      if (typeof item.score === "number") {
        if (item.score < scoreRange[0] || item.score > scoreRange[1]) return false;
      } else if (scoreRange[0] > 0 || scoreRange[1] < 100) {
        return false;
      }
      return true;
    });
  }, [items, dateFrom, dateTo, statusFilter, scoreRange]);

  const hasFilter = !!dateFrom || !!dateTo || statusFilter !== "all" || scoreRange[0] > 0 || scoreRange[1] < 100;

  const resetFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setStatusFilter("all");
    setScoreRange([0, 100]);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const { error } = await supabase.from("authentications").delete().eq("id", deleteId);
    if (error) {
      toast.error("Failed to delete.");
    } else {
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
      toast.success("Analysis deleted.");
    }
    setDeleting(false);
    setDeleteId(null);
  };

  const getScoreInfo = (score: number | null, status: string) => {
    if (status === "analyzing" || status === "pending") return { icon: Clock, color: "text-muted-foreground", label: "Analyzing...", glow: "" };
    if (!score) return { icon: Clock, color: "text-muted-foreground", label: "N/A", glow: "" };
    if (score >= 80) return { icon: CheckCircle, color: "text-success", label: `${score}/100`, glow: "border-success/30" };
    if (score >= 50) return { icon: AlertTriangle, color: "text-warning", label: `${score}/100`, glow: "border-warning/30" };
    return { icon: XCircle, color: "text-destructive", label: `${score}/100`, glow: "border-destructive/30" };
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between px-6 py-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="font-display text-lg font-bold tracking-tight">My Collection</h2>
        </div>
        <Button size="sm" onClick={() => navigate("/upload")}>
          <Plus className="w-4 h-4 mr-1" /> New Scan
        </Button>
      </nav>

      <main className="max-w-4xl mx-auto px-6 pb-20">
        {/* Analytics Stats */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            <StatCard label="Total" value={stats.total} icon={BarChart3} tone="text-foreground" />
            <StatCard label="Original" value={stats.original} icon={ShieldCheck} tone="text-success" />
            <StatCard label="Uncertain" value={stats.uncertain} icon={ShieldAlert} tone="text-warning" />
            <StatCard label="Fake" value={stats.fake} icon={ShieldX} tone="text-destructive" />
            <StatCard label="Avg V-STAMP" value={stats.avg ? `${stats.avg}/100` : "—"} icon={ScanLine} tone="text-primary" />
          </div>
        )}

        {/* Status Tabs */}
        {items.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 p-1 rounded-lg bg-secondary/40 border border-border/50 w-fit">
            {STATUS_TABS.map((t) => {
              const Icon = t.icon;
              const active = statusFilter === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setStatusFilter(t.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-all",
                    active ? "bg-background border border-border shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5", active && t.color)} />
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Date Filter Bar */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("text-xs gap-1.5", dateFrom && "border-primary text-primary")}>
                  <Calendar className="w-3 h-3" />
                  {dateFrom ? format(dateFrom, "dd MMM yyyy", { locale: enUS }) : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("text-xs gap-1.5", dateTo && "border-primary text-primary")}>
                  <Calendar className="w-3 h-3" />
                  {dateTo ? format(dateTo, "dd MMM yyyy", { locale: enUS }) : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "text-xs gap-1.5",
                    (scoreRange[0] > 0 || scoreRange[1] < 100) && "border-primary text-primary"
                  )}
                >
                  <BarChart3 className="w-3 h-3" />
                  Score {scoreRange[0]}-{scoreRange[1]}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4" align="start">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">V-STAMP range</span>
                    <span className="text-xs font-mono font-bold text-primary">
                      {scoreRange[0]} – {scoreRange[1]}
                    </span>
                  </div>
                  <Slider
                    value={scoreRange}
                    onValueChange={(v) => setScoreRange([v[0], v[1]] as [number, number])}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>
              </PopoverContent>
            </Popover>
            {hasFilter && (
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={resetFilters}>
                <X className="w-3 h-3 mr-1" /> Reset
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto font-mono">
              {filteredItems.length} / {items.length}
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <ScanLine className="w-8 h-8 text-primary animate-pulse" />
            <span className="font-mono text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <ScanLine className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4 font-mono text-sm">No authentications yet</p>
            <Button onClick={() => navigate("/upload")}>Start Your First Scan</Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <AnimatePresence>
              {filteredItems.map((item, i) => {
                const info = getScoreInfo(item.score, item.status);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: i * 0.03 }}
                    layout
                  >
                    <Card
                      className={`group cursor-pointer hover:border-primary/30 transition-all border-border/50 ${info.glow}`}
                      onClick={() => navigate(`/results/${item.id}`)}
                    >
                      <CardContent className="flex gap-4 p-4">
                        {item.image_urls?.[0] ? (
                          <img src={item.image_urls[0]} alt="Pop" className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border" />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            <ScanLine className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {item.pop_name || "Unknown Pop"} {item.pop_number && `#${item.pop_number}`}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {new Date(item.created_at).toLocaleDateString("en-US")}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <info.icon className={`w-3.5 h-3.5 ${info.color}`} />
                            <span className={`text-xs font-mono font-bold ${info.color}`}>{info.label}</span>
                          </div>
                        </div>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity self-center p-2 rounded-lg hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); }}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              This analysis and all associated data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}