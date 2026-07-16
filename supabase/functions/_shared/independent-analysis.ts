export const ANALYSIS_MODEL = "google/gemini-3-flash-preview";
export const LOVABLE_ANALYSIS_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function dispatchIndependentAnalysis(
  fetcher: FetchLike,
  apiKey: string,
  payload: Record<string, unknown>,
  endpoint = LOVABLE_ANALYSIS_ENDPOINT,
  signal?: AbortSignal,
): Promise<Response> {
  return fetcher(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });
}
