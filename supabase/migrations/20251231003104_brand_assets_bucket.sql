-- Migration: brand-assets storage bucket for email templates
-- Purpose: Host publicly accessible brand assets (logo, etc.) for use in email templates
--
-- NOTE: Storage buckets must be created via Supabase Dashboard (not SQL migrations)
-- due to permission restrictions on storage.buckets table.
--
-- MANUAL SETUP REQUIRED:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Create bucket: "brand-assets" (public: true)
-- 3. Upload playze-logo.png from apps/admin-portal/public/assets/
-- 4. Logo URL: https://cgaajzhddfuxzsugjqkk.supabase.co/storage/v1/object/public/brand-assets/playze-logo.png
--
-- This migration only creates the RLS policies (which CAN be done via SQL)

-- Allow public read access to all files in the brand-assets bucket
-- (Only runs if bucket exists - safe to apply before or after bucket creation)
DO $$
BEGIN
  -- Check if policy already exists before creating
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read access for brand assets'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Public read access for brand assets"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'brand-assets');
  END IF;
END $$;

-- Allow authenticated admins to upload/manage files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Admins can manage brand assets'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Admins can manage brand assets"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
      bucket_id = 'brand-assets'
      AND EXISTS (SELECT 1 FROM admin_users WHERE email = auth.email())
    )
    WITH CHECK (
      bucket_id = 'brand-assets'
      AND EXISTS (SELECT 1 FROM admin_users WHERE email = auth.email())
    );
  END IF;
END $$;
