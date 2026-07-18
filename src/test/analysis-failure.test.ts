import { describe, expect, it } from "vitest";
import { analysisFailureMessage, safeAnalysisFailureMessage } from "@/lib/analysisFailure";

describe("analysis failure presentation", () => {
  it("renders a safe provider-timeout message instead of the generic function error", async () => {
    await expect(safeAnalysisFailureMessage({
      context: new Response(JSON.stringify({ error: "PROVIDER_TIMEOUT", message: "internal detail" }), { status: 504 }),
    })).resolves.toBe("The AI analysis took too long to complete. Your photos were saved; please try the analysis again.");
  });

  it("renders a safe evidence-timeout message without exposing implementation details", () => {
    expect(analysisFailureMessage("EVIDENCE_PREPARATION_TIMEOUT"))
      .toBe("One or more photos could not be prepared in time. Please retry or upload smaller JPEG images.");
    expect(analysisFailureMessage("untrusted raw error")).not.toContain("untrusted");
  });
});
