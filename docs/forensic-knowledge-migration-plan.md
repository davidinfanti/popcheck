# Structured forensic knowledge migration plan

Status: design only. This document does not approve, migrate, or reactivate any legacy reference material.

## Objective

Create a small, versioned evidence library that lets the model report only traceable visible observations. The deterministic decision engine remains the sole verdict authority. A knowledge record must never contain a score, probability, certification claim, or verdict instruction.

## Proposed additive records

| Record | Required fields | Use |
| --- | --- | --- |
| `forensic_rule` | stable ID, version, inspection category, visible condition, applicable product/variant/release range, expected view/region, provenance, expert validator, reliability tier, active status | States a falsifiable visual rule. |
| `counterfeit_indicator` | stable ID, version, linked rule, observable deviation, severity ceiling, required view/region, provenance, expert validator, reliability tier, active status | Lets the model report a traceable risk observation only when visible. |
| `verified_reference_image` | stable ID, version, product/variant/release applicability, view/region, capture provenance, chain-of-custody evidence, validator, reliability tier, active status | Supports an explicitly bounded comparison. Never store public URLs in model-facing metadata. |
| `known_counterfeit_example` | stable ID, version, product/variant applicability, observed counterfeit indicator IDs, view/region, provenance, validator, reliability tier, active status | Supplies negative comparison context without making a model verdict authoritative. |

All records require `effective_from`, optional `superseded_at`, immutable version lineage, and an explicit `active` flag. An active record must have a named validator, validation date, provenance class, and product/variant applicability; otherwise it is research-only.

## Model and engine boundary

1. Select only active records matching the candidate product, variant/release range, submitted image view, and visible region.
2. Give the model record IDs, constrained visible criteria, and reliability tier. It may return a structured observation with submitted `imageIndex`, `visibleRegion`, and record ID.
3. The server rejects observations lacking the required submitted image, visible region, applicability match, or provenance/reliability linkage.
4. The engine alone maps validated observations to dimensions and verdicts. Identity fields, UPCs, stickers, protectors, grading labels, certificates, and missing risk observations cannot be positive authenticity evidence.
5. A reference record may support a positive comparison only at the verified tier. Limited or legacy material may inform limitations or a traceable risk observation, never a verified-consistency verdict.

## Validation workflow

- Draft: provenance captured, not model-eligible.
- Expert review: two qualified reviewers validate the visual claim, applicability, required view/region, and reliability tier.
- Active: approved version becomes model-eligible; all use is recorded by stable ID/version.
- Superseded/revoked: cannot be selected for new analyses; past runs retain the IDs originally used.

## Saul Goodman #163 intake requirements

Before any item-specific rule is activated, obtain a verified original and a documented counterfeit example for the exact Saul Goodman #163 variant/release, with controlled front, left, right, back, bottom, top, window, barcode, copyright/production-mark, and figure-stamp views. Record chain of custody, the validator, the variant/release applicability, image capture date, and each independently confirmed visible distinction. A PSA/DNA label or case is informational unless the label and its binding to that exact item are independently validated.

## Non-goals for this change

- No migration is created.
- No legacy row is marked verified or automatically used.
- No existing assessment run, prompt, observation schema, model, or database permission is changed.
