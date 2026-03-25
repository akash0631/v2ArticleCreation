-- Add new user role for PO committee users
-- Safe for repeated runs on PostgreSQL versions that support IF NOT EXISTS
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'PO_COMMITTEE';
