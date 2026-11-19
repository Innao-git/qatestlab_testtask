export const API_PREFIX = '/web/index.php/api/v2';

export const endpoints = {
  auth: {
    loginPage: '/web/index.php/auth/login',
    validate: '/web/index.php/auth/validate',
    logout: '/web/index.php/auth/logout',
  },
  users: `${API_PREFIX}/admin/users`,
  user: (id: number) => `${API_PREFIX}/admin/users/${id}`,
  employees: `${API_PREFIX}/pim/employees`,
  /** Data behind the dashboard pie charts ("Employee Distribution by Sub Unit / by Location"). */
  jobTitles: `${API_PREFIX}/admin/job-titles`,
  vacancies: `${API_PREFIX}/recruitment/vacancies`,
  vacancy: (id: number) => `${API_PREFIX}/recruitment/vacancies/${id}`,
  employeeDistribution: (kind: 'subunit' | 'locations') => `${API_PREFIX}/dashboard/employees/${kind}`,
  /** Attachments of an employee's "Personal Details" screen (My Info → Attachments). */
  attachments: (empNumber: number) => `${API_PREFIX}/pim/employees/${empNumber}/screen/personal/attachments`,
  /** File download - a regular web route, not part of API v2. */
  attachmentFile: (empNumber: number, attachmentId: number) =>
    `/web/index.php/pim/viewAttachment/empNumber/${empNumber}/attachId/${attachmentId}`,
} as const;
