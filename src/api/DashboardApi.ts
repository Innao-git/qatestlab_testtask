import type { APIRequestContext, APIResponse } from '@playwright/test';
import { endpoints } from './endpoints';
import type { ApiResponse, ChartSlice, DistributionItem, DistributionKind, DistributionMeta } from './types';

export type DistributionResponse = ApiResponse<DistributionItem[], DistributionMeta>;

export class DashboardApi {
  constructor(private readonly request: APIRequestContext) {}

  distributionRaw(kind: DistributionKind): Promise<APIResponse> {
    return this.request.get(endpoints.employeeDistribution(kind));
  }

  /**
   * Turns an API response into the slices the pie chart must show, in display order:
   * the named groups as returned, then "Other" and "Unassigned" - each only when its count is above 0.
   * `itemKey` is the object holding the group name: "subunit" or "location".
   */
  static toSlices(body: DistributionResponse, itemKey: string): ChartSlice[] {
    const slices = body.data.map((item) => ({ label: (item[itemKey] as { name: string }).name, count: item.count }));
    if (body.meta.otherEmployeeCount > 0) slices.push({ label: 'Other', count: body.meta.otherEmployeeCount });
    if (body.meta.unassignedEmployeeCount > 0) slices.push({ label: 'Unassigned', count: body.meta.unassignedEmployeeCount });
    return slices;
  }

  /** Tooltip text for a slice, e.g. "Unassigned 175 (96.15%)" - the share is rounded to 2 decimals like the UI. */
  static tooltipText(slice: ChartSlice, all: ChartSlice[]): string {
    const total = all.reduce((sum, s) => sum + s.count, 0);
    return `${slice.label} ${slice.count} (${((slice.count / total) * 100).toFixed(2)}%)`;
  }
}
