# Task 2 Report: Full Institution Source Fields

## Result

Each institution detail record now has a `sourceFields` object containing every original workbook column under its exact source header. The raw values remain distinct from normalized `creditCode`, `codeStatus`, summary `address`, and region/city grouping. Supplemental province/city/county and coordinates do not influence assignment. The detail page renders all 11 raw columns and labels supplemental geography and coordinates as values not used for region assignment. Existing unknown-time and bed-capacity caveats remain visible.

## Changed Files

- `scripts/build-qcc-institutions.py`: projects all 11 source values without normalization or redaction; rejects booleans, compound values, and non-finite numbers.
- `lib/institution-reference-types.ts`: exports `REFERENCE_SOURCE_FIELD_NAMES` and requires `sourceFields` on detail records.
- `lib/institution-reference-search.ts`: runtime chunk validation requires exactly the 11 approved keys and primitive string/finite-number/null values.
- `components/InstitutionReferenceDetailView.tsx`: renders all raw columns; clarifies raw address visibility, coordinate/geography caveats, grouping source, and unknown bed-capacity time.
- `scripts/check-qcc-institutions-output.ts`: enforces the exact raw field key set and permitted value types in every detail row, alongside existing index/chunk row coverage checks.
- `tests/test_qcc_institutions.py`: covers all-column survival, conflicting supplemental geography, coordinates, contact-bearing full address, invalid code, exact primitive/null/empty/hyphen values, normalized separation, and invalid compound/non-finite values.
- `tests/institution-reference-static.test.ts`: checks all 11 labels and values, geography/coordinate caveats, unknown-time/bed caveats, and corrected conflict wording.
- `tests/institution-reference-search.test.ts`: runtime fixture and validation coverage for exact raw keys and raw values.
- `tests/qcc-institution-output.test.ts`: checker coverage for exact keys, primitive raw values, missing/extra keys, and compound values.

## TDD Evidence

RED: `python -m unittest tests.test_qcc_institutions` failed before implementation with two expected `KeyError: 'sourceFields'` failures in the raw projection assertions (10 tests run, 2 errors).

RED: `npx tsx --test tests/institution-reference-static.test.ts` failed before UI wording correction because the existing detail caveat said conflicting coordinates/derived geography were “not published,” contradicting the new display requirement (5 passed, 1 failed).

GREEN: `python -m unittest tests.test_qcc_institutions` (11 tests, OK).

GREEN: `npx tsx --test tests/institution-reference-static.test.ts tests/qcc-institution-output.test.ts` (10 tests, 10 passed).

GREEN: `npx tsx --test tests/institution-reference-static.test.ts tests/institution-reference-links.test.ts tests/institution-registry-links.test.ts tests/qcc-institution-output.test.ts` (18 tests, 18 passed).

GREEN: `npm.cmd run typecheck:directory` (exit 0). Use `npm.cmd` in this PowerShell environment; the `npm` system alias did not complete correctly.

`git diff --check` on the task files returned exit 0.

## Self-Review and Concerns

- Original empty strings, nulls, numeric values, `-`, invalid/placeholder credit code strings, and complete source addresses are retained verbatim in `sourceFields`. Contact-like strings remain excluded from normalized summary address and are shown only as requested in the raw source block.
- Raw source values are not passed through address redaction, trimming, code normalization, or geography assignment. JSON serialization preserves the finite numeric values and textual placeholders; unsupported booleans/objects/arrays and non-finite values fail projection.
- The original XLSX is not in this checkout's accessible `data/private` path, so the builder was verified with workbook fixtures rather than rebuilt against the locked production workbook. The checked-in generated public snapshot predates this schema change and must be regenerated from the authorized source before integrated runtime checks/build. It was not edited here because generated outputs were outside the task's allowed edit list.
- A broader search test run before snapshot regeneration had a failure from the stale generated detail chunks; this is an expected integration prerequisite, not evidence that the updated fixture/runtime contract fails. Search static assertions also include neighboring work already being integrated by the parent agent.
- The task explicitly requests the full source address, including any contact text, in raw detail fields; this creates a public exposure risk for contact values that normalized fields previously removed. The UI labels this as unverified raw source text and warns that it is not a usable contact method, but publication still follows the explicit task requirement.
- No files were staged or committed. The checkout has extensive pre-existing uncommitted changes.
