import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LISTING_LEGACY_DISCLOSURE,
  getAnalysisSourceDisclosure,
  getSourceAwareVerdict,
} from "@/lib/analysisSourceDisclosure";

describe("legacy listing disclosure", () => {
  it("discloses that listing evidence is not a physical-item examination or certification", () => {
    expect(getAnalysisSourceDisclosure("listing_legacy")).toBe(LISTING_LEGACY_DISCLOSURE);
    expect(LISTING_LEGACY_DISCLOSURE).toContain("physical item was not examined");
    expect(LISTING_LEGACY_DISCLOSURE).toContain("not a physical-item certification");
    expect(getSourceAwareVerdict(90, "listing_legacy")).toBe("LISTING IMAGES APPEAR CONSISTENT");
  });

  it("does not show listing disclosure for a physical scan", () => {
    expect(getAnalysisSourceDisclosure("physical_scan")).toBeNull();
    expect(getSourceAwareVerdict(90, "physical_scan")).toBe("HIGHLY LIKELY AUTHENTIC");
  });

  it("uses the same disclosure logic in Results and generated PDFs", () => {
    const results = readFileSync(resolve(process.cwd(), "src/pages/Results.tsx"), "utf8");
    const pdf = readFileSync(resolve(process.cwd(), "src/utils/generateCertificate.ts"), "utf8");

    expect(results).toContain("getAnalysisSourceDisclosure(analysisSource)");
    expect(pdf).toContain("getAnalysisSourceDisclosure(data.analysisSource)");
    expect(pdf).toContain("Listing Image Assessment Report");
    expect(pdf).toContain("This is not a physical-item certification");
    const edge = readFileSync(resolve(process.cwd(), "supabase/functions/analyze-funko/index.ts"), "utf8");
    expect(edge).toContain("The physical item was not examined");
    expect(edge).toContain("Do not claim physical handling");
  });
});
