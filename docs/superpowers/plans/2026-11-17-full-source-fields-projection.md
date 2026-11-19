# Full Source Fields Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project and display every original column from the three authorized user-provided spreadsheets on the corresponding record detail pages.

**Architecture:** Keep compact normalized fields for search, grouping, and filters. Add a separate `sourceFields` object to detail chunks that preserves each source column's original name and value; detail views render that object without treating normalized or validated values as the source value. Province/city supplements, invalid registration codes, coordinates, and contact-like strings remain labeled as raw export data and do not become authoritative verification.

**Tech Stack:** Python 3, openpyxl, JSON static snapshots, Next.js 15, TypeScript, node:test, Python unittest, Playwright CLI.

## Global Constraints

- Preserve the source row order, source row number, stable record IDs, snapshot IDs, search/filter behavior, route contracts, and return links.
- Preserve every source column value, including empty values, numbers, invalid codes, and conflicting supplemental geography; do not silently normalize raw values.
- Keep raw source fields separate from normalized search and grouping fields.
- Continue describing QCC records as dated registration-subject candidates and the 41,955-row workbook as unverified source leads, never as a verified current institution census.
- Keep the 20-record listing pages compact; show the complete field set on detail pages.
- Do not deploy in this task.

---

### Task 1: Project all QCC export columns

**Files:**
- Modify: `scripts/build-qcc-public.py`
- Modify: `scripts/build-qcc-national.py`
- Modify: `lib/qcc-types.ts`
- Modify: `components/QccDetailView.tsx`
- Modify: `components/QccNationalDetailView.tsx`
- Test: `tests/test_qcc_public.py`
- Test: `tests/test_qcc_national.py`
- Test: `tests/qcc-search.test.ts`
- Modify: `scripts/check-public-output.ts`

**Interfaces:**
- Each detail record gains `sourceFields: Record<string, string | number | null>` keyed by the exact original XLSX column names.
- `sourceFields` contains all 37 columns: 企业名称、登记状态、法定代表人、注册资本、成立日期、统一社会信用代码、注册地址、注册地址邮编、所属省份、所属城市、所属区县、有效手机号、更多电话、邮箱、企业(机构)类型、纳税人识别号、注册号、组织机构代码、参保人数、参保人数所属年报、营业期限、国标行业门类、国标行业大类、国标行业中类、国标行业小类、企查查行业门类、企查查行业大类、企查查行业中类、企查查行业小类、企业规模、曾用名、英文名、官网网址、通信地址、通信地址邮编、企业简介、经营范围。
- Search indexes retain their existing normalized minimal fields; only detail chunks carry the full source object.

- [x] Add failing Python tests proving all 37 original headers and values survive both regional and national projection, including empty, numeric, phone, email, URL, postal-code, and industry fields.
- [x] Run `python -m unittest tests.test_qcc_public tests.test_qcc_national` and confirm the new full-field assertions fail before implementation.
- [x] Add `sourceFields` from the validated header tuple in both builders while keeping existing normalized fields and index payloads unchanged.
- [x] Extend the TypeScript detail record type and render every source field under a clearly labeled “企查查导出原始字段” section on both Guangdong and national detail pages.
- [x] Update public-output scanning to allow the newly authorized QCC contact fields only in `sourceFields`, while still rejecting fields outside the approved schema and unrelated local identifiers.
- [x] Run `python -m unittest tests.test_qcc_public tests.test_qcc_national`, `npm run typecheck:directory`, and the focused TypeScript QCC tests.

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

- [x] Add failing Python tests proving every original column survives projection, including conflicting supplemental geography, coordinates, an invalid credit code, and address values containing contact text.
- [x] Run `python -m unittest tests.test_qcc_institutions` and confirm the new raw-field assertions fail before implementation.
- [x] Preserve all 11 original values in `sourceFields`; keep division-code/region-derived grouping and validated credit-code behavior separate.
- [x] Render all 11 fields on the existing source-lead detail page, labeling coordinates and supplemental province/city/county as raw source values that were not used to assign the record's region.
- [x] Update the output checker to validate the full source-field key set and row coverage.
- [x] Run `python -m unittest tests.test_qcc_institutions`, `npm run typecheck:directory`, and focused institution-reference tests.

### Task 3: Rebuild, verify, and document the public snapshot

**Files:**
- Modify: `docs/spreadsheet-ingestion-status-2026-11-17.md`
- Verify: `public/data/qcc/`
- Verify: `public/data/qcc-national/`
- Verify: `public/data/qcc-institutions/`
- Verify: `out/`

- [x] Regenerate all three public snapshots from their SHA-256-locked source files.
- [x] Run `npm run verify:local-release` with `NEXT_PUBLIC_ELDERCARE_BASE_PATH=/eldercare`; confirm source hashes, row counts, region coverage, unit tests, type checks, static export, and output isolation scan.
- [x] Inspect one Guangdong QCC detail, one national QCC detail, and one institution-reference detail in a real browser; confirm every source column is visible, base-path assets load, and list/detail/back navigation works.
- [x] Update the intake record with complete field coverage and state clearly that source rows overlap and do not equal distinct verified institutions.
- [x] Review `git status` and the diff; do not commit or deploy.

