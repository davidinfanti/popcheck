export const LISTING_LEGACY_DISCLOSURE =
  "Listing-image assessment: the physical item was not examined. This result evaluates only the supplied listing images and is not a physical-item certification.";

export function getAnalysisSourceDisclosure(analysisSource: string | null | undefined): string | null {
  return analysisSource === "listing_legacy" ? LISTING_LEGACY_DISCLOSURE : null;
}
