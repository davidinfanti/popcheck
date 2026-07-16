import {
  DECISION_ENGINE_VERSION,
  type CandidateIdentity,
  type ObservationOutput,
  type StructuredObservation,
} from "./contract.ts";

export type EvidenceQuality = "sufficient" | "limited" | "insufficient";
export type IdentityStatus = "identified" | "probable_match" | "ambiguous" | "unidentified";
export type ReferenceCoverage = "verified" | "limited" | "legacy_unverified" | "none";
export type Consistency = "consistent" | "mostly_consistent" | "mixed" | "inconsistent" | "not_assessable";
export type CounterfeitIndicatorStrength = "none_observed" | "weak" | "moderate" | "strong" | "not_assessable";
export type AssessmentReliability = "high" | "medium" | "low" | "not_assessable";

export interface AssessmentDimensions {
  evidenceQuality: EvidenceQuality;
  identityStatus: IdentityStatus;
  referenceCoverage: ReferenceCoverage;
  visualConsistency: Consistency;
  codeConsistency: Consistency;
  counterfeitIndicatorStrength: CounterfeitIndicatorStrength;
  assessmentReliability: AssessmentReliability;
}

export type VerdictClass =
  | "consistent_with_verified_references"
  | "no_material_anomaly_detected"
  | "inconclusive"
  | "elevated_counterfeit_risk"
  | "strong_counterfeit_indicators"
  | "unable_to_assess";

export interface DecisionResult {
  verdictClass: VerdictClass;
  userFacingTitle: string;
  explanation: string;
  supportingObservations: string[];
  riskObservations: string[];
  limitations: string[];
  missingEvidence: string[];
  engineVersion: typeof DECISION_ENGINE_VERSION;
}

export interface AssessmentResult {
  identity: CandidateIdentity;
  observations: StructuredObservation[];
  dimensions: AssessmentDimensions;
  decision: DecisionResult;
}

const severityRank = { informational: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;

function observedMaterialRisks(observations: StructuredObservation[]): StructuredObservation[] {
  return observations.filter((observation) =>
    observation.findingType === "risk_indicator" && observation.observationStatus === "observed"
  );
}

function deriveEvidenceQuality(output: ObservationOutput): EvidenceQuality {
  const assessable = output.observations.filter((item) =>
    item.observationStatus === "observed" || item.observationStatus === "not_observed"
  ).length;
  const unavailable = output.observations.filter((item) =>
    item.observationStatus === "not_visible" || item.observationStatus === "uncertain"
  ).length;
  const stockPhoto = output.observations.some((item) =>
    item.code === "STOCK_PHOTO" && item.observationStatus === "observed"
  );

  if (assessable < 2) return "insufficient";
  if (stockPhoto || unavailable > assessable || output.requestedEvidence.length >= 3) return "limited";
  return "sufficient";
}

function deriveIdentityStatus(identity: CandidateIdentity, observations: StructuredObservation[]): IdentityStatus {
  const identityUncertain = observations.some((item) =>
    item.category === "identity" && item.observationStatus === "uncertain"
  );
  if (identity.popName && identity.popNumber && !identityUncertain) return "identified";
  if (identityUncertain) return "ambiguous";
  if (identity.popName || identity.popNumber || identity.series) return "probable_match";
  return "unidentified";
}

function deriveReferenceCoverage(observations: StructuredObservation[]): ReferenceCoverage {
  if (observations.some((item) => item.referenceReliability === "verified")) return "verified";
  if (observations.some((item) => item.referenceReliability === "limited")) return "limited";
  if (observations.some((item) => item.referenceReliability === "legacy_unverified")) return "legacy_unverified";
  return "none";
}

function deriveConsistency(observations: StructuredObservation[], categories: string[]): Consistency {
  const relevant = observations.filter((item) => categories.includes(item.category));
  const risks = observedMaterialRisks(relevant);
  const maxRisk = risks.reduce((max, item) => Math.max(max, severityRank[item.severity]), -1);
  if (maxRisk >= severityRank.high) return "inconsistent";
  if (maxRisk >= severityRank.medium) return "mixed";
  if (maxRisk >= severityRank.low) return "mostly_consistent";
  if (relevant.some((item) => item.findingType === "supporting_consistency" && item.observationStatus === "observed")) {
    return "consistent";
  }
  return "not_assessable";
}

function deriveCounterfeitStrength(observations: StructuredObservation[]): CounterfeitIndicatorStrength {
  const risks = observedMaterialRisks(observations);
  const maxRisk = risks.reduce((max, item) => Math.max(max, severityRank[item.severity]), -1);
  if (maxRisk >= severityRank.high) return "strong";
  if (maxRisk >= severityRank.medium) return "moderate";
  if (maxRisk >= severityRank.low) return "weak";
  const assessedRiskArea = observations.some((item) =>
    item.observationStatus === "observed" || item.observationStatus === "not_observed"
  );
  return assessedRiskArea ? "none_observed" : "not_assessable";
}

function deriveReliability(dimensions: Omit<AssessmentDimensions, "assessmentReliability">): AssessmentReliability {
  if (dimensions.evidenceQuality === "insufficient") return "not_assessable";
  if (
    dimensions.evidenceQuality === "sufficient" &&
    dimensions.identityStatus === "identified" &&
    dimensions.referenceCoverage === "verified"
  ) return "high";
  if (
    dimensions.evidenceQuality === "sufficient" &&
    !["ambiguous", "unidentified"].includes(dimensions.identityStatus)
  ) return "medium";
  return "low";
}

export function deriveDimensions(output: ObservationOutput): AssessmentDimensions {
  const base = {
    evidenceQuality: deriveEvidenceQuality(output),
    identityStatus: deriveIdentityStatus(output.candidateIdentity, output.observations),
    referenceCoverage: deriveReferenceCoverage(output.observations),
    visualConsistency: deriveConsistency(output.observations, ["packaging", "typography", "figure", "sticker"]),
    codeConsistency: deriveConsistency(output.observations, ["code"]),
    counterfeitIndicatorStrength: deriveCounterfeitStrength(output.observations),
  };
  return { ...base, assessmentReliability: deriveReliability(base) };
}

const verdictCopy: Record<VerdictClass, { title: string; explanation: string }> = {
  consistent_with_verified_references: {
    title: "Consistent with verified references",
    explanation: "The visible evidence is consistent with verified references. This is an evidence comparison, not certification of authenticity.",
  },
  no_material_anomaly_detected: {
    title: "No material anomaly detected",
    explanation: "No material anomaly was detected in the visible evidence. This does not establish or certify authenticity.",
  },
  inconclusive: {
    title: "Inconclusive assessment",
    explanation: "The available evidence is conflicting, ambiguous, or materially incomplete, so no substantive conclusion is supported.",
  },
  elevated_counterfeit_risk: {
    title: "Elevated counterfeit risk",
    explanation: "At least one material, visible, and traceable inconsistency was observed. Expert review or stronger evidence is recommended.",
  },
  strong_counterfeit_indicators: {
    title: "Strong counterfeit indicators",
    explanation: "Strong traceable indicators were observed in the submitted evidence. This conclusion is based on visible findings, not missing photographs.",
  },
  unable_to_assess: {
    title: "Unable to assess",
    explanation: "The submitted evidence is insufficient for a substantive authenticity-risk assessment.",
  },
};

function selectVerdict(dimensions: AssessmentDimensions): VerdictClass {
  if (dimensions.evidenceQuality === "insufficient") return "unable_to_assess";
  if (dimensions.counterfeitIndicatorStrength === "strong") return "strong_counterfeit_indicators";
  if (dimensions.counterfeitIndicatorStrength === "moderate") return "elevated_counterfeit_risk";
  if (["ambiguous", "unidentified"].includes(dimensions.identityStatus)) return "inconclusive";
  if (
    dimensions.evidenceQuality === "limited" ||
    ["mixed", "inconsistent"].includes(dimensions.visualConsistency) ||
    ["mixed", "inconsistent"].includes(dimensions.codeConsistency)
  ) return "inconclusive";
  if (
    dimensions.referenceCoverage === "verified" &&
    dimensions.identityStatus === "identified" &&
    ["consistent", "mostly_consistent"].includes(dimensions.visualConsistency) &&
    ["consistent", "mostly_consistent", "not_assessable"].includes(dimensions.codeConsistency)
  ) return "consistent_with_verified_references";
  if (["none_observed", "weak"].includes(dimensions.counterfeitIndicatorStrength)) {
    return "no_material_anomaly_detected";
  }
  return "inconclusive";
}

export function decideAssessment(output: ObservationOutput): AssessmentResult {
  const dimensions = deriveDimensions(output);
  const verdictClass = selectVerdict(dimensions);
  const copy = verdictCopy[verdictClass];
  const deterministicLimitations = [
    dimensions.referenceCoverage === "legacy_unverified" ? "Only legacy, unverified reference material was available." : null,
    dimensions.referenceCoverage === "none" ? "No reference material was available for comparison." : null,
    ["ambiguous", "unidentified"].includes(dimensions.identityStatus) ? "Product identity could not be established from visible evidence." : null,
    dimensions.evidenceQuality !== "sufficient" ? "Evidence quality limits the assessment." : null,
  ].filter((value): value is string => Boolean(value));

  return {
    identity: output.candidateIdentity,
    observations: output.observations,
    dimensions,
    decision: {
      verdictClass,
      userFacingTitle: copy.title,
      explanation: copy.explanation,
      supportingObservations: output.observations
        .filter((item) => item.findingType === "supporting_consistency" && item.observationStatus === "observed")
        .map((item) => item.code),
      riskObservations: observedMaterialRisks(output.observations).map((item) => item.code),
      limitations: [...new Set([...output.limitations, ...deterministicLimitations])],
      missingEvidence: [...new Set(output.requestedEvidence)],
      engineVersion: DECISION_ENGINE_VERSION,
    },
  };
}
