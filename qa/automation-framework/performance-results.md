# Performance Test Results: POST /transactions

Script: [performance-test.js](performance-test.js) (k6)

## Scenario

- **Endpoint:** `POST /transactions`. It is the revenue-critical endpoint, writes to two tables, and reads → checks → writes the stock, so it is the most likely to break under concurrency.
- **Load profile:** ramp up to 20 virtual users over 30s, hold for 1 minute, ramp down over 30s. Each user buys 1 unit of the same product, then waits 1s.
- **Setup/teardown:** `setup()` creates one user and one product with 100,000 in stock; `teardown()` reads the final stock.
- **Thresholds:** error rate below 1%, p95 latency below 500 ms.

## Assumptions

- Local Windows laptop, a single API instance in watch/dev mode, PostgreSQL 16 in Docker on the same machine.
- The results are a **baseline** for comparing future runs, not production capacity.
- All users buy the same product on purpose, to create contention on one database row.

## Results

| Metric | Result | Threshold |
|---|---|---|
| Requests | 1,750 (1,747 purchases + setup/teardown) | — |
| Error rate | 0.00% | < 1% ✅ |
| Avg / median latency | 43.8 ms / 43.9 ms | — |
| p90 / p95 latency | 66.9 ms / 76.3 ms | p95 < 500 ms ✅ |
| Max latency | 144.8 ms | — |
| Throughput | ~14.5 requests/s | — |
| Checks passed | 100% (3,494 of 3,494) | — |
| **Stock: initial → final** | **100,000 → 100,592** | — |

## Analysis

- **Latency is healthy at this load** and both thresholds passed.
- **Throughput is limited by the script's 1s wait**, not by the server (20 users × ~1 request/s). This run does not measure maximum capacity.
- **The system failed even though the thresholds passed.** If the code were correct, the final stock would be 100,000 − 1,747 = 98,253. Even with BUG-001 (stock increases), it would be 100,000 + 1,747 = 101,747. The actual value, 100,592, matches neither: only 592 of 1,747 stock updates were kept (**≈66% lost**).
- **Cause:** a lost-update race condition. `create()` reads the product, calculates the new stock in application code and writes it back without a database transaction or lock, so concurrent requests overwrite each other. Reported as **BUG-012** (Critical). After BUG-001 is fixed, the same race would cause overselling.
- **Lesson:** speed metrics alone are misleading. A load test should also verify that the data is correct.

## Next steps

- Assert the final stock automatically (count successful purchases and compare), so the run fails on an integrity error.
- After BUG-001 and BUG-012 are fixed: a low-stock scenario (e.g. 10 in stock, 20 concurrent buyers) to prove no overselling.
- Stress test (no wait time, ramp up until errors appear) to find the breaking point, and a soak test for stability over time.
- Test `GET /products`: it returns every product with all its transactions and no pagination, so it will get slower as data grows.

