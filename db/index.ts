import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Database connection configuration
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/minidev';

// Create the connection
const client = postgres(connectionString, {
  max: 1, // Limit connections for serverless environments
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create the database instance
export const db = drizzle(client, { schema });

// Export schema for use in other files
export * from './schema';

// Helper function to close the connection
export const closeConnection = async () => {
  await client.end();
};
