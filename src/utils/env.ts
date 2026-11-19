import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable: ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

export const env = {
  baseUrl: required('BASE_URL'),
  admin: {
    username: required('ADMIN_USERNAME'),
    password: required('ADMIN_PASSWORD'),
  },
} as const;

export const ADMIN_STORAGE_STATE = '.auth/admin.json';
