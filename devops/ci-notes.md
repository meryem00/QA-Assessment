# CI Notes

## Pipeline

The workflow is defined in `.github/workflows/ci.yml` and runs on every push and pull request, on an Ubuntu runner:

1. Check out the code (`actions/checkout@v5`).
2. Set up Node.js 20 (`actions/setup-node@v5`), the same version as the Dockerfile, with npm caching.
3. `npm ci`: installs exactly what `package-lock.json` specifies and fails if it is out of sync.
4. `npm run lint:check`: ESLint without `--fix`, so CI reports problems instead of silently changing code.
5. `npm run build`
6. `npm test`: Jest unit tests.

Each step that exits with a non-zero code fails the job, and the following steps are skipped. The pipeline is green on `meryem/qa-devops-assessment`.

## Problems found while setting up CI

I ran each pipeline command locally first, then in GitHub Actions.

| # | Symptom | Diagnosis | Fix |
|---|---|---|---|
| 1 | API would not start; `npm run build` failed with TS2352 at `users.service.ts:38` | The shipped code did not compile: an object was cast to `User` without `createdAt`/`updatedAt` | Cast via `unknown`. No behaviour change; the underlying logic is reported as BUG-003 |
| 2 | ~820 lint errors locally, almost all `Delete ␍` | Git on Windows (`core.autocrlf=true`) checks files out with CRLF line endings; Prettier expects LF. Would not occur on the Linux runner | `"endOfLine": "auto"` in `.prettierrc`. Team-wide fix: a `.gitattributes` with `* text=auto eol=lf` |
| 3 | Remaining real lint errors | Unused import, floating promise in `main.ts`, unsafe `any` member access, formatting | Fixed without behaviour change |
| 4 | `npm run lint` can never fail | It runs `eslint --fix`, which edits files instead of reporting | Added `lint:check` (no `--fix`) and used it in CI |
| 5 | `npm test`: "Playwright Test needs to be invoked via npx playwright test" | Jest's `testRegex` matched every `*.spec.ts` in the repo, including `qa/` | `"roots": ["<rootDir>/src"]` in the Jest config; `--passWithNoTests`, because no unit tests exist yet |
| 6 | First CI run failed at Build: `Cannot find module '@playwright/test'`, although the build passed locally | The tsconfig has no `include`, so `nest build` compiled `qa/`. Locally the Playwright package was installed; on the clean runner it was not | Excluded `qa` in `tsconfig.build.json`; verified with a clean `dist/` |
| 7 | Warning: "Node.js 20 is deprecated" for the actions | The actions' own runtime, not the app's Node version | Upgraded `actions/checkout` and `actions/setup-node` to v5 |
| 8 | Full Docker stack: API started, but every endpoint returned 500 `relation "user" does not exist` | Migrations path pointed to `dist/migrations/`, but the build writes them to `dist/src/migrations/`. Hidden locally because I had run the migrations by hand | Corrected the path in `app.module.ts`; verified on a fresh database volume |

Problem 6 shows why CI matters: the build depended on something that only existed on my machine.

## Known gaps

- **No unit tests exist yet.** The unit-test step runs `jest --passWithNoTests`, so it is in place and will run tests automatically as soon as they are added. Writing them is the first next step.
- **The Playwright API tests are not in the pipeline yet**, because the workflow does not start PostgreSQL and the API.
- `ubuntu-latest` will move to a new Ubuntu version. Pinning the runner (e.g. `ubuntu-24.04`) makes builds reproducible, and upgrades become a deliberate change.

## Next CI improvements

1. Add a second job that starts a PostgreSQL service container, runs migrations, starts the API and runs the Playwright suite; upload the HTML report as an artifact.
2. Build the Docker image in CI, after the Dockerfile issues in the runbook are fixed.
3. Run k6 as a separate, manually triggered or nightly job; load tests are too slow for every push.
4. Protect `main`: require a green pipeline before merging.

## Extending towards continuous deployment

1. **On merge to `main`:** build the Docker image, tag it with the commit SHA and push it to a registry (e.g. GitHub Container Registry or Azure Container Registry).
2. **Deploy to staging** automatically, run database migrations, then run the Playwright suite against staging as a smoke/regression gate.
3. **Production** uses a GitHub Environment with required manual approval and deploys the *same* image tag that passed staging.
4. **After deploying:** a smoke test (`/health` + one read call). If it fails, redeploy the previous tag.
5. Credentials are stored as GitHub Actions secrets, never in the repository or the image.

