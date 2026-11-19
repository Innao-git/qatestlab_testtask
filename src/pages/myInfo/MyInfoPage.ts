import { type Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AttachmentsSection } from './AttachmentsSection';

/** My Info → Personal Details of the logged-in user. */
export class MyInfoPage extends BasePage {
  readonly attachments: AttachmentsSection;

  constructor(page: Page) {
    super(page);
    this.attachments = new AttachmentsSection(page);
  }

  /** Navigates the way a user would: side menu → My Info. */
  async navigate() {
    await this.sideMenu.open('My Info');
    await this.expectLoaded();
  }

  /** My Info resolves to the user's OWN employee record. */
  async expectLoaded(empNumber?: number) {
    await expect(this.page).toHaveURL(empNumber ? new RegExp(`/pim/viewPersonalDetails/empNumber/${empNumber}$`) : /\/pim\/viewPersonalDetails\//);
    await expect(this.attachments.root).toBeVisible();
  }
}
