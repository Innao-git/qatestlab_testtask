# OrangeHRM Test Automation (Playwright + TypeScript)

Automated **end-to-end (UI)** and **API** tests for the [OrangeHRM demo site](https://opensource-demo.orangehrmlive.com/).

**Scope.** The task asks for E2E tests, and every scenario in 2.1–2.5 is covered through the UI. The API tests are an **addition** and replace none of them:

- the API layer already powers **test data setup and cleanup**, so every test creates its own data and leaves nothing behind;
- API tests check **server-side rules that the UI cannot reach**, such as values a form never lets you submit, permissions (`401` / `403`), and response bodies. Two defects were found this way: the Vacancies API accepts a duplicate name and more than 99 positions, which the UI blocks. See [Known issues](#known-issues-found-defects).

The task recommended Cypress but allowed any JavaScript/TypeScript tool. I chose **Playwright** for these reasons:

- **One runner for UI and API.** UI and API tests share fixtures, the auth session and the data helpers.
- **Isolation and speed.** Parallel execution and browser-context isolation come built in.
- **Debugging.** The HTML report and trace viewer come with no plugins.
- **First-class TypeScript.** Typed API clients and page objects.

---

## Contents

- [Test coverage](#test-coverage)
- [Known issues (found defects)](#known-issues-found-defects)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the tests](#running-the-tests)
- [Reports and debugging](#reports-and-debugging)
- [Project structure](#project-structure)
- [Approach and design decisions](#approach-and-design-decisions)
- [Assumptions and limitations](#assumptions-and-limitations)
- [Suggestions for improvement](#suggestions-for-improvement)

---

## Test coverage

> [Methodology.md](Methodology.md) explains how checks are split between API and E2E, which test design techniques were used, and what is deliberately not covered.

| Area (task section)                      | E2E | API | Status       |
|------------------------------------------|:---:|:---:|--------------|
| 2.1 Login                                | ✅  | ✅  | Done         |
| 2.2 Admin → User Management → Users      | ✅  | ✅  | Done         |
| 2.3 My Info → Attachments                | ✅  | ✅  | Done         |
| 2.4 Dashboard data validation            | ✅  | ✅  | Done         |
| 2.5 Recruitment → Vacancies search       | ✅  | ✅  | Done         |

### Login: [tests/e2e/login.spec.ts](tests/e2e/login.spec.ts) and [tests/api/auth.api.spec.ts](tests/api/auth.api.spec.ts)

**E2E**

- Valid login redirects to the Dashboard. The user menu is visible and a session cookie is set.
- Invalid credentials show *"Invalid credentials"*. The UI runs one representative case (wrong password); the full matrix runs at API level.
- **Required fields**, data-driven with 2 rows: username empty, password empty. *"Required"* appears only under the empty field, and **no request is sent** to the server.
- Pressing **Enter** in the password field submits the form.
- **Double-clicking** Login sends exactly **one** login request and lands on the Dashboard without an error.
- A **disabled** user sees *"Account disabled"* and stays on the login page.
- The password input is masked.
- After logout, protected pages redirect back to login.
- Opening a protected page without a session redirects to login.

**API**

- A protected endpoint returns `401` without a session.
- Valid credentials return `302 → /dashboard`, and the session can then call the API.
- The username is case-insensitive: `ADMIN` logs in. This test is annotated **observed behaviour**: no requirement defines the rule, so the test documents current behaviour.
- **Invalid credentials matrix**, data-driven from [test-data/login.json](test-data/login.json) (7 cases):
  - wrong password; unknown user; password in the wrong case; password with a trailing space;
  - empty username, empty password (the server must reject them even though the UI validates first);
  - SQL-injection string.

  Every case must be handled gracefully: `302 → /auth/login` (no `5xx`), and the API stays closed (`401`). Neither the redirect nor the login page it leads to may leak server internals or echo the submitted password (see [Response body checks](#3-typed-api-layer-raw-and-convenience-methods)).
- **Logout invalidates the session on the server.** The test saves the session cookie, confirms it gets `200`, logs out, then replays the **same** cookie and expects `401`. The cookie is sent explicitly from a context with an empty cookie jar, both before and after logout. A `401` therefore proves the server destroyed the session; it cannot mean the cookie was simply not sent.
- **Disabled user cannot log in.** Besides the redirect and `401`, the test reads the reason the server renders on the login page and expects `user_disabled` / *"Account disabled"*. Without that, the test could not tell a disabled account from a wrong password.
- Login without the CSRF token does not create a session.
- **Brute force / rate limiting: written but skipped on purpose.** Lockout is often applied per IP address, so on the shared public demo the test could block other testers behind the same IP. It uses a throwaway account so Admin is never locked. The lockout policy is undocumented, so the threshold must be aligned with the real policy before the test is enabled in a dedicated environment. The reason is in the code and in the test's report annotation.

### User Management: [tests/e2e/user-management.spec.ts](tests/e2e/user-management.spec.ts) and [tests/api/users.api.spec.ts](tests/api/users.api.spec.ts)

**E2E**

- **Full lifecycle in one test**, split into `test.step`s:
  1. Add a user with a random, unique username.
  2. Verify the row shows the correct username, role, employee name and status.
  3. Edit the user to change the role (ESS → Admin) and the status (Enabled → Disabled).
  4. Verify the updated row.
  5. Delete the user and confirm *"No Records Found"*.
- **Data-driven** user creation for each role/status pair in [test-data/users.json](test-data/users.json).
- Form validation:
  - every required field shows *"Required"*;
  - an existing username shows *"Already exists"*;
  - mismatched passwords show *"Passwords do not match"*;
  - a username shorter than 5 characters is rejected;
  - **Cancel** creates nothing (checked through the API).

**API**

- **CRUD lifecycle**: `POST` → `GET /{id}` → `GET ?username=` → `PUT` (role/status) → `DELETE` → `GET` returns `404`. The test also checks that the password is never returned.
- **Data-driven** creation for each role/status pair.
- **Negative cases.** All of these return `422`, and the test asserts **which parameter** the server rejected:
  - duplicate username;
  - username that is too short;
  - unknown role id;
  - missing password;
  - non-boolean status;
  - non-existent employee.
- `GET` for a non-existent user returns `404`.
- A malformed JSON body gets a `4xx`, not a `5xx`.
- Every negative response is checked for leaks: no stack trace, SQL error, exception class or server path, and no echo of the submitted password.

### My Info → Attachments: [tests/e2e/my-info-attachments.spec.ts](tests/e2e/my-info-attachments.spec.ts) and [tests/api/attachments.api.spec.ts](tests/api/attachments.api.spec.ts)

Every E2E test runs as its **own fresh ESS user** with its own employee record (the `loggedInUser` fixture), not as the demo `Admin`. Admin's My Info is a single record shared by everyone on the public demo and already holds other people's files, so "exactly one row" or *"No Records Found"* could not be asserted there. Each test file is generated with a unique name and unique content.

**E2E**

- **Full lifecycle in one test**, split into `test.step`s:
  1. Upload a file with a description and get *"Successfully Saved"*.
  2. Verify the row: file name, description, size, type, and *Added By* (the logged-in user).
  3. Download it and check that the file name matches and the content is **byte-for-byte** the uploaded file.
  4. Delete it, get *"Successfully Deleted"* and see *"No Records Found"*. The test then confirms through the API that the file is gone on the server too.
- A file over 1 MB shows *"Attachment Size Exceeded"*. No upload request is sent, and nothing is saved.
- Saving without a file shows *"Required"*. No upload request is sent, and nothing is saved.

**API** (on a fresh employee)

- **Lifecycle**: `POST` (file sent as base64) → `GET` list → download → `DELETE` → list is empty and the file can no longer be downloaded. The download check covers the `Content-Disposition` file name, the `Content-Type` and the exact bytes.
- **Data-driven** file types from [test-data/attachments.json](test-data/attachments.json): `txt`, `png`, `pdf`. Each keeps its MIME type, and the downloaded bytes match the upload.
- **Negative cases**, all checked for leaks:
  - a file over 1 MB returns `422` for the `attachment` parameter, and nothing is saved;
  - an upload without a file returns `422`;
  - downloading a non-existent attachment returns a `4xx`, not a `5xx`.

### Dashboard: [tests/e2e/dashboard.spec.ts](tests/e2e/dashboard.spec.ts) and [tests/api/dashboard.api.spec.ts](tests/api/dashboard.api.spec.ts)

The two chart widgets under test are the pie charts **Employee Distribution by Sub Unit** and **Employee Distribution by Location**. Both are listed in [test-data/dashboard-charts.json](test-data/dashboard-charts.json), and every chart test runs for each of them.

The numbers on the shared demo change all the time, so **no value is hard-coded**. A chart test captures the API response the page itself received and checks that the chart shows exactly that. The chart is drawn on a `<canvas>`, so its values are read from what the user reads: the HTML **legend** and the HTML **hover tooltip**.

**E2E**

- The dashboard is reached through its **side-menu item** (starting from another module, since login already lands on the Dashboard). It shows exactly the expected 7 widgets, and both charts are painted (the canvas is not blank). The other dashboard tests open the page by URL, because they test the charts, not the navigation.
- **Each chart shows exactly the data it received**:
  - the legend lists every group in data order, plus *"Other"* / *"Unassigned"* when their counts are above 0;
  - the test moves the mouse around the pie and checks every tooltip it sees, such as *"Engineering 3 (1.65%)"*. Each label, count and percentage must match the data, and the biggest slice must be found.
- Clicking a legend item strikes it through (the slice is hidden), and a second click restores it.
- **Negative assertions:**
  - **Stubbed data** (`page.route()`): with 2 groups and no unassigned or other employees, the legend shows exactly those 2 groups. *"Unassigned"* and *"Other"* are not shown, and no *"undefined"*, *"NaN"* or *"null"* appears. Live data always has unassigned employees, so this case can only be reached with a stub.
  - **An ESS user** sees only the 5 personal widgets. Neither distribution chart is shown.

**API** (for each chart endpoint)

- **Contract**: `200`; every group has an id, a non-empty name and a positive integer count; names are unique; `meta.otherEmployeeCount` and `meta.unassignedEmployeeCount` are integers ≥ 0.
- An ESS user gets `403`, not the data.
- No session returns `401`.

### Recruitment → Vacancies: [tests/e2e/vacancies.spec.ts](tests/e2e/vacancies.spec.ts) and [tests/api/vacancies.api.spec.ts](tests/api/vacancies.api.spec.ts)

Vacancies on the demo are created and deleted by other people all the time, so each test builds **its own isolated data set** (the `vacancySet` fixture): its own employee as hiring manager, two job titles with unique names (A, B) and three vacancies:

| Vacancy | Job Title | Status |
|---------|-----------|--------|
| V1      | A         | Active |
| V2      | A         | Closed |
| V3      | B         | Active |

Every search also filters by the test's own hiring manager, which narrows the result to exactly this set. A search can then be checked for the **exact** expected rows: what matches is listed with the right details, and what does not match is **not** listed.

**Search matrix**, [test-data/vacancy-search.json](test-data/vacancy-search.json): hiring manager only → V1, V2, V3 · status Active → V1, V3 · job title A → V1, V2 · job title A + Active → V1 · vacancy V3 → V3 · job title B + Closed → nothing.

**E2E**

- **Search with filters**: the rows flagged `"ui": true` (one filter, combined filters, no match). The list must equal the expected rows exactly. *"No match"* shows *"No Records Found"*, the info toast and an empty table.
- **Reset** returns every filter to *"-- Select --"*, sends an unfiltered request and lists more than the filtered rows again.
- **Full lifecycle in one test**, split into `test.step`s:
  1. Add a vacancy (name, job title, description, hiring manager, number of positions, Active).
  2. Verify the row in the list.
  3. Edit it: change the job title and close it.
  4. Verify the updated row.
  5. Delete it, and confirm through the API that it is gone.
- Form validation:
  - required fields show *"Required"*;
  - *Number of Positions* rejects `abc` and `100`;
  - an existing name shows *"Already exists"*, and no duplicate is created.

**API**

- **The whole search matrix**: exact ids and `meta.total`.
- **CRUD lifecycle**: `POST` → `GET /{id}` → `PUT` (job title, status) → `DELETE` → `GET` returns `404`.
- **Negative cases**, all checked for leaks:
  - create without a name returns `422`;
  - search with a non-boolean `status` or a non-numeric `hiringManagerId` returns `422`;
  - search by a non-existent job title returns an empty list.
- **Known issues** (marked `test.fail()`, see [Known issues](#known-issues-found-defects)): the server accepts a **duplicate vacancy name** and **`numOfPositions` = 100**, although the UI blocks both.

---

## Known issues (found defects)

The API tests found two defects. The UI blocks these values, but the server accepts them, so the rule can be bypassed by calling the API directly.

| ID | Defect | Steps to reproduce | Expected | Actual |
|----|--------|--------------------|----------|--------|
| **KI-1** | The vacancy name is not unique on the server | `POST /api/v2/recruitment/vacancies` with the `name` of an existing vacancy | `422`, `invalidParamKeys: ["name"]`, like the UI's *"Already exists"* | `200`. A second vacancy with the same name is created. |
| **KI-2** | *Number of Positions* is not limited on the server | `POST /api/v2/recruitment/vacancies` with `numOfPositions: 100` | `422`, like the UI's *"Should be a number between 1-99"* | `200`. The vacancy is saved with 100 positions. |

**How they are tracked in the tests.** Each defect has an API test that asserts the **correct** behaviour. The test is named with a `[KNOWN ISSUE]` prefix and marked [`test.fail()`](https://playwright.dev/docs/api/class-test#test-fail), which is Playwright's "expected failure" (like `xfail(strict=True)` in pytest):

- **While the defect exists,** the test fails as expected and the run stays green. Genuinely new failures do not get lost among known ones.
- **Once the server is fixed,** the test passes and Playwright reports it **red** (*"expected to fail, but passed"*). That is the signal to remove `test.fail()` and the prefix.
- **In the report,** the `[KNOWN ISSUE]` prefix is visible even in the console list. The test also carries a `known issue` annotation with the details, and a `bug` annotation. On a real project, the `bug` annotation would link the bug ticket. Defects of the public demo cannot be filed, so it points here.

```bash
npx playwright test -g "KNOWN ISSUE"     # run only the known-issue tests
```

---

## Prerequisites

- **Node.js** 20 or newer (developed on Node 22)
- **npm** 9 or newer
- Internet access to `https://opensource-demo.orangehrmlive.com`

## Setup

```bash
git clone <repo-url>
cd qatestlab

npm install
npx playwright install chromium   # add --with-deps on Linux CI

cp .env.example .env              # then fill in the values
```

`.env` holds all environment-specific and sensitive data. It is git-ignored.

```dotenv
BASE_URL=https://opensource-demo.orangehrmlive.com
ADMIN_USERNAME=Admin
ADMIN_PASSWORD=admin123
```

If a variable is missing, the run stops immediately with a clear error ([src/utils/env.ts](src/utils/env.ts)).

## Running the tests

| Command                | What it does                                     |
|------------------------|--------------------------------------------------|
| `npm test`             | Runs everything: API, plus E2E after the UI login setup |
| `npm run test:api`     | Runs only the API tests                          |
| `npm run test:e2e`     | Runs only the E2E tests (headless Chromium)      |
| `npm run test:headed`  | Runs the E2E tests in a visible browser          |
| `npm run test:ui`      | Opens Playwright UI mode (interactive runner)    |
| `npm run report`       | Opens the last HTML report                       |
| `npm run test:smoke`   | Runs only the `@smoke` tests (API + E2E)         |
| `npm run test:smoke:api` / `test:smoke:e2e` | Runs the `@smoke` tests of one level |
| `npm run typecheck`    | Runs the TypeScript type check                   |

Useful filters:

```bash
npx playwright test tests/e2e/login.spec.ts          # one file
npx playwright test -g "full CRUD"                   # by test title
npx playwright test --project=e2e --debug            # step-by-step debugging
```

**Why an E2E run starts with an Admin login.** The `e2e` project depends on `setup` ([tests/auth.setup.ts](tests/auth.setup.ts)). Before any E2E test, `setup` logs in as Admin through the UI **once** and saves the session to `.auth/admin.json`. Every E2E test then starts already logged in. Playwright runs `setup` even when you run a single E2E test, because the dependency belongs to the whole project, not to individual files.

The login tests do not use that session. [login.spec.ts](tests/e2e/login.spec.ts) resets it with an empty `storageState`, so every login test starts from a clean, logged-out browser. To debug only the login tests without the extra Admin login, skip the dependency:

```bash
npx playwright test tests/e2e/login.spec.ts --no-deps
```

Use `--no-deps` only for `login.spec.ts`. The other E2E specs need the saved Admin session. Without it they start logged out, or with an old `.auth/admin.json` from an earlier run.

### Tags

| Tag | Meaning |
|-----|---------|
| `@smoke` | A handful of critical-path tests: valid login and the main lifecycle of each module, at both levels. A quick "is the system alive" check before a full run. |
| `@auth`, `@users`, `@attachments`, `@dashboard`, `@recruitment` | Module tags. A module's tests live in both `tests/api/` and `tests/e2e/`, so a tag runs **both levels of one module** in a single command. |

Tags combine with projects:

```bash
npx playwright test --grep @users                   # one module, API + E2E
npx playwright test --project=e2e --grep @smoke     # smoke, E2E only
```

There are deliberately no `@api` / `@e2e` tags. The test level is defined by the folder and the Playwright project (`--project=api|e2e`), which also carry level-specific settings. A tag would only duplicate that information and could drift out of sync with it.

## Reports and debugging

- **HTML report** is written to `playwright-report/`. Open it with `npm run report`. Tests that use `test.step` show each step separately.
- On failure, Playwright keeps a **trace**, a **screenshot** and a **video** in `test-results/`. Open a trace with `npx playwright show-trace <path-to-trace.zip>`.
- **Every API request is in the report.** See [Inspecting API requests](#inspecting-api-requests) below.
- Locally, a failed test is retried once. On CI (`CI=true`) it is retried twice, and `test.only` fails the build.

### Inspecting API requests

Every request made through an API context, whether from an API client, a test body or a fixture, is reported in full. Nothing in the tests has to be changed.

- **In the HTML report** (`npm run report`), each request appears as a step such as `POST /web/index.php/api/v2/admin/users`, nested under the `test.step` it belongs to. An attachment such as `POST … → 422` holds the full exchange:
  - method, URL, status and response time;
  - request headers, query params and body (JSON or form);
  - the cookies taken from the context's cookie jar, which Playwright attaches automatically. OrangeHRM authenticates with the session cookie `orangehrm` (no token), so this line shows which session sent the request, or `(none)` for an unauthenticated one;
  - response headers and body (JSON pretty-printed; large bodies truncated at 20,000 characters).

  Requests made by setup and teardown fixtures (for example creating and deleting the test employee) are attached as well.
- **In the console**, set `API_LOG=1` for quick debugging without opening the report:

  ```bash
  API_LOG=1 npx playwright test -g "duplicate username" --project=api
  ```

**Secrets are masked** before anything is written:

- passwords and CSRF tokens in request and response bodies;
- the CSRF token embedded in the login page HTML;
- `Cookie` and `Authorization` header values, and the values of cookies from the jar;
- the value of each `Set-Cookie`. Cookie attributes such as `path` or `HttpOnly` stay visible.

Reports can therefore be shared, for example as CI artifacts.

**Showing the session when debugging.** Set `API_LOG_SHOW_SESSION=1` to see the real value of the `orangehrm` session cookie in `Cookie`, `Set-Cookie` and the jar line. This helps, for example, to see that login issued a new session id, or to replay a request by hand in curl or Postman. Passwords and CSRF tokens stay masked. A warning is printed when the flag is on.

```bash
API_LOG=1 API_LOG_SHOW_SESSION=1 npx playwright test -g "logout invalidates" --project=api
```

Never enable it in CI or anywhere reports are shared: the report would contain a live session.

This works through [src/utils/apiLogger.ts](src/utils/apiLogger.ts), which wraps the `APIRequestContext` in a proxy. The fixtures apply it to the built-in `request` and to `adminRequest`. A context created by hand in a test is wrapped with `withApiLogging(...)`.

---

## Project structure

```
.
├── playwright.config.ts        # projects: api (standalone), setup → e2e; reporters, retries, artifacts
├── .env.example                # template for environment variables
├── src/
│   ├── api/                    # typed API layer
│   │   ├── endpoints.ts        # all URLs in one place
│   │   ├── types.ts            # response/payload types, UserRoleId enum
│   │   ├── AuthApi.ts          # form login with CSRF token
│   │   ├── UserApi.ts          # /admin/users CRUD
│   │   ├── EmployeeApi.ts      # /pim/employees (test data setup)
│   │   ├── AttachmentApi.ts    # employee attachments: upload (base64), list, download, delete
│   │   ├── DashboardApi.ts     # employee-distribution chart data; maps it to the expected slices and tooltips
│   │   ├── JobTitleApi.ts      # job titles (test data setup)
│   │   └── VacancyApi.ts       # vacancies CRUD and search
│   ├── pages/                  # Page Object Model
│   │   ├── components/         # reusable UI building blocks
│   │   │   ├── FormField.ts    # field by label: input / select / autocomplete / errors
│   │   │   ├── SideMenu.ts     # left main menu
│   │   │   ├── TopBar.ts       # top nav, page header, logout
│   │   │   └── Toast.ts        # success/error notifications
│   │   ├── BasePage.ts         # gives every page sideMenu, topBar, toast
│   │   ├── LoginPage.ts
│   │   ├── dashboard/
│   │   │   ├── DashboardPage.ts       # widgets by title
│   │   │   └── ChartWidget.ts         # pie chart: canvas painted, legend, tooltips (mouse sweep)
│   │   ├── admin/
│   │   │   ├── SystemUsersPage.ts     # users list, search, row actions
│   │   │   └── SystemUserFormPage.ts  # Add / Edit user form
│   │   ├── myInfo/
│   │   │   ├── MyInfoPage.ts          # My Info of the logged-in user
│   │   │   └── AttachmentsSection.ts  # add form, attachments table, download, delete
│   │   └── recruitment/
│   │       ├── VacanciesPage.ts       # search filters, Search / Reset, vacancies list, row actions
│   │       └── VacancyFormPage.ts     # Add / Edit vacancy form
│   ├── fixtures/index.ts       # custom `test`: page objects, API clients, test data + cleanup
│   └── utils/
│       ├── env.ts              # validated access to .env
│       ├── dataGenerator.ts    # unique usernames, valid passwords, employee names (faker)
│       ├── testFiles.ts        # unique test files (txt/png/pdf, or an exact size) in the test's output folder
│       ├── vacancySearch.ts    # turns a search-matrix row into UI filters, API params and expected rows
│       ├── assertions.ts       # expectNoServerInternals(): response body leak check
│       └── apiLogger.ts        # reports every API request/response (masked) as a step + attachment
├── test-data/                  # data-driven inputs (JSON)
│   ├── login.json
│   ├── users.json
│   ├── attachments.json
│   ├── dashboard-charts.json
│   └── vacancy-search.json
└── tests/
    ├── auth.setup.ts           # E2E only: logs in once through the UI, saves the session
    ├── api/                    # API specs
    └── e2e/                    # UI specs
```

---

## Approach and design decisions

### 1. Log in once, reuse the session, with each level logging in its own way

- **E2E.** `tests/auth.setup.ts` logs in **through the UI** once and stores the session in `.auth/admin.json`. The `e2e` project depends on `setup`, so every browser test starts already authenticated. This makes the tests faster and keeps the login screen out of unrelated tests.
- **API.** The `api` project does **not** depend on `setup`. When a test needs Admin for its test data, the `adminRequest` fixture logs in **through the API**. It does this once per worker, and only if a test actually asks for it. Pure login tests, such as the case-sensitivity test, trigger no admin login at all. As a result, the API suite starts no browser, and a broken login *page* cannot fail API tests that have nothing to do with it.

The login specs override the session with an empty `storageState`, so they always start unauthenticated.

### 2. Page Object Model with reusable components

OrangeHRM renders every field as a custom `.oxd-input-group` whose `<label>` is **not** linked to its control, so `getByLabel()` does not work. Dropdowns and autocompletes are custom widgets, not `<select>` elements.

[`FormField`](src/pages/components/FormField.ts) handles all of this in one place. A page object declares `new FormField(form, 'User Role')` and calls `.select('Admin')`, `.autocomplete(name)`, `.fill()` or `.expectError('Required')`. The label is matched exactly, so `Password` never matches `Confirm Password`.

The rest of the locator strategy:

- prefer **role/text locators** (`getByRole('button', { name: 'Save' })`);
- fall back to stable `oxd-*` component classes only where no accessible name exists, such as table rows and icon buttons.

### 3. Typed API layer: raw and convenience methods

Each API client exposes two kinds of method:

- **`*Raw()` methods** return the untouched `APIResponse`. Tests use them to assert status codes and error bodies.
- **Convenience methods** (`create()`, `findByUsername()`, `deleteByUsernames()`) assert success and return typed data. Setup and teardown use them.

**Response body checks.** [`expectNoServerInternals()`](src/utils/assertions.ts) checks a response body for stack traces, PHP errors, exception class names, SQL errors and server paths. It can also check that the body does not echo a sensitive value such as the submitted password. It uses soft assertions, so one run reports every leak it finds. The patterns are deliberately specific (`SomethingException`, not the bare word "exception") so that normal HTML and JS do not trigger false alarms.

**Why a login was rejected.** After a failed login, the server only sends `302 → /auth/login`, which looks the same for every failure. The reason is rendered into the login page. `AuthApi.getLoginError()` reads it (for example `user_disabled`), so a test can assert the cause of the rejection, not just that a redirect happened.

### 4. Isolated test data, cleaned up automatically

The demo site is **public and shared**: other people change and delete data at any time. Each test therefore creates exactly what it needs and removes it afterwards. Custom fixtures in [src/fixtures/index.ts](src/fixtures/index.ts) do this:

- **`employee`** creates a fresh employee with a unique last name through the API, and deletes it after the test. The UI tests never depend on existing employees, and the autocomplete always resolves to exactly one match.
- **`usersToCleanup`** collects every username a test generates. In teardown, the fixture finds those users through the API and deletes them. This **also runs when the test fails**, so repeated runs leave no data behind.

  Users are deleted **before** their employee, explicitly. Playwright tears a fixture down before the fixtures it depends on, so the `employee` fixture deletes the registered users itself and then the employee. The test does not rely on the server deleting users together with their employee.
- **`createLoginUser({ enabled, role })`** creates a user with known, generated credentials, for example a disabled user for login tests. Cleanup happens automatically.
- **`loggedInUser`** creates a fresh **ESS** user (with its own employee) and logs it in to the **browser**. The login goes through the API on `page.request`, which shares its cookie jar with the page. This is fast, and the UI login is already covered by the login tests. My Info then opens this user's own, empty record.
- **`vacancySet`** creates two job titles and three vacancies owned by the test's own hiring manager (see the *Recruitment → Vacancies* test section above). **`vacanciesToCleanup`** deletes them, and any vacancy a test creates through the UI, by name in teardown. Vacancies are deleted **before** the job titles and the employee they reference.
- **`adminRequest`** is an API context that is **always** authenticated as Admin, through an API login that is worker-scoped and lazy (see section 1). All setup and teardown go through it. Login specs run with a clean session, and this way they can still create their own test users.

  `playwright.request.newContext()` inherits the project's `storageState`. Any context that must be anonymous therefore passes an empty `storageState` explicitly.

Setup goes through the API because it is fast and reliable. The behaviour under test always goes through the UI.

### 5. Dynamic and data-driven data

- Usernames are built as `prefix_<timestamp base36><4 random chars>`, which is unique across parallel workers and repeated runs.
- Passwords are generated to satisfy the OrangeHRM password policy.
- Test files are generated per test in Playwright's per-test output folder: a unique name, and unique content for text files. A downloaded file is compared with the exact bytes that were uploaded.
- Role/status combinations, invalid login credentials, attachment file types, the dashboard charts and the vacancy search matrix live in JSON under `test-data/`. Adding a case means adding a line of JSON.

### 6. Readable, deterministic tests

- Multi-step scenarios use `test.step`, so the report reads like a test case.
- There are no hard waits. Tests rely on web-first assertions and wait for specific network responses, such as the users search request. For example, the Edit form fills itself asynchronously, so `expectLoaded('Edit')` waits until the username field is populated.
- A list row is read into a `{username, role, employeeName, status}` object and compared with **one** `toEqual`, so a mismatch in any column is reported clearly.

---

## Assumptions and limitations

- **Shared public environment.** Data on the demo site is reset periodically and changed by other users. Tests never depend on pre-existing records, except the built-in `Admin` account. Even so, outages or slow responses on the demo server can cause occasional failures, which is why retries are enabled.
- **Credentials.** The default credentials are public demo credentials. They are still kept out of the source and read from `.env`.
- **The user list has no stable ids.** Table rows are found by the username cell. Columns are read by position (`Username, User Role, Employee Name, Status`), which is documented in `SystemUsersPage.getRowData()`.
- **Undocumented API behaviour.** `PUT /admin/users/{id}` returns `422` unless `changePassword: false` **and** `password: ""` are both sent. The API client follows this behaviour.
- **Attachments.** Downloading a missing attachment returns `400`, not `404`. No code is specified, so the tests accept any `4xx`. The demo shows *Date Added* in an unusual `yyyy-dd-mm` format, so the date column is not asserted. Attachments created by the data-driven API tests are not deleted one by one: they belong to the test's own employee, which is deleted in teardown.
- **Dashboard charts.** The pies are drawn on a `<canvas>`, so values are checked through the legend and the hover tooltips. The tooltip check sweeps the mouse around the pie instead of aiming at a computed angle, so it does not depend on where the chart starts drawing. Very small slices (1–2 %) can be missed by the sweep, so the test checks every tooltip it sees and requires the biggest slice.
- **Vacancies.** After a new vacancy is saved, the app immediately reloads into the Edit page and the success toast disappears with the reload. The test therefore checks the server response and the Edit page, not the toast. In the *Vacancy* filter, closed vacancies are listed as *"&lt;name&gt; (Closed)"*.
- **Known issues.** Two Vacancies rules are validated only in the UI. See [Known issues (found defects)](#known-issues-found-defects).
- **Browser coverage.** Only Chromium is configured, to keep runs fast. Other browsers can be added as extra projects in `playwright.config.ts`.
- **Admin sessions are shared.** The E2E browser tests share one UI session, and the API tests share one session per worker. The server accepts several concurrent Admin sessions, but tests must not change the Admin account itself.

## Suggestions for improvement

- **CI pipeline** (GitHub Actions): run on push and PR, upload the HTML report and traces as artifacts, and run nightly to catch changes on the demo site.
- **Allure report**, for history and trends across runs.
- **JSON-schema validation** of API responses (for example with `ajv`), on top of the field-level assertions.
- **Cross-browser projects** (Firefox, WebKit), run on a schedule rather than on every commit.
- **Linting and formatting** (ESLint + Prettier) with a pre-commit hook.
- **Ask for `data-testid` attributes.** On a real project, adding them to the app would remove the remaining dependency on CSS classes.
