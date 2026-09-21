/**
 * Frame playback engine for the Bluebird sprite.
 *
 * Owns exactly one <img> and swaps its src. Deliberately knows nothing about
 * position, scroll or perches - the motion system drives the bird's transform
 * independently, so flapping never stalls because the page stopped moving.
 *
 * Scheduling uses a self-correcting setTimeout rather than requestAnimationFrame.
 * rAF is smoother in principle, but it stops entirely in a background tab, which
 * would leave a play() promise pending forever and strand the state machine in
 * "flying". setTimeout still fires when hidden (throttled), so sequences always
 * finish. Frame holds are 100ms+, well clear of needing paint-level precision.
 */
export class BluebirdAnimator {
  /**
   * @param {HTMLImageElement} img  persistent element whose src is swapped
   * @param {object} opts
   * @param {object} opts.frames    result of loadFrames()
   * @param {object} opts.timing    live timing object; read on every step
   * @param {boolean} [opts.reducedMotion]
   */
  constructor(img, { frames, timing, reducedMotion = false }) {
    this.img = img;
    this.frames = frames;
    this.timing = timing;
    this.reducedMotion = reducedMotion;

    this.currentFrame = null;
    this.queue = [];
    this.index = 0;
    this.loop = false;
    this.stopRequested = false;
    this.stepEndsAt = 0;
    this.timer = null;
    this.settle = null;        // resolver for the in-flight play() promise
    this.onFrame = null;       // optional observer, used by the sandbox HUD
  }

  /** Paints a frame immediately. */
  setFrame(id) {
    if (id === this.currentFrame) return;
    const img = this.frames.images[id];
    if (!img) throw new Error(`unknown frame "${id}"`);
    this.img.src = img.src;
    this.currentFrame = id;
    if (this.onFrame) this.onFrame(id);
  }

  /** ms the given step is held for, read live so retuning applies mid-playback. */
  holdFor(step) {
    return Math.max(16, Number(this.timing[step[1]]) || 100);
  }

  get isPlaying() {
    return this.queue.length > 0;
  }

  /**
   * Plays a step list to completion.
   * @param {Array<[string,string]>} steps  [frameId, timingKey] pairs
   * @param {{loop?: boolean}} [opts]
   * @returns {Promise<'complete'|'interrupted'>}
   */
  play(steps, { loop = false } = {}) {
    this.#clearTimer();
    this.#resolvePending('interrupted');

    if (!steps.length) return Promise.resolve('complete');

    // Reduced motion: no frame cycling at all, just hold the end pose.
    if (this.reducedMotion) {
      this.setFrame(steps[steps.length - 1][0]);
      return Promise.resolve('complete');
    }

    this.queue = steps;
    this.index = 0;
    this.loop = loop;
    this.stopRequested = false;
    this.setFrame(steps[0][0]);
    this.stepEndsAt = performance.now() + this.holdFor(steps[0]);

    const promise = new Promise((resolve) => { this.settle = resolve; });
    this.#schedule();
    return promise;
  }

  /**
   * Asks a looping sequence to finish its current cycle and stop, so the bird
   * always completes the wingbeat it is in rather than cutting mid-flap.
   *
   * Only affects a sequence that is looping *right now*; it is not a queued
   * intent. A caller that may issue a stop before the loop has started (e.g.
   * during takeoff) must hold that intent itself and re-check it at each
   * sequence boundary - see runFlight() in the sandbox and the controller.
   */
  requestStop() {
    if (this.loop) this.stopRequested = true;
  }

  /** Hard stop; leaves the current frame painted. */
  stop() {
    this.#clearTimer();
    this.queue = [];
    this.loop = false;
    this.stopRequested = false;
    this.#resolvePending('interrupted');
  }

  destroy() {
    this.stop();
    this.onFrame = null;
  }

  #schedule() {
    const delay = Math.max(0, this.stepEndsAt - performance.now());
    this.timer = setTimeout(this.#advance, delay);
  }

  /**
   * Advances past every step whose hold has already elapsed. In a background
   * tab timers are throttled to ~1s, so several steps can come due at once;
   * we skip through them rather than replaying frames nobody could see.
   */
  #advance = () => {
    this.timer = null;
    if (!this.queue.length) return;

    const now = performance.now();
    let guard = 0;

    while (this.stepEndsAt <= now) {
      if (guard++ > 512) { this.stepEndsAt = now + 16; break; }   // pathological catch-up
      this.index += 1;

      if (this.index >= this.queue.length) {
        if (this.loop && !this.stopRequested) {
          this.index = 0;
        } else {
          this.setFrame(this.queue[this.queue.length - 1][0]);
          this.queue = [];
          this.loop = false;
          this.#resolvePending('complete');
          return;
        }
      }
      this.stepEndsAt += this.holdFor(this.queue[this.index]);
    }

    this.setFrame(this.queue[this.index][0]);
    this.#schedule();
  };

  #clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  #resolvePending(reason) {
    const settle = this.settle;
    this.settle = null;
    if (settle) settle(reason);
  }
}
