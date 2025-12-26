
import React, { useState, useRef, useEffect, useCallback } from 'react';
// Fixed: Removed non-existent LiveSession export from @google/genai
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { Language, TranscriptEntry } from '../types';
import { encode, decode, decodeAudioData } from '../utils/audioUtils';
import MicrophoneIcon from './icons/MicrophoneIcon';
import StopIcon from './icons/StopIcon';

interface TutorViewProps {
  language: Language;
  onBack: () => void;
}

const getSystemInstruction = (languageName: string): string => `
You are LinguaMaster, an expert, enthusiastic, and incredibly patient multilingual language tutor with years of teaching experience. Your voice is warm, clear, and expressive—use natural intonation, pauses for emphasis, enthusiasm when praising, and slower pacing when explaining difficult concepts. Your goal is to make language learning fun, immersive, and effective through real-time voice conversations.

Core Rules:
- Always respond in a natural, conversational way. Never list rules or break character.
- Speak primarily in ${languageName} once chosen, but switch to English for explanations, translations, or if the user struggles.
- Be encouraging and positive: Praise effort generously (e.g., "Wow, that's excellent pronunciation!" or "You're getting so much better! Keep going!").
- Correct errors gently and constructively—never criticize harshly.

Conversation Flow:
1. Greeting & Setup:
   - Start with: "Hello! I'm LinguaMaster, your personal AI language tutor. 😊 I'm so excited to help you with ${languageName}! To get started, tell me: what's your current level? Beginner, Intermediate, or Advanced? You can also call me Lingua!"
   - Once they respond with their level, adapt the complexity of your ${languageName} immediately.

2. During Practice:
   - Assess level subtly through conversation and adapt difficulty.
   - Propose engaging topics: Daily life, travel, food, hobbies, work, culture, or role-plays (e.g., ordering at a café, meeting friends).
   - Ask open-ended questions to encourage speaking.
   - Provide immersive role-plays: "Let's pretend we're in a beautiful city where ${languageName} is spoken. You start—how would you greet me?"

3. Corrections & Feedback:
   - After user speaks: Always acknowledge positively first.
   - Correct pronunciation: Repeat the phrase correctly and slowly, explaining the sounds (e.g., mouth position or analogies).
   - Grammar/vocab: Explain briefly and encourage the user to try the corrected version.

4. Engagement & Fun:
   - Mix in quizzes, tongue twisters, or fun cultural facts.
   - Keep responses concise for voice (under 100-150 words unless explaining), expressive, and interactive.
`;

const TutorView: React.FC<TutorViewProps> = ({ language, onBack }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [isLinguaSpeaking, setIsLinguaSpeaking] = useState(false);

  // Fixed: Used any instead of LiveSession as it is not exported from the @google/genai SDK
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const nextAudioStartTimeRef = useRef(0);
  const playingAudioSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [transcripts]);

  const stopConversation = useCallback(async () => {
    setStatus('idle');
    if (sessionPromiseRef.current) {
        const session = await sessionPromiseRef.current;
        session.close();
        sessionPromiseRef.current = null;
    }
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        await inputAudioContextRef.current.close();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        playingAudioSourcesRef.current.forEach(source => source.stop());
        playingAudioSourcesRef.current.clear();
        await outputAudioContextRef.current.close();
    }
    setIsLinguaSpeaking(false);
  }, []);

  useEffect(() => {
    return () => {
        stopConversation();
    };
  }, [stopConversation]);

  const startConversation = async () => {
    setStatus('connecting');
    setTranscripts([]);
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';

    try {
      // Fixed: Always use named parameter for apiKey during initialization
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      nextAudioStartTimeRef.current = 0;

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }, 
          systemInstruction: getSystemInstruction(language.name),
        },
        callbacks: {
          onopen: async () => {
            try {
                inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (inputAudioContextRef.current && mediaStreamRef.current) {
                    sourceNodeRef.current = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
                    scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
        
                    scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const l = inputData.length;
                        const int16 = new Int16Array(l);
                        for (let i = 0; i < l; i++) {
                            int16[i] = inputData[i] * 32768;
                        }
                        const pcmBlob: Blob = {
                            data: encode(new Uint8Array(int16.buffer)),
                            mimeType: 'audio/pcm;rate=16000',
                        };
                        // Fixed: Only send data after the session connection promise resolves
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
        
                    sourceNodeRef.current.connect(scriptProcessorRef.current);
                    scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
                    setStatus('active');
                }
            } catch (err) {
                console.error('Error during microphone setup:', err);
                setStatus('error');
                stopConversation();
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              currentInputTranscriptionRef.current += text;
            }
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              currentOutputTranscriptionRef.current += text;
            }

            if (message.serverContent?.turnComplete) {
              if (currentInputTranscriptionRef.current.trim()) {
                setTranscripts(prev => [...prev, { id: Date.now(), speaker: 'user', text: currentInputTranscriptionRef.current.trim() }]);
              }
              if (currentOutputTranscriptionRef.current.trim()) {
                setTranscripts(prev => [...prev, { id: Date.now() + 1, speaker: 'alex', text: currentOutputTranscriptionRef.current.trim() }]);
              }
              currentInputTranscriptionRef.current = '';
              currentOutputTranscriptionRef.current = '';
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              setIsLinguaSpeaking(true);
              // Fixed: Using manual decoding implementation for raw PCM streams
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputAudioContextRef.current.destination);
              
              const currentTime = outputAudioContextRef.current.currentTime;
              // Fixed: Scheduling chunks to start at the tracked end time for gapless playback
              const startTime = Math.max(currentTime, nextAudioStartTimeRef.current);
              source.start(startTime);
              nextAudioStartTimeRef.current = startTime + audioBuffer.duration;
              playingAudioSourcesRef.current.add(source);

              source.onended = () => {
                playingAudioSourcesRef.current.delete(source);
                if (playingAudioSourcesRef.current.size === 0) {
                    setIsLinguaSpeaking(false);
                }
              };
            }

            if (message.serverContent?.interrupted) {
                playingAudioSourcesRef.current.forEach(source => source.stop());
                playingAudioSourcesRef.current.clear();
                nextAudioStartTimeRef.current = 0;
                setIsLinguaSpeaking(false);
            }
          },
          onerror: (e) => {
            console.error('Session error:', e);
            setStatus('error');
            stopConversation();
          },
          onclose: () => {
            console.log('Session closed');
            if (status !== 'idle') {
                stopConversation();
            }
          },
        },
      });
    } catch (err) {
      console.error('Failed to start conversation:', err);
      setStatus('error');
    }
  };
  
  return (
    <div className="flex flex-col h-[65vh] max-h-[800px]">
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-indigo-400 transition-colors font-medium">
          <i className="fas fa-arrow-left text-xs"></i> Change Language
        </button>
        <div className="flex items-center gap-3 bg-slate-800/80 px-4 py-1.5 rounded-full border border-slate-700 shadow-sm">
            <span className="text-2xl drop-shadow-sm">{language.flag}</span>
            <h3 className="text-lg font-bold text-slate-100">{language.name}</h3>
        </div>
      </div>

      <div className="flex-grow bg-slate-950/40 rounded-2xl p-6 overflow-y-auto mb-6 custom-scrollbar border border-slate-800/50 backdrop-blur-sm">
        {transcripts.length === 0 && status !== 'active' && (
             <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                   <i className="fas fa-comment-dots text-2xl"></i>
                </div>
                <p className="text-center font-medium max-w-[250px]">Select "Start" and say "Hello" to begin your journey with LinguaMaster!</p>
            </div>
        )}
        {transcripts.map((entry) => (
          <div key={entry.id} className={`flex mb-4 ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`relative group max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3 shadow-md border ${
              entry.speaker === 'user' 
                ? 'bg-indigo-600 border-indigo-500 text-white rounded-tr-none' 
                : 'bg-slate-800 border-slate-700 text-slate-200 rounded-tl-none'
            }`}>
              <div className="absolute -top-5 text-[10px] uppercase tracking-wider font-bold opacity-40 mb-1">
                {entry.speaker === 'user' ? 'You' : 'LinguaMaster'}
              </div>
              <p className="text-[15px] leading-relaxed">{entry.text}</p>
            </div>
          </div>
        ))}
        <div ref={transcriptEndRef} />
      </div>

      <div className="flex flex-col items-center justify-center">
         <div className="h-12 flex items-center justify-center mb-2">
            {isLinguaSpeaking && (
                 <div className="flex items-center gap-3 text-indigo-400 bg-indigo-950/30 px-4 py-2 rounded-full border border-indigo-500/20">
                    <div className="dot-flashing"></div>
                    <span className="text-sm font-semibold tracking-wide">LinguaMaster is speaking...</span>
                </div>
            )}
            {status === 'active' && !isLinguaSpeaking && (
               <div className="flex items-center gap-2 text-emerald-400/70 animate-pulse">
                  <i className="fas fa-circle text-[8px]"></i>
                  <span className="text-xs font-bold uppercase tracking-widest">Listening...</span>
               </div>
            )}
        </div>
        
        <div className="relative group">
          {status === 'idle' || status === 'error' ? (
            <button 
              onClick={startConversation} 
              className="group flex items-center gap-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold py-4 px-10 rounded-full transition-all duration-300 shadow-xl hover:shadow-emerald-500/20 hover:-translate-y-1"
            >
              <MicrophoneIcon /> 
              <span className="text-lg">Start Practicing</span>
            </button>
          ) : status === 'connecting' ? (
            <button disabled className="flex items-center gap-4 bg-slate-700 text-slate-400 font-bold py-4 px-10 rounded-full cursor-not-allowed">
              <i className="fas fa-circle-notch fa-spin text-xl"></i> 
              <span className="text-lg">Connecting...</span>
            </button>
          ) : (
            <button 
              onClick={stopConversation} 
              className="flex items-center gap-4 bg-slate-100 hover:bg-white text-slate-900 font-bold py-4 px-10 rounded-full transition-all duration-300 shadow-xl hover:-translate-y-1"
            >
              <StopIcon /> 
              <span className="text-lg">Finish Session</span>
            </button>
          )}
        </div>
        
        {status === 'error' && (
          <div className="mt-4 flex items-center gap-2 text-red-400 bg-red-950/20 px-4 py-2 rounded-lg border border-red-500/20">
            <i className="fas fa-exclamation-triangle"></i>
            <p className="text-sm font-medium">Connection failed. Please check your mic and try again.</p>
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
        
        .dot-flashing { position: relative; width: 6px; height: 6px; border-radius: 5px; background-color: #818cf8; color: #818cf8; animation: dotFlashing 1s infinite linear alternate; animation-delay: .5s; }
        .dot-flashing::before, .dot-flashing::after { content: ''; display: inline-block; position: absolute; top: 0; }
        .dot-flashing::before { left: -10px; width: 6px; height: 6px; border-radius: 5px; background-color: #818cf8; color: #818cf8; animation: dotFlashing 1s infinite alternate; animation-delay: 0s; }
        .dot-flashing::after { left: 10px; width: 6px; height: 6px; border-radius: 5px; background-color: #818cf8; color: #818cf8; animation: dotFlashing 1s infinite alternate; animation-delay: 1s; }
        @keyframes dotFlashing { 0% { background-color: #818cf8; } 50%, 100% { background-color: rgba(129, 140, 248, 0.2); } }
      `}</style>
    </div>
  );
};

export default TutorView;
