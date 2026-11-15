# Ella API — QA / DevOps Assessment Submission

## Approach

I started by setting up the API locally and treating every setup problem as a finding. I then explored the API with time-boxed charters in Swagger, always following state-changing requests with a GET to check what was actually saved, and read the service code to confirm root causes. From those findings I built a Playwright API framework around the critical purchase flow and the confirmed bugs, load-tested the purchase endpoint with k6 while also checking data integrity, and set up a CI pipeline, fixing each problem that blocked a clean build.

## Results at a glance

- **12 bugs** documented: 2 Critical, 3 High, 5 Medium, 2 Low. The most important: purchases *increase* stock instead of reducing it (BUG-001), and under concurrent load ~66% of stock updates are silently lost (BUG-012).
- **Playwright:** 6 API tests: 1 passing, 5 expected failures. Each expected failure is linked to a bug ID and was checked to fail for that bug's reason.
- **k6:** 1,747 purchases at 20 virtual users, 0% errors, p95 76 ms. The latency thresholds passed, but the stock-integrity check failed (BUG-012).
- **CI:** GitHub Actions pipeline (install → lint → build → unit tests), green on `meryem/qa-devops-assessment`.

## Repository structure

```
qa/
  test-strategy.md
  automation-framework/
    BUGS.md                      # 12 bug reports + summary table
    code-review-guidelines.md
    performance-test.js          # k6 script
    performance-results.md       # scenario, baseline, analysis
    playwright.config.ts
    src/                         # API client, fixtures, test-data builders
    tests/                       # users, products, e2e purchase flow
devops/
  ci-notes.md
  environment-notes.md
  deployment-runbook.md
.github/workflows/ci.yml
```

## What I did

### QA
- Exploratory testing of Users, Products and Transactions with charters (validation, duplicates, boundaries, invalid IDs, side effects, state consistency).
- 12 bug reports with steps, expected/actual results, evidence, root cause (file and line) and suggested fix: [BUGS.md](qa/automation-framework/BUGS.md).
- Playwright API framework in four layers: config (base URL from an environment variable), API client, test-data builders (unique data on every run) and a custom fixture.
- End-to-end test of the critical flow: create user → create product → purchase → verify the stock is reduced.
- Regression tests for confirmed bugs, marked with `test.fail()` and a bug ID, so the suite stays green while the bugs exist and turns red when one is fixed.
- k6 load test on `POST /transactions` that also checks the final stock: [performance-results.md](qa/automation-framework/performance-results.md).
- Test strategy and code review guidelines.

### DevOps
- GitHub Actions workflow (`.github/workflows/ci.yml`): install → lint → build → unit tests. Any failing step fails the run.
- Fixed the problems that blocked a clean build and CI (details in [ci-notes.md](devops/ci-notes.md)):
  - A TypeScript compile error in `users.service.ts:38` that stopped the API from starting (type cast only, no behaviour change).
  - Lint errors in the shipped code (unused import, floating promise, unsafe `any` access, formatting). All fixes are behaviour-neutral, so every reported bug is still reproducible.
  - Added a `lint:check` script for CI, because `npm run lint` uses `--fix` and can never fail.
  - Jest was picking up the Playwright specs; limited Jest to `src/`.
  - `nest build` was compiling the `qa/` folder, which broke the first CI run; excluded it in `tsconfig.build.json`.
  - Committed the initial TypeORM migration so other environments can create the schema.
- Fixed the migrations path in `app.module.ts`, which left the database without tables in the Docker setup.
- Brought the full stack up with Docker Compose on a clean database, found and fixed the blocking migration issue, and documented the remaining Dockerfile/Compose risks in [deployment-runbook.md](devops/deployment-runbook.md).
- Documented the configuration for development, testing and staging: [environment-notes.md](devops/environment-notes.md).

## How to run

### 1. API and database
```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d   # Docker Desktop must be running
npm ci
npm run migration:run
npm run start:dev
```
Swagger UI: http://localhost:4000/api

### 2. Playwright API tests
```bash
cd qa/automation-framework
npm ci
npm test            # expected: 6 passed (1 passing + 5 expected failures)
npm run report      # HTML report with bug annotations
```
`API_BASE_URL` sets the target API (default `http://localhost:4000`).

### 3. k6 load test
```bash
k6 run qa/automation-framework/performance-test.js
```
`BASE_URL` sets the target API (default `http://localhost:4000`). The test runs for about 2 minutes and prints the initial and final stock.

### 4. CI checks locally
```bash
npm run lint:check
npm run build
npm test
```

## Assumptions

- I followed the PDF brief for the QA/DevOps role. The repository README describes an intern track with partly different deliverables (Postman collection, manual test cases); I prioritised automated API and performance coverage instead.
- All testing was done locally (Windows 11, Node 20, PostgreSQL 16 in Docker). The performance numbers are a local baseline, not production capacity.
- Where business rules were not specified, I assumed reasonable ones: price must be greater than 0, quantity 0 means `OUT_OF_STOCK`, and a duplicate email should return 409 Conflict.
- I reported application bugs rather than fixing them. I only changed application code where needed to compile and pass lint, without changing behaviour.

## Limitations

- **No unit tests exist** in the repository. The CI unit-test step runs Jest with `--passWithNoTests`, so it is in place but currently runs nothing.
- **The Playwright suite is not yet in CI**, because the pipeline does not start PostgreSQL and the API.
- **The Dockerfile still copies `.env` into the image** and installs devDependencies in the runtime stage. I documented both, with fixes, in the runbook but did not change them, to keep the image build identical to what was provided.
- **No `/health` endpoint.** I described health checks and monitoring in the runbook instead.
- The k6 script logs the final stock but does not yet fail the run automatically when the stock is wrong.

## What I would do next

1. Add Jest unit tests for `TransactionsService` and `ProductsService` (BUG-001 and BUG-002 would be caught there).
2. Run the Playwright suite in CI against a PostgreSQL service container and publish the HTML report as an artifact.
3. Fix the Dockerfile (no `.env` in the image, `npm ci --omit=dev`) then add an image build to CI.
4. Add a `/health` endpoint and a container health check.
5. Make the k6 test assert the final stock, and add a stress test to find the breaking point.
6. Add a deployment stage: versioned images, staging first, manual approval for production.
