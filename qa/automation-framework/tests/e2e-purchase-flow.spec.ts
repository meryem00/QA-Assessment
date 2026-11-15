import { test, expect } from '../src/fixtures';
import { buildUser, buildProduct } from '../src/test-data';

test('customer can buy a product and stock is reduced', async ({ api }) => {
  test.info().annotations.push({ type: 'bug', description: 'BUG-001: stock increases instead of decreasing' });
  test.fail(true, 'Known bug BUG-001 — remove this line once fixed');

  // test.step makes the HTML report read like a test case
  const userId = await test.step('Create a user', async () => {
    const res = await api.createUser(buildUser());
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeGreaterThan(0);   // guards against the fake id 0 (BUG-003)
    return body.data.id;
  });

  const productId = await test.step('Create a product with 10 in stock', async () => {
    const res = await api.createProduct(buildProduct({ quantity: 10 }));
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.data.id).toBeGreaterThan(0);

    return body.data.id;
  });

  await test.step('Buy 3 units', async () => {
    const res = await api.createTransaction({
      userId,
      productId,
      quantity: 3,
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.quantity).toBe(3);
  });

  await test.step('Stock is reduced from 10 to 7', async () => {
     const res = await api.getProduct(productId);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data.quantity).toBe(7);
  });
});
