import { test, expect } from '../../src/fixtures';
import type { UserRoleName, UserStatusName } from '../../src/api/types';
import { generatePassword, generateUsername } from '../../src/utils/dataGenerator';
import userMatrix from '../../test-data/users.json';

const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

test.describe('Admin → User Management → Users', { tag: '@users' }, () => {
  test.beforeEach(async ({ dashboardPage, usersPage }) => {
    await dashboardPage.open();
    await usersPage.navigate();
  });

  test('add, verify, edit and delete a system user', { tag: '@smoke' }, async ({ usersPage, userFormPage, employee, usersToCleanup }) => {
    const username = generateUsername();
    usersToCleanup.push(username); // safety net if the test fails before the UI delete step
    const employeeName = fullName(employee);

    await test.step('add a new user with a unique username', async () => {
      await usersPage.clickAdd();
      await userFormPage.expectLoaded('Add');
      await userFormPage.fill({ role: 'ESS', employeeName, status: 'Enabled', username, password: generatePassword() });
      await userFormPage.save();
      await usersPage.toast.expectMessage('Successfully Saved');
      await usersPage.expectLoaded();
    });

    await test.step('user appears in the list with correct details', async () => {
      await usersPage.searchByUsername(username);
      await usersPage.expectUserInList({ username, role: 'ESS', employeeName, status: 'Enabled' });
    });

    await test.step('edit the user: change role and status', async () => {
      await usersPage.clickEdit(username);
      await userFormPage.expectLoaded('Edit');
      await expect(userFormPage.username.input).toHaveValue(username);
      await userFormPage.fill({ role: 'Admin', status: 'Disabled' });
      await userFormPage.save();
      await usersPage.toast.expectMessage('Successfully Updated');
      await usersPage.expectLoaded();
    });

    await test.step('updated details are shown in the list', async () => {
      await usersPage.searchByUsername(username);
      await usersPage.expectUserInList({ username, role: 'Admin', employeeName, status: 'Disabled' });
    });

    await test.step('delete the user and confirm it is gone', async () => {
      await usersPage.deleteUser(username);
      await usersPage.toast.expectMessage('Successfully Deleted');
      await usersPage.searchByUsername(username);
      await expect(usersPage.rowByUsername(username)).toHaveCount(0);
      await expect(usersPage.noRecords).toBeVisible();
    });
  });

  for (const { role, status } of userMatrix as { role: UserRoleName; status: UserStatusName }[]) {
    test(`create user with role "${role}" and status "${status}"`, async ({ usersPage, userFormPage, employee, usersToCleanup }) => {
      const username = generateUsername(role.toLowerCase());
      usersToCleanup.push(username);

      await usersPage.clickAdd();
      await userFormPage.fill({ role, employeeName: fullName(employee), status, username, password: generatePassword() });
      await userFormPage.save();
      await usersPage.toast.expectMessage('Successfully Saved');

      await usersPage.searchByUsername(username);
      await usersPage.expectUserInList({ username, role, employeeName: fullName(employee), status });
    });
  }

  test.describe('add user form validation', () => {
    test.beforeEach(async ({ usersPage, userFormPage }) => {
      await usersPage.clickAdd();
      await userFormPage.expectLoaded('Add');
    });

    test('all required fields are validated', async ({ page, userFormPage }) => {
      await userFormPage.save();

      for (const field of [userFormPage.role, userFormPage.employeeName, userFormPage.status, userFormPage.username, userFormPage.password]) {
        await field.expectError('Required');
      }
      await userFormPage.confirmPassword.expectError('Passwords do not match');
      await expect(page).toHaveURL(/\/admin\/saveSystemUser/);
    });

    test('existing username is rejected', async ({ userFormPage }) => {
      await userFormPage.username.fill('Admin');
      await userFormPage.username.expectError('Already exists');
    });

    test('password confirmation must match', async ({ userFormPage }) => {
      await userFormPage.fill({ password: 'Valid1234!', confirmPassword: 'Different1234!' });
      await userFormPage.confirmPassword.expectError('Passwords do not match');
    });

    test('username shorter than 5 characters is rejected', async ({ userFormPage }) => {
      await userFormPage.username.fill('abc');
      await userFormPage.username.expectError('Should be at least 5 characters');
    });

    test('cancel returns to the list without creating a user', async ({ usersPage, userFormPage, userApi }) => {
      const username = generateUsername();
      await userFormPage.username.fill(username);
      await userFormPage.cancelButton.click();

      await usersPage.expectLoaded();
      expect(await userApi.findByUsername(username)).toBeUndefined();
    });
  });
});
