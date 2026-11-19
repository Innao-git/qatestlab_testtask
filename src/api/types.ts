export enum UserRoleId {
  Admin = 1,
  ESS = 2,
}

export type UserRoleName = keyof typeof UserRoleId;
export type UserStatusName = 'Enabled' | 'Disabled';

export interface Employee {
  empNumber: number;
  firstName: string;
  middleName: string;
  lastName: string;
  employeeId: string | null;
  terminationId: number | null;
}

export interface SystemUser {
  id: number;
  userName: string;
  deleted: boolean;
  status: boolean;
  employee: Employee;
  userRole: { id: UserRoleId; name: UserRoleName; displayName: string };
}

export interface ApiResponse<T, M = unknown> {
  data: T;
  meta: M;
  rels: unknown[];
}

export interface ApiError {
  error: { status: string; message: string; data?: { invalidParamKeys?: string[] } };
}

export interface CreateUserPayload {
  username: string;
  password: string;
  status: boolean;
  userRoleId: UserRoleId;
  empNumber: number;
}

export interface UpdateUserPayload {
  username: string;
  status: boolean;
  userRoleId: UserRoleId;
  empNumber: number;
  changePassword: boolean;
  password: string;
}

export interface Attachment {
  id: number;
  filename: string;
  description: string | null;
  size: number;
  fileType: string;
  attachedBy: number;
  attachedByName: string;
  attachedTime: string;
  attachedDate: string;
}

/** The API takes the file inline, base64-encoded. */
export interface AttachmentPayload {
  description?: string;
  attachment?: { name: string; type: string; size: number; base64: string };
}

export type DistributionKind = 'subunit' | 'locations';

/** One group of an employee-distribution chart, e.g. `{ subunit: { id, name }, count }`. */
export type DistributionItem = { count: number } & Record<string, { id: number; name: string } | number>;

export interface DistributionMeta {
  otherEmployeeCount: number;
  unassignedEmployeeCount: number;
}

/** One slice of a pie chart as the user sees it: legend label and tooltip value. */
export interface ChartSlice {
  label: string;
  count: number;
}

export interface JobTitle {
  id: number;
  title: string;
}

export interface Vacancy {
  id: number;
  name: string;
  description: string;
  numOfPositions: number | null;
  /** true = Active, false = Closed */
  status: boolean;
  isPublished: boolean;
  jobTitle: { id: number; title: string; isDeleted: boolean };
  hiringManager: { id: number; firstName: string; middleName: string; lastName: string; terminationId: number | null };
}

export interface VacancyPayload {
  name?: string;
  jobTitleId?: number;
  /** empNumber of the hiring manager */
  employeeId?: number;
  numOfPositions?: number | null;
  description?: string;
  status?: boolean;
  isPublished?: boolean;
}

/** Query parameters of the Vacancies search (the four filters on the page). */
export interface VacancySearchParams {
  jobTitleId?: number;
  vacancyId?: number;
  hiringManagerId?: number | string;
  status?: boolean | string;
}
