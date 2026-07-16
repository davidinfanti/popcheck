import jsPDF from "jspdf";
import QRCode from "qrcode";
import { getAnalysisSourceDisclosure } from "@/lib/analysisSourceDisclosure";
import type { CandidateIdentity, StructuredObservation } from "@/lib/assessment/contract";
import type { AssessmentDimensions, DecisionResult } from "@/lib/assessment/decisionEngine";

export interface AssessmentReportData {
  reportId: string;
  runId: string;
  runKind: "phase_1b" | "legacy";
  date: string;
  publicUrl: string;
  analysisSource: string;
  model: string;
  promptVersion: string;
  decisionEngineVersion: string;
  identity: CandidateIdentity;
  dimensions?: AssessmentDimensions;
  decision?: DecisionResult;
  observations: StructuredObservation[];
  legacyScore?: number | null;
  frontImageUrl?: string | null;
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const LEFT = 20;
const RIGHT = 190;
const CONTENT_WIDTH = RIGHT - LEFT;

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function verdictColor(verdictClass?: string): [number, number, number] {
  if (verdictClass === "strong_counterfeit_indicators") return [156, 39, 39];
  if (verdictClass === "elevated_counterfeit_risk") return [180, 95, 20];
  if (verdictClass === "unable_to_assess" || verdictClass === "inconclusive") return [120, 92, 20];
  return [45, 100, 110];
}

export async function buildAssessmentReportPDF(data: AssessmentReportData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const accent = verdictColor(data.decision?.verdictClass);
  const listingDisclosure = getAnalysisSourceDisclosure(data.analysisSource);
  let y = 22;

  const ensureSpace = (needed: number) => {
    if (y + needed <= PAGE_HEIGHT - 24) return;
    doc.addPage();
    y = 22;
  };

  const heading = (title: string) => {
    ensureSpace(14);
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.6);
    doc.line(LEFT, y, RIGHT, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(45, 45, 45);
    doc.text(title, LEFT, y);
    y += 6;
  };

  const paragraph = (text: string, tone: [number, number, number] = [75, 75, 75]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...tone);
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
    ensureSpace(lines.length * 4 + 2);
    doc.text(lines, LEFT, y);
    y += lines.length * 4 + 2;
  };

  const bulletList = (items: string[], emptyText: string) => {
    if (!items.length) {
      paragraph(emptyText, [110, 110, 110]);
      return;
    }
    for (const item of items) {
      const lines = doc.splitTextToSize(`- ${item}`, CONTENT_WIDTH - 3);
      ensureSpace(lines.length * 4 + 1);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(70, 70, 70);
      doc.text(lines, LEFT + 2, y);
      y += lines.length * 4 + 1;
    }
  };

  doc.setFillColor(249, 249, 247);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  doc.setTextColor(235, 235, 232);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.text("AI-ASSISTED ASSESSMENT", PAGE_WIDTH / 2, PAGE_HEIGHT / 2, { align: "center", angle: 35 });

  doc.setFontSize(10);
  doc.setTextColor(...accent);
  doc.text("POPCHECK AI", LEFT, y);
  doc.setFontSize(22);
  doc.setTextColor(30, 30, 30);
  y += 10;
  doc.text("POPCHECK AI Assessment Report", LEFT, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(95, 95, 95);
  doc.text(`Report ${data.reportId} | Run ${data.runId}`, LEFT, y);
  y += 5;
  doc.text(`Created ${data.date}`, LEFT, y);
  y += 9;

  if (listingDisclosure) {
    doc.setFillColor(255, 247, 225);
    doc.setDrawColor(195, 135, 35);
    const lines = doc.splitTextToSize(listingDisclosure, CONTENT_WIDTH - 10);
    const height = lines.length * 4 + 8;
    doc.roundedRect(LEFT, y, CONTENT_WIDTH, height, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(130, 85, 15);
    doc.text(lines, LEFT + 5, y + 6);
    y += height + 7;
  }

  if (data.frontImageUrl) {
    const image = await loadImageAsBase64(data.frontImageUrl);
    if (image) {
      doc.setDrawColor(210, 210, 210);
      doc.roundedRect(RIGHT - 35, y, 35, 35, 2, 2, "S");
      doc.addImage(image, "JPEG", RIGHT - 34, y + 1, 33, 33);
    }
  }

  const identityLines = [
    `Product: ${data.identity.popName || "Not identified"}`,
    `Pop number: ${data.identity.popNumber || "Not visible"}`,
    `Series: ${data.identity.series || "Not visible"}`,
    `Barcode: ${data.identity.barcode || "Not visible"}`,
    `Production code: ${data.identity.productionCode || "Not visible"}`,
  ];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(55, 55, 55);
  for (const line of identityLines) {
    doc.text(line, LEFT, y);
    y += 5;
  }
  y += 4;

  heading(data.runKind === "legacy" ? "Legacy assessment" : "Final verdict");
  if (data.runKind === "legacy") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(100, 85, 55);
    doc.text("Legacy V-STAMP score (uncalibrated historical data)", LEFT, y);
    y += 7;
    paragraph(`Historical value: ${data.legacyScore ?? "not available"}/100. This value is retained for compatibility only. It is not a calibrated probability and is not used by the Phase 1B decision engine.`);
  } else if (data.decision && data.dimensions) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...accent);
    doc.text(data.decision.userFacingTitle, LEFT, y);
    y += 7;
    paragraph(data.decision.explanation);

    heading("Assessment dimensions");
    const dimensionLines = [
      `Assessment reliability: ${data.dimensions.assessmentReliability}`,
      `Evidence quality: ${data.dimensions.evidenceQuality}`,
      `Identity status: ${data.dimensions.identityStatus}`,
      `Reference coverage: ${data.dimensions.referenceCoverage}`,
      `Visual consistency: ${data.dimensions.visualConsistency}`,
      `Code consistency: ${data.dimensions.codeConsistency}`,
      `Counterfeit indicator strength: ${data.dimensions.counterfeitIndicatorStrength}`,
    ];
    bulletList(dimensionLines, "No dimensions available.");

    const supporting = data.observations
      .filter((item) => item.findingType === "supporting_consistency" && item.observationStatus === "observed")
      .map((item) => `${item.code}: ${item.finding}`);
    const risks = data.observations
      .filter((item) => item.findingType === "risk_indicator" && item.observationStatus === "observed")
      .map((item) => `${item.code} (${item.severity}): ${item.finding}`);

    heading("Visible supporting evidence");
    bulletList(supporting, "No supporting consistency observation was recorded.");
    heading("Visible risk indicators");
    bulletList(risks, "No material visible risk indicator was recorded.");
    heading("Limitations");
    bulletList(data.decision.limitations, "No additional limitation was recorded.");
    heading("Additional evidence requested");
    bulletList(data.decision.missingEvidence, "No additional photograph was requested.");
  }

  heading("Versions and traceability");
  bulletList([
    `Model: ${data.model}`,
    `Prompt: ${data.promptVersion}`,
    `Decision engine: ${data.decisionEngineVersion}`,
    `Evidence source: ${data.analysisSource}`,
  ], "Version metadata unavailable.");

  heading("Important limitation");
  paragraph(
    data.analysisSource === "listing_legacy"
      ? "This report evaluates supplied listing images only. The physical item was not examined. It is not a physical-item certification."
      : "This AI-assisted assessment evaluates consistency with the evidence and references available to POPCHECK. It is not a legal or expert certificate of authenticity.",
  );

  ensureSpace(34);
  try {
    const qr = await QRCode.toDataURL(data.publicUrl, { width: 220, margin: 1 });
    doc.addImage(qr, "PNG", LEFT, y, 24, 24);
    doc.setFontSize(7);
    doc.setTextColor(105, 105, 105);
    doc.text("Open this report", LEFT + 29, y + 12);
    y += 29;
  } catch {
    paragraph("Shared report link could not be encoded.");
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(225, 225, 225);
    doc.line(LEFT, PAGE_HEIGHT - 16, RIGHT, PAGE_HEIGHT - 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(140, 140, 140);
    doc.text(`POPCHECK AI Assessment Report | Page ${page} of ${pages}`, LEFT, PAGE_HEIGHT - 11);
  }

  return doc;
}

export async function generateAssessmentReportPDF(data: AssessmentReportData): Promise<void> {
  const doc = await buildAssessmentReportPDF(data);
  const product = (data.identity.popName || "Report").replace(/[^A-Za-z0-9_-]+/g, "_");
  doc.save(`PopCheck_AI_Assessment_${product}_${data.runId.substring(0, 8)}.pdf`);
}
