
import { test, expect } from '../src/fixtures';
import { buildProduct } from '../src/test-data';

test('negative product price is rejected', async ({ api }) => {
  test.fail(true, 'BUG-004: Negative prices should return 400');

  const product = buildProduct({ price: -1 });

  const res = await api.createProduct(product);

  expect(res.status()).toBe(400);
});


test('product price can be updated', async ({ api }) => {
  test.fail(true, 'BUG-002: Product price should be updated successfully');

  // Create a product
  const product = buildProduct();
  const createRes = await api.createProduct(product);

  expect(createRes.status()).toBe(201);

  const createBody = await createRes.json();
  const productId = createBody.data.id;

  expect(productId).toBeGreaterThan(0);

  // Update its price to 250
  const updateRes = await api.updateProduct(productId, {
    name: product.name,
    price: 250,
    quantity: product.quantity,
  });

  expect(updateRes.status()).toBe(200);

  // Retrieve the product and verify the updated price
  const getRes = await api.getProduct(productId);

  expect(getRes.status()).toBe(200);

  const body = await getRes.json();

  expect(Number(body.data.price)).toBe(250);
});
