
import React from 'react';
import { Language } from '../types';

interface LanguageSelectorProps {
  onSelect: (language: Language) => void;
}

const languages: Language[] = [
  { name: 'Spanish', flag: '🇪🇸' },
  { name: 'French', flag: '🇫🇷' },
  { name: 'German', flag: '🇩🇪' },
  { name: 'Japanese', flag: '🇯🇵' },
  { name: 'Italian', flag: '🇮🇹' },
  { name: 'Portuguese', flag: '🇵🇹' },
  { name: 'Mandarin', flag: '🇨🇳' },
  { name: 'Korean', flag: '🇰🇷' },
  { name: 'Russian', flag: '🇷🇺' },
  { name: 'Arabic', flag: '🇸🇦' },
  { name: 'Hindi', flag: '🇮🇳' },
  { name: 'English', flag: '🇬🇧' },
];

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ onSelect }) => {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-center text-slate-200 mb-8">What language shall we master today?</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {languages.map((lang) => (
          <button
            key={lang.name}
            onClick={() => onSelect(lang)}
            className="group flex flex-col items-center justify-center p-5 bg-slate-800 border border-slate-700 rounded-2xl hover:bg-indigo-600/20 hover:border-indigo-500 hover:scale-[1.03] transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          >
            <span className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-300">{lang.flag}</span>
            <span className="text-base font-semibold text-slate-300 group-hover:text-indigo-300">{lang.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default LanguageSelector;
