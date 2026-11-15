# Code Review Guidelines for Automated Tests

These are the standards I would apply when reviewing test code from a junior QA engineer. Most of them come from issues I ran into during this assessment.

## What a good test does

- **Verifies behaviour, not just the status code.** A 201 does not prove the data was saved correctly. For state-changing calls, read the data back and assert on it (this is how BUG-001 and BUG-002 were found).
- **Creates its own data.** Use the test-data builders and override only the fields the test is about, e.g. `buildProduct({ price: -1 })`. No dependence on records that happen to exist in one database.
- **Is independent.** It passes on its own, in any order, in parallel, and when run twice.
- **Has one clear purpose.** The name states the expected behaviour: "rejects duplicate email with 409", not "test user".
- **Uses the framework layers.** Requests go through the API client and the `api` fixture, not raw `request.post('http://localhost:4000/...')` calls copied into every test.
- **Is readable as a test case.** Workflow tests use `test.step()` so the report reads like the manual steps.

## Patterns I would flag

- **Expected-failure tests that fail for the wrong reason.** `test.fail()` passes on *any* failure, including a typo or a 400 caused by a different bug. Always open the report and confirm the error matches the bug report. I made this mistake myself during this assessment: a test labelled BUG-002 was actually failing on BUG-011, because the request was rejected before it reached the price assertion.
- **Known-bug tests without a bug ID**, or with the assertion weakened or deleted so the test passes. A test that asserts the wrong value protects the bug.
- **Hard-coded IDs or data** (`/products/6`): the test only works on one database.
- **Fixed waits** (`sleep`, `waitForTimeout`) instead of waiting for a condition.
- **Hard-coded URLs or secrets** instead of `baseURL` and environment variables.
- **Comparing values without checking their type**, e.g. the API returns `price` as a string (BUG-008). Convert deliberately and document the mismatch; don't hide it.
- **Generated files committed** (`node_modules`, `playwright-report`, `test-results`). Check the `.gitignore` in every new package.

## CI-related checks

- The tests in the PR actually run in CI, and the CI step names describe what really runs.
- Lint runs in check mode (no `--fix`) in CI.
- Dependencies are installed with `npm ci` from a committed lockfile.

## How I give feedback

- Explain *why*, link to the guideline, and suggest a fix.
- Separate blocking issues from small suggestions (prefix "nit:").
- Point out what was done well, not only the problems.
- If the same issue appears many times, pair for 15 minutes instead of leaving 10 comments.

## Example: mock PR review

```ts
test('update product', async ({ request }) => {
  const res = await request.put('http://localhost:4000/products/6', { data: { price: 250 } });
  expect(res.status()).toBe(200);
});
```

1. **Blocking: hard-coded product ID 6.** This only works on one database. Create the product in the test with `buildProduct()` and use its ID.
2. **Blocking: hard-coded URL.** Use the `api` fixture so the test can run in CI and staging.
3. **Blocking: only the status is checked.** The real defect here (BUG-002) is that the price is saved as the quantity. GET the product and assert the price is 250.
4. **Partial body:** PUT requires the full object (BUG-011), so this test would fail with a 400, for a different reason than its name suggests.
5. **nit:** rename "update product" → "updating a product saves the new price".
6. 👍 Good choice of what to test: price is a business-critical field.

