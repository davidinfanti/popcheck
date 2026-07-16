import assert from "node:assert/strict";

const apiUrl = process.env.SUPABASE_URL;
const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL || `${apiUrl}/functions/v1`;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stubUrl = process.env.AI_STUB_STATUS_URL || "http://127.0.0.1:54329/calls";
const canonicalSupabaseUrl = process.env.CANONICAL_SUPABASE_URL || apiUrl;

assert(apiUrl && anonKey && serviceRoleKey, "Local Supabase URL and keys are required in the process environment.");

async function jsonResponse(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { response, data };
}

async function signUp(label) {
  const { response, data } = await jsonResponse(await fetch(`${apiUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `phase1a-${label}-${Date.now()}@example.test`,
      password: "Local-integration-only-42!",
    }),
  }));

  assert.equal(response.status, 200, `signup failed with ${response.status}`);
  assert(data.access_token && data.user?.id, "signup did not return a local access token and user ID");
  return { token: data.access_token, userId: data.user.id };
}

async function insertSubmission(user, imageUrls) {
  const { response, data } = await jsonResponse(await fetch(`${apiUrl}/rest/v1/authentications`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ user_id: user.userId, image_urls: imageUrls, status: "analyzing" }),
  }));

  assert.equal(response.status, 201, `client submission insert failed with ${response.status}`);
  assert.equal(data.length, 1);
  return data[0];
}

async function invoke(user, authenticationId, extraBody = {}) {
  return jsonResponse(await fetch(`${functionsUrl}/analyze-funko`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ authenticationId, ...extraBody }),
  }));
}

async function serviceRead(authenticationId) {
  const { response, data } = await jsonResponse(await fetch(
    `${apiUrl}/rest/v1/authentications?id=eq.${authenticationId}&select=*`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  ));

  assert.equal(response.status, 200, `service-role read failed with ${response.status}`);
  assert.equal(data.length, 1);
  return data[0];
}

const initialStubStatus = await jsonResponse(await fetch(stubUrl));
assert.equal(initialStubStatus.response.status, 200, "AI stub status endpoint is unavailable");
const initialAnalysisCalls = initialStubStatus.data.analysisCalls;

const owner = await signUp("owner");
const other = await signUp("other");
const canonicalUrl = `${canonicalSupabaseUrl}/storage/v1/object/public/funko-images/${owner.userId}/front.jpg`;
const submission = await insertSubmission(owner, [canonicalUrl]);

const unauthenticated = await fetch(`${functionsUrl}/analyze-funko`, {
  method: "POST",
  headers: { apikey: anonKey, "Content-Type": "application/json" },
  body: JSON.stringify({ authenticationId: submission.id }),
});
assert.equal(unauthenticated.status, 401, "platform/in-function authentication did not reject a missing bearer token");

const wrongOwner = await invoke(other, submission.id);
assert.equal(wrongOwner.response.status, 403, "ownership check did not reject another user");

const completed = await invoke(owner, submission.id, {
  imageUrls: ["https://attacker.example/forged.jpg"],
});
assert.equal(completed.response.status, 200, `analysis invocation failed with ${completed.response.status}`);
assert.equal(completed.data.success, true);

const completedRow = await serviceRead(submission.id);
assert.equal(completedRow.status, "completed");
assert.equal(completedRow.score, 88);
assert.equal(completedRow.details.summary, "Stubbed Phase 1A service-role integration analysis.");
assert.equal(completedRow.analysis_model, "google/gemini-3-flash-preview");
assert.equal(completedRow.analysis_config_version, "vstamp-5.0-phase-1a");
assert.equal(completedRow.analysis_source, "physical_scan");
assert.equal(completedRow.legacy_unverified_references_used, false);
assert(completedRow.analyzed_at);
assert.equal(completedRow.details.audit.analysisSource, "physical_scan");

const rejectedSubmission = await insertSubmission(owner, ["https://attacker.example/private.jpg"]);
const rejected = await invoke(owner, rejectedSubmission.id);
assert.equal(rejected.response.status, 422);
assert.equal(rejected.data.error, "UNAPPROVED_IMAGE_SOURCE");

const rejectedRow = await serviceRead(rejectedSubmission.id);
assert.equal(rejectedRow.status, "evidence_required");
assert.equal(rejectedRow.details.failure.type, "evidence_validation");
assert.equal(rejectedRow.details.failure.code, "UNAPPROVED_IMAGE_SOURCE");
assert(!JSON.stringify(rejectedRow.details.failure).includes("attacker.example"));

const stubStatus = await jsonResponse(await fetch(stubUrl));
assert.equal(stubStatus.response.status, 200);
assert.equal(
  stubStatus.data.analysisCalls,
  initialAnalysisCalls + 1,
  "only the valid owned submission may call the AI stub",
);

console.log(JSON.stringify({
  result: "PASS",
  authenticated: true,
  ownershipEnforced: true,
  canonicalEvidenceLoaded: true,
  requestBodyImageMismatchIgnored: true,
  serviceRoleCompletedAssessment: true,
  auditMetadataStored: true,
  failedEvidencePersisted: true,
  paidAiCalls: 0,
}, null, 2));
