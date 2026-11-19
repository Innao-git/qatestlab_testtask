import { type Locator, type Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ChartWidget } from './ChartWidget';

export class DashboardPage extends BasePage {
  static readonly path = '/web/index.php/dashboard/index';

  /** Each widget card ("oxd-sheet" - the same class is also set on an inner element, which would double-count). */
  readonly widgets: Locator;
  readonly widgetTitles: Locator;

  constructor(page: Page) {
    super(page);
    this.widgets = page.locator('.oxd-sheet.orangehrm-dashboard-widget');
    this.widgetTitles = this.widgets.locator('.orangehrm-dashboard-widget-name');
  }

  async open() {
    await this.page.goto(DashboardPage.path);
    await this.expectLoaded();
  }

  /** Navigates the way a user would: the "Dashboard" item of the side menu. */
  async navigate() {
    await this.sideMenu.open('Dashboard');
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/dashboard\/index/);
    await expect(this.topBar.header).toHaveText('Dashboard');
  }

  widget(title: string): Locator {
    return this.widgets.filter({ has: this.page.locator('.orangehrm-dashboard-widget-name', { hasText: new RegExp(`^${title}$`) }) });
  }

  chart(title: string): ChartWidget {
    return new ChartWidget(this.page, this.widget(title));
  }
}
