-- Correctif de compatibilité PostgREST : conflit métier HTTP 409, sans réessai SQL.
-- Ne modifie ni tables, ni données, ni privilèges. Après les lots 001 à 004.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $patch$
DECLARE signature text; definition text; expected integer; found integer;
BEGIN
 FOR signature,expected IN SELECT * FROM (VALUES
  ('public.radio_v19_commit(uuid,bigint,jsonb,boolean)',2),
  ('public.radio_v19_delete(uuid,bigint)',1),
  ('public.radio_v19_restore(uuid,bigint,bigint)',1)
 ) AS functions(signature,expected)
 LOOP
  definition:=pg_catalog.pg_get_functiondef(signature::regprocedure);
  found:=pg_catalog.regexp_count(definition,'ERRCODE=''40001''');
  IF found=expected THEN
   EXECUTE pg_catalog.replace(definition,'ERRCODE=''40001''','ERRCODE=''PT409''');
  ELSIF found<>0 OR pg_catalog.regexp_count(definition,'ERRCODE=''PT409''')<>expected THEN
   RAISE EXCEPTION 'Définition inattendue : % ; aucune modification conservée',signature;
  END IF;
 END LOOP;
END;
$patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
