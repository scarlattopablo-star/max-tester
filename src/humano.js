// Hace que Vale "tarde" en responder como una persona que está escribiendo.
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Simula a una persona que primero PIENSA un toque y después ESCRIBE.
// = pausa de "pensando" (con variación) + tiempo de tipeo según el largo.
// Da una sensación humana, sin respuestas instantáneas. Editá los números a gusto.
export function delayEscritura(texto) {
  const pensar = 1100 + Math.floor(Math.random() * 1500); // 1.1 a 2.6 s pensando
  const porCaracter = 26; // ms por letra al "escribir"
  const topeEscritura = 4500; // máximo del tipeo
  const largo = (texto || "").length;
  const escribir = Math.min(topeEscritura, largo * porCaracter);
  return pensar + escribir; // total: ~1.3s (corto) hasta ~7s (largo)
}
