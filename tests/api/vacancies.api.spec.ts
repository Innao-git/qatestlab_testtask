import { test, expect } from '../../src/fixtures';
import type { ApiError, ApiResponse, Vacancy } from '../../src/api/types';
import { expectNoServerInternals } from '../../src/utils/assertions';
import { uniqueSuffix } from '../../src/utils/dataGenerator';
import { toApiParams, vacancySearchCases } from '../../src/utils/vacancySearch';

test.describe('API: Recruitment → Vacancies', { tag: '@recruitment' }, () => {
  test.describe('search', () => {
    // Same matrix as the UI (test-data/vacancy-search.json), all rows. The hiring manager filter is always set,
    // so the result is exactly the test's own vacancies.
    for (const searchCase of vacancySearchCases) {
      test(`search by ${searchCase.case}`, async ({ vacancySet, vacancyApi }) => {
        const res = await vacancyApi.searchRaw(toApiParams(searchCase, vacancySet));

        expect(res.status()).toBe(200);
        const body = (await res.json()) as ApiResponse<Vacancy[], { total: number }>;
        const expectedIds = searchCase.expected.map((key) => vacancySet.vacancies[key].id);
        expect(body.data.map((v) => v.id).sort()).toEqual(expectedIds.sort());
        expect(body.meta.total).toBe(expectedIds.length);
      });
    }
  });

  test('full CRUD lifecycle of a vacancy', { tag: '@smoke' }, async ({ vacancyApi, jobTitles, hiringManager, vacanciesToCleanup }) => {
    const name = `QA Auto Vacancy API ${uniqueSuffix()}`;
    vacanciesToCleanup.push(name);
    const payload = {
      name, jobTitleId: jobTitles.A.id, employeeId: hiringManager.empNumber, numOfPositions: 2, description: 'API autotest', status: true, isPublished: false,
    };
    let vacancy!: Vacancy;

    await test.step('POST creates a vacancy', async () => {
      const res = await vacancyApi.createRaw(payload);
      expect(res.status()).toBe(200);
      vacancy = ((await res.json()) as ApiResponse<Vacancy>).data;
      expect(vacancy).toMatchObject({
        name,
        description: 'API autotest',
        numOfPositions: 2,
        status: true,
        isPublished: false,
        jobTitle: { id: jobTitles.A.id, title: jobTitles.A.title },
        hiringManager: { id: hiringManager.empNumber },
      });
      expect(vacancy.id).toEqual(expect.any(Number));
    });

    await test.step('GET by id returns the same vacancy', async () => {
      const res = await vacancyApi.getRaw(vacancy.id);
      expect(res.status()).toBe(200);
      expect(((await res.json()) as ApiResponse<Vacancy>).data).toEqual(vacancy);
    });

    await test.step('PUT changes the job title and closes the vacancy', async () => {
      const res = await vacancyApi.updateRaw(vacancy.id, { ...payload, jobTitleId: jobTitles.B.id, status: false });
      expect(res.status()).toBe(200);
      const updated = ((await res.json()) as ApiResponse<Vacancy>).data;
      expect(updated).toMatchObject({ id: vacancy.id, name, status: false, jobTitle: { id: jobTitles.B.id } });

      const fetched = ((await (await vacancyApi.getRaw(vacancy.id)).json()) as ApiResponse<Vacancy>).data;
      expect(fetched).toEqual(updated);
    });

    await test.step('DELETE removes the vacancy', async () => {
      const res = await vacancyApi.deleteRaw([vacancy.id]);
      expect(res.status()).toBe(200);
      expect(((await res.json()) as ApiResponse<string[]>).data).toEqual([String(vacancy.id)]);

      expect((await vacancyApi.getRaw(vacancy.id)).status()).toBe(404);
      expect(await vacancyApi.findByName(name)).toEqual([]);
    });
  });

  // Every negative case also checks the error body leaks no server internals.
  test.describe('negative', () => {
    test('create without a name is rejected with 422', async ({ vacancyApi, jobTitles, hiringManager }) => {
      const res = await vacancyApi.createRaw({ jobTitleId: jobTitles.A.id, employeeId: hiringManager.empNumber, status: true, isPublished: false });

      expect(res.status()).toBe(422);
      expect(((await res.json()) as ApiError).error.data?.invalidParamKeys).toContain('name');
      await expectNoServerInternals(res);
    });

    const invalidSearchParams = [
      { case: 'status is not a boolean', params: { status: 'maybe' }, key: 'status' },
      { case: 'hiring manager id is not a number', params: { hiringManagerId: 'abc' }, key: 'hiringManagerId' },
    ];
    for (const { case: caseName, params, key } of invalidSearchParams) {
      test(`search is rejected with 422: ${caseName}`, async ({ vacancyApi }) => {
        const res = await vacancyApi.searchRaw(params);

        expect(res.status()).toBe(422);
        expect(((await res.json()) as ApiError).error.data?.invalidParamKeys).toContain(key);
        await expectNoServerInternals(res);
      });
    }

    test('search by a non-existent job title returns an empty list', async ({ vacancyApi }) => {
      const res = await vacancyApi.searchRaw({ jobTitleId: 99999999 });

      expect(res.status()).toBe(200);
      expect(((await res.json()) as ApiResponse<Vacancy[], { total: number }>).meta.total).toBe(0);
      await expectNoServerInternals(res);
    });

    // KNOWN ISSUES (README → "Known issues"): the UI blocks these, but the server accepts them, so the rule can be
    // bypassed through the API. The tests assert the CORRECT behaviour. `test.fail()` keeps them green while the
    // defect exists and turns them red ("expected to fail, but passed") once the server starts validating:
    // the signal to remove the marker and the "[KNOWN ISSUE]" prefix. The "bug" annotation is where a real project
    // links its ticket; defects of the public demo cannot be filed, so it points to the README entry.
    test('[KNOWN ISSUE] duplicate vacancy name is rejected', {
      annotation: [
        { type: 'known issue', description: 'UI shows "Already exists", but POST /recruitment/vacancies accepts a duplicate name (200).' },
        { type: 'bug', description: 'KI-1 (README → Known issues)' },
      ],
    }, async ({ vacancySet, vacancyApi, vacanciesToCleanup }) => {
      test.fail();
      const existing = vacancySet.vacancies.V1;
      vacanciesToCleanup.push(existing.name); // already registered; repeated here because a duplicate may be created

      const res = await vacancyApi.createRaw({
        name: existing.name, jobTitleId: existing.jobTitle.id, employeeId: vacancySet.manager.empNumber, status: true, isPublished: false,
      });

      expect(res.status()).toBe(422);
    });

    test('[KNOWN ISSUE] number of positions above 99 is rejected', {
      annotation: [
        { type: 'known issue', description: 'UI allows 1-99 only, but POST /recruitment/vacancies accepts numOfPositions = 100 (200).' },
        { type: 'bug', description: 'KI-2 (README → Known issues)' },
      ],
    }, async ({ vacancyApi, jobTitles, hiringManager, vacanciesToCleanup }) => {
      test.fail();
      const name = `QA Auto Vacancy API ${uniqueSuffix()}`;
      vacanciesToCleanup.push(name);

      const res = await vacancyApi.createRaw({
        name, jobTitleId: jobTitles.A.id, employeeId: hiringManager.empNumber, numOfPositions: 100, status: true, isPublished: false,
      });

      expect(res.status()).toBe(422);
    });
  });
});
