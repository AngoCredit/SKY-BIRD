import React, { useState } from 'react';
import { X, Sparkles, Check, Bird, Flame, ShieldAlert } from 'lucide-react';
import { store } from '../../services/store';
import { audioManager } from '../../services/audioManager';

export interface AnimalAvatarOption {
  id: string;
  name: string;
  category: 'aves' | 'selva' | 'mascotes';
  url: string;
  emoji: string;
  badge?: string;
}

export const ANIMAL_AVATARS: AnimalAvatarOption[] = [
  // AVES & AÉREOS
  {
    id: 'eagle',
    name: 'Águia Real Skybird',
    category: 'aves',
    url: 'https://images.unsplash.com/photo-1611689342806-0863700ce1e4?w=200&auto=format&fit=crop&q=80',
    emoji: '🦅',
    badge: 'Popular'
  },
  {
    id: 'falcon',
    name: 'Falcão Cyber',
    category: 'aves',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&auto=format&fit=crop&q=80',
    emoji: '🕊️',
    badge: 'Velocidade'
  },
  {
    id: 'owl',
    name: 'Coruja Noturna',
    category: 'aves',
    url: 'https://images.unsplash.com/photo-1543549790-8b5f4a028cfb?w=200&auto=format&fit=crop&q=80',
    emoji: '🦉'
  },
  {
    id: 'parrot',
    name: 'Papagaio Tropical',
    category: 'aves',
    url: 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?w=200&auto=format&fit=crop&q=80',
    emoji: '🦜'
  },
  {
    id: 'peacock',
    name: 'Pavão Fénix',
    category: 'aves',
    url: 'https://images.unsplash.com/photo-1536514072410-5019a3c69182?w=200&auto=format&fit=crop&q=80',
    emoji: '🦚'
  },
  {
    id: 'flamingo',
    name: 'Flamingo Cyber',
    category: 'aves',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=200&auto=format&fit=crop&q=80',
    emoji: '🦩'
  },
  {
    id: 'penguin',
    name: 'Pinguim Piloto',
    category: 'aves',
    url: 'https://images.unsplash.com/photo-1598439210625-5067c578f3f6?w=200&auto=format&fit=crop&q=80',
    emoji: '🐧'
  },
  {
    id: 'duck',
    name: 'Pato Turbinado',
    category: 'aves',
    url: 'https://images.unsplash.com/photo-1555852095-64e7428df0fa?w=200&auto=format&fit=crop&q=80',
    emoji: '🦆'
  },

  // SELVA & PREDADORES
  {
    id: 'wolf',
    name: 'Lobo Alfa',
    category: 'selva',
    url: 'https://images.unsplash.com/photo-1564349683136-77e08dba1ef9?w=200&auto=format&fit=crop&q=80',
    emoji: '🐺',
    badge: 'Alfa'
  },
  {
    id: 'lion',
    name: 'Leão Rei',
    category: 'selva',
    url: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=200&auto=format&fit=crop&q=80',
    emoji: '🦁',
    badge: 'Lendário'
  },
  {
    id: 'tiger',
    name: 'Tigre Elétrico',
    category: 'selva',
    url: 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=200&auto=format&fit=crop&q=80',
    emoji: '🐯'
  },
  {
    id: 'fox',
    name: 'Raposa Ágil',
    category: 'selva',
    url: 'https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=200&auto=format&fit=crop&q=80',
    emoji: '🦊'
  },
  {
    id: 'bear',
    name: 'Urso Polar',
    category: 'selva',
    url: 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?w=200&auto=format&fit=crop&q=80',
    emoji: '🐻'
  },
  {
    id: 'panther',
    name: 'Pantera Negra',
    category: 'selva',
    url: 'https://images.unsplash.com/photo-1456926631375-92c8ce872def?w=200&auto=format&fit=crop&q=80',
    emoji: '🐆'
  },

  // MASCOTES & CRIATURAS
  {
    id: 'skybird_mascot',
    name: 'Mascote Skybird 3D',
    category: 'mascotes',
    url: 'https://api.dicebear.com/7.x/bottts/svg?seed=SkybirdMascotCool',
    emoji: '🚀',
    badge: 'Oficial'
  },
  {
    id: 'dragon',
    name: 'Dragão Místico',
    category: 'mascotes',
    url: 'https://api.dicebear.com/7.x/bottts/svg?seed=SkybirdDragonMaster',
    emoji: '🐉'
  },
  {
    id: 'cybercat',
    name: 'Gato Neon',
    category: 'mascotes',
    url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=200&auto=format&fit=crop&q=80',
    emoji: '🐱'
  },
  {
    id: 'speedrabbit',
    name: 'Coelho Turbo',
    category: 'mascotes',
    url: 'https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=200&auto=format&fit=crop&q=80',
    emoji: '🐰'
  }
];

interface AvatarSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatarUrl?: string;
  onSelectAvatar?: (url: string) => void;
}

export const AvatarSelectorModal: React.FC<AvatarSelectorModalProps> = ({
  isOpen,
  onClose,
  currentAvatarUrl,
  onSelectAvatar
}) => {
  const currentUser = store.getCurrentUser();
  const activeAvatar = currentAvatarUrl || currentUser.avatar || ANIMAL_AVATARS[0].url;
  const [selectedUrl, setSelectedUrl] = useState<string>(activeAvatar);
  const [category, setCategory] = useState<'all' | 'aves' | 'selva' | 'mascotes'>('all');
  const [savedSuccess, setSavedSuccess] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedUrl(activeAvatar);
      setSavedSuccess(false);
    }
  }, [isOpen, activeAvatar]);

  if (!isOpen) return null;

  const filteredAvatars = ANIMAL_AVATARS.filter(a => {
    if (category === 'all') return true;
    return a.category === category;
  });

  const handleConfirmSelection = () => {
    audioManager.playButtonClick();
    if (onSelectAvatar) {
      onSelectAvatar(selectedUrl);
    } else {
      store.updateUserAvatar(selectedUrl);
    }
    audioManager.playNotification();
    setSavedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-950 border border-cyan-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-cyan-950/50 relative overflow-hidden">
        {/* Header Decorative Ambient */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={() => {
            audioManager.playButtonClick();
            onClose();
          }}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3 mb-6 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 p-0.5 shadow-lg shadow-cyan-500/30 shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-cyan-400">
              <Bird className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-cyber font-black text-white tracking-wide">
                AVATAR DE PILOTO & ANIMAIS
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 border border-cyan-500/40 text-cyan-300">
                Aves & Fauna
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Escolha a sua ave ou animal de estimação para o seu perfil e ranking de apostas.
            </p>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl mb-5 overflow-x-auto text-xs relative z-10">
          <button
            onClick={() => setCategory('all')}
            className={`px-3.5 py-2 rounded-xl font-cyber font-bold transition whitespace-nowrap cursor-pointer ${
              category === 'all'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ✨ Todos ({ANIMAL_AVATARS.length})
          </button>

          <button
            onClick={() => setCategory('aves')}
            className={`px-3.5 py-2 rounded-xl font-cyber font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              category === 'aves'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🦅 Aves & Voo
          </button>

          <button
            onClick={() => setCategory('selva')}
            className={`px-3.5 py-2 rounded-xl font-cyber font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              category === 'selva'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🐺 Selva & Alfa
          </button>

          <button
            onClick={() => setCategory('mascotes')}
            className={`px-3.5 py-2 rounded-xl font-cyber font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              category === 'mascotes'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🐉 Mascotes & Cyber
          </button>
        </div>

        {/* Avatars Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-[340px] overflow-y-auto pr-1 pb-2 scrollbar-thin relative z-10">
          {filteredAvatars.map((item) => {
            const isSelected = selectedUrl === item.url;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  audioManager.playButtonClick();
                  setSelectedUrl(item.url);
                }}
                className={`relative group flex flex-col items-center p-2.5 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-b from-cyan-500/20 to-blue-600/20 border-cyan-400 shadow-lg shadow-cyan-500/30 scale-105'
                    : 'bg-slate-900/80 border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800'
                }`}
              >
                {/* Badge if present */}
                {item.badge && (
                  <span className="absolute -top-1.5 -right-1 px-1.5 py-0.5 rounded-md text-[8px] font-mono font-bold bg-amber-500 text-slate-950 uppercase shadow">
                    {item.badge}
                  </span>
                )}

                {/* Avatar Image */}
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden mb-1.5 border border-white/10 group-hover:scale-105 transition-transform">
                  <img
                    src={item.url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-cyan-500/30 backdrop-blur-[1px] flex items-center justify-center">
                      <div className="w-7 h-7 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shadow-lg">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Label */}
                <span className="text-[10px] font-bold text-center text-slate-200 line-clamp-1 w-full flex items-center justify-center gap-1">
                  <span>{item.emoji}</span>
                  <span className="truncate">{item.name.split(' ')[0]}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Preview & Footer Actions */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
          {/* Active Preview */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-cyan-400 p-0.5 shadow-md shadow-cyan-500/30">
              <img
                src={selectedUrl}
                alt="Preview"
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono text-cyan-400 block font-semibold">
                Avatar Selecionado
              </span>
              <span className="text-xs font-bold text-white">
                {ANIMAL_AVATARS.find(a => a.url === selectedUrl)?.name || 'Personalizado'}
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-cyber font-bold text-xs transition cursor-pointer"
            >
              CANCELAR
            </button>

            <button
              type="button"
              onClick={handleConfirmSelection}
              className="flex-1 sm:flex-initial px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-cyber font-black text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/30 transition cursor-pointer flex items-center justify-center gap-2"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-slate-950" />
                  <span>SALVO COM SUCESSO!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>USAR ESTE AVATAR</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
