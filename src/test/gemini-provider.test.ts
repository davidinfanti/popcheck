import { describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_MODEL,
  GEMINI_GENERATE_CONTENT_ENDPOINT,
  GeminiEvidenceFetchError,
  dispatchGeminiAnalysis,
  extractGeminiStructuredText,
} from "../../supabase/functions/_shared/gemini-provider";
import {
  mapGeminiHttpFailure,
  readGeminiFailureDiagnostic,
  sanitizeProviderMessage,
} from "../../supabase/functions/_shared/gemini-diagnostics";

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
    expect(body.generationConfig.responseFormat.text.mimeType).toBe("APPLICATION_JSON");
    expect(body.generationConfig.responseFormat.text.schema).toEqual({
      type: "object",
      properties: { finding: { type: "string" } },
      required: ["finding"],
      additionalProperties: false,
    });
    expect(body.generationConfig).not.toHaveProperty("temperature");
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

  it("maps every provider HTTP failure to a distinct safe internal code", () => {
    expect([
      [400, "PROVIDER_INVALID_REQUEST"],
      [401, "PROVIDER_AUTH"],
      [403, "PROVIDER_AUTH"],
      [404, "PROVIDER_MODEL_NOT_FOUND"],
      [429, "PROVIDER_RATE_LIMIT"],
      [500, "PROVIDER_INTERNAL"],
      [503, "PROVIDER_UNAVAILABLE"],
      [504, "PROVIDER_TIMEOUT"],
      [418, "PROVIDER_ERROR"],
    ].map(([status, code]) => [status, mapGeminiHttpFailure(Number(status)), code])).toEqual([
      [400, "PROVIDER_INVALID_REQUEST", "PROVIDER_INVALID_REQUEST"],
      [401, "PROVIDER_AUTH", "PROVIDER_AUTH"],
      [403, "PROVIDER_AUTH", "PROVIDER_AUTH"],
      [404, "PROVIDER_MODEL_NOT_FOUND", "PROVIDER_MODEL_NOT_FOUND"],
      [429, "PROVIDER_RATE_LIMIT", "PROVIDER_RATE_LIMIT"],
      [500, "PROVIDER_INTERNAL", "PROVIDER_INTERNAL"],
      [503, "PROVIDER_UNAVAILABLE", "PROVIDER_UNAVAILABLE"],
      [504, "PROVIDER_TIMEOUT", "PROVIDER_TIMEOUT"],
      [418, "PROVIDER_ERROR", "PROVIDER_ERROR"],
    ]);
  });

  it("records only allowlisted diagnostics and redacts keys, tokens, images, and payloads", async () => {
    const apiKey = "server-only-secret-key";
    const leakedJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature";
    const response = new Response(JSON.stringify({
      error: {
        status: "INVALID_ARGUMENT",
        message: `Invalid request key=${apiKey} Authorization: Bearer sensitive ${leakedJwt} data:image/png;base64,${"A".repeat(200)} prompt={${"x".repeat(600)}}`,
        details: [{ requestBody: "must never be retained" }],
      },
      request: { headers: { "x-goog-api-key": apiKey }, image: "B".repeat(500) },
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "x-goog-request-id": "safe-request-123",
        "x-ignored-secret-header": apiKey,
      },
    });

    const diagnostic = await readGeminiFailureDiagnostic({ response, apiKey, elapsedMs: 27 });
    const serialized = JSON.stringify(diagnostic);

    expect(diagnostic).toMatchObject({
      upstreamHttpStatus: 400,
      googleErrorStatus: "INVALID_ARGUMENT",
      requestIds: { "x-goog-request-id": "safe-request-123" },
      model: "gemini-3.5-flash",
      endpointVersion: "v1beta",
      elapsedMs: 27,
      internalCode: "PROVIDER_INVALID_REQUEST",
    });
    expect(diagnostic.sanitizedMessage.length).toBeLessThanOrEqual(500);
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain("sensitive");
    expect(serialized).not.toContain(leakedJwt);
    expect(serialized).not.toContain("data:image");
    expect(serialized).not.toContain("must never be retained");
    expect(serialized).not.toContain("x-ignored-secret-header");
  });

  it("caps standalone safe messages without retaining raw objects", () => {
    const safe = sanitizeProviderMessage(`Failure ${JSON.stringify({ prompt: "private", body: "Z".repeat(900) })}`);
    expect(safe.length).toBeLessThanOrEqual(500);
    expect(safe).not.toContain("private");
    expect(safe).not.toContain("Z".repeat(80));
  });
});
