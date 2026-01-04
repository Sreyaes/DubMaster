
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Scene, DialogueLine } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateScene = async (prompt: string, language: string): Promise<Scene> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate a short dramatic or comedic scene script based on the theme: "${prompt}". 
    The script should be in ${language}. 
    Limit to 4 lines of dialogue. 
    Output as JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          context: { type: Type.STRING },
          dialogue: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                character: { type: Type.STRING },
                text: { type: Type.STRING },
                emotion: { type: Type.STRING }
              },
              required: ["character", "text", "emotion"]
            }
          }
        },
        required: ["title", "context", "dialogue"]
      }
    }
  });

  const sceneData = JSON.parse(response.text);
  return {
    ...sceneData,
    id: Math.random().toString(36).substr(2, 9),
    language
  };
};

export const generateSceneImage = async (title: string, context: string): Promise<string | null> => {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `A high-quality cinematic concept art for a scene titled "${title}". Scene Context: ${context}. Cinematic lighting, detailed background, immersive atmosphere, 16:9 aspect ratio.` }],
      },
      config: { imageConfig: { aspectRatio: "16:9" } }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  } catch (error) { console.error("Image generation failed", error); }
  return null;
};

export const generateSceneVideo = async (prompt: string, imageBase64?: string): Promise<string | null> => {
  try {
    const ai = getAI();
    const cleanBase64 = imageBase64?.replace(/^data:image\/\w+;base64,/, '');

    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: `Cinematic movie scene: ${prompt}. Cinematic movement, dynamic lighting, professional color grading.`,
      image: cleanBase64 ? { imageBytes: cleanBase64, mimeType: 'image/png' } : undefined,
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    return downloadLink ? `${downloadLink}&key=${process.env.API_KEY}` : null;
  } catch (error) { console.error("Video generation failed", error); }
  return null;
};

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    const ai = getAI();
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve) => {
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(audioBlob);
    });
    const base64Data = await base64Promise;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          parts: [
            { inlineData: { data: base64Data, mimeType: 'audio/webm' } },
            { text: "Transcribe exactly what is said in this audio. If nothing is said, return an empty string." }
          ]
        }
      ]
    });
    return response.text?.trim() || "";
  } catch (error) {
    console.error("Transcription failed", error);
    return "";
  }
};

export const generateLipSyncVideo = async (originalVideoUrl: string, transcription: string, sceneContext: string): Promise<string | null> => {
  try {
    const ai = getAI();
    
    // Fetch the video data as a starting point (V2V)
    // In a real environment, you'd pass the previous operation's video object
    // For this implementation, we use the prompt to guide Veo to lip sync
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: `Keep the character and setting identical to the provided scene. Modify the animation so the character's mouth movements perfectly synchronize with them saying: "${transcription}". Focus on realistic lip movement, jaw motion, and facial expressions that match the emotion of the speech.`,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    return downloadLink ? `${downloadLink}&key=${process.env.API_KEY}` : null;
  } catch (error) {
    console.error("Lip sync generation failed", error);
    return null;
  }
};

export const getPerformanceFeedback = async (scene: Scene, recordingDuration: number, transcript: string): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `The user just performed a dubbing of this scene: "${scene.title}". 
    Context: ${scene.context}. 
    Original Dialogue: ${JSON.stringify(scene.dialogue)}. 
    User's actual words (transcribed): "${transcript}".
    The performance took ${recordingDuration.toFixed(1)} seconds. 
    Provide constructive, encouraging feedback as a world-class voice director. 
    Focus on emotion and timing. Keep it concise (3-4 sentences).`,
  });

  return response.text || "Great job! Keep practicing to master the flow.";
};

export const generateReferenceAudio = async (text: string, voice: string = 'Kore'): Promise<Uint8Array | null> => {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }
  } catch (error) { console.error("TTS failed", error); }
  return null;
};
