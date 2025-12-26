import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import { Language, TranscriptEntry } from '../types';
import { encode, decode, decodeAudioData } from '../utils/audioUtils';
import MicrophoneIcon from './icons/MicrophoneIcon';
import StopIcon from './icons/StopIcon';

interface TutorViewProps {
  language: Language;
  onBack: () => void;
}

const getSystemInstruction = (languageName: string): string => `
You are Alex, an enthusiastic, patient, and highly encouraging language tutor. Your goal is to help me practice my conversational skills in ${languageName}.

Your persona:
- You are friendly, warm, and positive.
- You are very encouraging. Use phrases like "Excellent!", "Great try!", "You're improving fast!", and their ${languageName} equivalents.
- Your voice should be expressive and natural. Use enthusiasm, pause for emphasis, and adapt your tone to the conversation.

Your instructions:
1.  **Primary Language:** Our conversation must be primarily in ${languageName}.
2.  **Initial Greeting:** Start with a simple, friendly greeting in ${languageName} to begin the conversation, like "Hello! How are you? What's your name?".
3.  **Natural Dialogue:** Engage me in natural dialogues. Suggest topics (like travel, food, hobbies) or role-play scenarios (ordering at a restaurant, asking for directions).
4.  **Gentle Corrections:** If I make a grammar or pronunciation mistake, correct me gently and positively. First, repeat what I said correctly. Then, briefly explain the correction. For example, if I'm learning Spanish and say "Yo soy hambre," you could say, "Ah, in Spanish we say 'Yo tengo hambre'. 'Tener' is used for feelings like hunger and thirst. Great try! Now, what would you like to eat?"
5.  **Vocabulary & Culture:** Casually introduce new vocabulary, idioms, or cultural notes relevant to our conversation.
6.  **Adaptability:** If I switch topics or ask for help in English, adapt smoothly. You can provide brief English explanations, but always guide the conversation back to ${languageName}.
7.  **Maintain the flow:** Keep the conversation going. Ask me questions and respond to my answers thoughtfully to create an immersive experience.
`;

const TutorView: React.FC<TutorViewProps> = ({ language, onBack }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [isAlexSpeaking, setIsAlexSpeaking] = useState(false);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const nextAudioStartTimeRef = useRef(0);
  const playingAudioSourcesRef = useRef(new Set<AudioBufferSourceNode>());

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
    setIsAlexSpeaking(false);
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      // Fix: Use `(window as any).webkitAudioContext` for cross-browser compatibility.
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      nextAudioStartTimeRef.current = 0;

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: getSystemInstruction(language.name),
        },
        callbacks: {
          onopen: async () => {
            try {
                // Fix: Use `(window as any).webkitAudioContext` for cross-browser compatibility.
                inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
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
                    sessionPromiseRef.current?.then((session) => {
                        session.sendRealtimeInput({ media: pcmBlob });
                    });
                };
    
                sourceNodeRef.current.connect(scriptProcessorRef.current);
                scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
                setStatus('active');
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
              setIsAlexSpeaking(true);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputAudioContextRef.current.destination);
              
              const currentTime = outputAudioContextRef.current.currentTime;
              const startTime = Math.max(currentTime, nextAudioStartTimeRef.current);
              source.start(startTime);
              nextAudioStartTimeRef.current = startTime + audioBuffer.duration;
              playingAudioSourcesRef.current.add(source);

              source.onended = () => {
                playingAudioSourcesRef.current.delete(source);
                if (playingAudioSourcesRef.current.size === 0) {
                    setIsAlexSpeaking(false);
                }
              };
            }

            if (message.serverContent?.interrupted) {
                playingAudioSourcesRef.current.forEach(source => source.stop());
                playingAudioSourcesRef.current.clear();
                nextAudioStartTimeRef.current = 0;
                setIsAlexSpeaking(false);
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
    <div className="flex flex-col h-[60vh] max-h-[700px]">
      <div className="flex justify-between items-center mb-4">
        <button onClick={onBack} className="text-slate-400 hover:text-cyan-400 transition-colors">&larr; Change Language</button>
        <div className="flex items-center gap-2">
            <span className="text-2xl">{language.flag}</span>
            <h3 className="text-xl font-semibold text-slate-200">{language.name}</h3>
        </div>
      </div>

      <div className="flex-grow bg-slate-900/50 rounded-lg p-4 overflow-y-auto mb-4 custom-scrollbar">
        {transcripts.length === 0 && status !== 'active' && (
             <div className="flex items-center justify-center h-full text-slate-500">
                <p>Click "Start Conversation" to begin.</p>
            </div>
        )}
        {transcripts.map((entry) => (
          <div key={entry.id} className={`flex mb-3 ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`rounded-xl px-4 py-2 max-w-sm md:max-w-md ${entry.speaker === 'user' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
              <p>{entry.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center justify-center">
         <div className="h-10 flex items-center justify-center mb-4">
            {isAlexSpeaking && (
                 <div className="flex items-center gap-2 text-slate-400">
                    <div className="dot-flashing"></div>
                    <span>Alex is speaking...</span>
                </div>
            )}
        </div>
        
        {status === 'idle' || status === 'error' ? (
          <button onClick={startConversation} className="flex items-center gap-3 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-full transition-colors duration-200">
            <MicrophoneIcon /> Start Conversation
          </button>
        ) : status === 'connecting' ? (
           <button disabled className="flex items-center gap-3 bg-yellow-500 text-white font-bold py-3 px-6 rounded-full cursor-not-allowed">
            <i className="fas fa-spinner fa-spin"></i> Connecting...
          </button>
        ) : (
          <button onClick={stopConversation} className="flex items-center gap-3 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-full transition-colors duration-200">
            <StopIcon /> Stop Conversation
          </button>
        )}
         {status === 'error' && <p className="text-red-400 mt-2">An error occurred. Please try again.</p>}
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
        .dot-flashing { position: relative; width: 10px; height: 10px; border-radius: 5px; background-color: #22d3ee; color: #22d3ee; animation: dotFlashing 1s infinite linear alternate; animation-delay: .5s; }
        .dot-flashing::before, .dot-flashing::after { content: ''; display: inline-block; position: absolute; top: 0; }
        .dot-flashing::before { left: -15px; width: 10px; height: 10px; border-radius: 5px; background-color: #22d3ee; color: #22d3ee; animation: dotFlashing 1s infinite alternate; animation-delay: 0s; }
        .dot-flashing::after { left: 15px; width: 10px; height: 10px; border-radius: 5px; background-color: #22d3ee; color: #22d3ee; animation: dotFlashing 1s infinite alternate; animation-delay: 1s; }
        @keyframes dotFlashing { 0% { background-color: #22d3ee; } 50%, 100% { background-color: rgba(34, 211, 238, 0.2); } }
      `}</style>
    </div>
  );
};

export default TutorView;