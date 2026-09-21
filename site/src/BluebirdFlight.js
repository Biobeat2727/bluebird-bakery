/**
 * Motion system for the Bluebird: moves the sprite between perches on the page.
 *
 * The other half of BluebirdAnimator. The animator swaps frames and knows
 * nothing about position; this class owns the bird's transform and decides
 * where it should be, and asks the animator for takeoff / flap / landing at the
 * right moments.
 *
 * A perch is any element with [data-perch]. The bird stands on the element's
 * top edge. Optional attributes:
 *   data-perch-at="0.8"     where along the top edge, 0 = left, 1 = right (default 0.85)
 *   data-perch-dy="6"       px to drop the feet below the top edge (text has leading)
 *   data-perch-face="left"  which way to face once landed (default: direction of travel)
 *
 * Tapping the perched bird makes it hop about on its perch. Tapping it again
 * makes it fly off; it comes back on the next scroll.
 *
 * The bird lives in document coordinates (position:absolute on <body>), so a
 * perched bird scrolls with its perch for free and only flights need rAF.
 */
import { SEQUENCES, REST_FRAME } from '../../sandbox/src/bluebirdFrames.js';
import { BluebirdAnimator } from '../../sandbox/src/BluebirdAnimator.js';

/** Feet centre, in canvas px left of the anchor (the eye). Measured from idle. */
const FOOT_DX = -150;

const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2);

export class BluebirdFlight {
  /**
   * @param {object} opts
   * @param {object} opts.frames         result of loadFrames()
   * @param {object} opts.timing         live timing object, shared with the animator
   * @param {number} [opts.height]       rendered sprite height in px
   * @param {boolean} [opts.reducedMotion]
   */
  constructor({ frames, timing, height = 84, reducedMotion = false }) {
    this.frames = frames;
    this.reducedMotion = reducedMotion;

    const { canvas, anchor, frames: meta } = frames.registration;
    this.canvas = canvas;
    this.anchor = anchor;
    this.meta = meta;
    this.restFoot = meta[REST_FRAME].footOffsetY;
    this.footX = anchor.x + FOOT_DX;

    this.el = document.createElement('div');
    this.el.className = 'bluebird';
    this.el.setAttribute('aria-hidden', 'true');
    this.img = document.createElement('img');
    this.img.alt = '';
    this.img.draggable = false;
    // Flip about the feet so turning round never slides the bird off its perch.
    this.img.style.transformOrigin = `${(this.footX / canvas.width) * 100}% 50%`;
    this.el.appendChild(this.img);
    document.body.appendChild(this.el);

    this.anim = new BluebirdAnimator(this.img, { frames, timing, reducedMotion });
    this.anim.onFrame = () => this.#render();

    this.pos = { x: 0, y: 0 };      // feet point, document coords
    this.facing = 1;                // 1 = right (as drawn), -1 = left
    this.perchedOn = null;
    this.target = null;
    this.busy = false;
    this.nearArrival = null;
    this.away = false;              // flew off after a second tap; back on next scroll
    this.taps = 0;                  // taps since the last landing
    this.hopping = false;
    this.leaveAfterHop = false;
    this.hopDx = 0;                 // how far the bird has hopped along its perch
    this.scrollTimer = null;
    this.blinkTimer = null;

    this.setHeight(height);
  }

  setHeight(px) {
    this.height = px;
    this.k = px / this.canvas.height;
    this.img.style.height = `${px}px`;
    this.#render();
  }

  /** Finds perches, flies in from off-screen, and starts following the scroll. */
  start() {
    this.perches = [...document.querySelectorAll('[data-perch]')];
    if (!this.perches.length) return;

    const first = this.#pickPerch() || this.perches[0];

    if (this.reducedMotion) {
      // No flights at all: the bird simply lives on its first perch.
      this.anim.setFrame(REST_FRAME);
      this.perchedOn = this.target = first;
      this.#snapToPerch();
    } else {
      this.anim.setFrame('glide');
      this.pos = { x: -this.height, y: window.scrollY + window.innerHeight * 0.3 };
      this.#render();
      this.#flyTo(first);
      window.addEventListener('scroll', this.#onScroll, { passive: true });
      this.img.addEventListener('click', this.#onTap);
    }

    window.addEventListener('resize', this.#onLayout);
    this.resizeObs = new ResizeObserver(this.#onLayout);   // late fonts/images move perches
    this.resizeObs.observe(document.body);
  }

  destroy() {
    window.removeEventListener('scroll', this.#onScroll);
    window.removeEventListener('resize', this.#onLayout);
    if (this.resizeObs) this.resizeObs.disconnect();
    clearTimeout(this.scrollTimer);
    clearTimeout(this.blinkTimer);
    this.anim.destroy();
    this.el.remove();
  }

  /* ---- where ---- */

  /** Feet position for a perch, in document coords, kept clear of the page edges. */
  #pointOf(perch) {
    const r = perch.getBoundingClientRect();
    const at = Number(perch.dataset.perchAt ?? 0.85);
    const dy = Number(perch.dataset.perchDy ?? 0);
    const margin = Math.max(this.footX, this.canvas.width - this.footX) * this.k;
    const docW = document.documentElement.clientWidth;
    const hop = perch === this.perchedOn ? this.hopDx : 0;
    const x = r.left + window.scrollX + r.width * at + hop;
    return {
      x: Math.min(Math.max(x, margin), docW - margin),
      y: r.top + window.scrollY + dy,
    };
  }

  /**
   * The current perch is sticky while it stays comfortably on screen, so small
   * scrolls don't send the bird back and forth. Otherwise take the perch
   * nearest the upper-middle of the viewport.
   */
  #pickPerch() {
    const vh = window.innerHeight;
    const headroom = this.height + 12;
    const topOf = (p) => p.getBoundingClientRect().top;

    const current = this.target;
    if (current) {
      const y = topOf(current);
      if (y > headroom && y < vh * 0.9) return current;
    }

    let best = null;
    let bestScore = Infinity;
    for (const p of this.perches) {
      const y = topOf(p);
      if (y < Math.max(headroom, vh * 0.15) || y > vh * 0.8) continue;
      const score = Math.abs(y - vh * 0.45);
      if (score < bestScore) { best = p; bestScore = score; }
    }
    return best || current;
  }

  #onScroll = () => {
    // Wait for the scroll to pause; chasing every intermediate perch is frantic.
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      const next = this.#pickPerch();
      if (next && next !== this.target) this.#flyTo(next);
    }, 140);
  };

  #onLayout = () => {
    if (!this.busy && this.perchedOn) this.#snapToPerch();
  };

  #snapToPerch() {
    this.pos = this.#pointOf(this.perchedOn);
    this.#render();
  }

  #render() {
    const id = this.anim ? this.anim.currentFrame : null;
    const foot = (id && this.meta[id].footOffsetY) ?? this.restFoot;
    const x = this.pos.x - this.footX * this.k;
    const y = this.pos.y - (this.anchor.y + foot) * this.k;
    this.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    this.img.style.transform = this.facing === 1 ? '' : 'scaleX(-1)';
  }

  /* ---- flight ---- */

  /**
   * Intent lives here, not in the animator (see requestStop() there): target can
   * change at any time, and each stage below re-reads it at its own boundary.
   */
  #flyTo(perch) {
    this.target = perch;
    if (!this.busy) this.#run();
  }

  async #run() {
    this.busy = true;
    this.#setTappable(false);
    clearTimeout(this.blinkTimer);
    this.away = false;
    this.el.style.visibility = '';

    while (this.target !== this.perchedOn) {
      this.#face(this.#pointOf(this.target).x);
      if (this.perchedOn) await this.anim.play(SEQUENCES.takeoff);
      this.perchedOn = null;
      this.hopDx = 0;

      const near = new Promise((resolve) => { this.nearArrival = resolve; });
      const moving = this.#move();
      const flapping = this.anim.play(SEQUENCES.flightLoop, { loop: true });

      await near;
      this.anim.requestStop();          // finish this wingbeat, don't cut it
      await flapping;
      await this.anim.play([['approach', 'approach']]);
      const landedOn = await moving;    // holds the approach pose for any remaining glide

      await this.anim.play(SEQUENCES.landing.slice(1));
      this.perchedOn = landedOn;
      const face = landedOn.dataset.perchFace;
      if (face) { this.facing = face === 'left' ? -1 : 1; this.#render(); }
    }

    this.busy = false;
    this.taps = 0;
    this.#snapToPerch();
    this.#setTappable(true);
    this.#scheduleBlink();
  }

  /**
   * Eased move along a shallow arc to wherever this.target currently is. The
   * destination is re-read every frame, so a perch that shifts (or a change of
   * target mid-air) bends the path instead of snapping it.
   * @returns {Promise<Element>} the perch arrived at
   */
  #move() {
    return new Promise((resolve) => {
      let dest, from, t0, duration, arc;

      const begin = (now) => {
        dest = this.target;
        // A bird left far off-screen joins from just outside the viewport
        // rather than crossing thousands of px in one flight.
        const top = window.scrollY - this.height * 2;
        const bottom = window.scrollY + window.innerHeight + this.height * 2;
        from = { x: this.pos.x, y: Math.min(Math.max(this.pos.y, top), bottom) };
        const to = this.#pointOf(dest);
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        duration = Math.min(Math.max(dist * 1.15, 650), 1500);
        arc = Math.min(110, dist * 0.18);
        t0 = now;
        this.#face(to.x);
      };

      const tick = (now) => {
        if (dest !== this.target) begin(now);
        const to = this.#pointOf(dest);
        const u = Math.min(1, (now - t0) / duration);
        const e = easeInOut(u);
        this.pos = {
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * u) * arc,
        };
        this.#render();

        if (u >= 0.7 && this.nearArrival) {
          this.nearArrival();
          this.nearArrival = null;
        }
        if (u < 1) requestAnimationFrame(tick);
        else resolve(dest);
      };

      requestAnimationFrame((now) => { begin(now); tick(now); });
    });
  }

  /* ---- taps ---- */

  /** Only a perched bird takes taps; in flight it must not block what's under it. */
  #setTappable(on) {
    this.el.classList.toggle('is-tappable', on);
  }

  #onTap = () => {
    if (this.away || !this.perchedOn) return;
    if (this.hopping) { this.leaveAfterHop = true; return; }   // honoured when the hop lands
    if (this.busy) return;
    this.taps += 1;
    if (this.taps === 1) this.#hopAround();
    else this.#flyAway();
  };

  /** Moves the feet point to `to` along a small arc. Used by hops and the exit. */
  #tween(to, duration, arc) {
    return new Promise((resolve) => {
      const from = { ...this.pos };
      let t0 = null;
      const tick = (now) => {
        if (t0 === null) t0 = now;
        const u = Math.min(1, (now - t0) / duration);
        const e = easeInOut(u);
        this.pos = {
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * u) * arc,
        };
        this.#render();
        if (u < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  /** A few short hops along the perch, turning to face each one. */
  async #hopAround() {
    this.busy = true;
    this.hopping = true;
    clearTimeout(this.blinkTimer);

    const perch = this.perchedOn;
    const inset = this.height * 0.3;
    for (let i = 0; i < 3 && !this.leaveAfterHop; i += 1) {
      // Stay on the perch: reverse a hop that would go over either end, and
      // hop on the spot when the perch is too small to travel along.
      const r = perch.getBoundingClientRect();
      const min = r.left + window.scrollX + inset;
      const max = r.right + window.scrollX - inset;
      let step = (0.35 + Math.random() * 0.3) * this.height * (Math.random() < 0.5 ? -1 : 1);
      if (this.pos.x + step < min || this.pos.x + step > max) step = -step;
      if (this.pos.x + step < min || this.pos.x + step > max) step = 0;

      if (step) { this.facing = step > 0 ? 1 : -1; this.#render(); }
      await this.anim.play([['crouch', 'crouch']]);
      this.hopDx += step;
      await Promise.all([
        this.#tween(this.#pointOf(perch), 260, this.height * 0.22),
        this.anim.play([['wings-up', 'launch'], ['approach', 'approach']]),
      ]);
      await this.anim.play([['impact', 'impact'], [REST_FRAME, 'settle']]);
    }

    this.hopping = false;
    this.busy = false;
    if (this.leaveAfterHop) { this.leaveAfterHop = false; this.#flyAway(); return; }
    if (this.target !== this.perchedOn) { this.#run(); return; }   // page scrolled mid-hop
    this.#snapToPerch();
    this.#scheduleBlink();
  }

  /** Takes off and leaves the screen, up and out the way it is facing. */
  async #flyAway() {
    this.busy = true;
    this.away = true;
    this.#setTappable(false);
    clearTimeout(this.blinkTimer);

    this.target = null;             // a scroll from here on picks the perch to return to
    await this.anim.play(SEQUENCES.takeoff);
    this.perchedOn = null;
    this.hopDx = 0;

    const docW = document.documentElement.clientWidth;
    const exit = {
      x: this.facing === 1 ? docW + this.height * 2 : -this.height * 2,
      y: window.scrollY - this.height * 2,
    };
    const dist = Math.hypot(exit.x - this.pos.x, exit.y - this.pos.y);
    const flapping = this.anim.play(SEQUENCES.flightLoop, { loop: true });
    await this.#tween(exit, Math.min(Math.max(dist * 1.1, 700), 1400), 0);
    this.anim.stop();
    await flapping;

    this.el.style.visibility = 'hidden';
    this.busy = false;
    // A scroll during the exit already chose a perch; otherwise wait for one.
    if (this.target) this.#run();
  }

  #face(x) {
    if (Math.abs(x - this.pos.x) > 4) this.facing = x > this.pos.x ? 1 : -1;
  }

  #scheduleBlink() {
    clearTimeout(this.blinkTimer);
    this.blinkTimer = setTimeout(async () => {
      if (this.busy) return;
      const result = await this.anim.play(SEQUENCES.blink);
      if (result === 'complete' && !this.busy) {
        this.anim.setFrame(REST_FRAME);
        this.#scheduleBlink();
      }
    }, 2500 + Math.random() * 3500);
  }
}
