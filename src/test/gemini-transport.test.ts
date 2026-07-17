import { describe, expect, it } from "vitest";
import {
  OBSERVATION_SCHEMA_VERSION,
  ObservationValidationError,
  parseObservationOutput,
} from "../../supabase/functions/_shared/assessment/contract";
import { decideAssessment } from "../../supabase/functions/_shared/assessment/decisionEngine";
import { ANALYSIS_MODEL } from "../../supabase/functions/_shared/gemini-provider";
import {
  GEMINI_OBSERVATION_TRANSPORT_SCHEMA,
  GEMINI_TRANSPORT_NULL,
  GEMINI_TRANSPORT_NULL_IMAGE_INDEX,
  GEMINI_TRANSPORT_SCHEMA_VERSION,
  normalizeGeminiTransportOutput,
} from "../../supabase/functions/_shared/gemini-transport";

function transportFixture() {
  return {
    transportVersion: GEMINI_TRANSPORT_SCHEMA_VERSION,
    candidateIdentity: {
      popName: "Synthetic Fixture",
      popNumber: "101",
      series: GEMINI_TRANSPORT_NULL,
      barcode: GEMINI_TRANSPORT_NULL,
      productionCode: GEMINI_TRANSPORT_NULL,
      factory: GEMINI_TRANSPORT_NULL,
      releaseYear: GEMINI_TRANSPORT_NULL,
      sticker: GEMINI_TRANSPORT_NULL,
      region: GEMINI_TRANSPORT_NULL,
      copyrightStamp: GEMINI_TRANSPORT_NULL,
    },
    observations: [
      {
        code: "IMAGE_QUALITY",
        category: "evidence_quality",
        findingType: "limitation",
        observationStatus: "observed",
        severity: "informational",
        confidenceLevel: "high",
        imageIndex: 0,
        visibleRegion: "submitted front image",
        finding: "The synthetic image is visible.",
        limitation: GEMINI_TRANSPORT_NULL,
        referenceUsed: GEMINI_TRANSPORT_NULL,
        referenceReliability: "none",
      },
      {
        code: "IDENTITY_TEXT",
        category: "identity",
        findingType: "supporting_consistency",
        observationStatus: "observed",
        severity: "informational",
        confidenceLevel: "high",
        imageIndex: 0,
        visibleRegion: "front identity panel",
        finding: "The product name and number are readable.",
        limitation: GEMINI_TRANSPORT_NULL,
        referenceUsed: GEMINI_TRANSPORT_NULL,
        referenceReliability: "none",
      },
    ],
    requestedEvidence: [],
    limitations: ["Only one synthetic image was supplied."],
  };
}

describe("Gemini observation transport", () => {
  it("uses only low-complexity provider schema constructs", () => {
    const forbidden = new Set([
      "description", "title", "minItems", "maxItems", "minLength", "maxLength",
      "minimum", "maximum", "oneOf", "anyOf", "allOf", "if", "then", "else",
    ]);
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        expect(forbidden.has(key), `forbidden provider-schema key: ${key}`).toBe(false);
        if (key === "type") expect(Array.isArray(nested), "nullable type unions are not allowed").toBe(false);
        visit(nested);
      }
    };
    visit(GEMINI_OBSERVATION_TRANSPORT_SCHEMA);

    const properties = GEMINI_OBSERVATION_TRANSPORT_SCHEMA.properties as Record<string, unknown>;
    const observations = properties.observations as Record<string, unknown>;
    const items = observations.items as Record<string, unknown>;
    const observationProperties = items.properties as Record<string, Record<string, unknown>>;
    expect(items.additionalProperties).toBe(false);
    expect(observations).not.toHaveProperty("minItems");
    expect(observations).not.toHaveProperty("maxItems");
    expect(Object.values(observationProperties).every((schema) =>
      schema.type === "string" || schema.type === "integer"
    )).toBe(true);
  });

  it("normalizes transport sentinels into the unchanged authoritative contract", () => {
    const normalized = normalizeGeminiTransportOutput(transportFixture());
    const authoritative = parseObservationOutput(normalized);

    expect(authoritative.schemaVersion).toBe(OBSERVATION_SCHEMA_VERSION);
    expect(authoritative.candidateIdentity.series).toBeNull();
    expect(authoritative.observations[0].limitation).toBeNull();
    expect(authoritative.observations.every((item) => item.modelVersion === ANALYSIS_MODEL)).toBe(true);
  });

  it("rejects invalid normalized enums through the authoritative validator", () => {
    const transport = transportFixture();
    transport.observations[0].severity = "provider_invented";
    const normalized = normalizeGeminiTransportOutput(transport);
    expect(() => parseObservationOutput(normalized)).toThrow(ObservationValidationError);
  });

  it("rejects extra fields, model verdicts, and scores before normalization", () => {
    for (const extra of [
      { score: 99 },
      { verdict: "pass" },
      { probability: 0.99 },
    ]) {
      expect(() => normalizeGeminiTransportOutput({ ...transportFixture(), ...extra }))
        .toThrow(ObservationValidationError);
    }

    const nested = transportFixture();
    (nested.observations[0] as unknown as Record<string, unknown>).modelVerdict = "authentic";
    expect(() => normalizeGeminiTransportOutput(nested)).toThrow(ObservationValidationError);
  });

  it("rejects an untraceable risk observation after normalization", () => {
    const transport = transportFixture();
    transport.observations[0] = {
      ...transport.observations[0],
      code: "PACKAGING_PRINT",
      category: "packaging",
      findingType: "risk_indicator",
      severity: "high",
      imageIndex: GEMINI_TRANSPORT_NULL_IMAGE_INDEX,
      visibleRegion: GEMINI_TRANSPORT_NULL,
      finding: "A claimed inconsistency without traceable evidence.",
    };
    const normalized = normalizeGeminiTransportOutput(transport);
    expect(() => parseObservationOutput(normalized)).toThrow(ObservationValidationError);
  });

  it("leaves the final verdict exclusively to the deterministic engine", () => {
    const output = parseObservationOutput(normalizeGeminiTransportOutput(transportFixture()));
    const assessment = decideAssessment(output);
    expect(assessment.decision.verdictClass).toBe("no_material_anomaly_detected");
    expect(JSON.stringify(assessment.decision)).not.toContain("provider");
  });
});
