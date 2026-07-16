export const GUIDANCE_TYPES = [
  "inspection_priority",
  "comparison_instruction",
  "evidence_requirement",
  "known_limitation",
  "release_specific_note",
] as const;

export const INSPECTION_AREAS = [
  "front_box",
  "rear_box",
  "left_side",
  "right_side",
  "top",
  "bottom",
  "barcode",
  "production_code",
  "sticker",
  "logo",
  "typography",
  "character_image",
  "packaging_geometry",
  "copyright_footer",
] as const;

export const GUIDANCE_ACTIONS = [
  "inspect",
  "compare",
  "request_additional_evidence",
  "reduce_assessability",
  "mark_not_applicable",
] as const;

export const GUIDANCE_PRIORITIES = ["low", "medium", "high"] as const;
export const GUIDANCE_REFERENCE_REQUIREMENTS = ["verified", "verified_or_legacy", "none"] as const;
export const GUIDANCE_NOTE_TEMPLATES = [
  "none",
  "glare_may_obscure_detail",
  "compression_may_reduce_legibility",
  "angle_may_hide_edge",
  "release_variants_may_differ",
  "reference_provenance_required",
  "physical_detail_not_visible_in_image",
] as const;

export type GuidanceType = typeof GUIDANCE_TYPES[number];
export type InspectionArea = typeof INSPECTION_AREAS[number];
export type GuidanceAction = typeof GUIDANCE_ACTIONS[number];
export type GuidancePriority = typeof GUIDANCE_PRIORITIES[number];
export type GuidanceReferenceRequirement = typeof GUIDANCE_REFERENCE_REQUIREMENTS[number];
export type GuidanceNoteTemplate = typeof GUIDANCE_NOTE_TEMPLATES[number];

export interface StructuredGuidance {
  id: string;
  version: number;
  guidanceType: GuidanceType;
  inspectionArea: InspectionArea;
  action: GuidanceAction;
  priority: GuidancePriority;
  applicableProductId: string | null;
  applicableVariantId: string | null;
  applicableReleaseRange: string | null;
  referenceRequirement: GuidanceReferenceRequirement;
  structuredNote: GuidanceNoteTemplate;
}

export class StructuredGuidanceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredGuidanceValidationError";
  }
}

const NOTE_COPY: Record<GuidanceNoteTemplate, string | null> = {
  none: null,
  glare_may_obscure_detail: "Glare may obscure the selected inspection area.",
  compression_may_reduce_legibility: "Compression may reduce legibility in the selected inspection area.",
  angle_may_hide_edge: "The submitted angle may hide an edge in the selected inspection area.",
  release_variants_may_differ: "Document visible release variation without treating variation alone as a risk indicator.",
  reference_provenance_required: "Disclose reference provenance and reliability for any comparison.",
  physical_detail_not_visible_in_image: "Image evidence cannot establish an unphotographed physical detail.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new StructuredGuidanceValidationError(`${field} has an unsupported value`);
  }
  return value as T[number];
}

function nullableUuid(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new StructuredGuidanceValidationError(`${field} must be a UUID or null`);
  }
  return value;
}

export function isGuidanceCombinationAllowed(guidance: Pick<
  StructuredGuidance,
  "guidanceType" | "action" | "referenceRequirement" | "structuredNote" |
  "applicableProductId" | "applicableVariantId" | "applicableReleaseRange"
>): boolean {
  if (guidance.action === "compare" && guidance.referenceRequirement === "none") return false;
  if (guidance.guidanceType === "inspection_priority") return guidance.action === "inspect";
  if (guidance.guidanceType === "comparison_instruction") return guidance.action === "compare";
  if (guidance.guidanceType === "evidence_requirement") return guidance.action === "request_additional_evidence";
  if (guidance.guidanceType === "known_limitation") {
    return ["reduce_assessability", "mark_not_applicable"].includes(guidance.action) && guidance.structuredNote !== "none";
  }
  return ["inspect", "compare", "mark_not_applicable"].includes(guidance.action) && Boolean(
    guidance.applicableProductId || guidance.applicableVariantId || guidance.applicableReleaseRange,
  );
}

export function parseStructuredGuidance(value: unknown): StructuredGuidance {
  if (!isRecord(value)) throw new StructuredGuidanceValidationError("structured guidance must be an object");
  const guidance: StructuredGuidance = {
    id: typeof value.id === "string" ? value.id : "",
    version: typeof value.version === "number" && Number.isInteger(value.version) && value.version > 0 ? value.version : 0,
    guidanceType: enumValue(value.guidance_type, GUIDANCE_TYPES, "guidance_type"),
    inspectionArea: enumValue(value.inspection_area, INSPECTION_AREAS, "inspection_area"),
    action: enumValue(value.action, GUIDANCE_ACTIONS, "action"),
    priority: enumValue(value.priority, GUIDANCE_PRIORITIES, "priority"),
    applicableProductId: nullableUuid(value.applicable_product_id, "applicable_product_id"),
    applicableVariantId: nullableUuid(value.applicable_variant_id, "applicable_variant_id"),
    applicableReleaseRange: value.applicable_release_range === null || typeof value.applicable_release_range === "string"
      ? value.applicable_release_range
      : null,
    referenceRequirement: enumValue(value.reference_requirement, GUIDANCE_REFERENCE_REQUIREMENTS, "reference_requirement"),
    structuredNote: enumValue(value.structured_note, GUIDANCE_NOTE_TEMPLATES, "structured_note"),
  };
  if (!guidance.id || !guidance.version) throw new StructuredGuidanceValidationError("guidance identity/version is invalid");
  if (!isGuidanceCombinationAllowed(guidance)) {
    throw new StructuredGuidanceValidationError("guidance type/action/applicability combination is invalid");
  }
  return guidance;
}

export function renderStructuredGuidance(guidance: StructuredGuidance): string {
  const applicability = [
    guidance.applicableProductId ? `product_id=${guidance.applicableProductId}` : null,
    guidance.applicableVariantId ? `variant_id=${guidance.applicableVariantId}` : null,
    guidance.applicableReleaseRange ? `release_range=${guidance.applicableReleaseRange}` : null,
  ].filter(Boolean).join(", ") || "all applicable products";
  const note = NOTE_COPY[guidance.structuredNote];
  return [
    `Non-authoritative structured inspection guidance version ${guidance.version}:`,
    `type=${guidance.guidanceType}; area=${guidance.inspectionArea}; action=${guidance.action}; priority=${guidance.priority}; reference_requirement=${guidance.referenceRequirement}; applicability=${applicability}.`,
    note,
    "This guidance may change inspection coverage only. It cannot establish a finding, change an observation status, alter a dimension or verdict, or override uncertainty and schema rules.",
  ].filter(Boolean).join("\n");
}
