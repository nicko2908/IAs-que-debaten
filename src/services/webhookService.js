import env from '../config/env.js';
import Debate from '../models/Debate.js';
import * as geminiService from './ai/geminiService.js';

const MI_ROL = env.ROL;

// URL PUBLICA del servicio vecino (el otro rol).
// En Render, render.yaml inyecta PEER_URL desde el otro servicio
// usando RENDER_EXTERNAL_URL, p.ej:
//   https://debate-aborto-respondona.onrender.com
// Si viene solo el hostname (sin http), se le antepone https://.
const URL_PEER = normalizarUrl(env.PEER_URL);

const RETRASO_ENTRE_TURNOS_MS = 5000; // pausa antes de disparar el siguiente turno, para no exceder cuota de Gemini (15 req/min en free tier)

function normalizarUrl(url) {
  if (!url) return url;
  const limpia = url.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(limpia) ? limpia : `https://${limpia}`;
}

// Avisa al servicio vecino de que es su turno (no espera respuesta).
export function dispararWebhook(debateId, siguienteTurno) {
  fetch(`${URL_PEER}/webhook/turno`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ debateId, siguienteTurno }),
  }).catch((err) => console.error(`Error disparando webhook a ${URL_PEER}:`, err.message));
}

// Le pide al servicio vecino que cree su propia sesión (del otro rol) para este debate
export async function iniciarSesionEnPeer(debateId, tema) {
  if (!URL_PEER) throw new Error('Falta configurar PEER_URL en este servicio');

  const res = await fetch(`${URL_PEER}/webhook/iniciar-sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ debateId, tema }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `No se pudo iniciar sesión en el servicio vecino (${URL_PEER})`);
  }
}

// Avisa al servicio vecino que cierre su sesión de este debate (al detenerlo manualmente)
export function notificarDetenerAPeer(debateId) {
  if (!URL_PEER) return;
  fetch(`${URL_PEER}/webhook/detener`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ debateId }),
  }).catch((err) => console.error('Error notificando detener al servicio vecino:', err.message));
}

export async function procesarTurno(debateId, siguienteTurno) {
  if (siguienteTurno !== MI_ROL) {
    console.error(`Este servicio corre el rol "${MI_ROL}" pero recibió un turno de "${siguienteTurno}". Revisa PEER_URL en ambos servicios.`);
    return;
  }

  const debate = await Debate.findById(debateId);
  if (!debate) return console.error(`Debate ${debateId} no encontrado`);
  if (debate.estado === 'finalizado') return console.log(`Debate ${debateId} ya finalizado`);

  const ultimoMensaje = debate.mensajes[debate.mensajes.length - 1].texto;

  let texto;
  try {
    texto = await geminiService.generarIntervencion(debateId, ultimoMensaje);
  } catch (error) {
    console.error(`❌ Gemini falló definitivamente en el debate ${debateId} (rol ${MI_ROL}): ${error.message}`);
    debate.estado = 'finalizado';
    await debate.save();
    geminiService.cerrarSesion(debateId);
    notificarDetenerAPeer(debateId);
    return;
  }

  debate.mensajes.push({ autor: MI_ROL, texto });
  if (MI_ROL === 'respondona') debate.rondaActual += 1;

  // El debate termina cuando la "respondona" completa la última ronda.
  const maxRondas = debate.maxRondas || 5;
  const alcanzoElMaximo = debate.rondaActual >= maxRondas;

  if (alcanzoElMaximo) debate.estado = 'finalizado';
  await debate.save();

  if (alcanzoElMaximo) {
    geminiService.cerrarSesion(debateId);
    notificarDetenerAPeer(debateId);
    console.log(`✅ Debate ${debateId} finalizado (${debate.rondaActual} rondas)`);
    return;
  }

  const siguienteTurnoAhora = MI_ROL === 'preguntona' ? 'respondona' : 'preguntona';
  setTimeout(() => dispararWebhook(debateId, siguienteTurnoAhora), RETRASO_ENTRE_TURNOS_MS);
}
