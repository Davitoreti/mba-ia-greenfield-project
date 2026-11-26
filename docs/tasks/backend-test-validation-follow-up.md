# Backend test validation follow-up

Detected during `/plan-test-specs phase-03-videos` on 2026-11-25 (America/Sao_Paulo). Separate from Phase 03 spec synchronization; no implementation fixes applied.

- Isolate all test entry points from the development database. `createTestDataSource` reads `DB_DATABASE`, while application configuration reads `DB_NAME`; both must explicitly target `streamtube_test` for test execution. The initial invocation lacked these overrides and executed destructive migration-test operations against the default `streamtube` database. It was stopped; preservation of earlier development data cannot be guaranteed. Subsequent runs explicitly set both variables to `streamtube_test`.
- Investigate recovery of the development database from an existing backup before making schema/data changes. Read-only inspection after the initial run found `account_tokens`, `auth_sessions`, `channels`, and `migrations` in its public schema. No recovery or further development-schema mutations were attempted.
- Fix the existing migration integration test's concurrent `DROP TABLE` operations: the isolated full run failed with deadlock and `relation channels already exists`. Result: 22 suites passed / 1 failed; 142 tests passed / 2 failed.
- Resolve existing lint failures: 150 errors and 40 warnings. `npm run lint` left no tracked source changes.
- `npx tsc --noEmit` passed.
- Existing E2E suite passed against `streamtube_test`: 3 suites / 52 tests.

The 8 Phase 03 specs contain 46 scenarios and cover all acceptance criteria of their 8 referenced SIs. They remain planning contracts, not executed Phase 03 test implementations.
