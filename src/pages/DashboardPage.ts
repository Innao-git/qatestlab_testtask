import { type Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
  static readonly path = '/web/index.php/dashboard/index';

  constructor(page: Page) {
    super(page);
  }

  async open() {
    await this.page.goto(DashboardPage.path);
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/dashboard\/index/);
    await expect(this.topBar.header).toHaveText('Dashboard');
  }
}
