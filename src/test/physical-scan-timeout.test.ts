import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("physical-scan timeout boundaries", () => {
  const edge = file("supabase/functions/analyze-funko/index.ts");
  const provider = file("supabase/functions/_shared/gemini-provider.ts");
  const evidence = file("supabase/functions/_shared/evidence-source.ts");
  const upload = file("src/pages/Upload.tsx");

  it("keeps evidence and Gemini deadlines independent inside a 90-second application deadline", () => {
    expect(provider).toContain("EVIDENCE_PREPARATION_TIMEOUT_MS = 20_000");
    expect(provider).toContain("GEMINI_TOTAL_TIMEOUT_MS = 60_000");
    expect(provider).toContain("OVERALL_ANALYSIS_TIMEOUT_MS = 90_000");
    expect(edge).toContain("prepareGeminiEvidence(fetch, providerImageUrls, evidenceDeadline.signal)");
    expect(edge).toContain("createDeadline(overallController.signal, Math.min(GEMINI_TOTAL_TIMEOUT_MS, remainingOverallMs))");
  });

  it("does not dispatch Gemini after an evidence timeout and completes only after strict validation", () => {
    const preparation = edge.indexOf("prepareGeminiEvidence(fetch, providerImageUrls, evidenceDeadline.signal)");
    const providerDispatch = edge.indexOf("dispatchGeminiAnalysisWithResilience(fetch, apiKey");
    const completion = edge.indexOf('"complete_phase_1b_assessment"');
    expect(preparation).toBeGreaterThan(-1);
    expect(providerDispatch).toBeGreaterThan(preparation);
    expect(completion).toBeGreaterThan(providerDispatch);
    expect(edge).toContain('"EVIDENCE_FETCH_TIMEOUT"');
    expect(edge).toContain('"EVIDENCE_PREPARATION_TIMEOUT"');
    expect(edge).toContain('"PROVIDER_TIMEOUT"');
    expect(edge).toContain('"OVERALL_ANALYSIS_TIMEOUT"');
  });

  it("continues to allow five photos with Macro optional", () => {
    expect(upload).toContain('{ key: "macro", label: "Macro"');
    expect(upload).toContain('required: false');
    expect(evidence).toContain('if (!canonicalUrls?.length)');
    expect(edge).not.toContain("canonicalEvidence.imageUrls.length < 6");
  });

  it("keeps timing audits free of evidence and prompt payloads", () => {
    const timingType = edge.slice(edge.indexOf("type SafeAnalysisTiming"), edge.indexOf("type Deadline"));
    expect(timingType).not.toContain("url");
    expect(timingType).not.toContain("prompt");
    expect(timingType).not.toContain("key");
    expect(timingType).not.toContain("base64");
  });
});
