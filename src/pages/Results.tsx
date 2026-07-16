import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, ArrowLeft, Clock3, Download, Eye, FileText, Flag,
  History, Home, Loader2, RefreshCw, ScanLine, ShieldAlert, ShieldCheck, ShieldQuestion,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import ComparisonSlider from "@/components/results/ComparisonSlider";
import { useAuth } from "@/hooks/useAuth";
import { getAnalysisSourceDisclosure } from "@/lib/analysisSourceDisclosure";
import type { CandidateIdentity, StructuredObservation } from "@/lib/assessment/contract";
import type { AssessmentDimensions, DecisionResult, VerdictClass } from "@/lib/assessment/decisionEngine";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { generateAssessmentReportPDF } from "@/utils/generateAssessmentReport";

type AuthenticationRow = Tables<"authentications">;
type AssessmentRunRow = Tables<"assessment_runs">;

const emptyIdentity: CandidateIdentity = {
  popName: null,
  popNumber: null,
  series: null,
  barcode: null,
  productionCode: null,
  factory: null,
  releaseYear: null,
  sticker: null,
  region: null,
  copyrightStamp: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runIdentity(run: AssessmentRunRow): CandidateIdentity {
  return isRecord(run.candidate_identity) ? run.candidate_identity as unknown as CandidateIdentity : emptyIdentity;
}

function runObservations(run: AssessmentRunRow): StructuredObservation[] {
  return Array.isArray(run.structured_observations)
    ? run.structured_observations as unknown as StructuredObservation[]
    : [];
}

function runDecision(run: AssessmentRunRow): DecisionResult | null {
  return run.run_kind === "phase_1b" && isRecord(run.verdict)
    ? run.verdict as unknown as DecisionResult
    : null;
}

function runDimensions(run: AssessmentRunRow): AssessmentDimensions | null {
  return run.run_kind === "phase_1b" && isRecord(run.dimensions)
    ? run.dimensions as unknown as AssessmentDimensions
    : null;
}

function legacyScore(run: AssessmentRunRow, authentication: AuthenticationRow): number | null {
  if (isRecord(run.verdict) && typeof run.verdict.legacyScore === "number") return run.verdict.legacyScore;
  return authentication.score;
}

function verdictTone(verdictClass?: VerdictClass): { icon: typeof ShieldQuestion; color: string; border: string } {
  if (verdictClass === "strong_counterfeit_indicators") return { icon: ShieldAlert, color: "text-destructive", border: "border-destructive/40" };
  if (verdictClass === "elevated_counterfeit_risk") return { icon: ShieldAlert, color: "text-warning", border: "border-warning/40" };
  if (verdictClass === "consistent_with_verified_references" || verdictClass === "no_material_anomaly_detected") {
    return { icon: ShieldCheck, color: "text-success", border: "border-success/40" };
  }
  return { icon: ShieldQuestion, color: "text-warning", border: "border-warning/40" };
}

function reliabilityTone(reliability?: string): string {
  if (reliability === "high") return "border-success/50 text-success bg-success/5";
  if (reliability === "medium") return "border-primary/50 text-primary bg-primary/5";
  if (reliability === "low") return "border-warning/50 text-warning bg-warning/5";
  return "border-border text-muted-foreground bg-muted/20";
}

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [authentication, setAuthentication] = useState<AuthenticationRow | null>(null);
  const [runs, setRuns] = useState<AssessmentRunRow[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const shareToken = new URLSearchParams(window.location.search).get("t");
    const load = async () => {
      let row: AuthenticationRow | null = null;
      if (user) {
        const { data } = await supabase.from("authentications").select("*").eq("id", id).maybeSingle();
        row = data;
      }
      if (!row && shareToken) {
        const { data } = await supabase.rpc("get_shared_authentication", { p_id: id, p_token: shareToken });
        row = (Array.isArray(data) ? data[0] : data) as AuthenticationRow | null;
      }

      let loadedRuns: AssessmentRunRow[] = [];
      if (row && user?.id === row.user_id) {
        const { data } = await supabase
          .from("assessment_runs")
          .select("*")
          .eq("authentication_id", row.id)
          .order("created_at", { ascending: false });
        loadedRuns = data || [];
      } else if (row && shareToken) {
        const { data } = await supabase.rpc("get_shared_assessment_runs", { p_id: row.id, p_token: shareToken });
        loadedRuns = data || [];
      }

      setAuthentication(row);
      setRuns(loadedRuns);
      setSelectedRunId(loadedRuns[0]?.id || null);
      setLoading(false);

      if (row?.pop_name || row?.pop_number) {
        let query = supabase.from("pop_reference_library").select("master_image_url");
        if (row.pop_number) query = query.eq("pop_number", row.pop_number.replace("#", ""));
        if (row.pop_name) query = query.ilike("name", `%${row.pop_name}%`);
        const { data } = await query.limit(1);
        if (data?.[0]?.master_image_url) setReferenceImageUrl(data[0].master_image_url);
      }
    };
    load();
  }, [id, user]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) || runs[0] || null,
    [runs, selectedRunId],
  );

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><ScanLine className="h-8 w-8 animate-pulse text-primary" /></div>;
  }
  if (!authentication) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">Assessment not found.</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  const decision = selectedRun ? runDecision(selectedRun) : null;
  const dimensions = selectedRun ? runDimensions(selectedRun) : null;
  const identity = selectedRun ? runIdentity(selectedRun) : emptyIdentity;
  const observations = selectedRun ? runObservations(selectedRun) : [];
  const disclosure = getAnalysisSourceDisclosure(selectedRun?.source || authentication.analysis_source);
  const tone = verdictTone(decision?.verdictClass);
  const VerdictIcon = tone.icon;
  const supporting = observations.filter((item) => item.findingType === "supporting_consistency" && item.observationStatus === "observed");
  const risks = observations.filter((item) => item.findingType === "risk_indicator" && item.observationStatus === "observed");
  const selectedIndex = selectedRun ? runs.findIndex((run) => run.id === selectedRun.id) : -1;
  const priorRun = selectedIndex >= 0 ? runs[selectedIndex + 1] || null : null;
  const priorDecision = priorRun ? runDecision(priorRun) : null;
  const priorDimensions = priorRun ? runDimensions(priorRun) : null;
  const runDifferences = priorRun ? [
    `Verdict: ${priorDecision?.verdictClass || "legacy"} -> ${decision?.verdictClass || "legacy"}`,
    `Reliability: ${priorDimensions?.assessmentReliability || "legacy"} -> ${dimensions?.assessmentReliability || "legacy"}`,
    `Evidence quality: ${priorDimensions?.evidenceQuality || "legacy"} -> ${dimensions?.evidenceQuality || "legacy"}`,
    `Structured observations: ${runObservations(priorRun).length} -> ${observations.length}`,
  ] : [];

  return (
    <div className="min-h-screen bg-background">
      <nav className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/collection")}><ArrowLeft className="h-5 w-5" /></Button>
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-bold tracking-tight">POPCHECK AI Assessment Report</h2>
      </nav>

      <main className="mx-auto max-w-4xl space-y-6 px-6 pb-20">
        {["failed", "evidence_required"].includes(authentication.status) && (
          <Card className="border-warning/50 bg-warning/5">
            <CardContent className="flex items-start gap-3 py-5">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
              <div>
                <p className="font-semibold">The latest analysis attempt did not produce a verdict.</p>
                <p className="mt-1 text-sm text-muted-foreground">Submission status: {authentication.status.replaceAll("_", " ")}. Any assessment shown below is an earlier immutable run.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!selectedRun && (
          <Card className="border-warning/40">
            <CardContent className="flex items-start gap-3 py-6">
              <Clock3 className="mt-0.5 h-5 w-5 text-warning" />
              <div>
                <p className="font-semibold">No completed assessment run is available.</p>
                <p className="mt-1 text-sm text-muted-foreground">Current submission status: {authentication.status}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedRun?.run_kind === "legacy" && (
          <Card className="border-warning/40 bg-warning/5">
            <CardHeader><CardTitle className="text-lg">Legacy V-STAMP score (uncalibrated historical data)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="font-mono text-2xl font-black text-warning">{legacyScore(selectedRun, authentication) ?? "Unavailable"}{legacyScore(selectedRun, authentication) != null ? "/100" : ""}</p>
              <p className="text-sm text-muted-foreground">This historical value is retained for compatibility only. It is not a calibrated probability and is not used by the Phase 1B decision engine.</p>
              <div className="flex flex-wrap gap-2 text-xs font-mono">
                <Badge variant="outline">Legacy engine: {selectedRun.decision_engine_version}</Badge>
                <Badge variant="outline">Legacy prompt: {selectedRun.prompt_version}</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {decision && dimensions && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <Card className={tone.border}>
              <CardContent className="py-8">
                <div className="flex items-start gap-4">
                  <VerdictIcon className={`mt-1 h-8 w-8 shrink-0 ${tone.color}`} />
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Final verdict</p>
                    <h1 className={`mt-1 font-display text-2xl font-bold ${tone.color}`}>{decision.userFacingTitle}</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{decision.explanation}</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <Dimension label="Assessment reliability" value={dimensions.assessmentReliability} className={reliabilityTone(dimensions.assessmentReliability)} />
                  <Dimension label="Evidence quality" value={dimensions.evidenceQuality} />
                  <Dimension label="Reference coverage" value={dimensions.referenceCoverage} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {disclosure && (
          <div role="alert" className="rounded-lg border border-warning/50 bg-warning/10 px-4 py-3">
            <p className="text-sm font-semibold text-warning">Legacy listing-image assessment</p>
            <p className="mt-1 text-xs text-muted-foreground">{disclosure}</p>
          </div>
        )}

        {selectedRun?.source === "physical_scan" && (
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            This AI-assisted assessment evaluates consistency with the evidence and references available to POPCHECK. It is not a legal or expert certificate of authenticity.
          </div>
        )}

        {selectedRun && (
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg">Candidate product identity</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <IdentityField label="Product" value={identity.popName} />
              <IdentityField label="Pop number" value={identity.popNumber} />
              <IdentityField label="Series" value={identity.series} />
              <IdentityField label="Barcode" value={identity.barcode} />
              <IdentityField label="Production code" value={identity.productionCode} />
              <IdentityField label="Factory" value={identity.factory} />
            </CardContent>
          </Card>
        )}

        {referenceImageUrl && authentication.image_urls?.[0] && (
          <ComparisonSlider userImageUrl={authentication.image_urls[0]} referenceImageUrl={referenceImageUrl} popName={identity.popName || authentication.pop_name} />
        )}

        {decision && dimensions && (
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg">Assessment dimensions</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Dimension label="Identity status" value={dimensions.identityStatus} />
              <Dimension label="Visual consistency" value={dimensions.visualConsistency} />
              <Dimension label="Code consistency" value={dimensions.codeConsistency} />
              <Dimension label="Counterfeit indicator strength" value={dimensions.counterfeitIndicatorStrength} />
            </CardContent>
          </Card>
        )}

        {decision && <ObservationSection title="Visible supporting evidence" icon={ShieldCheck} items={supporting} empty="No supporting consistency observation was recorded." tone="text-success" />}
        {decision && <ObservationSection title="Visible risk indicators" icon={AlertTriangle} items={risks} empty="No material visible risk indicator was recorded." tone="text-destructive" />}

        {decision && (
          <div className="grid gap-6 md:grid-cols-2">
            <TextList title="Limitations" items={decision.limitations} empty="No additional limitation was recorded." />
            <TextList title="Additional photos required" items={decision.missingEvidence} empty="No additional photograph was requested." />
          </div>
        )}

        {selectedRun && (
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg">Traceability</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-xs font-mono text-muted-foreground sm:grid-cols-2">
              <span>Model: {selectedRun.model}</span>
              <span>Prompt: {selectedRun.prompt_version}</span>
              <span>Decision engine: {selectedRun.decision_engine_version}</span>
              <span>Source: {selectedRun.source}</span>
            </CardContent>
          </Card>
        )}

        {runs.length > 0 && (
          <Card className="border-border/50">
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5 text-primary" />Assessment history</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {runs.map((run, index) => {
                const historyDecision = runDecision(run);
                const historyDimensions = runDimensions(run);
                return (
                  <button
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedRun?.id === run.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{run.run_kind === "legacy" ? "Legacy V-STAMP score" : historyDecision?.userFacingTitle || "Assessment run"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(run.created_at).toLocaleString()} | {run.prompt_version} | Reliability: {historyDimensions?.assessmentReliability || "legacy"}</p>
                      </div>
                      {index === 0 && <Badge>Latest</Badge>}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        {priorRun && (
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg">Run comparison</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">This selected run is compared with the immediately preceding immutable run. A difference does not rewrite or correct the earlier result.</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {runDifferences.map((difference) => <li key={difference}>- {difference}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}

        {user && <FlagReportSection reportId={authentication.id} />}

        {selectedRun && (
          <Button
            variant="outline"
            className="w-full border-primary/30 text-primary"
            onClick={() => {
              const publicUrl = authentication.share_token
                ? `${window.location.origin}/results/${authentication.id}?t=${authentication.share_token}`
                : `${window.location.origin}/results/${authentication.id}`;
              generateAssessmentReportPDF({
                reportId: authentication.id,
                runId: selectedRun.id,
                runKind: selectedRun.run_kind as "phase_1b" | "legacy",
                date: new Date(selectedRun.created_at).toLocaleDateString(),
                publicUrl,
                analysisSource: selectedRun.source,
                model: selectedRun.model,
                promptVersion: selectedRun.prompt_version,
                decisionEngineVersion: selectedRun.decision_engine_version,
                identity,
                dimensions: dimensions || undefined,
                decision: decision || undefined,
                observations,
                legacyScore: selectedRun.run_kind === "legacy" ? legacyScore(selectedRun, authentication) : null,
                frontImageUrl: authentication.image_urls?.[0] || null,
              });
              toast.success("AI assessment report generated.");
            }}
          >
            <Download className="mr-2 h-4 w-4" />Download AI Assessment Report
          </Button>
        )}

        {user?.id === authentication.user_id && authentication.image_urls?.length && (
          <ReanalyzeButton authenticationId={authentication.id} onComplete={() => window.location.reload()} />
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => navigate("/upload")}>New submission</Button>
          <Button className="flex-1" onClick={() => navigate("/collection")}><Home className="mr-2 h-4 w-4" />Collection</Button>
        </div>
      </main>
    </div>
  );
}

function Dimension({ label, value, className = "border-border bg-muted/20 text-foreground" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${className}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold">{value.replaceAll("_", " ")}</p>
    </div>
  );
}

function IdentityField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg bg-muted/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value || "Not visible / not identified"}</p>
    </div>
  );
}

function ObservationSection({ title, icon: Icon, items, empty, tone }: {
  title: string;
  icon: typeof Eye;
  items: StructuredObservation[];
  empty: string;
  tone: string;
}) {
  return (
    <Card className="border-border/50">
      <CardHeader><CardTitle className={`flex items-center gap-2 text-lg ${tone}`}><Icon className="h-5 w-5" />{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {!items.length && <p className="text-sm text-muted-foreground">{empty}</p>}
        {items.map((item, index) => (
          <div key={`${item.code}-${index}`} className="rounded-lg border border-border/50 bg-muted/10 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">{item.code}</Badge>
              <Badge variant="outline" className="text-[10px]">{item.severity}</Badge>
              <span className="text-[10px] text-muted-foreground">Confidence in observation: {item.confidenceLevel}</span>
            </div>
            <p className="mt-2 text-sm">{item.finding}</p>
            <p className="mt-1 text-xs text-muted-foreground">Image {item.imageIndex == null ? "not assigned" : item.imageIndex + 1} | {item.visibleRegion || "region not specified"} | Reference: {item.referenceReliability}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TextList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <Card className="border-border/50">
      <CardHeader><CardTitle className="text-lg">{title}</CardTitle></CardHeader>
      <CardContent>
        {!items.length ? <p className="text-sm text-muted-foreground">{empty}</p> : (
          <ul className="space-y-2 text-sm text-muted-foreground">{items.map((item, index) => <li key={index}>- {item}</li>)}</ul>
        )}
      </CardContent>
    </Card>
  );
}

function FlagReportSection({ reportId }: { reportId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return <Card className="border-success/30"><CardContent className="py-4 text-sm text-success">Report submitted. Thank you for your feedback.</CardContent></Card>;
  if (!open) return <Button variant="outline" className="w-full border-warning/30 text-warning" onClick={() => setOpen(true)}><Flag className="mr-2 h-4 w-4" />Report a possible AI error</Button>;

  const submit = async () => {
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("expert_training").insert({
      report_id: reportId,
      user_id: user.id,
      user_comment: comment,
    });
    setSubmitting(false);
    if (error) return toast.error("Error submitting report");
    setSubmitted(true);
  };

  return (
    <Card className="border-warning/30">
      <CardHeader><CardTitle className="text-sm">Report AI error</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Describe the observation or decision issue." rows={3} />
        <div className="flex gap-2">
          <Button size="sm" onClick={submit} disabled={submitting || !comment}>{submitting ? "Submitting..." : "Submit report"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReanalyzeButton({ authenticationId, onComplete }: { authenticationId: string; onComplete: () => void }) {
  const [busy, setBusy] = useState(false);
  const runAgain = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke("analyze-funko", { body: { authenticationId } });
    setBusy(false);
    if (error) return toast.error("New assessment version failed. Earlier runs were preserved.");
    toast.success("New assessment version appended. Earlier runs remain unchanged.");
    onComplete();
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold">Create a new assessment version</p>
            <p className="mt-1 text-xs text-muted-foreground">A new immutable run will be appended to this submission. It will not replace or correct earlier history.</p>
          </div>
        </div>
        <Button variant="outline" onClick={runAgain} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Append new run
        </Button>
      </CardContent>
    </Card>
  );
}
