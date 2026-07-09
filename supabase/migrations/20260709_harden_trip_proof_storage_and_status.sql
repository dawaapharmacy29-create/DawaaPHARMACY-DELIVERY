-- Harden trip proof camera uploads.
-- الهدف:
-- 1) التأكد أن bucket صور الدليفري موجود ومتاح للقراءة.
-- 2) السماح لتطبيق الدليفري برفع صور إثبات المشاوير/الفواتير بدون سقوط بسبب RLS على storage.objects.
-- 3) ضبط حالة المشاوير التي حفظت بصورة معلقة حتى تظهر للإدارة كمعلقة رفع وليست مجرد بدون صورة.

-- Storage bucket used by RiderDashboard.tsx:
-- supabase.storage.from('delivery-receipts')
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-receipts',
  'delivery-receipts',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
)
on conflict (id) do update
set
  public = true,
  file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), 10485760),
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[];

-- Keep policies simple for this private operational app.
-- The app uses its own rider session/device lock, not Supabase Auth for rider login.
drop policy if exists "Dawaa delivery receipts public read" on storage.objects;
create policy "Dawaa delivery receipts public read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'delivery-receipts');

drop policy if exists "Dawaa delivery receipts insert" on storage.objects;
create policy "Dawaa delivery receipts insert"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'delivery-receipts');

drop policy if exists "Dawaa delivery receipts update" on storage.objects;
create policy "Dawaa delivery receipts update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'delivery-receipts')
with check (bucket_id = 'delivery-receipts');

-- Optional cleanup: classify older trips that clearly had a local photo but failed upload.
-- This helps admin screens distinguish them from true missing proof.
do $$
begin
  if to_regclass('public.internal_trips') is not null then
    update public.internal_trips
    set
      evidence_status = coalesce(nullif(evidence_status, ''), 'pending_upload'),
      proof_review_status = coalesce(nullif(proof_review_status, ''), 'pending_upload'),
      proof_exception_status = case
        when coalesce(proof_exception_status, '') in ('', 'none') then 'pending'
        else proof_exception_status
      end,
      proof_exception_reason = coalesce(proof_exception_reason, 'الصورة موجودة محليًا وفشل رفعها بسبب الشبكة'),
      review_status = case
        when coalesce(review_status, '') in ('', 'pending') then 'pending_upload'
        else review_status
      end,
      review_reason = coalesce(review_reason, 'trip_proof_pending_upload'),
      needs_review = true,
      updated_at = now()
    where proof_image_url is null
      and proof_image_path is null
      and (
        coalesce(evidence_note, '') ilike '%الصورة موجودة محليًا%'
        or coalesce(notes, '') ilike '%الصورة موجودة محليًا%'
        or coalesce(proof_source, '') = 'local_pending'
        or coalesce(evidence_type, '') = 'trip_photo_pending_upload'
      );
  end if;
end $$;
