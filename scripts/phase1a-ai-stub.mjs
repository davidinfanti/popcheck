import { createServer } from "node:http";

const port = Number(process.env.PORT || 54329);
let analysisCalls = 0;

const analysis = {
  typographyScore: 88,
  borderScore: 88,
  barcodeScore: 88,
  colorScore: 88,
  barcodeMatch: "match",
  eraDetected: "2020",
  factoryCode: "FAC",
  summary: "Stubbed Phase 1A service-role integration analysis.",
  anomalies: [],
  comparativeResult: "no_references",
  referenceConfidence: 50,
  anomalyRegions: [],
  perImage: [{ angle: "front", notes: "Canonical owned evidence received.", resolutionGrade: "standard" }],
  verdictBand: "AUTHENTIC",
  marketRiskLevel: "low",
  marketFlags: [],
  stockPhotoDetected: false,
  whiteBorderScore: 88,
  cardboardQuality: "authentic_matte",
  innerFlapResult: "not_visible",
  blisterClarity: "clear_rigid",
  halftoneResult: "Halftone visible",
  socialMediaGeometry: "consistent",
  fontKerningNotes: "consistent",
  legalFooterResult: "consistent",
  stampToBoxMatch: "match",
  paintJobScore: 88,
  moldIntegrity: "consistent",
  copyrightStampPresent: true,
  stickerAuthenticity: "not_visible",
  qrCodeResult: "not_visible",
  requestedShots: [],
  seriesLine: "Animation",
  identifiedPopName: "Integration Fixture",
  identifiedPopNumber: "101",
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

  if (body.includes("attacker.example") || !body.includes("/storage/v1/object/public/funko-images/")) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Model request did not contain only canonical owned evidence." }));
    return;
  }

  analysisCalls += 1;
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({
    choices: [{
      message: {
        tool_calls: [{
          function: {
            name: "submit_vstamp_analysis",
            arguments: JSON.stringify(analysis),
          },
        }],
      },
    }],
  }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Phase 1A AI stub listening on port ${port}`);
});
