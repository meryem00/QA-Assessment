# Bug Reports — Ella API

**Environment:** Local · Node 20 · NestJS 11 · PostgreSQL 16 (docker-compose.dev.yml) · base commit `78b919e` + one local fix to compile (`users.service.ts:38` cast changed to `as unknown as User`, no behaviour change) · tested via Swagger UI (`http://localhost:4000/api`)

## Summary

| ID | Title | Severity | Priority |
|---|---|---|---|
| BUG-001 | Creating a transaction increases product stock instead of decreasing it | Critical | P1 |
| BUG-002 | Updating a product overwrites its price with the quantity value | High | P1 |
| BUG-003 | Creating a user with a duplicate email returns 201 with a fake user (id 0) | High | P1 |
| BUG-004 | Products can be created with a negative or zero price | High | P2 |
| BUG-005 | Non-numeric IDs in the URL return 500 Internal Server Error | Medium | P2 |
| BUG-006 | 500 error responses expose internal database error messages | Medium | P2 |
| BUG-007 | Product created with quantity 0 has status FOR_SALE | Medium | P2 |
| BUG-008 | Product price is returned as a string instead of a number | Medium | P3 |
| BUG-009 | User email format is not validated | Medium | P3 |
| BUG-010 | No upper limit on product price | Low | P3 |
| BUG-011 | PUT /products/{id} rejects partial updates; UpdateProductDto is unused | Low | P4 |
| BUG-012 | Concurrent transactions lose stock updates (race condition) | Critical | P1 |

---

### BUG-001: Creating a transaction increases product stock instead of decreasing it

**Severity:** Critical | **Priority:** P1 | **Module:** Transactions (affects Products) | **Endpoint:** POST /transactions

**Preconditions:**
- User ID 1 and Product ID 6 exist.
- Product 6 has an initial stock quantity of 7.
- `GET /products/6` returns `"quantity": 7`.

**Steps to reproduce:**
1. Send a POST request to `/transactions` with the following body:
   ```json
   {
     "userId": 1,
     "productId": 6,
     "quantity": 1
   }
   ```
2. Send a GET request to `/products/6` to verify the updated stock quantity.

**Expected Result:**
- Transaction is successfully created (201 Created).
- Product stock decreases from 7 to 6.

**Actual Result:**
- Transaction is successfully created (201 Created).
- Product stock increases from 7 to 8 instead of decreasing.

**Evidence:**
- Before transaction: `"quantity": 7`
- After transaction: `"quantity": 8`
- Transaction response confirms successful creation (201 Created).

**Root Cause:**
In `transactions.service.ts`, line 61, the product quantity is incorrectly incremented using:
```typescript
product.quantity += dto.quantity;
```
This adds the purchased quantity to the existing stock instead of deducting it.

**Suggested Fix:**
Replace the increment operation with a decrement:
```typescript
product.quantity -= dto.quantity;
```
Additionally, perform the stock validation and quantity update atomically within a database transaction to prevent concurrent purchases from causing stock inconsistencies.

**Impact:**
Product inventory is incorrectly increased whenever a transaction is created. This can result in inaccurate stock levels, products remaining available after being sold out, and customers purchasing items that are no longer in stock. It compromises inventory integrity and the reliability of the purchasing process.

---

### BUG-002: Updating a product overwrites its price with the quantity value

**Severity:** High | **Priority:** P1 | **Module:** Products | **Endpoint:** PUT /products/{id}

**Preconditions:**
- Product ID 6 exists.

**Steps to reproduce:**
1. Send a PUT request to `/products/6` with the following body:
   ```json
   {
     "name": "product1",
     "price": 250,
     "quantity": 7
   }
   ```
2. Send a GET request to `/products/6`.

**Expected Result:**
- Product is updated (200 OK).
- `price` is 250 and `quantity` is 7.

**Actual Result:**
- Product is updated (200 OK).
- `price` is 7 and `quantity` is 7. The price sent in the request is ignored and replaced with the quantity.

**Evidence:**
- GET /products/6 after update: `"price": "7"`, `"quantity": 7`

**Root Cause:**
In `products.service.ts`, line 111, price is assigned from the wrong field:
```typescript
product.price = dto.quantity ?? product.price;
```

**Suggested Fix:**
```typescript
product.price = dto.price ?? product.price;
```

**Impact:**
Every product update silently corrupts the product's price. Customers can be charged a wrong amount (e.g. 7 instead of 250), causing direct revenue loss. Because the request still returns 200, the error is not visible to the person making the change.

---

### BUG-003: Creating a user with a duplicate email returns 201 with a fake user (id 0)

**Severity:** High | **Priority:** P1 | **Module:** Users | **Endpoint:** POST /users

**Preconditions:**
- No user with email `a@test.com` exists.

**Steps to reproduce:**
1. Send a POST request to `/users` with the following body:
   ```json
   {
     "name": "A",
     "email": "a@test.com"
   }
   ```
2. Send the exact same request a second time.
3. Send a GET request to `/users`.

**Expected Result:**
- First request: 201 Created.
- Second request: 409 Conflict with a message such as "Email already exists".

**Actual Result:**
- Both requests return 201 Created with "User created successfully".
- The second response contains a user with `"id": 0` that does not exist in the database.
- GET /users shows only one user.

**Evidence:**
- Second POST response: 
```json 
{
  "statusCode": 201,
  "message": "User created successfully",
  "data": {
    "name": "A",
    "email": "a@test.com",
    "id": 0,
    "transactions": []
  }
}
```
- The response has no createdAt/updatedAt fields, unlike real users, which confirms the object was never saved to the database.

**Root Cause:**
In `users.service.ts`, lines 31–40, the unique-constraint error (Postgres code `23505`) is caught and turned into a fake success response:
```typescript
return {
  statusCode: HttpStatus.CREATED,
  message: 'User created successfully',
  data: { ...dto, id: 0, transactions: [] } ...
};
```
Note: this block also caused the TypeScript compile error (TS2352) that prevented the app from starting.

**Suggested Fix:**
Throw `new ConflictException('Email already exists')` in this case, as `update()` already does on line 123.

**Impact:**
Clients believe a user was created and receive an invalid ID (0). Any follow-up action using that ID (e.g. creating a transaction) fails or targets the wrong record. It also hides duplicate sign-ups from the client.

---

### BUG-004: Products can be created with a negative or zero price

**Severity:** High | **Priority:** P2 | **Module:** Products | **Endpoint:** POST /products

**Steps to reproduce:**
1. Send a POST request to `/products` with the following body:
   ```json
   {
     "name": "string",
     "price": -1,
     "quantity": 0
   }
   ```
2. Repeat with `"price": 0` and a different name.

**Expected Result:**
- 400 Bad Request with a validation message (price must be greater than 0).

**Actual Result:**
- 201 Created. Products are saved with price -1 and 0.

**Evidence:**
- GET /products: product id 1 → `"price": "-1"`, product id 3 → `"price": "0"`

**Root Cause:**
In `dto/create-product.dto.ts`, line 9, `price` is only validated with `@IsNumber()`. There is no minimum value rule.

**Suggested Fix:**
Add `@IsPositive()` to the `price` field.

**Impact:**
Products can be sold for free or at a negative price, which would credit money to the customer and break revenue and reporting calculations.

---

### BUG-005: Non-numeric IDs in the URL return 500 Internal Server Error

**Severity:** Medium | **Priority:** P2 | **Module:** Products, Users, Transactions | **Endpoint:** GET /products/{id}, GET /users/{id}, PUT /users/{id}, PUT /products/{id}, GET /transactions/{id}

**Steps to reproduce:**
1. Send a GET request to `/products/abc`.

**Expected Result:**
- 400 Bad Request: "id must be a number".

**Actual Result:**
- 500 Internal Server Error.

**Evidence:**
```json
{
  "statusCode": 500,
  "message": "Error retrieving product",
  "error": "invalid input syntax for type integer: \"NaN\""
}
```

**Root Cause:**
In `products.controller.ts`, line 23, the path parameter is converted with `Number(id)`. `Number('abc')` gives `NaN`, which is passed to the database query and fails there. The same pattern is used in `users.controller.ts` (lines 23, 31), `transactions.controller.ts` (line 25) and `products.controller.ts` (line 31).

**Suggested Fix:**
Use NestJS's `ParseIntPipe`: `@Param('id', ParseIntPipe) id: number`.

**Impact:**
A client input error is reported as a server failure. This creates false alarms in monitoring (5xx rate) and gives the client no useful feedback.

---

### BUG-006: 500 error responses expose internal database error messages

**Severity:** Medium (Security) | **Priority:** P2 | **Module:** All | **Endpoint:** All endpoints that return 500

**Steps to reproduce:**
1. Send a GET request to `/products/abc`.
2. Read the `error` field in the response body.

**Expected Result:**
- A generic error message (e.g. "Internal server error"). The technical details are logged on the server only.

**Actual Result:**
- The response contains the raw database error message.

**Evidence:**
- Same response as BUG-005. The error field contains the raw PostgreSQL message.
```json
{
  "statusCode": 500,
  "message": "Error retrieving product",
  "error": "invalid input syntax for type integer: \"NaN\""
}
```

**Root Cause:**
Every service `catch` block returns `error: (error as Error).message` to the client, e.g. `products.service.ts` lines 44, 66, 93, 134 and `users.service.ts` line 45. In `transactions.service.ts` the database message is also added to a 409 response (`'Database error: ' + message`).

**Suggested Fix:**
Log the original error on the server and return a generic message. A global exception filter would handle this in one place.

**Impact:**
Reveals database technology, query structure and column types to anyone calling the API. This helps an attacker plan further attacks (OWASP: security misconfiguration / information disclosure).

---

### BUG-007: Product created with quantity 0 has status FOR_SALE

**Severity:** Medium | **Priority:** P2 | **Module:** Products | **Endpoint:** POST /products

**Steps to reproduce:**
1. Send a POST request to `/products` with `"quantity": 0` and no `status`.
2. Send a GET request to that product.

**Expected Result:**
- `status` is `OUT_OF_STOCK` because there is no stock.

**Actual Result:**
- `status` is `FOR_SALE` with `quantity` 0.

**Evidence:**
- GET /products: product id 1 → `"quantity": 0`, `"status": "FOR_SALE"`

**Root Cause:**
In `products.service.ts`, line 25, status defaults to `FOR_SALE` and is never derived from the quantity: `status: dto.status || ProductStatus.FOR_SALE`. The same applies to `update()`. Only the transaction flow tries to set `OUT_OF_STOCK`, and that never happens because of BUG-001.

**Suggested Fix:**
Derive status from quantity whenever a product is created or updated (`quantity === 0 → OUT_OF_STOCK`).

**Impact:**
Customers see products as available when they cannot be bought, which leads to failed purchases and a confusing user experience.

---

### BUG-008: Product price is returned as a string instead of a number

**Severity:** Medium | **Priority:** P3 | **Module:** Products | **Endpoint:** GET /products, GET /products/{id}, POST /transactions (nested product)

**Steps to reproduce:**
1. Create a product with `"price": 7` (a number).
2. Send a GET request to `/products`.

**Expected Result:**
- `"price": 7` (a number), consistent with the request and with `quantity`.

**Actual Result:**
- `"price": "7"` (a string).

**Evidence:**
- GET /products: `"price": "7"`, `"quantity": 7`

**Root Cause:**
In `entities/product.entity.ts`, line 25, `price` is a `decimal` column. The Postgres driver returns decimals as strings to avoid losing precision, and no transformer converts them back.

**Suggested Fix:**
Add a column transformer (string → number) or return the price in a fixed format (e.g. integer cents), and document it in Swagger.

**Impact:**
The API contract does not match the Swagger documentation. In JavaScript clients, `"7" + 1` gives `"71"`, which can produce wrong totals.

---

### BUG-009: User email format is not validated

**Severity:** Medium | **Priority:** P3 | **Module:** Users | **Endpoint:** POST /users, PUT /users/{id}

**Steps to reproduce:**
1. Send a POST request to `/users` with the following body:
   ```json
   {
     "name": "Ab",
     "email": "not-an-email"
   }
   ```

**Expected Result:**
- 400 Bad Request: "email must be an email".

**Actual Result:**
- 201 Created. The user is saved with an invalid email.

**Evidence:**
```json {
  "statusCode": 201,
  "message": "User created successfully",
  "data": {
    "id": 5,
    "name": "Ab",
    "email": "not-an-email",
    "createdAt": "2026-11-15T05:25:44.966Z",
    "updatedAt": "2026-11-15T05:25:44.966Z"
  }
  ```
}

**Root Cause:**
In `users/dto/create-user.dto.ts`, line 9, `email` only has `@IsNotEmpty()`. There is no `@IsEmail()` rule.

**Suggested Fix:**
Add `@IsEmail()` to the `email` field.

**Impact:**
Invalid emails make it impossible to contact users (order confirmations, password resets) and pollute the user data.

---

### BUG-010: No upper limit on product price

**Severity:** Low | **Priority:** P3 | **Module:** Products | **Endpoint:** POST /products, PUT /products/{id}

**Steps to reproduce:**
1. Send a POST request to `/products` with `"price": 1000000000000000000000000000000000000`.

**Expected Result:**
- 400 Bad Request: price exceeds the maximum allowed value.

**Actual Result:**
- 201 Created.

**Evidence:**
- GET /products: product id 4 → `"price": "1000000000000000000000000000000000000"`

**Root Cause:**
`dto/create-product.dto.ts`, line 9: no `@Max()` rule, and the `decimal` column has no precision/scale defined.

**Suggested Fix:**
Add `@Max(<business limit>)` and define the column as e.g. `decimal(10,2)`.

**Impact:**
Unrealistic values can break totals, reports and payment providers that have amount limits.

---

### BUG-011: PUT /products/{id} rejects partial updates; UpdateProductDto is unused

**Severity:** Low | **Priority:** P4 | **Module:** Products | **Endpoint:** PUT /products/{id}

**Steps to reproduce:**
1. Send a PUT request to `/products/6` with only:
   ```json
   {
     "price": 300
   }
   ```

**Expected Result:**
- Either 200 OK with only the price changed (partial update), or clear API documentation that PUT requires the full object.

**Actual Result:**
- 400 Bad Request (name and quantity are required).

**Root Cause:**
`products.controller.ts`, line 29, uses `CreateProductDto` for updates. An `UpdateProductDto` (all fields optional) exists in `dto/update-product.dto.ts` but is never used. Meanwhile the service code (`dto.name ?? product.name`) is written for partial updates. Code and validation disagree about the intended behaviour. The same applies to `PUT /users/{id}`.

**Suggested Fix:**
Confirm the intended behaviour with the team. If partial updates are intended, use `UpdateProductDto` (ideally with `PATCH`).

**Impact:**
Clients must resend the full object to change one field, which increases the risk of overwriting data by accident.

---

### BUG-012: Concurrent transactions lose stock updates (race condition)

**Severity:** Critical | **Priority:** P1 | **Module:** Transactions (affects Products) | **Endpoint:** POST /transactions

**Preconditions:**
- API running locally; k6 installed.
- The k6 script creates a fresh user and a product with an initial stock of 100000 in `setup()`.

**Steps to reproduce:**
1. Run the load test:
   ```powershell
   k6 run qa/automation-framework/performance-test.js
   ```
   Load profile: ramp up to 20 virtual users over 30s, hold for 1 min, ramp down over 30s. Each user buys 1 unit of the same product per second.
2. Compare the number of successful transactions with the final stock printed by `teardown()`.

**Expected Result:**
- Every successful transaction (201) changes the stock by exactly its quantity.
- With 1747 successful purchases of 1 unit: final stock = 100000 − 1747 = **98253**.
- (Even with BUG-001 still present, all updates should be applied: 100000 + 1747 = **101747**.)

**Actual Result:**
- All 1747 transactions returned 201 Created (0% errors, 100% checks passed).
- Final stock is **100592**, so only 592 of the 1747 stock updates were applied.
- **1155 stock updates (≈66%) were silently lost.**

**Evidence:**
```
checks_succeeded...: 100.00% 3494 out of 3494
http_req_failed....: 0.00%  0 out of 1750
iterations.........: 1747
INFO[0121] Initial stock: 100000 | Final stock: 100592   source=console
```

**Root Cause:**
`transactions.service.ts`, `create()` (lines 27–65) uses a read-modify-write pattern with no database transaction or row lock:
1. Line 35: the product is **read** (`productRepository.findOne`).
2. Line 61: the new stock is **calculated in application memory** (`product.quantity += dto.quantity`).
3. Line 65: the product is **written back** (`productRepository.save(product)`).

When requests run at the same time, several of them read the same stock value, each calculates its own result, and each writes it back. The last write overwrites the others ("lost update"). The stock check (`dto.quantity > product.quantity`) is also done on a value that may already be outdated.

**Suggested Fix:**
- Update the stock atomically in the database instead of in application code:
  ```sql
  UPDATE product SET quantity = quantity - :qty
  WHERE id = :id AND quantity >= :qty
  ```
  and check that exactly 1 row was affected (otherwise the stock is insufficient → 409).
- Run the stock update and the transaction insert inside one database transaction (`dataSource.transaction(...)`), or lock the row with `SELECT ... FOR UPDATE` (TypeORM: `lock: { mode: 'pessimistic_write' }`).
- Keep the k6 test (with the stock check in `teardown()`) as a regression test for this fix.

**Impact:**
Under real traffic, inventory becomes wrong even though every request reports success. Once BUG-001 is fixed (stock decreasing), this same race causes **overselling**: stock decreases more slowly than items are sold, so customers can buy products that are no longer available. This bug cannot be found by single-request functional testing; it only shows up under concurrent load.
