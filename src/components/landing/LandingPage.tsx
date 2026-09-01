import React, { useState, useEffect } from 'react';
import {
  Rocket,
  ShieldCheck,
  Zap,
  ArrowRight,
  TrendingUp,
  Wallet,
  CheckCircle,
  Star,
  Sparkles,
  ShieldAlert,
  Smartphone,
  Monitor,
  Users,
  Award,
  Play,
  Gift,
  Trophy,
  Flame,
  UserPlus
} from 'lucide-react';
import { store } from '../../services/store';
import { audioManager } from '../../services/audioManager';
import { GameRound } from '../../types';

import mascotCoolImg from '../../assets/images/skybird_mascot_cool.png';
import mascotThumbsUpImg from '../../assets/images/skybird_mascot_thumbsup.png';
import { LanguageSelector } from '../common/LanguageSelector';
import { useTranslation } from '../../services/i18n';
import { SkybirdHeroFlight } from './SkybirdHeroFlight';

// Visual Multiplier Flight Ticker (Sincronizado Deterministicamente via Tempo Global em todas as Abas)
const LandingMultiplierTicker: React.FC<{ onPlayNow: () => void }> = ({ onPlayNow }) => {
  const [pastRounds, setPastRounds] = useState<GameRound[]>(store.getPastRounds());
  const [liveMultiplier, setLiveMultiplier] = useState<number>(1.00);
  const [isCrashed, setIsCrashed] = useState<boolean>(false);

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setPastRounds(store.getPastRounds());
    });
    return () => unsub();
  }, []);

  // Continuous deterministic loop based on Unix timestamp synchronized across all windows
  useEffect(() => {
    const updateTick = () => {
      const now = Date.now();
      const cycleLengthMs = 10000; // 10s por ciclo total
      const cycleIndex = Math.floor(now / cycleLengthMs);
      const cycleTime = now % cycleLengthMs;

      // Semente determinística única por ciclo (invariável no tempo e no navegador)
      const rawSeed = (cycleIndex * 9301 + 49297) % 233280;
      const targetCrash = Math.round((1.25 + (rawSeed / 233280) * 6.5) * 100) / 100;

      // 6 segundos de voo e 4 segundos de congelamento no resultado
      const flightDurationMs = 6000;

      if (cycleTime < flightDurationMs) {
        // Fase de Voo: interpolação do multiplicador até atingir targetCrash aos 6s
        const progressRatio = cycleTime / flightDurationMs;
        const currentMult = Math.round((1.00 + (targetCrash - 1.00) * progressRatio) * 100) / 100;
        setLiveMultiplier(currentMult);
        setIsCrashed(false);
      } else {
        // Fase de Queda / Congelado no valor exato do targetCrash
        setLiveMultiplier(targetCrash);
        setIsCrashed(true);
      }
    };

    updateTick();
    const interval = setInterval(updateTick, 80);
    return () => clearInterval(interval);
  }, []);

  // Gerar histórico determinístico de rodadas anteriores baseado no ciclo atual
  const nowMs = Date.now();
  const cycleIndex = Math.floor(nowMs / 10000);
  
  const historyDisplay = pastRounds.length > 0
    ? pastRounds.slice(0, 6).map((r) => typeof r === 'string' ? r : `${r.crashPoint.toFixed(2)}x`)
    : [1, 2, 3, 4, 5, 6].map((offset) => {
        const pastIdx = cycleIndex - offset;
        const rawSeed = (pastIdx * 9301 + 49297) % 233280;
        const pastCrash = Math.round((1.25 + (rawSeed / 233280) * 6.5) * 100) / 100;
        return `${pastCrash.toFixed(2)}x`;
      });

  const statusText = isCrashed
    ? `FLEW AWAY! (${liveMultiplier.toFixed(2)}x)`
    : `${liveMultiplier.toFixed(2)}x`;

  return (
    <div className="relative w-full bg-[#0C1226]/95 border border-slate-800 rounded-3xl p-5 shadow-2xl backdrop-blur-2xl">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Counter Display */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Rocket className={`w-6 h-6 ${!isCrashed ? 'animate-pulse text-amber-400' : 'animate-bounce'}`} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
              VOO EM TEMPO REAL
            </span>
            <span className={`font-cyber font-black text-3xl tracking-tight ${
              isCrashed
                ? 'text-rose-500 font-mono'
                : liveMultiplier >= 3 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {statusText}
            </span>
          </div>
        </div>

        {/* CTA Direct to Real Game */}
        <button
          onClick={onPlayNow}
          className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-slate-950 font-cyber font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition cursor-pointer flex items-center justify-center gap-2"
        >
          <span>ENTRAR NA RODADA REAL</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Synchronized History Ribbon across all windows */}
      <div className="flex items-center gap-2 overflow-x-auto pt-3 mt-3 border-t border-slate-800/80 text-xs font-mono">
        <span className="text-[10px] text-slate-500 uppercase font-bold shrink-0">Histórico de Rodadas:</span>
        {historyDisplay.map((m, idx) => (
          <span
            key={idx}
            className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold shrink-0 ${
              parseFloat(m) >= 3.0
                ? 'bg-purple-950/80 text-purple-300 border border-purple-500/40'
                : parseFloat(m) >= 2.0
                ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                : 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40'
            }`}
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
};

interface LandingPageProps {
  onStartGame: () => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenSupport: () => void;
  onOpenAdminLogin?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartGame,
  onOpenAuth,
  onOpenSupport,
  onOpenAdminLogin
}) => {
  const { t } = useTranslation();

  return (
    <div className="w-full min-h-screen bg-[#070B19] text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200 font-sans">
      {/* 1. STICKY HEADER */}
      <header className="sticky top-0 z-50 w-full bg-[#090E20]/90 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          {/* Logo Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={onStartGame}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400 to-yellow-500 p-0.5 shadow-lg shadow-amber-500/30 flex items-center justify-center">
              <Rocket className="w-6 h-6 text-slate-950 transform -rotate-45" />
            </div>
            <div className="flex flex-col">
              <span className="font-cyber font-black text-2xl tracking-wider text-white">
                SKY<span className="text-amber-400">BIRD</span>
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-bold uppercase tracking-wider text-slate-300">
            <a href="#como-jogar" className="hover:text-amber-400 transition">{t('nav.howItWorks', 'COMO JOGAR')}</a>
            <a href="#recursos" className="hover:text-amber-400 transition">{t('nav.simulator', 'RECURSOS')}</a>
            <a href="#vip" className="hover:text-amber-400 transition">{t('nav.security', 'VIP CLUB')}</a>
            <a href="#ranking" className="hover:text-amber-400 transition">{t('nav.community', 'RANKING')}</a>
            <button onClick={onOpenSupport} className="hover:text-amber-400 transition cursor-pointer uppercase font-bold">
              {t('nav.support', 'SUPORTE')}
            </button>
          </nav>

          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
            <LanguageSelector />
            <button
              id="btn-nav-login"
              onClick={() => {
                audioManager.playButtonClick();
                onOpenAuth('login');
              }}
              className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-200 border border-slate-700 hover:border-amber-400 hover:text-white transition cursor-pointer uppercase tracking-wider"
            >
              {t('nav.login', 'ENTRAR')}
            </button>
            <button
              id="btn-nav-register"
              onClick={() => {
                audioManager.playButtonClick();
                onOpenAuth('register');
              }}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-cyber font-black text-xs shadow-lg shadow-amber-500/30 transition-all active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              {t('nav.register', 'REGISTRAR')}
            </button>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative pt-10 pb-16 px-4 sm:px-6 max-w-7xl mx-auto w-full overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-10 right-1/4 w-[500px] h-[400px] bg-gradient-to-br from-amber-500/20 via-orange-600/10 to-blue-600/10 rounded-full blur-[140px] pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Hero Content */}
          <div className="lg:col-span-5 flex flex-col gap-5 z-10">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-cyber font-black tracking-tight text-white leading-tight">
              {t('landing.heroTitle1', 'O JOGO DO PÁSSARO')} <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500">
                {t('landing.heroTitle2', 'QUE MULTIPLICA ATÉ 100x')}
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-md">
              {t('landing.heroSubtitle', 'Decole no cockpit 3D com gráficos ultrarrealistas, física de voo em tempo real, saques rápidos em 15-30 minutos via Airtm e sistema 100% Provably Fair auditável.')}
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-4 pt-2">
              <button
                id="btn-hero-play"
                onClick={() => {
                  audioManager.playButtonClick();
                  onStartGame();
                }}
                className="px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-cyber font-black text-base tracking-wider shadow-xl shadow-amber-500/30 transition active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <span>{t('landing.ctaPlay', 'JOGAR AGORA')}</span>
                <Rocket className="w-5 h-5 fill-slate-950" />
              </button>
            </div>

            {/* Live Active Players Pill */}
            <div className="flex items-center gap-3 pt-2">
              <div className="flex -space-x-2">
                <img className="w-8 h-8 rounded-full border-2 border-[#070B19]" src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80" alt="player" />
                <img className="w-8 h-8 rounded-full border-2 border-[#070B19]" src="https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=80" alt="player" />
                <img className="w-8 h-8 rounded-full border-2 border-[#070B19]" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80" alt="player" />
              </div>
              <span className="text-xs text-slate-300 font-medium">
                <strong>+10.000</strong> {t('community.subtitle', 'jogadores já estão voando!')}
              </span>
            </div>
          </div>

          {/* Right Hero Graphic Showcase */}
          <div className="lg:col-span-7 relative flex flex-col items-center">
            <div className="relative w-full">
              {/* Professional Continuous Flying Mascot Bird Animation */}
              <div className="relative z-10 w-full mb-4">
                <SkybirdHeroFlight />
              </div>

              {/* Live Multiplier Visual Display Ticker (Efeito Visual Apenas, Sem Botões de Aposta Demo) */}
              <LandingMultiplierTicker onPlayNow={onStartGame} />
            </div>
          </div>
        </div>
      </section>

      {/* 3. RECURSOS / FEATURE CARDS */}
      <section id="recursos" className="py-12 px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Multiplicadores */}
          <div className="bg-[#0C1226] border border-slate-800 hover:border-amber-500/40 rounded-3xl p-6 flex flex-col items-center text-center transition group">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 group-hover:scale-110 transition">
              <Rocket className="w-7 h-7 transform -rotate-45" />
            </div>
            <h3 className="font-cyber font-bold text-sm text-white uppercase tracking-wider mb-2">
              {t('landing.stat1Label', 'MULTIPLICADORES EMOCIONANTES')}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('how.step2Desc', 'O pássaro voa cada vez mais alto. Quanto mais esperar, maior o prémio!')}
            </p>
          </div>

          {/* Card 2: Saques Rápido */}
          <div className="bg-[#0C1226] border border-slate-800 hover:border-amber-500/40 rounded-3xl p-6 flex flex-col items-center text-center transition group">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h3 className="font-cyber font-bold text-sm text-white uppercase tracking-wider mb-2">
              {t('landing.stat2Label', 'SAQUES RÁPIDOS E SEGUROS')}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('security.card2Desc', 'Levantamentos instantâneos e 100% seguros para você aproveitar seus ganhos.')}
            </p>
          </div>

          {/* Card 3: Qualquer Lugar */}
          <div className="bg-[#0C1226] border border-slate-800 hover:border-amber-500/40 rounded-3xl p-6 flex flex-col items-center text-center transition group">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-110 transition">
              <Smartphone className="w-7 h-7" />
            </div>
            <h3 className="font-cyber font-bold text-sm text-white uppercase tracking-wider mb-2">
              {t('community.panoramicTitle', 'JOGUE EM QUALQUER LUGAR')}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('community.panoramicDesc', 'Totalmente otimizado para celular. Jogue quando e onde quiser.')}
            </p>
          </div>

          {/* Card 4: Ranking */}
          <div className="bg-[#0C1226] border border-slate-800 hover:border-amber-500/40 rounded-3xl p-6 flex flex-col items-center text-center transition group">
            <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-400 mb-4 group-hover:scale-110 transition">
              <Trophy className="w-7 h-7" />
            </div>
            <h3 className="font-cyber font-bold text-sm text-white uppercase tracking-wider mb-2">
              {t('nav.community', 'RANKING & RECOMPENSAS')}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('community.subtitle', 'Compita com jogadores, suba no ranking e ganhe prêmios incríveis!')}
            </p>
          </div>
        </div>
      </section>

      {/* 3.5 BANNER PUBLICITÁRIO COCKPIT 3D */}
      <section className="py-8 px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <div className="relative rounded-3xl bg-gradient-to-br from-[#0D1530] via-[#080D20] to-[#0A1028] border border-amber-500/30 p-6 sm:p-10 overflow-hidden shadow-2xl backdrop-blur-xl group">
          {/* Ambient Glow Effects */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none group-hover:bg-amber-500/25 transition duration-700" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
            {/* Left Copy */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-cyber font-bold uppercase tracking-wider w-fit">
                <Sparkles className="w-4 h-4" />
                <span>EXPERIÊNCIA 3D IMERSIVA</span>
              </div>

              <h2 className="text-2xl sm:text-4xl font-cyber font-black text-white leading-tight uppercase">
                COCKPIT DE VOO <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500">
                  ALTA PERFORMANCE
                </span>
              </h2>

              <p className="text-sm text-slate-300 leading-relaxed">
                Sinta a adrenalina de pilotar o Skybird em uma interface gráfica de última geração com suporte a 60-120 FPS, comandos rápidos e total controle da sua banca em tempo real.
              </p>

              <div className="flex flex-wrap gap-3 pt-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200 bg-slate-900/80 px-3.5 py-2 rounded-xl border border-slate-800">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Resposta Ultrarrápida</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200 bg-slate-900/80 px-3.5 py-2 rounded-xl border border-slate-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Provably Fair Auditável</span>
                </div>
              </div>

              <button
                onClick={() => {
                  audioManager.playButtonClick();
                  onStartGame();
                }}
                className="mt-4 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-cyber font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/30 transition active:scale-95 flex items-center justify-center gap-2 w-fit cursor-pointer"
              >
                <span>ENTRAR NO COCKPIT</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Right Image Showcase */}
            <div className="lg:col-span-7 relative flex justify-center">
              <div className="relative w-full rounded-2xl overflow-hidden border border-amber-500/30 shadow-2xl group-hover:border-amber-400/60 transition duration-500">
                <img
                  src="/african_desktop_cockpit_1787860201740.jpg"
                  alt="Skybird Desktop Cockpit 3D"
                  className="w-full h-auto max-h-[420px] object-cover object-center transform group-hover:scale-105 transition duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#070B19]/80 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-slate-300 bg-slate-950/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/10">
                  <span className="font-mono text-amber-400 font-bold">SKYBIRD COCKPIT PRO 3D</span>
                  <span className="font-mono text-emerald-400 font-semibold">● 100% ONLINE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. COMO JOGAR SECTION */}
      <section id="como-jogar" className="py-16 px-4 sm:px-6 max-w-7xl mx-auto w-full text-center">
        <h2 className="text-2xl sm:text-4xl font-cyber font-black text-white uppercase tracking-wider mb-12">
          {t('how.title', 'COMO JOGAR')}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          {/* Step 1 */}
          <div className="flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-cyber font-bold text-sm flex items-center justify-center mb-6 shadow-lg">
              1
            </div>
            <div className="w-24 h-24 rounded-full bg-slate-900 border-2 border-indigo-500/40 flex items-center justify-center mb-4 shadow-xl text-yellow-400">
              <CoinsIcon />
            </div>
            <h4 className="font-cyber font-bold text-sm text-white uppercase mb-2">FAÇA SUA APOSTA</h4>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              Escolha o valor da sua aposta e prepare-se para o voo.
            </p>
          </div>

          {/* Step 2 */}
          <div className="flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-cyber font-bold text-sm flex items-center justify-center mb-6 shadow-lg">
              2
            </div>
            <div className="w-24 h-24 rounded-full bg-slate-900 border-2 border-indigo-500/40 flex items-center justify-center mb-4 shadow-xl text-cyan-400">
              <Rocket className="w-10 h-10" />
            </div>
            <h4 className="font-cyber font-bold text-sm text-white uppercase mb-2">O PÁSSARO DECOLA</h4>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              Acompanhe o voo do Skybird e veja o multiplicador subir.
            </p>
          </div>

          {/* Step 3 */}
          <div className="flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-cyber font-bold text-sm flex items-center justify-center mb-6 shadow-lg">
              3
            </div>
            <div className="w-24 h-24 rounded-full bg-slate-900 border-2 border-indigo-500/40 flex items-center justify-center mb-4 shadow-xl text-emerald-400">
              <Wallet className="w-10 h-10" />
            </div>
            <h4 className="font-cyber font-bold text-sm text-white uppercase mb-2">LEVANTE SEUS GANHOS</h4>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              Clique em "Levantar" antes que o pássaro caia e garanta seu lucro!
            </p>
          </div>

          {/* Step 4 */}
          <div className="flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-cyber font-bold text-sm flex items-center justify-center mb-6 shadow-lg">
              4
            </div>
            <div className="w-24 h-24 rounded-full bg-slate-900 border-2 border-indigo-500/40 flex items-center justify-center mb-4 shadow-xl text-orange-500">
              <Flame className="w-10 h-10" />
            </div>
            <h4 className="font-cyber font-bold text-sm text-white uppercase mb-2">NÃO DEIXE CAIR!</h4>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              Se o pássaro cair antes de você levantar, você perde a aposta.
            </p>
          </div>
        </div>
      </section>

      {/* 5. BOTTOM BANNER CTA (Pronto Para Decolar) */}
      <section className="py-12 px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <div className="relative rounded-3xl bg-gradient-to-r from-[#0C142E] via-[#101C42] to-[#0C142E] border border-amber-500/30 p-8 sm:p-12 overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl">
          {/* Left Mascot */}
          <img
            src={mascotThumbsUpImg}
            alt="Skybird Mascot Thumbs Up"
            className="w-48 sm:w-60 object-contain drop-shadow-[0_10px_25px_rgba(245,158,11,0.3)] shrink-0"
          />

          {/* Center Call to Action */}
          <div className="flex flex-col items-center text-center gap-4 z-10">
            <h2 className="text-2xl sm:text-4xl font-cyber font-black text-white uppercase tracking-wider">
              PRONTO PARA DECOLAR?
            </h2>
            <p className="text-sm text-slate-300 max-w-md">
              Entre agora no Skybird e viva a emoção de multiplicar seus ganhos!
            </p>
            <button
              id="btn-banner-cta-register"
              onClick={() => {
                audioManager.playButtonClick();
                onOpenAuth('register');
              }}
              className="mt-2 px-8 py-4 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-cyber font-black text-base shadow-xl shadow-amber-500/40 transition active:scale-95 flex items-center gap-2 cursor-pointer uppercase tracking-wider"
            >
              <span>CRIAR CONTA GRÁTIS</span>
              <UserPlus className="w-5 h-5" />
            </button>
          </div>

          {/* Right Gift Box Decorative graphic */}
          <div className="w-40 sm:w-48 shrink-0 flex justify-center">
            <div className="w-32 h-32 rounded-3xl bg-gradient-to-tr from-amber-500 to-yellow-400 p-1 shadow-2xl shadow-amber-500/30 flex items-center justify-center transform rotate-6">
              <div className="w-full h-full bg-slate-950 rounded-[22px] flex items-center justify-center">
                <Gift className="w-16 h-16 text-amber-400" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FOOTER */}
      <footer className="mt-auto border-t border-white/10 bg-[#040712] py-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center text-slate-950 font-bold">
              <Rocket className="w-4 h-4 transform -rotate-45" />
            </div>
            <span className="font-cyber font-black text-xl text-white">
              SKY<span className="text-amber-400">BIRD</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400 font-semibold uppercase tracking-wider">
            <a href="#como-jogar" className="hover:text-amber-400 transition">TERMOS DE USO</a>
            <span>•</span>
            <a href="#como-jogar" className="hover:text-amber-400 transition">POLÍTICA DE PRIVACIDADE</a>
            <span>•</span>
            <a href="#como-jogar" className="hover:text-amber-400 transition">JOGO RESPONSÁVEL</a>
            <span>•</span>
            <button onClick={onOpenSupport} className="hover:text-amber-400 transition cursor-pointer">
              SUPORTE
            </button>
          </div>

          <span className="text-xs text-slate-500 font-mono">
            © 2026 SKYBIRD Platform. Todos os direitos reservados.
          </span>
        </div>
      </footer>
    </div>
  );
};

// Internal icon component for coins
const CoinsIcon = () => (
  <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
