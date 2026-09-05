import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { AltitudeStage, GameRound, GraphicQuality, User } from '../../types';
import { store } from '../../services/store';
import { audioManager } from '../../services/audioManager';
import { SkybirdCanvas } from './SkybirdCanvas';
import { MultiplierDisplay } from './MultiplierDisplay';
import { BettingPanel } from './BettingPanel';
import { RoundHistory } from './RoundHistory';
import { LiveBetsList } from './LiveBetsList';
import { FairnessModal } from './FairnessModal';
import { Volume2, VolumeX, HelpCircle, PlusCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useTranslation } from '../../services/i18n';

interface GameViewProps {
  currentUser: User;
  onOpenDeposit: () => void;
  onOpenSupport: () => void;
}

export const GameView: React.FC<GameViewProps> = ({ currentUser, onOpenDeposit }) => {
  const { t } = useTranslation();
  const [currentRound, setCurrentRound] = useState<GameRound>(store.getCurrentRound());
  const [wallet, setWallet] = useState(store.getWallet(currentUser.id));
  const [pastRounds, setPastRounds] = useState<GameRound[]>(store.getPastRounds());
  const [activeBets, setActiveBets] = useState(store.getActiveBets());
  const [currency] = useState<'USD'>('USD');

  // Game Engine State
  const [multiplier, setMultiplier] = useState<number>(1.00);
  const [countdown, setCountdown] = useState<number>(3);

  // Panel 1 State
  const [hasActiveBet1, setHasActiveBet1] = useState<boolean>(false);
  const [betAmount1, setBetAmount1] = useState<number>(0);
  const [isQueued1, setIsQueued1] = useState<boolean>(false);
  const [queuedBet1, setQueuedBet1] = useState<{ amount: number; autoCashOut: number | null } | null>(null);
  const [autoBetEnabled1, setAutoBetEnabled1] = useState<boolean>(false);
  const [autoCashOutEnabled1, setAutoCashOutEnabled1] = useState<boolean>(false);
  const [autoCashOutMultiplier1, setAutoCashOutMultiplier1] = useState<number>(2.0);
  const [hasCashedOut1, setHasCashedOut1] = useState<boolean>(false);
  const [cashedOutMultiplier1, setCashedOutMultiplier1] = useState<number | null>(null);
  const [cashedOutPayout1, setCashedOutPayout1] = useState<number | null>(null);

  // Panel 2 State (Aviator Dual Betting)
  const [showSecondPanel, setShowSecondPanel] = useState<boolean>(false);
  const [hasActiveBet2, setHasActiveBet2] = useState<boolean>(false);
  const [betAmount2, setBetAmount2] = useState<number>(0);
  const [isQueued2, setIsQueued2] = useState<boolean>(false);
  const [queuedBet2, setQueuedBet2] = useState<{ amount: number; autoCashOut: number | null } | null>(null);
  const [autoBetEnabled2, setAutoBetEnabled2] = useState<boolean>(false);
  const [autoCashOutEnabled2, setAutoCashOutEnabled2] = useState<boolean>(false);
  const [autoCashOutMultiplier2, setAutoCashOutMultiplier2] = useState<number>(2.0);
  const [hasCashedOut2, setHasCashedOut2] = useState<boolean>(false);
  const [cashedOutMultiplier2, setCashedOutMultiplier2] = useState<number | null>(null);
  const [cashedOutPayout2, setCashedOutPayout2] = useState<number | null>(null);

  // Settings & Modals
  const [quality, setQuality] = useState<GraphicQuality>('HIGH');
  const [isMuted, setIsMuted] = useState<boolean>(audioManager.getConfig().muted);
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);
  const [selectedFairnessRound, setSelectedFairnessRound] = useState<GameRound | null>(null);

  const loopTimerRef = useRef<number | null>(null);
  const runStartRef = useRef<number>(0);
  const multiplierRef = useRef<number>(1.00);
  const currentRoundRef = useRef<GameRound>(currentRound);
  // Track which round we last triggered AutoBets for — prevents 60fps repeat calls
  const lastAutoBetRoundRef = useRef<number>(-1);
  const lastCountdownSecRef = useRef<number>(-1);

  useEffect(() => {
    currentRoundRef.current = currentRound;
  }, [currentRound]);

  // High frequency atomic refs for Panel 1
  const hasActiveBet1Ref = useRef<boolean>(false);
  const isPlacingBet1Ref = useRef<boolean>(false);
  const hasCashedOut1Ref = useRef<boolean>(false);
  const autoBetEnabled1Ref = useRef<boolean>(false);
  const autoCashOutEnabled1Ref = useRef<boolean>(false);
  const autoCashOutMultiplier1Ref = useRef<number>(2.0);
  const lastBetAmount1Ref = useRef<number>(25);

  // High frequency atomic refs for Panel 2
  const hasActiveBet2Ref = useRef<boolean>(false);
  const isPlacingBet2Ref = useRef<boolean>(false);
  const hasCashedOut2Ref = useRef<boolean>(false);
  const autoBetEnabled2Ref = useRef<boolean>(false);
  const autoCashOutEnabled2Ref = useRef<boolean>(false);
  const autoCashOutMultiplier2Ref = useRef<number>(2.0);
  const lastBetAmount2Ref = useRef<number>(25);

  // Sync refs with state
  useEffect(() => {
    multiplierRef.current = multiplier;
  }, [multiplier]);

  useEffect(() => {
    hasActiveBet1Ref.current = hasActiveBet1;
  }, [hasActiveBet1]);

  useEffect(() => {
    hasCashedOut1Ref.current = hasCashedOut1;
  }, [hasCashedOut1]);

  useEffect(() => {
    autoBetEnabled1Ref.current = autoBetEnabled1;
  }, [autoBetEnabled1]);

  useEffect(() => {
    autoCashOutEnabled1Ref.current = autoCashOutEnabled1;
  }, [autoCashOutEnabled1]);

  useEffect(() => {
    autoCashOutMultiplier1Ref.current = autoCashOutMultiplier1;
  }, [autoCashOutMultiplier1]);

  useEffect(() => {
    hasActiveBet2Ref.current = hasActiveBet2;
  }, [hasActiveBet2]);

  useEffect(() => {
    hasCashedOut2Ref.current = hasCashedOut2;
  }, [hasCashedOut2]);

  useEffect(() => {
    autoBetEnabled2Ref.current = autoBetEnabled2;
  }, [autoBetEnabled2]);

  useEffect(() => {
    autoCashOutEnabled2Ref.current = autoCashOutEnabled2;
  }, [autoCashOutEnabled2]);

  useEffect(() => {
    autoCashOutMultiplier2Ref.current = autoCashOutMultiplier2;
  }, [autoCashOutMultiplier2]);

  // Sync with store updates
  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setWallet(store.getWallet(currentUser.id));
      setPastRounds(store.getPastRounds());
      setActiveBets(store.getActiveBets());
    });
    return () => unsubscribe();
  }, [currentUser.id]);

  // Force-stop all ambient audio when GameView unmounts (user navigates away)
  // This prevents orphaned oscillator nodes from running indefinitely in the background
  useEffect(() => {
    return () => {
      audioManager.forceStopFlightAmbient();
    };
  }, []);

  const getAltitudeStage = (mult: number): AltitudeStage => {
    if (mult < 1.50) return 'STAGE_1_BLUE_SKY';
    if (mult < 2.50) return 'STAGE_2_HIGH_CLOUDS';
    if (mult < 4.50) return 'STAGE_3_RAIN_LIGHTNING';
    if (mult < 8.00) return 'STAGE_4_STORM_DEBRIS';
    if (mult < 15.00) return 'STAGE_5_MESOSPHERE';
    return 'STAGE_6_COSMIC_SPACE';
  };

  const altitudeStage = (currentRound.status === 'COUNTDOWN' || currentRound.status === 'WAITING')
    ? 'STAGE_1_BLUE_SKY'
    : getAltitudeStage(multiplier);

  // Handle cashout action for Panel 1 or Panel 2
  const handleCashOut = useCallback(async (panelId: number = 1) => {
    const isP1 = panelId === 1;
    const activeRef = isP1 ? hasActiveBet1Ref : hasActiveBet2Ref;
    const cashedRef = isP1 ? hasCashedOut1Ref : hasCashedOut2Ref;

    // Guard check: active bet must exist, not already cashed out, and flight MUST be running
    const currentRound = store.getCurrentRound();
    if (!activeRef.current || cashedRef.current || currentRound.status !== 'RUNNING') {
      return;
    }

    // Marcar imediatamente para evitar duplo click
    cashedRef.current = true;

    const currentMult = multiplierRef.current || 1.00;
    const activeBet = store.getActiveBets().find(b => b.isCurrentUser && b.status === 'active');
    const estimatedPayout = activeBet ? Math.round(activeBet.amount * currentMult * 100) / 100 : 0;

    // 🚀 OPTIMISTIC UPDATE: Atualiza a interface INSTANTANEAMENTE ao clicar (0ms de atraso visual)
    if (isP1) {
      setHasCashedOut1(true);
      setCashedOutMultiplier1(currentMult);
      setCashedOutPayout1(estimatedPayout);
    } else {
      setHasCashedOut2(true);
      setCashedOutMultiplier2(currentMult);
      setCashedOutPayout2(estimatedPayout);
    }

    audioManager.playCashOut();

    try {
      // Processa a validação financeira e a atualização de saldo em segundo plano via RPC
      const result = await store.cashOutAsync(currentMult, panelId);

      // Confirmar valores exatos retornados pelo servidor PostgreSQL
      if (isP1) {
        setCashedOutMultiplier1(result.multiplier);
        setCashedOutPayout1(result.payout);
      } else {
        setCashedOutMultiplier2(result.multiplier);
        setCashedOutPayout2(result.payout);
      }

      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.75 },
        colors: ['#22c55e', '#06b6d4', '#f59e0b', '#ec4899', '#3b82f6']
      });
    } catch (e) {
      // Se o servidor rejeitar (ex: rodada já caiu no banco), reverter estado otimista
      cashedRef.current = false;
      if (isP1) {
        setHasCashedOut1(false);
        setCashedOutMultiplier1(null);
        setCashedOutPayout1(null);
      } else {
        setHasCashedOut2(false);
        setCashedOutMultiplier2(null);
        setCashedOutPayout2(null);
      }

      const errMsg = e instanceof Error ? e.message : String(e);
      console.warn('Cash out error:', errMsg);
      alert(`Falha no Cash Out: ${errMsg}`);
    }
  }, []);

  // Place bet action (handles immediate placement during WAITING/COUNTDOWN or scheduling during flight)
  const handlePlaceBet = useCallback(async (amount: number, autoCashOut: number | null, panelId: number = 1) => {
    const isP1 = panelId === 1;
    const placingRef = isP1 ? isPlacingBet1Ref : isPlacingBet2Ref;
    const activeRef = isP1 ? hasActiveBet1Ref : hasActiveBet2Ref;

    if (placingRef.current || activeRef.current) return;
    placingRef.current = true;

    const round = store.getCurrentRound();

    if (round.status === 'RUNNING' || round.status === 'CRASHED') {
      // Schedule bet for the next round
      if (isP1) {
        setIsQueued1(true);
        setQueuedBet1({ amount, autoCashOut });
        lastBetAmount1Ref.current = amount;
      } else {
        setIsQueued2(true);
        setQueuedBet2({ amount, autoCashOut });
        lastBetAmount2Ref.current = amount;
      }
      placingRef.current = false;
      audioManager.playButtonClick();
      return;
    }

    try {
      // Usar placeBetAsync: valida no servidor se Supabase configurado
      const { bet } = await store.placeBetAsync(amount, autoCashOut, panelId);
      void bet; // bet registado no store

      if (isP1) {
        hasActiveBet1Ref.current = true;
        hasCashedOut1Ref.current = false;
        lastBetAmount1Ref.current = amount;

        setHasActiveBet1(true);
        setBetAmount1(amount);
        setIsQueued1(false);
        setQueuedBet1(null);
        setHasCashedOut1(false);
        setCashedOutMultiplier1(null);
        setCashedOutPayout1(null);
      } else {
        hasActiveBet2Ref.current = true;
        hasCashedOut2Ref.current = false;
        lastBetAmount2Ref.current = amount;

        setHasActiveBet2(true);
        setBetAmount2(amount);
        setIsQueued2(false);
        setQueuedBet2(null);
        setHasCashedOut2(false);
        setCashedOutMultiplier2(null);
        setCashedOutPayout2(null);
      }

      audioManager.playButtonClick();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao registrar aposta.';
      alert(msg);
      console.warn('Falha ao registrar aposta:', err);
    } finally {
      placingRef.current = false;
    }
  }, []);

  const handleCancelBet = useCallback((panelId: number = 1) => {
    try {
      store.cancelBet(panelId);
      if (panelId === 1) {
        hasActiveBet1Ref.current = false;
        setHasActiveBet1(false);
        setBetAmount1(0);
      } else {
        hasActiveBet2Ref.current = false;
        setHasActiveBet2(false);
        setBetAmount2(0);
      }
      audioManager.playButtonClick();
    } catch (err) {
      console.warn('Falha ao cancelar aposta:', err);
    }
  }, []);

  const handleCancelQueuedBet = useCallback((panelId: number = 1) => {
    if (panelId === 1) {
      setIsQueued1(false);
      setQueuedBet1(null);
    } else {
      setIsQueued2(false);
      setQueuedBet2(null);
    }
    audioManager.playButtonClick();
  }, []);

  // Auto Bet Trigger & Queued Bets placement at round start (COUNTDOWN / WAITING)
  const triggerAutoBets = useCallback(() => {
    const currentWal = store.getWallet(currentUser.id);

    // 1. Process Queued Bets first
    if (queuedBet1 && !hasActiveBet1Ref.current && !isPlacingBet1Ref.current) {
      if (currentWal.availableBalance >= queuedBet1.amount) {
        handlePlaceBet(queuedBet1.amount, queuedBet1.autoCashOut, 1);
      }
      setIsQueued1(false);
      setQueuedBet1(null);
    } else if (autoBetEnabled1Ref.current && !hasActiveBet1Ref.current && !isPlacingBet1Ref.current) {
      // Panel 1 Auto Bet
      const amt1 = lastBetAmount1Ref.current || (currency === 'EUR' ? 20 : 25);
      if (currentWal.availableBalance >= amt1) {
        const autoCash = autoCashOutEnabled1Ref.current ? autoCashOutMultiplier1Ref.current : null;
        handlePlaceBet(amt1, autoCash, 1);
      }
    }

    // 2. Panel 2 Queued or Auto Bet
    if (showSecondPanel) {
      const updatedWal = store.getWallet(currentUser.id);
      if (queuedBet2 && !hasActiveBet2Ref.current && !isPlacingBet2Ref.current) {
        if (updatedWal.availableBalance >= queuedBet2.amount) {
          handlePlaceBet(queuedBet2.amount, queuedBet2.autoCashOut, 2);
        }
        setIsQueued2(false);
        setQueuedBet2(null);
      } else if (autoBetEnabled2Ref.current && !hasActiveBet2Ref.current && !isPlacingBet2Ref.current) {
        const amt2 = lastBetAmount2Ref.current || (currency === 'EUR' ? 20 : 25);
        if (updatedWal.availableBalance >= amt2) {
          const autoCash2 = autoCashOutEnabled2Ref.current ? autoCashOutMultiplier2Ref.current : null;
          handlePlaceBet(amt2, autoCash2, 2);
        }
      }
    }
  }, [currentUser.id, currency, showSecondPanel, queuedBet1, queuedBet2, handlePlaceBet]);

  // Main Game Loop (Global Realtime Epoch Sync)
  // PERFORMANCE: getSynchronizedRoundState() e getCurrentRound() são funções pesadas
  // (cálculo criptográfico + loops). Throttle para máx 10x/seg (100ms).
  // Auto-cashout continua a 60fps usando refs leves (sem re-render React).
  const lastStateTickRef = useRef<number>(0);
  const lastSyncStateRef = useRef<ReturnType<typeof store.getSynchronizedRoundState> | null>(null);

  useEffect(() => {
    let loopId: number;

    const gameLoop = () => {
      // ── ESTADO E MULTIPLICADOR DO JOGO a 60fps em tempo real ──────────────────
      const syncState = store.getSynchronizedRoundState();
      lastSyncStateRef.current = syncState;
      const activeRound = store.getCurrentRound();

      const curMult = syncState.currentMultiplier;
      multiplierRef.current = curMult;

      // ── AUTO-CASHOUT a 60fps ──────────────────────────────────────────────────
      if (syncState.status === 'RUNNING') {
        if (
          hasActiveBet1Ref.current &&
          !hasCashedOut1Ref.current &&
          autoCashOutEnabled1Ref.current &&
          curMult >= autoCashOutMultiplier1Ref.current
        ) {
          handleCashOut(1);
        }
        if (
          hasActiveBet2Ref.current &&
          !hasCashedOut2Ref.current &&
          autoCashOutEnabled2Ref.current &&
          curMult >= autoCashOutMultiplier2Ref.current
        ) {
          handleCashOut(2);
        }
      }

      if (syncState.status === 'COUNTDOWN') {
        // Som de countdown por segundo (sem disparar no mesmo segundo)
        if (syncState.countdownRemaining !== lastCountdownSecRef.current) {
          lastCountdownSecRef.current = syncState.countdownRemaining;
          try { audioManager.playCountdown(syncState.countdownRemaining === 0); } catch {}
        }
        setCountdown(syncState.countdownRemaining);

        const isNewRound = currentRoundRef.current.roundNumber !== syncState.roundNumber;
        const wasNotCountdown = currentRoundRef.current.status !== 'COUNTDOWN';

        if (isNewRound || wasNotCountdown) {
          setCurrentRound(activeRound);
          currentRoundRef.current = activeRound;
          setMultiplier(1.00);
          multiplierRef.current = 1.00;

          // Reset Panel 1 — para a nova rodada
          if (!isPlacingBet1Ref.current) {
            const hasStoreBet1 = store.getActiveBets().some(b => b.isCurrentUser && b.status === 'active' && (b.panelId === 1 || !b.panelId));
            hasCashedOut1Ref.current = false;
            hasActiveBet1Ref.current = hasStoreBet1;
            setHasActiveBet1(hasStoreBet1);
            if (!hasStoreBet1) {
              setBetAmount1(0);
            }
            setHasCashedOut1(false);
            setCashedOutMultiplier1(null);
            setCashedOutPayout1(null);
          }

          // Reset Panel 2 — para a nova rodada
          if (!isPlacingBet2Ref.current) {
            const hasStoreBet2 = store.getActiveBets().some(b => b.isCurrentUser && b.status === 'active' && b.panelId === 2);
            hasCashedOut2Ref.current = false;
            hasActiveBet2Ref.current = hasStoreBet2;
            setHasActiveBet2(hasStoreBet2);
            if (!hasStoreBet2) {
              setBetAmount2(0);
            }
            setHasCashedOut2(false);
            setCashedOutMultiplier2(null);
            setCashedOutPayout2(null);
          }
        }

        // Trigger auto/queued bets exactamente uma vez por rodada (após o reset dos painéis)
        if (syncState.roundNumber !== lastAutoBetRoundRef.current) {
          lastAutoBetRoundRef.current = syncState.roundNumber;
          triggerAutoBets();
        }
      } else if (syncState.status === 'RUNNING') {
        if (currentRoundRef.current.status !== 'RUNNING' || currentRoundRef.current.roundNumber !== syncState.roundNumber) {
          const updatedRound = { ...activeRound, status: 'RUNNING' as const };
          setCurrentRound(updatedRound);
          currentRoundRef.current = updatedRound;
          try { audioManager.playCountdown(true); } catch {}
          try { audioManager.startFlightAmbient(); } catch {}
        }

        const calculatedMult = syncState.currentMultiplier;
        setMultiplier(calculatedMult);
        multiplierRef.current = calculatedMult;

        const stage = getAltitudeStage(calculatedMult);
        try { audioManager.updateFlightIntensity(calculatedMult, stage); } catch {}
        store.triggerBotCashouts(calculatedMult);
      } else if (syncState.status === 'CRASHED') {
        const finalPoint = syncState.crashPoint;

        // Instantaneous synchronization: freeze multiplier at exact crash point
        setMultiplier(finalPoint);
        multiplierRef.current = finalPoint;

        if (currentRoundRef.current.status !== 'CRASHED' || currentRoundRef.current.roundNumber !== syncState.roundNumber) {
          // 1. Immediately kill flight ambient & trigger atomic explosion audio
          try { audioManager.stopFlightAmbient(); } catch {}
          try { audioManager.playCrash(); } catch {}

          // 2. Update store and state in sync
          store.endRound(finalPoint);
          const updated = { ...activeRound, status: 'CRASHED' as const, crashPoint: finalPoint };
          setCurrentRound(updated);
          currentRoundRef.current = updated;

          // 3. Keep active bet state intact until next round COUNTDOWN reset
        }
      }

      loopId = requestAnimationFrame(gameLoop);
    };

    loopId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(loopId);
  }, [triggerAutoBets, handleCashOut]);

  const toggleSound = () => {
    const muted = audioManager.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-2.5 select-none font-sans">
      {/* Top Game Bar (Header info - Mobile responsive) */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-1 py-1 overflow-x-auto no-scrollbar">
        {/* Left: Aviator Live Indicator & Round # */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-bold text-[11px] sm:text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span>AVIATOR SKYBIRD</span>
          </div>
          <span className="text-[10px] sm:text-xs text-slate-400 font-mono">
            #{currentRound.roundNumber}
          </span>
        </div>

        {/* Right: USD Official Badge, How to Play & Sound */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* USD Currency Badge */}
          <div
            className="px-2 py-0.5 rounded-lg bg-[#18202d] border border-[#28354c] text-[11px] sm:text-xs font-mono font-bold text-cyan-300 flex items-center gap-1"
          >
            <span>$ USD</span>
          </div>

          {/* How to play button */}
          <button
            id="btn-how-to-play"
            type="button"
            onClick={() => setShowHowToPlay(true)}
            className="p-1 sm:px-2 py-0.5 rounded-lg bg-[#18202d] hover:bg-[#222c3e] border border-[#28354c] text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1 text-[11px]"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xs:inline">{t('game.howToPlay', 'Como Jogar?')}</span>
          </button>

          {/* Sound Toggle & Manual Unlock */}
          <button
            id="btn-toggle-sound"
            type="button"
            onClick={() => {
              audioManager.ensureContext();
              audioManager.playButtonClick();
              toggleSound();
            }}
            title={isMuted ? t('game.soundOn', 'Ativar Som') : t('game.soundOff', 'Desativar Som')}
            className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
              isMuted
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500/20'
                : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            {isMuted ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                <span className="hidden xs:inline">SEM SOM</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden xs:inline">SOM</span>
              </>
            )}
          </button>

          {/* Add 2nd Bet Panel Toggle */}
          {!showSecondPanel && (
            <button
              id="btn-add-second-bet"
              type="button"
              onClick={() => setShowSecondPanel(true)}
              className="px-2 py-0.5 rounded-lg bg-[#1a2538] hover:bg-[#233148] border border-cyan-500/40 text-cyan-300 hover:text-cyan-200 text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
            >
              <PlusCircle className="w-3 h-3" />
              <span>{t('game.addPanel', '+2ª Aposta')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Aviator Frame: Grid (Left Sidebar + Center Canvas & Bet Panels) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-2.5 items-start">
        {/* Left Column: Tabbed Bets (Todas | Minhas | Top) - Col 4 on Desktop */}
        <div className="lg:col-span-4 order-2 lg:order-1">
          <LiveBetsList
            bets={activeBets}
            currentMultiplier={multiplier}
            currency={currency}
          />
        </div>

        {/* Right / Center Main Game Console - Col 8 on Desktop */}
        <div className="lg:col-span-8 order-1 lg:order-2 flex flex-col gap-2">
          {/* Framed Canvas Container with Integrated Top History Ribbon */}
          <div className="relative w-full rounded-xl sm:rounded-2xl overflow-hidden border border-[#263143] bg-[#0b0e14] shadow-2xl flex flex-col">
            {/* Top Multiplier History Bar */}
            <RoundHistory
              rounds={pastRounds}
              onSelectRound={(round) => setSelectedFairnessRound(round)}
            />

            {/* Responsive flight viewport (never black or overflowing on Infinix mobile) */}
            <div className="relative w-full h-[220px] xs:h-[250px] sm:h-[320px] lg:h-[360px] min-h-[200px] overflow-hidden bg-gradient-to-b from-[#0e131d] via-[#090c12] to-[#05070a]">
              {/* Three.js Canvas */}
              <SkybirdCanvas
                status={currentRound.status}
                multiplier={multiplier}
                altitudeStage={altitudeStage}
                quality={quality}
              />

              {/* Multiplier HUD Overlay */}
              <MultiplierDisplay
                status={currentRound.status}
                multiplier={multiplier}
                crashPoint={currentRound.crashPoint}
                altitudeStage={altitudeStage}
                countdown={countdown}
                cashedOutMultiplier={cashedOutMultiplier1}
                cashedOutPayout={cashedOutPayout1}
                onOpenFairness={() => setSelectedFairnessRound(currentRound)}
              />
            </div>
          </div>

          {/* Betting Panels Container: Single or Dual Panels */}
          <div className={`grid ${showSecondPanel ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-2`}>
            {/* Betting Panel 1 */}
            <BettingPanel
              panelId={1}
              status={currentRound.status}
              currentMultiplier={multiplier}
              userBalance={wallet.availableBalance}
              hasActiveBet={hasActiveBet1}
              betAmount={betAmount1}
              isQueued={isQueued1}
              queuedAmount={queuedBet1?.amount || 0}
              hasCashedOut={hasCashedOut1}
              cashedOutMultiplier={cashedOutMultiplier1}
              cashedOutPayout={cashedOutPayout1}
              currency={currency}
              autoBetEnabled={autoBetEnabled1}
              onToggleAutoBet={setAutoBetEnabled1}
              autoCashOutEnabled={autoCashOutEnabled1}
              onToggleAutoCashOut={setAutoCashOutEnabled1}
              autoCashOutMultiplier={autoCashOutMultiplier1}
              onChangeAutoCashOutMultiplier={setAutoCashOutMultiplier1}
              onPlaceBet={handlePlaceBet}
              onCancelBet={handleCancelBet}
              onCancelQueuedBet={handleCancelQueuedBet}
              onCashOut={handleCashOut}
              onOpenDeposit={onOpenDeposit}
            />

            {/* Betting Panel 2 (Dual Bet) */}
            {showSecondPanel && (
              <BettingPanel
                panelId={2}
                status={currentRound.status}
                currentMultiplier={multiplier}
                userBalance={wallet.availableBalance}
                hasActiveBet={hasActiveBet2}
                betAmount={betAmount2}
                isQueued={isQueued2}
                queuedAmount={queuedBet2?.amount || 0}
                hasCashedOut={hasCashedOut2}
                cashedOutMultiplier={cashedOutMultiplier2}
                cashedOutPayout={cashedOutPayout2}
                currency={currency}
                autoBetEnabled={autoBetEnabled2}
                onToggleAutoBet={setAutoBetEnabled2}
                autoCashOutEnabled={autoCashOutEnabled2}
                onToggleAutoCashOut={setAutoCashOutEnabled2}
                autoCashOutMultiplier={autoCashOutMultiplier2}
                onChangeAutoCashOutMultiplier={setAutoCashOutMultiplier2}
                onPlaceBet={handlePlaceBet}
                onCancelBet={handleCancelBet}
                onCancelQueuedBet={handleCancelQueuedBet}
                onCashOut={handleCashOut}
                onOpenDeposit={onOpenDeposit}
                onRemovePanel={() => setShowSecondPanel(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* How to Play Modal (Bantu Bet Aviator Rules) */}
      {showHowToPlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-[#121722] border border-[#28354c] rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#212b3d]">
              <div className="flex items-center gap-2 font-bold text-white text-base">
                <HelpCircle className="w-5 h-5 text-amber-400" />
                <span>Como Jogar o Aviator</span>
              </div>
              <button
                onClick={() => setShowHowToPlay(false)}
                className="p-1 rounded-lg hover:bg-[#1f2838] text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="p-3 rounded-xl bg-[#171e2c] border border-[#263348]">
                <strong className="text-emerald-400 font-bold block mb-1">1. Faça sua Aposta</strong>
                Escolha o valor desejado antes da decolagem e clique no botão verde <span className="font-bold text-emerald-400">"APOSTA"</span>. Você pode apostar em até 2 painéis simultaneamente!
              </div>

              <div className="p-3 rounded-xl bg-[#171e2c] border border-[#263348]">
                <strong className="text-cyan-300 font-bold block mb-1">2. Acompanhe a Decolagem</strong>
                O avião decola e o multiplicador cresce exponencialmente a partir de 1.00x em direção às alturas.
              </div>

              <div className="p-3 rounded-xl bg-[#171e2c] border border-[#263348]">
                <strong className="text-amber-300 font-bold block mb-1">3. Encerre a Aposta (Cash Out)</strong>
                Clique no botão amarelo/verde <span className="font-bold text-amber-300">"SACAR"</span> antes que o avião voe para longe! O seu prêmio é calculado multiplicando sua aposta pelo coeficiente exato do momento.
              </div>

              <div className="p-3 rounded-xl bg-[#171e2c] border border-[#263348]">
                <strong className="text-fuchsia-400 font-bold block mb-1">4. Auto Aposta e Auto Saque</strong>
                Ative a aba "Auto" para ligar a <strong>Auto Aposta</strong> (aposta a cada nova rodada automaticamente) e o <strong>Auto Saque</strong> para retirar lucros no multiplicador definido.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowHowToPlay(false)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold text-slate-950 text-xs uppercase tracking-wider hover:opacity-90 transition cursor-pointer"
            >
              Entendido, Vamos Jogar!
            </button>
          </div>
        </div>
      )}

      {/* Provably Fair Modal */}
      {selectedFairnessRound && (
        <FairnessModal
          round={selectedFairnessRound}
          onClose={() => setSelectedFairnessRound(null)}
        />
      )}
    </div>
  );
};
