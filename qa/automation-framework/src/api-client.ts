import { APIRequestContext } from '@playwright/test';

export type UserInput = { name: string; email: string };
export type ProductInput = { name: string; price: number; quantity: number; status?: string };
export type TransactionInput = { userId: number; productId: number; quantity: number };

export class EllaApi {
  constructor(private readonly request: APIRequestContext) {}

  createUser(body: UserInput) {
    return this.request.post('/users', { data: body });
  }
  getUser(id: number | string) {
    return this.request.get(`/users/${id}`);
  }
  createProduct(body: ProductInput) {
    return this.request.post('/products', { data: body });
  }
  getProduct(id: number | string) {
    return this.request.get(`/products/${id}`);
  }
  createTransaction(body: TransactionInput) {
    return this.request.post('/transactions', { data: body });
  }
  
  updateProduct(id: number | string, body: Partial<ProductInput>) {
    return this.request.put(`/products/${id}`, { data: body });
  }

}
