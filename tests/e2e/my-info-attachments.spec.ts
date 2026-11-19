import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from '../../src/fixtures';
import { createTestFile } from '../../src/utils/testFiles';

// Every test runs as its OWN fresh ESS user (see the `loggedInUser` fixture), not as the shared demo Admin:
// Admin's My Info is one record shared by everyone on the public demo and already holds other people's files.
test.use({ storageState: { cookies: [], origins: [] } });

/** Counts upload requests (POST .../attachments) from the moment it is called. */
function trackUploads(page: Page): { readonly count: number } {
  const counter = { count: 0 };
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/screen/personal/attachments')) counter.count++;
  });
  return counter;
}

test.describe('My Info → Attachments', { tag: '@attachments' }, () => {
  test.beforeEach(async ({ loggedInUser, dashboardPage, myInfoPage }) => {
    await dashboardPage.open();
    await myInfoPage.navigate();
    await myInfoPage.expectLoaded(loggedInUser.empNumber);
    await expect(myInfoPage.attachments.noRecords).toBeVisible();
  });

  test('user can upload, download and delete an attachment', { tag: '@smoke' }, async (
    { myInfoPage, loggedInUser, attachmentApi },
    testInfo,
  ) => {
    const { attachments, toast } = myInfoPage;
    const file = await createTestFile(testInfo);
    const description = `Uploaded by autotest ${file.name}`;

    await test.step('upload a file with a description', async () => {
      await attachments.upload(file, description);
      await toast.expectMessage('Successfully Saved');
    });

    await test.step('the attachment is listed with its details', async () => {
      await expect(attachments.rows).toHaveCount(1);
      await attachments.expectAttachment({
        fileName: file.name,
        description,
        size: `${file.content.length}.00 B`,
        type: file.mimeType,
        addedBy: loggedInUser.username,
      });
    });

    await test.step('download returns the same file', async () => {
      const download = await attachments.download(file.name);
      expect(download.suggestedFilename()).toBe(file.name);
      // byte-for-byte: proves it is exactly the uploaded file, not just a file with the same name
      expect(await readFile(await download.path())).toEqual(file.content);
    });

    await test.step('delete removes the attachment', async () => {
      await attachments.delete(file.name);
      await toast.expectMessage('Successfully Deleted');
      await expect(attachments.noRecords).toBeVisible();
      // the UI could just hide the row - confirm it is gone on the server too
      expect(await attachmentApi.list(loggedInUser.empNumber)).toEqual([]);
    });
  });

  test('a file over 1 MB is rejected and not uploaded', async ({ page, myInfoPage, loggedInUser, attachmentApi }, testInfo) => {
    const { attachments } = myInfoPage;
    // clearly above the limit whichever way "1MB" is counted (1 000 000 or 1 048 576 bytes)
    const file = await createTestFile(testInfo, { sizeBytes: 1024 * 1024 + 1 });
    const uploads = trackUploads(page);

    await attachments.openAddForm();
    await attachments.chooseFile(file);
    await attachments.fileField.expectError('Attachment Size Exceeded');
    await attachments.saveButton.click();

    await attachments.fileField.expectError('Attachment Size Exceeded');
    expect(uploads.count, 'an oversized file must not be sent to the server').toBe(0);
    expect(await attachmentApi.list(loggedInUser.empNumber)).toEqual([]);
  });

  test('saving without a file shows "Required" and uploads nothing', async ({ page, myInfoPage, loggedInUser, attachmentApi }) => {
    const { attachments } = myInfoPage;
    const uploads = trackUploads(page);

    await attachments.openAddForm();
    await attachments.commentInput.fill('description without a file');
    await attachments.saveButton.click();

    await attachments.fileField.expectError('Required');
    expect(uploads.count, 'the form must not be submitted without a file').toBe(0);
    // the table is hidden while the add form is open, so check the server
    expect(await attachmentApi.list(loggedInUser.empNumber)).toEqual([]);
  });
});
