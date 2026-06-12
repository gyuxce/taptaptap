-- Apply this once to a WAVR database created before the merchants.phone fix.
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.merchants
  DROP CONSTRAINT IF EXISTS merchant_phone_format;

ALTER TABLE public.merchants
  ADD CONSTRAINT merchant_phone_format CHECK (
    phone IS NULL OR phone ~ '^(08|\+62)[0-9]{8,11}$'
  );

NOTIFY pgrst, 'reload schema';
