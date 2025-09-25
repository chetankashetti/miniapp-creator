#!/usr/bin/env tsx

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from '../db';

async function runMigrations() {
  console.log('🔄 Running database migrations...');
  
  try {
    await migrate(db, { migrationsFolder: './db/migrations' });
    console.log('✅ Database migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
