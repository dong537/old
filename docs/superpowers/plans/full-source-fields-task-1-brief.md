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

- [ ] Add failing Python tests proving all 37 original headers and values survive both regional and national projection, including empty, numeric, phone, email, URL, postal-code, and industry fields.
- [ ] Run `python -m unittest tests.test_qcc_public tests.test_qcc_national` and confirm the new full-field assertions fail before implementation.
- [ ] Add `sourceFields` from the validated header tuple in both builders while keeping existing normalized fields and index payloads unchanged.
- [ ] Extend the TypeScript detail record type and render every source field under a clearly labeled “企查查导出原始字段” section on both Guangdong and national detail pages.
- [ ] Update public-output scanning to allow the newly authorized QCC contact fields only in `sourceFields`, while still rejecting fields outside the approved schema and unrelated local identifiers.
- [ ] Run `python -m unittest tests.test_qcc_public tests.test_qcc_national`, `npm run typecheck:directory`, and the focused TypeScript QCC tests.

