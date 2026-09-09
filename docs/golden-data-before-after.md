# Golden data — before / after dummy cleanup

**Date:** 2026-09-09  
**Cleanup performed:** deleted unused `seedWorkforce.js`; emptied EmployeeDesk demo rows; zeroed role KPI demo figures.  
**This findings-resolution pass:** no further dummy cleanup on catalogue/media. Test fixtures only (`PF-W-SAR-COT-0001`, `PF-W-LEH-BRI-0002`, `PF-K-GRL-DRS-0001`) — paths already on disk.
**Not touched:** Product IDs, Media IDs, taxonomy, `public/images/**`, workflow states, auth.

Golden data here means **canonical catalogue identity and media** that must survive any dummy-data pass. Workforce demo people were never golden.

---

## Product IDs (128) — UNCHANGED

Folders under `frontend/public/images/products/**` whose names are canonical Product IDs. Kids uses the same Product identity scheme (`PF-K-*`), not a parallel system.

### Bridal (64)

```
PF-BR-BNG-0001
PF-BR-BNG-0002
PF-BR-BNG-0003
PF-BR-BNG-BRI-0001
PF-BR-BNG-BRI-0002
PF-BR-BNG-BRI-0003
PF-BR-BNG-GOL-0001
PF-BR-BNG-GOL-0002
PF-BR-BNG-GOL-0003
PF-BR-BNG-KAD-0001
PF-BR-BNG-KAD-0002
PF-BR-BNG-KAD-0003
PF-BR-JWL-0001
PF-BR-JWL-0002
PF-BR-JWL-0003
PF-BR-JWL-AEAR-0001
PF-BR-JWL-AEAR-0002
PF-BR-JWL-AEAR-0003
PF-BR-JWL-AEAR-0004
PF-BR-JWL-ANK-0001
PF-BR-JWL-ANK-0002
PF-BR-JWL-ANK-0003
PF-BR-JWL-ANK-0004
PF-BR-JWL-ANK-0005
PF-BR-JWL-BRI-0001
PF-BR-JWL-BRI-0002
PF-BR-JWL-EAR-0001
PF-BR-JWL-EAR-0002
PF-BR-JWL-EAR-0003
PF-BR-JWL-EAR-0004
PF-BR-JWL-EAR-0005
PF-BR-JWL-EAR-0006
PF-BR-JWL-EAR-0007
PF-BR-JWL-EAR-0008
PF-BR-JWL-EAR-0009
PF-BR-JWL-EAR-0010
PF-BR-JWL-MTK-0001
PF-BR-JWL-MTK-0002
PF-BR-JWL-NCK-0001
PF-BR-JWL-NCK-0002
PF-BR-JWL-NCK-0003
PF-BR-JWL-RNG-0001
PF-BR-JWL-RNG-0002
PF-BR-JWL-RNG-0003
PF-BR-JWL-RNG-0004
PF-BR-JWL-SET-0001
PF-BR-JWL-SET-0002
PF-BR-LEH-0001
PF-BR-LEH-0002
PF-BR-MEH-0001
PF-BR-MEH-0002
PF-BR-MEH-0003
PF-BR-REC-0001
PF-BR-REC-0002
PF-BR-REC-0003
PF-BR-REC-0004
PF-BR-SAR-0001
PF-BR-SAR-0002
PF-BR-SAR-0003
PF-BR-SAR-0004
PF-BR-SNG-0001
PF-BR-SNG-0002
PF-BR-TRS-0001
PF-BR-TRS-0002
```

### Women (38)

```
PF-W-ESS-DUP-0001 … PF-W-ESS-DUP-0006
PF-W-ESS-INW-0001 … PF-W-ESS-INW-0007
PF-W-ESS-KS-0001 … PF-W-ESS-KS-0004
PF-W-LEH-BRI-0002
PF-W-LEH-DES-0001 … PF-W-LEH-DES-0003
PF-W-LEH-PTY-0001 … PF-W-LEH-PTY-0003
PF-W-SAR-BAN-0001 … PF-W-SAR-BAN-0003
PF-W-SAR-COT-0001 … PF-W-SAR-COT-0005
PF-W-SAR-SIL-0001 … PF-W-SAR-SIL-0006
```

Full women list: `PF-W-ESS-DUP-0001`, `PF-W-ESS-DUP-0002`, `PF-W-ESS-DUP-0003`, `PF-W-ESS-DUP-0004`, `PF-W-ESS-DUP-0005`, `PF-W-ESS-DUP-0006`, `PF-W-ESS-INW-0001`, `PF-W-ESS-INW-0002`, `PF-W-ESS-INW-0003`, `PF-W-ESS-INW-0004`, `PF-W-ESS-INW-0005`, `PF-W-ESS-INW-0006`, `PF-W-ESS-INW-0007`, `PF-W-ESS-KS-0001`, `PF-W-ESS-KS-0002`, `PF-W-ESS-KS-0003`, `PF-W-ESS-KS-0004`, `PF-W-LEH-BRI-0002`, `PF-W-LEH-DES-0001`, `PF-W-LEH-DES-0002`, `PF-W-LEH-DES-0003`, `PF-W-LEH-PTY-0001`, `PF-W-LEH-PTY-0002`, `PF-W-LEH-PTY-0003`, `PF-W-SAR-BAN-0001`, `PF-W-SAR-BAN-0002`, `PF-W-SAR-BAN-0003`, `PF-W-SAR-COT-0001`, `PF-W-SAR-COT-0002`, `PF-W-SAR-COT-0003`, `PF-W-SAR-COT-0004`, `PF-W-SAR-COT-0005`, `PF-W-SAR-SIL-0001`, `PF-W-SAR-SIL-0002`, `PF-W-SAR-SIL-0003`, `PF-W-SAR-SIL-0004`, `PF-W-SAR-SIL-0005`, `PF-W-SAR-SIL-0006`.

### Men (16)

```
PF-M-ETH-KPJ-0001 … PF-M-ETH-KPJ-0008
PF-M-ETH-NJ-0001 … PF-M-ETH-NJ-0003
PF-M-GRM-GEN-0001 … PF-M-GRM-GEN-0005
```

Full men list: `PF-M-ETH-KPJ-0001`, `PF-M-ETH-KPJ-0002`, `PF-M-ETH-KPJ-0003`, `PF-M-ETH-KPJ-0004`, `PF-M-ETH-KPJ-0005`, `PF-M-ETH-KPJ-0006`, `PF-M-ETH-KPJ-0007`, `PF-M-ETH-KPJ-0008`, `PF-M-ETH-NJ-0001`, `PF-M-ETH-NJ-0002`, `PF-M-ETH-NJ-0003`, `PF-M-GRM-GEN-0001`, `PF-M-GRM-GEN-0002`, `PF-M-GRM-GEN-0003`, `PF-M-GRM-GEN-0004`, `PF-M-GRM-GEN-0005`.

### Kids (10) — same Product ID system

```
PF-K-BYS-CS-0001
PF-K-BYS-CS-0002
PF-K-BYS-TSH-0001
PF-K-BYS-TSH-0002
PF-K-GRL-CS-0001
PF-K-GRL-CS-0002
PF-K-GRL-CS-0003
PF-K-GRL-DRS-0001
PF-K-GRL-DRS-0002
PF-K-GRL-DRS-0003
```

**Before count:** 128  
**After count:** 128  
**IDs changed:** 0  
**IDs deleted:** 0

---

## Media inventory — UNCHANGED

| Bucket | Before | After |
|---|---|---|
| Files under `frontend/public/images` | 238 | 238 |
| Hero (`hero/hero001.avif` … `hero005.avif`) | 5 | 5 |
| Collections (`collections/editorial`, `collections/fabrics`) | 42 files | 42 |
| Product media files | 191 | 191 |
| Kids media files | 10 | 10 |
| Product-id folders | 128 | 128 |

Marketing media is **not** product media. Hero/collection plates must not be registered as product-owned assets. Product media ownership remains `media.productId` / `ProductMedia` — never inferred from a folder name at runtime (folder names happen to match Product IDs for the static seed set).

---

## Taxonomy — UNCHANGED

Source: `frontend/src/data/catalog/taxonomy.js` + `frontend/src/config/productIdPrefixes.js`.

| Department | Category / family prefixes |
|---|---|
| women | sarees (BAN, COT, SIL), lehengas (BRI, DES, PTY), essentials (DUP, INW, KS) |
| bridal | celebrations (MEH, SNG, TRS), finishing-touches (BNG, JWL), the-bride (LEH, REC, SAR) |
| men | ethnic-wear (KPJ, NJ), groom (GEN) |
| kids | boys (CS, TSH), girls (CS, DRS) |

Kids is a **department** in the same taxonomy, not a validator-only side path.

---

## Workforce demo — removed (was never golden)

| Record type | Before | After |
|---|---|---|
| `seedWorkforce.js` demo admins/employees/attendance/leave/performance | Present, unused | **File deleted** |
| EmployeeDesk named styling customers | 3 rows | 0 rows |
| EmployeeDesk wedding collections | 3 rows | 0 rows |
| EmployeeDesk sales demo ₹ | ₹8,42,600 + 5 departments | 0 rows |
| Role dashboard invented KPIs | Fake rupees / counts | 0 or live empty counts |

No Product ID, Media ID, or taxonomy path was used as a workforce identifier. No migration of those IDs is required.

---

## Workflow / ownership — UNCHANGED

- Product statuses: `DRAFT` → `PENDING_REVIEW` → (approve) `APPROVED` → (separate command) `PUBLISHED` / `ARCHIVED`.
- **APPROVE ≠ PUBLISH.** Approval must not flip `published`.
- Product media ownership is register-level; a product cannot publish with ownership conflicts.
- No customer product-review **write** UI exists; `rating` / `reviewCount` are product fields.

---

## Verdict

Golden catalogue identity is byte-stable across this cleanup. The only data removed was unused or currently-rendered **workforce/ops demo**, never products or media.
