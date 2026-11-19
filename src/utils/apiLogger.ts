import { type APIRequestContext, type APIResponse, test } from '@playwright/test';
import { SESSION_COOKIE } from '../api/AuthApi';

/**
 * Wraps an APIRequestContext so that EVERY request made through it - from API clients, tests or fixtures -
 * is reported:
 *  - as a `test.step` named "<METHOD> <path>" (nested under the current step, so the report reads as a story);
 *  - with a text attachment holding the full request and response (headers, params, body, status, timing);
 *  - and, with API_LOG=1, also printed to the console.
 * Secrets (passwords, CSRF tokens, session cookies) are masked before anything is written.
 */

const LOGGED_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch']);
const MAX_BODY_CHARS = 20_000;
const MASK = '***';

const SENSITIVE_KEY = /pass(word)?|_token|^token$|secret/i;
const SENSITIVE_HEADER = /^(cookie|set-cookie|authorization)$/i;

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean> | URLSearchParams | string;
  data?: unknown;
  form?: Record<string, unknown>;
  multipart?: Record<string, unknown>;
};

const consoleLogging = process.env.API_LOG === '1';

/**
 * API_LOG_SHOW_SESSION=1 shows the real value of the session cookie (for debugging: replay a request by hand,
 * see that login issued a new session). Passwords and CSRF tokens stay masked regardless.
 * Never enable it where reports are shared (e.g. CI artifacts): the report would contain a live session.
 */
const showSession = process.env.API_LOG_SHOW_SESSION === '1';
if (showSession) {
  console.warn(`[apiLogger] API_LOG_SHOW_SESSION=1: the "${SESSION_COOKIE}" session cookie is NOT masked in reports/console. Do not share them.`);
}

/** Masks a cookie value unless it is the session cookie and showing the session is enabled. */
const cookieValue = (name: string, value: string) => (showSession && name.trim() === SESSION_COOKIE ? value : MASK);

function maskObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? MASK : maskObject(v)]),
    );
  }
  return value;
}

function maskHeaderValue(name: string, value: string): string {
  switch (name.toLowerCase()) {
    case 'cookie': // "a=1; b=2" - every pair is a cookie value
      return value.replace(/(^|;\s*)([^=;]+)=([^;]*)/g, (_, sep, name, v) => `${sep}${name}=${cookieValue(name, v)}`);
    case 'set-cookie': // one cookie per line; only the leading name=value is secret, attributes (path, HttpOnly...) are not
      return value
        .split('\n')
        .map((line) => line.replace(/^([^=;]+)=([^;]*)/, (_, name, v) => `${name}=${cookieValue(name, v)}`))
        .join('\n');
    default: // authorization: keep the scheme, hide the credentials
      return value.replace(/^(\S+\s+)?.*$/, (_, scheme = '') => `${scheme}${MASK}`);
  }
}

function maskHeaders(headers: Record<string, string> | undefined) {
  if (!headers) return undefined;
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, SENSITIVE_HEADER.test(k) ? maskHeaderValue(k, v) : v]));
}

/** Masks secrets inside raw text bodies: JSON keys and the CSRF token embedded in the login page HTML. */
function maskText(text: string): string {
  return text
    .replace(/(:token=")[^"]*(")/g, `$1${MASK}$2`)
    .replace(/("(?:password|passwordConfirm|_token|token)"\s*:\s*)"[^"]*"/gi, `$1"${MASK}"`);
}

function formatBody(raw: unknown): string {
  if (raw === undefined) return '(none)';
  if (typeof raw === 'string') {
    try {
      return JSON.stringify(maskObject(JSON.parse(raw)), null, 2);
    } catch {
      return maskText(raw);
    }
  }
  if (Buffer.isBuffer(raw)) return `<binary, ${raw.length} bytes>`;
  return JSON.stringify(maskObject(raw), null, 2);
}

const truncate = (s: string) => (s.length > MAX_BODY_CHARS ? `${s.slice(0, MAX_BODY_CHARS)}\n… (truncated, ${s.length} chars total)` : s);
const json = (v: unknown) => (v === undefined ? '(none)' : JSON.stringify(v, null, 2));

type JarCookie = { name: string; value: string; domain: string; path: string };

/** Cookies from the context's jar that the browser-like client attaches to this URL (values masked, see showSession). */
function jarCookiesFor(cookies: JarCookie[], url: string): string {
  const { hostname, pathname } = new URL(url);
  const sent = cookies.filter((c) => {
    const domain = c.domain.replace(/^\./, '');
    return (hostname === domain || hostname.endsWith(`.${domain}`)) && pathname.startsWith(c.path);
  });
  return sent.length ? sent.map((c) => `${c.name}=${cookieValue(c.name, c.value)}`).join('; ') : '(none)';
}

async function describe(
  method: string,
  options: RequestOptions | undefined,
  response: APIResponse,
  ms: number,
  jar: JarCookie[],
) {
  const requestBody = options?.data ?? options?.form ?? options?.multipart;
  const bodyKind = options?.data !== undefined ? 'data' : options?.form ? 'form' : options?.multipart ? 'multipart' : '';
  let responseBody: string;
  try {
    responseBody = formatBody(await response.text());
  } catch {
    responseBody = '(unavailable)';
  }
  const params = options?.params instanceof URLSearchParams ? Object.fromEntries(options.params) : options?.params;

  return [
    `${method} ${response.url()}`,
    `→ ${response.status()} ${response.statusText()} (${ms} ms)`,
    '',
    '── Request ──────────────────────────────',
    `Headers: ${json(maskHeaders(options?.headers))}`,
    `Cookies (added automatically from the context jar): ${jarCookiesFor(jar, response.url())}`,
    `Params:  ${json(params)}`,
    `Body${bodyKind ? ` (${bodyKind})` : ''}:`,
    truncate(formatBody(requestBody)),
    '',
    '── Response ─────────────────────────────',
    `Headers: ${json(maskHeaders(response.headers()))}`,
    'Body:',
    truncate(responseBody),
  ].join('\n');
}

/** test.info() throws outside a running test (e.g. in worker fixture setup) - log nothing there. */
function insideTest(): boolean {
  try {
    test.info();
    return true;
  } catch {
    return false;
  }
}

export function withApiLogging(context: APIRequestContext): APIRequestContext {
  return new Proxy(context, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function') return original;
      if (typeof prop !== 'string' || !LOGGED_METHODS.has(prop)) return original.bind(target);

      return async (url: string, options?: RequestOptions) => {
        const call = () => (original as (u: string, o?: RequestOptions) => Promise<APIResponse>).call(target, url, options);
        if (!insideTest()) return call();

        const method = (prop === 'fetch' ? options?.method ?? 'GET' : prop).toUpperCase();
        const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];

        return test.step(`${method} ${path}`, async () => {
          // snapshot BEFORE the call: the response may change the jar (login sets the cookie, logout clears it)
          const { cookies: jar } = await target.storageState();
          const started = Date.now();
          const response = await call();
          const report = await describe(method, options, response, Date.now() - started, jar);
          await test.info().attach(`${method} ${path} → ${response.status()}`, { body: report, contentType: 'text/plain' });
          if (consoleLogging) console.log(`\n${report}\n`);
          return response;
        }, { box: true });
      };
    },
  });
}
