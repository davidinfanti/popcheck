import { createServer } from "node:http";

const port = Number(process.env.PORT || 54329);
let analysisCalls = 0;

const baseObservation = {
  findingType: "supporting_consistency",
  observationStatus: "observed",
  severity: "informational",
  confidenceLevel: "high",
  imageIndex: 0,
  limitation: null,
  referenceUsed: null,
  referenceReliability: "none",
  modelVersion: "gemini-3.5-flash",
};

const observationOutput = {
  schemaVersion: "popcheck-observation-schema-v1",
  candidateIdentity: {
    popName: "Integration Fixture",
    popNumber: "101",
    series: "Animation",
    barcode: null,
    productionCode: null,
    factory: null,
    releaseYear: null,
    sticker: null,
    region: null,
    copyrightStamp: null,
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

  if (
    typeof request.headers["x-goog-api-key"] !== "string" ||
    body?.generationConfig?.responseFormat?.text?.mimeType !== "application/json" ||
    body?.generationConfig?.responseFormat?.text?.schema?.properties?.schemaVersion?.enum?.[0] !== "popcheck-observation-schema-v1" ||
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
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { code: 503, message: "Synthetic provider failure" } }));
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
