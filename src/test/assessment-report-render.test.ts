import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAssessmentReportPDF, type AssessmentReportData } from "@/utils/generateAssessmentReport";
import type { StructuredObservation } from "@/lib/assessment/contract";

const observations: StructuredObservation[] = Array.from({ length: 14 }, (_, index) => ({
  code: index % 2 === 0 ? "PACKAGING_PRINT" : "TYPOGRAPHY_GEOMETRY",
  category: index % 2 === 0 ? "packaging" : "typography",
  findingType: index % 5 === 0 ? "risk_indicator" : "supporting_consistency",
  observationStatus: "observed",
  severity: index % 5 === 0 ? "low" : "informational",
  confidenceLevel: "medium",
  imageIndex: index % 6,
  visibleRegion: `submitted image region ${index + 1}`,
  finding: `Fixture observation ${index + 1} records a visible element with enough text to exercise line wrapping and report page breaks without relying on an external image.`,
  limitation: null,
  referenceUsed: null,
  referenceReliability: "none",
  modelVersion: "fixture-model",
}));

const base: AssessmentReportData = {
  reportId: "11111111-1111-4111-8111-111111111111",
  runId: "22222222-2222-4222-8222-222222222222",
  runKind: "phase_1b",
  date: "2026-07-16",
  publicUrl: "https://example.test/results/fixture",
  analysisSource: "physical_scan",
  model: "fixture-model",
  promptVersion: "popcheck-observation-v1",
  decisionEngineVersion: "popcheck-decision-v1",
  identity: {
    popName: "Assessment Fixture",
    popNumber: "101",
    series: "Animation",
    barcode: null,
    productionCode: null,
    factory: null,
    releaseYear: null,
    sticker: null,
    region: null,
    copyrightStamp: null,
  },
  dimensions: {
    evidenceQuality: "limited",
    identityStatus: "identified",
    referenceCoverage: "none",
    visualConsistency: "mixed",
    codeConsistency: "not_assessable",
    counterfeitIndicatorStrength: "low",
    assessmentReliability: "low",
  },
  decision: {
    verdictClass: "no_material_anomaly_detected",
    userFacingTitle: "No material anomaly detected",
    explanation: "No material anomaly was detected in the visible evidence. Minor or low-severity observations may still be present and are listed below; this does not mean zero anomalies and does not establish or certify authenticity.",
    supportingObservations: ["PACKAGING_PRINT"],
    riskObservations: ["TYPOGRAPHY_GEOMETRY"],
    limitations: [
      "No verified reference material was available.",
      "Some submitted regions were affected by glare and compression.",
    ],
    missingEvidence: ["Provide a sharp bottom-panel photograph.", "Provide a macro image of the legal footer."],
    engineVersion: "popcheck-decision-v1",
  },
  observations,
};

describe("Phase 1B assessment report rendering", () => {
  it("renders physical and listing reports with low-severity observations, disclosures, and page footers", async () => {
    const physical = await buildAssessmentReportPDF(base);
    const listing = await buildAssessmentReportPDF({ ...base, analysisSource: "listing_legacy" });

    expect(physical.getNumberOfPages()).toBeGreaterThan(1);
    expect(listing.getNumberOfPages()).toBeGreaterThan(1);
    expect(physical.output("arraybuffer").byteLength).toBeGreaterThan(10_000);
    expect(listing.output("arraybuffer").byteLength).toBeGreaterThan(10_000);

    const fixtureDir = process.env.POPCHECK_REPORT_FIXTURE_DIR;
    if (fixtureDir) {
      mkdirSync(fixtureDir, { recursive: true });
      writeFileSync(join(fixtureDir, "phase1b-physical-report.pdf"), Buffer.from(physical.output("arraybuffer")));
      writeFileSync(join(fixtureDir, "phase1b-listing-report.pdf"), Buffer.from(listing.output("arraybuffer")));
    }
  });
});
