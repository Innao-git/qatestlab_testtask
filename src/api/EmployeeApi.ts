import { type APIRequestContext, type APIResponse, expect } from '@playwright/test';
import { endpoints } from './endpoints';
import type { ApiResponse, Employee } from './types';

export class EmployeeApi {
  constructor(private readonly request: APIRequestContext) {}

  createRaw(data: { firstName: string; lastName: string; middleName?: string }): Promise<APIResponse> {
    return this.request.post(endpoints.employees, { data });
  }

  async create(data: { firstName: string; lastName: string; middleName?: string }): Promise<Employee> {
    const res = await this.createRaw(data);
    expect(res, `create employee: ${await res.text()}`).toBeOK();
    return ((await res.json()) as ApiResponse<Employee>).data;
  }

  async delete(empNumbers: number[]): Promise<APIResponse> {
    return this.request.delete(endpoints.employees, { data: { ids: empNumbers } });
  }
}
