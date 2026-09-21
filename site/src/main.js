import { loadFrames, DEFAULT_TIMING } from '../../sandbox/src/bluebirdFrames.js';
import { BluebirdFlight } from './BluebirdFlight.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const small = matchMedia('(max-width: 700px)');
const birdHeight = () => (small.matches ? 60 : 84);

async function init() {
  // Frames and timing are still being tuned in the sandbox, so the site reads
  // them from there rather than keeping a second copy.
  // Resolved against this module, so pages at any depth can load it.
  const frames = await loadFrames(new URL('../../sandbox/frames/', import.meta.url).href);
  const bird = new BluebirdFlight({
    frames,
    timing: { ...DEFAULT_TIMING },
    height: birdHeight(),
    reducedMotion: reducedMotion.matches,
  });
  small.addEventListener('change', () => bird.setHeight(birdHeight()));

  // Perch positions depend on final text metrics.
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  bird.start();
  window.bluebird = bird;   // handy in the console while tuning
}

// The bird is decoration: if it fails to load, the page is still complete.
init().catch((err) => console.warn('bluebird:', err));
