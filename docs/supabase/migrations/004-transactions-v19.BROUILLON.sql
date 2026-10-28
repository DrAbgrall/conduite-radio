-- CANDIDATE LOCALE, pas d'autorisation d'exécution Supabase. Après 001/002/003.
-- Lectures cohérentes, écritures par document avec révision attendue, sans SQL dynamique.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE FUNCTION public.radio_v19_read(p_emission_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT doc || pg_catalog.jsonb_build_object('revision',doc->'emission'->>'v19_revision')
  FROM (SELECT radio_v19_private.document(p_emission_id) AS doc) d;
$$;

CREATE FUNCTION public.radio_v19_list(p_space_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e)||pg_catalog.jsonb_build_object('revision',e.v19_revision::text)
    ORDER BY e.emission_date ASC NULLS LAST,e.created_at DESC,e.id),'[]'::jsonb)
  FROM public.emissions e WHERE e.space_id IS NOT DISTINCT FROM p_space_id;
$$;

CREATE FUNCTION public.radio_v19_commit(p_emission_id uuid,p_expected_revision bigint,
  p_document jsonb,p_checkpoint boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current public.emissions; meta public.emissions; previous jsonb;
BEGIN
  PERFORM radio_v19_private.lock_writes();
  SELECT * INTO current FROM public.emissions WHERE id=p_emission_id FOR UPDATE;
  IF current.id IS NULL THEN
    IF p_expected_revision IS NOT NULL OR EXISTS(SELECT 1 FROM radio_v19_private.emission_heads WHERE emission_id=p_emission_id) THEN
      RAISE EXCEPTION 'Émission supprimée ou déjà existante' USING ERRCODE='40001';
    END IF;
  ELSIF p_expected_revision IS NULL OR p_expected_revision<>current.v19_revision THEN
    RAISE EXCEPTION 'Conducteur modifié : exportez votre copie puis rechargez' USING ERRCODE='40001';
  END IF;
  IF p_document IS NULL OR p_document->>'format' IS DISTINCT FROM 'conduite-radio-db'
    OR p_document->>'version' IS DISTINCT FROM '1'
    OR p_document->'emission'->>'id' IS DISTINCT FROM p_emission_id::text
    OR pg_catalog.jsonb_typeof(p_document->'blocks') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_typeof(p_document->'sequences') IS DISTINCT FROM 'array'
    OR pg_catalog.octet_length(p_document::text)>8388608 THEN
    RAISE EXCEPTION 'Document incompatible' USING ERRCODE='22023';
  END IF;
  IF pg_catalog.jsonb_array_length(p_document->'blocks')>500 OR pg_catalog.jsonb_array_length(p_document->'sequences')>5000 THEN
    RAISE EXCEPTION 'Document trop grand' USING ERRCODE='22023';
  END IF;
  IF pg_catalog.jsonb_typeof(p_document->'emission'->'theme') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(p_document->'emission'->'is_template') IS DISTINCT FROM 'boolean'
    OR pg_catalog.jsonb_typeof(p_document->'emission'->'start_time') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Métadonnées invalides' USING ERRCODE='22023';
  END IF;
  meta:=pg_catalog.jsonb_populate_record(NULL::public.emissions,p_document->'emission');
  IF meta.start_time>='24:00:00'::time THEN RAISE EXCEPTION 'Horaire invalide' USING ERRCODE='22023'; END IF;
  -- Appartenances, champs et ordre final contrôlés avant toute écriture.
  IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_document->'blocks') WITH ORDINALITY x(b,n)
    WHERE b->>'emission_id' IS DISTINCT FROM p_emission_id::text OR (b->>'position')::integer IS DISTINCT FROM n-1
      OR pg_catalog.jsonb_typeof(b->'title') IS DISTINCT FROM 'string')
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_document->'sequences') WITH ORDINALITY x(s,n)
      WHERE s->>'emission_id' IS DISTINCT FROM p_emission_id::text OR (s->>'position')::integer IS DISTINCT FROM n-1
        OR NOT COALESCE((s->>'duration_seconds')~'^\d+$',false)
        OR (s->>'duration_seconds')::bigint>86400
        OR pg_catalog.jsonb_typeof(s->'direct') IS DISTINCT FROM 'string'
        OR pg_catalog.jsonb_typeof(s->'recorded') IS DISTINCT FROM 'string'
        OR pg_catalog.jsonb_typeof(s->'who') IS DISTINCT FROM 'string'
        OR (s->>'block_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_document->'blocks') b WHERE b->>'id'=s->>'block_id'))) THEN
    RAISE EXCEPTION 'Ordre, durée ou appartenance invalide' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*)<>count(DISTINCT (b->>'id')::uuid) FROM pg_catalog.jsonb_array_elements(p_document->'blocks') b)
    OR (SELECT count(*)<>count(DISTINCT (s->>'id')::uuid) FROM pg_catalog.jsonb_array_elements(p_document->'sequences') s) THEN
    RAISE EXCEPTION 'Identifiants dupliqués' USING ERRCODE='22023';
  END IF;
  IF EXISTS(WITH ordered AS (SELECT s->>'block_id' AS block,
    lag(s->>'block_id') OVER(ORDER BY n) AS previous
    FROM pg_catalog.jsonb_array_elements(p_document->'sequences') WITH ORDINALITY x(s,n))
    SELECT 1 FROM ordered o WHERE o.block IS NOT NULL AND o.block IS DISTINCT FROM o.previous GROUP BY o.block HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Bloc fragmenté' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.blocks b JOIN pg_catalog.jsonb_array_elements(p_document->'blocks') x ON b.id=(x->>'id')::uuid WHERE b.emission_id<>p_emission_id)
    OR EXISTS(SELECT 1 FROM public.sequences s JOIN pg_catalog.jsonb_array_elements(p_document->'sequences') x ON s.id=(x->>'id')::uuid WHERE s.emission_id<>p_emission_id)
    OR EXISTS(SELECT 1 FROM public.sequences s JOIN public.blocks b ON b.id=s.block_id WHERE b.emission_id=p_emission_id AND s.emission_id<>p_emission_id) THEN
    RAISE EXCEPTION 'Un élément appartient à une autre émission' USING ERRCODE='22023';
  END IF;
  IF current.id IS NULL THEN
    INSERT INTO public.emissions(id,theme,emission_date,start_time,is_template,space_id)
      VALUES(p_emission_id,meta.theme,meta.emission_date,meta.start_time,meta.is_template,meta.space_id);
  ELSE
    IF p_checkpoint THEN
      previous:=radio_v19_private.document(p_emission_id);
      PERFORM radio_v19_private.checkpoint(p_emission_id,previous,'before_structure');
    END IF;
    UPDATE public.emissions SET theme=meta.theme,emission_date=meta.emission_date,start_time=meta.start_time,
      is_template=meta.is_template,space_id=meta.space_id WHERE id=p_emission_id;
  END IF;
  -- Supprimer uniquement les éléments absents du nouvel état, conserver UUID et created_at des autres.
  DELETE FROM public.sequences s WHERE emission_id=p_emission_id AND NOT EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_document->'sequences') x WHERE (x->>'id')::uuid=s.id);
  INSERT INTO public.blocks(id,emission_id,title,position)
    SELECT id,p_emission_id,title,position FROM pg_catalog.jsonb_populate_recordset(NULL::public.blocks,p_document->'blocks')
    ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,position=EXCLUDED.position
      WHERE (blocks.title,blocks.position) IS DISTINCT FROM (EXCLUDED.title,EXCLUDED.position);
  INSERT INTO public.sequences(id,emission_id,position,type,direct,recorded,duration_seconds,who,block_id)
    SELECT id,p_emission_id,position,type,direct,recorded,duration_seconds,who,block_id
      FROM pg_catalog.jsonb_populate_recordset(NULL::public.sequences,p_document->'sequences')
    ON CONFLICT(id) DO UPDATE SET position=EXCLUDED.position,type=EXCLUDED.type,direct=EXCLUDED.direct,
      recorded=EXCLUDED.recorded,duration_seconds=EXCLUDED.duration_seconds,who=EXCLUDED.who,block_id=EXCLUDED.block_id
      WHERE (sequences.position,sequences.type,sequences.direct,sequences.recorded,sequences.duration_seconds,sequences.who,sequences.block_id)
        IS DISTINCT FROM (EXCLUDED.position,EXCLUDED.type,EXCLUDED.direct,EXCLUDED.recorded,EXCLUDED.duration_seconds,EXCLUDED.who,EXCLUDED.block_id);
  DELETE FROM public.blocks b WHERE emission_id=p_emission_id AND NOT EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_document->'blocks') x WHERE (x->>'id')::uuid=b.id);
  RETURN public.radio_v19_read(p_emission_id);
END;
$$;

CREATE FUNCTION public.radio_v19_delete(p_emission_id uuid,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rev bigint;
BEGIN
  PERFORM radio_v19_private.lock_writes();
  SELECT v19_revision INTO rev FROM public.emissions WHERE id=p_emission_id FOR UPDATE;
  IF rev IS NULL OR p_expected_revision IS NULL OR rev<>p_expected_revision THEN
    RAISE EXCEPTION 'Conducteur modifié ou supprimé' USING ERRCODE='40001';
  END IF;
  IF EXISTS(SELECT 1 FROM public.sequences s JOIN public.blocks b ON s.block_id=b.id
    WHERE b.emission_id=p_emission_id AND s.emission_id<>p_emission_id) THEN
    RAISE EXCEPTION 'Bloc utilisé par une autre émission' USING ERRCODE='22023';
  END IF;
  DELETE FROM public.emissions WHERE id=p_emission_id;
  RETURN pg_catalog.jsonb_build_object('emission_id',p_emission_id,'deleted',true);
END;
$$;

CREATE FUNCTION public.radio_v19_space(p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE created public.spaces;
BEGIN
  PERFORM radio_v19_private.lock_writes();
  IF p_name IS NULL OR pg_catalog.length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Nom espace invalide' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.spaces(name,position) SELECT pg_catalog.btrim(p_name),COALESCE(max(position)+1,0) FROM public.spaces
    RETURNING * INTO created;
  RETURN pg_catalog.to_jsonb(created);
END;
$$;
REVOKE ALL ON FUNCTION public.radio_v19_list(uuid),public.radio_v19_read(uuid), public.radio_v19_commit(uuid,bigint,jsonb,boolean),
  public.radio_v19_delete(uuid,bigint),public.radio_v19_space(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.radio_v19_list(uuid),public.radio_v19_read(uuid), public.radio_v19_commit(uuid,bigint,jsonb,boolean),
  public.radio_v19_delete(uuid,bigint),public.radio_v19_space(text) TO anon,authenticated;
COMMIT;
