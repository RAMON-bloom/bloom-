import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null | undefined;

export function getAi(): GoogleGenAI | null {
  if (aiClient !== undefined) return aiClient;
  aiClient = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      })
    : null;
  return aiClient;
}
