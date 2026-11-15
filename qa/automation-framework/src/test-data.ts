import { UserInput, ProductInput } from './api-client';

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// "overrides" lets a test change only what it cares about: buildProduct({ quantity: 1 })
export const buildUser = (overrides: Partial<UserInput> = {}): UserInput => ({
  name: 'QA User',
  email: `qa-${unique()}@test.com`,
  ...overrides,
});

export const buildProduct = (overrides: Partial<ProductInput> = {}): ProductInput => ({
  name: `QA Product ${unique()}`,
  price: 100,
  quantity: 10,
  ...overrides,
});
