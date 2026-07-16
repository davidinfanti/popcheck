import jsPDF from "jspdf";
import QRCode from "qrcode";
import { getAnalysisSourceDisclosure, getSourceAwareVerdict } from "@/lib/analysisSourceDisclosure";

interface CertificateData {
  reportId: string;
  popName: string | null;
  popNumber: string | null;
  score: number;
  summary: string;
  eraDetected?: string;
  releaseYear?: string | null;
  seriesLine?: string | null;
  date: string;
  publicUrl: string;
  frontImageUrl?: string | null;
  analysisSource?: string | null;
}

function getBorderColor(score: number): [number, number, number] {
  if (score >= 90) return [184, 148, 56]; // gold
  if (score >= 75) return [160, 168, 176]; // silver
  return [120, 120, 120]; // grey
}

function drawOrnamentCorner(doc: jsPDF, x: number, y: number, size: number, flipX: boolean, flipY: boolean, color: [number, number, number]) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.4);
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  doc.line(x, y, x + sx * size, y);
  doc.line(x, y, x, y + sy * size);
  doc.line(x + sx * 2, y + sy * 2, x + sx * (size - 2), y + sy * 2);
  doc.line(x + sx * 2, y + sy * 2, x + sx * 2, y + sy * (size - 2));
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function extractYearFromNotes(summary: string): string | null {
  const match = summary.match(/\b(20[1-2]\d)\b/);
  return match ? match[1] : null;
}

function extractSeriesFromNotes(summary: string): string | null {
  // Match patterns like "POP! Animation", "POP! Marvel", "Funko Pop! Movies"
  const match = summary.match(/POP!\s*(Animation|Marvel|Movies|Television|Games|Heroes|Star Wars|Disney|DC|Rocks|Sports|Icons|Ad Icons|Rides|Deluxe|Moments|Albums|Retro Toys|Anime|Manga|WWE)/i);
  if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  // Also try "Line: X" or "Series: X"
  const match2 = summary.match(/(?:Line|Series|Category)[:\s]+([A-Za-z\s]+?)(?:\.|,|$)/i);
  return match2 ? match2[1].trim() : null;
}

function extractPopNameFromNotes(summary: string): { name: string | null; number: string | null } {
  // Pattern 1: "this Animal #05" or "Thor #01" or "SAITAMA #257"
  const p1 = summary.match(/(?:this|the|analyzing)\s+([A-Z][a-zA-Z\s\-']+?)\s*#(\d{1,4})\b/i);
  if (p1) return { name: p1[1].trim(), number: p1[2] };
  // Pattern 2: "Name #Number" anywhere (e.g. "Thor #01", "Animal #05")
  const p2 = summary.match(/([A-Z][a-zA-Z\s\-']{1,25}?)\s*#(\d{1,4})\b/);
  if (p2) return { name: p2[1].trim(), number: p2[2] };
  // Pattern 3: "Marvel #01 Thor" pattern
  const p3 = summary.match(/(?:Marvel|Animation|Movies|Television|Games|Heroes)\s*#(\d{1,4})\s+([A-Z][a-zA-Z\s\-']+?)(?:\s+is|\s+appears|\s+Pop)/i);
  if (p3) return { name: p3[2].trim(), number: p3[1] };
  return { name: null, number: null };
}

export async function generateCertificatePDF(data: CertificateData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const borderColor = getBorderColor(data.score);
  const marginOuter = 12;
  const marginInner = 15;
  const contentLeft = 25;
  const contentRight = W - 25;
  const contentWidth = contentRight - contentLeft;
  const isListingLegacy = data.analysisSource === "listing_legacy";
  const sourceDisclosure = getAnalysisSourceDisclosure(data.analysisSource);

  // --- Background ---
  doc.setFillColor(252, 250, 245);
  doc.rect(0, 0, W, H, "F");

  // --- Watermark ---
  doc.setTextColor(240, 237, 230);
  doc.setFontSize(64);
  doc.setFont("helvetica", "bold");
  doc.text("POPCHECK", W / 2, H / 2 - 8, { align: "center", angle: 35 });
  doc.setFontSize(22);
  doc.text(isListingLegacy ? "LISTING REVIEW" : "AI VERIFIED", W / 2, H / 2 + 12, { align: "center", angle: 35 });

  // --- Double border ---
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(1.2);
  doc.rect(marginOuter, marginOuter, W - marginOuter * 2, H - marginOuter * 2);
  doc.setLineWidth(0.4);
  doc.rect(marginInner, marginInner, W - marginInner * 2, H - marginInner * 2);

  // Corner ornaments
  const cs = 12;
  drawOrnamentCorner(doc, marginInner, marginInner, cs, false, false, borderColor);
  drawOrnamentCorner(doc, W - marginInner, marginInner, cs, true, false, borderColor);
  drawOrnamentCorner(doc, marginInner, H - marginInner, cs, false, true, borderColor);
  drawOrnamentCorner(doc, W - marginInner, H - marginInner, cs, true, true, borderColor);

  // ===== SECTION A: LOGO & TITLE =====
  let yPos = 28;

  const logoBase64 = await loadImageAsBase64("/images/logoPC.png");
  if (logoBase64) {
    const logoSize = 14;
    doc.addImage(logoBase64, "PNG", W / 2 - logoSize / 2, yPos - 4, logoSize, logoSize);
    yPos += logoSize + 4;
  }

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("POPCHECK AI", W / 2, yPos, { align: "center" });

  // Decorative line with diamond
  yPos += 6;
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.6);
  doc.line(40, yPos, W / 2 - 20, yPos);
  doc.line(W / 2 + 20, yPos, W - 40, yPos);
  const cx = W / 2;
  doc.setFillColor(...borderColor);
  doc.triangle(cx, yPos - 2.5, cx - 2.5, yPos, cx, yPos + 2.5, "F");
  doc.triangle(cx, yPos - 2.5, cx + 2.5, yPos, cx, yPos + 2.5, "F");

  // Title
  yPos += 10;
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(isListingLegacy ? "Listing Image Assessment Report" : "Certificate of Authenticity", W / 2, yPos, { align: "center" });

  if (sourceDisclosure) {
    yPos += 7;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(150, 95, 10);
    const disclosureLines = doc.splitTextToSize(sourceDisclosure, contentWidth);
    doc.text(disclosureLines, W / 2, yPos, { align: "center" });
    yPos += disclosureLines.length * 3.5;
  }

  yPos += 4;
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.5);
  doc.line(55, yPos, W - 55, yPos);

  // ===== SECTION B: THUMBNAIL + PRODUCT METADATA =====
  yPos += 10;

  // Smart data extraction: use provided data, fallback to notes extraction
  const notesExtracted = extractPopNameFromNotes(data.summary);
  const finalPopName = data.popName || notesExtracted.name || null;
  const finalPopNumber = data.popNumber || notesExtracted.number || null;
  const releaseYear = data.releaseYear || extractYearFromNotes(data.summary) || null;
  const seriesLine = data.seriesLine || extractSeriesFromNotes(data.summary) || null;

  const thumbSize = 30;
  const metaLeft = contentLeft + thumbSize + 8;
  let thumbLoaded = false;

  // Load front image thumbnail
  if (data.frontImageUrl) {
    try {
      const thumbBase64 = await loadImageAsBase64(data.frontImageUrl);
      if (thumbBase64) {
        doc.setDrawColor(...borderColor);
        doc.setLineWidth(0.6);
        doc.roundedRect(contentLeft - 1, yPos - 1, thumbSize + 2, thumbSize + 2, 2, 2, "S");
        doc.addImage(thumbBase64, "JPEG", contentLeft, yPos, thumbSize, thumbSize);
        thumbLoaded = true;
      }
    } catch {
      // continue without thumbnail
    }
  }

  const metaX = thumbLoaded ? metaLeft : contentLeft;
  let metaY = yPos + 2;

  // Product Name — three-line block
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Product Name", metaX, metaY);

  // Line 1: "Funko Pop!"
  metaY += 6;
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.text("Funko Pop!", metaX, metaY);

  // Line 2: Name + Number (e.g. "SAITAMA 257")
  metaY += 5.5;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  const nameNum = [finalPopName?.toUpperCase(), finalPopNumber].filter(Boolean).join(" ");
  doc.text(nameNum || "Identification in progress", metaX, metaY);

  // Line 3: subject line (e.g. "subject: SAITAMA")
  metaY += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`subject: ${(finalPopName || "Pending OCR review").toUpperCase()}`, metaX, metaY);

  // Series / Line — always render to satisfy V6.0 (no missing fields on certificate)
  metaY += 6;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "bold");
  doc.text("Line", metaX, metaY);
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  metaY += 5;
  doc.text(seriesLine || "Pending OCR review", metaX, metaY);

  // Series Number
  if (finalPopNumber) {
    metaY += 6;
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "bold");
    doc.text("Series Number", metaX, metaY);
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);
    metaY += 5;
    doc.text(`#${finalPopNumber}`, metaX, metaY);
  }

  // Release Year / Era
  metaY += 7;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "bold");
  if (releaseYear) {
    doc.text("Release Year", metaX, metaY);
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);
    metaY += 5;
    doc.text(releaseYear, metaX, metaY);
  } else if (data.eraDetected) {
    doc.text("Production Era", metaX, metaY);
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);
    metaY += 5;
    doc.text(data.eraDetected, metaX, metaY);
  }

  yPos = Math.max(yPos + thumbSize + 4, metaY + 6);

  // Two-column metadata row (Report ID / Date)
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.2);
  doc.line(contentLeft, yPos, contentRight, yPos);
  yPos += 6;

  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "bold");
  doc.text("Report ID:", contentLeft, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(data.reportId.substring(0, 20) + "...", contentLeft + 22, yPos);

  doc.setFont("helvetica", "bold");
  doc.text("Date:", contentRight - 50, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(data.date, contentRight - 50 + 12, yPos);

  yPos += 4;
  doc.setDrawColor(210, 210, 210);
  doc.line(contentLeft, yPos, contentRight, yPos);

  // ===== SECTION C: V-STAMP SCORE =====
  yPos += 12;
  const scoreRadius = 16;
  const scoreCenterY = yPos + scoreRadius;

  doc.setDrawColor(...borderColor);
  doc.setLineWidth(1.5);
  doc.circle(W / 2, scoreCenterY, scoreRadius);
  doc.setLineWidth(0.3);
  doc.circle(W / 2, scoreCenterY, scoreRadius + 2.5);

  doc.setTextColor(...borderColor);
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.text(String(data.score), W / 2, scoreCenterY + 1.5, { align: "center" });
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("/100", W / 2, scoreCenterY + 7, { align: "center" });

  yPos = scoreCenterY + scoreRadius + 6;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("V-STAMP AUTHENTICITY SCORE", W / 2, yPos, { align: "center" });

  // Verdict badge
  yPos += 8;
  const verdict = getSourceAwareVerdict(data.score, data.analysisSource);
  const badgeWidth = doc.getTextWidth(verdict) + 16;

  if (data.score >= 80) {
    doc.setFillColor(34, 120, 74);
  } else if (data.score >= 50) {
    doc.setFillColor(180, 130, 20);
  } else {
    doc.setFillColor(180, 40, 40);
  }

  doc.roundedRect(W / 2 - badgeWidth / 2, yPos - 4.5, badgeWidth, 8, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text(verdict, W / 2, yPos + 0.5, { align: "center" });

  // ===== SECTION D: INVESTIGATIVE NOTES =====
  if (data.summary) {
    yPos += 14;
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.2);
    doc.line(contentLeft, yPos, contentRight, yPos);

    yPos += 7;
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Investigative Notes", contentLeft, yPos);

    yPos += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(70, 70, 70);

    const notesWidth = contentWidth - 35;
    const lines = doc.splitTextToSize(data.summary, notesWidth);
    const maxLines = Math.min(lines.length, 10);
    for (let i = 0; i < maxLines; i++) {
      doc.text(lines[i], contentLeft, yPos);
      yPos += 4;
    }
    if (lines.length > 10) {
      doc.text("[...] Full report available via QR code.", contentLeft, yPos);
      yPos += 4;
    }
  }

  // ===== QR CODE (bottom-right area) =====
  const qrSize = 24;
  const qrX = contentRight - qrSize;
  const qrY = Math.max(yPos + 4, H - 75);

  try {
    const qrDataUrl = await QRCode.toDataURL(data.publicUrl, {
      width: 250,
      margin: 1,
      color: { dark: "#333333", light: "#fcfaf5" },
    });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.roundedRect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 12, 1.5, 1.5, "S");
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    doc.setTextColor(140, 140, 140);
    doc.setFontSize(5.5);
    doc.text("Scan to verify", qrX + qrSize / 2, qrY + qrSize + 4, { align: "center" });
    doc.text(isListingLegacy ? "this report" : "this certificate", qrX + qrSize / 2, qrY + qrSize + 7, { align: "center" });
  } catch (e) {
    console.error("QR code generation failed:", e);
  }

  // ===== SECTION E: SIGNATURE & FOOTER =====
  const sigY = Math.max(yPos + 8, H - 65);

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(contentLeft, sigY, contentRight, sigY);

  const sigNameY = sigY + 14;
  doc.setTextColor(...borderColor);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bolditalic");
  doc.text("Dr. V-Stamp", W / 2, sigNameY, { align: "center" });

  doc.setLineWidth(0.4);
  doc.setDrawColor(...borderColor);
  doc.line(W / 2 - 22, sigNameY + 3, W / 2 + 22, sigNameY + 3);

  doc.setTextColor(120, 120, 120);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("Chief AI Analyst — PopCheck AI", W / 2, sigNameY + 9, { align: "center" });

  // Certification stamp
  const stampX = contentRight - 20;
  const stampY = sigNameY + 2;
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.6);
  doc.circle(stampX, stampY, 8);
  doc.setLineWidth(0.3);
  doc.circle(stampX, stampY, 6.5);
  doc.setTextColor(...borderColor);
  doc.setFontSize(5);
  doc.setFont("helvetica", "bold");
  doc.text("VERIFIED", stampX, stampY - 1, { align: "center" });
  doc.setFontSize(4);
  doc.text("POPCHECK", stampX, stampY + 2, { align: "center" });

  // --- Footer ---
  doc.setTextColor(170, 170, 170);
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    isListingLegacy
      ? "Listing-image assessment only. The physical item was not examined. This is not a physical-item certification."
      : "This certificate was generated by PopCheck AI. Verification is AI-assisted and does not constitute a legal guarantee.",
    W / 2,
    H - 20,
    { align: "center" },
  );
  doc.text(`© ${new Date().getFullYear()} PopCheck AI — All rights reserved`, W / 2, H - 17, { align: "center" });

  // --- Save ---
  const documentKind = isListingLegacy ? "Listing_Assessment" : "Certificate";
  const filename = `PopCheck_${documentKind}_${(data.popName || "Report").replace(/\s+/g, "_")}_${data.reportId.substring(0, 8)}.pdf`;
  doc.save(filename);
}
