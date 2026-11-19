import { type Locator, type Page, type Response, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { FormField } from '../components/FormField';

export interface VacancyFormData {
  name?: string;
  jobTitle?: string;
  description?: string;
  /** Typed into the autocomplete; the option containing `option` is picked. */
  hiringManager?: { query: string; option: string };
  positions?: string;
  active?: boolean;
}

/** Add Vacancy / Edit Vacancy form (same component for both). */
export class VacancyFormPage extends BasePage {
  readonly form: Locator;
  readonly title: Locator;
  readonly name: FormField;
  readonly jobTitle: FormField;
  readonly hiringManager: FormField;
  readonly positions: FormField;
  readonly description: Locator;
  /** Switch checkboxes in on-screen order: [Active, Publish in RSS Feed and Web Page]. */
  readonly activeCheckbox: Locator;
  readonly activeSwitch: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.form = page.locator('form').first(); // the Edit page also has an Attachments block below
    this.title = page.locator('.orangehrm-main-title, .orangehrm-card-container h6').first();
    this.name = new FormField(this.form, 'Vacancy Name');
    this.jobTitle = new FormField(this.form, 'Job Title');
    this.hiringManager = new FormField(this.form, 'Hiring Manager');
    this.positions = new FormField(this.form, 'Number of Positions');
    this.description = this.form.locator('textarea');
    this.activeCheckbox = this.form.locator('.oxd-switch-wrapper input[type="checkbox"]').first();
    this.activeSwitch = this.form.locator('.oxd-switch-input').first();
    this.saveButton = this.form.getByRole('button', { name: 'Save' });
  }

  async expectLoaded(mode: 'Add' | 'Edit') {
    await expect(this.title).toHaveText(`${mode} Vacancy`);
    // the edit form fills itself asynchronously - wait until the name is populated
    if (mode === 'Edit') await expect(this.name.input).not.toHaveValue('');
  }

  async fill(data: VacancyFormData) {
    if (data.name !== undefined) await this.name.fill(data.name);
    if (data.jobTitle) await this.jobTitle.select(data.jobTitle);
    if (data.description !== undefined) await this.description.fill(data.description);
    if (data.hiringManager) await this.hiringManager.autocomplete(data.hiringManager.query, data.hiringManager.option);
    if (data.positions !== undefined) await this.positions.fill(data.positions);
    if (data.active !== undefined) await this.setActive(data.active);
  }

  async setActive(active: boolean) {
    if ((await this.activeCheckbox.isChecked()) !== active) await this.activeSwitch.click();
    await expect(this.activeCheckbox).toBeChecked({ checked: active });
  }

  /** Clicks Save and waits for the server to answer the create (POST) or update (PUT) request. */
  async save(): Promise<Response> {
    const response = this.page.waitForResponse(
      (r) => /\/api\/v2\/recruitment\/vacancies(\/\d+)?$/.test(new URL(r.url()).pathname) && ['POST', 'PUT'].includes(r.request().method()),
    );
    await this.saveButton.click();
    return response;
  }
}
