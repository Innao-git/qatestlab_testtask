import { type Locator, type Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { FormField } from '../components/FormField';
import type { UserRoleName, UserStatusName } from '../../api/types';

export interface UserFormData {
  role?: UserRoleName;
  /** Full or partial employee name used in the autocomplete. */
  employeeName?: string;
  status?: UserStatusName;
  username?: string;
  password?: string;
  confirmPassword?: string;
}

/** Add User / Edit User form (same component for both). */
export class SystemUserFormPage extends BasePage {
  readonly form: Locator;
  readonly title: Locator;
  readonly role: FormField;
  readonly employeeName: FormField;
  readonly status: FormField;
  readonly username: FormField;
  readonly password: FormField;
  readonly confirmPassword: FormField;
  readonly changePasswordCheckbox: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    super(page);
    this.form = page.locator('form');
    this.title = page.locator('.orangehrm-main-title');
    this.role = new FormField(this.form, 'User Role');
    this.employeeName = new FormField(this.form, 'Employee Name');
    this.status = new FormField(this.form, 'Status');
    this.username = new FormField(this.form, 'Username');
    this.password = new FormField(this.form, 'Password');
    this.confirmPassword = new FormField(this.form, 'Confirm Password');
    this.changePasswordCheckbox = this.form.locator('.oxd-checkbox-wrapper');
    this.saveButton = this.form.getByRole('button', { name: 'Save' });
    this.cancelButton = this.form.getByRole('button', { name: 'Cancel' });
  }

  async expectLoaded(mode: 'Add' | 'Edit') {
    await expect(this.title).toHaveText(`${mode} User`);
    // the edit form fills itself asynchronously - wait until the username is populated
    if (mode === 'Edit') await expect(this.username.input).not.toHaveValue('');
  }

  async fill(data: UserFormData) {
    if (data.role) await this.role.select(data.role);
    if (data.employeeName) await this.employeeName.autocomplete(data.employeeName);
    if (data.status) await this.status.select(data.status);
    if (data.username !== undefined) await this.username.fill(data.username);
    if (data.password !== undefined) await this.password.fill(data.password);
    if (data.confirmPassword ?? data.password) await this.confirmPassword.fill((data.confirmPassword ?? data.password)!);
  }

  async save() {
    await this.saveButton.click();
  }
}
