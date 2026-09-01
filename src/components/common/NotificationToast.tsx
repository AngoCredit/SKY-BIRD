import React, { useEffect, useState } from 'react';
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  CheckCircle, 
  XCircle, 
  MessageSquare, 
  X,
  Bell,
  Gift
} from 'lucide-react';
import { store } from '../../services/store';
import { SystemNotification } from '../../types';

const AUTO_DISMISS_MS = 6000;

export const NotificationToast: React.FC = () => {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);

  useEffect(() => {
    const update = () => {
      setNotifications(store.getNotifications().filter(n => !n.read).slice(0, 3));
    };
    update();
    const unsub = store.subscribe(update);
    return () => { unsub(); };
  }, []);

  // Auto-dismiss each notification after AUTO_DISMISS_MS
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (notifications.length === 0) return;
    const timers = notifications.map((n) =>
      setTimeout(() => store.dismissNotification(n.id), AUTO_DISMISS_MS)
    );
    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications.map(n => n.id).join(',')]);

  if (notifications.length === 0) return null;

  const getIcon = (type: SystemNotification['type']) => {
    switch (type) {
      case 'deposit_requested':
        return <ArrowDownLeft className="w-5 h-5 text-emerald-400" />;
      case 'deposit_approved':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'deposit_rejected':
        return <XCircle className="w-5 h-5 text-rose-400" />;
      case 'withdrawal_requested':
        return <ArrowUpRight className="w-5 h-5 text-cyan-400" />;
      case 'withdrawal_approved':
        return <CheckCircle className="w-5 h-5 text-cyan-400" />;
      case 'withdrawal_rejected':
        return <XCircle className="w-5 h-5 text-rose-400" />;
      case 'support_message':
        return <MessageSquare className="w-5 h-5 text-violet-400" />;
      case 'referral_bonus':
        return <Gift className="w-5 h-5 text-amber-400" />;
      default:
        return <Bell className="w-5 h-5 text-cyan-400" />;
    }
  };

  const getStyle = (type: SystemNotification['type']) => {
    switch (type) {
      case 'deposit_requested':
      case 'deposit_approved':
        return { card: 'border-emerald-500/40', bar: 'bg-emerald-500' };
      case 'deposit_rejected':
      case 'withdrawal_rejected':
        return { card: 'border-rose-500/40', bar: 'bg-rose-500' };
      case 'withdrawal_requested':
      case 'withdrawal_approved':
        return { card: 'border-cyan-500/40', bar: 'bg-cyan-500' };
      case 'support_message':
        return { card: 'border-violet-500/40', bar: 'bg-violet-500' };
      case 'referral_bonus':
        return { card: 'border-amber-500/40', bar: 'bg-amber-400' };
      default:
        return { card: 'border-slate-700', bar: 'bg-slate-500' };
    }
  };

  return (
    <div 
      id="system-notification-toasts" 
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-[320px] w-full pointer-events-none px-3 sm:px-0"
    >
      {notifications.map((notif) => {
        const style = getStyle(notif.type);
        return (
          <div
            key={notif.id}
            className={`pointer-events-auto flex flex-col rounded-2xl border bg-slate-950/96 backdrop-blur-xl shadow-2xl shadow-black/80 overflow-hidden transition-all transform animate-in slide-in-from-bottom-5 duration-300 ${style.card}`}
          >
            <div className="flex items-start gap-3 p-3.5">
              <div className="p-2 rounded-xl bg-slate-900/80 border border-white/10 shrink-0">
                {getIcon(notif.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="text-xs font-bold text-white leading-tight truncate">
                    {notif.title}
                  </h4>
                  <button
                    type="button"
                    onClick={() => store.dismissNotification(notif.id)}
                    className="text-slate-400 hover:text-white p-1 -mr-1 rounded-lg transition shrink-0 cursor-pointer"
                    title="Fechar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                  {notif.message}
                </p>
                {notif.amount && (
                  <div className="mt-1 text-[11px] font-mono font-bold text-emerald-400">
                    ${notif.amount.toFixed(2)} USD
                  </div>
                )}
              </div>
            </div>
            {/* Auto-dismiss progress bar */}
            <div className="h-0.5 w-full bg-white/5">
              <div
                className={`h-full ${style.bar} opacity-50`}
                style={{ animation: `toast-shrink ${AUTO_DISMISS_MS}ms linear forwards` }}
              />
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes toast-shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
};
