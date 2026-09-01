import React, { useState } from 'react';
import { GameRound } from '../../types';
import { ShieldCheck, X, Copy, Check, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { verifyRoundFairness, hashServerSeed } from '../../services/provablyFair';
import { useTranslation } from '../../services/i18n';

interface FairnessModalProps {
  round: GameRound | null;
  onClose: () => void;
}

export const FairnessModal: React.FC<FairnessModalProps> = ({ round, onClose }) => {
  const { t } = useTranslation();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Custom Validator Inputs
  const [testServerSeed, setTestServerSeed] = useState(round?.serverSeed || '');
  const [testServerHash, setTestServerHash] = useState(round?.serverSeedHash || '');
  const [testClientSeed, setTestClientSeed] = useState(round?.clientSeed || 'skybird_global_seed_2026');
  const [testNonce, setTestNonce] = useState(round?.nonce || 1089);
  const [testResult, setTestResult] = useState<{ isValidHash: boolean; calculatedCrashPoint: number } | null>(null);

  if (!round) return null;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRunVerification = (e: React.FormEvent) => {
    e.preventDefault();
    const result = verifyRoundFairness(
      testServerSeed,
      testServerHash || hashServerSeed(testServerSeed),
      testClientSeed,
      Number(testNonce)
    );
    setTestResult(result);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 p-6 relative">
        {/* Close Button */}
        <button
          id="btn-close-fairness"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-cyber font-bold text-white flex items-center gap-2">
              {t('fairness.title', 'VERIFICAÇÃO PROVABLY FAIR')}
            </h3>
            <p className="text-xs text-slate-400">
              SHA-256 HMAC & Provably Fair Cryptography
            </p>
          </div>
        </div>

        {/* Selected Round Data */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800">
            <div>
              <span className="text-xs text-slate-500 block">Round</span>
              <span className="font-cyber font-bold text-white text-base">
                #{round.roundNumber} ({round.id})
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 block">Multiplier Crash Point</span>
              <span className="font-cyber font-bold text-emerald-400 text-lg">
                {round.crashPoint.toFixed(2)}x
              </span>
            </div>
          </div>

          {/* Server Seed Hash */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Server Seed Hash (SHA-256)
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(round.serverSeedHash, 'hash')}
                className="text-xs text-slate-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
              >
                {copiedField === 'hash' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedField === 'hash' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="font-mono text-xs text-slate-300 break-all select-all bg-slate-900/60 p-2 rounded border border-slate-800">
              {round.serverSeedHash}
            </p>
          </div>

          {/* Revealed Server Seed */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-emerald-400">
                Server Seed (Revealed)
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(round.serverSeed || '', 'serverSeed')}
                className="text-xs text-slate-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
              >
                {copiedField === 'serverSeed' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedField === 'serverSeed' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="font-mono text-xs text-slate-300 break-all select-all bg-slate-900/60 p-2 rounded border border-slate-800">
              {round.serverSeed || 'Available upon flight completion'}
            </p>
          </div>

          {/* Client Seed & Nonce */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-xs font-semibold text-slate-400 block mb-1">Client Seed</span>
              <p className="font-mono text-xs text-slate-300 break-all bg-slate-900/60 p-2 rounded border border-slate-800">
                {round.clientSeed}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-xs font-semibold text-slate-400 block mb-1">Nonce</span>
              <p className="font-mono text-xs text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-800">
                {round.nonce}
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Verification Form */}
        <form onSubmit={handleRunVerification} className="mt-4 pt-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              {t('fairness.verifyButton', 'VALIDAR HASH & MATEMÁTICA')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Server Seed</label>
              <input
                type="text"
                value={testServerSeed}
                onChange={(e) => setTestServerSeed(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white text-xs outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Client Seed</label>
              <input
                type="text"
                value={testClientSeed}
                onChange={(e) => setTestClientSeed(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white text-xs outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-cyber font-bold text-xs uppercase tracking-wider transition cursor-pointer"
          >
            {t('fairness.verifyButton', 'VALIDAR AGORA')}
          </button>

          {testResult && (
            <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
              testResult.isValidHash ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300' : 'bg-red-950/80 border-red-500/40 text-red-300'
            }`}>
              <div className="flex items-center gap-2">
                {testResult.isValidHash ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
                <span>
                  {testResult.isValidHash ? 'Hash SHA-256 Validated!' : 'Invalid Hash Match'}
                </span>
              </div>
              <span className="font-mono font-bold text-sm">
                Crash: {testResult.calculatedCrashPoint.toFixed(2)}x
              </span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
