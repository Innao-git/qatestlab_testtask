import { faker } from '@faker-js/faker';

/** Short unique suffix: timestamp + random, safe for parallel workers. */
export const uniqueSuffix = (): string =>
  `${Date.now().toString(36)}${faker.string.alphanumeric({ length: 4, casing: 'lower' })}`;

export const generateUsername = (prefix = 'qa'): string => `${prefix}_${uniqueSuffix()}`;

/** Satisfies OrangeHRM policy: min 7 chars, at least one lower, upper, digit and special char. */
export const generatePassword = (): string =>
  `${faker.string.alpha({ length: 4, casing: 'upper' })}${faker.string.alpha({ length: 4, casing: 'lower' })}${faker.string.numeric(3)}!`;

export const generateEmployeeName = () => ({
  firstName: faker.person.firstName().replace(/[^A-Za-z]/g, ''),
  // a unique last name keeps the autocomplete unambiguous on the shared demo instance
  lastName: `Auto${uniqueSuffix()}`,
});
