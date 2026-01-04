
import React, { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
  isRecording: boolean;
}

const AudioVisualizer: React.FC<Props> = ({ stream, isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!stream || !isRecording) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    /**
     * Fix: Removed the explicit { sampleRate: 16000 } configuration.
     * Browsers (especially Firefox) throw a NotSupportedError if createMediaStreamSource 
     * is called on an AudioContext whose sampleRate does not match the MediaStream's 
     * hardware sample rate. Using the default constructor ensures they match.
     */
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    const audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        ctx.fillStyle = `rgb(96, 165, 250)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      audioContext.close();
    };
  }, [stream, isRecording]);

  return (
    <canvas 
      ref={canvasRef} 
      width={400} 
      height={100} 
      className="w-full h-24 rounded-lg bg-slate-900/50 border border-slate-700"
    />
  );
};

export default AudioVisualizer;
