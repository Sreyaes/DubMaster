
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
  const [includeVideo, setIncludeVideo] = useState(false); // Default to false for accessibility
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [performance, setPerformance] = useState<DubbingPerformance | null>(null);
  const [videoStatus, setVideoStatus] = useState<string>('');
  const [showSynced, setShowSynced] = useState(false);

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);

  const checkAndPromptForKey = async () => {
    const has = await (window as any).aistudio.hasSelectedApiKey();
    if (!has) {
      await (window as any).aistudio.openSelectKey();
      return true; // Assume success after opening dialog
    }
    return true;
  };

  const handleCreateScene = async () => {
    if (!scenePrompt.trim()) return;

    // Check key only if video is requested
    if (includeVideo) {
      await checkAndPromptForKey();
    }

    setAppState('CREATING');
    setFeedback(null);
    setPerformance(null);
    setShowSynced(false);
    
    try {
      setVideoStatus("Writing cinematic script...");
      const scene = await generateScene(scenePrompt, selectedLang);
      setCurrentScene(scene);

      setVideoStatus("Designing concept frames...");
      const imageUrl = await generateSceneImage(scene.title, scene.context);
      if (imageUrl) {
        setCurrentScene(prev => prev ? { ...prev, imageUrl } : null);
      }

      if (includeVideo) {
        setVideoStatus("Rendering cinematic video...");
        const videoUrl = await generateSceneVideo(scenePrompt, imageUrl || undefined);
        if (videoUrl) {
          setCurrentScene(prev => prev ? { ...prev, videoUrl } : null);
        }
      }

      setAppState('READY');
      setVideoStatus('');
    } catch (err: any) {
      console.error(err);
      setAppState('IDLE');
      if (err.message?.includes("Requested entity was not found")) {
        alert("Video generation requires a paid API key. Please try again with video disabled or select a valid key.");
      }
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
        setVideoStatus("Transcribing performance...");
        
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
      alert("Microphone access is required for dubbing.");
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
    
    await checkAndPromptForKey();
    
    setAppState('SYNCING');
    setVideoStatus("Harmonizing lip movements...");
    
    try {
      const syncedUrl = await generateLipSyncVideo(
        currentScene.videoUrl, 
        performance.transcription
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
      alert("Lip sync failed. Ensure you have a paid API key.");
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

  return (
    <div className="min-h-screen flex flex-col bg-[#0f172a] text-slate-100">
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 sticky top-0 z-20 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg">
            <i className="fas fa-clapperboard text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">DubMaster <span className="text-blue-500">Cinema</span></h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">AI Voice Studio</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-500 font-bold uppercase tracking-widest border border-slate-700">Studio Version 2.0</span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 flex flex-col gap-6">
          <section className="glass-card rounded-2xl p-6 shadow-2xl relative overflow-hidden border-t-2 border-t-blue-500">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><i className="fas fa-film text-blue-400"></i> New Production</h2>
            <div className="space-y-4">
              <textarea 
                value={scenePrompt}
                onChange={(e) => setScenePrompt(e.target.value)}
                placeholder="A high-stakes argument in a Victorian library..."
                className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 transition-all min-h-[100px] resize-none"
              />
              <select 
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-3 text-sm appearance-none cursor-pointer"
              >
                {SUPPORTED_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
              </select>
              
              <div className="flex items-center justify-between p-3 bg-slate-950/30 rounded-xl border border-slate-800">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-300">Generate Video</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-tight">Requires Paid API Key</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={includeVideo} 
                    onChange={(e) => setIncludeVideo(e.target.checked)} 
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <button 
                onClick={handleCreateScene}
                disabled={appState === 'CREATING'}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95"
              >
                {appState === 'CREATING' ? <><i className="fas fa-spinner fa-spin mr-2"></i> Generating Stage...</> : "Start Production"}
              </button>
            </div>
          </section>

          {performance && (
            <section className="glass-card rounded-2xl p-6 border-blue-500/20 animate-in slide-in-from-bottom-6">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><i className="fas fa-microphone-lines text-green-400"></i> Current Take</h2>
              <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-800 mb-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-200 uppercase tracking-tighter">Dub Record #{performance.timestamp.toString().slice(-4)}</p>
                  <p className="text-xs text-slate-400 italic truncate pr-4">"{performance.transcription || 'No dialogue detected'}"</p>
                </div>
                <button onClick={playRecording} className="w-10 h-10 rounded-full bg-green-600/10 text-green-400 hover:bg-green-600 hover:text-white transition-all flex items-center justify-center">
                  <i className="fas fa-play"></i>
                </button>
              </div>
              
              {currentScene?.videoUrl && performance.transcription && !currentScene?.syncedVideoUrl && (
                <button 
                  onClick={handleLipSync}
                  disabled={appState === 'SYNCING'}
                  className="w-full mb-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl font-bold text-sm shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                >
                  <i className="fas fa-sync-alt mr-2"></i> 
                  {appState === 'SYNCING' ? "Syncing Mouths..." : "Generate AI Lip-Sync"}
                </button>
              )}

              {feedback && (
                <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] block mb-2">Director's Review</span>
                  <p className="text-sm italic text-slate-300 leading-relaxed">"{feedback}"</p>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6">
          <section className="flex-1 glass-card rounded-2xl p-6 md:p-8 relative flex flex-col overflow-hidden shadow-2xl">
            {['CREATING', 'SYNCING', 'ANALYZING'].includes(appState) ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-20 animate-pulse">
                <div className="relative mb-8">
                  <div className="w-24 h-24 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                  <i className={`fas ${appState === 'SYNCING' ? 'fa-sync-alt' : 'fa-film'} text-3xl text-blue-400 absolute inset-0 flex items-center justify-center`}></i>
                </div>
                <h3 className="text-2xl font-bold mb-2">Creative Engine Processing</h3>
                <div className="px-6 py-2 bg-slate-900 border border-slate-800 rounded-full">
                  <span className="text-xs font-mono text-blue-400 uppercase tracking-[0.2em]">{videoStatus || "Processing data..."}</span>
                </div>
              </div>
            ) : !currentScene ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 py-32 group">
                <i className="fas fa-camera text-8xl mb-6 group-hover:scale-110 transition-transform"></i>
                <h2 className="text-2xl font-bold mb-2">Studio Standby</h2>
                <p className="text-sm text-slate-400 max-w-xs">Describe your scene to generate a script and key frame visualization.</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col animate-in fade-in duration-700">
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden mb-8 bg-slate-950 border-4 border-slate-900 shadow-2xl">
                  { (showSynced && currentScene.syncedVideoUrl) || currentScene.videoUrl ? (
                    <video 
                      src={showSynced && currentScene.syncedVideoUrl ? currentScene.syncedVideoUrl : currentScene.videoUrl} 
                      autoPlay loop muted playsInline
                      className="w-full h-full object-cover"
                      key={showSynced ? 'synced' : 'original'}
                    />
                  ) : currentScene.imageUrl ? (
                    <img src={currentScene.imageUrl} className="w-full h-full object-cover" alt="Scene Concept" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-900">
                       <i className="fas fa-image text-4xl text-slate-700"></i>
                    </div>
                  ) }
                  
                  {currentScene.syncedVideoUrl && (
                    <div className="absolute top-4 left-4 flex bg-slate-900/90 rounded-xl p-1 border border-white/10 backdrop-blur-md z-10">
                      <button 
                        onClick={() => setShowSynced(false)}
                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all ${!showSynced ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-white'}`}
                      >ORIGINAL</button>
                      <button 
                        onClick={() => setShowSynced(true)}
                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all ${showSynced ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-white'}`}
                      >AI LIP-SYNC</button>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/95 via-black/40 to-transparent">
                    <h3 className="text-2xl font-bold text-white mb-1 drop-shadow-xl">{currentScene.title}</h3>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                      <p className="text-[10px] uppercase font-bold tracking-widest text-slate-300">{currentScene.context}</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto pr-4 custom-scrollbar mb-8">
                  {currentScene.dialogue.map((line, idx) => (
                    <div key={idx} className="group flex flex-col gap-1 border-l-2 border-l-transparent hover:border-l-blue-500 pl-4 transition-all">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">{line.character}</span>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 uppercase font-bold border border-slate-700">{line.emotion}</span>
                        <button onClick={() => playReference(line.text)} className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-800/50 hover:bg-blue-600 transition-all text-slate-500 hover:text-white">
                          <i className="fas fa-volume-up text-[10px]"></i>
                        </button>
                      </div>
                      <p className="text-xl font-medium text-slate-100 group-hover:text-white transition-colors">{line.text}</p>
                    </div>
                  ))}
                </div>

                <div className="pt-6 border-t border-slate-800/50">
                  <div className="mb-6 h-12"><AudioVisualizer stream={streamRef.current} isRecording={appState === 'RECORDING'} /></div>
                  <div className="flex items-center justify-center gap-10">
                    {appState !== 'RECORDING' ? (
                      <button onClick={startRecording} className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center text-white shadow-2xl shadow-red-600/40 hover:scale-110 active:scale-90 transition-all group">
                        <i className="fas fa-microphone text-2xl group-hover:scale-110 transition-transform"></i>
                      </button>
                    ) : (
                      <button onClick={stopRecording} className="w-20 h-20 rounded-full bg-white flex items-center justify-center text-red-600 shadow-2xl shadow-white/20 recording-pulse active:scale-95 transition-all">
                        <i className="fas fa-stop text-2xl"></i>
                      </button>
                    )}
                    <div className="text-left w-40">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">
                        {appState === 'RECORDING' ? "Session Rolling" : "Standby for Dub"}
                      </p>
                      {appState === 'RECORDING' ? (
                        <div className="flex items-center gap-2 text-red-500 font-mono text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                          <span>RECORDING</span>
                        </div>
                      ) : <p className="text-xs text-slate-400 font-medium">Click to perform</p>}
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
          <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span><span className="uppercase font-bold text-slate-400 tracking-widest">Cinema Studio Online</span></span>
          <span className="opacity-50">Gemini 3 + Veo Pipeline</span>
        </div>
        <div className="font-bold tracking-widest uppercase">&copy; 2024 DUBMASTER PRODUCTIONS</div>
      </footer>
    </div>
  );
};

export default App;
