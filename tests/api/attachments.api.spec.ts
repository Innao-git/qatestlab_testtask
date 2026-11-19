import { test, expect } from '../../src/fixtures';
import { AttachmentApi } from '../../src/api/AttachmentApi';
import type { ApiError, ApiResponse, Attachment } from '../../src/api/types';
import { expectNoServerInternals } from '../../src/utils/assertions';
import { type TestFileType, createTestFile } from '../../src/utils/testFiles';
import fileTypes from '../../test-data/attachments.json';

/**
 * A missing file must not be served and must not crash the server. The demo answers 400 (not 404) -
 * the exact client-error code is not specified anywhere, so any 4xx is accepted.
 */
function expectNotServed(status: number) {
  expect(status, 'a missing attachment must be a client error (4xx)').toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
}

// Attachments are created on a fresh employee (the `employee` fixture), never on a shared record,
// and disappear together with that employee in teardown.
test.describe('API: My Info → Attachments', { tag: '@attachments' }, () => {
  test('full lifecycle: upload, list, download, delete', { tag: '@smoke' }, async ({ attachmentApi, employee }, testInfo) => {
    const { empNumber } = employee;
    const file = await createTestFile(testInfo);
    const description = `API autotest ${file.name}`;
    let attachment!: Attachment;

    await test.step('POST uploads the file', async () => {
      const res = await attachmentApi.uploadRaw(empNumber, AttachmentApi.payload(file, description));
      expect(res.status()).toBe(200);
      attachment = ((await res.json()) as ApiResponse<Attachment>).data;
      expect(attachment).toMatchObject({
        filename: file.name,
        description,
        size: file.content.length,
        fileType: file.mimeType,
        attachedByName: 'Admin',
      });
      expect(attachment.id).toEqual(expect.any(Number));
    });

    await test.step('GET list returns exactly this attachment', async () => {
      expect(await attachmentApi.list(empNumber)).toEqual([attachment]);
    });

    await test.step('download returns the same bytes as an attachment with the file name', async () => {
      const res = await attachmentApi.downloadRaw(empNumber, attachment.id);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-disposition']).toBe(`attachment; filename*=utf-8''${file.name}`);
      expect(res.headers()['content-type']).toContain(file.mimeType);
      expect(await res.body()).toEqual(file.content);
    });

    await test.step('DELETE removes the attachment', async () => {
      const res = await attachmentApi.deleteRaw(empNumber, [attachment.id]);
      expect(res.status()).toBe(200);
      expect(((await res.json()) as ApiResponse<number[]>).data).toEqual([attachment.id]);

      expect(await attachmentApi.list(empNumber)).toEqual([]);
      expectNotServed((await attachmentApi.downloadRaw(empNumber, attachment.id)).status());
    });
  });

  for (const { type, mimeType } of fileTypes as { type: TestFileType; mimeType: string }[]) {
    test(`a ${type} file keeps its type and content`, async ({ attachmentApi, employee }, testInfo) => {
      const file = await createTestFile(testInfo, { type });

      const attachment = await attachmentApi.upload(employee.empNumber, file, `${type} file`);

      expect(attachment.fileType).toBe(mimeType);
      const download = await attachmentApi.downloadRaw(employee.empNumber, attachment.id);
      expect(await download.body()).toEqual(file.content);
    });
  }

  // Every negative case also checks the error body leaks no server internals.
  test.describe('negative', () => {
    test('a file over 1 MB is rejected with 422', async ({ attachmentApi, employee }, testInfo) => {
      // clearly above the limit whichever way "1MB" is counted (1 000 000 or 1 048 576 bytes)
      const file = await createTestFile(testInfo, { sizeBytes: 1024 * 1024 + 1 });

      const res = await attachmentApi.uploadRaw(employee.empNumber, AttachmentApi.payload(file, 'too big'));

      expect(res.status()).toBe(422);
      expect(((await res.json()) as ApiError).error.data?.invalidParamKeys).toContain('attachment');
      await expectNoServerInternals(res);
      expect(await attachmentApi.list(employee.empNumber)).toEqual([]);
    });

    test('upload without a file is rejected with 422', async ({ attachmentApi, employee }) => {
      const res = await attachmentApi.uploadRaw(employee.empNumber, { description: 'no file' });

      expect(res.status()).toBe(422);
      expect(((await res.json()) as ApiError).error.data?.invalidParamKeys).toContain('attachment');
      await expectNoServerInternals(res);
    });

    test('download of a non-existent attachment is rejected with 4xx', async ({ attachmentApi, employee }) => {
      const res = await attachmentApi.downloadRaw(employee.empNumber, 99999999);

      expectNotServed(res.status());
      await expectNoServerInternals(res);
    });
  });
});
