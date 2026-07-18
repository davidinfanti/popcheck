import {
  saulGoodman163CounterfeitFalseNegativeV1,
  saulGoodman163CounterfeitRegressionMetadataV1,
} from "./saul-goodman-163-counterfeit-false-negative-v1";

export type ForensicBenchmarkCaseV1 = {
  benchmarkCaseId: string;
  fixtureVersion: "forensic-benchmark-v1";
  target: { productName: string; popNumber: string; franchise: string; variant: null; region: null; stickerVariant: null };
  knownGroundTruth: "counterfeit" | "original" | "unknown";
  groundTruthSource: string;
  expertReviewer: string | null;
  submittedEvidenceIdentifiers: string[];
  expectedMaterialIndicators: string[];
  popcheckObservations: typeof saulGoodman163CounterfeitFalseNegativeV1.observations;
  expectedVerdict: "inconclusive";
  expectedReliability: "medium";
  falsePositiveClassification: "not_applicable" | "observed";
  falseNegativeClassification: "historical_false_negative" | "not_observed";
  reviewerNotes: string;
  sourceRunIds: string[];
  modelVersion: string;
  decisionEngineVersion: "popcheck-decision-v2";
  latencyMs: null;
};

// No URL, image bytes, user identifier, provider payload, or private reference
// is retained in a repository benchmark fixture.
export const saulGoodman163CounterfeitBenchmarkV1: ForensicBenchmarkCaseV1 = {
  benchmarkCaseId: "saul-goodman-163-counterfeit-regression-v1",
  fixtureVersion: "forensic-benchmark-v1",
  target: { productName: "Saul Goodman", popNumber: "163", franchise: "Breaking Bad", variant: null, region: null, stickerVariant: null },
  knownGroundTruth: "counterfeit",
  groundTruthSource: "Closed-beta expert/user ground truth; operator validation required before forensic knowledge activation.",
  expertReviewer: null,
  submittedEvidenceIdentifiers: ["redacted-submitted-evidence-1", "redacted-submitted-evidence-5"],
  expectedMaterialIndicators: [],
  popcheckObservations: saulGoodman163CounterfeitFalseNegativeV1.observations,
  expectedVerdict: "inconclusive",
  expectedReliability: "medium",
  falsePositiveClassification: "not_applicable",
  falseNegativeClassification: "historical_false_negative",
  reviewerNotes: "No verified Saul Goodman #163 reference was available. This fixture guards the conservative no-reference decision gate and does not establish a product-specific counterfeit indicator.",
  sourceRunIds: [saulGoodman163CounterfeitRegressionMetadataV1.sourceRunId],
  modelVersion: "gemini-3.5-flash",
  decisionEngineVersion: "popcheck-decision-v2",
  latencyMs: null,
};
