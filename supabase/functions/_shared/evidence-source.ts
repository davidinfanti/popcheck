export type AnalysisSource = "physical_scan" | "listing_legacy";

export interface CanonicalEvidence {
  imageUrls: string[];
  source: AnalysisSource;
}

export class EvidenceValidationError extends Error {
  constructor(
    public readonly code:
      | "MISSING_CANONICAL_IMAGES"
      | "INVALID_IMAGE_URL"
      | "UNAUTHORIZED_STORAGE_OBJECT"
      | "UNAPPROVED_IMAGE_SOURCE",
    message: string,
  ) {
    super(message);
    this.name = "EvidenceValidationError";
  }
}

function validateModeAUrl(url: URL, userId: string, supabaseOrigin: string): boolean {
  if (url.origin !== supabaseOrigin) return false;

  const prefix = "/storage/v1/object/public/funko-images/";
  if (!url.pathname.startsWith(prefix)) {
    throw new EvidenceValidationError(
      "UNAPPROVED_IMAGE_SOURCE",
      "Mode A evidence must come from the funko-images bucket.",
    );
  }

  const objectName = decodeURIComponent(url.pathname.slice(prefix.length));
  const [ownerFolder, ...remainingPath] = objectName.split("/");
  if (ownerFolder !== userId || remainingPath.length === 0 || remainingPath.some((part) => !part || part === "..")) {
    throw new EvidenceValidationError(
      "UNAUTHORIZED_STORAGE_OBJECT",
      "The stored image does not belong to the submission owner.",
    );
  }

  return true;
}

function validateLegacyListingUrl(url: URL): boolean {
  return url.hostname.toLowerCase() === "i.ebayimg.com" && url.pathname.startsWith("/images/");
}

export function resolveCanonicalEvidence(input: {
  canonicalUrls: string[] | null | undefined;
  requestedUrls?: string[] | null;
  userId: string;
  supabaseUrl: string;
}): CanonicalEvidence {
  const { canonicalUrls, userId, supabaseUrl } = input;
  if (!canonicalUrls?.length) {
    throw new EvidenceValidationError("MISSING_CANONICAL_IMAGES", "No canonical images are attached to this submission.");
  }

  const supabaseOrigin = new URL(supabaseUrl).origin;
  let hasLegacyListingImage = false;

  const imageUrls = canonicalUrls.map((rawUrl) => {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new EvidenceValidationError("INVALID_IMAGE_URL", "A canonical image URL is invalid.");
    }

    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
      throw new EvidenceValidationError("INVALID_IMAGE_URL", "Canonical image URLs must use HTTPS without credentials or custom ports.");
    }

    if (validateModeAUrl(parsed, userId, supabaseOrigin)) return parsed.toString();

    if (validateLegacyListingUrl(parsed)) {
      hasLegacyListingImage = true;
      return parsed.toString();
    }

    throw new EvidenceValidationError(
      "UNAPPROVED_IMAGE_SOURCE",
      "Canonical images must be owned Supabase objects or approved legacy eBay listing images.",
    );
  });

  return {
    imageUrls,
    source: hasLegacyListingImage ? "listing_legacy" : "physical_scan",
  };
}
