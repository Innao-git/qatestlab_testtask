import { type APIRequestContext, type APIResponse, expect } from '@playwright/test';
import { endpoints } from './endpoints';
import type { ApiResponse, CreateUserPayload, SystemUser, UpdateUserPayload } from './types';

export class UserApi {
  constructor(private readonly request: APIRequestContext) {}

  // Raw methods return the response untouched - use them for status-code / negative assertions.
  createRaw(data: CreateUserPayload): Promise<APIResponse> {
    return this.request.post(endpoints.users, { data });
  }

  getRaw(id: number): Promise<APIResponse> {
    return this.request.get(endpoints.user(id));
  }

  updateRaw(id: number, data: UpdateUserPayload): Promise<APIResponse> {
    return this.request.put(endpoints.user(id), { data });
  }

  deleteRaw(ids: number[]): Promise<APIResponse> {
    return this.request.delete(endpoints.users, { data: { ids } });
  }

  searchRaw(params: Record<string, string | number>): Promise<APIResponse> {
    return this.request.get(endpoints.users, { params });
  }

  // Convenience methods assert success and return parsed data - use them for setup/teardown.
  async create(data: CreateUserPayload): Promise<SystemUser> {
    const res = await this.createRaw(data);
    expect(res, `create user: ${await res.text()}`).toBeOK();
    return ((await res.json()) as ApiResponse<SystemUser>).data;
  }

  async findByUsername(username: string): Promise<SystemUser | undefined> {
    const res = await this.searchRaw({ username, limit: 50 });
    expect(res).toBeOK();
    const { data } = (await res.json()) as ApiResponse<SystemUser[]>;
    // the API filter is a "contains"-style match, so pick the exact one
    return data.find((u) => u.userName === username);
  }

  async deleteByUsernames(usernames: string[]): Promise<void> {
    const ids: number[] = [];
    for (const name of usernames) {
      const user = await this.findByUsername(name);
      if (user) ids.push(user.id);
    }
    if (ids.length) await this.deleteRaw(ids);
  }
}
