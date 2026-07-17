import assert from "node:assert/strict";

const apiUrl = process.env.SUPABASE_URL;
const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL || `${apiUrl}/functions/v1`;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stubUrl = process.env.AI_STUB_STATUS_URL || "http://127.0.0.1:54329/calls";
const canonicalSupabaseUrl = process.env.CANONICAL_SUPABASE_URL || apiUrl;
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

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
      email: `phase1b-${label}-${Date.now()}@example.test`,
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

async function uploadEvidence(userId, fileName, bytes = onePixelPng) {
  const response = await fetch(`${apiUrl}/storage/v1/object/funko-images/${userId}/${fileName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "image/png",
      "x-upsert": "true",
    },
    body: bytes,
  });
  assert([200, 201].includes(response.status), `synthetic evidence upload failed with ${response.status}`);
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

async function serviceReadRuns(authenticationId) {
  const { response, data } = await jsonResponse(await fetch(
    `${apiUrl}/rest/v1/assessment_runs?authentication_id=eq.${authenticationId}&select=*&order=created_at.asc`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  ));

  assert.equal(response.status, 200, `service-role run read failed with ${response.status}`);
  return data;
}

const initialStubStatus = await jsonResponse(await fetch(stubUrl));
assert.equal(initialStubStatus.response.status, 200, "AI stub status endpoint is unavailable");
const initialAnalysisCalls = initialStubStatus.data.analysisCalls;

const owner = await signUp("owner");
const other = await signUp("other");
await uploadEvidence(owner.userId, "front.jpg");
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
assert.equal(
  completed.response.status,
  200,
  `analysis invocation failed with ${completed.response.status}: ${JSON.stringify(completed.data)}`,
);
assert.equal(completed.data.success, true);
assert.equal(completed.data.providerMode, "structured_schema");

const completedRow = await serviceRead(submission.id);
assert.equal(completedRow.status, "completed");
assert.equal(completedRow.score, null, "Phase 1B must not populate the legacy score");
assert.equal(completedRow.details.phase1b, true);
assert.equal(completedRow.details.decision.verdictClass, "no_material_anomaly_detected");
assert.equal(completedRow.analysis_model, "gemini-3.5-flash");
assert.equal(completedRow.analysis_config_version, "popcheck-observation-v1");
assert.equal(completedRow.analysis_source, "physical_scan");
assert.equal(completedRow.legacy_unverified_references_used, false);
assert(completedRow.analyzed_at);
assert.equal(completedRow.details.audit.analysisSource, "physical_scan");
assert.equal(completedRow.details.audit.decisionEngineVersion, "popcheck-decision-v1");
assert.equal(completedRow.details.audit.observationSchemaVersion, "popcheck-observation-schema-v1");
assert.equal(completedRow.details.audit.providerSchemaVersion, "gemini-observation-transport-v1");
assert.equal(completedRow.details.audit.providerMode, "structured_schema");

const firstRuns = await serviceReadRuns(submission.id);
assert.equal(firstRuns.length, 1);
assert.equal(firstRuns[0].id, completed.data.assessmentRunId);
assert.equal(completedRow.details.assessmentRunId, firstRuns[0].id, "snapshot and authoritative run must commit together");
assert.equal(firstRuns[0].run_kind, "phase_1b");
assert(firstRuns[0].completion_token, "atomic completion must store an idempotency token");
assert.equal(firstRuns[0].prompt_version, "popcheck-observation-v1");
assert.equal(firstRuns[0].decision_engine_version, "popcheck-decision-v1");
assert.equal(firstRuns[0].verdict.verdictClass, "no_material_anomaly_detected");
assert.equal(firstRuns[0].dimensions.referenceCoverage, "none");
assert.equal(firstRuns[0].structured_observations.length, 3);

const repeated = await invoke(owner, submission.id);
assert.equal(repeated.response.status, 200);
const repeatedRuns = await serviceReadRuns(submission.id);
assert.equal(repeatedRuns.length, 2, "re-analysis must append a second run");
assert.equal(repeatedRuns[0].id, firstRuns[0].id, "the earlier run must remain unchanged");
assert.notEqual(repeatedRuns[1].id, repeatedRuns[0].id);
assert.equal(completedRow.details.audit.structuredGuidanceVersionId, null);

await uploadEvidence(owner.userId, "stub-schema-compile.jpg", Buffer.from("stub-schema-compile"));
const fallbackSubmission = await insertSubmission(owner, [
  `${canonicalSupabaseUrl}/storage/v1/object/public/funko-images/${owner.userId}/stub-schema-compile.jpg`,
]);
const fallbackCompletion = await invoke(owner, fallbackSubmission.id);
assert.equal(fallbackCompletion.response.status, 200);
assert.equal(fallbackCompletion.data.success, true);
assert.equal(fallbackCompletion.data.providerMode, "json_fallback");
const fallbackRow = await serviceRead(fallbackSubmission.id);
const fallbackRuns = await serviceReadRuns(fallbackSubmission.id);
assert.equal(fallbackRow.status, "completed");
assert.equal(fallbackRow.score, null);
assert.equal(fallbackRow.details.audit.providerMode, "json_fallback");
assert.equal(fallbackRow.details.audit.providerSchemaVersion, "gemini-observation-transport-v1");
assert.equal(fallbackRuns.length, 1);
assert.equal(fallbackRuns[0].model, "gemini-3.5-flash");
assert.equal(fallbackRuns[0].prompt_version, "popcheck-observation-v1");
assert.equal(fallbackRuns[0].decision_engine_version, "popcheck-decision-v1");
assert.equal(fallbackRuns[0].observation_schema_version, "popcheck-observation-schema-v1");
assert.equal(fallbackRow.details.assessmentRunId, fallbackRuns[0].id);

await uploadEvidence(owner.userId, "stub-primary-unavailable-fallback.jpg", Buffer.from("stub-primary-unavailable-fallback"));
const modelFallbackSubmission = await insertSubmission(owner, [
  `${canonicalSupabaseUrl}/storage/v1/object/public/funko-images/${owner.userId}/stub-primary-unavailable-fallback.jpg`,
]);
const modelFallbackCompletion = await invoke(owner, modelFallbackSubmission.id);
assert.equal(modelFallbackCompletion.response.status, 200);
assert.equal(modelFallbackCompletion.data.success, true);
assert.equal(modelFallbackCompletion.data.providerMode, "structured_schema");
const modelFallbackRow = await serviceRead(modelFallbackSubmission.id);
const modelFallbackRuns = await serviceReadRuns(modelFallbackSubmission.id);
assert.equal(modelFallbackRow.status, "completed");
assert.equal(modelFallbackRow.analysis_model, "gemini-2.5-flash");
assert.equal(modelFallbackRuns.length, 1);
assert.equal(modelFallbackRuns[0].model, "gemini-2.5-flash");
assert.equal(modelFallbackRow.details.audit.providerAudit.requestedPrimaryModel, "gemini-3.5-flash");
assert.equal(modelFallbackRow.details.audit.providerAudit.successfulModel, "gemini-2.5-flash");
assert.equal(modelFallbackRow.details.audit.providerAudit.attemptCount, 4);
assert.equal(modelFallbackRow.details.audit.providerAudit.fallbackUsed, true);
assert.equal(modelFallbackRow.details.audit.providerAudit.attempts.length, 4);

async function assertControlledProviderFailure(marker, expectedCode, expectedStatus = 422) {
  await uploadEvidence(owner.userId, `${marker}.jpg`, Buffer.from(marker));
  const failureSubmission = await insertSubmission(owner, [
    `${canonicalSupabaseUrl}/storage/v1/object/public/funko-images/${owner.userId}/${marker}.jpg`,
  ]);
  const failureResult = await invoke(owner, failureSubmission.id);
  assert.equal(failureResult.response.status, expectedStatus, `${marker} must return a controlled ${expectedStatus}`);
  assert.equal(failureResult.data.error, expectedCode);
  const failureRow = await serviceRead(failureSubmission.id);
  assert.equal(failureRow.status, "failed");
  assert.equal(failureRow.details.failure.type, "phase_1b_analysis");
  assert.equal(failureRow.details.failure.code, expectedCode);
  assert.equal((await serviceReadRuns(failureSubmission.id)).length, 0, `${marker} must not create a verdict run`);
}

await assertControlledProviderFailure("stub-refusal", "MODEL_REFUSAL");
await assertControlledProviderFailure("stub-incomplete", "INCOMPLETE_MODEL_OUTPUT");
await assertControlledProviderFailure("stub-malformed", "MALFORMED_MODEL_OUTPUT");
await assertControlledProviderFailure("stub-provider-error", "PROVIDER_UNAVAILABLE", 502);
await assertControlledProviderFailure("stub-invalid-transport", "INVALID_MODEL_OUTPUT");

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
  initialAnalysisCalls + 16,
  "only completed runs, compatibility fallback, model fallback, and controlled provider-failure fixtures may call the Gemini stub",
);

console.log(JSON.stringify({
  result: "PASS",
  authenticated: true,
  ownershipEnforced: true,
  canonicalEvidenceLoaded: true,
  requestBodyImageMismatchIgnored: true,
  serviceRoleCompletedAssessment: true,
  atomicRunAndSnapshotCommitted: true,
  completionTokenStored: true,
  auditMetadataStored: true,
  legacyScoreNotWritten: true,
  appendOnlyHistoryPreserved: true,
  deterministicVerdictStored: true,
  failedEvidencePersisted: true,
  refusalFailedSafely: true,
  incompleteOutputFailedSafely: true,
  malformedOutputFailedSafely: true,
  providerErrorFailedSafely: true,
  invalidTransportFailedSafely: true,
  transportSchemaAudited: true,
  structuredSchemaModeStored: true,
  jsonFallbackModeStored: true,
  modelFallbackModeStored: true,
  paidAiCalls: 0,
}, null, 2));
