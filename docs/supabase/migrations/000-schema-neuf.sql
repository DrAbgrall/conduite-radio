-- Installation sur un projet Supabase NEUF uniquement. Tables vides.
BEGIN;
-- UNIQUEMENT pour une base éphémère de test vide. Aucune donnée réelle.
-- Reconstitution des colonnes, contraintes et droits fournis par le propriétaire.
-- Ne reproduit pas les services Supabase Auth, Data API ni Realtime.


GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE TABLE public.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.emissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme text NOT NULL DEFAULT '',
  emission_date date,
  start_time time NOT NULL DEFAULT '17:00:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  is_template boolean NOT NULL DEFAULT false,
  space_id uuid REFERENCES public.spaces(id) ON DELETE SET NULL
);
CREATE TABLE public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emission_id uuid NOT NULL REFERENCES public.emissions(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emission_id uuid NOT NULL REFERENCES public.emissions(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'Direct'
    CHECK (type IN ('Direct','Habillage','PAD','Appel','Musique','Promo')),
  direct text NOT NULL DEFAULT '',
  recorded text NOT NULL DEFAULT '',
  duration_seconds integer NOT NULL DEFAULT 60 CHECK (duration_seconds >= 0),
  who text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  block_id uuid REFERENCES public.blocks(id) ON DELETE SET NULL
);
CREATE INDEX ON public.emissions (space_id);
CREATE INDEX ON public.blocks (emission_id, position);
CREATE INDEX ON public.sequences (emission_id, position);
CREATE INDEX ON public.sequences (block_id);

DO $$
DECLARE table_name text; operation text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['spaces','emissions','blocks','sequences'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    FOREACH operation IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO anon, authenticated %s',
        'open_' || lower(operation), table_name, operation,
        CASE operation WHEN 'INSERT' THEN 'WITH CHECK (true)'
          WHEN 'UPDATE' THEN 'USING (true) WITH CHECK (true)'
          ELSE 'USING (true)' END);
    END LOOP;
    EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated', table_name);
  END LOOP;
END;
$$;


COMMIT;
