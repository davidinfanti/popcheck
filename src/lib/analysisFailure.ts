const EVIDENCE_TIMEOUT_CODES = new Set([
  "EVIDENCE_FETCH_TIMEOUT",
  "EVIDENCE_PREPARATION_TIMEOUT",
  "PROVIDER_EVIDENCE_FETCH",
]);

const PROVIDER_TIMEOUT_CODES = new Set([
  "PROVIDER_TIMEOUT",
  "OVERALL_ANALYSIS_TIMEOUT",
]);

export function analysisFailureMessage(code: string | null | undefined): string {
  if (code && EVIDENCE_TIMEOUT_CODES.has(code)) {
    return "One or more photos could not be prepared in time. Please retry or upload smaller JPEG images.";
  }
  if (code && PROVIDER_TIMEOUT_CODES.has(code)) {
    return "The AI analysis took too long to complete. Your photos were saved; please try the analysis again.";
  }
  return "Analysis failed safely. Your photos were saved; please try again.";
}

/** Read only the Edge Function's allowlisted error code; never surface raw errors. */
export async function safeAnalysisFailureMessage(error: unknown): Promise<string> {
  if (!error || typeof error !== "object" || !("context" in error)) {
    return analysisFailureMessage(null);
  }
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return analysisFailureMessage(null);
  try {
    const body: unknown = await context.clone().json();
    const code = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : null;
    return analysisFailureMessage(code);
  } catch {
    return analysisFailureMessage(null);
  }
}
