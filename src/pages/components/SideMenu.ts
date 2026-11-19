import type { Page } from '@playwright/test';

export type MainMenuItem =
  | 'Admin' | 'PIM' | 'Leave' | 'Time' | 'Recruitment' | 'My Info'
  | 'Performance' | 'Dashboard' | 'Directory' | 'Maintenance' | 'Claim' | 'Buzz';

export class SideMenu {
  constructor(private readonly page: Page) {}

  async open(item: MainMenuItem) {
    await this.page.locator('.oxd-main-menu').getByRole('link', { name: item, exact: true }).click();
  }
}
