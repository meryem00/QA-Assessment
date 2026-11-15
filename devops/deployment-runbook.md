# Deployment Runbook — Ella API

| | |
|---|---|
| **Service** | Ella API (NestJS) + PostgreSQL 16 |
| **Port** | 4000 (API), 5432 (database) |
| **Status** | Full stack brought up with `docker compose up -d --build` on a clean database. One blocking issue (migrations never ran) was found and fixed; the other issues below come from reviewing the files. |

## 1. Build and run

### Full stack (API + database in Docker)
```bash
cp .env.example .env          # then review the values
docker compose up -d --build
docker compose ps             # db should be "healthy", api "running"
docker compose logs -f api    # look for "Nest application successfully started"
```
Check: http://localhost:4000/api (Swagger) loads, and `GET /users` returns 200.

### Development (database in Docker, API on the host)
```bash
docker compose -f docker-compose.dev.yml up -d
npm ci
npm run migration:run
npm run start:dev
```

### Stop
```bash
docker compose down           # keeps the database volume
```
Do **not** use `docker compose down -v` unless you intend to delete all data.

## 2. Deploy (target process)

1. CI builds the image and tags it with the commit SHA, e.g. `ella-api:3d43c24`, then pushes it to a registry.
2. Take a database backup if the release contains a migration.
3. Deploy the tag to staging → migrations run → smoke test (health + `GET /products`) → Playwright regression.
4. After approval, deploy **the same tag** to production → smoke test.
5. Watch logs, 5xx rate and latency for 15–30 minutes.

## 3. Rollback

**Current setup (local Compose, no registry):**
1. Find the last known-good commit: `git log --oneline`.
2. `git checkout <commit>` in a clean working copy.
3. `docker compose up -d --build`, then check the logs and Swagger.

**Target setup (versioned images):** redeploy the previous known-good image tag; nothing is rebuilt from source. Rolling back code does **not** roll back a migration. If the release changed the schema, check that the migration is backward compatible first; otherwise restore the pre-deploy backup or run `npm run migration:revert`.

## 4. Health checks and monitoring

There is no `/health` endpoint yet. Until there is, a successful `GET /api` (Swagger) shows the process is up, but not that the database is reachable.

What I would add:
- **`GET /health`** using `@nestjs/terminus`, returning 200 only when the database responds (`TypeOrmHealthIndicator`). Use it for the Compose `healthcheck`, the load balancer and post-deploy smoke tests.
- **Logs:** structured JSON logs (e.g. `nestjs-pino`) with a request ID, shipped to a central place (Azure Log Analytics, Loki or ELK). Day to day: `docker compose logs -f api`.
- **Metrics and alerts:** request rate, 5xx rate, p95 latency, container CPU/memory and restart count, database connections. Alert on a 5xx rate above 1% or a p95 above 500 ms (the same thresholds as the k6 test).

## 5. Common failures and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified` | Docker Desktop is not running | Start Docker Desktop, wait for "Engine running", check with `docker ps` |
| Browser shows `ERR_CONNECTION_REFUSED` on :4000 | The API never started, usually a compile error or a failed DB connection | Read the API terminal/logs first, not the browser. `start:dev` and `nest build` stop at TypeScript errors |
| `Unable to connect to the database. Retrying...` | DB container down or wrong `DB_HOST` | `docker compose ps`; on the host use `DB_HOST=localhost`, inside Compose `db` |
| Port 4000 or 5432 already in use | A local API (`npm run start:dev`) or another Postgres is running | Stop it, or change the published port |
| `relation "user" does not exist` on any endpoint | Migrations never ran inside Docker (see below). Observed and fixed | Fixed the migrations path in `app.module.ts`; as a workaround, run `npm run migration:run` |
| Docker build fails at `COPY .env ./` | `.env` is gitignored, so it is missing in a clean checkout | Create `.env`; long term, remove that line |
| `k6` / other tool "not recognized" after installing | Install folder is not on `PATH` in the current terminal | Restart VS Code/terminal, or call it by full path |

### Migrations never run inside Docker (observed and fixed)

**How I tested:** I stopped the dev database (`docker compose -f docker-compose.dev.yml down`) and started the full stack under a separate project name, so it got a new, empty volume:

```bash
docker compose -p ella-clean up -d --build
```

Using the existing dev volume would have hidden the problem, because I had already created the tables there by hand with `npm run migration:run`.

**Symptom:** the API started, but `GET /users` returned 500:

```json
{
  "statusCode": 500,
  "message": "Error retrieving users",
  "error": "relation \"user\" does not exist"
}
```

This response also shows BUG-006: the raw database error message is returned to the client.

**Diagnosis:** `app.module.ts` ran migrations from `dist/migrations/*.js`, but `nest build` writes them to `dist/src/migrations/`. The build root is the repository root because `data-source.ts` sits outside `src/`. So `migrationsRun: true` found no migrations and the tables were never created.

**Fix:** changed the path in `app.module.ts` to `dist/src/migrations/*.js` and rebuilt with `docker compose -p ella-clean up -d --build`. `GET /users` then returned 200. A more robust alternative is to run migrations as an explicit release step before the API starts.

## 6. Issues found by reviewing the Docker files

| File | Issue | Risk | Fix |
|---|---|---|---|
| Dockerfile | `COPY .env ./` | Build fails on a clean checkout; secrets are baked into the image | Remove it; Compose already passes `env_file: .env` at runtime |
| Dockerfile | Runtime stage runs `npm install` | Installs devDependencies (Nest CLI, Jest, Prisma…): larger image, bigger attack surface | `npm ci --omit=dev`, after moving `typeorm` from devDependencies to dependencies (it is needed at runtime) |
| Dockerfile | `npm install --legacy-peer-deps` plus an extra `npm install typeorm` | Ignores the lockfile; builds are not reproducible | `npm ci` |
| .dockerignore | Does not exclude `.env`, `.git`, `qa/` | Secrets and test code are sent into the build context | Add them |
| docker-compose.dev.yml | `version: '3.9'` | Obsolete; Compose prints a warning | Remove the line |
| Both Compose files | Same `container_name: shop-db` | The two setups conflict if both are used | Remove `container_name` or use different names |
| docker-compose.yml | `command: "node dist/src/main.js"` duplicates the Dockerfile `CMD` | Two places to keep in sync | Remove it from Compose |
| docker-compose.yml | No health check for the API | Compose cannot tell whether the API is healthy | Add `/health` and a `healthcheck` |
| Both Compose files | Database port 5432 published, default password | Fine locally; a risk anywhere else | Don't publish the port outside local; use secrets |

## 7. Cloud deployment plan (Azure, beginner level)

1. **Registry:** CI pushes the image, tagged with the commit SHA, to **Azure Container Registry (ACR)**. GitHub Actions logs in to Azure with OpenID Connect (`azure/login`), so no long-lived passwords are stored in GitHub.
2. **Database:** **Azure Database for PostgreSQL – Flexible Server**, on a private network (VNet integration), with automated backups and point-in-time restore.
3. **Secrets:** DB credentials stored in **Azure Key Vault**. The app reads them through a **managed identity** and receives them as environment variables, never baked into the image.
4. **Run the container:** **Azure Container Apps** (no servers or Kubernetes to manage). It pulls the image from ACR, provides HTTPS ingress, runs at least 2 replicas, and uses `/health` as its liveness/readiness probe.
5. **Logs and alarms:** container logs go to a **Log Analytics workspace**. **Azure Monitor** alerts fire on 5xx rate and latency; **Application Insights** can add request tracing.
6. **Deploy and rollback:** each deployment creates a new **revision** in Container Apps. Traffic moves to the new revision only after its health probe passes. Rollback = send 100% of traffic back to the previous revision (the image tag stays in ACR, nothing is rebuilt).

