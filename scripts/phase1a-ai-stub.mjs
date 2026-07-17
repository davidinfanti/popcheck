import { createServer } from "node:http";

const port = Number(process.env.PORT || 54329);
let analysisCalls = 0;
const transportNull = "__POPCHECK_NULL__";

const baseObservation = {
  findingType: "supporting_consistency",
  observationStatus: "observed",
  severity: "informational",
  confidenceLevel: "high",
  imageIndex: 0,
  limitation: transportNull,
  referenceUsed: transportNull,
  referenceReliability: "none",
};

const observationOutput = {
  transportVersion: "gemini-observation-transport-v1",
  candidateIdentity: {
    popName: "Integration Fixture",
    popNumber: "101",
    series: "Animation",
    barcode: transportNull,
    productionCode: transportNull,
    factory: transportNull,
    releaseYear: transportNull,
    sticker: transportNull,
    region: transportNull,
    copyrightStamp: transportNull,
  },
  observations: [
    {
      ...baseObservation,
      code: "IMAGE_QUALITY",
      category: "evidence_quality",
      findingType: "limitation",
      visibleRegion: "submitted front image",
      finding: "The submitted image is clear enough for visible front-panel observations.",
    },
    {
      ...baseObservation,
      code: "IDENTITY_TEXT",
      category: "identity",
      visibleRegion: "front name and number panels",
      finding: "The product name and number are visibly readable.",
    },
    {
      ...baseObservation,
      code: "PACKAGING_PRINT",
      category: "packaging",
      visibleRegion: "front panel",
      finding: "No material print-geometry anomaly is visible in the submitted fixture.",
    },
  ],
  requestedEvidence: [],
  limitations: ["The stub assesses only the submitted front image."],
};

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/calls") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ analysisCalls }));
    return;
  }

  if (request.method !== "POST" || request.url !== "/v1beta/models/gemini-3.5-flash:generateContent") {
    response.writeHead(404).end();
    return;
  }

  let rawBody = "";
  for await (const chunk of request) rawBody += chunk;
  const body = JSON.parse(rawBody);
  const parts = body?.contents?.[0]?.parts;
  const encodedEvidence = Array.isArray(parts)
    ? parts.find((part) => typeof part?.inlineData?.data === "string")?.inlineData?.data
    : null;
  const evidenceMarker = encodedEvidence ? Buffer.from(encodedEvidence, "base64").toString("utf8") : "";
  const structuredSchemaMode =
    body?.generationConfig?.responseFormat?.text?.mimeType === "APPLICATION_JSON" &&
    body?.generationConfig?.responseFormat?.text?.schema?.properties?.transportVersion?.enum?.[0] ===
      "gemini-observation-transport-v1";
  const jsonFallbackMode =
    body?.generationConfig?.responseMimeType === "application/json" &&
    body?.generationConfig?.responseFormat === undefined;

  if (
    typeof request.headers["x-goog-api-key"] !== "string" ||
    (!structuredSchemaMode && !jsonFallbackMode) ||
    !body?.systemInstruction?.parts?.[0]?.text?.includes("POPCHECK observation extractor") ||
    !Array.isArray(parts) ||
    !encodedEvidence ||
    rawBody.includes("attacker.example") ||
    rawBody.includes("submit_vstamp_analysis") ||
    rawBody.includes('"tools"')
  ) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Request did not use canonical evidence and the Phase 1B observation contract." }));
    return;
  }

  analysisCalls += 1;
  if (evidenceMarker.includes("stub-schema-compile") && structuredSchemaMode) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      error: { code: 400, status: "INVALID_ARGUMENT", message: "Synthetic transport schema rejection" },
    }));
    return;
  }
  if (evidenceMarker.includes("stub-refusal")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }));
    return;
  }
  if (evidenceMarker.includes("stub-incomplete")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [] } }] }));
    return;
  }
  if (evidenceMarker.includes("stub-malformed")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{malformed" }] } }] }));
    return;
  }
  if (evidenceMarker.includes("stub-provider-error")) {
    response.writeHead(503, {
      "Content-Type": "application/json",
      "x-goog-request-id": "synthetic-request-id",
    });
    response.end(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE", message: "Synthetic provider failure" } }));
    return;
  }
  if (evidenceMarker.includes("stub-invalid-transport")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify({ ...observationOutput, score: 99, verdict: "pass" }) }] },
      }],
    }));
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(observationOutput) }] } }],
  }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Phase 1B observation stub listening on port ${port}`);
});
