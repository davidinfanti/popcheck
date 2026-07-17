export const ANALYSIS_MODEL = "gemini-3.5-flash";
export const GEMINI_GENERATE_CONTENT_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${ANALYSIS_MODEL}:generateContent`;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 14 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const REFUSAL_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
]);
const UNSUPPORTED_JSON_SCHEMA_KEYS = new Set(["minLength", "maxLength"]);

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type GeminiProviderMode = "structured_schema" | "json_fallback";

export interface GeminiAnalysisRequest {
  systemInstruction: string;
  prompt: string;
  imageUrls: string[];
  responseJsonSchema: Record<string, unknown>;
  providerMode?: GeminiProviderMode;
}

export interface GeminiDispatchResult {
  response: Response;
  elapsedMs: number;
}

export interface GeminiCompatibilityDispatchResult extends GeminiDispatchResult {
  providerMode: GeminiProviderMode;
  schemaCompilationFailure: GeminiDispatchResult | null;
}

export class GeminiEvidenceFetchError extends Error {
  readonly code = "PROVIDER_EVIDENCE_FETCH";

  constructor(message = "An evidence image could not be prepared for analysis.") {
    super(message);
    this.name = "GeminiEvidenceFetchError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function toGeminiJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toGeminiJsonSchema);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !UNSUPPORTED_JSON_SCHEMA_KEYS.has(key))
      .map(([key, nested]) => [key, toGeminiJsonSchema(nested)]),
  );
}

async function loadImagePart(
  fetcher: FetchLike,
  url: string,
  currentTotal: number,
  signal?: AbortSignal,
): Promise<{ part: Record<string, unknown>; byteLength: number }> {
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new GeminiEvidenceFetchError();

  const mimeType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) throw new GeminiEvidenceFetchError("An evidence image has an unsupported media type.");

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || currentTotal + bytes.length > MAX_TOTAL_IMAGE_BYTES) {
    throw new GeminiEvidenceFetchError("The submitted evidence exceeds the provider input limit.");
  }

  return {
    part: { inlineData: { mimeType, data: base64Encode(bytes) } },
    byteLength: bytes.length,
  };
}

export async function loadGeminiImagePart(
  fetcher: FetchLike,
  url: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return (await loadImagePart(fetcher, url, 0, signal)).part;
}

export async function dispatchGeminiAnalysis(
  fetcher: FetchLike,
  apiKey: string,
  request: GeminiAnalysisRequest,
  endpoint = GEMINI_GENERATE_CONTENT_ENDPOINT,
  signal?: AbortSignal,
): Promise<GeminiDispatchResult> {
  const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];
  let totalImageBytes = 0;

  for (const url of request.imageUrls) {
    const loaded = await loadImagePart(fetcher, url, totalImageBytes, signal);
    totalImageBytes += loaded.byteLength;
    parts.push(loaded.part);
  }

  const startedAt = performance.now();
  const generationConfig = request.providerMode === "json_fallback"
    ? { responseMimeType: "application/json" }
    : {
        responseFormat: {
          text: {
            mimeType: "APPLICATION_JSON",
            schema: toGeminiJsonSchema(request.responseJsonSchema),
          },
        },
      };
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: request.systemInstruction }] },
      contents: [{ role: "user", parts }],
      generationConfig,
    }),
    signal,
  });
  return { response, elapsedMs: Math.round(performance.now() - startedAt) };
}

async function isSchemaCompilationFailure(response: Response): Promise<boolean> {
  if (response.status !== 400) return false;
  try {
    const payload: unknown = await response.clone().json();
    return isRecord(payload) && isRecord(payload.error) && payload.error.status === "INVALID_ARGUMENT";
  } catch {
    return false;
  }
}

export async function dispatchGeminiAnalysisWithFallback(
  fetcher: FetchLike,
  apiKey: string,
  request: GeminiAnalysisRequest,
  endpoint = GEMINI_GENERATE_CONTENT_ENDPOINT,
  signal?: AbortSignal,
): Promise<GeminiCompatibilityDispatchResult> {
  const structured = await dispatchGeminiAnalysis(
    fetcher,
    apiKey,
    { ...request, providerMode: "structured_schema" },
    endpoint,
    signal,
  );
  if (!await isSchemaCompilationFailure(structured.response)) {
    return { ...structured, providerMode: "structured_schema", schemaCompilationFailure: null };
  }

  const fallback = await dispatchGeminiAnalysis(
    fetcher,
    apiKey,
    { ...request, providerMode: "json_fallback" },
    endpoint,
    signal,
  );
  return {
    response: fallback.response,
    elapsedMs: structured.elapsedMs + fallback.elapsedMs,
    providerMode: "json_fallback",
    schemaCompilationFailure: structured,
  };
}

export function extractGeminiStructuredText(value: unknown): { text: string | null; refused: boolean } {
  if (!isRecord(value)) return { text: null, refused: false };

  const promptFeedback = value.promptFeedback;
  if (isRecord(promptFeedback) && typeof promptFeedback.blockReason === "string" && promptFeedback.blockReason) {
    return { text: null, refused: true };
  }

  if (!Array.isArray(value.candidates) || !isRecord(value.candidates[0])) {
    return { text: null, refused: false };
  }

  const candidate = value.candidates[0];
  const finishReason = typeof candidate.finishReason === "string" ? candidate.finishReason : "";
  const refused = REFUSAL_FINISH_REASONS.has(finishReason);
  const content = candidate.content;
  if (!isRecord(content) || !Array.isArray(content.parts)) return { text: null, refused };

  const text = content.parts
    .filter(isRecord)
    .map((part) => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  return { text: text || null, refused };
}
