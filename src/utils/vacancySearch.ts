import type { JobTitleKey, VacancyKey, VacancySet } from '../fixtures';
import type { VacancySearchParams } from '../api/types';
import { type VacancyFilters, type VacancyRowData, vacancyOption } from '../pages/recruitment/VacanciesPage';
import searchCases from '../../test-data/vacancy-search.json';

/**
 * One row of test-data/vacancy-search.json. Filters refer to the test's own data by key
 * (job title "A", vacancy "V3"), because the real names are generated per test.
 */
export interface VacancySearchCase {
  case: string;
  filters: { jobTitle?: JobTitleKey; vacancy?: VacancyKey; status?: 'Active' | 'Closed' };
  expected: VacancyKey[];
  ui?: boolean;
  smoke?: boolean;
}

export const vacancySearchCases = searchCases as VacancySearchCase[];

/** The case as the user would type it in the UI. The hiring manager is always set: it isolates the test's data. */
export function toUiFilters({ filters }: VacancySearchCase, set: VacancySet): VacancyFilters {
  return {
    hiringManager: set.manager.name,
    jobTitle: filters.jobTitle && set.titles[filters.jobTitle].title,
    vacancy: filters.vacancy && vacancyOption(set.vacancies[filters.vacancy].name, set.vacancies[filters.vacancy].status),
    status: filters.status,
  };
}

/** The case as query parameters of the search request. */
export function toApiParams({ filters }: VacancySearchCase, set: VacancySet): VacancySearchParams {
  return {
    hiringManagerId: set.manager.empNumber,
    jobTitleId: filters.jobTitle && set.titles[filters.jobTitle].id,
    vacancyId: filters.vacancy && set.vacancies[filters.vacancy].id,
    status: filters.status && filters.status === 'Active',
  };
}

/** How the expected vacancies must look in the list, sorted by name like the page sorts them. */
export function expectedRows({ expected }: VacancySearchCase, set: VacancySet): VacancyRowData[] {
  return expected
    .map((key) => set.vacancies[key])
    .map((v) => ({ vacancy: v.name, jobTitle: v.jobTitle.title, hiringManager: set.manager.name, status: v.status ? 'Active' : 'Closed' } as const))
    .sort((a, b) => a.vacancy.localeCompare(b.vacancy));
}
