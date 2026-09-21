/**
 * Frame data for the Bluebird sprite.
 *
 * Pure data + preloading. Knows nothing about scroll, perches or GSAP, so it
 * can be imported unchanged by the React component later.
 */

export const FRAME_IDS = [
  'idle', 'blink', 'crouch', 'wings-up', 'wings-mid',
  'wings-down', 'glide', 'approach', 'impact', 'settle', 'perch',
];

/**
 * Turn-around art (tools/build_turn_frames.py), used only if registration.json
 * lists it. Without it the motion system hides the mirror swap inside a hop.
 *   turn-30, turn-60  the body swinging round toward the viewer
 *   turn-front        facing the viewer head on. It is symmetrical, so the
 *                     mirror swap happens on this frame and cannot be seen.
 * The second half of the turn is the same frames, mirrored.
 */
export const OPTIONAL_FRAME_IDS = ['turn-30', 'turn-60', 'turn-front'];

/**
 * How long each frame is held, in ms. One object, tunable at runtime from the
 * sandbox panel. Keys are step names rather than frame ids so the same frame
 * can be held for different lengths in different sequences.
 */
export const DEFAULT_TIMING = {
  idle: 140,      // last beat of rest before the crouch
  crouch: 120,    // anticipation
  launch: 100,    // wings-up as the bird leaves the perch
  flapUp: 120,
  flapMid: 110,
  flapDown: 130,
  glide: 220,     // occasional held beat mid-flight
  approach: 150,
  impact: 120,
  settle: 100,
  perch: 180,
  blink: 120,
  turn: 40,       // each step of a turn-around; it happens mid-hop, so it is quick
};

/**
 * Sequences are lists of [frameId, timingKey]. The engine resolves timingKey
 * against the live timing object on every step, so retiming mid-playback works.
 */
export const SEQUENCES = {
  takeoff: [
    ['idle', 'idle'],
    ['crouch', 'crouch'],
    ['wings-up', 'launch'],
  ],
  // A full up-down-up wingbeat. Ping-ponged through wings-mid so the flap
  // reads as one continuous motion rather than a hard cut.
  flightLoop: [
    ['wings-up', 'flapUp'],
    ['wings-mid', 'flapMid'],
    ['wings-down', 'flapDown'],
    ['wings-mid', 'flapMid'],
  ],
  // Swapped in for a beat on longer flights to break up the flapping.
  glideBeat: [
    ['glide', 'glide'],
  ],
  landing: [
    ['approach', 'approach'],
    ['impact', 'impact'],
    ['settle', 'settle'],
    ['perch', 'perch'],
  ],
  blink: [
    ['blink', 'blink'],
    ['idle', 'idle'],
  ],
  // A turn-around is turnOut, mirror the sprite, then turnIn. The art was drawn
  // from the idle pose, so callers start and end it there.
  turnOut: [
    ['turn-30', 'turn'],
    ['turn-60', 'turn'],
    ['turn-front', 'turn'],
  ],
  turnIn: [
    ['turn-60', 'turn'],
    ['turn-30', 'turn'],
  ],
};

/** Resting frame the bird holds when perched or when motion is reduced. */
export const REST_FRAME = 'perch';

/**
 * Builds takeoff -> N wingbeats -> landing as a single flat step list.
 * `glideEvery` inserts a glide beat after every Nth wingbeat (0 disables).
 */
export function buildFullSequence(beats = 4, glideEvery = 3) {
  const steps = [...SEQUENCES.takeoff];
  for (let i = 0; i < beats; i += 1) {
    steps.push(...SEQUENCES.flightLoop);
    if (glideEvery && (i + 1) % glideEvery === 0 && i < beats - 1) {
      steps.push(...SEQUENCES.glideBeat);
    }
  }
  steps.push(...SEQUENCES.landing);
  return steps;
}

/** Loads registration.json and decodes every frame before playback starts. */
export async function loadFrames(basePath = './frames/') {
  const registration = await fetch(`${basePath}registration.json`).then((r) => {
    if (!r.ok) throw new Error(`registration.json: ${r.status}`);
    return r.json();
  });

  const optional = OPTIONAL_FRAME_IDS.filter((id) => registration.frames[id]);
  const images = {};
  await Promise.all([...FRAME_IDS, ...optional].map(async (id) => {
    const meta = registration.frames[id];
    if (!meta) throw new Error(`registration.json is missing frame "${id}"`);
    const img = new Image();
    img.src = basePath + meta.file;
    // decode() resolves only once the bitmap is ready to paint, which is what
    // actually prevents the first-play flicker; onload alone is not enough.
    await (img.decode ? img.decode() : new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    }));
    images[id] = img;
  }));

  return {
    registration,
    images,
    srcOf: (id) => images[id].src,
    hasTurn: optional.length === OPTIONAL_FRAME_IDS.length,
  };
}
