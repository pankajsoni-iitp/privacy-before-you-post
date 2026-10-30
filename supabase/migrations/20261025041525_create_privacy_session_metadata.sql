/*
# Create privacy session metadata storage

1. Purpose
- Add a minimal database record for the Privacy Before You Post temporary-session lifecycle.
- Keep the browser experience private by storing operational metadata only, never uploaded files or extracted private content.

2. New table: `privacy_sessions`
- `id`: internal UUID identifier.
- `session_code`: short, non-secret display code shown in the app header.
- `created_at`: session creation timestamp.
- `expires_at`: planned automatic expiration timestamp.
- `closed_at`: timestamp recorded when the user ends the session, when available.
- `status`: lifecycle state constrained to `ACTIVE`, `EXPIRED`, or `CLOSED`.
- `analysis_count`: number of completed checks for operational reporting.
- `last_score`: latest deterministic score, without storing findings or source content.

3. Security
- Row level security is enabled.
- No anonymous or authenticated Data API grants are provided because this app has no sign-in and session metadata must not be publicly enumerable.
- The table is reserved for trusted server-side operations using the service role.
- No raw media, OCR text, captions, document text, filenames, or private analysis evidence is stored.

4. Retention notes
- `expires_at` and `closed_at` support a purge job or server-side cleanup process.
- Application code should treat expired and closed records as inactive.
- This migration does not claim infrastructure-wide deletion of database backups.
*/

CREATE TABLE IF NOT EXISTS public.privacy_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code text NOT NULL UNIQUE CHECK (session_code ~ '^PBYP-[A-F0-9]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CLOSED')),
  analysis_count integer NOT NULL DEFAULT 0 CHECK (analysis_count >= 0),
  last_score integer CHECK (last_score >= 0 AND last_score <= 100),
  CHECK (closed_at IS NULL OR closed_at >= created_at)
);

ALTER TABLE public.privacy_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.privacy_sessions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.privacy_sessions TO service_role;

CREATE INDEX IF NOT EXISTS privacy_sessions_expiration_idx
  ON public.privacy_sessions (expires_at)
  WHERE status = 'ACTIVE';
