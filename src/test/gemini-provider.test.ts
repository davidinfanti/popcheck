import { describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_MODEL,
  GEMINI_GENERATE_CONTENT_ENDPOINT,
  GeminiEvidenceFetchError,
  dispatchGeminiAnalysis,
  extractGeminiStructuredText,
} from "../../supabase/functions/_shared/gemini-provider";

const request = {
  systemInstruction: "Return observations only.",
  prompt: "Inspect the submitted evidence.",
  imageUrls: ["https://evidence.example/front.png"],
  responseJsonSchema: {
    type: "object",
    properties: {
      finding: { type: "string", minLength: 1, maxLength: 500 },
    },
    required: ["finding"],
    additionalProperties: false,
  },
};

describe("direct Gemini provider adapter", () => {
  it("uses the authoritative model endpoint, inlines images, and sends strict JSON Schema output", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (input === request.imageUrls[0]) {
        return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }
      return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
    });

    await dispatchGeminiAnalysis(fetcher, "server-only-key", request);

    const providerCall = fetcher.mock.calls.find(([input]) => input === GEMINI_GENERATE_CONTENT_ENDPOINT);
    expect(providerCall).toBeDefined();
    const init = providerCall?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(String(init.body));

    expect(ANALYSIS_MODEL).toBe("gemini-3.5-flash");
    expect(headers["x-goog-api-key"]).toBe("server-only-key");
    expect(body.systemInstruction.parts[0].text).toBe(request.systemInstruction);
    expect(body.contents[0].parts[0].text).toBe(request.prompt);
    expect(body.contents[0].parts[1]).toEqual({
      inlineData: { mimeType: "image/png", data: "iVBORw==" },
    });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).toEqual({
      type: "object",
      properties: { finding: { type: "string" } },
      required: ["finding"],
      additionalProperties: false,
    });
    expect(body).not.toHaveProperty("tools");
    expect(JSON.stringify(body)).not.toContain(request.imageUrls[0]);
  });

  it("extracts structured JSON text from a successful Gemini response", () => {
    expect(extractGeminiStructuredText({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"ok":true}' }] } }],
    })).toEqual({ text: '{"ok":true}', refused: false });
  });

  it("classifies prompt and candidate safety blocks as refusals", () => {
    expect(extractGeminiStructuredText({ promptFeedback: { blockReason: "SAFETY" } })).toEqual({
      text: null,
      refused: true,
    });
    expect(extractGeminiStructuredText({ candidates: [{ finishReason: "PROHIBITED_CONTENT" }] })).toEqual({
      text: null,
      refused: true,
    });
  });

  it("treats a completed response without text as incomplete rather than accepted", () => {
    expect(extractGeminiStructuredText({
      candidates: [{ finishReason: "STOP", content: { parts: [] } }],
    })).toEqual({ text: null, refused: false });
  });

  it("fails safely when canonical image retrieval fails or returns a non-image", async () => {
    await expect(dispatchGeminiAnalysis(
      vi.fn(async () => new Response("missing", { status: 404 })),
      "server-only-key",
      request,
    )).rejects.toBeInstanceOf(GeminiEvidenceFetchError);

    await expect(dispatchGeminiAnalysis(
      vi.fn(async () => new Response("not image", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })),
      "server-only-key",
      request,
    )).rejects.toMatchObject({ code: "PROVIDER_EVIDENCE_FETCH" });
  });
});
