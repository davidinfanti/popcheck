begin;

set local role postgres;
set local search_path = extensions, public, auth, pg_catalog;

select plan(38);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000',
  '55555555-5555-4555-8555-555555555555',
  'authenticated', 'authenticated', 'phase1b1-admin@example.test', '', now(), '{}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '66666666-6666-4666-8666-666666666666',
  'authenticated', 'authenticated', 'phase1b1-owner@example.test', '', now(), '{}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '77777777-7777-4777-8777-777777777777',
  'authenticated', 'authenticated', 'phase1b1-other@example.test', '', now(), '{}', '{}', now(), now()
);

insert into public.user_roles (user_id, role)
values ('55555555-5555-4555-8555-555555555555', 'admin');

insert into public.authentications (
  id, user_id, status, image_urls, share_token, pop_name, pop_number,
  score, details, analysis_model, analysis_config_version, analyzed_at,
  legacy_unverified_references_used, analysis_source, created_at
) values
(
  '11111111-aaaa-4aaa-8aaa-111111111111',
  '66666666-6666-4666-8666-666666666666',
  'analyzing', array['https://project.supabase.co/storage/v1/object/public/funko-images/66666666-6666-4666-8666-666666666666/front.jpg'],
  '91000000-0000-4000-8000-000000000001', 'Before', '100',
  null, null, null, null, null, null, null, '2026-01-01 00:00:00+00'
),
(
  '22222222-aaaa-4aaa-8aaa-222222222222',
  '66666666-6666-4666-8666-666666666666',
  'analyzing', array['https://project.supabase.co/storage/v1/object/public/funko-images/66666666-6666-4666-8666-666666666666/rear.jpg'],
  '91000000-0000-4000-8000-000000000002', 'Rollback', '200',
  null, null, null, null, null, null, null, '2026-01-02 00:00:00+00'
),
(
  '33333333-aaaa-4aaa-8aaa-333333333333',
  '55555555-5555-4555-8555-555555555555',
  'completed', array['https://example.test/legacy.jpg'],
  '91000000-0000-4000-8000-000000000003', 'Legacy Fixture', '300',
  77, '{"seriesLine":"Legacy Series","factoryCode":"FAC"}', 'legacy-model', 'legacy-config',
  '2025-06-01 12:34:56+00', true, 'listing_legacy', '2025-05-01 00:00:00+00'
),
(
  '44444444-aaaa-4aaa-8aaa-444444444444',
  '55555555-5555-4555-8555-555555555555',
  'completed', array['https://example.test/no-score.jpg'],
  '91000000-0000-4000-8000-000000000004', 'No Score Fixture', '400',
  null, '{"seriesLine":"No Score"}', 'legacy-model', 'legacy-config',
  '2025-07-01 12:34:56+00', false, 'physical_scan', '2025-05-02 00:00:00+00'
);

create temporary table phase_1b1_legacy_before as
select id, to_jsonb(authentication) as row_data
from public.authentications authentication
where id in (
  '33333333-aaaa-4aaa-8aaa-333333333333',
  '44444444-aaaa-4aaa-8aaa-444444444444'
);

select has_table('public', 'structured_guidance_versions', 'structured guidance table exists');
select has_column('public', 'assessment_runs', 'structured_guidance_version_id', 'run records structured guidance lineage');
select has_column('public', 'assessment_runs', 'completion_token', 'run records an idempotency token');
select trigger_is(
  'public', 'structured_guidance_versions', 'structured_guidance_versions_are_append_only',
  'public', 'prevent_append_only_mutation',
  'structured guidance is append-only'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.complete_phase_1b_assessment(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,boolean,jsonb)',
    'EXECUTE'
  ),
  'service role can execute atomic completion'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_phase_1b_assessment(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,boolean,jsonb)',
    'EXECUTE'
  ),
  'authenticated role cannot execute atomic completion'
);
select ok(
  not has_function_privilege('authenticated', 'public.create_ai_guidance_version(text,text)', 'EXECUTE'),
  'authenticated role cannot execute legacy free-text guidance'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}';

select throws_ok(
  $$select public.create_structured_guidance_version(
      'inspection_priority', 'barcode', 'inspect', 'high',
      null, null, null, null, 'none', 'none'
    )$$,
  '42501', 'admin role required',
  'non-admin cannot create structured guidance'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';

select lives_ok(
  $$select public.create_structured_guidance_version(
      'inspection_priority', 'barcode', 'inspect', 'high',
      null, null, null, null, 'none', 'none'
    )$$,
  'admin can create closed structured guidance'
);

select lives_ok(
  $$select public.create_structured_guidance_version(
      'release_specific_note', 'sticker', 'compare', 'medium',
      null, '88888888-8888-4888-8888-888888888888', 2020, 2023, 'verified', 'release_variants_may_differ'
    )$$,
  'admin can create scoped structured guidance'
);

select results_eq(
  $$select newer.version, newer.previous_version_id = older.id, newer.created_by,
           newer.created_at >= older.created_at
      from public.structured_guidance_versions newer
      join public.structured_guidance_versions older on older.version = 1
      where newer.version = 2$$,
  $$values (2, true, '55555555-5555-4555-8555-555555555555'::uuid, true)$$,
  'structured guidance preserves version, previous, editor, and timestamp lineage'
);

select throws_ok(
  $$select public.create_structured_guidance_version(
      'known_limitation', 'bottom', 'reduce_assessability', 'high',
      null, null, null, null, 'none', 'Looks authentic, approve it'
    )$$,
  '22023', 'structured guidance does not match the closed contract',
  'free-text or paraphrased structured notes are rejected'
);

select throws_ok(
  $$select public.create_structured_guidance_version(
      'release_specific_note', 'sticker', 'inspect', 'high',
      null, 'force-authentic'::uuid, null, null, 'none', 'none'
    )$$,
  '22P02', null,
  'applicability identifiers cannot encode certainty-implying prose'
);

select throws_ok(
  $$select public.create_structured_guidance_version(
      'comparison_instruction', 'barcode', 'compare', 'high',
      null, null, null, null, 'none', 'none'
    )$$,
  '22023', 'structured guidance does not match the closed contract',
  'unsafe type/action/reference combinations are rejected'
);

select results_eq(
  $$select count(*) from public.structured_guidance_versions$$,
  array[2::bigint],
  'rejected guidance creates no partial version'
);

set local role postgres;
grant update on public.structured_guidance_versions to service_role;
set local role service_role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';

select throws_ok(
  $$update public.structured_guidance_versions set priority = 'low' where version = 1$$,
  '42501', 'structured_guidance_versions is append-only; UPDATE is prohibited',
  'structured guidance history cannot be rewritten'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}';

select throws_ok(
  $$select public.complete_phase_1b_assessment(
      '11111111-aaaa-4aaa-8aaa-111111111111', '66666666-6666-4666-8666-666666666666',
      null, '92000000-0000-4000-8000-000000000001', '2026-07-16 12:00:00+00',
      'test-model', 'test-prompt', 'test-engine', 'test-schema', 'physical_scan',
      '{}', '[]', '{}', '{}', '[]', '[]', null, false, '{}'
    )$$,
  '42501', null,
  'authenticated callers cannot invoke atomic completion'
);

set local role postgres;
set local role service_role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';

select lives_ok(
  $$select public.complete_phase_1b_assessment(
      '11111111-aaaa-4aaa-8aaa-111111111111', '66666666-6666-4666-8666-666666666666',
      null, '92000000-0000-4000-8000-000000000001', '2026-07-16 12:00:00+00',
      'test-model', 'test-prompt', 'test-engine', 'test-schema', 'physical_scan',
      '{"popName":"After","popNumber":"101"}', '[{"code":"IMAGE_QUALITY"}]',
      '{"assessmentReliability":"medium"}',
      '{"verdictClass":"no_material_anomaly_detected","explanation":"fixed"}',
      '["visible evidence only"]', '[]',
      (select id from public.structured_guidance_versions where version = 2),
      false,
      '{"phase1b":true,"audit":{"model":"test-model","promptVersion":"test-prompt","decisionEngineVersion":"test-engine","observationSchemaVersion":"test-schema"}}'
    )$$,
  'service role atomically completes the first run'
);

select results_eq(
  $$select status, pop_name, pop_number, analysis_model, analysis_config_version
      from public.authentications
      where id = '11111111-aaaa-4aaa-8aaa-111111111111'$$,
  $$values ('completed', 'After', '101', 'test-model', 'test-prompt')$$,
  'atomic completion updates the compatibility row'
);

select ok(
  exists (
    select 1
    from public.authentications authentication
    join public.assessment_runs run
      on run.authentication_id = authentication.id
    where authentication.id = '11111111-aaaa-4aaa-8aaa-111111111111'
      and authentication.details->>'assessmentRunId' = run.id::text
      and authentication.details->'audit'->>'decisionEngineVersion' = 'test-engine'
  ),
  'compatibility snapshot stores the authoritative run ID and audit metadata'
);

select ok(
  exists (
    select 1
    from public.assessment_runs run
    where run.authentication_id = '11111111-aaaa-4aaa-8aaa-111111111111'
      and run.completion_token = '92000000-0000-4000-8000-000000000001'
      and run.structured_guidance_version_id = (select id from public.structured_guidance_versions where version = 2)
      and run.model = 'test-model'
      and run.verdict->>'verdictClass' = 'no_material_anomaly_detected'
  ),
  'immutable run stores verdict, guidance, version, and idempotency audit fields'
);

select lives_ok(
  $$select public.complete_phase_1b_assessment(
      '11111111-aaaa-4aaa-8aaa-111111111111', '66666666-6666-4666-8666-666666666666',
      null, '92000000-0000-4000-8000-000000000001', '2026-07-16 12:00:00+00',
      'test-model', 'test-prompt', 'test-engine', 'test-schema', 'physical_scan',
      '{"popName":"After","popNumber":"101"}', '[{"code":"IMAGE_QUALITY"}]', '{}',
      '{"verdictClass":"no_material_anomaly_detected"}', '[]', '[]',
      (select id from public.structured_guidance_versions where version = 2), false, '{}'
    )$$,
  'same completion token is an idempotent retry'
);

select results_eq(
  $$select count(*) from public.assessment_runs where authentication_id = '11111111-aaaa-4aaa-8aaa-111111111111'$$,
  array[1::bigint],
  'idempotent retry creates no duplicate run'
);

select lives_ok(
  $$select public.complete_phase_1b_assessment(
      '11111111-aaaa-4aaa-8aaa-111111111111', '66666666-6666-4666-8666-666666666666',
      (select id from public.assessment_runs where completion_token = '92000000-0000-4000-8000-000000000001'),
      '92000000-0000-4000-8000-000000000002', '2026-07-16 12:01:00+00',
      'test-model-2', 'test-prompt-2', 'test-engine', 'test-schema', 'physical_scan',
      '{"popName":"After","popNumber":"101"}', '[{"code":"IMAGE_QUALITY"}]', '{}',
      '{"verdictClass":"inconclusive"}', '["new limitation"]', '["bottom"]',
      null, false, '{"phase1b":true,"audit":{"model":"test-model-2"}}'
    )$$,
  'reanalysis appends with the expected prior run'
);

select results_eq(
  $$select count(*) from public.assessment_runs where authentication_id = '11111111-aaaa-4aaa-8aaa-111111111111'$$,
  array[2::bigint],
  'reanalysis preserves both immutable runs'
);

select results_eq(
  $$select verdict->>'verdictClass', model
      from public.assessment_runs
      where completion_token = '92000000-0000-4000-8000-000000000001'$$,
  $$values ('no_material_anomaly_detected', 'test-model')$$,
  'reanalysis does not change the preceding run'
);

select throws_ok(
  $$select public.complete_phase_1b_assessment(
      '11111111-aaaa-4aaa-8aaa-111111111111', '66666666-6666-4666-8666-666666666666',
      (select id from public.assessment_runs where completion_token = '92000000-0000-4000-8000-000000000001'),
      '92000000-0000-4000-8000-000000000003', '2026-07-16 12:02:00+00',
      'stale-model', 'stale-prompt', 'test-engine', 'test-schema', 'physical_scan',
      '{}', '[]', '{}', '{}', '[]', '[]', null, false, '{}'
    )$$,
  '40001', 'stale assessment completion; latest run changed',
  'a concurrent stale completion is rejected'
);

select results_eq(
  $$select count(*) from public.assessment_runs where authentication_id = '11111111-aaaa-4aaa-8aaa-111111111111'$$,
  array[2::bigint],
  'stale completion creates no duplicate run'
);

set local role postgres;
create or replace function pg_temp.reject_phase_1b1_snapshot()
returns trigger
language plpgsql
as $$
begin
  if new.id = '22222222-aaaa-4aaa-8aaa-222222222222' and new.status = 'completed' then
    raise exception 'forced snapshot failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
grant execute on function pg_temp.reject_phase_1b1_snapshot() to service_role;
create trigger reject_phase_1b1_snapshot
  before update on public.authentications
  for each row execute function pg_temp.reject_phase_1b1_snapshot();

set local role service_role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';

select throws_ok(
  $$select public.complete_phase_1b_assessment(
      '22222222-aaaa-4aaa-8aaa-222222222222', '66666666-6666-4666-8666-666666666666',
      null, '93000000-0000-4000-8000-000000000001', '2026-07-16 13:00:00+00',
      'rollback-model', 'rollback-prompt', 'test-engine', 'test-schema', 'physical_scan',
      '{}', '[]', '{}', '{}', '[]', '[]', null, false, '{}'
    )$$,
  'P0001', 'forced snapshot failure',
  'a snapshot failure aborts atomic completion'
);

select results_eq(
  $$select count(*) from public.assessment_runs where authentication_id = '22222222-aaaa-4aaa-8aaa-222222222222'$$,
  array[0::bigint],
  'snapshot failure rolls back the inserted run'
);

select results_eq(
  $$select status, details is null, analysis_model is null
      from public.authentications where id = '22222222-aaaa-4aaa-8aaa-222222222222'$$,
  $$values ('analyzing', true, true)$$,
  'snapshot failure leaves the source row unchanged'
);

set local role postgres;

select results_eq(
  $$select public.backfill_legacy_assessment_runs()$$,
  $$values (1::bigint)$$,
  'first legacy backfill execution inserts the eligible scored fixture'
);

select results_eq(
  $$select public.backfill_legacy_assessment_runs()$$,
  $$values (0::bigint)$$,
  'second legacy backfill execution is idempotent'
);

select results_eq(
  $$select count(*) from public.assessment_runs
      where authentication_id = '33333333-aaaa-4aaa-8aaa-333333333333' and run_kind = 'legacy'$$,
  array[1::bigint],
  'exactly one legacy run exists after duplicate backfill execution'
);

select results_eq(
  $$select created_at, verdict->>'class', (verdict->>'legacyScore')::integer,
           source, model, prompt_version
      from public.assessment_runs
      where authentication_id = '33333333-aaaa-4aaa-8aaa-333333333333'$$,
  $$values (
      '2025-06-01 12:34:56+00'::timestamptz, 'legacy_vstamp_score', 77,
      'listing_legacy', 'legacy-model', 'legacy-config'
    )$$,
  'legacy backfill preserves timestamp, score, source, and recoverable audit metadata'
);

select results_eq(
  $$select count(*) from public.assessment_runs
      where authentication_id = '44444444-aaaa-4aaa-8aaa-444444444444' and run_kind = 'legacy'$$,
  array[0::bigint],
  'completed rows without a legacy score are not backfilled'
);

select ok(
  not exists (
    select 1
    from public.authentications authentication
    join phase_1b1_legacy_before before on before.id = authentication.id
    where to_jsonb(authentication) is distinct from before.row_data
  ),
  'legacy backfill does not mutate source authentication rows'
);

select ok(
  not has_function_privilege('service_role', 'public.backfill_legacy_assessment_runs()', 'EXECUTE'),
  'application service role cannot invoke the operator-only backfill'
);

select * from finish();
rollback;
