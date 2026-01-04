
export interface DialogueLine {
  character: string;
  text: string;
  emotion: string;
}

export interface Scene {
  id: string;
  title: string;
  context: string;
  dialogue: DialogueLine[];
  language: string;
  imageUrl?: string;
  videoUrl?: string;
  syncedVideoUrl?: string;
}

export interface DubbingPerformance {
  audioBlob: Blob;
  duration: number;
  timestamp: number;
  transcription?: string;
}

export type AppState = 'IDLE' | 'CREATING' | 'READY' | 'RECORDING' | 'ANALYZING' | 'SYNCING' | 'KEY_CHECK';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'hi', name: 'Hindi' }
];
