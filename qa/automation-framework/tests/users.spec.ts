
import { test, expect } from '../src/fixtures';
import { buildUser } from '../src/test-data';

test('valid user can be created', async ({ api }) => {
  const user = buildUser();

  const res = await api.createUser(user);

  expect(res.status()).toBe(201);

  const body = await res.json();
  expect(body.data.id).toBeGreaterThan(0);
  expect(body.data.email).toBe(user.email);
});

test('duplicate email is rejected', async ({ api }) => {
  test.fail(true, 'BUG-003: Duplicate emails should return 409');

  const user = buildUser();

  const firstRes = await api.createUser(user);
  expect(firstRes.status()).toBe(201);

  const secondRes = await api.createUser(user);
  expect(secondRes.status()).toBe(409);
});

test('invalid email is rejected', async ({ api }) => {
  test.fail(true, 'BUG-009: Invalid email should return 400');

  const user = buildUser({ email: 'invalid-email' });

  const res = await api.createUser(user);

  expect(res.status()).toBe(400);
});
