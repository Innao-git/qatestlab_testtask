import { test, expect } from '../../src/fixtures';
import { DashboardApi, type DistributionResponse } from '../../src/api/DashboardApi';
import type { DistributionKind } from '../../src/api/types';
import { expectNoServerInternals } from '../../src/utils/assertions';
import charts from '../../test-data/dashboard-charts.json';

const distributionCharts = charts as { title: string; kind: DistributionKind; itemKey: string }[];

// The numbers on the shared demo change all the time, so the tests check the contract, not values.
test.describe('API: Dashboard', { tag: '@dashboard' }, () => {
  for (const { title, kind, itemKey } of distributionCharts) {
    test.describe(title, () => {
      test('returns well-formed chart data', { tag: '@smoke' }, async ({ dashboardApi }) => {
        const res = await dashboardApi.distributionRaw(kind);
        expect(res.status()).toBe(200);
        const body = (await res.json()) as DistributionResponse;

        for (const item of body.data) {
          expect(item).toEqual({
            [itemKey]: { id: expect.any(Number), name: expect.stringMatching(/\S/) },
            count: expect.any(Number),
          });
          expect(Number.isInteger(item.count) && item.count > 0, `count of ${JSON.stringify(item)} must be a positive integer`).toBe(true);
        }
        const names = DashboardApi.toSlices({ ...body, meta: { otherEmployeeCount: 0, unassignedEmployeeCount: 0 } }, itemKey).map((s) => s.label);
        expect(new Set(names).size, 'group names must be unique - the legend would be ambiguous').toBe(names.length);
        for (const key of ['otherEmployeeCount', 'unassignedEmployeeCount'] as const) {
          expect(Number.isInteger(body.meta[key]) && body.meta[key] >= 0, `meta.${key} must be an integer >= 0`).toBe(true);
        }
      });

      test('is forbidden for an ESS user', async ({ request, authApi, createLoginUser }) => {
        const { username, password } = await createLoginUser();
        const login = await authApi.login(username, password);
        expect(login.headers()['location'], 'ESS login must succeed, or the 403 below proves nothing').toMatch(/\/dashboard\/index$/);

        const res = await new DashboardApi(request).distributionRaw(kind);

        expect(res.status()).toBe(403);
        await expectNoServerInternals(res);
      });

      test('requires a session', async ({ request }) => {
        const res = await new DashboardApi(request).distributionRaw(kind);

        expect(res.status()).toBe(401);
        await expectNoServerInternals(res);
      });
    });
  }
});
