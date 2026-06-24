-- 0060_delivery_trip_proof_fields.sql
-- Adds optional proof fields for supplier/warehouse trips.

alter table internal_trips add column if not exists proof_image_url text;
alter table internal_trips add column if not exists proof_note text;
