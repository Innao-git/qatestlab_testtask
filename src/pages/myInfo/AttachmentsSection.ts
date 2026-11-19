import { type Download, type Locator, type Page, expect } from '@playwright/test';
import type { TestFile } from '../../utils/testFiles';
import { FormField } from '../components/FormField';

export interface AttachmentRowData {
  fileName: string;
  description: string;
  size: string;
  type: string;
  addedBy: string;
}

/** "Attachments" block at the bottom of a My Info screen: the add form and the attachments table. */
export class AttachmentsSection {
  readonly root: Locator;
  readonly addButton: Locator;
  readonly fileField: FormField;
  readonly fileInput: Locator;
  readonly commentInput: Locator;
  readonly saveButton: Locator;
  readonly rows: Locator;
  readonly noRecords: Locator;
  readonly confirmDeleteButton: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('.orangehrm-attachment');
    this.addButton = this.root.getByRole('button', { name: 'Add' });
    this.fileField = new FormField(this.root, 'Select File');
    this.fileInput = this.root.locator('input[type="file"]');
    // "Comment" in the UI is stored as the attachment's "description"
    this.commentInput = this.root.locator('textarea');
    this.saveButton = this.root.getByRole('button', { name: 'Save' });
    this.rows = this.root.locator('.oxd-table-card');
    this.noRecords = this.root.getByText('No Records Found');
    this.confirmDeleteButton = page.getByRole('button', { name: 'Yes, Delete' });
  }

  async openAddForm() {
    await this.addButton.click();
    await expect(this.fileInput).toBeAttached();
  }

  async chooseFile(file: TestFile) {
    await this.fileInput.setInputFiles(file.path);
  }

  async upload(file: TestFile, description: string) {
    await this.openAddForm();
    await this.chooseFile(file);
    await this.commentInput.fill(description);
    await this.saveButton.click();
  }

  rowByFileName(fileName: string): Locator {
    return this.rows.filter({ has: this.page.getByRole('cell', { name: fileName, exact: true }) });
  }

  async getRowData(row: Locator): Promise<AttachmentRowData> {
    const cells = row.getByRole('cell');
    // columns: [checkbox, File Name, Description, Size, Type, Date Added, Added By, Actions]
    const [fileName, description, size, type, addedBy] = await Promise.all(
      [1, 2, 3, 4, 6].map(async (i) => (await cells.nth(i).innerText()).trim()),
    );
    return { fileName, description, size, type, addedBy };
  }

  async expectAttachment(expected: AttachmentRowData) {
    const row = this.rowByFileName(expected.fileName);
    await expect(row).toHaveCount(1);
    expect(await this.getRowData(row)).toEqual(expected);
  }

  /** Clicks the download icon and returns the browser download once it starts. */
  async download(fileName: string): Promise<Download> {
    const download = this.page.waitForEvent('download');
    await this.rowByFileName(fileName).locator('button:has(.bi-download)').click();
    return download;
  }

  async delete(fileName: string) {
    await this.rowByFileName(fileName).locator('button:has(.bi-trash)').click();
    await this.confirmDeleteButton.click();
  }
}
