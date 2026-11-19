import { writeFile } from 'node:fs/promises';
import type { TestInfo } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { uniqueSuffix } from './dataGenerator';

export type TestFileType = 'txt' | 'png' | 'pdf';

export interface TestFile {
  /** File name as the user / server sees it (unique per call). */
  name: string;
  /** Absolute path on disk - for `setInputFiles` in the browser. */
  path: string;
  /** Exact bytes written - a downloaded file is compared against them. */
  content: Buffer;
  mimeType: string;
}

const MIME: Record<TestFileType, string> = { txt: 'text/plain', png: 'image/png', pdf: 'application/pdf' };

// Smallest valid files of each binary type: a 1x1 transparent PNG and a one-page PDF.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const PDF_MIN = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

/**
 * Creates a file in the test's own output folder (cleaned by Playwright, isolated between workers).
 * - name is unique, so a row in the table can only be ours;
 * - text content is unique, so a matching download proves it is OUR file, not a cached or another one;
 * - `sizeBytes` builds a text file of an exact size (e.g. just over the 1 MB upload limit).
 */
export async function createTestFile(
  testInfo: TestInfo,
  { type = 'txt', sizeBytes }: { type?: TestFileType; sizeBytes?: number } = {},
): Promise<TestFile> {
  const name = `qa-attachment-${uniqueSuffix()}.${type}`;
  let content: Buffer;
  if (sizeBytes !== undefined) content = Buffer.alloc(sizeBytes, 'a');
  else if (type === 'png') content = PNG_1X1;
  else if (type === 'pdf') content = PDF_MIN;
  else content = Buffer.from(`${name}\n${faker.lorem.sentence()}\n`);

  const path = testInfo.outputPath(name);
  await writeFile(path, content);
  return { name, path, content, mimeType: MIME[type] };
}
