import { type Locator, expect } from '@playwright/test';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * OrangeHRM renders every field as `.oxd-input-group` with a <label> that is NOT linked
 * to its control, so `getByLabel` does not work. This helper resolves a field by label text.
 */
export class FormField {
  readonly group: Locator;

  constructor(scope: Locator, label: string) {
    this.group = scope
      .locator('.oxd-input-group')
      .filter({ has: scope.page().locator('label', { hasText: new RegExp(`^${escapeRegExp(label)}$`) }) });
  }

  get input(): Locator {
    return this.group.locator('input').first();
  }

  get error(): Locator {
    return this.group.locator('.oxd-input-field-error-message');
  }

  async fill(value: string) {
    await this.input.fill(value);
  }

  /** Custom dropdown (.oxd-select-text) - options are rendered as role="option". */
  async select(option: string) {
    await this.group.locator('.oxd-select-text').click();
    await this.group.getByRole('option', { name: option, exact: true }).click();
    await expect(this.group.locator('.oxd-select-text-input')).toHaveText(option);
  }

  /** Autocomplete: type, wait for suggestions, pick the one containing `optionText`. */
  async autocomplete(query: string, optionText = query) {
    await this.input.fill(query);
    const option = this.group.locator('.oxd-autocomplete-option').filter({ hasText: optionText }).first();
    await option.click();
  }

  async expectError(text: string | RegExp) {
    await expect(this.error).toHaveText(text);
  }
}
