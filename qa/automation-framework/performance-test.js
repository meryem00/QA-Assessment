
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // ramp up to 20 virtual users
    { duration: '1m', target: 20 },  // hold the load
    { duration: '30s', target: 0 },  // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],       // fewer than 1% errors
    http_req_duration: ['p(95)<500'],     // 95% of requests under 500ms
  },
};

// Runs ONCE before the load: create a user + product with lots of stock
export function setup() {
  const unique = Date.now();

  const user = http
    .post(
      `${BASE_URL}/users`,
      JSON.stringify({
        name: 'Load User',
        email: `load-${unique}@test.com`,
      }),
      JSON_HEADERS,
    )
    .json('data');

  const product = http
    .post(
      `${BASE_URL}/products`,
      JSON.stringify({
        name: `Load Product ${unique}`,
        price: 10,
        quantity: 100000,
      }),
      JSON_HEADERS,
    )
    .json('data');

  return {
    userId: user.id,
    productId: product.id,
    initialStock: product.quantity,
  };
}

// Runs repeatedly by every virtual user
export default function (data) {
  const res = http.post(
    `${BASE_URL}/transactions`,
    JSON.stringify({
      userId: data.userId,
      productId: data.productId,
      quantity: 1,
    }),
    JSON_HEADERS,
  );

  check(res, {
    'status is 201': (r) => r.status === 201,
    'transaction quantity is 1': (r) =>
      r.json('data.quantity') === 1,
  });

  sleep(1);
}

// Runs ONCE after the load: data integrity check
export function teardown(data) {
  const productRes = http.get(`${BASE_URL}/products/${data.productId}`);
  const product = productRes.json('data');

  console.log(
    `Initial stock: ${data.initialStock} | Final stock: ${product.quantity}`,
  );
}

