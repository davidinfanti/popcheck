export const OBSERVATION_SCHEMA_VERSION = "popcheck-observation-schema-v1";
export const PROMPT_VERSION = "popcheck-observation-v1";
export const DECISION_ENGINE_VERSION = "popcheck-decision-v1";

export const OBSERVATION_STATUSES = [
  "observed",
  "not_observed",
  "not_visible",
  "uncertain",
  "not_applicable",
] as const;

export const SEVERITIES = ["informational", "low", "medium", "high", "critical"] as const;
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export const REFERENCE_RELIABILITIES = ["verified", "limited", "legacy_unverified", "none"] as const;
export const FINDING_TYPES = ["supporting_consistency", "risk_indicator", "limitation", "missing_evidence"] as const;
export const OBSERVATION_CATEGORIES = [
  "evidence_quality",
  "identity",
  "reference",
  "packaging",
  "typography",
  "code",
  "figure",
  "sticker",
  "listing",
] as const;

export const OBSERVATION_CODES = [
  "IMAGE_QUALITY",
  "STOCK_PHOTO",
  "IDENTITY_TEXT",
  "REFERENCE_COMPARISON",
  "PACKAGING_PRINT",
  "BOX_CONSTRUCTION",
  "TYPOGRAPHY_GEOMETRY",
  "HALFTONE_VISIBILITY",
  "LEGAL_FOOTER",
  "BARCODE",
  "PRODUCTION_CODE",
  "FACTORY_CODE",
  "STAMP_TO_BOX",
  "COPYRIGHT_STAMP",
  "PAINT_APPLICATION",
  "MOLD_DETAIL",
  "STICKER_DETAIL",
  "QR_CODE",
  "LISTING_CONTEXT",
] as const;

export type ObservationStatus = typeof OBSERVATION_STATUSES[number];
export type Severity = typeof SEVERITIES[number];
export type ConfidenceLevel = typeof CONFIDENCE_LEVELS[number];
export type ReferenceReliability = typeof REFERENCE_RELIABILITIES[number];
export type FindingType = typeof FINDING_TYPES[number];
export type ObservationCategory = typeof OBSERVATION_CATEGORIES[number];
export type ObservationCode = typeof OBSERVATION_CODES[number];

export interface CandidateIdentity {
  popName: string | null;
  popNumber: string | null;
  series: string | null;
  barcode: string | null;
  productionCode: string | null;
  factory: string | null;
  releaseYear: string | null;
  sticker: string | null;
  region: string | null;
  copyrightStamp: string | null;
}

export interface StructuredObservation {
  code: ObservationCode;
  category: ObservationCategory;
  findingType: FindingType;
  observationStatus: ObservationStatus;
  severity: Severity;
  confidenceLevel: ConfidenceLevel;
  imageIndex: number | null;
  visibleRegion: string | null;
  finding: string;
  limitation: string | null;
  referenceUsed: string | null;
  referenceReliability: ReferenceReliability;
  modelVersion: string;
}

export interface ObservationOutput {
  schemaVersion: typeof OBSERVATION_SCHEMA_VERSION;
  candidateIdentity: CandidateIdentity;
  observations: StructuredObservation[];
  requestedEvidence: string[];
  limitations: string[];
}

export class ObservationValidationError extends Error {
  readonly code = "INVALID_MODEL_OUTPUT";

  constructor(message: string) {
    super(message);
    this.name = "ObservationValidationError";
  }
}

const PLACEHOLDER_IDENTITY = /^(?:n\/?a|unknown|unreadable|not[_ -]?visible|not[_ -]?available|none|null|pending|best guess)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ObservationValidationError(`${path} must contain exactly: ${wanted.join(", ")}`);
  }
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ObservationValidationError(`${path} has an unsupported value`);
  }
  return value as T[number];
}

function requiredText(value: unknown, path: string, maxLength = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new ObservationValidationError(`${path} must be concise non-empty text`);
  }
  return value.trim();
}

function nullableText(value: unknown, path: string, rejectPlaceholders = false): string | null {
  if (value === null) return null;
  const text = requiredText(value, path, 300);
  if (rejectPlaceholders && PLACEHOLDER_IDENTITY.test(text)) {
    throw new ObservationValidationError(`${path} must be null when the identity is unreadable`);
  }
  return text;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length > 30) {
    throw new ObservationValidationError(`${path} must be an array with at most 30 items`);
  }
  return value.map((item, index) => requiredText(item, `${path}[${index}]`, 300));
}

function parseIdentity(value: unknown): CandidateIdentity {
  if (!isRecord(value)) throw new ObservationValidationError("candidateIdentity must be an object");
  const keys = [
    "popName", "popNumber", "series", "barcode", "productionCode",
    "factory", "releaseYear", "sticker", "region", "copyrightStamp",
  ] as const;
  assertExactKeys(value, keys, "candidateIdentity");
  return Object.fromEntries(keys.map((key) => [key, nullableText(value[key], `candidateIdentity.${key}`, true)])) as unknown as CandidateIdentity;
}

function parseObservation(value: unknown, index: number): StructuredObservation {
  const path = `observations[${index}]`;
  if (!isRecord(value)) throw new ObservationValidationError(`${path} must be an object`);
  assertExactKeys(value, [
    "code", "category", "findingType", "observationStatus", "severity", "confidenceLevel",
    "imageIndex", "visibleRegion", "finding", "limitation", "referenceUsed",
    "referenceReliability", "modelVersion",
  ], path);

  const observationStatus = enumValue(value.observationStatus, OBSERVATION_STATUSES, `${path}.observationStatus`);
  const findingType = enumValue(value.findingType, FINDING_TYPES, `${path}.findingType`);
  const code = enumValue(value.code, OBSERVATION_CODES, `${path}.code`);
  const limitation = nullableText(value.limitation, `${path}.limitation`);
  const referenceUsed = nullableText(value.referenceUsed, `${path}.referenceUsed`);
  const referenceReliability = enumValue(value.referenceReliability, REFERENCE_RELIABILITIES, `${path}.referenceReliability`);

  if (value.imageIndex !== null && (!Number.isInteger(value.imageIndex) || (value.imageIndex as number) < 0)) {
    throw new ObservationValidationError(`${path}.imageIndex must be a non-negative integer or null`);
  }
  if (["not_visible", "uncertain"].includes(observationStatus) && !limitation) {
    throw new ObservationValidationError(`${path}.limitation is required for unavailable or uncertain evidence`);
  }
  if (observationStatus !== "observed" && findingType === "risk_indicator") {
    throw new ObservationValidationError(`${path} cannot classify unavailable or absent evidence as a risk indicator`);
  }
  if (findingType === "risk_indicator" && (value.imageIndex === null || value.visibleRegion === null)) {
    throw new ObservationValidationError(`${path} risk indicators require a submitted image index and visible region`);
  }
  if (["STOCK_PHOTO", "IMAGE_QUALITY"].includes(code) && findingType === "risk_indicator") {
    throw new ObservationValidationError(`${path} must treat evidence quality as assessability, not counterfeiting`);
  }
  if (referenceReliability === "none" && referenceUsed !== null) {
    throw new ObservationValidationError(`${path}.referenceUsed requires a stated reference reliability`);
  }
  if (referenceReliability !== "none" && referenceUsed === null) {
    throw new ObservationValidationError(`${path}.referenceUsed is required when a reference influenced the observation`);
  }

  return {
    code,
    category: enumValue(value.category, OBSERVATION_CATEGORIES, `${path}.category`),
    findingType,
    observationStatus,
    severity: enumValue(value.severity, SEVERITIES, `${path}.severity`),
    confidenceLevel: enumValue(value.confidenceLevel, CONFIDENCE_LEVELS, `${path}.confidenceLevel`),
    imageIndex: value.imageIndex as number | null,
    visibleRegion: nullableText(value.visibleRegion, `${path}.visibleRegion`),
    finding: requiredText(value.finding, `${path}.finding`),
    limitation,
    referenceUsed,
    referenceReliability,
    modelVersion: requiredText(value.modelVersion, `${path}.modelVersion`, 150),
  };
}

export function parseObservationOutput(value: unknown): ObservationOutput {
  if (!isRecord(value)) throw new ObservationValidationError("model output must be an object");
  assertExactKeys(value, ["schemaVersion", "candidateIdentity", "observations", "requestedEvidence", "limitations"], "model output");
  if (value.schemaVersion !== OBSERVATION_SCHEMA_VERSION) {
    throw new ObservationValidationError("model output schemaVersion is unsupported");
  }
  if (!Array.isArray(value.observations) || value.observations.length === 0 || value.observations.length > 100) {
    throw new ObservationValidationError("observations must contain between 1 and 100 entries");
  }

  return {
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    candidateIdentity: parseIdentity(value.candidateIdentity),
    observations: value.observations.map(parseObservation),
    requestedEvidence: stringArray(value.requestedEvidence, "requestedEvidence"),
    limitations: stringArray(value.limitations, "limitations"),
  };
}
