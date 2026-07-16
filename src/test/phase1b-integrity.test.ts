import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Phase 1B scoring removal", () => {
  const analyze = file("supabase/functions/analyze-funko/index.ts");

  it("contains no executable legacy score, bonus, cap, or threshold flow", () => {
    expect(analyze).not.toContain("finalScore");
    expect(analyze).not.toContain("Authenticity Bias");
    expect(analyze).not.toContain("weightedSum");
    expect(analyze).not.toMatch(/score:\s*final/);
    expect(analyze).not.toContain("submit_vstamp_analysis");
    expect(analyze).toContain("submit_popcheck_observations");
    expect(analyze).toContain("assessmentRunId");
  });

  it("contains no language-dependent prose enforcement", () => {
    expect(analyze).not.toContain("halftoneText");
    expect(analyze).not.toContain("isFlatLogo");
    expect(analyze).not.toContain("hasLynnwoodAddress");
    expect(analyze).not.toMatch(/\.toLowerCase\(\).*\.includes\(/s);
  });

  it("does not let the model set a score, probability, or final verdict", () => {
    const toolBlock = analyze.slice(analyze.indexOf("const observationTool"), analyze.indexOf("serve(async"));
    expect(toolBlock).not.toMatch(/finalScore|verdictBand|authenticityScore|referenceConfidence/);
    expect(toolBlock).toContain("Do not submit a score or final verdict");
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
  const migration = file("supabase/migrations/20260716120000_phase_1b_verdict_integrity.sql");

  it("uses immutable constrained guidance instead of the raw system override", () => {
    expect(admin).toContain('rpc("create_ai_guidance_version"');
    expect(admin).not.toContain('.from("ai_settings").update');
    expect(migration).toContain("ai_guidance_versions_are_append_only");
    expect(migration).toContain("decision, scoring, certification, fabrication, and bypass instructions are prohibited");
  });

  it("records the influencing guidance version on an immutable run", () => {
    const analyze = file("supabase/functions/analyze-funko/index.ts");
    expect(analyze).toContain("guidance_version_id: guidance?.id || null");
    expect(migration).toContain("assessment_runs_are_append_only");
  });
});
