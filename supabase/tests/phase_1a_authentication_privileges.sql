begin;

select plan(10);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'phase1a@example.test',
  '',
  now(),
  '{}',
  '{}',
  now(),
  now()
);

insert into public.authentications (id, user_id, status, image_urls)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'analyzing',
  array['https://project.supabase.co/storage/v1/object/public/funko-images/11111111-1111-4111-8111-111111111111/front.jpg']
);

select has_column('public', 'authentications', 'analysis_model', 'analysis model is auditable');
select has_column('public', 'authentications', 'analyzed_at', 'analysis timestamp is auditable');

select ok(
  not has_table_privilege('authenticated', 'public.authentications', 'UPDATE'),
  'authenticated users cannot update authentication rows through PostgREST'
);

select ok(
  has_table_privilege('service_role', 'public.authentications', 'UPDATE'),
  'analysis backend retains authentication-row update privilege'
);

select trigger_is(
  'public',
  'authentications',
  'guard_authentication_assessment_fields',
  'guard_authentication_assessment_fields',
  'assessment insert/update trigger is installed'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_ok(
  $$insert into public.authentications (user_id, status, score) values ('11111111-1111-4111-8111-111111111111', 'analyzing', 100)$$,
  '42501',
  'assessment-controlled fields may only be written by the analysis backend',
  'authenticated user cannot forge score on insert'
);

select throws_ok(
  $$insert into public.authentications (user_id, status) values ('11111111-1111-4111-8111-111111111111', 'completed')$$,
  '42501',
  'assessment-controlled fields may only be written by the analysis backend',
  'authenticated user cannot create a completed assessment'
);

select throws_ok(
  $$insert into public.authentications (user_id, status, details) values ('11111111-1111-4111-8111-111111111111', 'analyzing', '{"summary":"forged"}')$$,
  '42501',
  'assessment-controlled fields may only be written by the analysis backend',
  'authenticated user cannot forge details on insert'
);

select throws_ok(
  $$update public.authentications set score = 100, status = 'completed', details = '{"summary":"forged"}' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '42501',
  null,
  'authenticated user cannot update score, status, or details'
);

reset role;
set local role service_role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';

select lives_ok(
  $$update public.authentications set score = 91, status = 'completed', details = '{"summary":"backend result"}', analysis_model = 'test-model', analysis_config_version = 'test-config', analyzed_at = now(), legacy_unverified_references_used = false, analysis_source = 'physical_scan' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'service role can write a completed backend result'
);

reset role;

select * from finish();
rollback;
