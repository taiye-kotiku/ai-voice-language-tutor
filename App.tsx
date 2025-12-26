
import React, { useState } from 'react';
import LanguageSelector from './components/LanguageSelector';
import TutorView from './components/TutorView';
import { Language } from './types';

const App: React.FC = () => {
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);

  const handleLanguageSelect = (language: Language) => {
    setSelectedLanguage(language);
  };

  const handleBack = () => {
    setSelectedLanguage(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl mx-auto">
        <header className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg mb-4">
            <i className="fas fa-graduation-cap text-3xl text-white"></i>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">LinguaMaster AI</h1>
          <p className="text-slate-400 mt-2 text-lg">Your expert guide to mastering the world's languages.</p>
        </header>
        
        <main className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 md:p-8 overflow-hidden">
          {!selectedLanguage ? (
            <LanguageSelector onSelect={handleLanguageSelect} />
          ) : (
            <TutorView language={selectedLanguage} onBack={handleBack} />
          )}
        </main>
        <footer className="text-center mt-8 text-slate-600 text-sm flex flex-col gap-2">
            <p className="italic font-light">"Language is the road map of a culture."</p>
            <p className="font-medium tracking-widest uppercase text-xs opacity-50">Powered by Gemini 2.5</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
