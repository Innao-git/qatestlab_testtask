import { type APIResponse, expect } from '@playwright/test';

/**
 * Signs that a response leaks server internals. Patterns are deliberately specific
 * (e.g. `SomethingException`, not the bare word "exception") to avoid false positives on normal HTML/JS.
 */
const SERVER_INTERNALS: { name: string; pattern: RegExp }[] = [
  { name: 'stack trace', pattern: /stack trace|#\d+ \/\S+\.php|\.php(?::| on line )\d+/i },
  { name: 'PHP error', pattern: /\b(Fatal error|Parse error|Uncaught|Warning: |Notice: )/ },
  { name: 'exception class', pattern: /\b\w+Exception\b/ },
  { name: 'SQL error', pattern: /SQLSTATE|SQL syntax|PDOException|Doctrine\\|ORA-\d{5}|mysqli?_/i },
  { name: 'server path', pattern: /\/var\/www|\/usr\/share\/|[A-Z]:\\\\/ },
];

/**
 * Asserts the body leaks no stack traces, SQL errors or server paths,
 * and does not echo back any of `sensitiveValues` (e.g. the submitted password).
 */
export async function expectNoServerInternals(response: APIResponse, sensitiveValues: string[] = []) {
  const body = await response.text();

  for (const { name, pattern } of SERVER_INTERNALS) {
    expect.soft(body, `response from ${response.url()} must not contain a ${name}`).not.toMatch(pattern);
  }
  for (const value of sensitiveValues.filter((v) => v.length >= 4)) {
    expect.soft(body.includes(value), `response from ${response.url()} must not echo a sensitive value`).toBe(false);
  }
}
