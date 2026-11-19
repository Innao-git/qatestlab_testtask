import { type Locator, type Page, type Response, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { FormField } from '../components/FormField';

export interface VacancyRowData {
  vacancy: string;
  jobTitle: string;
  hiringManager: string;
  status: 'Active' | 'Closed';
}

/** Filter values as the user picks them in the dropdowns (visible option texts). */
export interface VacancyFilters {
  jobTitle?: string;
  vacancy?: string;
  hiringManager?: string;
  status?: 'Active' | 'Closed';
}

/** The "Vacancy" filter lists closed vacancies as "<name> (Closed)". */
export const vacancyOption = (name: string, active: boolean) => (active ? name : `${name} (Closed)`);

/** Recruitment → Vacancies: search filters and the vacancies list. */
export class VacanciesPage extends BasePage {
  static readonly path = '/web/index.php/recruitment/viewJobVacancy';
  static readonly emptyOption = '-- Select --';

  readonly filters: Locator;
  readonly jobTitleFilter: FormField;
  readonly vacancyFilter: FormField;
  readonly hiringManagerFilter: FormField;
  readonly statusFilter: FormField;
  readonly searchButton: Locator;
  readonly resetButton: Locator;
  readonly addButton: Locator;
  readonly recordsFound: Locator;
  readonly rows: Locator;
  readonly noRecords: Locator;
  readonly confirmDeleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.filters = page.locator('.oxd-table-filter');
    this.jobTitleFilter = new FormField(this.filters, 'Job Title');
    this.vacancyFilter = new FormField(this.filters, 'Vacancy');
    this.hiringManagerFilter = new FormField(this.filters, 'Hiring Manager');
    this.statusFilter = new FormField(this.filters, 'Status');
    this.searchButton = this.filters.getByRole('button', { name: 'Search' });
    this.resetButton = this.filters.getByRole('button', { name: 'Reset' });
    this.addButton = page.getByRole('button', { name: 'Add' });
    this.recordsFound = page.locator('.orangehrm-horizontal-padding').getByText(/Records? Found/);
    this.rows = page.locator('.oxd-table-body .oxd-table-card');
    this.noRecords = page.locator('.orangehrm-horizontal-padding').getByText('No Records Found');
    this.confirmDeleteButton = page.getByRole('button', { name: 'Yes, Delete' });
  }

  /** Navigates the way a user would: Recruitment → Vacancies tab. */
  async navigate() {
    await this.sideMenu.open('Recruitment');
    await this.page.locator('.oxd-topbar-body-nav-tab').getByText('Vacancies', { exact: true }).click();
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/recruitment\/viewJobVacancy/);
    await expect(this.filters).toBeVisible();
    await expect(this.recordsFound.or(this.noRecords)).toBeVisible();
  }

  async applyFilters(filters: VacancyFilters) {
    if (filters.jobTitle) await this.jobTitleFilter.select(filters.jobTitle);
    if (filters.vacancy) await this.vacancyFilter.select(filters.vacancy);
    if (filters.hiringManager) await this.hiringManagerFilter.select(filters.hiringManager);
    if (filters.status) await this.statusFilter.select(filters.status);
  }

  /** Clicks a button that reloads the list and waits for THAT list request (not an earlier/later reload). */
  private async clickAndWaitForList(button: Locator): Promise<Response> {
    const response = this.page.waitForResponse((r) => {
      const url = new URL(r.url());
      return url.pathname.endsWith('/api/v2/recruitment/vacancies') && url.searchParams.get('model') === 'detailed';
    });
    await button.click();
    return response;
  }

  async search(filters: VacancyFilters = {}): Promise<Response> {
    await this.applyFilters(filters);
    return this.clickAndWaitForList(this.searchButton);
  }

  async reset(): Promise<Response> {
    return this.clickAndWaitForList(this.resetButton);
  }

  /** Current value of every filter, in on-screen order. */
  async filterValues(): Promise<string[]> {
    return this.filters.locator('.oxd-select-text-input').allInnerTexts();
  }

  rowByName(name: string): Locator {
    return this.rows.filter({ has: this.page.getByRole('cell', { name, exact: true }) });
  }

  async getRowData(row: Locator): Promise<VacancyRowData> {
    const cells = row.getByRole('cell');
    // columns: [checkbox, Vacancy, Job Title, Hiring Manager, Status, Actions]
    const [vacancy, jobTitle, hiringManager, status] = await Promise.all(
      [1, 2, 3, 4].map(async (i) => (await cells.nth(i).innerText()).trim()),
    );
    return { vacancy, jobTitle, hiringManager, status: status as VacancyRowData['status'] };
  }

  /** Every row of the current page, top to bottom. */
  async getAllRows(): Promise<VacancyRowData[]> {
    const rows: VacancyRowData[] = [];
    for (const row of await this.rows.all()) rows.push(await this.getRowData(row));
    return rows;
  }

  async expectVacancyInList(expected: VacancyRowData) {
    const row = this.rowByName(expected.vacancy);
    await expect(row).toHaveCount(1);
    expect(await this.getRowData(row)).toEqual(expected);
  }

  async clickAdd() {
    await this.addButton.click();
  }

  async clickEdit(name: string) {
    await this.rowByName(name).locator('button:has(.bi-pencil-fill)').click();
  }

  async deleteVacancy(name: string) {
    await this.rowByName(name).locator('button:has(.bi-trash)').click();
    await this.confirmDeleteButton.click();
  }
}
