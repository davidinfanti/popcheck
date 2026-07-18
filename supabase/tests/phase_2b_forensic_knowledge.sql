begin;

set local role postgres;
set local search_path = extensions, public, auth, pg_catalog;

select plan(21);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000', '88888888-8888-4888-8888-888888888888',
  'authenticated', 'authenticated', 'phase2b-admin@example.test', '', now(), '{}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999999',
  'authenticated', 'authenticated', 'phase2b-user@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.user_roles (user_id, role) values ('88888888-8888-4888-8888-888888888888', 'admin');

select has_table('public', 'forensic_products', 'target product table exists');
select has_table('public', 'forensic_product_variants', 'target variant table exists');
select has_table('public', 'forensic_rules', 'forensic rules table exists');
select has_table('public', 'counterfeit_indicators', 'counterfeit indicator table exists');
select has_table('public', 'verified_reference_images', 'private verified-reference metadata table exists');
select has_table('public', 'known_counterfeit_examples', 'known counterfeit example table exists');
select has_column('public', 'verified_reference_images', 'storage_path', 'reference paths are opaque database metadata');
select has_column('public', 'verified_reference_images', 'file_hash', 'reference files retain hashes');
select has_column('public', 'verified_reference_images', 'validator_identity', 'reference validator identity is recorded');
select has_column('public', 'forensic_product_variants', 'legitimate_barcodes', 'variant records legitimate barcode variations');
select has_column('public', 'forensic_product_variants', 'production_factory_variations', 'variant records production/factory variations');
select has_column('public', 'known_counterfeit_examples', 'reference_image_id', 'counterfeit examples trace to a reference image');

select ok(not has_table_privilege('anon', 'public.verified_reference_images', 'SELECT'), 'anon cannot read private reference metadata');
select ok(not has_table_privilege('anon', 'public.forensic_rules', 'SELECT'), 'anon cannot read forensic rules');
select ok(has_function_privilege('authenticated', 'public.create_forensic_reference_draft(uuid,uuid,text,text,text,text,text,text,text,text,date,text)', 'EXECUTE'), 'admin workflow can call the guarded draft RPC');

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
select throws_ok(
  $$select public.create_forensic_reference_draft(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'original', 'front', 'front panel', 'Visible printed feature.', 'informational',
    'chain_of_custody', 'Recorded source.', 'Named owner', null, 'limited'
  )$$,
  '42501', 'admin role required', 'non-admin cannot curate references'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}';
insert into public.forensic_products (id, canonical_name, pop_number, franchise, created_by)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Saul Goodman', '163', 'Breaking Bad', '88888888-8888-4888-8888-888888888888');
insert into public.forensic_product_variants (id, product_id, release_label, created_by)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Draft exact release', '88888888-8888-4888-8888-888888888888');
insert into public.verified_reference_images (
  id, product_id, variant_id, classification, image_view, visible_region, factual_observation, severity,
  provenance_type, provenance_description, source_owner, reliability_tier, storage_path, created_by
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'original', 'front', 'front panel', 'Visible print geometry is recorded.', 'informational',
  'chain_of_custody', 'Recorded source.', 'Named owner', 'limited', 'v1/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc', '88888888-8888-4888-8888-888888888888'
);

select ok(
  not public.forensic_reference_is_eligible(
    (select reference_image from public.verified_reference_images reference_image where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'front', 'front panel'
  ),
  'draft reference is not eligible for analysis'
);
select throws_ok(
  $$select public.set_forensic_reference_status('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'verified', 'Named validator', current_date)$$,
  '23514', 'verified reference images require provenance, validator, verified reliability, and a validated private file',
  'a reference cannot be verified without a validated private file and verifier'
);
select is((select status from public.verified_reference_images where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'draft', 'failed verification leaves the reference draft');
select is((select version from public.verified_reference_images where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 1, 'failed verification does not rewrite the reference');
select ok(not exists(select 1 from public.known_counterfeit_examples), 'an original draft cannot become a known counterfeit example');

select * from finish();
rollback;
