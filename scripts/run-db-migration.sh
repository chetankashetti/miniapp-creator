#!/bin/bash

# Script to run database migration for generation_jobs table
# This creates the async processing infrastructure

echo "=========================================="
echo "  Database Migration: Async Processing"
echo "=========================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Please create .env file with DATABASE_URL"
    exit 1
fi

# Check if DATABASE_URL is set
if ! grep -q "DATABASE_URL" .env; then
    echo "❌ Error: DATABASE_URL not found in .env"
    exit 1
fi

echo "✅ Found .env file with DATABASE_URL"
echo ""

# Option 1: Use drizzle-kit (recommended)
echo "Option 1: Using drizzle-kit (recommended)"
echo "Command: npm run db:migrate"
echo ""
echo "This will:"
echo "  - Create generation_jobs table"
echo "  - Add foreign key constraints"
echo "  - Set up indexes"
echo ""
echo "Running migration..."
echo ""

npm run db:migrate

echo ""
echo "=========================================="
echo "  Migration Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Add async processing environment variables to .env"
echo "2. Restart your development server"
echo "3. Test with: localStorage.setItem('minidev_use_async_processing', 'true')"
echo ""
echo "See SETUP_ASYNC_PROCESSING.md for detailed instructions"
