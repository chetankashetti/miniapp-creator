-- Add contract_addresses column to project_deployments table
-- This stores deployed smart contract addresses for web3 projects
ALTER TABLE "project_deployments" ADD COLUMN "contract_addresses" jsonb;
