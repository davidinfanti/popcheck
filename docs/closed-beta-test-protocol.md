# POPCHECK closed-beta test protocol

## Test-case metadata

| Field | Value |
| --- | --- |
| Protocol version | `popcheck-closed-beta-v1` |
| Environment | Staging — https://popcheck-staging.vercel.app |
| Supabase project | `jodnihtyxrcuxcvvgess` |
| Edge Function | `analyze-funko` v16 |
| Assessment source | `physical_scan` |
| Provider | Gemini `gemini-3.5-flash` |
| Provider mode | `structured_schema` |
| Provider schema | `gemini-observation-transport-v1` |
| Observation schema | `popcheck-observation-schema-v1` |
| Decision engine | `popcheck-decision-v1` |
| Test evidence | Six synthetic one-pixel PNGs; no real customer or production evidence |
| Test date | 2026-07-18 |

## Expected expert verdict

`unable_to_assess`. The synthetic images contain no usable visible product evidence. A human reviewer should not infer authenticity, counterfeiting, product identity, or physical-item characteristics from this test case.

## Image-quality checklist

| Required view | Uploaded | Usable for substantive assessment | Reviewer check |
| --- | --- | --- | --- |
| Front | Yes | No — synthetic one-pixel fixture | Confirm insufficient visible evidence |
| Left side | Yes | No — synthetic one-pixel fixture | Confirm insufficient visible evidence |
| Right side | Yes | No — synthetic one-pixel fixture | Confirm insufficient visible evidence |
| Back | Yes | No — synthetic one-pixel fixture | Confirm insufficient visible evidence |
| Bottom / barcode | Yes | No — synthetic one-pixel fixture | Confirm no code conclusion is made |
| Macro / logo | Yes | No — synthetic one-pixel fixture | Confirm no print or logo conclusion is made |

## POPCHECK outcome

| Field | First run | Re-analysis |
| --- | --- | --- |
| Assessment run ID | `be53d77d-7df2-47c9-8aa6-cf6b7b49e1f5` | `e4344b5c-0156-44d1-9cd0-816a155b0732` |
| Verdict | `unable_to_assess` | `unable_to_assess` |
| Reliability | `not_assessable` | `not_assessable` |
| Evidence quality | `insufficient` | `insufficient` |
| Provider model | `gemini-3.5-flash` | `gemini-3.5-flash` |
| Provider attempts | 1 | Record from the run audit metadata before reviewer sign-off |
| Fallback used | No | Record from the run audit metadata before reviewer sign-off |
| End-to-end latency | 11,935 ms | Record before reviewer sign-off |
| Provider latency | 10,477 ms | Record before reviewer sign-off |

## Observations and limitations

- The images did not support product identity, visual-consistency, code-consistency, or counterfeit-indicator conclusions.
- No reference material was available for this test submission.
- POPCHECK requested clear, well-lit product, packaging, code, and figure evidence before a substantive assessment.
- Legacy score remains null. The result is categorical and is not an authenticity certification.

## Error-classification record

| Classification | Result | Reviewer notes |
| --- | --- | --- |
| False positive | Not applicable | No counterfeit-positive claim was made. |
| False negative | Not applicable | No authenticity-negative or positive claim was made. |
| Appropriate abstention | Pass | The system returned `unable_to_assess` for intentionally unusable evidence. |

## Reviewer sign-off

- Reviewer name and role:
- Review date and timezone:
- Evidence provenance confirmed synthetic: Yes / No
- Expected expert verdict matched: Yes / No
- POPCHECK verdict and reliability matched: Yes / No
- Both run IDs reviewed and first run confirmed unchanged: Yes / No
- PDF reviewed for completeness: Yes / No
- Collection history reviewed: Yes / No
- Provider attempt metadata reviewed without secrets or image payloads: Yes / No
- Notes / follow-up actions:

