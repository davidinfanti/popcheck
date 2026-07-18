# Phase 2B Saul Goodman #163 forensic target pack

## Scope and safety boundary

Phase 2B adds an empty, private curation system. It does not import legacy knowledge, download images, activate a forensic rule, change the public assessment UI, restore V-STAMP, or give Gemini verdict authority. `popcheck-decision-v2` remains the sole verdict engine.

## Records

- `forensic_products` identifies Saul Goodman #163 as a normalized product without assuming a universal release.
- `forensic_product_variants` captures exact release, region, sticker, barcode, production/factory variation, and year range.
- `forensic_rules` records a versioned, falsifiable visual rule.
- `counterfeit_indicators` records a versioned, traceable counterfeit-only indicator.
- `verified_reference_images` stores private-file metadata and a factual observation. A public URL is neither stored nor accepted as provenance.
- `known_counterfeit_examples` is derived only from a verified counterfeit reference image; it cannot point at an original image.

All new records start as `draft`. `verified` requires provenance, source owner, validated private file/hash, named validator, validation date, and `verified` reliability. `retired` records cannot be selected for a new assessment. Updates increment the record version and retain creation/validation audit identities.

## Private storage and retrieval

Reference files use the private `forensic-reference-files` bucket and opaque `v1/<variant UUID>/<file UUID>` paths. The browser performs an admin-authorized upload only after a server-created draft supplies the opaque path; it has no storage credential or public URL. The finalize RPC validates the stored MIME type, size, and SHA-256 digest. Future server-side analysis access must use a server-generated signed URL only after exact-variant eligibility is established.

The current analysis path deliberately retrieves **zero** Phase 2B references until an exact trusted variant selection exists. It no longer passes legacy `original_references`, `fake_references`, `negative_references`, or `reference_pops` material to Gemini. The eligibility helper admits only verified, provenance-backed records matching the exact product, variant, image view, and visible region. A knowledge-derived model observation is rejected unless its `referenceUsed` identifier is in that exact eligible set and includes a submitted image index and visible region.

## Benchmark format

`src/test/fixtures/forensic-benchmark-v1.ts` defines the versioned benchmark record: target/variant, known ground truth/source, expert reviewer, redacted evidence IDs, expected indicators, structured observations, verdict/reliability, false-positive/false-negative classifications, notes, source run IDs, model/engine versions, and latency. The existing redacted Saul counterfeit false-negative is the first benchmark and has no private image URL.

## Operator intake checklist for Saul Goodman #163

1. Create the exact release/variant; leave it draft until release, region, sticker, barcode, factory/production variation, and release-year range are known.
2. Supply controlled images of a verified original for: front, rear, left, right, top, bottom/barcode, macro logo/window, copyright/production mark, and figure stamp where accessible.
3. Supply the same views for at least one documented counterfeit of the same release/variant. Do not submit marketplace or customer images as verified references.
4. For every file, provide source owner/contributor, provenance type and chain-of-custody description, capture date, exact variant applicability, visible region, and SHA-256-capable source file.
5. For every claimed distinction, provide a factual visible observation, mapped view/region, severity, and a named expert validator with validation date.
6. Upload as `draft`; confirm private hash/MIME/size finalization; then have an authorized administrator verify or retire it. Never return an in-process record to draft.
7. Review the automatically derived known-counterfeit example and the benchmark expectation. Do not activate a rule merely because an image is present.

## Minimum operator-supplied material next

- A named, independently validated original Saul Goodman #163 specimen and exact release/variant metadata.
- A named, documented counterfeit specimen of that same release/variant.
- Controlled original/counterfeit image pairs for every view listed above.
- Legitimate barcode and production/factory variation evidence, including known non-counterfeit variation boundaries.
- Written provenance, ownership/chain of custody, capture dates, file hashes, reviewer identities, validation dates, and factual visible distinctions.

Until these materials are supplied and validated, the Saul target pack remains empty and no product-specific reference can influence an assessment.
