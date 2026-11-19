import { type APIRequestContext, type APIResponse, expect } from '@playwright/test';
import { endpoints } from './endpoints';
import type { ApiResponse, JobTitle } from './types';

/** Admin → Job → Job Titles (test data setup only). */
export class JobTitleApi {
  constructor(private readonly request: APIRequestContext) {}

  async create(title: string): Promise<JobTitle> {
    const res = await this.request.post(endpoints.jobTitles, { data: { title, description: '', note: '' } });
    expect(res, `create job title: ${await res.text()}`).toBeOK();
    return ((await res.json()) as ApiResponse<JobTitle>).data;
  }

  delete(ids: number[]): Promise<APIResponse> {
    return this.request.delete(endpoints.jobTitles, { data: { ids } });
  }
}
