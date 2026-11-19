import { type APIRequestContext, test as base, expect } from '@playwright/test';
import { AttachmentApi } from '../api/AttachmentApi';
import { AuthApi } from '../api/AuthApi';
import { DashboardApi } from '../api/DashboardApi';
import { EmployeeApi } from '../api/EmployeeApi';
import { JobTitleApi } from '../api/JobTitleApi';
import { UserApi } from '../api/UserApi';
import { VacancyApi } from '../api/VacancyApi';
import { type Employee, type JobTitle, UserRoleId, type Vacancy } from '../api/types';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { LoginPage } from '../pages/LoginPage';
import { SystemUserFormPage } from '../pages/admin/SystemUserFormPage';
import { SystemUsersPage } from '../pages/admin/SystemUsersPage';
import { VacanciesPage } from '../pages/recruitment/VacanciesPage';
import { VacancyFormPage } from '../pages/recruitment/VacancyFormPage';
import { MyInfoPage } from '../pages/myInfo/MyInfoPage';
import { withApiLogging } from '../utils/apiLogger';
import { generateEmployeeName, generatePassword, generateUsername, uniqueSuffix } from '../utils/dataGenerator';
import { env } from '../utils/env';

interface Pages {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  usersPage: SystemUsersPage;
  userFormPage: SystemUserFormPage;
  myInfoPage: MyInfoPage;
  vacanciesPage: VacanciesPage;
  vacancyFormPage: VacancyFormPage;
}

interface WorkerFixtures {
  /**
   * API context authenticated as Admin via an API login (no browser involved).
   * - worker-scoped: one login per worker, shared by all its tests;
   * - lazy: created only if a test (or a fixture it uses) needs it, so e.g. pure login tests trigger no admin login;
   * - independent of the spec's `storageState`, so login specs running with a clean session can still create data.
   * Used for test data setup/teardown.
   */
  adminRequest: APIRequestContext;
}

interface Api {
  /** Bound to the test's own `request` context - the session under test. */
  authApi: AuthApi;
  userApi: UserApi;
  employeeApi: EmployeeApi;
  attachmentApi: AttachmentApi;
  /** Bound to adminRequest. */
  dashboardApi: DashboardApi;
  jobTitleApi: JobTitleApi;
  vacancyApi: VacancyApi;
}

export interface Credentials {
  username: string;
  password: string;
}

export type VacancyKey = 'V1' | 'V2' | 'V3';
export type JobTitleKey = 'A' | 'B';

/** The hiring manager as the UI shows it (list column, dropdown option). */
export interface HiringManager {
  empNumber: number;
  name: string;
}

export interface VacancySet {
  manager: HiringManager;
  titles: Record<JobTitleKey, JobTitle>;
  /** V1: title A, Active · V2: title A, Closed · V3: title B, Active */
  vacancies: Record<VacancyKey, Vacancy>;
}

export interface LoggedInUser {
  username: string;
  /** The employee record behind the user - what "My Info" opens. */
  empNumber: number;
}

interface TestData {
  /** A fresh employee created via API for this test and deleted afterwards. */
  employee: Employee;
  /** Register usernames created during a test; they are deleted via API in teardown (even if the test fails). */
  usersToCleanup: string[];
  /** Creates a system user with known credentials (cleaned up automatically) and returns them. */
  createLoginUser: (options?: { enabled?: boolean; role?: UserRoleId }) => Promise<Credentials>;
  /**
   * A fresh ESS user (own employee, cleaned up after the test) logged in to the BROWSER.
   * Logs in via API on `page.request`, which shares its cookie jar with the page - fast, and the UI
   * login itself is covered by login.spec.ts. Use with an empty `storageState` in the spec.
   */
  loggedInUser: LoggedInUser;
  /** The test's own employee as a hiring manager. */
  hiringManager: HiringManager;
  /** Two job titles with unique names, deleted after the test (after the vacancies that use them). */
  jobTitles: Record<JobTitleKey, JobTitle>;
  /** Register vacancy names created during a test; they are deleted via API in teardown (even if the test fails). */
  vacanciesToCleanup: string[];
  /**
   * Three vacancies owned by the test's own hiring manager. Filtering by that manager isolates exactly this set
   * from everything else on the shared demo.
   */
  vacancySet: VacancySet;
}

export const test = base.extend<Pages & Api & TestData, WorkerFixtures>({
  // Built-in `request` wrapped so every call is reported with full request/response (see apiLogger.ts).
  request: async ({ request }, use) => use(withApiLogging(request)),

  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  dashboardPage: async ({ page }, use) => use(new DashboardPage(page)),
  usersPage: async ({ page }, use) => use(new SystemUsersPage(page)),
  userFormPage: async ({ page }, use) => use(new SystemUserFormPage(page)),
  myInfoPage: async ({ page }, use) => use(new MyInfoPage(page)),
  vacanciesPage: async ({ page }, use) => use(new VacanciesPage(page)),
  vacancyFormPage: async ({ page }, use) => use(new VacancyFormPage(page)),

  adminRequest: [async ({ playwright }, use) => {
    // explicit empty storageState: newContext() would otherwise inherit the project's session
    const context = await playwright.request.newContext({ baseURL: env.baseUrl, storageState: { cookies: [], origins: [] } });
    const login = await new AuthApi(context).login(env.admin.username, env.admin.password);
    expect(login.headers()['location'], 'admin API login for test data setup failed - check ADMIN_* in .env').toMatch(/\/dashboard\/index$/);
    await use(withApiLogging(context));
    await context.dispose();
  }, { scope: 'worker' }],
  authApi: async ({ request }, use) => use(new AuthApi(request)),
  userApi: async ({ adminRequest }, use) => use(new UserApi(adminRequest)),
  employeeApi: async ({ adminRequest }, use) => use(new EmployeeApi(adminRequest)),
  attachmentApi: async ({ adminRequest }, use) => use(new AttachmentApi(adminRequest)),
  dashboardApi: async ({ adminRequest }, use) => use(new DashboardApi(adminRequest)),
  jobTitleApi: async ({ adminRequest }, use) => use(new JobTitleApi(adminRequest)),
  vacancyApi: async ({ adminRequest }, use) => use(new VacancyApi(adminRequest)),

  usersToCleanup: async ({ userApi }, use) => {
    const usernames: string[] = [];
    await use(usernames);
    await userApi.deleteByUsernames(usernames);
  },

  // Teardown order: Playwright tears a fixture down BEFORE the fixtures it depends on, so this teardown runs
  // before usersToCleanup's. Users linked to the employee are therefore deleted HERE, explicitly and first,
  // instead of relying on the server deleting them together with the employee. The list is then emptied,
  // so usersToCleanup's own teardown only handles users created without this employee.
  employee: async ({ employeeApi, userApi, usersToCleanup }, use) => {
    const employee = await employeeApi.create(generateEmployeeName());
    await use(employee);
    await userApi.deleteByUsernames(usersToCleanup.splice(0));
    await employeeApi.delete([employee.empNumber]);
  },

  createLoginUser: async ({ userApi, employee, usersToCleanup }, use) => {
    await use(async ({ enabled = true, role = UserRoleId.ESS } = {}) => {
      const credentials = { username: generateUsername('login'), password: generatePassword() };
      usersToCleanup.push(credentials.username);
      await userApi.create({ ...credentials, status: enabled, userRoleId: role, empNumber: employee.empNumber });
      return credentials;
    });
  },

  hiringManager: async ({ employee }, use) => {
    await use({ empNumber: employee.empNumber, name: `${employee.firstName} ${employee.lastName}` });
  },

  jobTitles: async ({ jobTitleApi }, use) => {
    const suffix = uniqueSuffix();
    const titles = { A: await jobTitleApi.create(`QA Auto Title A ${suffix}`), B: await jobTitleApi.create(`QA Auto Title B ${suffix}`) };
    await use(titles);
    await jobTitleApi.delete([titles.A.id, titles.B.id]);
  },

  // depends on jobTitles and employee so that vacancies are removed BEFORE the records they reference
  vacanciesToCleanup: async ({ vacancyApi, jobTitles: _t, employee: _e }, use) => {
    const names: string[] = [];
    await use(names);
    await vacancyApi.deleteByNames(names);
  },

  vacancySet: async ({ vacancyApi, hiringManager, jobTitles, vacanciesToCleanup }, use) => {
    const suffix = uniqueSuffix();
    const create = async (key: VacancyKey, title: JobTitleKey, active: boolean) => {
      const name = `QA Auto Vacancy ${key} ${suffix}`;
      vacanciesToCleanup.push(name);
      return vacancyApi.create({
        name, jobTitleId: jobTitles[title].id, employeeId: hiringManager.empNumber, numOfPositions: 1, description: '', status: active, isPublished: false,
      });
    };
    const vacancies = { V1: await create('V1', 'A', true), V2: await create('V2', 'A', false), V3: await create('V3', 'B', true) };
    await use({ manager: hiringManager, titles: jobTitles, vacancies });
  },

  loggedInUser: async ({ page, createLoginUser, employee }, use) => {
    const { username, password } = await createLoginUser();
    const login = await new AuthApi(withApiLogging(page.request)).login(username, password);
    expect(login.headers()['location'], `browser login as ${username} failed`).toMatch(/\/dashboard\/index$/);
    await use({ username, empNumber: employee.empNumber });
  },
});

export { expect } from '@playwright/test';
