import { test, expect } from '../../src/fixtures';
import { VacanciesPage, vacancyOption } from '../../src/pages/recruitment/VacanciesPage';
import { uniqueSuffix } from '../../src/utils/dataGenerator';
import { expectedRows, toUiFilters, vacancySearchCases } from '../../src/utils/vacancySearch';

// Every test works with its OWN job titles and hiring manager; filtering by that manager isolates the
// test's vacancies from everything else on the shared demo. Test data is created before the page opens,
// because the filter dropdowns are filled when the page loads.
test.describe('Recruitment → Vacancies', { tag: '@recruitment' }, () => {
  test.describe('search', () => {
    // The full search matrix runs at API level (tests/api/vacancies.api.spec.ts); the UI runs representative rows.
    for (const searchCase of vacancySearchCases.filter((c) => c.ui)) {
      test(`search by ${searchCase.case}`, { tag: searchCase.smoke ? '@smoke' : [] }, async ({ vacancySet, dashboardPage, vacanciesPage }) => {
        await dashboardPage.open();
        await vacanciesPage.navigate();

        const response = await vacanciesPage.search(toUiFilters(searchCase, vacancySet));
        expect(response.status()).toBe(200);

        const expected = expectedRows(searchCase, vacancySet);
        if (expected.length) {
          // exact set: every expected vacancy is listed with the right details, and nothing that does not match
          expect(await vacanciesPage.getAllRows()).toEqual(expected);
        } else {
          await expect(vacanciesPage.noRecords).toBeVisible();
          await vacanciesPage.toast.expectMessage('No Records Found');
          await expect(vacanciesPage.rows).toHaveCount(0);
        }
      });
    }

    test('reset clears all filters and lists every vacancy again', async ({ vacancySet, dashboardPage, vacanciesPage }) => {
      await dashboardPage.open();
      await vacanciesPage.navigate();
      await vacanciesPage.search({ hiringManager: vacancySet.manager.name, status: 'Active' });
      await expect(vacanciesPage.rows).toHaveCount(2);

      const response = await vacanciesPage.reset();

      expect(await vacanciesPage.filterValues()).toEqual(Array(4).fill(VacanciesPage.emptyOption));
      // The exact total is not compared: other people and parallel tests add/delete vacancies all the time.
      // What Reset must do is send an UNFILTERED request and stop limiting the list to the manager's 2 rows.
      const params = new URL(response.url()).searchParams;
      for (const filter of ['jobTitleId', 'vacancyId', 'hiringManagerId', 'status']) {
        expect(params.has(filter), `reset request must not filter by ${filter}`).toBe(false);
      }
      await expect(vacanciesPage.rows.nth(2), 'more than the 2 filtered rows are listed').toBeVisible();
    });
  });

  test('admin can add, edit and delete a vacancy', { tag: '@smoke' }, async ({
    jobTitles, hiringManager, vacanciesToCleanup, vacancyApi, dashboardPage, vacanciesPage, vacancyFormPage, page,
  }) => {
    const name = `QA Auto Vacancy UI ${uniqueSuffix()}`;
    vacanciesToCleanup.push(name);
    const managerOption = { query: hiringManager.name.split(' ')[1], option: hiringManager.name };

    await test.step('add a vacancy', async () => {
      await dashboardPage.open();
      await vacanciesPage.navigate();
      await vacanciesPage.clickAdd();
      await vacancyFormPage.expectLoaded('Add');
      await vacancyFormPage.fill({
        name, jobTitle: jobTitles.A.title, description: 'Created by an autotest', hiringManager: managerOption, positions: '2', active: true,
      });

      const response = await vacancyFormPage.save();
      expect(response.status()).toBe(200);
      // after saving, the app reloads straight into the Edit page (the success toast is gone with the reload)
      await expect(page).toHaveURL(/\/recruitment\/addJobVacancy\/\d+$/);
      await vacancyFormPage.expectLoaded('Edit');
    });

    await test.step('the vacancy is listed with its details', async () => {
      await vacanciesPage.navigate();
      await vacanciesPage.search({ hiringManager: hiringManager.name, vacancy: name });
      await vacanciesPage.expectVacancyInList({ vacancy: name, jobTitle: jobTitles.A.title, hiringManager: hiringManager.name, status: 'Active' });
    });

    await test.step('edit the job title and close the vacancy', async () => {
      await vacanciesPage.clickEdit(name);
      await vacancyFormPage.expectLoaded('Edit');
      await vacancyFormPage.fill({ jobTitle: jobTitles.B.title, active: false });

      const response = await vacancyFormPage.save();
      expect(response.status()).toBe(200);
      await vacancyFormPage.toast.expectMessage('Successfully Saved');
    });

    await test.step('the list shows the updated vacancy', async () => {
      await vacanciesPage.navigate();
      // a closed vacancy is offered in the filter as "<name> (Closed)"
      await vacanciesPage.search({ hiringManager: hiringManager.name, vacancy: vacancyOption(name, false) });
      await vacanciesPage.expectVacancyInList({ vacancy: name, jobTitle: jobTitles.B.title, hiringManager: hiringManager.name, status: 'Closed' });
    });

    await test.step('delete the vacancy', async () => {
      await vacanciesPage.deleteVacancy(name);
      await vacanciesPage.toast.expectMessage('Successfully Deleted');
      await expect(vacanciesPage.rowByName(name)).toHaveCount(0);
      // the UI could just hide the row - confirm it is gone on the server too
      expect(await vacancyApi.findByName(name)).toEqual([]);
    });
  });

  test.describe('add vacancy form validation', () => {
    test('required fields show "Required"', async ({ vacancyFormPage, page }) => {
      await page.goto('/web/index.php/recruitment/addJobVacancy');
      await vacancyFormPage.expectLoaded('Add');

      await vacancyFormPage.saveButton.click();

      for (const field of [vacancyFormPage.name, vacancyFormPage.jobTitle, vacancyFormPage.hiringManager]) await field.expectError('Required');
      await expect(page).toHaveURL(/\/addJobVacancy$/);
    });

    const positionCases = [
      { value: 'abc', error: 'Should be a numeric value' },
      { value: '100', error: 'Should be a number between 1-99' },
    ];
    for (const { value, error } of positionCases) {
      test(`"Number of Positions" = "${value}" shows "${error}"`, async ({ vacancyFormPage, page }) => {
        await page.goto('/web/index.php/recruitment/addJobVacancy');
        await vacancyFormPage.expectLoaded('Add');

        await vacancyFormPage.positions.fill(value);

        await vacancyFormPage.positions.expectError(error);
      });
    }

    test('an existing vacancy name shows "Already exists" and nothing is saved', async ({ vacancySet, vacancyApi, vacancyFormPage, page }) => {
      const existing = vacancySet.vacancies.V1;
      await page.goto('/web/index.php/recruitment/addJobVacancy');
      await vacancyFormPage.expectLoaded('Add');

      await vacancyFormPage.fill({
        name: existing.name,
        jobTitle: vacancySet.titles.A.title,
        hiringManager: { query: vacancySet.manager.name.split(' ')[1], option: vacancySet.manager.name },
      });
      await vacancyFormPage.saveButton.click();

      await vacancyFormPage.name.expectError('Already exists');
      await expect(page).toHaveURL(/\/addJobVacancy$/);
      expect(await vacancyApi.findByName(existing.name), 'no duplicate may be created').toHaveLength(1);
    });
  });
});
