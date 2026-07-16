export const LISTING_LEGACY_DISCLOSURE =
  "Listing-image assessment — the physical item was not examined. This result evaluates only the supplied listing images and is not a physical-item certification.";

export function getAnalysisSourceDisclosure(analysisSource: string | null | undefined): string | null {
  return analysisSource === "listing_legacy" ? LISTING_LEGACY_DISCLOSURE : null;
}

export function getSourceAwareVerdict(score: number, analysisSource: string | null | undefined): string {
  if (analysisSource === "listing_legacy") {
    if (score >= 80) return "LISTING IMAGES APPEAR CONSISTENT";
    if (score >= 50) return "LISTING EVIDENCE INCONCLUSIVE";
    return "LISTING IMAGES SHOW RISK INDICATORS";
  }

  if (score >= 80) return "HIGHLY LIKELY AUTHENTIC";
  if (score >= 50) return "UNCERTAIN — REVIEW NEEDED";
  return "POTENTIAL COUNTERFEIT";
}
