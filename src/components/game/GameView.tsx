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
import { Volume2, VolumeX, HelpCircle, PlusCircle, X } from 'lucide-react';
import { useTranslation } from '../../services/i18n';
import { authoritativeCashout, authoritativePlaceBet, authoritativeCancelBet, subscribeToAuthoritativeRound, visualMultiplier, getAuthoritativeRoundBets } from '../../services/authoritativeGame';

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
  const [multiplier, setMultiplier] = useState(1.00);
  const [countdown, setCountdown] = useState(3);

  const [hasActiveBet1, setHasActiveBet1] = useState(false);
  const [betAmount1, setBetAmount1] = useState(0);
  const [isQueued1, setIsQueued1] = useState(false);
  const [queuedBet1, setQueuedBet1] = useState<{ amount: number; autoCashOut: number | null } | null>(null);
  const [autoBetEnabled1, setAutoBetEnabled1] = useState(false);
  const [autoCashOutEnabled1, setAutoCashOutEnabled1] = useState(false);
  const [autoCashOutMultiplier1, setAutoCashOutMultiplier1] = useState(2.0);
  const [hasCashedOut1, setHasCashedOut1] = useState(false);
  const [cashedOutMultiplier1, setCashedOutMultiplier1] = useState<number | null>(null);
  const [cashedOutPayout1, setCashedOutPayout1] = useState<number | null>(null);

  const [showSecondPanel, setShowSecondPanel] = useState(false);
  const [hasActiveBet2, setHasActiveBet2] = useState(false);
  const [betAmount2, setBetAmount2] = useState(0);
  const [isQueued2, setIsQueued2] = useState(false);
  const [queuedBet2, setQueuedBet2] = useState<{ amount: number; autoCashOut: number | null } | null>(null);
  const [autoBetEnabled2, setAutoBetEnabled2] = useState(false);
  const [autoCashOutEnabled2, setAutoCashOutEnabled2] = useState(false);
  const [autoCashOutMultiplier2, setAutoCashOutMultiplier2] = useState(2.0);
  const [hasCashedOut2, setHasCashedOut2] = useState(false);
  const [cashedOutMultiplier2, setCashedOutMultiplier2] = useState<number | null>(null);
  const [cashedOutPayout2, setCashedOutPayout2] = useState<number | null>(null);

  const [quality, setQuality] = useState<GraphicQuality>('HIGH');
  const [isMuted, setIsMuted] = useState(audioManager.getConfig().muted);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [selectedFairnessRound, setSelectedFairnessRound] = useState<GameRound | null>(null);
  const [isProcessingCashOut1, setIsProcessingCashOut1] = useState(false);
  const [isProcessingCashOut2, setIsProcessingCashOut2] = useState(false);

  const currentRoundRef = useRef(currentRound);
  const multiplierRef = useRef(1.00);
  const hasActiveBet1Ref = useRef(false);
  const hasActiveBet2Ref = useRef(false);
  const hasCashedOut1Ref = useRef(false);
  const hasCashedOut2Ref = useRef(false);
  const isProcessingCashOut1Ref = useRef(false);
  const isProcessingCashOut2Ref = useRef(false);
  const isPlacingBet1Ref = useRef(false);
  const isPlacingBet2Ref = useRef(false);
  const autoBetEnabled1Ref = useRef(false);
  const autoBetEnabled2Ref = useRef(false);
  const autoCashOutEnabled1Ref = useRef(false);
  const autoCashOutEnabled2Ref = useRef(false);
  const autoCashOutMultiplier1Ref = useRef(2.0);
  const autoCashOutMultiplier2Ref = useRef(2.0);
  const lastBetAmount1Ref = useRef(25);
  const lastBetAmount2Ref = useRef(25);
  const lastAutoBetRoundRef = useRef(-1);
  const lastCountdownSecRef = useRef(-1);

  useEffect(() => { currentRoundRef.current = currentRound; }, [currentRound]);
  useEffect(() => { multiplierRef.current = multiplier; }, [multiplier]);
  useEffect(() => { hasActiveBet1Ref.current = hasActiveBet1; }, [hasActiveBet1]);
  useEffect(() => { hasActiveBet2Ref.current = hasActiveBet2; }, [hasActiveBet2]);
  useEffect(() => { hasCashedOut1Ref.current = hasCashedOut1; }, [hasCashedOut1]);
  useEffect(() => { hasCashedOut2Ref.current = hasCashedOut2; }, [hasCashedOut2]);
  useEffect(() => { autoBetEnabled1Ref.current = autoBetEnabled1; }, [autoBetEnabled1]);
  useEffect(() => { autoBetEnabled2Ref.current = autoBetEnabled2; }, [autoBetEnabled2]);
  useEffect(() => { autoCashOutEnabled1Ref.current = autoCashOutEnabled1; }, [autoCashOutEnabled1]);
  useEffect(() => { autoCashOutEnabled2Ref.current = autoCashOutEnabled2; }, [autoCashOutEnabled2]);
  useEffect(() => { autoCashOutMultiplier1Ref.current = autoCashOutMultiplier1; }, [autoCashOutMultiplier1]);
  useEffect(() => { autoCashOutMultiplier2Ref.current = autoCashOutMultiplier2; }, [autoCashOutMultiplier2]);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setWallet(store.getWallet(currentUser.id));
      setPastRounds(store.getPastRounds());
      setActiveBets(store.getActiveBets());
    });
    return unsubscribe;
  }, [currentUser.id]);

  useEffect(() => () => audioManager.forceStopFlightAmbient(), []);

  const getAltitudeStage = (mult: number): AltitudeStage => {
    if (mult < 1.50) return 'STAGE_1_BLUE_SKY';
    if (mult < 2.50) return 'STAGE_2_HIGH_CLOUDS';
    if (mult < 4.50) return 'STAGE_3_RAIN_LIGHTNING';
    if (mult < 8.00) return 'STAGE_4_STORM_DEBRIS';
    if (mult < 15.00) return 'STAGE_5_MESOSPHERE';
    return 'STAGE_6_COSMIC_SPACE';
  };

  const altitudeStage = currentRound.status === 'COUNTDOWN' || currentRound.status === 'WAITING' ? 'STAGE_1_BLUE_SKY' : getAltitudeStage(multiplier);

  const applyAuthoritativeBets = useCallback(async (roundId: string) => {
    try {
      const bets = await getAuthoritativeRoundBets(roundId);
      const own = bets.filter(b => b.isCurrentUser && b.status === 'active');
      const p1 = own.find(b => b.panelId === 1);
      const p2 = own.find(b => b.panelId === 2);
      hasActiveBet1Ref.current = !!p1;
      hasActiveBet2Ref.current = !!p2;
      setHasActiveBet1(!!p1); setHasActiveBet2(!!p2);
      setBetAmount1(p1?.amount ?? 0); setBetAmount2(p2?.amount ?? 0);
    } catch (error) { console.warn('[GameView] public bet feed unavailable:', error); }
  }, []);

  const handleCashOut = useCallback(async (panelId = 1) => {
    const isP1 = panelId === 1;
    const activeRef = isP1 ? hasActiveBet1Ref : hasActiveBet2Ref;
    const cashedRef = isP1 ? hasCashedOut1Ref : hasCashedOut2Ref;
    const processingRef = isP1 ? isProcessingCashOut1Ref : isProcessingCashOut2Ref;
    if (!activeRef.current || cashedRef.current || processingRef.current || currentRoundRef.current.status !== 'RUNNING') return;
    processingRef.current = true;
    if (isP1) setIsProcessingCashOut1(true); else setIsProcessingCashOut2(true);
    try {
      const own = store.getActiveBets().find(b => b.isCurrentUser && b.status === 'active' && b.panelId === panelId);
      if (!own?.id) throw new Error('BET_NOT_FOUND_IN_CLIENT_STATE');
      const result = await authoritativeCashout(own.id);
      cashedRef.current = true;
      if (isP1) { setHasCashedOut1(true); setCashedOutMultiplier1(result.multiplier); setCashedOutPayout1(result.payout); }
      else { setHasCashedOut2(true); setCashedOutMultiplier2(result.multiplier); setCashedOutPayout2(result.payout); }
      audioManager.playCashOut();
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.75 }, colors: ['#22c55e', '#06b6d4', '#f59e0b', '#ec4899', '#3b82f6'] });
    } catch (error) {
      console.warn('[GameView] server cashout rejected:', error);
    } finally {
      processingRef.current = false;
      if (isP1) setIsProcessingCashOut1(false); else setIsProcessingCashOut2(false);
    }
  }, []);

  const handlePlaceBet = useCallback(async (amount: number, autoCashOut: number | null, panelId = 1) => {
    const isP1 = panelId === 1;
    const placingRef = isP1 ? isPlacingBet1Ref : isPlacingBet2Ref;
    const activeRef = isP1 ? hasActiveBet1Ref : hasActiveBet2Ref;
    if (placingRef.current || activeRef.current) return;
    placingRef.current = true;
    const round = currentRoundRef.current;
    if (round.status === 'RUNNING' || round.status === 'CRASHED') {
      if (isP1) { setIsQueued1(true); setQueuedBet1({ amount, autoCashOut }); lastBetAmount1Ref.current = amount; }
      else { setIsQueued2(true); setQueuedBet2({ amount, autoCashOut }); lastBetAmount2Ref.current = amount; }
      placingRef.current = false; audioManager.playButtonClick(); return;
    }
    try {
      const result = await authoritativePlaceBet({ roundId: round.id, amount, panelId, autoCashout: autoCashOut });
      if (!result.success) throw new Error('PLACE_BET_REJECTED');
      activeRef.current = true;
      if (isP1) { hasCashedOut1Ref.current = false; lastBetAmount1Ref.current = amount; setHasActiveBet1(true); setBetAmount1(amount); setIsQueued1(false); setQueuedBet1(null); setHasCashedOut1(false); setCashedOutMultiplier1(null); setCashedOutPayout1(null); }
      else { hasCashedOut2Ref.current = false; lastBetAmount2Ref.current = amount; setHasActiveBet2(true); setBetAmount2(amount); setIsQueued2(false); setQueuedBet2(null); setHasCashedOut2(false); setCashedOutMultiplier2(null); setCashedOutPayout2(null); }
      audioManager.playButtonClick();
    } catch (error) { alert(error instanceof Error ? error.message : 'Falha ao registrar aposta.'); }
    finally { placingRef.current = false; }
  }, []);

  const handleCancelBet = useCallback(async (panelId = 1) => {
    const own = store.getActiveBets().find(b => b.isCurrentUser && b.status === 'active' && b.panelId === panelId);
    if (!own?.id) return;
    try {
      await authoritativeCancelBet(own.id);
      if (panelId === 1) { hasActiveBet1Ref.current = false; setHasActiveBet1(false); setBetAmount1(0); }
      else { hasActiveBet2Ref.current = false; setHasActiveBet2(false); setBetAmount2(0); }
      audioManager.playButtonClick();
    } catch (error) { console.warn('[GameView] cancel rejected:', error); }
  }, []);

  const handleCancelQueuedBet = useCallback((panelId = 1) => {
    if (panelId === 1) { setIsQueued1(false); setQueuedBet1(null); } else { setIsQueued2(false); setQueuedBet2(null); }
    audioManager.playButtonClick();
  }, []);

  const triggerAutoBets = useCallback(() => {
    const balance = wallet.availableBalance;
    if (queuedBet1 && !hasActiveBet1Ref.current && !isPlacingBet1Ref.current && balance >= queuedBet1.amount) { void handlePlaceBet(queuedBet1.amount, queuedBet1.autoCashOut, 1); setIsQueued1(false); setQueuedBet1(null); }
    else if (autoBetEnabled1Ref.current && !hasActiveBet1Ref.current && !isPlacingBet1Ref.current) { const amount = lastBetAmount1Ref.current || 25; if (balance >= amount) void handlePlaceBet(amount, autoCashOutEnabled1Ref.current ? autoCashOutMultiplier1Ref.current : null, 1); }
    if (showSecondPanel) {
      if (queuedBet2 && !hasActiveBet2Ref.current && !isPlacingBet2Ref.current && balance >= queuedBet2.amount) { void handlePlaceBet(queuedBet2.amount, queuedBet2.autoCashOut, 2); setIsQueued2(false); setQueuedBet2(null); }
      else if (autoBetEnabled2Ref.current && !hasActiveBet2Ref.current && !isPlacingBet2Ref.current) { const amount = lastBetAmount2Ref.current || 25; if (balance >= amount) void handlePlaceBet(amount, autoCashOutEnabled2Ref.current ? autoCashOutMultiplier2Ref.current : null, 2); }
    }
  }, [wallet.availableBalance, queuedBet1, queuedBet2, showSecondPanel, handlePlaceBet]);

  useEffect(() => {
    const unsubscribe = subscribeToAuthoritativeRound(async (serverRound) => {
      const mapped: GameRound = {
        id: serverRound.id,
        roundNumber: serverRound.roundNumber,
        status: serverRound.status,
        startedAt: serverRound.startedAt ? new Date(serverRound.startedAt).getTime() : 0,
        endedAt: serverRound.endedAt ? new Date(serverRound.endedAt).getTime() : undefined,
        crashPoint: serverRound.crashPoint,
        serverSeedHash: serverRound.serverSeedHash,
        clientSeed: serverRound.clientSeed,
        nonce: serverRound.nonce,
        totalBetsAmount: serverRound.totalBetsAmount,
        totalPayoutAmount: serverRound.totalPayoutAmount,
      } as GameRound;
      setCurrentRound(mapped); currentRoundRef.current = mapped;
      await applyAuthoritativeBets(serverRound.id);
      if (serverRound.status === 'COUNTDOWN') { const remaining = serverRound.startedAt ? Math.max(0, Math.ceil((new Date(serverRound.startedAt).getTime() - Date.now()) / 1000)) : 3; setCountdown(remaining); }
      if (serverRound.status === 'RUNNING') { audioManager.startFlightAmbient(); }
      if (serverRound.status === 'CRASHED') { setMultiplier(serverRound.crashPoint ?? 1); audioManager.stopFlightAmbient(); audioManager.playCrash(); }
    }, 500);
    return unsubscribe;
  }, [applyAuthoritativeBets]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const round = currentRoundRef.current;
      const visual = visualMultiplier({
        id: round.id, roundNumber: round.roundNumber, status: round.status as any,
        startedAt: round.startedAt ? new Date(round.startedAt).toISOString() : null,
        endedAt: round.endedAt ? new Date(round.endedAt).toISOString() : null,
        serverSeedHash: round.serverSeedHash ?? '', clientSeed: round.clientSeed ?? '', nonce: round.nonce ?? 0,
        totalBetsAmount: round.totalBetsAmount ?? 0, totalPayoutAmount: round.totalPayoutAmount ?? 0,
        ...(round.crashPoint != null ? { crashPoint: round.crashPoint } : {})
      });
      setMultiplier(visual); multiplierRef.current = visual;
      if (round.status === 'COUNTDOWN' && round.startedAt) setCountdown(Math.max(0, Math.ceil((round.startedAt - Date.now()) / 1000)));
      if (round.status === 'COUNTDOWN' && round.roundNumber !== lastAutoBetRoundRef.current) { lastAutoBetRoundRef.current = round.roundNumber; triggerAutoBets(); }
      if (round.status === 'RUNNING') {
        const stage = getAltitudeStage(visual);
        try { audioManager.updateFlightIntensity(visual, stage); } catch {}
        if (hasActiveBet1Ref.current && !hasCashedOut1Ref.current && autoCashOutEnabled1Ref.current && visual >= autoCashOutMultiplier1Ref.current) void handleCashOut(1);
        if (hasActiveBet2Ref.current && !hasCashedOut2Ref.current && autoCashOutEnabled2Ref.current && visual >= autoCashOutMultiplier2Ref.current) void handleCashOut(2);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [triggerAutoBets, handleCashOut]);

  const toggleSound = () => setIsMuted(audioManager.toggleMute());

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-2.5 select-none font-sans">
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-1 py-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0"><div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-bold text-[11px] sm:text-xs"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /><span>AVIATOR SKYBIRD</span></div><span className="text-[10px] sm:text-xs text-slate-400 font-mono">#{currentRound.roundNumber}</span></div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <div className="px-2 py-0.5 rounded-lg bg-[#18202d] border border-[#28354c] text-[11px] sm:text-xs font-mono font-bold text-cyan-300 flex items-center gap-1"><span>$ USD</span></div>
          <button id="btn-how-to-play" type="button" onClick={() => setShowHowToPlay(true)} className="p-1 sm:px-2 py-0.5 rounded-lg bg-[#18202d] hover:bg-[#222c3e] border border-[#28354c] text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1 text-[11px]"><HelpCircle className="w-3.5 h-3.5 text-amber-400" /><span className="hidden xs:inline">{t('game.howToPlay', 'Como Jogar?')}</span></button>
          <button id="btn-toggle-sound" type="button" onClick={() => { audioManager.ensureContext(); audioManager.playButtonClick(); toggleSound(); }} title={isMuted ? t('game.soundOn', 'Ativar Som') : t('game.soundOff', 'Desativar Som')} className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${isMuted ? 'bg-rose-500/10 border-rose-500/40 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'}`}>{isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}<span className="hidden xs:inline">{isMuted ? 'SEM SOM' : 'SOM'}</span></button>
          {!showSecondPanel && <button id="btn-add-second-bet" type="button" onClick={() => setShowSecondPanel(true)} className="px-2 py-0.5 rounded-lg bg-[#1a2538] hover:bg-[#233148] border border-cyan-500/40 text-cyan-300 text-[11px] font-bold transition cursor-pointer flex items-center gap-1"><PlusCircle className="w-3 h-3" /><span>{t('game.addPanel', '+2ª Aposta')}</span></button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-2.5 items-start">
        <div className="lg:col-span-4 order-2 lg:order-1"><LiveBetsList bets={activeBets} currentMultiplier={multiplier} currency={currency} /></div>
        <div className="lg:col-span-8 order-1 lg:order-2 flex flex-col gap-2">
          <div className="relative w-full rounded-xl sm:rounded-2xl overflow-hidden border border-[#263143] bg-[#0b0e14] shadow-2xl flex flex-col">
            <RoundHistory rounds={pastRounds} onSelectRound={(round) => setSelectedFairnessRound(round)} />
            <div className="relative w-full h-[220px] xs:h-[250px] sm:h-[320px] lg:h-[360px] min-h-[200px] overflow-hidden bg-gradient-to-b from-[#0e131d] via-[#090c12] to-[#05070a]">
              <SkybirdCanvas status={currentRound.status} multiplier={multiplier} altitudeStage={altitudeStage} quality={quality} />
              <MultiplierDisplay status={currentRound.status} multiplier={multiplier} crashPoint={currentRound.crashPoint} altitudeStage={altitudeStage} countdown={countdown} cashedOutMultiplier={cashedOutMultiplier1} cashedOutPayout={cashedOutPayout1} onOpenFairness={() => setSelectedFairnessRound(currentRound)} />
            </div>
          </div>
          <div className={`grid ${showSecondPanel ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-2`}>
            <BettingPanel panelId={1} status={currentRound.status} currentMultiplier={multiplier} userBalance={wallet.availableBalance} hasActiveBet={hasActiveBet1} betAmount={betAmount1} isQueued={isQueued1} queuedAmount={queuedBet1?.amount || 0} hasCashedOut={hasCashedOut1} cashedOutMultiplier={cashedOutMultiplier1} cashedOutPayout={cashedOutPayout1} currency={currency} autoBetEnabled={autoBetEnabled1} onToggleAutoBet={setAutoBetEnabled1} autoCashOutEnabled={autoCashOutEnabled1} onToggleAutoCashOut={setAutoCashOutEnabled1} autoCashOutMultiplier={autoCashOutMultiplier1} onChangeAutoCashOutMultiplier={setAutoCashOutMultiplier1} onPlaceBet={handlePlaceBet} onCancelBet={handleCancelBet} onCancelQueuedBet={handleCancelQueuedBet} onCashOut={handleCashOut} isProcessingCashOut={isProcessingCashOut1} onOpenDeposit={onOpenDeposit} />
            {showSecondPanel && <BettingPanel panelId={2} status={currentRound.status} currentMultiplier={multiplier} userBalance={wallet.availableBalance} hasActiveBet={hasActiveBet2} betAmount={betAmount2} isQueued={isQueued2} queuedAmount={queuedBet2?.amount || 0} hasCashedOut={hasCashedOut2} cashedOutMultiplier={cashedOutMultiplier2} cashedOutPayout={cashedOutPayout2} currency={currency} autoBetEnabled={autoBetEnabled2} onToggleAutoBet={setAutoBetEnabled2} autoCashOutEnabled={autoCashOutEnabled2} onToggleAutoCashOut={setAutoCashOutEnabled2} autoCashOutMultiplier={autoCashOutMultiplier2} onChangeAutoCashOutMultiplier={setAutoCashOutMultiplier2} onPlaceBet={handlePlaceBet} onCancelBet={handleCancelBet} onCancelQueuedBet={handleCancelQueuedBet} onCashOut={handleCashOut} isProcessingCashOut={isProcessingCashOut2} onOpenDeposit={onOpenDeposit} onRemovePanel={() => setShowSecondPanel(false)} />}
          </div>
        </div>
      </div>

      {showHowToPlay && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"><div className="w-full max-w-lg bg-[#121722] border border-[#28354c] rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-slate-200"><div className="flex items-center justify-between pb-3 border-b border-[#212b3d]"><div className="flex items-center gap-2 font-bold text-white text-base"><HelpCircle className="w-5 h-5 text-amber-400" /><span>Como Jogar o Aviator</span></div><button onClick={() => setShowHowToPlay(false)} className="p-1 rounded-lg hover:bg-[#1f2838] text-slate-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button></div><div className="space-y-3 text-xs text-slate-300 leading-relaxed"><div className="p-3 rounded-xl bg-[#171e2c] border border-[#263348]"><strong className="text-emerald-400 font-bold block mb-1">1. Faça sua Aposta</strong>Escolha o valor desejado antes da decolagem e clique no botão verde <span className="font-bold text-emerald-400">"APOSTA"</span>.</div><div className="p-3 rounded-xl bg-[#171e2c] border border-[#263348]"><strong className="text-cyan-300 font-bold block mb-1">2. Acompanhe a Decolagem</strong>O avião decola e o multiplicador cresce exponencialmente a partir de 1.00x.</div><div className="p-3 rounded-xl bg-[#171e2c] border border-[#263348]"><strong className="text-amber-300 font-bold block mb-1">3. Encerre a Aposta</strong>Clique em <span className="font-bold text-amber-300">"SACAR"</span> antes do crash. O servidor determina o multiplicador e o payout.</div><div className="p-3 rounded-xl bg-[#171e2c] border border-[#263348]"><strong className="text-fuchsia-400 font-bold block mb-1">4. Auto Aposta e Auto Saque</strong>O Auto Saque envia apenas a intenção; o PostgreSQL calcula o payout.</div></div><button type="button" onClick={() => setShowHowToPlay(false)} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold text-slate-950 text-xs uppercase tracking-wider">Entendido, Vamos Jogar!</button></div></div>}
      {selectedFairnessRound && <FairnessModal round={selectedFairnessRound} onClose={() => setSelectedFairnessRound(null)} />}
    </div>
  );
};
