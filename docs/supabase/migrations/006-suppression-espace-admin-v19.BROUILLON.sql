-- Nouvelle action uniquement ; aucune suppression lors de l’installation.
-- Nécessite les migrations 001 à 005. Application après accord du propriétaire.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE radio_v19_private.admin_users(user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);
ALTER TABLE radio_v19_private.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON radio_v19_private.admin_users FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.radio_v19_delete_space(p_space_id uuid,p_expected_name text,p_expected_emissions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_name text; actual jsonb; expected jsonb; item record; deleted_count integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()
   AND id IN(SELECT user_id FROM radio_v19_private.admin_users) AND email_confirmed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Administration requise' USING ERRCODE='42501';
 END IF;
 PERFORM radio_v19_private.lock_writes();
 SELECT name INTO current_name FROM public.spaces WHERE id=p_space_id FOR UPDATE;
 IF current_name IS NULL OR p_expected_name IS DISTINCT FROM current_name THEN
  RAISE EXCEPTION 'Espace modifié ou supprimé. Rechargez la liste.' USING ERRCODE='PT409';
 END IF;
 IF p_expected_emissions IS NULL OR pg_catalog.jsonb_typeof(p_expected_emissions)<>'array' THEN
  RAISE EXCEPTION 'Liste des émissions requise' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_expected_emissions) x
  WHERE pg_catalog.jsonb_typeof(x)<>'object' OR (x->>'id') IS NULL OR (x->>'revision') IS NULL
   OR (x->>'revision')!~'^(0|[1-9][0-9]{0,18})$') THEN
  RAISE EXCEPTION 'Révisions invalides' USING ERRCODE='22023';
 END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',(x->>'id')::uuid,'revision',x->>'revision') ORDER BY (x->>'id')::uuid),'[]'::jsonb)
 INTO expected FROM pg_catalog.jsonb_array_elements(p_expected_emissions) x;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'revision',v19_revision::text) ORDER BY id),'[]'::jsonb)
 INTO actual FROM public.emissions WHERE space_id=p_space_id;
 IF actual IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'Le contenu de cet espace a changé. Vérifiez à nouveau avant suppression.' USING ERRCODE='PT409';
 END IF;
 FOR item IN SELECT id,v19_revision FROM public.emissions WHERE space_id=p_space_id ORDER BY id LOOP
  PERFORM public.radio_v19_delete(item.id,item.v19_revision);
  deleted_count:=deleted_count+1;
 END LOOP;
 DELETE FROM public.spaces WHERE id=p_space_id;
 RETURN pg_catalog.jsonb_build_object('space_id',p_space_id,'deleted',true,'emissions_trashed',deleted_count);
END;
$$;
REVOKE ALL ON FUNCTION public.radio_v19_delete_space(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.radio_v19_delete_space(uuid,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
