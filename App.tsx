
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
    <div className="min-h-screen bg-slate-900 text-white font-sans flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-cyan-400">Alex AI Language Tutor</h1>
          <p className="text-slate-400 mt-2">Your friendly guide to mastering new languages.</p>
        </header>
        
        <main className="bg-slate-800 rounded-2xl shadow-2xl p-6 md:p-8">
          {!selectedLanguage ? (
            <LanguageSelector onSelect={handleLanguageSelect} />
          ) : (
            <TutorView language={selectedLanguage} onBack={handleBack} />
          )}
        </main>
        <footer className="text-center mt-8 text-slate-500 text-sm">
            <p>Powered by Gemini</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
