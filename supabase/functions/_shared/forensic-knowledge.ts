import {
  ObservationValidationError,
  type ObservationOutput,
} from "./assessment/contract.ts";

export type ForensicKnowledgeStatus = "draft" | "verified" | "retired";
export type ForensicImageView = "front" | "rear" | "left" | "right" | "top" | "bottom" | "macro";

export interface ForensicKnowledgeCandidate {
  id: string;
  kind: "reference_image" | "forensic_rule" | "counterfeit_indicator";
  productId: string;
  variantId: string;
  status: ForensicKnowledgeStatus;
  reliabilityTier: "limited" | "verified";
  provenanceType: string | null;
  provenanceDescription: string | null;
  sourceOwner: string | null;
  validatorIdentity: string | null;
  validationDate: string | null;
  imageView: ForensicImageView;
  visibleRegion: string;
}

export interface ForensicKnowledgeSelection {
  productId: string;
  variantId: string;
  imageView: ForensicImageView;
  visibleRegion: string | null;
}

export function forensicKnowledgeIdentifier(item: Pick<ForensicKnowledgeCandidate, "id" | "kind">): string {
  const prefix = item.kind === "reference_image"
    ? "forensic-reference"
    : item.kind === "forensic_rule"
    ? "forensic-rule"
    : "counterfeit-indicator";
  return `${prefix}:${item.id}`;
}

// This deliberately requires the exact curated variant. A candidate Pop number,
// barcode, sticker, or model guess is not enough to select a product reference.
export function selectEligibleForensicKnowledge(
  candidates: ForensicKnowledgeCandidate[],
  selection: ForensicKnowledgeSelection,
): ForensicKnowledgeCandidate[] {
  return candidates.filter((item) =>
    item.status === "verified" &&
    item.reliabilityTier === "verified" &&
    item.productId === selection.productId &&
    item.variantId === selection.variantId &&
    item.imageView === selection.imageView &&
    (selection.visibleRegion === null || item.visibleRegion === selection.visibleRegion) &&
    Boolean(item.provenanceType?.trim()) &&
    Boolean(item.provenanceDescription?.trim()) &&
    Boolean(item.sourceOwner?.trim()) &&
    Boolean(item.validatorIdentity?.trim()) &&
    Boolean(item.validationDate)
  );
}

export function validateForensicKnowledgeTraceability(
  output: ObservationOutput,
  eligibleKnowledgeIds: ReadonlySet<string>,
): ObservationOutput {
  for (const [index, observation] of output.observations.entries()) {
    if (observation.referenceUsed === null) {
      if (observation.referenceReliability !== "none") {
        throw new ObservationValidationError(`observations[${index}] has reference reliability without a traceable knowledge identifier`);
      }
      continue;
    }
    if (observation.referenceReliability !== "verified") {
      throw new ObservationValidationError(`observations[${index}] may not use draft, retired, limited, or legacy knowledge`);
    }
    if (!eligibleKnowledgeIds.has(observation.referenceUsed)) {
      throw new ObservationValidationError(`observations[${index}] references knowledge that is not eligible for this exact variant/view`);
    }
    if (observation.imageIndex === null || observation.visibleRegion === null) {
      throw new ObservationValidationError(`observations[${index}] knowledge-derived comparison requires a submitted image index and visible region`);
    }
  }
  return output;
}
