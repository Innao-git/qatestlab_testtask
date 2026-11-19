import { test, expect } from '../../src/fixtures';
import { env } from '../../src/utils/env';
import loginCases from '../../test-data/login.json';

// Login tests must start from a clean, unauthenticated browser.
test.use({ storageState: { cookies: [], origins: [] } });

// The full invalid-credentials matrix runs at API level (tests/api/auth.api.spec.ts).
// The UI only needs a representative case to prove the error is shown to the user.
const uiInvalidCredentials = loginCases.filter((c) => c.ui);

// One row per field: each row proves that field's own validation ("both empty" would add nothing).
const requiredFieldCases = [
  { case: 'username empty', username: '', password: env.admin.password, emptyFields: ['username'] },
  { case: 'password empty', username: env.admin.username, password: '', emptyFields: ['password'] },
] as const;

test.describe('Login', { tag: '@auth' }, () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.open();
  });

  test('admin can log in with valid credentials', { tag: '@smoke' }, async ({ page, loginPage, dashboardPage }) => {
    await loginPage.login(env.admin.username, env.admin.password);

    await dashboardPage.expectLoaded();
    await expect(dashboardPage.topBar.userDropdown).toBeVisible();
    await expect(loginPage.errorAlert).toBeHidden();
    expect((await page.context().cookies()).some((c) => c.name === 'orangehrm')).toBe(true);
  });

  for (const { case: caseName, username, password } of uiInvalidCredentials) {
    test(`shows "Invalid credentials" for ${caseName}`, async ({ loginPage }) => {
      await loginPage.login(username, password);

      await expect(loginPage.errorAlert).toHaveText('Invalid credentials');
      await loginPage.expectOnLoginPage();
    });
  }

  for (const { case: caseName, username, password, emptyFields } of requiredFieldCases) {
    test(`shows "Required" and does not submit: ${caseName}`, async ({ loginPage }) => {
      const submissions = loginPage.trackSubmissions();

      await loginPage.login(username, password);

      for (const field of ['username', 'password'] as const) {
        if ((emptyFields as readonly string[]).includes(field)) await loginPage[field].expectError('Required');
        else await expect(loginPage[field].error).toBeHidden();
      }
      await loginPage.expectOnLoginPage();
      expect(submissions.count, 'form must not be submitted when a required field is empty').toBe(0);
    });
  }

  test('pressing Enter in the password field submits the form', async ({ loginPage, dashboardPage }) => {
    await loginPage.fillCredentials(env.admin.username, env.admin.password);

    await loginPage.password.input.press('Enter');

    await dashboardPage.expectLoaded();
  });

  test('double-clicking Login submits the form only once', async ({ loginPage, dashboardPage }) => {
    const submissions = loginPage.trackSubmissions();
    await loginPage.fillCredentials(env.admin.username, env.admin.password);

    await loginPage.loginButton.dblclick();

    await dashboardPage.expectLoaded();
    await expect(loginPage.errorAlert).toBeHidden();
    expect(submissions.count, 'exactly one login request must be sent').toBe(1);
  });

  test('disabled user sees "Account disabled" and stays on the login page', async ({ loginPage, createLoginUser }) => {
    const { username, password } = await createLoginUser({ enabled: false });

    await loginPage.login(username, password);

    await expect(loginPage.errorAlert).toHaveText('Account disabled');
    await loginPage.expectOnLoginPage();
  });

  test('password input is masked', async ({ loginPage }) => {
    await expect(loginPage.password.input).toHaveAttribute('type', 'password');
  });

  test('user can log out and protected pages redirect to login afterwards', async ({ page, loginPage, dashboardPage }) => {
    await loginPage.login(env.admin.username, env.admin.password);
    await dashboardPage.expectLoaded();

    await dashboardPage.topBar.logout();
    await loginPage.expectOnLoginPage();

    await page.goto('/web/index.php/dashboard/index');
    await loginPage.expectOnLoginPage();
  });

  test('unauthenticated user is redirected from a protected page to login', async ({ page, loginPage }) => {
    await page.goto('/web/index.php/admin/viewSystemUsers');
    await loginPage.expectOnLoginPage();
  });
});
