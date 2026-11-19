import { test as setup, expect } from '@playwright/test';
import { LoginPage } from '../src/pages/LoginPage';
import { env, ADMIN_STORAGE_STATE } from '../src/utils/env';

setup('authenticate as admin', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.open();
  await loginPage.login(env.admin.username, env.admin.password);
  await expect(page).toHaveURL(/\/dashboard\/index/);
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
