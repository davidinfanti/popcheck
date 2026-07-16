import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, Home, ShieldAlert, ShieldCheck, ShieldQuestion, ScanLine, FileText, Eye, Flag, Download, RefreshCw, Loader2 } from "lucide-react";
import ComparisonSlider from "@/components/results/ComparisonSlider";
import { generateCertificatePDF } from "@/utils/generateCertificate";
import { getAnalysisSourceDisclosure, getSourceAwareVerdict } from "@/lib/analysisSourceDisclosure";

interface CategoryScores {
  typography: number;
  border: number;
  barcode: number;
  color: number;
}

interface AnomalyRegion {
  imageIndex: number;
  x: number;
  y: number;
  radius: number;
  label: string;
  severity: "critical" | "warning" | "info";
}

interface AnalysisDetails {
  summary: string;
  anomalies: string[];
  anomalyRegions?: AnomalyRegion[];
  perImage: { angle: string; notes: string }[];
  categoryScores?: CategoryScores;
  barcodeMatch?: string;
  eraDetected?: string;
  factoryCode?: string;
}

const CATEGORY_INFO = [
  { key: "typography" as const, label: "Typography & Logo", weight: "35%", letter: "T", description: "Halftone dots, font kerning, POP! logo, numbering" },
  { key: "border" as const, label: "Art & Border", weight: "25%", letter: "A", description: "White border offset, print quality, box construction" },
  { key: "barcode" as const, label: "Packaging & Serial", weight: "20%", letter: "P", description: "Social logos, manufacturer info, era consistency, serial codes" },
  { key: "color" as const, label: "Vision & Mold", weight: "20%", letter: "VM", description: "Color calibration, paint quality, figure mold details" },
];

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "hsl(var(--success))" : score >= 50 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  const circumference = 251.2;
  const filled = (score / 100) * circumference;

  return (
    <div className="relative w-48 h-48 mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
        <motion.circle
          cx="50" cy="50" r="40"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - filled }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      </svg>
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        <span className="font-mono text-4xl font-black" style={{ color }}>{score}</span>
        <span className="text-xs text-muted-foreground font-mono">/100</span>
      </motion.div>
    </div>
  );
}

function CategoryRow({ label, score, weight, letter, description, delay }: {
  label: string; score: number; weight: string; letter: string; description: string; delay: number;
}) {
  const color = score >= 70 ? "text-success" : score >= 40 ? "text-warning" : "text-destructive";
  const barColor = score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-destructive";

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-center gap-4 p-4 rounded-xl bg-secondary/30 border border-border/30"
    >
      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center font-mono font-black text-primary text-sm shrink-0">
        {letter}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold truncate">{label}</span>
          <span className={`font-mono text-sm font-bold ${color}`}>{score}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${barColor}`}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 1, ease: "easeOut", delay: delay + 0.2 }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">{description} • Weight: {weight}</p>
      </div>
    </motion.div>
  );
}

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [auth, setAuth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [releaseYear, setReleaseYear] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const shareToken = new URLSearchParams(window.location.search).get("t");
    const loader = async () => {
      let data: any = null;
      // Owner / admin path: direct select (RLS-scoped)
      if (user) {
        const { data: ownData } = await supabase
          .from("authentications")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        data = ownData;
      }
      // Guest / non-owner path: token-gated RPC
      if (!data && shareToken) {
        const { data: shared } = await supabase.rpc("get_shared_authentication", {
          p_id: id,
          p_token: shareToken,
        });
        data = Array.isArray(shared) ? shared[0] : shared;
      }
      setAuth(data);
      setLoading(false);

      // Look up reference image
      if (data?.pop_name || data?.pop_number) {
          let query = supabase.from("pop_reference_library").select("master_image_url, release_year");
          if (data.pop_number) query = query.eq("pop_number", data.pop_number.replace("#", ""));
          if (data.pop_name) query = query.ilike("name", `%${data.pop_name}%`);
          query.limit(1).then(({ data: refs }) => {
            if (refs?.[0]?.master_image_url) setReferenceImageUrl(refs[0].master_image_url);
            if (refs?.[0]?.release_year) setReleaseYear(String(refs[0].release_year));
          });
      }
    };
    loader();
  }, [id, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <ScanLine className="w-8 h-8 text-primary animate-pulse" />
          <span className="font-mono text-sm text-muted-foreground">Loading report...</span>
        </div>
      </div>
    );
  }

  if (!auth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background flex-col gap-4">
        <p className="text-muted-foreground">Analysis not found.</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  const score: number = auth.score ?? 0;
  const analysisSource: string | null = auth.analysis_source ?? null;
  const sourceDisclosure = getAnalysisSourceDisclosure(analysisSource);
  const details: AnalysisDetails = (auth.details as AnalysisDetails) || { summary: "", anomalies: [], perImage: [] };
  const categoryScores = details.categoryScores;

  const photoCount = (details as any).photoCount || auth.image_urls?.length || 0;
  const isPartial = photoCount < 6;

  const VerdictIcon = score >= 80 ? ShieldCheck : score >= 50 ? ShieldQuestion : ShieldAlert;
  const verdictLabel = getSourceAwareVerdict(score, analysisSource);
  const verdictColor = score >= 80 ? "text-success" : score >= 50 ? "text-warning" : "text-destructive";
  const glowClass = score >= 80 ? "glow-green" : score >= 50 ? "glow-amber" : "glow-red";

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-4 px-6 py-4 max-w-4xl mx-auto">
        <Button variant="ghost" size="icon" onClick={() => navigate("/collection")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg font-bold tracking-tight">V-STAMP Report</h2>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 pb-20 space-y-6">
        {/* Score card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${glowClass} border-border/50`}>
            <CardContent className="flex flex-col items-center py-10">
              <ScoreGauge score={score} />
              <div className="mt-6 flex items-center gap-3">
                <VerdictIcon className={`w-7 h-7 ${verdictColor}`} />
                <span className={`font-mono text-sm font-bold ${verdictColor} tracking-wider`}>
                  {verdictLabel}
                </span>
              </div>
              {isPartial && (
                <div className="mt-3 px-3 py-1.5 rounded-full bg-muted border border-border">
                  <span className="text-xs font-mono text-muted-foreground">
                    {"📸 Partial analysis (" + photoCount + "/6 photos)"}
                  </span>
                </div>
              )}
              {sourceDisclosure && (
                <div role="alert" className="mt-4 max-w-2xl rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-center">
                  <p className="text-sm font-semibold text-warning">Legacy listing-image assessment</p>
                  <p className="mt-1 text-xs text-muted-foreground">{sourceDisclosure}</p>
                </div>
              )}
              {(details as any).cacheHit && (
                <div className="mt-3 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30">
                  <span className="text-xs font-mono text-primary">⚡ INSTANT VERDICT · Pre-validated from Reference Library</span>
                </div>
              )}
              {auth.pop_name && (
                <p className="mt-3 text-muted-foreground font-mono text-sm">
                  {auth.pop_name} {auth.pop_number && `#${auth.pop_number}`}
                </p>
              )}
              {details.barcodeMatch === "mismatch" && (
                <div className="mt-3 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/30">
                  <span className="text-xs font-mono text-destructive">⚠ BARCODE MISMATCH — PENALTY APPLIED (−15)</span>
                </div>
              )}
              {details.barcodeMatch === "no_reference" && (
                <div className="mt-3 px-3 py-1.5 rounded-full bg-warning/10 border border-warning/30">
                  <span className="text-xs font-mono text-warning">⚠ BARCODE — Manual Verification Required</span>
                </div>
              )}
              {details.eraDetected && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">ERA: {details.eraDetected}</Badge>
                  {details.factoryCode && <Badge variant="outline" className="font-mono text-[10px]">FACTORY: {details.factoryCode}</Badge>}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Comparison Slider */}
        {referenceImageUrl && auth.image_urls?.[0] && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <ComparisonSlider
              userImageUrl={auth.image_urls[0]}
              referenceImageUrl={referenceImageUrl}
              popName={auth.pop_name}
            />
          </motion.div>
        )}

        {/* V-STAMP Breakdown */}
        {categoryScores && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="font-display text-lg tracking-tight flex items-center gap-2">
                  <ScanLine className="w-5 h-5 text-primary" />
                  V-STAMP Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {CATEGORY_INFO.map((cat, i) => {
                  const s = categoryScores[cat.key] ?? 0;
                  if (s < 0) return (
                    <div key={cat.key} className="flex items-center gap-4 p-4 rounded-xl bg-secondary/30 border border-border/30 opacity-50">
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center font-mono font-black text-muted-foreground text-sm shrink-0">{cat.letter}</div>
                      <div className="flex-1">
                        <span className="text-sm font-semibold">{cat.label}</span>
                        <p className="text-xs text-muted-foreground">Not evaluable — photo missing</p>
                      </div>
                    </div>
                  );
                  return (
                    <CategoryRow
                      key={cat.key}
                      label={cat.label}
                      score={s}
                      weight={cat.weight}
                      letter={cat.letter}
                      description={cat.description}
                      delay={0.2 + i * 0.1}
                    />
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Investigative Notes */}
        {details.summary && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-display text-lg tracking-tight">Investigative Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">{details.summary}</p>
            </CardContent>
          </Card>
        )}

        {/* Evidence */}
        {details.anomalies?.length > 0 && (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="font-display text-lg tracking-tight text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Red Flags Detected
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {details.anomalies.map((a, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.08 }}
                  className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/15"
                >
                  <span className="font-mono text-destructive text-xs mt-0.5">#{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-sm">{a}</span>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Per-image with anomaly overlays */}
        {details.perImage?.length > 0 && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-display text-lg tracking-tight flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                Per-Image Analysis
              </CardTitle>
              {(details.anomalyRegions?.length ?? 0) > 0 && (
                 <p className="text-xs text-muted-foreground">
                   🔴 Red circles indicate anomalous areas detected by the AI
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {details.perImage.map((item, i) => {
                const regions = details.anomalyRegions?.filter(r => r.imageIndex === i) || [];
                return (
                  <div key={i} className="flex gap-4 items-start p-3 rounded-lg bg-secondary/20">
                    {auth.image_urls?.[i] && (
                      <div className="relative w-32 h-32 shrink-0">
                        <img
                          src={auth.image_urls[i]}
                          alt={item.angle}
                          className="w-full h-full rounded-lg object-cover border border-border"
                        />
                        {/* Anomaly overlay circles */}
                        <svg
                          className="absolute inset-0 w-full h-full pointer-events-none"
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                        >
                          {regions.map((region, ri) => {
                            const strokeColor =
                              region.severity === "critical"
                                ? "hsl(var(--destructive))"
                                : region.severity === "warning"
                                ? "hsl(var(--warning))"
                                : "hsl(var(--primary))";
                            return (
                              <g key={ri}>
                                <circle
                                  cx={region.x}
                                  cy={region.y}
                                  r={region.radius}
                                  fill="none"
                                  stroke={strokeColor}
                                  strokeWidth="1.5"
                                  strokeDasharray="3 2"
                                  opacity="0.9"
                                />
                                <circle
                                  cx={region.x}
                                  cy={region.y}
                                  r={region.radius}
                                  fill={strokeColor}
                                  opacity="0.15"
                                />
                              </g>
                            );
                          })}
                        </svg>
                        {/* Anomaly labels */}
                        {regions.map((region, ri) => (
                          <div
                            key={ri}
                            className="absolute text-[8px] font-mono font-bold px-1 py-0.5 rounded whitespace-nowrap"
                            style={{
                              left: `${Math.min(region.x, 75)}%`,
                              top: `${Math.min(region.y + region.radius + 2, 90)}%`,
                              color: region.severity === "critical" ? "hsl(var(--destructive))" : region.severity === "warning" ? "hsl(var(--warning))" : "hsl(var(--primary))",
                              background: "hsl(var(--card) / 0.85)",
                            }}
                          >
                            {region.label}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-mono text-xs text-primary uppercase tracking-wider mb-1">{item.angle}</p>
                      <p className="text-sm text-muted-foreground">{item.notes}</p>
                      {regions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {regions.map((r, ri) => (
                            <Badge
                              key={ri}
                              variant="outline"
                              className={`text-[10px] font-mono ${
                                r.severity === "critical"
                                  ? "border-destructive/50 text-destructive"
                                  : r.severity === "warning"
                                  ? "border-warning/50 text-warning"
                                  : "border-primary/50 text-primary"
                              }`}
                            >
                              {r.severity === "critical" ? "🔴" : r.severity === "warning" ? "🟡" : "🔵"} {r.label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Flag Report - only for authenticated users */}
        {user && <FlagReportSection reportId={id!} />}
        {!user && (
          <Card className="border-border/50">
            <CardContent className="py-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Sign in to flag errors or access more features</span>
              <Button size="sm" onClick={() => navigate("/auth")}>Sign In</Button>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => {
              const shareToken = auth.share_token;
              const publicUrl = shareToken
                ? `${window.location.origin}/results/${id}?t=${shareToken}`
                : `${window.location.origin}/results/${id}`;
              const frontImg = auth.image_urls?.[0] || null;
              generateCertificatePDF({
                reportId: id!,
                popName: auth.pop_name,
                popNumber: auth.pop_number?.replace("#", "") || null,
                score,
                summary: details.summary || "",
                eraDetected: details.eraDetected,
                releaseYear,
                seriesLine: (details as any).seriesLine || null,
                date: new Date(auth.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
                publicUrl,
                frontImageUrl: frontImg,
                analysisSource,
              });
              toast.success(analysisSource === "listing_legacy" ? "Listing assessment PDF generated!" : "PDF Certificate generated!");
            }}
          >
            <Download className="w-4 h-4 mr-2" /> {analysisSource === "listing_legacy" ? "Download Listing Assessment PDF" : "Download PDF Certificate"}
          </Button>
        </div>
        {/* Re-analyze: only owner of an UNCERTAIN / FAKE scan can re-run */}
        {user && user.id === auth.user_id && score < 80 && auth.status === "completed" && (
          <ReanalyzeButton auth={auth} />
        )}
        <div className="flex gap-3">
          {user ? (
            <>
              <Button variant="outline" className="flex-1" onClick={() => navigate("/upload")}>
                New Analysis
              </Button>
              <Button className="flex-1" onClick={() => navigate("/collection")}>
                <Home className="w-4 h-4 mr-2" /> Collection
              </Button>
            </>
          ) : (
            <Button className="flex-1" onClick={() => navigate("/auth")}>
              Sign up to analyze your Pops
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

function FlagReportSection({ reportId }: { reportId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [trait, setTrait] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <Card className="border-success/30">
        <CardContent className="py-4 flex items-center gap-3">
          <Flag className="w-5 h-5 text-success" />
          <span className="text-sm text-success font-mono">Report submitted — thank you for your feedback!</span>
        </CardContent>
      </Card>
    );
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        className="w-full border-warning/30 text-warning hover:bg-warning/10"
        onClick={() => setOpen(true)}
      >
        <Flag className="w-4 h-4 mr-2" /> Report a possible AI error
      </Button>
    );
  }

  const submit = async () => {
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("expert_training").insert({
      report_id: reportId,
      user_id: user.id,
      user_comment: comment,
      detected_fake_trait: trait,
    });
    setSubmitting(false);
    if (error) { toast.error("Error submitting report"); return; }
    setSubmitted(true);
  };

  return (
    <Card className="border-warning/30">
      <CardHeader>
        <CardTitle className="text-sm font-mono flex items-center gap-2 text-warning">
          <Flag className="w-4 h-4" /> Report AI Error
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Describe why you think the verdict is incorrect..."
          className="bg-secondary/20 text-sm"
          rows={3}
        />
        <Textarea
          value={trait}
          onChange={(e) => setTrait(e.target.value)}
          placeholder="Specific trait detected (e.g. 'POP! logo without halftone', 'Border too uniform')"
          className="bg-secondary/20 text-sm"
          rows={2}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={submit} disabled={submitting || !comment}>
             {submitting ? "Submitting..." : "Submit Report"}
           </Button>
           <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReanalyzeButton({ auth }: { auth: any }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleReanalyze = async () => {
    if (!auth?.image_urls?.length) {
      toast.error("Original photos missing — cannot re-analyze.");
      return;
    }
    setBusy(true);
    try {
      const { data: newAuth, error: insertError } = await supabase
        .from("authentications")
        .insert({
          user_id: auth.user_id,
          image_urls: auth.image_urls,
          status: "analyzing",
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const { error: fnError } = await supabase.functions.invoke("analyze-funko", {
        body: { authenticationId: newAuth.id },
      });
      if (fnError) throw fnError;
      toast.success("Re-analysis complete!");
      navigate(`/results/${newAuth.id}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Re-analysis failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardContent className="py-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex items-start gap-3">
          <RefreshCw className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-warning">Not satisfied with this verdict?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Run a fresh forensic pass on the same photos. Results may vary as our AI evolves.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="border-warning/40 text-warning hover:bg-warning/10 shrink-0"
          onClick={handleReanalyze}
          disabled={busy}
        >
          {busy ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Re-analyzing...</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" /> Re-analyze</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
