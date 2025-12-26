
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
];

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ onSelect }) => {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-center text-slate-200 mb-6">What language would you like to practice today?</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {languages.map((lang) => (
          <button
            key={lang.name}
            onClick={() => onSelect(lang)}
            className="flex flex-col items-center justify-center p-4 bg-slate-700 rounded-lg hover:bg-cyan-500 hover:scale-105 transform transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <span className="text-4xl mb-2">{lang.flag}</span>
            <span className="text-lg font-medium text-slate-100">{lang.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default LanguageSelector;
