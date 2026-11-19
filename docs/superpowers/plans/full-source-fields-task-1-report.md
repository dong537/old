# Task 1 Report: Full QCC Source Fields

Date: 2026-11-17

## Status

Implementation is complete. Python projection tests, new raw-column rendering and loader tests, and directory typecheck pass. The broader focused TypeScript suite was run before generated public QCC chunks were rebuilt and had 3 expected failures because the checked-in chunks do not yet contain required `sourceFields`; root is coordinating output regeneration and shared scanner updates.

## Changed Files

- `scripts/build-qcc-public.py`
- `scripts/build-qcc-national.py`
- `lib/qcc-types.ts`
- `lib/qcc-search.ts`
- `lib/qcc-national-search.ts`
- `components/QccDetailView.tsx`
- `components/QccNationalDetailView.tsx`
- `tests/test_qcc_public.py`
- `tests/test_qcc_national.py`
- `tests/qcc-search.test.ts`
- `tests/qcc-national-search.test.ts`
- `tests/qcc-links.test.ts`

`QCC_SOURCE_FIELD_NAMES` provides the exact 37 reviewed headers and their order. Both builders copy those values without text normalization or redaction into detail-only `sourceFields`; unexpected objects, booleans and non-finite numbers are rejected. Existing normalized fields and index payloads keep their prior projection. Both detail loaders require exactly those source keys with null/string/finite-number values. Guangdong and national detail pages render all columns as plain text, in original column order, label null versus empty string, keep `-` as-is and break long values to fit narrow screens.

## RED/GREEN Evidence

- RED: `python -m unittest tests.test_qcc_public tests.test_qcc_national` reported missing `sourceFields` in both builders and accepted invalid raw values.
- RED: `npx tsx --test --test-name-pattern="both detail pages" tests/qcc-search.test.ts` failed because the original-fields section was absent.
- GREEN: `python -m unittest tests.test_qcc_public tests.test_qcc_national` passed, 12 tests.
- GREEN: `python -m pytest tests/test_qcc_public.py tests/test_qcc_national.py -q` passed, 22 tests.
- GREEN: `npx tsx --test --test-name-pattern="chunk loader|both detail pages" tests/qcc-search.test.ts tests/qcc-national-search.test.ts` passed, 3 focused tests.
- GREEN: `npm run typecheck:directory` passed.
- Integration check: `npx tsx --test tests/qcc-search.test.ts tests/qcc-national-search.test.ts tests/qcc-links.test.ts` passed 18/21; the 3 failures were caused by current frozen public QCC chunks lacking `sourceFields` (national loader and two Guangdong renders). Those generated artifacts are integration-owned and root is rebuilding them.

## Self-Review

- Original raw values, including contact, URL, postal and industry values, are intentionally retained per the explicit task requirement. They are visibly identified as source snapshot values and are never converted to active links.
- Search indexes do not receive `sourceFields`; existing normalized details and search semantics remain in place.
- The required type change also surfaced `tests/qcc-links.test.ts` fixture; it now constructs a complete 37-key source object.
- No scanner or other shared output checker was edited. No files were staged or committed.

## Concerns / Remaining Integration

- Regenerate Guangdong and national public QCC chunks from the reviewed workbooks, then rerun the three focused TS suites and shared public-output scan. Until regenerated, existing detail pages cannot satisfy the new required type/loader contract.
- Raw source fields can contain personal or commercial contact values. Their publication is deliberate and user-authorized in this task; downstream output checks must whitelist these fields only under `sourceFields` and continue checking unrelated identifiers.
