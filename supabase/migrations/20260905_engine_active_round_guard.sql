-- =============================================================================
-- SKY-BIRD — ONE ACTIVE ROUND ONLY
-- Correct the lifecycle guard to allow only one WAITING/COUNTDOWN/RUNNING
-- round across all active states.
-- =============================================================================

DROP INDEX IF EXISTS public.game_rounds_one_active_round_idx;

CREATE UNIQUE INDEX IF NOT EXISTS game_rounds_one_active_round_idx
ON public.game_rounds ((1))
WHERE status IN ('WAITING','COUNTDOWN','RUNNING');
