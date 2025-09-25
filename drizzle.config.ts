import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env' });

export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
} as Config;
