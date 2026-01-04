
import React, { useState, useRef, useEffect } from 'react';
import { Scene, AppState, SUPPORTED_LANGUAGES, DubbingPerformance } from './types';
import { 
  generateScene, 
  getPerformanceFeedback, 
  generateReferenceAudio, 
  generateSceneImage, 
  generateSceneVideo,
  transcribeAudio,
  generateLipSyncVideo
} from './services/geminiService';
import AudioVisualizer from './components/AudioVisualizer';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [scenePrompt, setScenePrompt] = useState('');
  const [selectedLang, setSelectedLang] = useState('en');
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [performance, setPerformance] = useState<DubbingPerformance | null>(null);
  const [videoStatus, setVideoStatus] = useState<string>('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [showSynced, setShowSynced] = useState(false);

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    const has = await (window as any).aistudio.hasSelectedApiKey();
    setHasKey(has);
  };

  const handleOpenKeySelector = async () => {
    await (window as any).aistudio.openSelectKey();
    setHasKey(true);
  };

  const updateVideoStatus = (status: string) => {
    setVideoStatus(status);
  };

  const handleCreateScene = async () => {
    if (!scenePrompt.trim()) return;
    setAppState('CREATING');
    setFeedback(null);
    setPerformance(null);
    setShowSynced(false);
    
    try {
      updateVideoStatus("Writing script...");
      const scene = await generateScene(scenePrompt, selectedLang);
      setCurrentScene(scene);

      updateVideoStatus("Sketching storyboard...");
      const imageUrl = await generateSceneImage(scene.title, scene.context);
      if (imageUrl) {
        setCurrentScene(prev => prev ? { ...prev, imageUrl } : null);
      }

      updateVideoStatus("Blocking actors...");
      const videoUrl = await generateSceneVideo(scenePrompt, imageUrl || undefined);
      if (videoUrl) {
        setCurrentScene(prev => prev ? { ...prev, videoUrl } : null);
      }

      setAppState('READY');
      setVideoStatus('');
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Requested entity was not found")) setHasKey(false);
      setAppState('IDLE');
      alert("Failed to generate scene.");
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const duration = (Date.now() - startTimeRef.current) / 1000;
        
        setAppState('ANALYZING');
        updateVideoStatus("Transcribing performance...");
        
        const transcription = await transcribeAudio(audioBlob);
        setPerformance({ audioBlob, duration, timestamp: Date.now(), transcription });
        
        if (currentScene) {
          const aiFeedback = await getPerformanceFeedback(currentScene, duration, transcription);
          setFeedback(aiFeedback);
        }
        setAppState('READY');
        setVideoStatus('');
      };

      startTimeRef.current = Date.now();
      mediaRecorder.start();
      setAppState('RECORDING');
    } catch (err) {
      console.error("Microphone access denied", err);
      alert("Microphone access is required.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && appState === 'RECORDING') {
      mediaRecorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const handleLipSync = async () => {
    if (!performance?.transcription || !currentScene?.videoUrl) return;
    setAppState('SYNCING');
    updateVideoStatus("Synthesizing lip movement...");
    
    try {
      const syncedUrl = await generateLipSyncVideo(
        currentScene.videoUrl, 
        performance.transcription, 
        currentScene.context
      );
      if (syncedUrl) {
        setCurrentScene(prev => prev ? { ...prev, syncedVideoUrl: syncedUrl } : null);
        setShowSynced(true);
      }
      setAppState('READY');
      setVideoStatus('');
    } catch (err) {
      console.error(err);
      setAppState('READY');
      alert("Lip sync generation failed.");
    }
  };

  const playRecording = () => {
    if (performance) {
      const url = URL.createObjectURL(performance.audioBlob);
      const audio = new Audio(url);
      audio.play();
    }
  };

  const playReference = async (text: string) => {
    const bytes = await generateReferenceAudio(text);
    if (bytes) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const dataInt16 = new Int16Array(bytes.buffer);
      const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
    }
  };

  if (hasKey === false) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full glass-card p-8 rounded-3xl border-blue-500/30">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/20">
            <i className="fas fa-key text-3xl text-white"></i>
          </div>
          <h2 className="text-2xl font-bold mb-2">Studio Authentication</h2>
          <p className="text-slate-400 text-sm mb-6">Select a paid API key to unlock Cinematic Lip-Sync and Veo rendering features.</p>
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="block text-xs text-blue-400 mb-6 hover:underline">Billing Docs</a>
          <button onClick={handleOpenKeySelector} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all">Select API Key</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0f172a] text-slate-100">
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 sticky top-0 z-20 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg">
            <i className="fas fa-clapperboard text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">DubMaster <span className="text-blue-500">Cinema</span></h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Multi-Modal AI Studio</p>
          </div>
        </div>
        <button onClick={() => setHasKey(false)} className="text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest">Settings</button>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 flex flex-col gap-6">
          <section className="glass-card rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><i className="fas fa-video text-blue-400"></i> Scene Director</h2>
            <div className="space-y-4">
              <textarea 
                value={scenePrompt}
                onChange={(e) => setScenePrompt(e.target.value)}
                placeholder="Describe your cinematic setting..."
                className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 transition-all min-h-[100px]"
              />
              <select 
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-3 text-sm appearance-none"
              >
                {SUPPORTED_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
              </select>
              <button 
                onClick={handleCreateScene}
                disabled={appState === 'CREATING'}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all"
              >
                {appState === 'CREATING' ? <><i className="fas fa-spinner fa-spin mr-2"></i> Processing...</> : "Generate Cinema Scene"}
              </button>
            </div>
          </section>

          {performance && (
            <section className="glass-card rounded-2xl p-6 border-blue-500/20">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><i className="fas fa-wave-square text-green-400"></i> Recorded Take</h2>
              <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-800 mb-4">
                <div>
                  <p className="text-sm font-bold text-slate-200">DUB TAKE #{performance.timestamp.toString().slice(-4)}</p>
                  <p className="text-xs text-slate-400 truncate max-w-[150px]">"{performance.transcription || 'Capturing text...'}"</p>
                </div>
                <button onClick={playRecording} className="w-10 h-10 rounded-full bg-green-600/10 text-green-400 hover:bg-green-600 hover:text-white transition-all flex items-center justify-center">
                  <i className="fas fa-play"></i>
                </button>
              </div>
              
              {!currentScene?.syncedVideoUrl && performance.transcription && (
                <button 
                  onClick={handleLipSync}
                  disabled={appState === 'SYNCING'}
                  className="w-full mb-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl font-bold text-sm shadow-xl hover:scale-[1.02] transition-transform active:scale-95 disabled:opacity-50"
                >
                  <i className="fas fa-sync-alt mr-2"></i> 
                  {appState === 'SYNCING' ? "Syncing Mouth..." : "Sync Lip Movement"}
                </button>
              )}

              {feedback && (
                <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Director's Note</p>
                  <p className="text-sm italic text-slate-300 leading-relaxed font-serif">"{feedback}"</p>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6">
          <section className="flex-1 glass-card rounded-2xl p-6 md:p-8 relative flex flex-col overflow-hidden shadow-2xl">
            {['CREATING', 'SYNCING', 'ANALYZING'].includes(appState) ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
                <div className="relative mb-8">
                  <div className="w-24 h-24 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                  <i className={`fas ${appState === 'SYNCING' ? 'fa-sync' : 'fa-film'} text-3xl text-blue-400 absolute inset-0 flex items-center justify-center`}></i>
                </div>
                <h3 className="text-2xl font-bold mb-2">Production in Progress</h3>
                <div className="px-6 py-2 bg-slate-900 border border-slate-800 rounded-full">
                  <span className="text-xs font-mono text-blue-400 animate-pulse uppercase tracking-[0.2em]">{videoStatus || "Processing..."}</span>
                </div>
              </div>
            ) : !currentScene ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 py-32">
                <i className="fas fa-photo-film text-8xl mb-6"></i>
                <h2 className="text-2xl font-bold mb-2">Stage Ready</h2>
                <p className="text-sm text-slate-400 max-w-xs">Describe a scene to begin your AI-powered dubbing experience.</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden mb-8 bg-slate-950 border-4 border-slate-900 shadow-2xl group">
                  <video 
                    src={showSynced && currentScene.syncedVideoUrl ? currentScene.syncedVideoUrl : currentScene.videoUrl} 
                    autoPlay loop muted playsInline
                    className="w-full h-full object-cover"
                    key={showSynced ? 'synced' : 'original'}
                  />
                  
                  {currentScene.syncedVideoUrl && (
                    <div className="absolute top-4 right-4 flex bg-slate-900/80 rounded-lg p-1 border border-white/10 backdrop-blur-sm z-10">
                      <button 
                        onClick={() => setShowSynced(false)}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${!showSynced ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >BASE</button>
                      <button 
                        onClick={() => setShowSynced(true)}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${showSynced ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >SYNCED</button>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/90 to-transparent">
                    <h3 className="text-2xl font-bold text-white mb-1 drop-shadow-lg">{currentScene.title}</h3>
                    <p className="text-xs text-slate-300 font-semibold drop-shadow-md">{currentScene.context}</p>
                  </div>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto pr-4 mb-8">
                  {currentScene.dialogue.map((line, idx) => (
                    <div key={idx} className="group flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">{line.character}</span>
                        <div className="h-px flex-1 bg-slate-800"></div>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 uppercase font-bold">{line.emotion}</span>
                        <button onClick={() => playReference(line.text)} className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-800/50 hover:bg-blue-600 transition-all text-slate-500 hover:text-white">
                          <i className="fas fa-headphones text-xs"></i>
                        </button>
                      </div>
                      <p className="text-xl font-medium text-slate-100 leading-relaxed group-hover:text-white transition-colors">{line.text}</p>
                    </div>
                  ))}
                </div>

                <div className="pt-6 border-t border-slate-800/50">
                  <div className="mb-6 h-12"><AudioVisualizer stream={streamRef.current} isRecording={appState === 'RECORDING'} /></div>
                  <div className="flex items-center justify-center gap-8">
                    {appState !== 'RECORDING' ? (
                      <button onClick={startRecording} className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center text-white shadow-2xl shadow-red-600/40 hover:scale-110 active:scale-90 transition-all">
                        <i className="fas fa-microphone text-2xl"></i>
                      </button>
                    ) : (
                      <button onClick={stopRecording} className="w-20 h-20 rounded-full bg-white flex items-center justify-center text-red-600 shadow-2xl recording-pulse">
                        <i className="fas fa-stop text-2xl"></i>
                      </button>
                    )}
                    <div className="w-48 text-left">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">
                        {appState === 'RECORDING' ? "Session Rolling" : "Standby for Dubbing"}
                      </p>
                      {appState === 'RECORDING' ? (
                        <div className="flex items-center gap-2 text-red-500 font-mono text-xs">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                          <span>LIVE CAPTURE</span>
                        </div>
                      ) : <p className="text-sm text-slate-400 font-medium">Hit record to perform.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 text-[10px] flex justify-between items-center text-slate-500">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span><span className="uppercase font-bold text-slate-400 tracking-widest">Studio Ready</span></span>
          <span className="opacity-50">Gemini 3 Pro + Veo LipSync V2V</span>
        </div>
        <div className="font-bold tracking-widest">&copy; 2024 DUBMASTER PRODUCTIONS</div>
      </footer>
    </div>
  );
};

export default App;
