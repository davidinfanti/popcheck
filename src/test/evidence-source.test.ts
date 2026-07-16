import { describe, expect, it } from "vitest";
import {
  EvidenceValidationError,
  resolveCanonicalEvidence,
} from "../../supabase/functions/_shared/evidence-source";

const supabaseUrl = "https://project-ref.supabase.co";
const ownerId = "11111111-1111-4111-8111-111111111111";
const ownedImage = `${supabaseUrl}/storage/v1/object/public/funko-images/${ownerId}/front.jpg`;

describe("canonical evidence resolution", () => {
  it("ignores mismatched request URLs and returns only the owned row's canonical images", () => {
    const result = resolveCanonicalEvidence({
      canonicalUrls: [ownedImage],
      requestedUrls: ["https://attacker.example/forged.jpg"],
      userId: ownerId,
      supabaseUrl,
    });

    expect(result.imageUrls).toEqual([ownedImage]);
    expect(result.source).toBe("physical_scan");
  });

  it("rejects another user's stored object", () => {
    expect(() => resolveCanonicalEvidence({
      canonicalUrls: [`${supabaseUrl}/storage/v1/object/public/funko-images/22222222-2222-4222-8222-222222222222/front.jpg`],
      userId: ownerId,
      supabaseUrl,
    })).toThrowError(expect.objectContaining({ code: "UNAUTHORIZED_STORAGE_OBJECT" }));
  });

  it("rejects arbitrary external URLs as Mode A evidence", () => {
    expect(() => resolveCanonicalEvidence({
      canonicalUrls: ["https://images.attacker.example/front.jpg"],
      userId: ownerId,
      supabaseUrl,
    })).toThrowError(expect.objectContaining({ code: "UNAPPROVED_IMAGE_SOURCE" }));
  });

  it("rejects missing canonical evidence with a controlled error", () => {
    expect(() => resolveCanonicalEvidence({
      canonicalUrls: [],
      userId: ownerId,
      supabaseUrl,
    })).toThrowError(expect.objectContaining({ code: "MISSING_CANONICAL_IMAGES" }));
  });

  it("isolates approved eBay image evidence as the legacy listing path", () => {
    const listingImage = "https://i.ebayimg.com/images/g/example/s-l1600.jpg";
    const result = resolveCanonicalEvidence({
      canonicalUrls: [listingImage],
      userId: ownerId,
      supabaseUrl,
    });

    expect(result).toEqual({ imageUrls: [listingImage], source: "listing_legacy" });
  });

  it("rejects non-HTTPS and credential-bearing image URLs", () => {
    for (const url of [
      `${supabaseUrl.replace("https:", "http:")}/storage/v1/object/public/funko-images/${ownerId}/front.jpg`,
      `https://user:password@project-ref.supabase.co/storage/v1/object/public/funko-images/${ownerId}/front.jpg`,
    ]) {
      expect(() => resolveCanonicalEvidence({
        canonicalUrls: [url],
        userId: ownerId,
        supabaseUrl,
      })).toThrow(EvidenceValidationError);
    }
  });
});
