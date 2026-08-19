# CMS D-SNP look-alike assessment

CMS’s Contract/Plan/State/County (CPSC) enrollment file reports total enrollment only. It must not be used to infer dual-eligible enrollment or to label a plan a D-SNP look-alike.

The authoritative source is CMS’s February Monthly Membership Report (MMR), representing January enrollment, together with CMS’s annual look-alike determination distributed through HPMS. These plan-level dual-eligibility fields are not in the public CPSC file. The importer therefore requires the CMS-issued MMR/look-alike extract for the applicable contract year and fails explicitly when it is not supplied.

Under 42 CFR 422.514(d), as described in the [CMS D-SNP Look-Alike Transitions memorandum](https://www.cms.gov/files/document/cy25dsnplookaliketransitionmemo040524g.pdf), a look-alike is a **non-SNP** MA plan with **at least 70.00%** of January enrollees entitled to Medicaid. A plan active for less than one year is excepted when it has **200 or fewer** enrollees at determination. The prior 80% threshold is obsolete for this assessment.

## Import format

Run:

```bash
CMS_LOOK_ALIKE_CSV_PATH=/path/to/cms-look-alike.csv \
CMS_LOOK_ALIKE_REPORT_PERIOD=2026-01 \
pnpm --filter @workspace/scripts run import:cms-2026-look-alikes
```

The input must have contract and plan identifiers and either a CMS dual-eligible percentage or both dual-eligible and total January enrollment. It must also identify whether the plan has been active for less than one year or provide CMS’s final look-alike determination. Because the ≤200 exception uses enrollment at the time of determination—not the January denominator—a threshold-matching new plan always requires CMS’s final determination. Accepted header variants are documented in the importer. Plan IDs are normalized for matching, while stored plan IDs retain their CMS display padding.

## Suppression and missing values

- `*` and `Suppressed` are recorded as `suppressed`, never zero.
- Blank, `N/A`, and `NA` values are recorded as `unknown`. Unexpected non-numeric values fail the import.
- If CMS suppresses either value needed to compute a percentage, the importer records `suppressed`, clears the percentage/count, and sets `is_look_alike` to false.
- A plan absent from the CMS extract remains `unknown`; it is not a negative determination.
- Only a known percentage on a `regular` plan can set `is_look_alike`; exactly `70.00%` qualifies unless the small/new-plan exception applies.
- Percentages are rounded to six decimal places before both classification and persistence, so the stored/displayed value and the flag always use the same threshold comparison.
- When both counts and a reported percentage are present, the counts determine the stored percentage. The reported value must agree within half a unit of its displayed decimal precision, and the two values may never fall on opposite sides of the 70% threshold.
- The import requires `CMS_LOOK_ALIKE_REPORT_PERIOD=2026-01` and rejects all other periods before opening a database transaction.