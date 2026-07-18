import { describe, expect, it } from "vitest";
import {
  forensicKnowledgeIdentifier,
  selectEligibleForensicKnowledge,
  validateForensicKnowledgeTraceability,
  type ForensicKnowledgeCandidate,
} from "../../supabase/functions/_shared/forensic-knowledge";
import { ObservationValidationError, type ObservationOutput } from "@/lib/assessment/contract";
import { decideAssessment } from "@/lib/assessment/decisionEngine";
import { saulGoodman163CounterfeitFalseNegativeV1 } from "./fixtures/saul-goodman-163-counterfeit-false-negative-v1";
import { saulGoodman163CounterfeitBenchmarkV1 } from "./fixtures/forensic-benchmark-v1";

const baseCandidate: ForensicKnowledgeCandidate = {
  id: "ref-1", kind: "reference_image", productId: "saul-product", variantId: "saul-variant-a", status: "verified",
  reliabilityTier: "verified", provenanceType: "chain_of_custody", provenanceDescription: "Recorded by source owner.",
  sourceOwner: "Named owner", validatorIdentity: "Named validator", validationDate: "2026-07-18", imageView: "front", visibleRegion: "front panel",
};

function outputWithReference(referenceUsed: string | null, referenceReliability: "verified" | "none" = "verified"): ObservationOutput {
  return {
    ...saulGoodman163CounterfeitFalseNegativeV1,
    observations: saulGoodman163CounterfeitFalseNegativeV1.observations.map((item, index) => index === 0 ? {
      ...item, referenceUsed, referenceReliability, imageIndex: 0, visibleRegion: "front panel",
    } : item),
  };
}

describe("Phase 2B forensic knowledge eligibility", () => {
  it("retrieves only verified, provenance-backed records for the exact Saul variant and view", () => {
    const records: ForensicKnowledgeCandidate[] = [
      baseCandidate,
      { ...baseCandidate, id: "draft", status: "draft" },
      { ...baseCandidate, id: "retired", status: "retired" },
      { ...baseCandidate, id: "variant-mismatch", variantId: "saul-variant-b" },
      { ...baseCandidate, id: "unprovenanced", provenanceDescription: "" },
      { ...baseCandidate, id: "wrong-view", imageView: "bottom" },
    ];
    expect(selectEligibleForensicKnowledge(records, {
      productId: "saul-product", variantId: "saul-variant-a", imageView: "front", visibleRegion: "front panel",
    }).map((item) => item.id)).toEqual(["ref-1"]);
  });

  it("does not let a different visible region or a limited record become eligible", () => {
    expect(selectEligibleForensicKnowledge([{ ...baseCandidate, reliabilityTier: "limited" }], {
      productId: "saul-product", variantId: "saul-variant-a", imageView: "front", visibleRegion: "front panel",
    })).toEqual([]);
    expect(selectEligibleForensicKnowledge([baseCandidate], {
      productId: "saul-product", variantId: "saul-variant-a", imageView: "front", visibleRegion: "barcode panel",
    })).toEqual([]);
  });

  it("accepts only an eligible verified knowledge identifier in a model observation", () => {
    const identifier = forensicKnowledgeIdentifier(baseCandidate);
    expect(validateForensicKnowledgeTraceability(outputWithReference(identifier), new Set([identifier])).observations[0].referenceUsed).toBe(identifier);
  });

  it("rejects untraceable or non-verified knowledge-derived observations", () => {
    expect(() => validateForensicKnowledgeTraceability(outputWithReference("forensic-reference:draft"), new Set())).toThrow(ObservationValidationError);
    expect(() => validateForensicKnowledgeTraceability(outputWithReference(null, "verified"), new Set())).toThrow(ObservationValidationError);
  });

  it("preserves the Saul false-negative regression and keeps decision-v2 authoritative", () => {
    const result = decideAssessment(saulGoodman163CounterfeitFalseNegativeV1);
    expect(result.decision.engineVersion).toBe("popcheck-decision-v2");
    expect(result.decision.verdictClass).toBe("inconclusive");
    expect(saulGoodman163CounterfeitBenchmarkV1.expectedVerdict).toBe("inconclusive");
    expect(saulGoodman163CounterfeitBenchmarkV1.submittedEvidenceIdentifiers.every((item) => !item.includes("http"))).toBe(true);
  });
});
