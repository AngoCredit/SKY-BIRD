-- =============================================================================
-- FIX_CLIENT_ENGINE_TICK.sql
-- SKYBIRD — Expõe função segura para o browser acionar o avanço de estado
-- quando o worker server-side não está ativo.
--
-- SEGURANÇA: Esta função apenas lê o estado atual e chama tick_game_engine()
-- sem expor seeds ou dados financeiros. O tick financeiro continua
-- 100% server-side no PostgreSQL.
--
-- Execute este script no SQL Editor do Supabase
-- =============================================================================

-- Função pública segura: encapsula tick_game_engine() para uso pelo browser.
-- Só avança o estado se o worker não estiver ativo (advisory lock livre).
CREATE OR REPLACE FUNCTION public.client_tick_engine()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_locked boolean;
BEGIN
  -- Tentar obter o advisory lock (key = 0x534b5942 = 'SKYB')
  -- Se o worker server-side estiver rodando, ele segura o lock e o browser recua
  SELECT pg_try_advisory_lock(1397244738) INTO v_locked;

  IF NOT v_locked THEN
    -- Worker ativo — não fazer nada, apenas retornar estado atual
    RETURN jsonb_build_object('action', 'worker_active');
  END IF;

  BEGIN
    -- Worker não está ativo — o browser cobre o tick
    v_result := public.tick_game_engine();
  EXCEPTION WHEN OTHERS THEN
    v_result := jsonb_build_object('action', 'error', 'msg', SQLERRM);
  END;

  -- Liberar o lock imediatamente após o tick
  PERFORM pg_advisory_unlock(1397244738);

  RETURN v_result;
END;
$$;

-- Permitir que utilizadores autenticados chamem esta função
GRANT EXECUTE ON FUNCTION public.client_tick_engine() TO authenticated;

-- Confirmar
SELECT 'FIX_CLIENT_ENGINE_TICK.sql aplicado com sucesso.' AS status;
