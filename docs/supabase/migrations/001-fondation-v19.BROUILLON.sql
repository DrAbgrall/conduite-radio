-- BROUILLON : testé en mémoire sur données fictives PostgreSQL 17.5 uniquement.
-- Aucune exécution Supabase. Base de test distincte uniquement, après autorisation.
-- PostgreSQL 17. Exécuter comme propriétaire des tables, jamais depuis le client.
-- Première étape seulement : révisions, réserve privée et photographie initiale.
-- PAS ENCORE de capture automatique, de restauration ou de contrôle de conflit RPC.
-- Non réexécutable : une collision de nom doit provoquer une revue, pas être masquée.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Stabiliser la photographie pendant la transaction. Peut attendre/bloquer les
-- écritures : même additive, cette migration nécessite une fenêtre autorisée.
LOCK TABLE public.spaces, public.emissions, public.blocks, public.sequences
  IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.emissions
  ADD COLUMN v19_revision bigint NOT NULL DEFAULT 0
  CHECK (v19_revision >= 0);

CREATE SCHEMA radio_v19_private;
REVOKE ALL ON SCHEMA radio_v19_private FROM PUBLIC, anon, authenticated;

-- Même verrou pris AVANT les verrous de lignes, y compris par la V18.2.
-- Sérialisation volontaire des écritures de cette petite application pédagogique.
CREATE FUNCTION radio_v19_private.lock_writes()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(194923,19);
$$;
CREATE FUNCTION radio_v19_private.write_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM radio_v19_private.lock_writes(); RETURN NULL; END;
$$;
CREATE TRIGGER v19_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.spaces
  FOR EACH STATEMENT EXECUTE FUNCTION radio_v19_private.write_gate();
CREATE TRIGGER v19_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.emissions
  FOR EACH STATEMENT EXECUTE FUNCTION radio_v19_private.write_gate();
CREATE TRIGGER v19_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.blocks
  FOR EACH STATEMENT EXECUTE FUNCTION radio_v19_private.write_gate();
CREATE TRIGGER v19_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.sequences
  FOR EACH STATEMENT EXECUTE FUNCTION radio_v19_private.write_gate();

-- Aucun FK vers emissions : conserver la photographie après une suppression.
-- Format interne conservant les UUID, distinct du JSON portable de l'application.
CREATE TABLE radio_v19_private.emission_history (
  history_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emission_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  captured_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  reason text NOT NULL,
  snapshot jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(snapshot) = 'object')
);
CREATE INDEX emission_history_lookup
  ON radio_v19_private.emission_history (emission_id, history_id DESC);
ALTER TABLE radio_v19_private.emission_history ENABLE ROW LEVEL SECURITY;
-- Sans politique publique. Les fonctions de lecture/restauration seront un lot
-- séparé. Le propriétaire reste responsable de l'administration de cette réserve.
REVOKE ALL ON ALL TABLES IN SCHEMA radio_v19_private
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA radio_v19_private
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION radio_v19_private.assign_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.v19_revision := 0;
  ELSE
    NEW.v19_revision := OLD.v19_revision + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION radio_v19_private.touch_parent_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  previous_id uuid;
  next_id uuid;
  parent_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN previous_id := OLD.emission_id; END IF;
  IF TG_OP <> 'DELETE' THEN next_id := NEW.emission_id; END IF;
  -- Toucher les deux parents si l'appartenance change. Ordre déterministe entre
  -- parents ; les verrous enfants peuvent néanmoins provoquer un deadlock avec
  -- d'autres transactions. La recette concurrente reste obligatoire.
  FOR parent_id IN
    SELECT DISTINCT value FROM (VALUES (previous_id), (next_id)) AS ids(value)
      WHERE value IS NOT NULL ORDER BY value
  LOOP
    UPDATE public.emissions SET v19_revision = v19_revision
      WHERE id = parent_id;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA radio_v19_private
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER v19_assign_revision
  BEFORE INSERT OR UPDATE ON public.emissions
  FOR EACH ROW EXECUTE FUNCTION radio_v19_private.assign_revision();
CREATE TRIGGER v19_blocks_touch_parent
  AFTER INSERT OR UPDATE OR DELETE ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION radio_v19_private.touch_parent_revision();
CREATE TRIGGER v19_sequences_touch_parent
  AFTER INSERT OR UPDATE OR DELETE ON public.sequences
  FOR EACH ROW EXECUTE FUNCTION radio_v19_private.touch_parent_revision();

INSERT INTO radio_v19_private.emission_history
  (emission_id, revision, reason, snapshot)
SELECT e.id, e.v19_revision, 'baseline',
  pg_catalog.jsonb_build_object(
    'format', 'conduite-radio-db', 'version', 1,
    'emission', pg_catalog.to_jsonb(e),
    'blocks', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(b) ORDER BY b.position, b.id)
      FROM public.blocks b WHERE b.emission_id = e.id
    ), '[]'::jsonb),
    'sequences', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.position, s.id)
      FROM public.sequences s WHERE s.emission_id = e.id
    ), '[]'::jsonb)
  )
FROM public.emissions e;

-- Aucun changement aux politiques des tables métier, à la publication Realtime,
-- aux espaces, aux contraintes d'ordre ni aux données métier existantes.
COMMIT;
