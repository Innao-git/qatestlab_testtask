import { test, expect } from '../../src/fixtures';
import { endpoints } from '../../src/api/endpoints';
import { SESSION_COOKIE } from '../../src/api/AuthApi';
import { withApiLogging } from '../../src/utils/apiLogger';
import { expectNoServerInternals } from '../../src/utils/assertions';
import { env } from '../../src/utils/env';
import { loginCases } from '../../src/utils/loginCases';

// Auth tests need a clean cookie jar.
const NO_SESSION = { cookies: [], origins: [] };
test.use({ storageState: NO_SESSION });

// The server is the real gate: client-side validation can be bypassed, so every rule is checked here.
const invalidCredentials = loginCases;

test.describe('API: authentication', { tag: '@auth' }, () => {
  test('protected endpoint returns 401 without a session', async ({ request }) => {
    const res = await request.get(endpoints.users);
    expect(res.status()).toBe(401);
  });

  test('valid credentials create a session that can call the API', { tag: '@smoke' }, async ({ request, authApi }) => {
    const login = await authApi.login(env.admin.username, env.admin.password);
    expect(login.status()).toBe(302);
    expect(login.headers()['location']).toMatch(/\/dashboard\/index$/);

    const res = await request.get(endpoints.users, { params: { limit: 1 } });
    expect(res.status()).toBe(200);
  });

  test('username is case-insensitive', {
    annotation: {
      type: 'observed behaviour',
      description: 'No requirement defines this rule. The test documents current behaviour; if it fails, clarify the intended behaviour before filing a bug.',
    },
  }, async ({ request, authApi }) => {
    const login = await authApi.login(env.admin.username.toUpperCase(), env.admin.password);

    expect(login.headers()['location']).toMatch(/\/dashboard\/index$/);
    expect((await request.get(endpoints.users, { params: { limit: 1 } })).status()).toBe(200);
  });

  for (const { case: caseName, username, password } of invalidCredentials) {
    test(`login is rejected: ${caseName}`, async ({ request, authApi }) => {
      const login = await authApi.login(username, password);

      // handled gracefully: a redirect back to the login page, not a server error
      expect(login.status()).toBe(302);
      expect(login.headers()['location']).toMatch(/\/auth\/login$/);
      // neither the redirect nor the login page it leads to leaks internals or echoes the password
      await expectNoServerInternals(login, [password]);
      await expectNoServerInternals(await request.get(endpoints.auth.loginPage), [password]);
      // and no session was created
      expect((await request.get(endpoints.users)).status()).toBe(401);
    });
  }

  test('logout invalidates the session on the server', async ({ request, authApi, playwright, baseURL }) => {
    // A separate context with an EMPTY cookie jar: the session cookie is sent only explicitly via the header.
    // The same mechanism is used before and after logout, so a 401 can only mean the server killed the
    // session - not that the cookie was simply not sent.
    // storageState must be passed explicitly: newContext() otherwise inherits the project's (admin) session.
    const replayContext = withApiLogging(await playwright.request.newContext({ baseURL, storageState: NO_SESSION }));
    const withCookie = (session: string) => ({ headers: { Cookie: `${SESSION_COOKIE}=${session}` } });
    let session = '';

    try {
      await test.step('1. log in with valid credentials', async () => {
        const login = await authApi.login(env.admin.username, env.admin.password);
        expect(login.headers()['location']).toMatch(/\/dashboard\/index$/);
      });

      await test.step('2. save the session cookie', async () => {
        session = await authApi.getSessionCookie();
        expect(session).not.toBe('');
      });

      await test.step('3. protected endpoint accepts the saved cookie (control check)', async () => {
        const res = await replayContext.get(endpoints.users, { params: { limit: 1 }, ...withCookie(session) });
        expect(res.status()).toBe(200);
      });

      await test.step('4. log out', async () => {
        const logout = await authApi.logout();
        expect(logout.status()).toBe(302);
        expect(logout.headers()['location']).toMatch(/\/auth\/login$/);
      });

      await test.step('5-6. the same saved cookie is rejected after logout', async () => {
        const res = await replayContext.get(endpoints.users, { params: { limit: 1 }, ...withCookie(session) });
        expect(res.status()).toBe(401);
      });
    } finally {
      await replayContext.dispose();
    }
  });

  test('disabled user cannot log in', async ({ request, authApi, createLoginUser }) => {
    const { username, password } = await createLoginUser({ enabled: false });

    const login = await authApi.login(username, password);

    expect(login.status()).toBe(302);
    expect(login.headers()['location']).toMatch(/\/auth\/login$/);
    // the reason must be "disabled" - otherwise this test could not tell a disabled account from a wrong password
    expect(await authApi.getLoginError()).toEqual({ error: 'user_disabled', message: 'Account disabled' });
    expect((await request.get(endpoints.users)).status()).toBe(401);
  });

  // SKIPPED ON PURPOSE - run only in a dedicated environment.
  // The demo site is a shared public instance. Lockout or rate limiting is usually applied per account
  // AND per IP address, so hammering the login endpoint could block other testers behind the same IP
  // (office network, shared CI runners). A throwaway account is used so that Admin is never locked,
  // but the IP-level risk remains. The lockout policy (threshold, duration) is not documented, so the
  // threshold below is an assumption to align with the real policy before enabling the test.
  test.skip('repeated failed logins trigger lockout or rate limiting', {
    annotation: { type: 'skip reason', description: 'Would affect other users of the shared public demo; needs a dedicated environment and a known lockout policy.' },
  }, async ({ request, authApi, createLoginUser }) => {
    const FAILED_ATTEMPTS = 10;
    const { username, password } = await createLoginUser();

    for (let i = 0; i < FAILED_ATTEMPTS; i++) {
      const res = await authApi.login(username, `wrong-${i}`);
      expect(res.status(), 'failed attempts must never cause a server error').toBeLessThan(500);
    }

    // After the threshold even the CORRECT password must be refused (lockout) or throttled (429).
    const login = await authApi.login(username, password);
    if (login.status() !== 429) {
      expect(login.headers()['location']).toMatch(/\/auth\/login$/);
      expect((await request.get(endpoints.users)).status()).toBe(401);
    }
  });

  test('login without CSRF token is rejected', async ({ request }) => {
    const res = await request.post(endpoints.auth.validate, {
      form: { username: env.admin.username, password: env.admin.password },
      maxRedirects: 0,
    });
    expect(res.headers()['location'] ?? '').not.toMatch(/dashboard/);
    expect((await request.get(endpoints.users)).status()).toBe(401);
  });
});
