# Retired demo-architecture tests

The `npm test` suite originally validated the frontend's **local mock/seed
architecture** (static catalogue products, seeded media registers, demo
orders/customers/employees/admins, canonical `src/data/catalog/products.js`
fixtures, localStorage fallbacks).

Phase: mock data removal + backend integration (see `INTEGRATION_AUDIT.md`).

These tests were moved here because they assert behaviour that was
**deliberately removed** per the integration scope:

- static `src/data/catalog/products.js` seed and derived catalogue counts
- seeded media / product-media registers
- demo orders (`demoOrders.js`), demo customers, demo employees/admins
- localStorage product/taxonomy/offer registers
- silent local fallbacks

They are not run by `npm test` (`tests/*.test.js` glob) and are kept only
as a historical record of the pre-integration mock behaviour. New
backend-integration tests belong in `tests/integration/` and should exercise
the API layer (`src/services/api/*`) against FastAPI.

Do NOT restore the seed files to make these pass — the runtime architecture
is now: frontend → `src/services/api/*` → FastAPI → PostgreSQL.
