# Test Strategy — Ella API

## Scope

The Ella API is an e-commerce backend with three modules: Users, Products and Transactions. In scope: functional behaviour of all endpoints, input validation, data integrity across modules (a purchase must change the product's stock), error handling, and performance of the purchase flow. Out of scope for now: authentication (the API has none), UI, and security testing beyond what showed up in error responses.

## Risk-based priorities

Testing effort follows business risk. The highest risk is anything that touches money or inventory.

| Area | Main risk | Priority |
|---|---|---|
| Transactions / stock | Wrong inventory, overselling, concurrency issues (BUG-001, BUG-012) | Highest |
| Pricing | Wrong or negative prices cause revenue loss (BUG-002, BUG-004) | High |
| User data | Duplicates reported as success, invalid emails (BUG-003, BUG-009) | High |
| Error handling | 500s for client errors, leaked database messages (BUG-005, BUG-006) | Medium |

## Test levels

- **Unit (Jest):** service logic with mocked repositories, e.g. `TransactionsService.create()` reduces stock and rejects a quantity above the stock; `ProductsService.update()` maps every field correctly. Fast and runs on every push. No unit tests exist today. This is the first gap I would close, because BUG-001 and BUG-002 would have been caught at this level.
- **API / integration (Playwright):** each endpoint against a real API and PostgreSQL database: status codes, validation, response contract, and the persisted state, checked with a follow-up GET. A 201 alone does not prove the data was saved correctly.
- **End-to-end (Playwright):** the critical business flow across modules: create user → create product → purchase → verify the transaction and the reduced stock.
- **Performance (k6):** load on write-heavy endpoints, checking data integrity as well as latency and error rate.
- **Exploratory:** time-boxed charters for each new feature, to find what scripted tests miss. This is how most bugs in this assessment were found.

## What I did in this assessment

1. **Exploratory testing** with five charters: user validation and duplicates, product boundary values, transaction side effects, invalid path IDs, and state consistency across endpoints. Then a code review of services and DTOs for root causes. Result: 12 bugs in [BUGS.md](automation-framework/BUGS.md).
2. **Automation:** a Playwright API framework with an E2E purchase-flow test and regression tests for confirmed bugs. Tests for known bugs use `test.fail()` with the bug ID. Each one was checked to fail for the reason in its bug report, because `test.fail()` accepts *any* failure. Result: 1 passing, 5 expected failures.
3. **Performance:** a k6 test on `POST /transactions` with 20 virtual users. Latency thresholds passed (p95 76 ms, 0% errors), but the stock check showed that ~66% of stock updates were lost under concurrency (BUG-012). See [performance-results.md](automation-framework/performance-results.md).

## Tooling choices

- **Playwright Test** for API tests: TypeScript like the codebase, fixtures, parallel runs, an HTML report, and no browser needed. The same tool can cover UI tests later.
- **k6** for performance: tests are code (versioned and reviewable), and thresholds return a non-zero exit code, so they can gate a pipeline.
- **Jest** for unit tests: already configured in the NestJS project.
- **GitHub Actions** for CI: the repository is on GitHub and the pipeline is versioned with the code.

## Test data

- Every test creates its own data through builders that generate unique names and emails, so tests are independent and can run in parallel or repeatedly.
- No hard-coded IDs: tests use the IDs of the entities they created.
- Load tests create their own user and product in `setup()`.

## Environment strategy

| Environment | Purpose | Data | Tests |
|---|---|---|---|
| Local | Development, exploratory testing | Disposable Docker PostgreSQL | Any, on demand |
| CI | Every push and pull request | Fresh PostgreSQL service container per run | Lint, build, unit, Playwright API |
| Staging | Production-like release check | Seeded, anonymised data | Smoke, full regression, k6 |
| Production | Live | Real data | Smoke tests only (health + read-only calls) |

The same Docker image is promoted from staging to production; only the environment variables change. Details: [environment-notes.md](../devops/environment-notes.md).

## Deployment risk mitigation

- **Quality gates:** merging is blocked unless CI is green.
- **Build once, deploy many:** an image tagged with the commit SHA is deployed to staging, then the same image to production.
- **Migrations:** reviewed in the pull request, backward-compatible, tested on staging first, with a database backup before running in production.
- **Post-deploy smoke test:** a health check plus one read call. If it fails, roll back to the previous image tag.
- **Monitoring:** watch the 5xx rate and latency after each release.

## Entry and exit criteria

- **Entry:** the build is green, the environment is up and migrations are applied.
- **Exit:** no open Critical/High bugs without an agreed decision, all tests passing except documented known failures, and performance thresholds met.

