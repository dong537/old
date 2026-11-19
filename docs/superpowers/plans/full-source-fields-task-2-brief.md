### Task 2: Project all institution workbook columns

**Files:**
- Modify: `scripts/build-qcc-institutions.py`
- Modify: `lib/institution-reference-types.ts`
- Modify: `components/InstitutionReferenceDetailView.tsx`
- Test: `tests/test_qcc_institutions.py`
- Test: `tests/institution-reference-static.test.ts`
- Test: `scripts/check-qcc-institutions-output.ts`

**Interfaces:**
- Each detail record gains `sourceFields: Record<string, string | number | null>` keyed by the exact original XLSX column names.
- `sourceFields` contains all 11 columns: 统一社会信用代码、地址、行政区划代码、机构名称、地区、床位数、省份、城市、区县、经度、纬度。
- Existing `creditCode` and `codeStatus` remain normalized lookup fields; raw code text is available separately even when it is invalid, missing, or a placeholder.

- [ ] Add failing Python tests proving every original column survives projection, including conflicting supplemental geography, coordinates, an invalid credit code, and address values containing contact text.
- [ ] Run `python -m unittest tests.test_qcc_institutions` and confirm the new raw-field assertions fail before implementation.
- [ ] Preserve all 11 original values in `sourceFields`; keep division-code/region-derived grouping and validated credit-code behavior separate.
- [ ] Render all 11 fields on the existing source-lead detail page, labeling coordinates and supplemental province/city/county as raw source values that were not used to assign the record's region.
- [ ] Update the output checker to validate the full source-field key set and row coverage.
- [ ] Run `python -m unittest tests.test_qcc_institutions`, `npm run typecheck:directory`, and focused institution-reference tests.

