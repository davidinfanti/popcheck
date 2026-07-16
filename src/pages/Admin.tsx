import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ShieldCheck, ShieldAlert, ArrowLeft, CheckCircle, XCircle,
  Settings, AlertTriangle, ScanLine, Loader2, Flag, BookOpen, ImagePlus, Trash2, Plus, Search, Users,
  ShieldX, BarChart3, Filter, X, Calendar as CalendarIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";

type ScanStatusFilter = "all" | "original" | "uncertain" | "fake";
const SCAN_STATUS_TABS: { key: ScanStatusFilter; label: string; icon: any; color: string }[] = [
  { key: "all", label: "All", icon: BarChart3, color: "text-foreground" },
  { key: "original", label: "Original", icon: ShieldCheck, color: "text-success" },
  { key: "uncertain", label: "Uncertain", icon: ShieldAlert, color: "text-warning" },
  { key: "fake", label: "Fake", icon: ShieldX, color: "text-destructive" },
];
const classifyScan = (score: number | null | undefined, status: string): ScanStatusFilter => {
  if (status === "analyzing" || status === "pending" || score == null) return "all";
  if (score >= 80) return "original";
  if (score >= 50) return "uncertain";
  return "fake";
};
function AdminStatCard({ label, value, icon: Icon, tone }: { label: string; value: number | string; icon: any; tone: string }) {
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

interface ScanItem {
  id: string;
  pop_name: string | null;
  pop_number: string | null;
  score: number | null;
  status: string;
  image_urls: string[] | null;
  created_at: string;
  user_id: string;
}

interface FlaggedItem {
  id: string;
  report_id: string;
  user_comment: string | null;
  detected_fake_trait: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  user_id: string;
  report?: ScanItem;
}

interface ForensicRule {
  id: string;
  category: string;
  description: string;
  severity: string;
  created_at: string;
}

interface OriginalRef {
  id: string;
  pop_number: string;
  part_type: string;
  image_url: string;
  expert_note: string | null;
  created_at: string;
}

interface FakeRef {
  id: string;
  pop_number: string;
  part_type: string;
  image_url: string;
  detected_flaw: string | null;
  created_at: string;
}

interface UserWithScans {
  user_id: string;
  display_name: string | null;
  created_at: string;
  scan_count: number;
}

type Tab = "feed" | "flagged" | "rules" | "references" | "users" | "settings";

const PART_TYPES = ["Front", "Back", "Bottom", "Logo_Detail", "Left_Side", "Right_Side", "Sticker", "Macro", "Other"];

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("feed");

  const [scans, setScans] = useState<ScanItem[]>([]);
  const [loadingScans, setLoadingScans] = useState(true);
  const [scanStatusFilter, setScanStatusFilter] = useState<ScanStatusFilter>("all");
  const [scanScoreRange, setScanScoreRange] = useState<[number, number]>([0, 100]);
  const [scanDateFrom, setScanDateFrom] = useState<Date | undefined>();
  const [scanDateTo, setScanDateTo] = useState<Date | undefined>();

  const [flags, setFlags] = useState<FlaggedItem[]>([]);
  const [loadingFlags, setLoadingFlags] = useState(true);
  const [selectedFlag, setSelectedFlag] = useState<FlaggedItem | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const [rules, setRules] = useState<ForensicRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [newRule, setNewRule] = useState({ category: "", description: "", severity: "warning" });

  const [originals, setOriginals] = useState<OriginalRef[]>([]);
  const [fakes, setFakes] = useState<FakeRef[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [refType, setRefType] = useState<"original" | "fake">("original");
  const [newRef, setNewRef] = useState({ pop_number: "", part_type: "Front", note: "" });
  const [uploadingRef, setUploadingRef] = useState(false);
  const [refFilter, setRefFilter] = useState("");
  const [expertDeltas, setExpertDeltas] = useState<Record<string, string>>({});
  const [savingDelta, setSavingDelta] = useState<string | null>(null);

  const [usersList, setUsersList] = useState<UserWithScans[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [systemInstructions, setSystemInstructions] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .then(({ data, error }) => {
        setIsAdmin(!error && !!data?.length);
      });
  }, [user, authLoading]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("authentications").select("*").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => { setScans((data as ScanItem[]) || []); setLoadingScans(false); });
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("expert_training").select("*").order("created_at", { ascending: false })
      .then(async ({ data }) => {
        if (!data) { setLoadingFlags(false); return; }
        const reportIds = [...new Set(data.map((d: any) => d.report_id))];
        const { data: reports } = await supabase.from("authentications").select("*").in("id", reportIds);
        const reportMap = new Map((reports || []).map((r: any) => [r.id, r]));
        setFlags(data.map((f: any) => ({ ...f, report: reportMap.get(f.report_id) })) as FlaggedItem[]);
        setLoadingFlags(false);
      });
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("internal_forensic_manual").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { setRules((data as ForensicRule[]) || []); setLoadingRules(false); });
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      supabase.from("original_references").select("*").order("created_at", { ascending: false }),
      supabase.from("fake_references").select("*").order("created_at", { ascending: false }),
    ]).then(([origRes, fakeRes]) => {
      setOriginals((origRes.data as OriginalRef[]) || []);
      setFakes((fakeRes.data as FakeRef[]) || []);
      setLoadingRefs(false);
    });
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, created_at");
      const { data: auths } = await supabase.from("authentications").select("user_id");
      const countMap = new Map<string, number>();
      (auths || []).forEach((a: any) => {
        countMap.set(a.user_id, (countMap.get(a.user_id) || 0) + 1);
      });
      const users: UserWithScans[] = (profiles || []).map((p: any) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        created_at: p.created_at,
        scan_count: countMap.get(p.user_id) || 0,
      }));
      users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setUsersList(users);
      setLoadingUsers(false);
    })();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("ai_settings").select("*").eq("key", "system_instructions_override").single()
      .then(({ data }) => { if (data) setSystemInstructions((data as any).value || ""); });
  }, [isAdmin]);

  const saveSettings = async () => {
    setSavingSettings(true);
    const { error } = await supabase
      .from("ai_settings")
      .update({ value: systemInstructions, updated_at: new Date().toISOString(), updated_by: user!.id })
      .eq("key", "system_instructions_override");
    setSavingSettings(false);
    if (error) { toast.error("Error saving settings"); return; }
    toast.success("System Instructions updated");
  };

  const validateFlag = async (flag: FlaggedItem, approved: boolean) => {
    const newStatus = approved ? "approved" : "rejected";
    const { error } = await supabase.from("expert_training").update({ status: newStatus, admin_notes: adminNotes }).eq("id", flag.id);
    if (error) { toast.error("Error"); return; }
    if (approved && flag.report) {
      await supabase.from("negative_references").insert({
        report_id: flag.report_id, training_id: flag.id,
        fake_trait: flag.detected_fake_trait || flag.user_comment || "Unknown",
        description: adminNotes || flag.user_comment,
        image_urls: flag.report.image_urls,
        pop_name: flag.report.pop_name, pop_number: flag.report.pop_number,
        created_by: user!.id,
      });
      toast.success("Report validated and added to Negative Reference Library");
    } else { toast.info("Report rejected"); }
    setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, status: newStatus } : f));
    setSelectedFlag(null);
    setAdminNotes("");
  };

  const addRule = async () => {
    if (!newRule.category || !newRule.description) { toast.error("Fill in all fields"); return; }
    const { data, error } = await supabase.from("internal_forensic_manual").insert({ ...newRule, created_by: user!.id }).select().single();
    if (error) { toast.error("Error"); return; }
    setRules(prev => [data as ForensicRule, ...prev]);
    setNewRule({ category: "", description: "", severity: "warning" });
    toast.success("Rule added");
  };

  const deleteRule = async (id: string) => {
    const { error } = await supabase.from("internal_forensic_manual").delete().eq("id", id);
    if (error) { toast.error("Error"); return; }
    setRules(prev => prev.filter(r => r.id !== id));
    toast.success("Rule deleted");
  };

  const handleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !newRef.pop_number) { toast.error("Enter the Pop number first"); return; }
    
    // File size check (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size: 5MB. Compress the image and try again.");
      e.target.value = "";
      return;
    }
    
    if (!file.type.startsWith("image/")) {
      toast.error("Invalid format. Upload images only (JPG, PNG, WebP)");
      e.target.value = "";
      return;
    }
    
    setUploadingRef(true);

    const ext = file.name.split(".").pop();
    const path = `references/${refType}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("reference-images").upload(path, file);
    if (uploadError) {
      const msg = uploadError.message?.toLowerCase() || "";
      if (msg.includes("too large") || msg.includes("size")) {
        toast.error("File too large for storage. Reduce the image size.");
      } else if (msg.includes("row-level security") || msg.includes("unauthorized")) {
        toast.error("Insufficient permissions. Verify you are logged in as admin.");
      } else if (msg.includes("network") || msg.includes("fetch")) {
        toast.error("Network error. Check your connection and try again.");
      } else {
        toast.error(`Upload failed: ${uploadError.message}`);
      }
      setUploadingRef(false);
      e.target.value = "";
      return;
    }

    const { data: urlData } = supabase.storage.from("reference-images").getPublicUrl(path);
    const table = refType === "original" ? "original_references" : "fake_references";

    const insertPayload = refType === "original"
      ? { pop_number: newRef.pop_number, part_type: newRef.part_type, expert_note: newRef.note || null, image_url: urlData.publicUrl }
      : { pop_number: newRef.pop_number, part_type: newRef.part_type, detected_flaw: newRef.note || null, image_url: urlData.publicUrl };

    const { data, error } = await supabase.from(table).insert(insertPayload).select().single();
    setUploadingRef(false);
    if (error) { toast.error(`Save error: ${error.message}`); e.target.value = ""; return; }

    if (refType === "original") {
      setOriginals(prev => [data as OriginalRef, ...prev]);
    } else {
      setFakes(prev => [data as FakeRef, ...prev]);
    }
    setNewRef({ pop_number: "", part_type: "Front", note: "" });
    toast.success(`${refType} reference added`);
    e.target.value = "";
  };

  const deleteRef = async (id: string, type: "original" | "fake") => {
    const table = type === "original" ? "original_references" : "fake_references";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { toast.error("Error"); return; }
    if (type === "original") setOriginals(prev => prev.filter(r => r.id !== id));
    else setFakes(prev => prev.filter(r => r.id !== id));
    toast.success("Reference deleted");
  };

  if (authLoading || isAdmin === null) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background flex-col gap-4">
        <ShieldAlert className="w-12 h-12 text-destructive" />
        <p className="text-muted-foreground font-mono">Access denied — Admins only</p>
        <Button variant="outline" onClick={() => navigate("/")}>Back to Home</Button>
      </div>
    );
  }

  const scoreColor = (s: number | null) =>
    s === null ? "text-muted-foreground" : s >= 80 ? "text-success" : s >= 50 ? "text-warning" : "text-destructive";

  // Filter references by pop_number
  const filterVal = refFilter.replace("#", "").toLowerCase();
  const filteredOriginals = filterVal ? originals.filter(r => r.pop_number.toLowerCase().includes(filterVal)) : originals;
  const filteredFakes = filterVal ? fakes.filter(r => r.pop_number.toLowerCase().includes(filterVal)) : fakes;

  const tabItems: { key: Tab; label: string }[] = [
    { key: "feed", label: "📡 Feed" },
    { key: "flagged", label: `🚩 Flagged (${flags.filter(f => f.status === "pending").length})` },
    { key: "rules", label: `📋 Rules (${rules.length})` },
    { key: "references", label: `🖼️ References (${originals.length + fakes.length})` },
    { key: "users", label: `👥 Users (${usersList.length})` },
    { key: "settings", label: "⚙️ Settings" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-4 px-6 py-4 max-w-6xl mx-auto border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h1 className="font-display text-lg font-bold tracking-tight">Admin Panel</h1>
        <div className="flex-1" />
        <div className="flex gap-1 flex-wrap">
          {tabItems.map((t) => (
            <Button key={t.key} variant={tab === t.key ? "default" : "ghost"} size="sm"
              onClick={() => { setTab(t.key); setSelectedFlag(null); }} className="font-mono text-xs">
              {t.label}
            </Button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* SCAN FEED */}
        {tab === "feed" && (
          <div className="space-y-3">
            <h2 className="font-display text-xl font-bold flex items-center gap-2 mb-4">
              <ScanLine className="w-5 h-5 text-primary" /> Live Scan Feed
            </h2>
            {/* Stats */}
            {scans.length > 0 && (() => {
              const scored = scans.filter((s) => typeof s.score === "number");
              const original = scored.filter((s) => (s.score as number) >= 80).length;
              const uncertain = scored.filter((s) => (s.score as number) >= 50 && (s.score as number) < 80).length;
              const fake = scored.filter((s) => (s.score as number) < 50).length;
              const avg = scored.length ? Math.round(scored.reduce((a, s) => a + (s.score as number), 0) / scored.length) : 0;
              return (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                  <AdminStatCard label="Total" value={scans.length} icon={BarChart3} tone="text-foreground" />
                  <AdminStatCard label="Original" value={original} icon={ShieldCheck} tone="text-success" />
                  <AdminStatCard label="Uncertain" value={uncertain} icon={ShieldAlert} tone="text-warning" />
                  <AdminStatCard label="Fake" value={fake} icon={ShieldX} tone="text-destructive" />
                  <AdminStatCard label="Avg V-STAMP" value={avg ? `${avg}/100` : "—"} icon={ScanLine} tone="text-primary" />
                </div>
              );
            })()}

            {/* Status tabs */}
            {scans.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3 p-1 rounded-lg bg-secondary/40 border border-border/50 w-fit">
                {SCAN_STATUS_TABS.map((t) => {
                  const Icon = t.icon;
                  const active = scanStatusFilter === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setScanStatusFilter(t.key)}
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

            {/* Filter bar */}
            {scans.length > 0 && (() => {
              const hasFilter = !!scanDateFrom || !!scanDateTo || scanStatusFilter !== "all" || scanScoreRange[0] > 0 || scanScoreRange[1] < 100;
              const filteredCount = scans.filter((s) => {
                const d = new Date(s.created_at);
                if (scanDateFrom && d < new Date(new Date(scanDateFrom).setHours(0, 0, 0, 0))) return false;
                if (scanDateTo && d > new Date(new Date(scanDateTo).setHours(23, 59, 59, 999))) return false;
                if (scanStatusFilter !== "all" && classifyScan(s.score, s.status) !== scanStatusFilter) return false;
                if (typeof s.score === "number") {
                  if (s.score < scanScoreRange[0] || s.score > scanScoreRange[1]) return false;
                } else if (scanScoreRange[0] > 0 || scanScoreRange[1] < 100) {
                  return false;
                }
                return true;
              }).length;
              return (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("text-xs gap-1.5", scanDateFrom && "border-primary text-primary")}>
                        <CalendarIcon className="w-3 h-3" />
                        {scanDateFrom ? format(scanDateFrom, "dd MMM yyyy", { locale: enUS }) : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker mode="single" selected={scanDateFrom} onSelect={setScanDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("text-xs gap-1.5", scanDateTo && "border-primary text-primary")}>
                        <CalendarIcon className="w-3 h-3" />
                        {scanDateTo ? format(scanDateTo, "dd MMM yyyy", { locale: enUS }) : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker mode="single" selected={scanDateTo} onSelect={setScanDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("text-xs gap-1.5", (scanScoreRange[0] > 0 || scanScoreRange[1] < 100) && "border-primary text-primary")}>
                        <BarChart3 className="w-3 h-3" />
                        Score {scanScoreRange[0]}-{scanScoreRange[1]}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-4" align="start">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-muted-foreground">V-STAMP range</span>
                          <span className="text-xs font-mono font-bold text-primary">{scanScoreRange[0]} – {scanScoreRange[1]}</span>
                        </div>
                        <Slider value={scanScoreRange} onValueChange={(v) => setScanScoreRange([v[0], v[1]] as [number, number])} min={0} max={100} step={5} />
                      </div>
                    </PopoverContent>
                  </Popover>
                  {hasFilter && (
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => {
                      setScanDateFrom(undefined); setScanDateTo(undefined); setScanStatusFilter("all"); setScanScoreRange([0, 100]);
                    }}>
                      <X className="w-3 h-3 mr-1" /> Reset
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto font-mono">{filteredCount} / {scans.length}</span>
                </div>
              );
            })()}

            {loadingScans ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : scans.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-10">No scans found</p>
            ) : (
              scans.filter((s) => {
                const d = new Date(s.created_at);
                if (scanDateFrom && d < new Date(new Date(scanDateFrom).setHours(0, 0, 0, 0))) return false;
                if (scanDateTo && d > new Date(new Date(scanDateTo).setHours(23, 59, 59, 999))) return false;
                if (scanStatusFilter !== "all" && classifyScan(s.score, s.status) !== scanStatusFilter) return false;
                if (typeof s.score === "number") {
                  if (s.score < scanScoreRange[0] || s.score > scanScoreRange[1]) return false;
                } else if (scanScoreRange[0] > 0 || scanScoreRange[1] < 100) {
                  return false;
                }
                return true;
              }).map((scan, i) => (
                <motion.div key={scan.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card className="border-border/30 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate(`/results/${scan.id}`)}>
                    <CardContent className="flex items-center gap-4 py-3 px-4">
                      {scan.image_urls?.[0] ? (
                        <img src={scan.image_urls[0]} alt="" className="w-12 h-12 rounded-lg object-cover border border-border shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-muted shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{scan.pop_name || "Unknown Pop"} {scan.pop_number && `#${scan.pop_number}`}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">{new Date(scan.created_at).toLocaleString("en-US")}</p>
                      </div>
                      <Badge variant="outline" className={`font-mono text-xs ${scoreColor(scan.score)}`}>
                        {scan.status === "completed" ? `${scan.score}/100` : scan.status}
                      </Badge>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </div>
        )}

        {/* FLAGGED */}
        {tab === "flagged" && !selectedFlag && (
          <div className="space-y-3">
            <h2 className="font-display text-xl font-bold flex items-center gap-2 mb-4">
              <Flag className="w-5 h-5 text-warning" /> Flagged for Review
            </h2>
            {loadingFlags ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : flags.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-10">No reports</p>
            ) : (
              flags.map((flag, i) => (
                <motion.div key={flag.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card className={`border-border/30 cursor-pointer transition-colors ${flag.status === "pending" ? "hover:border-warning/50" : "opacity-60"}`}
                    onClick={() => { setSelectedFlag(flag); setAdminNotes(flag.admin_notes || ""); }}>
                    <CardContent className="flex items-center gap-4 py-3 px-4">
                      {flag.report?.image_urls?.[0] ? (
                        <img src={flag.report.image_urls[0]} alt="" className="w-12 h-12 rounded-lg object-cover border border-border shrink-0" />
                      ) : <div className="w-12 h-12 rounded-lg bg-muted shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{flag.report?.pop_name || "Unknown"} {flag.report?.pop_number && `#${flag.report.pop_number}`}</p>
                        <p className="text-xs text-muted-foreground truncate">{flag.user_comment}</p>
                      </div>
                      <Badge variant="outline" className={`font-mono text-[10px] ${flag.status === "pending" ? "text-warning border-warning/50" : flag.status === "approved" ? "text-success border-success/50" : "text-destructive border-destructive/50"}`}>
                        {flag.status.toUpperCase()}
                      </Badge>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </div>
        )}

        {/* EXPERT REVIEW DETAIL */}
        {tab === "flagged" && selectedFlag && (
          <div className="space-y-6">
            <Button variant="ghost" size="sm" onClick={() => setSelectedFlag(null)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to list
            </Button>
            <Card className="border-warning/30">
              <CardHeader>
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                  Expert Review — {selectedFlag.report?.pop_name || "Unknown"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">Uploaded photos</p>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedFlag.report?.image_urls?.map((url, i) => (
                      <img key={i} src={url} alt={`Photo ${i + 1}`} className="rounded-lg border border-border object-cover aspect-square" />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-1 uppercase tracking-wider">User comment</p>
                  <p className="text-sm bg-secondary/30 p-3 rounded-lg border border-border/30">{selectedFlag.user_comment || "No comment"}</p>
                </div>
                {selectedFlag.detected_fake_trait && (
                  <div>
                    <p className="text-xs font-mono text-muted-foreground mb-1 uppercase tracking-wider">Detected fake trait</p>
                    <p className="text-sm bg-destructive/10 p-3 rounded-lg border border-destructive/20 text-destructive">{selectedFlag.detected_fake_trait}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-1 uppercase tracking-wider">Original AI verdict</p>
                  <div className="flex items-center gap-3 bg-secondary/30 p-3 rounded-lg border border-border/30">
                    <span className={`font-mono text-2xl font-black ${scoreColor(selectedFlag.report?.score ?? null)}`}>{selectedFlag.report?.score ?? "—"}</span>
                    <span className="text-sm text-muted-foreground">/100</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-1 uppercase tracking-wider">Admin notes</p>
                  <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Add notes..." className="bg-secondary/20" />
                </div>
                {selectedFlag.status === "pending" ? (
                  <div className="flex gap-3">
                    <Button className="flex-1" onClick={() => validateFlag(selectedFlag, true)}>
                      <CheckCircle className="w-4 h-4 mr-2" /> Validate
                    </Button>
                    <Button variant="outline" className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => validateFlag(selectedFlag, false)}>
                      <XCircle className="w-4 h-4 mr-2" /> Reject
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline" className="font-mono">Status: {selectedFlag.status.toUpperCase()}</Badge>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* EXPERT RULES */}
        {tab === "rules" && (
          <div className="space-y-6">
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" /> Expert Rules (Forensic Manual)
            </h2>
            <Card className="border-primary/20">
              <CardHeader><CardTitle className="text-sm font-mono">Add new rule</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input placeholder="Category (e.g. Typography)" value={newRule.category} onChange={(e) => setNewRule(p => ({ ...p, category: e.target.value }))} />
                  <Select value={newRule.severity} onValueChange={(v) => setNewRule(p => ({ ...p, severity: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">🔴 Critical</SelectItem>
                      <SelectItem value="warning">🟡 Warning</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={addRule}><Plus className="w-4 h-4 mr-2" /> Add</Button>
                </div>
                <Textarea placeholder="Technical description of the forensic rule..." value={newRule.description}
                  onChange={(e) => setNewRule(p => ({ ...p, description: e.target.value }))} rows={3} className="font-mono text-xs bg-secondary/20" />
              </CardContent>
            </Card>
            {loadingRules ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : rules.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-10">No rules configured</p>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <Card key={rule.id} className="border-border/30">
                    <CardContent className="flex items-start gap-4 py-3 px-4">
                      <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${rule.severity === "critical" ? "bg-destructive" : "bg-warning"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="font-mono text-[10px]">{rule.category}</Badge>
                          <Badge variant="outline" className={`font-mono text-[10px] ${rule.severity === "critical" ? "text-destructive border-destructive/50" : "text-warning border-warning/50"}`}>
                            {rule.severity.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{rule.description}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0 text-destructive/60 hover:text-destructive" onClick={() => deleteRule(rule.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* REFERENCE IMAGE LIBRARY */}
        {tab === "references" && (
          <div className="space-y-6">
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <ImagePlus className="w-5 h-5 text-primary" /> Reference Library Manager
            </h2>

            <Card className="border-primary/20">
              <CardHeader><CardTitle className="text-sm font-mono">Upload reference image</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button variant={refType === "original" ? "default" : "outline"} size="sm" onClick={() => setRefType("original")}>✅ Original</Button>
                  <Button variant={refType === "fake" ? "destructive" : "outline"} size="sm" onClick={() => setRefType("fake")}>❌ Fake</Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input placeholder="Pop Number (e.g. 163)" value={newRef.pop_number} onChange={(e) => setNewRef(p => ({ ...p, pop_number: e.target.value }))} />
                  <Select value={newRef.part_type} onValueChange={(v) => setNewRef(p => ({ ...p, part_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PART_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="relative">
                    <Input type="file" accept="image/*" onChange={handleRefUpload} disabled={uploadingRef || !newRef.pop_number} className="cursor-pointer" />
                    {uploadingRef && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />}
                  </div>
                </div>
                <Input placeholder={refType === "original" ? "Expert note (e.g. 'Correct logo, perfect font weight')" : "Detected flaw (e.g. 'Social logo without halftone')"}
                  value={newRef.note} onChange={(e) => setNewRef(p => ({ ...p, note: e.target.value }))} />
              </CardContent>
            </Card>

            {/* Filter */}
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Filter by Pop number..." value={refFilter} onChange={(e) => setRefFilter(e.target.value)} className="pl-9" />
            </div>

            {loadingRefs ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : filterVal ? (
              /* COMPARATIVE VIEW — side by side when filtering by pop number */
              <div className="space-y-4">
                <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
                  🔍 Comparative View — Pop #{filterVal} ({filteredOriginals.length} original, {filteredFakes.length} fake)
                </h3>
                {/* Group by part_type for side-by-side */}
                {(() => {
                  const allParts = [...new Set([...filteredOriginals.map(r => r.part_type), ...filteredFakes.map(r => r.part_type)])];
                  return allParts.map(part => {
                    const orig = filteredOriginals.filter(r => r.part_type === part);
                    const fake = filteredFakes.filter(r => r.part_type === part);
                    return (
                      <Card key={part} className="border-border/30">
                        <CardHeader className="py-3 px-4">
                          <CardTitle className="text-xs font-mono uppercase tracking-wider">{part}</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] font-mono text-success uppercase mb-2">✅ Original</p>
                              {orig.length === 0 ? (
                                <div className="aspect-square rounded-lg border border-dashed border-border/50 flex items-center justify-center">
                                  <p className="text-[10px] text-muted-foreground">None</p>
                                </div>
                              ) : orig.map(r => (
                                <div key={r.id} className="relative group">
                                  <img src={r.image_url} alt="" className="w-full aspect-square object-cover rounded-lg border border-success/30" />
                                  <Button variant="ghost" size="icon"
                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 text-destructive-foreground hover:bg-destructive h-6 w-6"
                                    onClick={() => deleteRef(r.id, "original")}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                  {r.expert_note && <p className="text-[10px] text-muted-foreground mt-1">{r.expert_note}</p>}
                                </div>
                              ))}
                            </div>
                            <div>
                              <p className="text-[10px] font-mono text-destructive uppercase mb-2">❌ Fake</p>
                              {fake.length === 0 ? (
                                <div className="aspect-square rounded-lg border border-dashed border-border/50 flex items-center justify-center">
                                  <p className="text-[10px] text-muted-foreground">None</p>
                                </div>
                              ) : fake.map(r => (
                                <div key={r.id} className="relative group">
                                  <img src={r.image_url} alt="" className="w-full aspect-square object-cover rounded-lg border border-destructive/30" />
                                  <Button variant="ghost" size="icon"
                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 text-destructive-foreground hover:bg-destructive h-6 w-6"
                                    onClick={() => deleteRef(r.id, "fake")}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                  {r.detected_flaw && <p className="text-[10px] text-destructive/70 mt-1">{r.detected_flaw}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Expert Delta editable field */}
                          {(orig.length > 0 || fake.length > 0) && (
                            <div className="mt-3 p-3 bg-secondary/20 rounded-lg border border-border/30 space-y-2">
                              <p className="text-[10px] font-mono text-primary uppercase tracking-wider flex items-center gap-1">🔬 Expert Delta</p>
                              <Textarea
                                placeholder="Describe the microscopic differences (e.g. 'Font curvature in the fake is 2px narrower, halftone pattern is absent in the POP! logo')"
                                value={expertDeltas[`${filterVal}-${part}`] ?? (
                                  [orig[0]?.expert_note, fake[0]?.detected_flaw].filter(Boolean).join(" ↔ ")
                                )}
                                onChange={(e) => setExpertDeltas(prev => ({ ...prev, [`${filterVal}-${part}`]: e.target.value }))}
                                rows={2}
                                className="font-mono text-[11px] bg-background/50 resize-none"
                              />
                              <Button size="sm" variant="outline" className="text-[10px] h-7"
                                disabled={savingDelta === `${filterVal}-${part}`}
                                onClick={async () => {
                                  const deltaKey = `${filterVal}-${part}`;
                                  const deltaText = expertDeltas[deltaKey] || "";
                                  setSavingDelta(deltaKey);
                                  // Save to the original ref's expert_note if exists, otherwise to fake's detected_flaw
                                  if (orig.length > 0) {
                                    await supabase.from("original_references").update({ expert_note: deltaText }).eq("id", orig[0].id);
                                    setOriginals(prev => prev.map(r => r.id === orig[0].id ? { ...r, expert_note: deltaText } : r));
                                  }
                                  if (fake.length > 0) {
                                    await supabase.from("fake_references").update({ detected_flaw: deltaText }).eq("id", fake[0].id);
                                    setFakes(prev => prev.map(r => r.id === fake[0].id ? { ...r, detected_flaw: deltaText } : r));
                                  }
                                  setSavingDelta(null);
                                  toast.success("Expert Delta saved");
                                }}>
                                {savingDelta === `${filterVal}-${part}` ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                Save Delta
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  });
                })()}
              </div>
            ) : (
              <>
                {/* Originals */}
                <div>
                  <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-3">✅ Originals ({filteredOriginals.length})</h3>
                  {filteredOriginals.length === 0 ? (
                    <p className="text-muted-foreground text-xs text-center py-6">No original references</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {filteredOriginals.map((ref) => (
                        <Card key={ref.id} className="border-border/30 overflow-hidden group">
                          <div className="relative aspect-square">
                            <img src={ref.image_url} alt="" className="w-full h-full object-cover" />
                            <Button variant="ghost" size="icon"
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 text-destructive-foreground hover:bg-destructive h-7 w-7"
                              onClick={() => deleteRef(ref.id, "original")}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                          <CardContent className="p-2">
                            <p className="text-xs font-mono font-bold">#{ref.pop_number}</p>
                            <p className="text-[10px] text-muted-foreground">{ref.part_type}</p>
                            {ref.expert_note && <p className="text-[10px] text-muted-foreground/70 truncate">{ref.expert_note}</p>}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fakes */}
                <div>
                  <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-3">❌ Fake ({filteredFakes.length})</h3>
                  {filteredFakes.length === 0 ? (
                    <p className="text-muted-foreground text-xs text-center py-6">No fake references</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {filteredFakes.map((ref) => (
                        <Card key={ref.id} className="border-destructive/20 overflow-hidden group">
                          <div className="relative aspect-square">
                            <img src={ref.image_url} alt="" className="w-full h-full object-cover" />
                            <Button variant="ghost" size="icon"
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 text-destructive-foreground hover:bg-destructive h-7 w-7"
                              onClick={() => deleteRef(ref.id, "fake")}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                            <Badge className="absolute bottom-1 left-1 bg-destructive/90 text-destructive-foreground text-[9px]">FAKE</Badge>
                          </div>
                          <CardContent className="p-2">
                            <p className="text-xs font-mono font-bold">#{ref.pop_number}</p>
                            <p className="text-[10px] text-muted-foreground">{ref.part_type}</p>
                            {ref.detected_flaw && <p className="text-[10px] text-destructive/70 truncate">{ref.detected_flaw}</p>}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* USERS */}
        {tab === "users" && (
          <div className="space-y-4">
            <h2 className="font-display text-xl font-bold flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-primary" /> Registered Users
            </h2>
            {loadingUsers ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : usersList.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-10">No users found</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <Card className="border-border/30">
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{usersList.length}</p>
                      <p className="text-xs text-muted-foreground">Total Users</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/30">
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{usersList.reduce((sum, u) => sum + u.scan_count, 0)}</p>
                      <p className="text-xs text-muted-foreground">Total Scans</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/30">
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{usersList.filter(u => u.scan_count > 0).length}</p>
                      <p className="text-xs text-muted-foreground">Active Users</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/30">
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-primary">
                        {usersList.length > 0 ? (usersList.reduce((sum, u) => sum + u.scan_count, 0) / usersList.length).toFixed(1) : "0"}
                      </p>
                      <p className="text-xs text-muted-foreground">Avg Scans/User</p>
                    </CardContent>
                  </Card>
                </div>
                <Card className="border-border/30">
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left p-3 font-mono text-xs text-muted-foreground">User</th>
                          <th className="text-left p-3 font-mono text-xs text-muted-foreground">User ID</th>
                          <th className="text-center p-3 font-mono text-xs text-muted-foreground">Scans</th>
                          <th className="text-right p-3 font-mono text-xs text-muted-foreground">Registered</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersList.map((u) => (
                          <tr key={u.user_id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                            <td className="p-3 font-semibold">{u.display_name || "—"}</td>
                            <td className="p-3 font-mono text-xs text-muted-foreground">{u.user_id.slice(0, 8)}…</td>
                            <td className="p-3 text-center">
                              <Badge variant="outline" className="font-mono">{u.scan_count}</Badge>
                            </td>
                            <td className="p-3 text-right text-xs text-muted-foreground font-mono">
                              {new Date(u.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <div className="space-y-6">
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" /> Global AI Settings
            </h2>
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-mono">System Instructions Override</CardTitle>
                <p className="text-xs text-muted-foreground">Instructions entered here are appended to the Gemini system prompt for every analysis.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea value={systemInstructions} onChange={(e) => setSystemInstructions(e.target.value)}
                  placeholder="E.g.: Be stricter on white borders for post-2022 Pops." rows={10} className="font-mono text-xs bg-secondary/20" />
                <Button onClick={saveSettings} disabled={savingSettings}>
                  {savingSettings ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Settings className="w-4 h-4 mr-2" />}
                  Save Instructions
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
