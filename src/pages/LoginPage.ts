import { type Locator, type Page, expect } from '@playwright/test';
import { FormField } from './components/FormField';

export class LoginPage {
  static readonly path = '/web/index.php/auth/login';

  readonly form: Locator;
  readonly username: FormField;
  readonly password: FormField;
  readonly loginButton: Locator;
  readonly errorAlert: Locator;

  constructor(private readonly page: Page) {
    this.form = page.locator('form');
    this.username = new FormField(this.form, 'Username');
    this.password = new FormField(this.form, 'Password');
    this.loginButton = page.getByRole('button', { name: 'Login' });
    this.errorAlert = page.getByRole('alert');
  }

  async open() {
    await this.page.goto(LoginPage.path);
    await expect(this.loginButton).toBeVisible();
  }

  async fillCredentials(username: string, password: string) {
    await this.username.fill(username);
    await this.password.fill(password);
  }

  async login(username: string, password: string) {
    await this.fillCredentials(username, password);
    await this.loginButton.click();
  }

  /** Counts form submissions (POST /auth/validate) from the moment it is called. */
  trackSubmissions(): { readonly count: number } {
    const counter = { count: 0 };
    this.page.on('request', (r) => {
      if (r.url().includes('/auth/validate') && r.method() === 'POST') counter.count++;
    });
    return counter;
  }

  async expectOnLoginPage() {
    await expect(this.page).toHaveURL(/\/auth\/login/);
    await expect(this.loginButton).toBeVisible();
  }
}
