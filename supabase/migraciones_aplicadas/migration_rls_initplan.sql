-- Rendimiento de RLS: en las políticas de public, current_user_role() y auth.uid() se
-- evalúan UNA VEZ POR FILA (son funciones STABLE con SECURITY DEFINER, Postgres no las
-- sube a un InitPlan por sí solo). Envolverlas en (select ...) hace que se evalúen una sola
-- vez por consulta — es la recomendación de Supabase para tablas que crecen (movimientos,
-- cotizacion_lineas, audit_logs, etc.). No cambia quién puede ver o escribir qué.
--
-- Recorre pg_policies y reescribe con ALTER POLICY solo lo que falta envolver; las políticas
-- que ya tienen (select ...) se saltan. Es idempotente y corre en una transacción: si algo
-- no se pudiera reescribir, no cambia nada. Al final lista las políticas modificadas.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

DO $$
DECLARE
  p   RECORD;
  nq  TEXT;
  nc  TEXT;
  n   INTEGER := 0;
  re  CONSTANT TEXT := '(?<!SELECT )(current_user_role\(\)|auth\.uid\(\)|auth\.role\(\))';
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) ~ '(current_user_role|auth\.uid|auth\.role)\(\)'
  LOOP
    nq := regexp_replace(p.qual,       re, '(select \1)', 'g');
    nc := regexp_replace(p.with_check, re, '(select \1)', 'g');
    IF nq IS DISTINCT FROM p.qual OR nc IS DISTINCT FROM p.with_check THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I%s%s',
        p.policyname, p.schemaname, p.tablename,
        CASE WHEN nq IS NOT NULL THEN ' USING (' || nq || ')' ELSE '' END,
        CASE WHEN nc IS NOT NULL THEN ' WITH CHECK (' || nc || ')' ELSE '' END
      );
      n := n + 1;
      RAISE NOTICE 'Política actualizada: %.% -> %', p.tablename, p.policyname, COALESCE(nq, nc);
    END IF;
  END LOOP;
  RAISE NOTICE 'Políticas actualizadas: %', n;
END $$;
