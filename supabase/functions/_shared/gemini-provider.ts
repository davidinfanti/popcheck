export const ANALYSIS_MODEL = "gemini-3.5-flash";
export const FALLBACK_ANALYSIS_MODEL = "gemini-2.5-flash";
export const GEMINI_TOTAL_TIMEOUT_MS = 30_000;

export function geminiGenerateContentEndpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export const GEMINI_GENERATE_CONTENT_ENDPOINT = geminiGenerateContentEndpoint(ANALYSIS_MODEL);

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
  model?: string;
}

export interface GeminiDispatchResult {
  response: Response;
  elapsedMs: number;
}

export interface GeminiCompatibilityDispatchResult extends GeminiDispatchResult {
  providerMode: GeminiProviderMode;
  schemaCompilationFailure: GeminiDispatchResult | null;
}

export interface GeminiProviderAttempt {
  model: string;
  providerMode: GeminiProviderMode;
  upstreamHttpStatus: number;
  elapsedMs: number;
}

export interface GeminiResilientDispatchResult extends GeminiCompatibilityDispatchResult {
  requestedPrimaryModel: string;
  model: string;
  attemptCount: number;
  fallbackUsed: boolean;
  totalElapsedMs: number;
  attempts: GeminiProviderAttempt[];
}

export interface GeminiResilienceOptions {
  primaryModel?: string;
  fallbackModel?: string;
  totalTimeoutMs?: number;
  random?: () => number;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
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
  endpoint?: string,
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
  const model = request.model || ANALYSIS_MODEL;
  const response = await fetcher(resolveModelEndpoint(model, endpoint), {
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

function resolveModelEndpoint(model: string, endpoint?: string): string {
  if (!endpoint) return geminiGenerateContentEndpoint(model);
  return endpoint.replace(
    /\/models\/[^/:]+:generateContent(?:\?[^#]*)?$/,
    `/models/${model}:generateContent`,
  );
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
  endpoint?: string,
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

async function hasGoogleUnavailableStatus(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  try {
    const payload: unknown = await response.clone().json();
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    return error?.status === "UNAVAILABLE";
  } catch {
    return false;
  }
}

function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }, delayMs);
    const aborted = () => {
      clearTimeout(timeout);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

/**
 * Retries only the documented Google 503/UNAVAILABLE condition.  Schema
 * compatibility fallback remains scoped to a 400 schema-compilation failure;
 * it is not a model failover mechanism.
 */
export async function dispatchGeminiAnalysisWithResilience(
  fetcher: FetchLike,
  apiKey: string,
  request: GeminiAnalysisRequest,
  endpoint?: string,
  signal?: AbortSignal,
  options: GeminiResilienceOptions = {},
): Promise<GeminiResilientDispatchResult> {
  const primaryModel = options.primaryModel || ANALYSIS_MODEL;
  const fallbackModel = options.fallbackModel || FALLBACK_ANALYSIS_MODEL;
  const totalTimeoutMs = options.totalTimeoutMs || GEMINI_TOTAL_TIMEOUT_MS;
  const random = options.random || Math.random;
  const sleep = options.sleep || defaultSleep;
  const startedAt = performance.now();
  const attempts: GeminiProviderAttempt[] = [];

  const dispatchAttempt = async (model: string): Promise<GeminiCompatibilityDispatchResult> => {
    const dispatched = await dispatchGeminiAnalysisWithFallback(
      fetcher,
      apiKey,
      { ...request, model },
      endpoint,
      signal,
    );
    attempts.push({
      model,
      providerMode: dispatched.providerMode,
      upstreamHttpStatus: dispatched.response.status,
      elapsedMs: dispatched.elapsedMs,
    });
    return dispatched;
  };

  const complete = (
    dispatched: GeminiCompatibilityDispatchResult,
    model: string,
    fallbackUsed: boolean,
  ): GeminiResilientDispatchResult => ({
    ...dispatched,
    requestedPrimaryModel: primaryModel,
    model,
    attemptCount: attempts.length,
    fallbackUsed,
    totalElapsedMs: Math.round(performance.now() - startedAt),
    attempts,
  });

  let latestPrimary: GeminiCompatibilityDispatchResult | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    latestPrimary = await dispatchAttempt(primaryModel);
    if (!await hasGoogleUnavailableStatus(latestPrimary.response)) {
      return complete(latestPrimary, primaryModel, false);
    }

    if (attempt === 2) break;
    const baseDelayMs = 1_000 * (2 ** attempt);
    const delayMs = baseDelayMs + Math.floor(random() * 251);
    if (performance.now() - startedAt + delayMs >= totalTimeoutMs) {
      return complete(latestPrimary, primaryModel, false);
    }
    await sleep(delayMs, signal);
    if (performance.now() - startedAt >= totalTimeoutMs) {
      return complete(latestPrimary, primaryModel, false);
    }
  }

  // The fallback is intentionally unavailable for every other provider or
  // validation condition, including quota exhaustion and malformed output.
  if (!latestPrimary || performance.now() - startedAt >= totalTimeoutMs) {
    if (!latestPrimary) throw new Error("Gemini dispatch did not produce a response.");
    return complete(latestPrimary, primaryModel, false);
  }
  const fallback = await dispatchAttempt(fallbackModel);
  return complete(fallback, fallbackModel, true);
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
