-- BROUILLON : base locale/test uniquement. Aucune autorisation d'exécution Supabase.
-- Après 001 et 002. Lecture paginée des émissions supprimées ; aucune purge.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION public.radio_v19_trash(
  p_space_id uuid DEFAULT NULL,
  p_before_deleted_at timestamptz DEFAULT NULL,
  p_before_emission_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR
    ((p_before_deleted_at IS NULL) <> (p_before_emission_id IS NULL)) THEN
    RAISE EXCEPTION 'Pagination de corbeille invalide' USING ERRCODE='22023';
  END IF;
  WITH candidates AS (
    SELECT h.emission_id,h.revision,h.deleted_at,h.snapshot
    FROM radio_v19_private.emission_heads h
    WHERE h.deleted_at IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM public.emissions e WHERE e.id=h.emission_id)
      AND (p_space_id IS NULL OR h.snapshot->'emission'->>'space_id'=p_space_id::text)
      AND (p_before_deleted_at IS NULL OR
        (h.deleted_at,h.emission_id)<(p_before_deleted_at,p_before_emission_id))
    ORDER BY h.deleted_at DESC,h.emission_id DESC LIMIT p_limit+1
  ), page AS (
    SELECT * FROM candidates ORDER BY deleted_at DESC,emission_id DESC LIMIT p_limit
  )
  SELECT pg_catalog.jsonb_build_object(
    'items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'emission_id',emission_id,'revision',revision::text,'deleted_at',deleted_at,
      'space_id',snapshot->'emission'->'space_id','theme',snapshot->'emission'->>'theme',
      'is_template',snapshot->'emission'->'is_template',
      'sequence_count',pg_catalog.jsonb_array_length(snapshot->'sequences'))
      ORDER BY deleted_at DESC,emission_id DESC) FROM page),'[]'::jsonb),
    'next_cursor',CASE WHEN (SELECT count(*) FROM candidates)>p_limit THEN
      (SELECT pg_catalog.jsonb_build_object('deleted_at',deleted_at,'emission_id',emission_id)
        FROM page ORDER BY deleted_at ASC,emission_id ASC LIMIT 1)
      ELSE NULL END
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.radio_v19_trash(uuid,timestamptz,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.radio_v19_trash(uuid,timestamptz,uuid,integer)
  TO anon,authenticated;
COMMIT;
