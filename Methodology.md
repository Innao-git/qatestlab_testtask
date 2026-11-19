# Test Methodology

This document explains **what** is tested, **at which level** and **why**.
For how the framework is built (Page Objects, fixtures, configuration), see [README.md](README.md).

> **Current scope:** Login and Admin → User Management.
> This document will be extended when Attachments, Dashboard and Vacancies are added.

---

## 1. Splitting checks between API and E2E

The guiding rule: **check each business rule in detail at one level only. At the other level, keep at most one representative check.** This avoids two suites that test the same thing at different speeds.

| Level   | What it is responsible for | Why |
|---------|----------------------------|-----|
| **API** | Business rules and the data contract:<br>• field validation<br>• status codes<br>• response shape<br>• state transitions (create → update → delete → 404)<br>• data that must never leak (password) | Fast and precise. A `422` response names the rejected field (`invalidParamKeys`), so a failure points straight at the cause. Running many input variations costs almost nothing. |
| **E2E** | What the user sees and does:<br>• the navigation path<br>• form behaviour and validation messages<br>• toasts and confirm dialogs<br>• how data appears in the table<br>• session handling in the browser | Only a browser shows these. Each E2E test is slow, so the suite is kept small and focused on user flows. |

**Example.** Take the rule *"username must have at least 5 characters"*:

- the **API** test checks that the server rejects it (`422`, key `username`);
- the **E2E** test checks only that the user sees *"Should be at least 5 characters"*.

Neither test repeats the other.

**The API also serves the E2E tests.** It is never the subject of an E2E test, but E2E tests use it to:

- **create preconditions** quickly (a fresh employee);
- **clean up**, even when a test fails;
- **verify what the UI cannot show.** For example, after *Cancel* the API confirms that no user was created.

## 2. Test design techniques

**Positive and negative pairs.** Each feature has the happy path plus the main ways to break it. For login, that means valid credentials, then:

- a wrong password;
- an unknown user;
- empty fields;
- injection-like input.

**Equivalence partitioning.** Invalid inputs are grouped by *reason*, with one representative per group, instead of many similar values. The groups for user creation:

| Group               | Representative          |
|---------------------|-------------------------|
| Duplicate value     | existing `Admin`        |
| Too short           | `abc`                   |
| Unknown reference   | role `999`, employee `99999999` |
| Missing field       | no `password`           |
| Wrong type          | `status: "yes"`         |

**Data-driven tables.** Inputs live in `test-data/*.json`, so a new case is one more line of data, not new code.

- `login.json` holds the invalid-credential groups. The **API** suite runs every row. The **E2E** suite runs only the rows flagged `"ui": true`. One data source feeds both levels, so they cannot drift apart.
- A case that adds no new risk is left out. Examples:
  - `admin!@#$` as a username is the same class as "unknown user", and the SQL-injection row already covers special characters;
  - "both fields empty" adds nothing to "username empty" plus "password empty";
  - a leading and a trailing space in the password exercise the same rule, so one row (trailing, the common copy-paste mistake) is kept.
- Behaviour that **no requirement defines** is not asserted as pass/fail in the regular matrix. If the product legitimately changed it, the test would fail without a bug. Spaces around the username are therefore not tested. Username case-insensitivity is kept as a single API test annotated `observed behaviour`, so its status is visible in the report.
- `users.json` holds role/status combinations. Role and status are independent fields, so two rows (Admin + Enabled, ESS + Disabled) cover every value of both fields. All four combinations would add run time without adding risk coverage. This is the idea behind pairwise testing.

**Exploration before automation.** Before writing assertions, I probed the real system to learn its actual rules instead of assuming them. This produced several tests:

| Finding | How the tests use it |
|---------|----------------------|
| The username is **case-insensitive** (`ADMIN` logs in) | an API test annotated `observed behaviour` |
| The password **is case-sensitive** and **not trimmed** | negative cases. An exact password match is a security expectation, not just observed behaviour |
| Spaces around the username are **not trimmed** | documented only. Either behaviour would be acceptable, so it is not asserted |
| `PUT /admin/users/{id}` needs `changePassword: false` **and** `password: ""`, otherwise it returns `422` | documented in the API client and the README |
| Admin's My Info is **one record shared** by everyone on the demo and already holds other people's files | attachment tests run as a fresh ESS user with its own employee |
| The 1 MB limit is enforced **in the browser and on the server** (`422` for `attachment`) | covered at both levels |
| Downloading a missing attachment returns `400`, not `404` | tests accept any `4xx`. No code is specified, and the risk is a `5xx` or a served file |
| Dashboard numbers change constantly on the shared demo (for example, the unassigned count keeps growing) | charts are compared with the API response the page received, never with fixed numbers |
| The pie values live in a `<canvas>`, but the legend and the hover tooltip are HTML | values are checked through the legend and the tooltips |
| An ESS user does not get the distribution charts, and their APIs return `403` | an ESS test at both levels |
| Filtering vacancies by the test's **own hiring manager** returns exactly the test's own vacancies | the search tests use a private data set and assert the **exact** result |
| The UI rejects a **duplicate vacancy name** and **positions outside 1–99**, but the API accepts both (`200`) | **defect**: API tests marked `test.fail()` with a `known issue` annotation |
| After saving a new vacancy the app reloads into the Edit page, so the success toast vanishes | the test checks the server response and the Edit page, not the toast |

These are recorded as observed behaviour, not as bugs: the requirements are not available to decide which behaviour is intended.

## 3. Assertion strategy

Each assertion aims to catch the defect, not just to pass.

- **Compare whole objects.** A table row is read into `{username, role, employeeName, status}` and compared with one `toEqual`. An API entity is compared with `toEqual` or `toMatchObject`. A wrong value in any column fails the test, not only the column that happened to be checked.
- **Check why a request failed, not only that it failed.** Negative API tests assert the status code **and** the rejected parameter. A `422` caused by a different field would otherwise pass unnoticed. Login is handled the same way: a failed login always looks like `302 → /auth/login`, so the disabled-user test reads the reason the server renders on the login page (`user_disabled`). Otherwise it would also pass for a wrong password.
- **Check what the response must not contain.** Every negative response, from the login matrix and from the Users API, goes through `expectNoServerInternals()`. It looks for stack traces, SQL errors, exception classes and server paths, and for an echo of the submitted password. Error paths are where such leaks usually appear, and a status-code check would never notice them.
- **Check that something did not happen.** Examples:
  - the login form sends **no request** when its fields are empty, and **exactly one** when Login is double-clicked;
  - a deleted user returns `404` and is missing from search;
  - the API never returns a `password` field.
- **Check after an action, not only during it.** After *Edit*, the test searches again and checks the list. After the API `PUT`, the test calls `GET` to confirm the change was saved, not just echoed back.

## 4. Coverage map

### Login

| Check | API | E2E |
|-------|:---:|:---:|
| Valid login creates a session | ✅ | ✅ |
| Invalid credentials are rejected (7-case matrix) | ✅ data-driven | ✅ 1 representative case |
| Password case-sensitive and not trimmed | ✅ | – |
| Username case-insensitive (observed behaviour) | ✅ | – |
| Empty fields rejected **by the server** (UI validation can be bypassed) | ✅ | – |
| Required-field validation on the client (2 rows, no request sent) | – | ✅ |
| No server internals or password echo in the response body | ✅ | – |
| Disabled user is rejected, with the reason checked | ✅ (`user_disabled`) | ✅ (*"Account disabled"*) |
| Enter key submits the form | – | ✅ |
| Double click sends exactly one login request | – | ✅ |
| Brute force / lockout | ⏸ written, skipped (see section 5) | – |
| Password input is masked | – | ✅ |
| Logout ends the session (UI redirects to login) | – | ✅ |
| Logout invalidates the session **on the server** (the old cookie is replayed and gets `401`) | ✅ | – |
| Protected resource without a session (`401` / redirect to login) | ✅ | ✅ |
| CSRF token required | ✅ | – |

### User Management

| Check | API | E2E |
|-------|:---:|:---:|
| Create → read → update → delete lifecycle | ✅ | ✅ |
| Role and status combinations | ✅ | ✅ |
| Created user shown with correct details | ✅ (entity) | ✅ (table row) |
| Password never returned | ✅ | – |
| Duplicate username | ✅ `422` | ✅ message |
| Username too short | ✅ `422` | ✅ message |
| Unknown role, missing password, wrong type, unknown employee | ✅ | – |
| Required fields and password confirmation | – | ✅ |
| Cancel discards changes | – | ✅ (checked through the API) |
| Error bodies leak no internals; malformed JSON gets a `4xx`, not a `5xx` | ✅ | – |

### My Info → Attachments

| Check | API | E2E |
|-------|:---:|:---:|
| Upload → list → download → delete lifecycle | ✅ | ✅ |
| Uploaded file shown with correct details (name, description, size, type, added by) | ✅ (entity) | ✅ (table row) |
| Downloaded file is **byte-for-byte** the uploaded one, with the original file name | ✅ | ✅ |
| File types `txt`, `png`, `pdf` keep their MIME type and content | ✅ data-driven | – |
| File over 1 MB rejected, nothing saved | ✅ `422` | ✅ message, no request sent |
| Upload without a file rejected | ✅ `422` | ✅ *"Required"*, no request sent |
| Deleted or missing attachment cannot be downloaded (`4xx`, not `5xx`) | ✅ | – |
| Deletion confirmed on the server, not only in the UI | ✅ | ✅ (checked through the API) |

### Dashboard

| Check | API | E2E |
|-------|:---:|:---:|
| Expected widgets present; both charts painted | – | ✅ |
| Chart shows exactly the data it received (legend labels and order, tooltip count and %) | – | ✅ data-driven (2 charts) |
| Legend click hides and restores a slice | – | ✅ |
| Absent groups are not shown; no `undefined` / `NaN` / `null` | – | ✅ stubbed data |
| Chart data contract (ids, names, positive integer counts, unique names, meta counts) | ✅ data-driven (2 endpoints) | – |
| ESS user cannot get company-wide chart data | ✅ `403` | ✅ widgets absent |
| No session | ✅ `401` | – |

### Recruitment → Vacancies

| Check | API | E2E |
|-------|:---:|:---:|
| Search by each filter and by combined filters returns **exactly** the matching vacancies | ✅ 6-row matrix | ✅ 3 representative rows |
| Non-matching vacancies are not listed; *"No match"* shows *"No Records Found"* | ✅ | ✅ |
| Reset clears every filter and sends an unfiltered request | – | ✅ |
| Add → list → edit (job title, status) → list → delete lifecycle | ✅ | ✅ |
| Required fields, positions not numeric or out of range, duplicate name | `422` (name) | ✅ messages |
| Invalid search parameters (`status`, `hiringManagerId`) rejected, no leaks | ✅ `422` | – |
| Server enforces the UI rules (duplicate name, 1–99 positions) | ❌ **known issue**, `test.fail()` | – |

## 5. Risk-based selection: what is not covered and why

Coverage follows the task scope and the highest-risk flows. These areas were left out on purpose:

| Not covered | Reason |
|-------------|--------|
| **Role permissions** (an ESS user cannot open Admin) | Highest-value next step. The `loggedInUser` fixture now provides an ESS browser session, and the dashboard tests already check one permission rule (no company-wide charts, `403` from their API). The Admin module itself is not yet checked. |
| **Time at Work chart** | Its data is the logged-in user's punch-in/out time, which other people on the demo change. Validating it would need attendance records created for a test user. |
| **Dashboard counts change after creating data** (a new employee → unassigned + 1) | Other testers create employees in parallel, so an exact `+1` cannot be guaranteed on the shared demo. |
| **Every pie slice's value** | Slices of 1–2 % are too small to hover reliably. Every tooltip that is shown is checked, the biggest slice is required, and with stubbed data every slice is checked. |
| **Vacancy sorting, pagination, the "Publish in RSS Feed" switch, vacancy attachments and the Candidates tab** | Outside the task scenario (search, plus the CRUD flow added on request). |
| **Vacancy positions boundaries 1 and 99** | Only clearly invalid values (`abc`, `100`) are checked. The 0/1 and 99/100 pairs are a cheap addition. |
| **Exact boundary values** (username 4 vs 5 characters, password policy edges) | Only the "below the boundary" group is covered. The 4-vs-5 pair is a cheap API addition. |
| **Change-password flow, bulk delete, the other list filters, sorting and pagination** | Outside the task scenarios. They would go into an API-first regression suite. |
| **Brute-force lockout and rate limiting** | The test is **written but skipped**. Lockout is often applied per IP address, so running it on the shared public demo could block other testers behind the same IP. It already uses a throwaway account so Admin is never locked. The lockout policy is undocumented, so the threshold must be aligned with it before the test is enabled in a dedicated environment. |
| **Exact login length limits** (max / max+1) | The login fields have no `maxlength` and no limit is documented, so any boundary would be a guess. An oversized value was left out as well: the server rejects it like any other wrong credential, so it adds no new equivalence class. |
| **Session expiration** | The session lifetime cannot be configured on the demo, and waiting for a real timeout in a test is impractical. Deleting the cookie is not the same thing: that is the "no session" case, which is already covered. |
| **Exact 1 MB boundary** (largest file that is still accepted) | It is unclear whether "1MB" means 1 000 000 or 1 048 576 bytes, so the boundary would be a guess. The tests use a file that is clearly over both. |
| **Editing an attachment's description; uploads on other My Info screens** | Not part of the task scenario. The same API client and page component would cover them. |
| **One employee's attachments hidden from another ESS user** | Part of the role-permissions gap above. |
| **XSS and wider security testing** | Needs a dedicated security approach. The SQL-injection login case is only a smoke check. |
| **Cross-browser** | Chromium only, for speed. These flows contain no browser-specific behaviour. |

## 6. Data and stability principles

The full description is in the README. In short:

- **Every test owns its data.** Each test creates what it needs through the API, using unique generated names.
- **Cleanup runs even when a test fails**, through fixture teardown.
- **No test depends on shared records**, except the built-in `Admin` account. This is why attachments are tested on the test's own user, not on Admin's shared My Info. The demo environment is public and changes constantly.
- **No fixed sleeps.** Tests wait on web-first assertions or on specific network responses.
