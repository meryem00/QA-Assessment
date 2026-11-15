# Environment Notes

## Prerequisites

- Node.js 20 (also used in the Dockerfile and CI)
- Docker Desktop, **running** (an easy-to-miss step: if it is not started, `docker` commands fail with a "dockerDesktopLinuxEngine" pipe error)
- k6 for the performance test
- Playwright dependencies, installed separately in `qa/automation-framework` with `npm ci`

## Variables

The application, the TypeORM CLI (`data-source.ts`) and Docker Compose all read the same variables, starting from `.env.example`:

| Variable | Purpose | Default in `.env.example` |
|---|---|---|
| `PORT` | Port the API listens on | `4000` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USERNAME` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | `postgres` |
| `DB_DATABASE` | Database name | `ella` |

The test tools have their own variables:

| Variable | Used by | Default |
|---|---|---|
| `API_BASE_URL` | Playwright | `http://localhost:4000` |
| `BASE_URL` | k6 | `http://localhost:4000` |

`.env` is gitignored and must never be committed. The values in `.env.example` are local defaults only.

## What changes between environments

| | Development | Testing (CI) | Staging |
|---|---|---|---|
| Purpose | Coding, exploratory testing | Automated checks on every push | Production-like release check |
| Where the API runs | Host (`npm run start:dev`) | CI runner | Container from the versioned image |
| Database | Docker (`docker-compose.dev.yml`) | PostgreSQL service container | Managed PostgreSQL (e.g. Azure Database for PostgreSQL) |
| `DB_HOST` | `localhost` | `localhost` (service container) | Managed DB hostname |
| `DB_PASSWORD` | `postgres` (local only) | Throwaway value in the workflow | From the secret manager |
| `DB_DATABASE` | `ella` | `ella_test`, recreated every run | `ella_staging` |
| Data | Own test data | Created by tests, disposable | Seeded, anonymised |
| Where values live | `.env` (gitignored) | Workflow `env:` / GitHub secrets | Platform config + secret manager |
| `API_BASE_URL` / `BASE_URL` | `http://localhost:4000` | `http://localhost:4000` | Staging URL |

What stays the same everywhere: the variable names, the Docker image (in staging and beyond), and `synchronize: false`. The schema is only changed through migrations.

## Full Docker Compose setup

In `docker-compose.yml`, the API container reaches the database through the Compose service name, so `DB_HOST` is overridden to `db`. `localhost` inside a container means the container itself, not the host. The API waits for the database's `pg_isready` health check before starting.

## Recommendations

- Add a `NODE_ENV` variable (the app does not read one today) and a `LOG_LEVEL` (debug locally, info in staging and production).
- Validate required variables at startup (NestJS `ConfigModule` supports a validation schema), so a missing `DB_HOST` fails immediately with a clear message instead of a connection-retry loop.
- Never reuse the example password outside a local, disposable setup, and don't publish the database port outside local development.
- Remove `COPY .env ./` from the Dockerfile: configuration should be passed in at runtime, not baked into the image (see the runbook).
