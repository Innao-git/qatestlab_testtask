import { test, expect } from '../../src/fixtures';
import { endpoints } from '../../src/api/endpoints';
import { type ApiError, type ApiResponse, type SystemUser, UserRoleId, type UserRoleName } from '../../src/api/types';
import { expectNoServerInternals } from '../../src/utils/assertions';
import { generatePassword, generateUsername } from '../../src/utils/dataGenerator';
import userMatrix from '../../test-data/users.json';

test.describe('API: Admin → Users', { tag: '@users' }, () => {
  test('full CRUD lifecycle of a system user', { tag: '@smoke' }, async ({ userApi, employee, usersToCleanup }) => {
    const username = generateUsername('api');
    usersToCleanup.push(username);
    let user!: SystemUser;

    await test.step('POST creates a user', async () => {
      const res = await userApi.createRaw({ username, password: generatePassword(), status: true, userRoleId: UserRoleId.ESS, empNumber: employee.empNumber });
      expect(res.status()).toBe(200);
      user = ((await res.json()) as ApiResponse<SystemUser>).data;
      expect(user).toMatchObject({
        userName: username,
        deleted: false,
        status: true,
        userRole: { id: UserRoleId.ESS, name: 'ESS' },
        employee: { empNumber: employee.empNumber, firstName: employee.firstName, lastName: employee.lastName },
      });
      expect(user.id).toEqual(expect.any(Number));
      expect(user, 'password must never be returned').not.toHaveProperty('password');
    });

    await test.step('GET by id returns the same user', async () => {
      const res = await userApi.getRaw(user.id);
      expect(res.status()).toBe(200);
      expect(((await res.json()) as ApiResponse<SystemUser>).data).toEqual(user);
    });

    await test.step('GET list filtered by username finds the user', async () => {
      const res = await userApi.searchRaw({ username });
      expect(res.status()).toBe(200);
      const body = (await res.json()) as ApiResponse<SystemUser[], { total: number }>;
      expect(body.meta.total).toBe(1);
      expect(body.data[0].id).toBe(user.id);
    });

    await test.step('PUT updates role and status', async () => {
      const res = await userApi.updateRaw(user.id, {
        username, userRoleId: UserRoleId.Admin, status: false, empNumber: employee.empNumber, changePassword: false, password: '',
      });
      expect(res.status()).toBe(200);
      const updated = ((await res.json()) as ApiResponse<SystemUser>).data;
      expect(updated).toMatchObject({ id: user.id, userName: username, status: false, userRole: { id: UserRoleId.Admin, name: 'Admin' } });

      const fetched = ((await (await userApi.getRaw(user.id)).json()) as ApiResponse<SystemUser>).data;
      expect(fetched).toEqual(updated);
    });

    await test.step('DELETE removes the user', async () => {
      const res = await userApi.deleteRaw([user.id]);
      expect(res.status()).toBe(200);
      expect(((await res.json()) as ApiResponse<string[]>).data).toEqual([String(user.id)]);

      expect((await userApi.getRaw(user.id)).status()).toBe(404);
      expect(await userApi.findByUsername(username)).toBeUndefined();
    });
  });

  for (const { role, status } of userMatrix as { role: UserRoleName; status: string }[]) {
    test(`create user with role "${role}" and status "${status}"`, async ({ userApi, employee, usersToCleanup }) => {
      const username = generateUsername(`api_${role.toLowerCase()}`);
      usersToCleanup.push(username);
      const isEnabled = status === 'Enabled';

      const user = await userApi.create({ username, password: generatePassword(), status: isEnabled, userRoleId: UserRoleId[role], empNumber: employee.empNumber });

      expect(user.userRole.name).toBe(role);
      expect(user.status).toBe(isEnabled);
    });
  }

  // Every negative case also checks the error body leaks no internals (stack trace, SQL, paths) and no password.
  test.describe('negative', () => {
    test('duplicate username is rejected with 422', async ({ userApi, employee }) => {
      const password = generatePassword();
      const res = await userApi.createRaw({ username: 'Admin', password, status: true, userRoleId: UserRoleId.ESS, empNumber: employee.empNumber });
      expect(res.status()).toBe(422);
      expect(((await res.json()) as ApiError).error.data?.invalidParamKeys).toContain('username');
      await expectNoServerInternals(res, [password]);
    });

    const invalidPayloads = [
      { case: 'username shorter than 5 chars', patch: { username: 'abc' }, key: 'username' },
      { case: 'unknown role id', patch: { userRoleId: 999 }, key: 'userRoleId' },
      { case: 'missing password', patch: { password: undefined }, key: 'password' },
      { case: 'non-boolean status', patch: { status: 'yes' }, key: 'status' },
    ];
    for (const { case: caseName, patch, key } of invalidPayloads) {
      test(`create is rejected with 422: ${caseName}`, async ({ userApi, employee, usersToCleanup }) => {
        const username = generateUsername('api_neg');
        usersToCleanup.push(username, 'abc');
        const payload = { username, password: generatePassword(), status: true, userRoleId: UserRoleId.ESS, empNumber: employee.empNumber, ...patch };

        const res = await userApi.createRaw(payload as never);

        expect(res.status()).toBe(422);
        expect(((await res.json()) as ApiError).error.data?.invalidParamKeys).toContain(key);
        await expectNoServerInternals(res, payload.password ? [payload.password] : []);
      });
    }

    test('non-existent employee is rejected', async ({ userApi, usersToCleanup }) => {
      const username = generateUsername('api_neg');
      usersToCleanup.push(username);
      const password = generatePassword();
      const res = await userApi.createRaw({ username, password, status: true, userRoleId: UserRoleId.ESS, empNumber: 99999999 });
      expect(res.status()).toBe(422);
      await expectNoServerInternals(res, [password]);
    });

    test('GET of a non-existent user returns 404', async ({ userApi }) => {
      const res = await userApi.getRaw(99999999);
      expect(res.status()).toBe(404);
      await expectNoServerInternals(res);
    });

    test('malformed JSON body is rejected without leaking internals', async ({ adminRequest }) => {
      const res = await adminRequest.post(endpoints.users, { headers: { 'content-type': 'application/json' }, data: '{"username": broken' });
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
      await expectNoServerInternals(res);
    });
  });
});
