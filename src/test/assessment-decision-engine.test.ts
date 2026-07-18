import { describe, expect, it } from "vitest";
import {
  OBSERVATION_SCHEMA_VERSION,
  parseObservationOutput,
  type ObservationOutput,
  type StructuredObservation,
} from "@/lib/assessment/contract";
import { decideAssessment } from "@/lib/assessment/decisionEngine";
import {
  saulGoodman163CounterfeitFalseNegativeV1,
  saulGoodman163CounterfeitRegressionMetadataV1,
} from "./fixtures/saul-goodman-163-counterfeit-false-negative-v1";

function observation(overrides: Partial<StructuredObservation> = {}): StructuredObservation {
  return {
    code: "PACKAGING_PRINT",
    category: "packaging",
    findingType: "supporting_consistency",
    observationStatus: "observed",
    severity: "informational",
    confidenceLevel: "high",
    imageIndex: 0,
    visibleRegion: "front panel",
    finding: "Visible print geometry is internally consistent.",
    limitation: null,
    referenceUsed: null,
    referenceReliability: "none",
    modelVersion: "test-model",
    ...overrides,
  };
}

function output(overrides: Partial<ObservationOutput> = {}): ObservationOutput {
  return {
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    candidateIdentity: {
      popName: "Fixture",
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
    observations: [observation(), observation({ code: "TYPOGRAPHY_GEOMETRY", category: "typography", imageIndex: 1 })],
    requestedEvidence: [],
    limitations: [],
    ...overrides,
  };
}

describe("popcheck-decision-v2", () => {
  it("emits unable_to_assess when evidence is insufficient", () => {
    const result = decideAssessment(output({ observations: [observation()] }));
    expect(result.decision.verdictClass).toBe("unable_to_assess");
    expect(result.dimensions.assessmentReliability).toBe("not_assessable");
  });

  it("emits strong_counterfeit_indicators only from an observed high/critical risk", () => {
    const result = decideAssessment(output({ observations: [
      observation(),
      observation({
        code: "BARCODE",
        category: "code",
        findingType: "risk_indicator",
        severity: "high",
        finding: "Visible barcode digits conflict with the submitted product identity.",
      }),
    ] }));
    expect(result.decision.verdictClass).toBe("strong_counterfeit_indicators");
    expect(result.decision.riskObservations).toEqual(["BARCODE"]);
  });

  it("emits elevated_counterfeit_risk for an observed material medium inconsistency", () => {
    const result = decideAssessment(output({ observations: [
      observation(),
      observation({
        code: "LEGAL_FOOTER",
        category: "code",
        findingType: "risk_indicator",
        severity: "medium",
        finding: "A visible footer character differs from the comparison reference.",
      }),
    ] }));
    expect(result.decision.verdictClass).toBe("elevated_counterfeit_risk");
  });

  it("emits inconclusive for ambiguous identity", () => {
    const base = output();
    const result = decideAssessment({
      ...base,
      candidateIdentity: { ...base.candidateIdentity, popNumber: null },
      observations: [
        ...base.observations,
        observation({
          code: "IDENTITY_TEXT",
          category: "identity",
          findingType: "limitation",
          observationStatus: "uncertain",
          confidenceLevel: "low",
          limitation: "The number is partly obscured.",
        }),
      ],
    });
    expect(result.dimensions.identityStatus).toBe("ambiguous");
    expect(result.decision.verdictClass).toBe("inconclusive");
  });

  it("emits consistent_with_verified_references only with verified coverage and sufficient evidence", () => {
    const verified = output({ observations: [
      observation({ referenceUsed: "verified-ref-1", referenceReliability: "verified" }),
      observation({
        code: "TYPOGRAPHY_GEOMETRY",
        category: "typography",
        referenceUsed: "verified-ref-1",
        referenceReliability: "verified",
      }),
    ] });
    const result = decideAssessment(verified);
    expect(result.dimensions.referenceCoverage).toBe("verified");
    expect(result.dimensions.assessmentReliability).toBe("high");
    expect(result.decision.verdictClass).toBe("consistent_with_verified_references");
  });

  it("defaults to inconclusive when sufficient evidence has no usable reference", () => {
    const result = decideAssessment(output());
    expect(result.dimensions.referenceCoverage).toBe("none");
    expect(result.decision.verdictClass).toBe("inconclusive");
    expect(result.decision.verdictClass).not.toBe("no_material_anomaly_detected");
    expect(result.decision.verdictClass).not.toBe("consistent_with_verified_references");
  });

  it("never treats an absence of observed risk as authenticity", () => {
    const result = decideAssessment(output({ observations: [
      observation({
        code: "REFERENCE_COMPARISON",
        category: "reference",
        findingType: "limitation",
        finding: "A verified comparison exists but does not cover every physical feature.",
        referenceUsed: "verified-ref-1",
        referenceReliability: "verified",
      }),
      observation({
        code: "IMAGE_QUALITY",
        category: "evidence_quality",
        findingType: "limitation",
        finding: "The submitted image quality is sufficient for only the visible areas.",
      }),
    ] }));

    expect(result.decision.verdictClass).toBe("no_material_anomaly_detected");
    expect(result.decision.explanation).toContain("does not establish or certify authenticity");
  });

  it("keeps low-severity risk observations visible without treating no-reference evidence as authentic", () => {
    const result = decideAssessment(output({ observations: [
      observation(),
      observation({
        code: "MINOR_PRINT_VARIATION",
        category: "typography",
        findingType: "risk_indicator",
        severity: "low",
        finding: "A minor visible print variation was recorded.",
      }),
    ] }));

    expect(result.decision.verdictClass).toBe("inconclusive");
    expect(result.decision.riskObservations).toEqual(["MINOR_PRINT_VARIATION"]);
    expect(result.decision.explanation).toContain("no substantive conclusion is supported");
  });

  it("never allows legacy-unverified references to produce the verified-reference verdict or high reliability", () => {
    const result = decideAssessment(output({ observations: [
      observation({ referenceUsed: "legacy-ref", referenceReliability: "legacy_unverified" }),
      observation({
        code: "TYPOGRAPHY_GEOMETRY",
        category: "typography",
        referenceUsed: "legacy-ref",
        referenceReliability: "legacy_unverified",
      }),
    ] }));
    expect(result.dimensions.referenceCoverage).toBe("legacy_unverified");
    expect(result.dimensions.assessmentReliability).not.toBe("high");
    expect(result.decision.verdictClass).toBe("no_material_anomaly_detected");
  });

  it("regresses the known counterfeit Saul Goodman #163 false negative to inconclusive", () => {
    const result = decideAssessment(saulGoodman163CounterfeitFalseNegativeV1);

    expect(saulGoodman163CounterfeitRegressionMetadataV1.knownGroundTruth).toBe("counterfeit");
    expect(result.dimensions.referenceCoverage).toBe("none");
    expect(result.dimensions.counterfeitIndicatorStrength).toBe("none_observed");
    expect(result.decision.verdictClass).toBe("inconclusive");
    expect(result.decision.verdictClass).not.toBe("no_material_anomaly_detected");
    expect(result.decision.verdictClass).not.toBe("consistent_with_verified_references");
  });

  it("treats identity text, barcode, and unverified third-party stickers as non-positive comparison evidence", () => {
    const result = decideAssessment(output({ observations: [
      observation({ code: "IDENTITY_TEXT", category: "identity" }),
      observation({ code: "BARCODE", category: "code" }),
      observation({ code: "STICKER_DETAIL", category: "sticker", finding: "A third-party certification label is visible." }),
    ] }));

    expect(result.dimensions.identityStatus).toBe("identified");
    expect(result.dimensions.codeConsistency).toBe("not_assessable");
    expect(result.dimensions.visualConsistency).toBe("not_assessable");
    expect(result.decision.verdictClass).toBe("inconclusive");
  });

  it("treats not_visible as unavailable evidence, never false or counterfeit", () => {
    const parsed = parseObservationOutput(output({ observations: [
      observation(),
      observation({
        code: "COPYRIGHT_STAMP",
        category: "figure",
        findingType: "missing_evidence",
        observationStatus: "not_visible",
        severity: "informational",
        confidenceLevel: "high",
        finding: "The stamp area is not shown.",
        limitation: "No underside image was submitted.",
      }),
    ] }));
    const result = decideAssessment(parsed);
    expect(result.decision.riskObservations).toEqual([]);
    expect(result.decision.verdictClass).not.toBe("strong_counterfeit_indicators");
    expect(() => parseObservationOutput(output({ observations: [
      observation(),
      observation({
        code: "COPYRIGHT_STAMP",
        category: "figure",
        findingType: "risk_indicator",
        observationStatus: "not_visible",
        severity: "critical",
        limitation: "The stamp area is absent from the evidence.",
      }),
    ] }))).toThrow(/cannot classify unavailable/);
  });

  it("does not convert missing evidence into a positive verdict", () => {
    const result = decideAssessment(output({
      observations: [observation()],
      requestedEvidence: ["bottom box", "foot stamp", "macro logo"],
    }));
    expect(result.decision.verdictClass).toBe("unable_to_assess");
  });

  it("ignores explanatory prose when structured fields are unchanged", () => {
    const first = decideAssessment(output());
    const second = decideAssessment(output({ observations: output().observations.map((item, index) => ({
      ...item,
      finding: index === 0 ? "Completely different explanatory wording." : "Wording changed again.",
    })) }));
    expect(second.dimensions).toEqual(first.dimensions);
    expect(second.decision.verdictClass).toBe(first.decision.verdictClass);
  });
});

describe("strict observation output validation", () => {
  it("rejects malformed structure, extra verdicts, and placeholder identity", () => {
    expect(() => parseObservationOutput({ observations: [] })).toThrow();
    expect(() => parseObservationOutput({ ...output(), verdict: "AUTHENTIC" })).toThrow(/exactly/);
    expect(() => parseObservationOutput({
      ...output(),
      candidateIdentity: { ...output().candidateIdentity, popNumber: "N/A" },
    })).toThrow(/must be null/);
  });

  it("rejects incomplete observations and invalid reference claims", () => {
    const malformed = output() as unknown as Record<string, unknown>;
    malformed.observations = [{ code: "BARCODE" }];
    expect(() => parseObservationOutput(malformed)).toThrow();

    expect(() => parseObservationOutput(output({ observations: [
      observation({ referenceUsed: "mystery-ref", referenceReliability: "none" }),
      observation(),
    ] }))).toThrow(/referenceUsed/);
  });

  it("rejects risk indicators without a traceable submitted image region", () => {
    expect(() => parseObservationOutput(output({ observations: [
      observation({
        findingType: "risk_indicator",
        observationStatus: "observed",
        severity: "high",
        imageIndex: null,
        visibleRegion: null,
      }),
    ] }))).toThrow(/submitted image index and visible region/);
  });
});
