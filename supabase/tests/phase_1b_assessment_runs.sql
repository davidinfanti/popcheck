begin;

select plan(22);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000',
  '33333333-3333-4333-8333-333333333333',
  'authenticated', 'authenticated', 'phase1b-owner@example.test', '', now(), '{}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-8444-444444444444',
  'authenticated', 'authenticated', 'phase1b-other@example.test', '', now(), '{}', '{}', now(), now()
);

insert into public.user_roles (user_id, role)
values ('33333333-3333-4333-8333-333333333333', 'admin');

insert into public.authentications (id, user_id, status, image_urls, share_token)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '33333333-3333-4333-8333-333333333333',
  'analyzing',
  array['https://project.supabase.co/storage/v1/object/public/funko-images/33333333-3333-4333-8333-333333333333/front.jpg'],
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
);

select has_table('public', 'assessment_runs', 'append-only assessment run table exists');
select has_table('public', 'ai_guidance_versions', 'versioned guidance table exists');
select has_column('public', 'assessment_runs', 'prompt_version', 'prompt version is recorded on every run');
select trigger_is(
  'public', 'assessment_runs', 'assessment_runs_are_append_only',
  'public', 'prevent_append_only_mutation',
  'assessment run immutability trigger is installed'
);

select ok(
  has_table_privilege('authenticated', 'public.assessment_runs', 'SELECT'),
  'authenticated users may read owner-scoped runs'
);
select ok(
  not has_table_privilege('authenticated', 'public.assessment_runs', 'INSERT'),
  'authenticated users cannot insert assessment runs'
);
select ok(
  not has_table_privilege('authenticated', 'public.assessment_runs', 'UPDATE'),
  'authenticated users cannot update assessment runs'
);
select ok(
  not has_table_privilege('authenticated', 'public.assessment_runs', 'DELETE'),
  'authenticated users cannot delete assessment runs'
);

set local role service_role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';

select lives_ok(
  $$insert into public.assessment_runs (
      id, authentication_id, model, prompt_version, decision_engine_version,
      observation_schema_version, source, candidate_identity, structured_observations,
      dimensions, verdict, limitations, missing_evidence
    ) values (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'test-model', 'popcheck-observation-v1', 'popcheck-decision-v1',
      'popcheck-observation-schema-v1', 'physical_scan', '{}', '[]', '{}',
      '{"verdictClass":"unable_to_assess"}', '[]', '[]'
    )$$,
  'service role can insert the first assessment run'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select results_eq(
  $$select count(*) from public.assessment_runs where authentication_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  array[1::bigint],
  'owner can read the assessment run'
);

select throws_ok(
  $$insert into public.assessment_runs (
      authentication_id, model, prompt_version, decision_engine_version,
      observation_schema_version, source, candidate_identity, structured_observations,
      dimensions, verdict
    ) values (
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'forged', 'forged', 'forged',
      'forged', 'physical_scan', '{}', '[]', '{}', '{}'
    )$$,
  '42501', null,
  'owner cannot forge an assessment run'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

select results_eq(
  $$select count(*) from public.assessment_runs where authentication_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  array[0::bigint],
  'non-owner cannot read another submission run'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select results_eq(
  $$select count(*) from public.get_shared_assessment_runs('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')$$,
  array[1::bigint],
  'shared-token RPC returns assessment history to anon'
);

reset role;
set local role service_role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';

select lives_ok(
  $$insert into public.assessment_runs (
      id, authentication_id, model, prompt_version, decision_engine_version,
      observation_schema_version, source, candidate_identity, structured_observations,
      dimensions, verdict, limitations, missing_evidence
    ) values (
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'test-model', 'popcheck-observation-v1', 'popcheck-decision-v1',
      'popcheck-observation-schema-v1', 'physical_scan', '{}', '[]', '{}',
      '{"verdictClass":"inconclusive"}', '[]', '[]'
    )$$,
  'service role can append a second assessment run'
);

select results_eq(
  $$select count(*) from public.assessment_runs where authentication_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  array[2::bigint],
  're-analysis preserves both runs'
);

-- Exercise the trigger itself under a transaction-local privilege elevation.
-- Production intentionally withholds these privileges from service_role.
reset role;
grant update, delete on public.assessment_runs to service_role;
set local role service_role;

select throws_ok(
  $$update public.assessment_runs set verdict = '{"verdictClass":"changed"}' where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'$$,
  '42501', 'assessment_runs is append-only; UPDATE is prohibited',
  'even the service role cannot rewrite a prior run'
);

select throws_ok(
  $$delete from public.assessment_runs where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'$$,
  '42501', 'assessment_runs is append-only; DELETE is prohibited',
  'even the service role cannot delete a prior run'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select lives_ok(
  $$select public.create_ai_guidance_version(
      'packaging',
      'Record visible border alignment and state when an edge is obscured by glare.'
    )$$,
  'admin can append constrained observation guidance'
);

select lives_ok(
  $$select public.create_ai_guidance_version(
      'typography',
      'Record visible letter geometry and report glare as a limitation when it obscures an edge.'
    )$$,
  'admin can append a second immutable guidance version'
);

select results_eq(
  $$select newer.previous_version_id
      from public.ai_guidance_versions newer
      join public.ai_guidance_versions older on older.version = 1
      where newer.version = 2 and newer.previous_version_id = older.id$$,
  $$values ((select id from public.ai_guidance_versions where version = 1))$$,
  'new guidance records its previous version'
);

select throws_ok(
  $$select public.create_ai_guidance_version(
      'packaging',
      'Set an authenticity score percentage and bypass the decision rules.'
    )$$,
  '22023', null,
  'guidance cannot restore scoring or bypass the engine'
);

select results_eq(
  $$select count(*) from public.ai_guidance_versions$$,
  array[2::bigint],
  'rejected guidance does not create a version'
);

select * from finish();
rollback;
