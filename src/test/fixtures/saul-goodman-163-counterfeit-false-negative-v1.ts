import type { ObservationOutput } from "@/lib/assessment/contract";

/**
 * Closed-beta regression fixture redacted from assessment run
 * e9b0cd88-fdee-4e25-899f-613ca92a51e2. It intentionally contains no image
 * URLs, image bytes, user identifiers, credentials, or raw provider payload.
 */
export const saulGoodman163CounterfeitFalseNegativeV1: ObservationOutput = {
  schemaVersion: "popcheck-observation-schema-v1",
  candidateIdentity: {
    popName: "Saul Goodman",
    popNumber: "163",
    series: "Breaking Bad",
    barcode: "849803043469",
    productionCode: null,
    factory: null,
    releaseYear: "2014",
    sticker: "PSA/DNA Certified",
    region: null,
    copyrightStamp: null,
  },
  observations: [
    {
      code: "IMAGE_QUALITY", category: "evidence_quality", findingType: "supporting_consistency", observationStatus: "observed", severity: "informational", confidenceLevel: "high", imageIndex: 0, visibleRegion: "Entire box front", finding: "The submitted images are of high resolution and clarity, allowing for detailed inspection of the packaging and labels.", limitation: null, referenceUsed: null, referenceReliability: "none", modelVersion: "gemini-3.5-flash",
    },
    {
      code: "IDENTITY_TEXT", category: "identity", findingType: "supporting_consistency", observationStatus: "observed", severity: "informational", confidenceLevel: "high", imageIndex: 0, visibleRegion: "Front of the packaging", finding: "The text on the packaging identifies the figure as Saul Goodman from the Breaking Bad series, numbered 163.", limitation: null, referenceUsed: null, referenceReliability: "none", modelVersion: "gemini-3.5-flash",
    },
    {
      code: "STICKER_DETAIL", category: "sticker", findingType: "supporting_consistency", observationStatus: "observed", severity: "informational", confidenceLevel: "high", imageIndex: 0, visibleRegion: "Bottom right of front window and top label", finding: "A PSA/DNA sticker and a corresponding case label are visible.", limitation: null, referenceUsed: null, referenceReliability: "none", modelVersion: "gemini-3.5-flash",
    },
    {
      code: "PRODUCTION_CODE", category: "code", findingType: "missing_evidence", observationStatus: "not_visible", severity: "informational", confidenceLevel: "high", imageIndex: 4, visibleRegion: "Bottom of the box", finding: "The production code stamp or sticker is not visible on the bottom panel of the box.", limitation: "The bottom panel has no visible production code available for inspection.", referenceUsed: null, referenceReliability: "none", modelVersion: "gemini-3.5-flash",
    },
    {
      code: "BARCODE", category: "code", findingType: "supporting_consistency", observationStatus: "observed", severity: "informational", confidenceLevel: "high", imageIndex: 4, visibleRegion: "Bottom right of the bottom box panel", finding: "The printed UPC barcode is visibly readable.", limitation: null, referenceUsed: null, referenceReliability: "none", modelVersion: "gemini-3.5-flash",
    },
    {
      code: "COPYRIGHT_STAMP", category: "figure", findingType: "missing_evidence", observationStatus: "not_visible", severity: "informational", confidenceLevel: "high", imageIndex: null, visibleRegion: "Figure feet/head", finding: "The physical copyright stamp on the figure itself is not visible due to the packaging.", limitation: "The figure remains inside the box, preventing direct inspection of the copyright stamp.", referenceUsed: null, referenceReliability: "none", modelVersion: "gemini-3.5-flash",
    },
  ],
  requestedEvidence: [
    "Close-up of the figure's feet/head showing the copyright stamp",
    "Close-up of any embossed or printed production code on the bottom of the box",
  ],
  limitations: [
    "The figure cannot be removed from the box or case, limiting inspection of physical markings on the figure itself.",
    "No reference material was available for comparison.",
  ],
};

export const saulGoodman163CounterfeitRegressionMetadataV1 = {
  fixtureVersion: "saul-goodman-163-counterfeit-false-negative-v1",
  sourceRunId: "e9b0cd88-fdee-4e25-899f-613ca92a51e2",
  knownGroundTruth: "counterfeit",
  historicalVerdict: "no_material_anomaly_detected",
  historicalDimensions: {
    evidenceQuality: "sufficient",
    identityStatus: "identified",
    referenceCoverage: "none",
    counterfeitIndicatorStrength: "none_observed",
    assessmentReliability: "medium",
  },
  source: "physical_scan",
} as const;
