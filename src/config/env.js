import dotenv from 'dotenv';
dotenv.config();

const ROL = process.env.ROL || 'preguntona'; // 'preguntona' o 'respondona': qué IA corre ESTA pc

const env = {
  PORT: process.env.PORT || 3000,
  MONGODB_URI: process.env.MONGODB_URI,
  ROL,
  PEER_URL: process.env.PEER_URL, // ej: http://192.168.1.50:3000 — la otra pc
  // Cada rol usa su propia API key de Gemini; si falta, cae al respaldo GEMINI_API_KEY.
  GEMINI_API_KEY:
    (ROL === 'respondona'
      ? process.env.GEMINI_API_KEY_RESPONDONA
      : process.env.GEMINI_API_KEY_PREGUNTONA) || process.env.GEMINI_API_KEY,
};

export default env;