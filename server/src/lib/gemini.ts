import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export function getGeminiClient(): GoogleGenAI | null {
    if (_client) return _client;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    _client = new GoogleGenAI({ apiKey });
    return _client;
}
