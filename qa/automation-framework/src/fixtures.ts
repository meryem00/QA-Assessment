import { test as base } from '@playwright/test';
import { EllaApi } from './api-client';

// Every test that asks for { api } gets a ready-made client
export const test = base.extend<{ api: EllaApi }>({
  api: async ({ request }, use) => {
    await use(new EllaApi(request));
  },
});
export { expect } from '@playwright/test';
