import { type Locator, type Page, expect } from '@playwright/test';

export class Toast {
  readonly root: Locator;

  constructor(page: Page) {
    this.root = page.locator('.oxd-toast');
  }

  async expectMessage(text: string | RegExp) {
    await expect(this.root.filter({ hasText: text }).first()).toBeVisible();
  }
}
