import { type APIRequestContext, type APIResponse, expect } from '@playwright/test';
import { endpoints } from './endpoints';
import type { ApiResponse, Vacancy, VacancyPayload, VacancySearchParams } from './types';

/** Recruitment → Vacancies. */
export class VacancyApi {
  constructor(private readonly request: APIRequestContext) {}

  // Raw methods return the response untouched - use them for status-code / negative assertions.
  createRaw(data: VacancyPayload): Promise<APIResponse> {
    return this.request.post(endpoints.vacancies, { data });
  }

  getRaw(id: number): Promise<APIResponse> {
    return this.request.get(endpoints.vacancy(id));
  }

  updateRaw(id: number, data: VacancyPayload): Promise<APIResponse> {
    return this.request.put(endpoints.vacancy(id), { data });
  }

  deleteRaw(ids: number[]): Promise<APIResponse> {
    return this.request.delete(endpoints.vacancies, { data: { ids } });
  }

  /** The same request the Vacancies page sends when "Search" is clicked. */
  searchRaw(params: VacancySearchParams): Promise<APIResponse> {
    const query = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    return this.request.get(endpoints.vacancies, { params: { limit: 50, offset: 0, model: 'detailed', ...query } });
  }

  // Convenience methods assert success and return parsed data - use them for setup/teardown.
  async create(data: VacancyPayload): Promise<Vacancy> {
    const res = await this.createRaw(data);
    expect(res, `create vacancy: ${await res.text()}`).toBeOK();
    return ((await res.json()) as ApiResponse<Vacancy>).data;
  }

  async search(params: VacancySearchParams): Promise<{ data: Vacancy[]; total: number }> {
    const res = await this.searchRaw(params);
    expect(res).toBeOK();
    const body = (await res.json()) as ApiResponse<Vacancy[], { total: number }>;
    return { data: body.data, total: body.meta.total };
  }

  /** All vacancies with exactly this name (the server allows duplicates, see the known-issue test). */
  async findByName(name: string): Promise<{ id: number; name: string }[]> {
    const res = await this.request.get(endpoints.vacancies, { params: { limit: 0, model: 'summary' } });
    expect(res).toBeOK();
    return ((await res.json()) as ApiResponse<{ id: number; name: string }[]>).data.filter((v) => v.name === name);
  }

  async deleteByNames(names: string[]): Promise<void> {
    const ids: number[] = [];
    for (const name of new Set(names)) ids.push(...(await this.findByName(name)).map((v) => v.id));
    if (ids.length) await this.deleteRaw(ids);
  }
}
