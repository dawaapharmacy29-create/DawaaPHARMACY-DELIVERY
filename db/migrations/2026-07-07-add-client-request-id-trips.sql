-- Safe migration to add client_request_id and related columns to trips tables

-- For delivery_trips (if exists)
ALTER TABLE IF EXISTS public.delivery_trips
  ADD COLUMN IF NOT EXISTS client_request_id text,
  ADD COLUMN IF NOT EXISTS upload_status text DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid,
  ADD COLUMN IF NOT EXISTS duplicate_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_trips_client_request
  ON public.delivery_trips (client_request_id)
  WHERE client_request_id IS NOT NULL;

-- For internal_trips (if the project uses internal_trips)
ALTER TABLE IF EXISTS public.internal_trips
  ADD COLUMN IF NOT EXISTS client_request_id text,
  ADD COLUMN IF NOT EXISTS upload_status text DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid,
  ADD COLUMN IF NOT EXISTS duplicate_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_trips_client_request
  ON public.internal_trips (client_request_id)
  WHERE client_request_id IS NOT NULL;

-- Notes:
-- Run this migration using your preferred migration tool or execute directly against the database.
-- Adding the unique index with WHERE avoids enforcing uniqueness on NULLs.
-- If you use a migration tool that requires up/down, adapt accordingly.
