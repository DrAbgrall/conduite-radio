-- BROUILLON, essais locaux uniquement. Aucun accord d'application sur Supabase.
-- Après le lot 001. Vingt points de retour par émission + dernier état protégé.
-- Les DELETE ci-dessous concernent la rétention et la restauration futures :
-- ne pas exécuter sur une instance réelle sans recette et autorisation distincte.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.spaces, public.emissions, public.blocks, public.sequences
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE radio_v19_private.emission_heads (
  emission_id uuid PRIMARY KEY,
  revision bigint NOT NULL CHECK (revision >= 0),
  snapshot jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  last_version_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  deleted_at timestamptz
);
ALTER TABLE radio_v19_private.emission_heads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE radio_v19_private.emission_heads FROM PUBLIC, anon, authenticated;

CREATE FUNCTION radio_v19_private.document(p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'format','conduite-radio-db', 'version',1, 'emission',pg_catalog.to_jsonb(e),
    'blocks',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(b) ORDER BY b.position,b.id)
      FROM public.blocks b WHERE b.emission_id=e.id),'[]'::jsonb),
    'sequences',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.position,s.id)
      FROM public.sequences s WHERE s.emission_id=e.id),'[]'::jsonb)
  ) FROM public.emissions e WHERE e.id=p_id;
$$;

CREATE FUNCTION radio_v19_private.checkpoint(p_id uuid, p_snapshot jsonb, p_reason text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE last_entry radio_v19_private.emission_history; saved_id bigint;
BEGIN
  -- Appel interne : le parent puis sa tête doivent être verrouillés par l'appelant.
  SELECT * INTO last_entry FROM radio_v19_private.emission_history
    WHERE emission_id=p_id ORDER BY history_id DESC LIMIT 1;
  IF last_entry.history_id IS NOT NULL AND last_entry.snapshot=p_snapshot THEN
    saved_id := last_entry.history_id;
  ELSE
    INSERT INTO radio_v19_private.emission_history(emission_id,revision,reason,snapshot)
      VALUES(p_id,(p_snapshot->'emission'->>'v19_revision')::bigint,p_reason,p_snapshot)
      RETURNING history_id INTO saved_id;
    DELETE FROM radio_v19_private.emission_history WHERE emission_id=p_id
      AND history_id IN (SELECT history_id FROM radio_v19_private.emission_history
        WHERE emission_id=p_id ORDER BY history_id DESC OFFSET 20);
  END IF;
  UPDATE radio_v19_private.emission_heads SET last_version_at=pg_catalog.clock_timestamp()
    WHERE emission_id=p_id;
  RETURN saved_id;
END;
$$;

-- Un identifiant réutilisé après suppression ne remet pas le compteur à zéro.
CREATE OR REPLACE FUNCTION radio_v19_private.assign_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT revision+1 INTO NEW.v19_revision FROM radio_v19_private.emission_heads
      WHERE emission_id=NEW.id;
    NEW.v19_revision := COALESCE(NEW.v19_revision,0);
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Identifiant d émission immuable' USING ERRCODE='22023';
    END IF;
    NEW.v19_revision := OLD.v19_revision+1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION radio_v19_private.capture_committed_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE doc jsonb; head radio_v19_private.emission_heads; target uuid;
BEGIN
  target := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  PERFORM id FROM public.emissions WHERE id=target FOR UPDATE;
  doc := radio_v19_private.document(target);
  IF doc IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO head FROM radio_v19_private.emission_heads WHERE emission_id=target FOR UPDATE;
  IF head.emission_id IS NULL THEN
    INSERT INTO radio_v19_private.emission_heads(emission_id,revision,snapshot)
      VALUES(target,(doc->'emission'->>'v19_revision')::bigint,doc);
    PERFORM radio_v19_private.checkpoint(target,doc,'created');
  ELSIF head.snapshot IS DISTINCT FROM doc OR head.deleted_at IS NOT NULL THEN
    IF head.deleted_at IS NULL AND
      pg_catalog.clock_timestamp()-head.last_version_at >= interval '2 minutes' THEN
      PERFORM radio_v19_private.checkpoint(target,head.snapshot,'autosave');
    END IF;
    UPDATE radio_v19_private.emission_heads SET snapshot=doc,
      revision=(doc->'emission'->>'v19_revision')::bigint,
      captured_at=pg_catalog.clock_timestamp(), deleted_at=NULL WHERE emission_id=target;
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION radio_v19_private.preserve_before_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target uuid; head radio_v19_private.emission_heads; doc jsonb;
BEGIN
  IF TG_TABLE_NAME='emissions' THEN target := OLD.id;
  ELSE target := OLD.emission_id;
  END IF;
  PERFORM id FROM public.emissions WHERE id=target FOR UPDATE;
  -- Pendant une cascade, le parent peut déjà avoir disparu. Sa photographie a
  -- été conservée par son propre BEFORE DELETE avant l'effacement des enfants.
  IF NOT FOUND THEN RETURN OLD; END IF;
  SELECT * INTO head FROM radio_v19_private.emission_heads WHERE emission_id=target FOR UPDATE;
  IF TG_TABLE_NAME='emissions' THEN
    doc := radio_v19_private.document(target);
    PERFORM radio_v19_private.checkpoint(target,doc,'before_delete_emission');
    INSERT INTO radio_v19_private.emission_heads
      (emission_id,revision,snapshot,deleted_at)
      VALUES(target,OLD.v19_revision+1,doc,pg_catalog.clock_timestamp())
      ON CONFLICT (emission_id) DO UPDATE SET revision=EXCLUDED.revision,
        snapshot=EXCLUDED.snapshot, deleted_at=EXCLUDED.deleted_at,
        captured_at=pg_catalog.clock_timestamp(), last_version_at=pg_catalog.clock_timestamp();
  ELSIF head.emission_id IS NOT NULL AND head.deleted_at IS NULL THEN
    -- Dernier état transactionnel complet, pas un état partiellement vidé ligne
    -- par ligne pendant un DELETE multiple ou une restauration.
    PERFORM radio_v19_private.checkpoint(target,head.snapshot,'before_delete_child');
  END IF;
  RETURN OLD;
END;
$$;

CREATE CONSTRAINT TRIGGER v19_capture_document
  AFTER INSERT OR UPDATE OR DELETE ON public.emissions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION radio_v19_private.capture_committed_document();
CREATE TRIGGER v19_preserve_emission BEFORE DELETE ON public.emissions
  FOR EACH ROW EXECUTE FUNCTION radio_v19_private.preserve_before_delete();
CREATE TRIGGER v19_preserve_block BEFORE DELETE ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION radio_v19_private.preserve_before_delete();
CREATE TRIGGER v19_preserve_sequence BEFORE DELETE ON public.sequences
  FOR EACH ROW EXECUTE FUNCTION radio_v19_private.preserve_before_delete();

-- Initialiser avec le contenu actuel, même si des écritures ont eu lieu entre
-- les lots 001 et 002. Aucun conducteur n'est réaffecté ou nettoyé.
INSERT INTO radio_v19_private.emission_heads(emission_id,revision,snapshot)
  SELECT id,v19_revision,radio_v19_private.document(id) FROM public.emissions;
SELECT radio_v19_private.checkpoint(emission_id,snapshot,'activation')
  FROM radio_v19_private.emission_heads;

-- Consultation ouverte, cohérente avec les ateliers sans connexion. La réserve
-- reste inaccessible en SQL aux clients ; seules ces lectures ciblées sont exposées.
CREATE FUNCTION public.radio_v19_history(p_emission_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_build_object('emission_id',h.emission_id,
    'current_revision',h.revision::text,'deleted_at',h.deleted_at,
    'versions',COALESCE((SELECT pg_catalog.jsonb_agg(v.item ORDER BY v.history_id DESC)
      FROM (SELECT x.history_id,pg_catalog.jsonb_build_object(
        'history_id',x.history_id::text,'revision',x.revision::text,
        'captured_at',x.captured_at,'reason',x.reason,
        'theme',x.snapshot->'emission'->>'theme',
        'sequence_count',pg_catalog.jsonb_array_length(x.snapshot->'sequences')) AS item
        FROM radio_v19_private.emission_history x WHERE x.emission_id=p_emission_id) v),'[]'::jsonb))
  FROM radio_v19_private.emission_heads h WHERE h.emission_id=p_emission_id;
$$;

CREATE FUNCTION public.radio_v19_version(p_emission_id uuid,p_history_id bigint)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT snapshot FROM radio_v19_private.emission_history
    WHERE emission_id=p_emission_id AND history_id=p_history_id;
$$;

CREATE FUNCTION public.radio_v19_restore(p_emission_id uuid,p_history_id bigint,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE live public.emissions; head radio_v19_private.emission_heads;
  snap jsonb; current_doc jsonb; original public.emissions; space_missing boolean := false;
  actual_revision bigint; new_revision bigint;
BEGIN
  PERFORM radio_v19_private.lock_writes();
  SELECT * INTO live FROM public.emissions WHERE id=p_emission_id FOR UPDATE;
  SELECT * INTO head FROM radio_v19_private.emission_heads WHERE emission_id=p_emission_id FOR UPDATE;
  actual_revision := COALESCE(live.v19_revision,head.revision);
  IF actual_revision IS NULL OR p_expected_revision IS NULL OR actual_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'Conducteur modifié : relire avant restauration' USING ERRCODE='40001';
  END IF;
  SELECT snapshot INTO snap FROM radio_v19_private.emission_history
    WHERE emission_id=p_emission_id AND history_id=p_history_id;
  IF snap IS NULL OR snap->>'format' IS DISTINCT FROM 'conduite-radio-db'
    OR snap->>'version' IS DISTINCT FROM '1'
    OR snap->'emission'->>'id' IS DISTINCT FROM p_emission_id::text
    OR pg_catalog.jsonb_typeof(snap->'blocks') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_typeof(snap->'sequences') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Version absente ou incompatible' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(snap->'blocks') b
    WHERE b->>'emission_id' IS DISTINCT FROM p_emission_id::text)
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(snap->'sequences') s
      WHERE s->>'emission_id' IS DISTINCT FROM p_emission_id::text
      OR (s->>'block_id' IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_array_elements(snap->'blocks') b
        WHERE b->>'id'=s->>'block_id'))) THEN
    RAISE EXCEPTION 'Appartenance incohérente dans la version' USING ERRCODE='22023';
  END IF;
  -- Une référence étrangère actuellement permise par le schéma V18.2 ne doit
  -- pas provoquer un SET NULL dans un autre conducteur lors de la restauration.
  IF EXISTS(SELECT 1 FROM public.sequences s JOIN public.blocks b ON b.id=s.block_id
    WHERE b.emission_id=p_emission_id AND s.emission_id<>p_emission_id) THEN
    RAISE EXCEPTION 'Un bloc est utilisé par une autre émission' USING ERRCODE='22023';
  END IF;
  original := pg_catalog.jsonb_populate_record(NULL::public.emissions,snap->'emission');
  IF original.space_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.spaces WHERE id=original.space_id) THEN
    original.space_id := NULL;
    space_missing := true;
  END IF;
  current_doc := radio_v19_private.document(p_emission_id);
  IF current_doc IS NOT NULL THEN
    PERFORM radio_v19_private.checkpoint(p_emission_id,current_doc,'before_restore');
    UPDATE radio_v19_private.emission_heads SET snapshot=current_doc,
      revision=actual_revision WHERE emission_id=p_emission_id;
    UPDATE public.emissions SET theme=original.theme,emission_date=original.emission_date,
      start_time=original.start_time,created_at=original.created_at,
      is_template=original.is_template,space_id=original.space_id
      WHERE id=p_emission_id;
    DELETE FROM public.sequences WHERE emission_id=p_emission_id;
    DELETE FROM public.blocks WHERE emission_id=p_emission_id;
  ELSE
    INSERT INTO public.emissions(id,theme,emission_date,start_time,created_at,is_template,space_id)
      VALUES(p_emission_id,original.theme,original.emission_date,original.start_time,
        original.created_at,original.is_template,original.space_id);
  END IF;
  INSERT INTO public.blocks(id,emission_id,title,position,created_at)
    SELECT id,emission_id,title,position,created_at FROM
      pg_catalog.jsonb_populate_recordset(NULL::public.blocks,snap->'blocks');
  INSERT INTO public.sequences(id,emission_id,position,type,direct,recorded,duration_seconds,who,created_at,block_id)
    SELECT id,emission_id,position,type,direct,recorded,duration_seconds,who,created_at,block_id FROM
      pg_catalog.jsonb_populate_recordset(NULL::public.sequences,snap->'sequences');
  SELECT v19_revision INTO new_revision FROM public.emissions WHERE id=p_emission_id;
  RETURN pg_catalog.jsonb_build_object('emission_id',p_emission_id,'revision',new_revision::text,
    'restored_from',p_history_id::text,'space_missing',space_missing);
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA radio_v19_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.radio_v19_history(uuid), public.radio_v19_version(uuid,bigint),
  public.radio_v19_restore(uuid,bigint,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.radio_v19_history(uuid), public.radio_v19_version(uuid,bigint),
  public.radio_v19_restore(uuid,bigint,bigint) TO anon, authenticated;
COMMIT;
