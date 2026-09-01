import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import { i18n, LANGUAGES, Language, LanguageOption } from '../../services/i18n';
import { audioManager } from '../../services/audioManager';

interface LanguageSelectorProps {
  variant?: 'header' | 'compact' | 'drawer';
  className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  variant = 'header',
  className = ''
}) => {
  const [currentLang, setCurrentLang] = useState<Language>(i18n.getLanguage());
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = i18n.subscribe((lang) => {
      setCurrentLang(lang);
    });
    return () => unsub();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelectLanguage = (lang: Language) => {
    audioManager.playButtonClick();
    i18n.setLanguage(lang);
    setIsOpen(false);
  };

  const activeOption = LANGUAGES.find((l) => l.code === currentLang) || LANGUAGES[0];

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left select-none ${className}`}>
      {/* Trigger Button */}
      <button
        id="btn-language-selector"
        type="button"
        onClick={() => {
          audioManager.playButtonClick();
          setIsOpen((prev) => !prev);
        }}
        title={`Idioma / Language: ${activeOption.nativeName}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/50 text-white transition shadow-sm cursor-pointer group"
      >
        <span className="text-base sm:text-lg leading-none" role="img" aria-label={activeOption.name}>
          {activeOption.flag}
        </span>
        <span className="font-mono text-xs font-bold text-slate-200 group-hover:text-cyan-300 uppercase tracking-wide">
          {activeOption.code}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-300 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-48 rounded-2xl bg-slate-950/95 border border-cyan-500/30 shadow-2xl shadow-black/80 backdrop-blur-xl p-1.5 z-50 animate-in fade-in zoom-in-95">
          <div className="px-2.5 py-1.5 border-b border-slate-800 text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center justify-between">
            <span>Idioma / Language</span>
            <Globe className="w-3 h-3 text-cyan-400" />
          </div>

          <div className="py-1 space-y-0.5">
            {LANGUAGES.map((option: LanguageOption) => {
              const isSelected = option.code === currentLang;
              return (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => handleSelectLanguage(option.code)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg leading-none">{option.flag}</span>
                    <div className="text-left">
                      <span className="block text-xs leading-snug">{option.name}</span>
                      <span className="block text-[10px] text-slate-400 font-mono">{option.country}</span>
                    </div>
                  </div>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
