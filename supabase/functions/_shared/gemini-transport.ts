import {
  CONFIDENCE_LEVELS,
  FINDING_TYPES,
  OBSERVATION_CATEGORIES,
  OBSERVATION_CODES,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_STATUSES,
  REFERENCE_RELIABILITIES,
  SEVERITIES,
  ObservationValidationError,
} from "./assessment/contract.ts";
import { ANALYSIS_MODEL } from "./gemini-provider.ts";

export const GEMINI_TRANSPORT_SCHEMA_VERSION = "gemini-observation-transport-v1";
export const GEMINI_TRANSPORT_NULL = "__POPCHECK_NULL__";
export const GEMINI_TRANSPORT_NULL_IMAGE_INDEX = -1;

const identityKeys = [
  "popName", "popNumber", "series", "barcode", "productionCode",
  "factory", "releaseYear", "sticker", "region", "copyrightStamp",
] as const;

const observationKeys = [
  "code", "category", "findingType", "observationStatus", "severity", "confidenceLevel",
  "imageIndex", "visibleRegion", "finding", "limitation", "referenceUsed", "referenceReliability",
] as const;

const stringProperty = { type: "string" } as const;

export const GEMINI_OBSERVATION_TRANSPORT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    transportVersion: { type: "string", enum: [GEMINI_TRANSPORT_SCHEMA_VERSION] },
    candidateIdentity: {
      type: "object",
      properties: Object.fromEntries(identityKeys.map((key) => [key, stringProperty])),
      required: [...identityKeys],
      additionalProperties: false,
    },
    observations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string", enum: OBSERVATION_CODES },
          category: { type: "string", enum: OBSERVATION_CATEGORIES },
          findingType: { type: "string", enum: FINDING_TYPES },
          observationStatus: { type: "string", enum: OBSERVATION_STATUSES },
          severity: { type: "string", enum: SEVERITIES },
          confidenceLevel: { type: "string", enum: CONFIDENCE_LEVELS },
          imageIndex: { type: "integer" },
          visibleRegion: stringProperty,
          finding: stringProperty,
          limitation: stringProperty,
          referenceUsed: stringProperty,
          referenceReliability: { type: "string", enum: REFERENCE_RELIABILITIES },
        },
        required: [...observationKeys],
        additionalProperties: false,
      },
    },
    requestedEvidence: { type: "array", items: stringProperty },
    limitations: { type: "array", items: stringProperty },
  },
  required: ["transportVersion", "candidateIdentity", "observations", "requestedEvidence", "limitations"],
  additionalProperties: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ObservationValidationError(`${path} contains unsupported transport fields`);
  }
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new ObservationValidationError(`${path} must be a string`);
  return value;
}

function nullableTransportString(value: unknown, path: string): string | null {
  const text = requiredString(value, path);
  return text === GEMINI_TRANSPORT_NULL ? null : text;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new ObservationValidationError(`${path} must be an array`);
  return value.map((item, index) => requiredString(item, `${path}[${index}]`));
}

export function normalizeGeminiTransportOutput(
  value: unknown,
  model = ANALYSIS_MODEL,
): Record<string, unknown> {
  if (!isRecord(value)) throw new ObservationValidationError("Gemini transport output must be an object");
  assertExactKeys(
    value,
    ["transportVersion", "candidateIdentity", "observations", "requestedEvidence", "limitations"],
    "Gemini transport output",
  );
  if (value.transportVersion !== GEMINI_TRANSPORT_SCHEMA_VERSION) {
    throw new ObservationValidationError("Gemini transport schema version is unsupported");
  }

  if (!isRecord(value.candidateIdentity)) {
    throw new ObservationValidationError("candidateIdentity must be a transport object");
  }
  assertExactKeys(value.candidateIdentity, identityKeys, "candidateIdentity");
  const candidateIdentity = Object.fromEntries(identityKeys.map((key) => [
    key,
    nullableTransportString(value.candidateIdentity[key], `candidateIdentity.${key}`),
  ]));

  if (!Array.isArray(value.observations)) {
    throw new ObservationValidationError("observations must be a transport array");
  }
  const observations = value.observations.map((item, index) => {
    if (!isRecord(item)) throw new ObservationValidationError(`observations[${index}] must be a transport object`);
    assertExactKeys(item, observationKeys, `observations[${index}]`);
    if (!Number.isInteger(item.imageIndex)) {
      throw new ObservationValidationError(`observations[${index}].imageIndex must be an integer`);
    }
    return {
      code: requiredString(item.code, `observations[${index}].code`),
      category: requiredString(item.category, `observations[${index}].category`),
      findingType: requiredString(item.findingType, `observations[${index}].findingType`),
      observationStatus: requiredString(item.observationStatus, `observations[${index}].observationStatus`),
      severity: requiredString(item.severity, `observations[${index}].severity`),
      confidenceLevel: requiredString(item.confidenceLevel, `observations[${index}].confidenceLevel`),
      imageIndex: item.imageIndex === GEMINI_TRANSPORT_NULL_IMAGE_INDEX ? null : item.imageIndex,
      visibleRegion: nullableTransportString(item.visibleRegion, `observations[${index}].visibleRegion`),
      finding: requiredString(item.finding, `observations[${index}].finding`),
      limitation: nullableTransportString(item.limitation, `observations[${index}].limitation`),
      referenceUsed: nullableTransportString(item.referenceUsed, `observations[${index}].referenceUsed`),
      referenceReliability: requiredString(item.referenceReliability, `observations[${index}].referenceReliability`),
      // The model never supplies this field. The server stamps the actual
      // successful provider model before authoritative validation.
      modelVersion: model,
    };
  });

  return {
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    candidateIdentity,
    observations,
    requestedEvidence: stringArray(value.requestedEvidence, "requestedEvidence"),
    limitations: stringArray(value.limitations, "limitations"),
  };
}
