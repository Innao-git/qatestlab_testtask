import { type Locator, type Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { FormField } from '../components/FormField';

export interface UserRowData {
  username: string;
  role: string;
  employeeName: string;
  status: string;
}

/** Admin → User Management → Users (list + search filters). */
export class SystemUsersPage extends BasePage {
  static readonly path = '/web/index.php/admin/viewSystemUsers';

  readonly filters: Locator;
  readonly usernameFilter: FormField;
  readonly searchButton: Locator;
  readonly resetButton: Locator;
  readonly addButton: Locator;
  readonly rows: Locator;
  readonly noRecords: Locator;
  readonly confirmDeleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.filters = page.locator('.oxd-table-filter');
    this.usernameFilter = new FormField(this.filters, 'Username');
    this.searchButton = this.filters.getByRole('button', { name: 'Search' });
    this.resetButton = this.filters.getByRole('button', { name: 'Reset' });
    this.addButton = page.getByRole('button', { name: 'Add' });
    this.rows = page.locator('.oxd-table-body .oxd-table-card');
    this.noRecords = page.locator('.orangehrm-horizontal-padding').getByText('No Records Found');
    this.confirmDeleteButton = page.getByRole('button', { name: 'Yes, Delete' });
  }

  /** Navigates the way a user would: Admin → User Management → Users. */
  async navigate() {
    await this.sideMenu.open('Admin');
    await this.topBar.openSubMenu('User Management', 'Users');
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/admin\/viewSystemUsers/);
    await expect(this.filters).toBeVisible();
  }

  async searchByUsername(username: string) {
    await this.usernameFilter.fill(username);
    // Match THIS search request only: the list also reloads itself after save/delete with the same
    // endpoint, and catching that response would let assertions run against a stale table.
    const response = this.page.waitForResponse((r) => {
      const url = new URL(r.url());
      return url.pathname.endsWith('/api/v2/admin/users') && url.searchParams.get('username') === username;
    });
    await this.searchButton.click();
    await response;
  }

  rowByUsername(username: string): Locator {
    return this.rows.filter({ has: this.page.getByRole('cell', { name: username, exact: true }) });
  }

  async getRowData(row: Locator): Promise<UserRowData> {
    const cells = row.getByRole('cell');
    // columns: [checkbox, Username, User Role, Employee Name, Status, Actions]
    const [username, role, employeeName, status] = await Promise.all(
      [1, 2, 3, 4].map(async (i) => (await cells.nth(i).innerText()).trim()),
    );
    return { username, role, employeeName, status };
  }

  async expectUserInList(expected: UserRowData) {
    const row = this.rowByUsername(expected.username);
    await expect(row).toHaveCount(1);
    expect(await this.getRowData(row)).toEqual(expected);
  }

  async clickAdd() {
    await this.addButton.click();
  }

  async clickEdit(username: string) {
    await this.rowByUsername(username).locator('button:has(.bi-pencil-fill)').click();
  }

  async deleteUser(username: string) {
    await this.rowByUsername(username).locator('button:has(.bi-trash)').click();
    await this.confirmDeleteButton.click();
  }
}
