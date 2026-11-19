import { test, expect } from '../../src/fixtures';
import { DashboardApi, type DistributionResponse } from '../../src/api/DashboardApi';
import type { DistributionKind } from '../../src/api/types';
import charts from '../../test-data/dashboard-charts.json';

const distributionCharts = charts as { title: string; kind: DistributionKind; itemKey: string }[];

const ADMIN_WIDGETS = [
  'Time at Work',
  'My Actions',
  'Quick Launch',
  'Buzz Latest Posts',
  'Employees on Leave Today',
  'Employee Distribution by Sub Unit',
  'Employee Distribution by Location',
];
// An ESS user gets the personal widgets only - the company-wide distribution charts are Admin data.
const ESS_WIDGETS = ADMIN_WIDGETS.filter((w) => !w.startsWith('Employee Distribution'));

// The demo is shared and its numbers change all the time, so nothing is hard-coded: each chart is compared
// with the exact API response the page itself received.
test.describe('Dashboard', { tag: '@dashboard' }, () => {
  test('shows the expected widgets and renders both charts', { tag: '@smoke' }, async ({ page, dashboardPage }) => {
    // Reach the Dashboard through its menu tab, as the task describes. The login already lands on the Dashboard,
    // so start from another module to make the navigation real. The other tests open it by URL: they check charts.
    await page.goto('/web/index.php/pim/viewEmployeeList');
    await dashboardPage.navigate();

    await expect(dashboardPage.widgetTitles).toHaveText(ADMIN_WIDGETS);
    for (const { title } of distributionCharts) await dashboardPage.chart(title).expectRendered();
  });

  for (const { title, kind, itemKey } of distributionCharts) {
    test(`"${title}" chart shows exactly the data it received`, async ({ page, dashboardPage }) => {
      const response = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(`/dashboard/employees/${kind}`));
      await dashboardPage.open();
      const slices = DashboardApi.toSlices((await (await response).json()) as DistributionResponse, itemKey);
      const expectedTooltips = slices.map((s) => DashboardApi.tooltipText(s, slices));
      const chart = dashboardPage.chart(title);

      await test.step('legend lists every group, in data order', async () => {
        expect(await chart.legendLabels()).toEqual(slices.map((s) => s.label));
      });

      await test.step('tooltips show the right count and share', async () => {
        const seen = await chart.collectTooltips();
        // every tooltip shown must match the data; tiny slices may be missed by the sweep, the biggest may not
        for (const tooltip of seen) expect(expectedTooltips, 'tooltip not backed by the data').toContain(tooltip);
        const biggest = slices.reduce((a, b) => (b.count > a.count ? b : a));
        expect(seen).toContain(DashboardApi.tooltipText(biggest, slices));
      });
    });
  }

  test('clicking a legend item toggles its slice', async ({ dashboardPage }) => {
    await dashboardPage.open();
    const chart = dashboardPage.chart(distributionCharts[0].title);
    const [label] = await chart.legendLabels();
    const item = chart.legendLabel(label);

    await item.click();
    await expect(item, 'hidden slice is struck through in the legend').toHaveCSS('text-decoration-line', 'line-through');

    await item.click();
    await expect(item).toHaveCSS('text-decoration-line', 'none');
  });

  test.describe('negative', () => {
    test('chart shows only the groups it is given: no "Unassigned", "Other" or broken values', async ({ page, dashboardPage }) => {
      // Live data always has unassigned employees, so the "group is absent" case is only reachable with a stub.
      const stub: DistributionResponse = {
        data: [
          { subunit: { id: 9001, name: 'QA Stub Unit A' }, count: 3 },
          { subunit: { id: 9002, name: 'QA Stub Unit B' }, count: 1 },
        ],
        meta: { otherEmployeeCount: 0, unassignedEmployeeCount: 0 },
        rels: [],
      };
      await page.route('**/api/v2/dashboard/employees/subunit', (route) => route.fulfill({ json: stub }));
      await dashboardPage.open();
      const chart = dashboardPage.chart('Employee Distribution by Sub Unit');

      expect(await chart.legendLabels()).toEqual(['QA Stub Unit A', 'QA Stub Unit B']);
      await expect(chart.root.getByText('Unassigned', { exact: true })).toHaveCount(0);
      await expect(chart.root.getByText('Other', { exact: true })).toHaveCount(0);
      await expect(chart.root).not.toContainText(/undefined|NaN|null/);
      // all slices are large here, so the sweep must find every one - and nothing else
      expect((await chart.collectTooltips()).sort()).toEqual(['QA Stub Unit A 3 (75.00%)', 'QA Stub Unit B 1 (25.00%)']);
    });

    test.describe('as an ESS user', () => {
      test.use({ storageState: { cookies: [], origins: [] } });

      test('does not see the company-wide distribution charts', async ({ loggedInUser: _, dashboardPage }) => {
        await dashboardPage.open();

        await expect(dashboardPage.widgetTitles).toHaveText(ESS_WIDGETS);
        for (const { title } of distributionCharts) await expect(dashboardPage.widget(title)).toHaveCount(0);
      });
    });
  });
});
