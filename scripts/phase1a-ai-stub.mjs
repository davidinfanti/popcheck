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
  modelVersion: "google/gemini-3-flash-preview",
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

  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404).end();
    return;
  }

  let body = "";
  for await (const chunk of request) body += chunk;

  if (
    body.includes("attacker.example") ||
    !body.includes("/storage/v1/object/public/funko-images/") ||
    !body.includes("submit_popcheck_observations") ||
    body.includes("submit_vstamp_analysis")
  ) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Request did not use canonical evidence and the Phase 1B observation contract." }));
    return;
  }

  analysisCalls += 1;
  if (body.includes("/stub-refusal.jpg")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { refusal: "Stubbed refusal." } }] }));
    return;
  }
  if (body.includes("/stub-incomplete.jpg")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: "No tool call in this fixture." } }] }));
    return;
  }
  if (body.includes("/stub-malformed.jpg")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      choices: [{ message: { tool_calls: [{ function: { name: "submit_popcheck_observations", arguments: "{malformed" } }] } }],
    }));
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({
    choices: [{
      message: {
        tool_calls: [{
          function: {
            name: "submit_popcheck_observations",
            arguments: JSON.stringify(observationOutput),
          },
        }],
      },
    }],
  }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Phase 1B observation stub listening on port ${port}`);
});
