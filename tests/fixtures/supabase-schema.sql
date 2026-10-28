-- UNIQUEMENT pour une base éphémère de test vide. Aucune donnée réelle.
-- Reconstitution des colonnes, contraintes et droits fournis par le propriétaire.
-- Ne reproduit pas les services Supabase Auth, Data API ni Realtime.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
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

-- Même cardinalité que le relevé, mais identifiants et textes entièrement fictifs.
INSERT INTO public.spaces (id, name, position)
SELECT md5('space-' || n)::uuid, 'Atelier fictif ' || n, n - 1
FROM generate_series(1,5) AS n;
INSERT INTO public.emissions (id, theme, emission_date, start_time, is_template, space_id)
SELECT md5('emission-' || n)::uuid, 'Émission fictive ' || n,
  CASE WHEN n % 2 = 0 THEN DATE '2026-10-27' ELSE NULL END,
  CASE WHEN n = 1 THEN TIME '23:59:30' ELSE TIME '17:00:00' END,
  n = 12,
  CASE WHEN n <= 8 THEN md5('space-' || (1 + (n - 1) % 5))::uuid ELSE NULL END
FROM generate_series(1,12) AS n;
INSERT INTO public.blocks (id, emission_id, title, position)
SELECT md5('block-' || n)::uuid, md5('emission-' || n)::uuid, 'Bloc fictif ' || n, 0
FROM generate_series(1,12) AS n;
INSERT INTO public.sequences
  (id, emission_id, position, type, direct, recorded, duration_seconds, who, block_id)
SELECT md5('sequence-' || e || '-' || s)::uuid, md5('emission-' || e)::uuid,
  s - 1, CASE WHEN s % 2 = 0 THEN 'Musique' ELSE 'Direct' END,
  'Texte fictif éè & < > ' || s, E'Ligne 1\nLigne 2', s * 15,
  'Équipe fictive', md5('block-' || e)::uuid
FROM generate_series(1,12) AS e CROSS JOIN generate_series(1,11) AS s;
