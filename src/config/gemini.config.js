import { GoogleGenerativeAI } from '@google/generative-ai';
import env from './env.js';

if (!env.GEMINI_API_KEY) {
  console.error(`⚠️ No hay GEMINI_API_KEY configurada para el rol "${env.ROL}".`);
}

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export default genAI;