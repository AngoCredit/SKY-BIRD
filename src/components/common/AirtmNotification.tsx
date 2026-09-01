import React, { useState, useEffect } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { useTranslation } from '../../services/i18n';

const ADMIN_HASHES = ['#admin', '#admin-login'];

const isAdminView = () => ADMIN_HASHES.includes(window.location.hash.toLowerCase());

export const AirtmNotification: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [isOnAdminPage, setIsOnAdminPage] = useState<boolean>(isAdminView());

  const AIRTM_AFFILIATE_URL = 'https://app.airtm.com/ivt/makemone5ickwygj';

  // Track hash changes to hide on admin pages in real time
  useEffect(() => {
    const handleHash = () => setIsOnAdminPage(isAdminView());
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    const dismissedSession = sessionStorage.getItem('airtm_notification_dismissed');
    if (dismissedSession) {
      return;
    }

    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 3500);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    sessionStorage.setItem('airtm_notification_dismissed', 'true');
  };

  if (!isVisible || isDismissed || isOnAdminPage) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md w-[calc(100vw-32px)] animate-fade-in sm:w-auto">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0c192c] via-[#091322] to-[#040810] border-2 border-cyan-500/40 p-4 sm:p-5 shadow-2xl shadow-cyan-950/80 backdrop-blur-xl">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-28 h-28 bg-cyan-500/15 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-24 h-24 bg-blue-600/15 rounded-full blur-xl pointer-events-none" />

        <button
          onClick={handleDismiss}
          title="Close notification"
          className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3.5">
          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 p-0.5 shadow-lg shadow-cyan-500/30">
              <div className="w-full h-full bg-[#070e1a] rounded-[10px] flex items-center justify-center font-black text-cyan-400 text-base">
                A
              </div>
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-500"></span>
            </span>
          </div>

          <div className="flex-1 pr-6">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold tracking-wider uppercase border border-cyan-500/30">
                Airtm Wallet
              </span>
              <span className="text-[10px] text-slate-400">Official</span>
            </div>

            <h4 className="text-sm font-bold text-white font-cyber flex items-center gap-1">
              {t('landing.airtmBannerTitle', 'Depósitos e Saques Rápidos com Airtm')}
            </h4>

            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              {t('landing.airtmBannerDesc', 'Use sua conta Airtm para pagamentos e saques em USD com segurança e agilidade.')}
            </p>

            <div className="mt-3 flex items-center gap-2">
              <a
                href={AIRTM_AFFILIATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/25 transition cursor-pointer"
              >
                <span>{t('landing.airtmRegisterLink', 'Criar Conta Airtm')}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={handleDismiss}
                className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer"
              >
                {t('wallet.close', 'Depois')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
