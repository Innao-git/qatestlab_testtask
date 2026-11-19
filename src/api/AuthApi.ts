import type { APIRequestContext, APIResponse } from '@playwright/test';
import { endpoints } from './endpoints';

export const SESSION_COOKIE = 'orangehrm';

export interface LoginError {
  /** Machine-readable reason, e.g. "user_disabled". */
  error: string;
  /** Text shown to the user, e.g. "Account disabled". */
  message: string;
}

const decodeHtmlAttr = (s: string) => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');

/**
 * OrangeHRM authenticates via a classic HTML form protected by a CSRF token
 * that is embedded in the login page markup (<auth-login :token="&quot;...&quot;">).
 */
export class AuthApi {
  constructor(private readonly request: APIRequestContext) {}

  async getCsrfToken(): Promise<string> {
    const html = await (await this.request.get(endpoints.auth.loginPage)).text();
    const match = html.match(/:token="&quot;([^&]+)&quot;"/);
    if (!match) throw new Error('CSRF token not found on the login page (is this context already logged in?)');
    return match[1];
  }

  /**
   * After a failed login the server redirects to the login page and renders the reason into
   * `<auth-login :error="{...}">`. Reading it tells WHY the login was rejected - a bare 302 cannot.
   * Note: the error is a one-time flash message, so call this right after the failed login.
   */
  async getLoginError(): Promise<LoginError | null> {
    const html = await (await this.request.get(endpoints.auth.loginPage)).text();
    const match = html.match(/:error="([^"]*)"/);
    if (!match) return null;
    const parsed = JSON.parse(decodeHtmlAttr(match[1])) as LoginError | null;
    return parsed && parsed.error ? parsed : null;
  }

  async login(username: string, password: string): Promise<APIResponse> {
    const token = await this.getCsrfToken();
    return this.request.post(endpoints.auth.validate, {
      form: { _token: token, username, password },
      maxRedirects: 0,
    });
  }

  logout(): Promise<APIResponse> {
    return this.request.get(endpoints.auth.logout, { maxRedirects: 0 });
  }

  /** Current value of the session cookie in this context's cookie jar. */
  async getSessionCookie(): Promise<string> {
    const cookie = (await this.request.storageState()).cookies.find((c) => c.name === SESSION_COOKIE);
    if (!cookie) throw new Error(`Session cookie "${SESSION_COOKIE}" not found`);
    return cookie.value;
  }
}
