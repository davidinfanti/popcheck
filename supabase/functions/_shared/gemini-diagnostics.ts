import {
  ANALYSIS_MODEL,
  GEMINI_GENERATE_CONTENT_ENDPOINT,
  type FetchLike,
  extractGeminiStructuredText,
  loadGeminiImagePart,
  toGeminiJsonSchema,
} from "./gemini-provider.ts";

export const GEMINI_API_VERSION = "v1beta";
const GEMINI_MODELS_ENDPOINT = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models`;
const MAX_SAFE_MESSAGE_LENGTH = 500;
const REQUEST_ID_HEADERS = ["x-goog-request-id", "x-request-id", "x-cloud-trace-context", "traceparent"];

export type ProviderFailureCode =
  | "PROVIDER_INVALID_REQUEST"
  | "PROVIDER_MODEL_NOT_FOUND"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_INTERNAL"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_AUTH"
  | "PROVIDER_ERROR";

export interface SafeProviderDiagnostic {
  upstreamHttpStatus: number | null;
  googleErrorStatus: string | null;
  sanitizedMessage: string;
  requestIds: Record<string, string>;
  model: string;
  endpointVersion: string;
  elapsedMs: number;
  internalCode: ProviderFailureCode;
}

export interface GeminiProbeResult {
  probe: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  capability: string;
  result: "PASS" | "FAIL";
  upstreamHttpStatus: number | null;
  googleErrorStatus: string | null;
  sanitizedMessage: string | null;
  requestIds: Record<string, string>;
  model: string;
  endpointVersion: string;
  elapsedMs: number;
  modelResponseReceived: boolean;
  internalCode: ProviderFailureCode | null;
  schemaIsolation?: GeminiSchemaIsolationResult[];
}

export interface GeminiSchemaIsolationResult {
  variant: string;
  result: "PASS" | "FAIL";
  upstreamHttpStatus: number | null;
  googleErrorStatus: string | null;
  sanitizedMessage: string | null;
  requestIds: Record<string, string>;
  model: string;
  endpointVersion: string;
  elapsedMs: number;
  modelResponseReceived: boolean;
  internalCode: ProviderFailureCode | null;
  schemaBytes: number;
}

export function mapGeminiHttpFailure(status: number): ProviderFailureCode {
  if (status === 400) return "PROVIDER_INVALID_REQUEST";
  if (status === 401 || status === 403) return "PROVIDER_AUTH";
  if (status === 404) return "PROVIDER_MODEL_NOT_FOUND";
  if (status === 429) return "PROVIDER_RATE_LIMIT";
  if (status === 500) return "PROVIDER_INTERNAL";
  if (status === 503) return "PROVIDER_UNAVAILABLE";
  if (status === 504) return "PROVIDER_TIMEOUT";
  return "PROVIDER_ERROR";
}

export function sanitizeProviderMessage(message: unknown, secrets: string[] = []): string {
  let safe = typeof message === "string" && message.trim()
    ? message
    : "The provider returned an error without a safe message.";

  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join("[REDACTED]");
  }

  safe = safe
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+\b/g, "[REDACTED_JWT]")
    .replace(/([?&](?:key|api_key|token)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/data:image\/[a-z0-9.+-]+;base64,[0-9A-Za-z+/=_-]+/gi, "[REDACTED_IMAGE]")
    .replace(/\b[0-9A-Za-z+/=_-]{80,}\b/g, "[REDACTED_DATA]")
    .replace(/\{[\s\S]{20,}\}/g, "[REDACTED_OBJECT]")
    .replace(/\s+/g, " ")
    .trim();

  return safe.slice(0, MAX_SAFE_MESSAGE_LENGTH);
}

function safeRequestIds(headers: Headers): Record<string, string> {
  const requestIds: Record<string, string> = {};
  for (const name of REQUEST_ID_HEADERS) {
    const value = headers.get(name);
    if (!value) continue;
    const sanitized = value.replace(/[^0-9A-Za-z._:/;=-]/g, "").slice(0, 200);
    if (sanitized) requestIds[name] = sanitized;
  }
  return requestIds;
}

export async function readGeminiFailureDiagnostic(input: {
  response: Response;
  apiKey: string;
  elapsedMs: number;
}): Promise<SafeProviderDiagnostic> {
  let googleErrorStatus: string | null = null;
  let googleMessage: unknown = null;
  try {
    const payload: unknown = await input.response.json();
    if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
      const error = (payload as Record<string, unknown>).error;
      if (typeof error === "object" && error !== null && !Array.isArray(error)) {
        const status = (error as Record<string, unknown>).status;
        const message = (error as Record<string, unknown>).message;
        googleErrorStatus = typeof status === "string"
          ? status.replace(/[^A-Z0-9_]/g, "").slice(0, 100) || null
          : null;
        googleMessage = message;
      }
    }
  } catch {
    googleMessage = null;
  }

  return {
    upstreamHttpStatus: input.response.status,
    googleErrorStatus,
    sanitizedMessage: sanitizeProviderMessage(googleMessage, [input.apiKey]),
    requestIds: safeRequestIds(input.response.headers),
    model: ANALYSIS_MODEL,
    endpointVersion: GEMINI_API_VERSION,
    elapsedMs: input.elapsedMs,
    internalCode: mapGeminiHttpFailure(input.response.status),
  };
}

export function timeoutDiagnostic(elapsedMs: number): SafeProviderDiagnostic {
  return {
    upstreamHttpStatus: 504,
    googleErrorStatus: null,
    sanitizedMessage: "The provider request timed out.",
    requestIds: {},
    model: ANALYSIS_MODEL,
    endpointVersion: GEMINI_API_VERSION,
    elapsedMs,
    internalCode: "PROVIDER_TIMEOUT",
  };
}

function requestBody(
  parts: Array<Record<string, unknown>>,
  schema?: Record<string, unknown>,
  systemInstruction?: string,
): Record<string, unknown> {
  return {
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    contents: [{ role: "user", parts }],
    ...(schema
      ? {
          generationConfig: {
            responseFormat: {
              text: { mimeType: "APPLICATION_JSON", schema: toGeminiJsonSchema(schema) },
            },
          },
        }
      : {}),
  };
}

async function providerFetch(
  fetcher: FetchLike,
  apiKey: string,
  url: string,
  init: RequestInit,
): Promise<{ response: Response; elapsedMs: number }> {
  const startedAt = performance.now();
  const response = await fetcher(url, {
    ...init,
    headers: {
      "x-goog-api-key": apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  return { response, elapsedMs: Math.round(performance.now() - startedAt) };
}

function failedLocalProbe(
  probe: GeminiProbeResult["probe"],
  capability: string,
  status: number | null,
  elapsedMs: number,
  message: string,
  requestIds: Record<string, string> = {},
): GeminiProbeResult {
  return {
    probe,
    capability,
    result: "FAIL",
    upstreamHttpStatus: status,
    googleErrorStatus: null,
    sanitizedMessage: sanitizeProviderMessage(message),
    requestIds,
    model: ANALYSIS_MODEL,
    endpointVersion: GEMINI_API_VERSION,
    elapsedMs,
    modelResponseReceived: false,
    internalCode: status === 404 ? "PROVIDER_MODEL_NOT_FOUND" : "PROVIDER_ERROR",
  };
}

async function contentProbe(input: {
  probe: GeminiProbeResult["probe"];
  capability: string;
  fetcher: FetchLike;
  apiKey: string;
  body: Record<string, unknown>;
  validate?: (text: string) => boolean;
}): Promise<GeminiProbeResult> {
  let fetched: { response: Response; elapsedMs: number };
  try {
    fetched = await providerFetch(input.fetcher, input.apiKey, GEMINI_GENERATE_CONTENT_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(input.body),
    });
  } catch {
    return failedLocalProbe(input.probe, input.capability, null, 0, "The provider request failed before a response was received.");
  }

  if (!fetched.response.ok) {
    const failure = await readGeminiFailureDiagnostic({
      response: fetched.response,
      apiKey: input.apiKey,
      elapsedMs: fetched.elapsedMs,
    });
    return {
      probe: input.probe,
      capability: input.capability,
      result: "FAIL",
      ...failure,
      modelResponseReceived: false,
    };
  }

  let payload: unknown;
  try {
    payload = await fetched.response.json();
  } catch {
    return failedLocalProbe(
      input.probe,
      input.capability,
      fetched.response.status,
      fetched.elapsedMs,
      "The provider returned a non-JSON success payload.",
      safeRequestIds(fetched.response.headers),
    );
  }
  const extracted = extractGeminiStructuredText(payload);
  if (!extracted.text) {
    return failedLocalProbe(
      input.probe,
      input.capability,
      fetched.response.status,
      fetched.elapsedMs,
      extracted.refused ? "The model refused the diagnostic prompt." : "The provider returned no model text.",
      safeRequestIds(fetched.response.headers),
    );
  }
  if (input.validate && !input.validate(extracted.text)) {
    const failed = failedLocalProbe(
      input.probe,
      input.capability,
      fetched.response.status,
      fetched.elapsedMs,
      "The model response failed the requested local schema validation.",
      safeRequestIds(fetched.response.headers),
    );
    failed.modelResponseReceived = true;
    return failed;
  }

  return {
    probe: input.probe,
    capability: input.capability,
    result: "PASS",
    upstreamHttpStatus: fetched.response.status,
    googleErrorStatus: null,
    sanitizedMessage: null,
    requestIds: safeRequestIds(fetched.response.headers),
    model: ANALYSIS_MODEL,
    endpointVersion: GEMINI_API_VERSION,
    elapsedMs: fetched.elapsedMs,
    modelResponseReceived: true,
    internalCode: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripSchemaDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSchemaDescriptions);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "description" && key !== "title")
      .map(([key, nested]) => [key, stripSchemaDescriptions(nested)]),
  );
}

function schemaForTopLevelProperties(
  fullSchema: Record<string, unknown>,
  names: string[],
): Record<string, unknown> | null {
  const properties = fullSchema.properties;
  if (!isRecord(properties) || names.some((name) => !(name in properties))) return null;
  return {
    type: "object",
    properties: Object.fromEntries(names.map((name) => [name, properties[name]])),
    required: names,
    additionalProperties: false,
  };
}

function schemaByteLength(schema: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(toGeminiJsonSchema(schema))).byteLength;
}

async function schemaIsolationProbe(input: {
  variant: string;
  fetcher: FetchLike;
  apiKey: string;
  schema: Record<string, unknown>;
}): Promise<GeminiSchemaIsolationResult> {
  const result = await contentProbe({
    probe: "F",
    capability: `schema isolation: ${input.variant}`,
    fetcher: input.fetcher,
    apiKey: input.apiKey,
    body: requestBody(
      [{ text: "Return one concise JSON value matching the supplied diagnostic schema." }],
      input.schema,
    ),
  });
  return {
    variant: input.variant,
    result: result.result,
    upstreamHttpStatus: result.upstreamHttpStatus,
    googleErrorStatus: result.googleErrorStatus,
    sanitizedMessage: result.sanitizedMessage,
    requestIds: result.requestIds,
    model: result.model,
    endpointVersion: result.endpointVersion,
    elapsedMs: result.elapsedMs,
    modelResponseReceived: result.modelResponseReceived,
    internalCode: result.internalCode,
    schemaBytes: schemaByteLength(input.schema),
  };
}

async function isolateFullSchemaFailure(input: {
  fetcher: FetchLike;
  apiKey: string;
  fullSchema: Record<string, unknown>;
}): Promise<GeminiSchemaIsolationResult[]> {
  const results: GeminiSchemaIsolationResult[] = [];
  const run = async (variant: string, schema: Record<string, unknown>) => {
    const result = await schemaIsolationProbe({ ...input, variant, schema });
    results.push(result);
    return result;
  };

  // First remove prompt size/content as a confound while preserving the exact schema.
  const exactSchema = await run("exact_schema_minimal_prompt", input.fullSchema);
  if (exactSchema.result === "PASS") return results;

  // Descriptions are supported, but can push an otherwise valid schema over provider complexity limits.
  const compactSchema = stripSchemaDescriptions(input.fullSchema) as Record<string, unknown>;
  const compact = await run("schema_without_descriptions", compactSchema);
  if (compact.result === "PASS") return results;

  const properties = input.fullSchema.properties;
  if (!isRecord(properties)) return results;
  const propertyNames = Object.keys(properties);
  const individuallyPassing: string[] = [];
  for (const name of propertyNames) {
    const schema = schemaForTopLevelProperties(input.fullSchema, [name]);
    if (!schema) continue;
    const result = await run(`top_level_${name}`, schema);
    if (result.result === "PASS") individuallyPassing.push(name);
  }

  // If every branch is accepted separately, find the first aggregate combination the provider rejects.
  if (individuallyPassing.length === propertyNames.length) {
    const progressive: string[] = [];
    for (const name of propertyNames) {
      progressive.push(name);
      if (progressive.length === 1) continue;
      const schema = schemaForTopLevelProperties(input.fullSchema, progressive);
      if (!schema) continue;
      const result = await run(`progressive_${progressive.join("+")}`, schema);
      if (result.result === "FAIL") break;
    }
  }
  return results;
}

export async function runGeminiIsolationProbes(input: {
  fetcher: FetchLike;
  apiKey: string;
  syntheticImageUrl: string;
  fullSchema: Record<string, unknown>;
  fullSystemInstruction: string;
  validateFullOutput: (text: string, submittedImageCount: number) => boolean;
}): Promise<GeminiProbeResult[]> {
  const results: GeminiProbeResult[] = [];
  const add = (result: GeminiProbeResult): boolean => {
    results.push(result);
    return result.result === "PASS";
  };

  let discovery: { response: Response; elapsedMs: number };
  try {
    discovery = await providerFetch(
      input.fetcher,
      input.apiKey,
      `${GEMINI_MODELS_ENDPOINT}/${ANALYSIS_MODEL}`,
      { method: "GET" },
    );
  } catch {
    add(failedLocalProbe("A", "model discovery", null, 0, "The models endpoint did not return a response."));
    return results;
  }
  if (!discovery.response.ok) {
    const failure = await readGeminiFailureDiagnostic({
      response: discovery.response,
      apiKey: input.apiKey,
      elapsedMs: discovery.elapsedMs,
    });
    add({ probe: "A", capability: "model discovery", result: "FAIL", ...failure, modelResponseReceived: false });
    return results;
  }
  let modelListed = false;
  try {
    const model = await discovery.response.json() as Record<string, unknown>;
    modelListed = model.name === `models/${ANALYSIS_MODEL}` &&
      Array.isArray(model.supportedGenerationMethods) &&
      model.supportedGenerationMethods.includes("generateContent");
  } catch {
    modelListed = false;
  }
  if (!add(modelListed
    ? {
        probe: "A", capability: "model discovery", result: "PASS", upstreamHttpStatus: 200,
        googleErrorStatus: null, sanitizedMessage: null, requestIds: safeRequestIds(discovery.response.headers),
        model: ANALYSIS_MODEL, endpointVersion: GEMINI_API_VERSION, elapsedMs: discovery.elapsedMs,
        modelResponseReceived: false, internalCode: null,
      }
    : failedLocalProbe("A", "model discovery", 200, discovery.elapsedMs, "The requested model did not advertise generateContent."))) {
    return results;
  }

  if (!add(await contentProbe({
    probe: "B", capability: "minimal text", fetcher: input.fetcher, apiKey: input.apiKey,
    body: requestBody([{ text: "Reply with the single word ready." }]),
  }))) return results;

  const simpleSchema = {
    type: "object",
    properties: { name: { type: "string" }, status: { type: "string" } },
    required: ["name", "status"],
    additionalProperties: false,
  };
  const validateSimple = (text: string) => {
    try {
      const value = JSON.parse(text);
      return typeof value?.name === "string" && typeof value?.status === "string";
    } catch {
      return false;
    }
  };
  if (!add(await contentProbe({
    probe: "C", capability: "minimal structured text", fetcher: input.fetcher, apiKey: input.apiKey,
    body: requestBody([{ text: "Return name=probe and status=ready." }], simpleSchema), validate: validateSimple,
  }))) return results;

  let imagePart: Record<string, unknown>;
  try {
    imagePart = await loadGeminiImagePart(input.fetcher, input.syntheticImageUrl);
  } catch {
    add(failedLocalProbe("D", "minimal image", null, 0, "The synthetic canonical image could not be prepared."));
    return results;
  }
  if (!add(await contentProbe({
    probe: "D", capability: "minimal image", fetcher: input.fetcher, apiKey: input.apiKey,
    body: requestBody([{ text: "Describe whether this synthetic image is visible." }, imagePart]),
  }))) return results;

  if (!add(await contentProbe({
    probe: "E", capability: "minimal image plus structured output", fetcher: input.fetcher, apiKey: input.apiKey,
    body: requestBody([{ text: "Return name=synthetic-image and status=visible-or-limited." }, imagePart], simpleSchema),
    validate: validateSimple,
  }))) return results;

  const fullTextPrompt = "Return a POPCHECK observation object for a text-only diagnostic. No image is available, so use not_visible observations, null image indices, and explicit limitations.";
  const fullTextResult = await contentProbe({
    probe: "F", capability: "full POPCHECK schema with text only", fetcher: input.fetcher, apiKey: input.apiKey,
    body: requestBody([{ text: fullTextPrompt }], input.fullSchema, input.fullSystemInstruction),
    validate: (text) => input.validateFullOutput(text, 0),
  });
  if (fullTextResult.result === "FAIL" &&
    fullTextResult.upstreamHttpStatus === 400 &&
    fullTextResult.googleErrorStatus === "INVALID_ARGUMENT") {
    fullTextResult.schemaIsolation = await isolateFullSchemaFailure({
      fetcher: input.fetcher,
      apiKey: input.apiKey,
      fullSchema: input.fullSchema,
    });
  }
  if (!add(fullTextResult)) return results;

  add(await contentProbe({
    probe: "G", capability: "full POPCHECK multimodal", fetcher: input.fetcher, apiKey: input.apiKey,
    body: requestBody([
      { text: "Inspect the one submitted synthetic image. Return only the required POPCHECK observation object." },
      imagePart,
    ], input.fullSchema, input.fullSystemInstruction),
    validate: (text) => input.validateFullOutput(text, 1),
  }));
  return results;
}
