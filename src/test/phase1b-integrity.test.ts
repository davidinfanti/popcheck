import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Phase 1B scoring removal", () => {
  const analyze = file("supabase/functions/analyze-funko/index.ts");
  const transport = file("supabase/functions/_shared/gemini-transport.ts");

  it("contains no executable legacy score, bonus, cap, or threshold flow", () => {
    expect(analyze).not.toContain("finalScore");
    expect(analyze).not.toContain("Authenticity Bias");
    expect(analyze).not.toContain("weightedSum");
    expect(analyze).not.toMatch(/score:\s*final/);
    expect(analyze).not.toContain("submit_vstamp_analysis");
    expect(analyze).toContain("GEMINI_OBSERVATION_TRANSPORT_SCHEMA");
    expect(transport).toContain("gemini-observation-transport-v1");
    expect(analyze).toContain("assessmentRunId");
  });

  it("contains no language-dependent prose enforcement", () => {
    expect(analyze).not.toContain("halftoneText");
    expect(analyze).not.toContain("isFlatLogo");
    expect(analyze).not.toContain("hasLynnwoodAddress");
    expect(analyze).not.toMatch(/\.toLowerCase\(\).*\.includes\(/s);
  });

  it("does not let the model set a score, probability, or final verdict", () => {
    expect(transport).not.toMatch(/finalScore|verdictBand|authenticityScore|referenceConfidence/);
    expect(transport).not.toMatch(/score|probability|verdict/);
    expect(analyze).toContain("Do not return score, verdict, probability, certification, or modelVersion fields");
    expect(analyze).toContain("normalizeGeminiTransportOutput(rawOutput, providerModel)");
    expect(analyze).toContain("parseObservationOutput(normalizeGeminiTransportOutput(rawOutput, providerModel))");
    expect(analyze).toContain("const assessment = decideAssessment(observationOutput)");
  });
});

describe("Phase 1B report and history behavior", () => {
  const results = file("src/pages/Results.tsx");
  const pdf = file("src/utils/generateAssessmentReport.ts");
  const collection = file("src/pages/Collection.tsx");
  const publicDescription = file("public/llms.txt");

  it("uses assessment language and removes deprecated certification presentation", () => {
    for (const source of [results, pdf, publicDescription]) {
      expect(source).toContain("POPCHECK AI Assessment Report");
      expect(source).not.toContain("Certificate of Authenticity");
      expect(source).not.toContain("AI VERIFIED");
      expect(source).not.toContain("HIGHLY LIKELY AUTHENTIC");
      expect(source).not.toContain("V-STAMP AUTHENTICITY SCORE");
    }
  });

  it("labels historical numeric scores as uncalibrated legacy data", () => {
    expect(results).toContain("Legacy V-STAMP score (uncalibrated historical data)");
    expect(pdf).toContain("Legacy V-STAMP score (uncalibrated historical data)");
    expect(collection).toContain("(uncalibrated)");
  });

  it("shows the same deterministic decision and limitations in UI and PDF", () => {
    expect(results).toContain("decision.userFacingTitle");
    expect(results).toContain("decision.limitations");
    expect(pdf).toContain("data.decision.userFacingTitle");
    expect(pdf).toContain("data.decision.limitations");
  });

  it("keeps every observed risk indicator visible in UI and PDF regardless of low severity", () => {
    expect(results).toContain('item.findingType === "risk_indicator" && item.observationStatus === "observed"');
    expect(results).toContain("item.severity");
    expect(pdf).toContain('item.findingType === "risk_indicator" && item.observationStatus === "observed"');
    expect(pdf).toContain("(${item.severity})");
  });

  it("re-analysis appends to the same submission and never inserts a replacement authentication", () => {
    const reanalysis = results.slice(results.indexOf("function ReanalyzeButton"));
    expect(reanalysis).toContain("authenticationId");
    expect(reanalysis).toContain("Append new run");
    expect(reanalysis).not.toContain('.from("authentications").insert');
    expect(reanalysis).toContain("Earlier runs remain unchanged");
    expect(results).toContain("Run comparison");
    expect(results).toContain("immediately preceding immutable run");
    expect(results).toContain("latest analysis attempt did not produce a verdict");
  });
});

describe("Phase 1B admin-setting protections", () => {
  const admin = file("src/pages/Admin.tsx");
  const phase1bMigration = file("supabase/migrations/20260716120000_phase_1b_verdict_integrity.sql");
  const migration = file("supabase/migrations/20260716170000_phase_1b1_guidance_atomicity.sql");

  it("uses immutable closed structured guidance instead of free-text execution", () => {
    expect(admin).toContain('rpc("create_structured_guidance_version"');
    expect(admin).not.toContain('rpc("create_ai_guidance_version"');
    expect(admin).not.toContain('.from("ai_settings").update');
    expect(migration).toContain("structured_guidance_versions_are_append_only");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.create_ai_guidance_version");
    expect(phase1bMigration).toContain("ai_guidance_versions_are_append_only");
  });

  it("records the influencing guidance version on an immutable run", () => {
    const analyze = file("supabase/functions/analyze-funko/index.ts");
    expect(analyze).toContain("p_structured_guidance_version_id: guidance?.id || null");
    expect(analyze).not.toContain('.from("ai_guidance_versions")');
    expect(phase1bMigration).toContain("assessment_runs_are_append_only");
  });

  it("uses one service-role-only RPC for run insertion and snapshot completion", () => {
    const analyze = file("supabase/functions/analyze-funko/index.ts");
    expect(analyze).toContain('"complete_phase_1b_assessment"');
    expect(analyze).not.toContain('.from("assessment_runs").insert');
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.complete_phase_1b_assessment");
    expect(migration).toContain("TO service_role");
  });
});
