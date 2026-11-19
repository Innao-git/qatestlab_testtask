import { type Locator, type Page } from '@playwright/test';

export class TopBar {
  readonly header: Locator;
  readonly userDropdown: Locator;

  constructor(private readonly page: Page) {
    this.header = page.locator('.oxd-topbar-header-breadcrumb');
    this.userDropdown = page.locator('.oxd-userdropdown-tab');
  }

  /** Top navigation, e.g. openSubMenu('User Management', 'Users'). */
  async openSubMenu(menu: string, item: string) {
    await this.page.locator('.oxd-topbar-body-nav-tab').filter({ hasText: menu }).click();
    await this.page.getByRole('menuitem', { name: item, exact: true }).click();
  }

  async logout() {
    await this.userDropdown.click();
    await this.page.getByRole('menuitem', { name: 'Logout' }).click();
  }
}
