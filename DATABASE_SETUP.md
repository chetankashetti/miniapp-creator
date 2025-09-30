# Database Setup for Minidev

This document explains how to set up the PostgreSQL database with Drizzle ORM for Minidev.

## Prerequisites

- PostgreSQL 12+ installed and running
- Node.js 22+
- pnpm (recommended) or npm

## Setup Instructions

### 1. Install Dependencies

```bash
cd minidev
pnpm install
```

### 2. Database Configuration

Create a `.env.local` file in the minidev directory:

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/minidev"

# Claude API Configuration
CLAUDE_API_KEY="your_claude_api_key_here"

# Privy Configuration
NEXT_PUBLIC_PRIVY_APP_ID="your_privy_app_id_here"
PRIVY_APP_SECRET="your_privy_app_secret_here"

# Preview Host Configuration
PREVIEW_API_BASE="minidev.fun"
PREVIEW_AUTH_TOKEN="your_preview_auth_token_here"

# Minidev Configuration
MINIDEV_PASSWORD="minidev2024"
```

### 3. Create Database

Connect to PostgreSQL and create the database:

```sql
CREATE DATABASE minidev;
```

### 4. Generate and Run Migrations

```bash
# Generate migration files
pnpm run db:generate

# Run migrations
pnpm run db:migrate
```

### 5. Verify Setup

You can use Drizzle Studio to verify the database setup:

```bash
pnpm run db:studio
```

This will open a web interface at `http://localhost:4983` where you can view and manage your database.

## Database Schema

The database includes the following tables:

- **users**: User accounts linked to Privy authentication
- **projects**: User projects with metadata
- **project_files**: File contents for each project
- **project_patches**: Diff history for project changes
- **project_deployments**: Deployment information
- **user_sessions**: User session management

## API Endpoints

### Authentication
- `POST /api/auth/privy` - Authenticate with Privy
- `GET /api/auth/privy` - Validate session

### Projects
- `GET /api/projects` - List user projects
- `POST /api/projects` - Create new project
- `PUT /api/projects` - Update project
- `DELETE /api/projects` - Delete project
- `GET /api/projects/[projectId]` - Get specific project

## Development

### Adding New Tables

1. Update `db/schema.ts` with new table definitions
2. Run `pnpm run db:generate` to create migration
3. Run `pnpm run db:migrate` to apply migration

### Database Functions

All database operations are available in `lib/database.ts`:

- User management: `createUser`, `getUserByPrivyId`, etc.
- Project management: `createProject`, `getProjectsByUserId`, etc.
- File management: `saveProjectFiles`, `getProjectFiles`, etc.
- Patch management: `savePatch`, `getProjectPatches`, etc.

## Troubleshooting

### Connection Issues

- Verify PostgreSQL is running
- Check DATABASE_URL format
- Ensure database exists
- Verify user permissions

### Migration Issues

- Check migration files in `db/migrations/`
- Verify schema changes are correct
- Run migrations in order

### Performance

- Monitor connection pool usage
- Consider indexing frequently queried columns
- Use connection pooling for production
