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
 *   data-perch-home         the first landing, whenever it is on screen at page load
 *
 * Tapping the perched bird makes it hop about on its perch. Tapping it again
 * makes it fly off; it comes back on the next scroll.
 *
 * The bird lives in document coordinates (position:absolute on <body>), so a
 * perched bird scrolls with its perch for free and only flights need rAF.
 */
import { SEQUENCES, REST_FRAME } from '../../sandbox/src/bluebirdFrames.js';
import { BluebirdAnimator } from '../../sandbox/src/BluebirdAnimator.js';

/** An eased mirror, used only in the air, where a quick bank reads fine. */
const TURN_MS = 190;
/** Easing the pin point when the pose changes between airborne and grounded. */
const PIVOT_MS = 140;

/** Fast away from the perch, then a long soft deceleration into the next one. */
const easeFlight = (u) => 1 - (1 - u) ** 2.6;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** How far each wing pose lifts (+) or drops (-) the body, as a fraction of sprite height. */
const BOB = { 'wings-up': -0.05, 'wings-mid': 0, 'wings-down': 0.06, glide: 0.015 };
/** Nose-up pitch, in degrees, held through the final approach. */
const FLARE = -9;
/** Flights longer than this (px) get a glide between wingbeats. */
const GLIDE_OVER = 480;

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

    // The frames are registered to the eye, so the feet are somewhere different
    // in every pose. Each frame carries a pivotX (tools/measure_pivots.py): the
    // feet for grounded poses, the centre of mass in the air. The sprite is
    // pinned to the perch, and mirrored, about that x.
    const restPivot = meta[REST_FRAME].pivotX ?? anchor.x - 37;
    this.pivotOf = (id) => (id && meta[id].pivotX) ?? restPivot;
    this.pivot = restPivot;         // pin point currently rendered (canvas px); eased
    this.flip = 1;                  // scaleX currently rendered, 1..-1; eased toward facing
    this.squash = 1;                // scaleY about the foot line: squash and stretch
    this.tilt = 0;                  // pitch in degrees, + is nose down; follows the flight path
    this.bob = 0;                   // px the body rides up and down with each wingbeat
    this.tweens = {};

    this.el = document.createElement('div');
    this.el.className = 'bluebird';
    this.el.setAttribute('aria-hidden', 'true');
    this.img = document.createElement('img');
    this.img.alt = '';
    this.img.draggable = false;
    this.el.appendChild(this.img);
    // Taps land on a box around the body only. The sprite's transparent margins
    // overlap whatever the bird stands on, and must not steal its clicks.
    this.hit = document.createElement('span');
    this.hit.className = 'bluebird-hit';
    this.el.appendChild(this.hit);
    // The bird flies in from, and away to, points past the edges of the page.
    // Anything positioned out there widens the document, and phones then let
    // you scroll sideways into it (overflow-x on <body> doesn't stop them).
    // So it lives in a page-sized layer that clips what's outside.
    this.layer = document.createElement('div');
    this.layer.className = 'bluebird-layer';
    this.layer.appendChild(this.el);
    document.body.appendChild(this.layer);

    this.anim = new BluebirdAnimator(this.img, { frames, timing, reducedMotion });
    this.lastFrame = null;
    this.anim.onFrame = (id) => this.#onFrame(id);

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
    this.idleTimer = null;

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

    const home = document.querySelector('[data-perch-home]');
    const homeTop = home && home.getBoundingClientRect().top;
    const first = (home && homeTop > 0 && homeTop < window.innerHeight * 0.9 && home)
      || this.#pickPerch() || this.perches[0];

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
      this.hit.addEventListener('click', this.#onTap);
    }

    this.#fitLayer();
    window.addEventListener('resize', this.#onLayout);
    this.resizeObs = new ResizeObserver(this.#onLayout);   // late fonts/images move perches
    this.resizeObs.observe(document.body);
  }

  destroy() {
    window.removeEventListener('scroll', this.#onScroll);
    window.removeEventListener('resize', this.#onLayout);
    if (this.resizeObs) this.resizeObs.disconnect();
    clearTimeout(this.scrollTimer);
    clearTimeout(this.idleTimer);
    this.anim.destroy();
    this.layer.remove();
  }

  /* ---- where ---- */

  /** Feet position for a perch, in document coords, kept clear of the page edges. */
  #pointOf(perch) {
    const r = perch.getBoundingClientRect();
    const at = Number(perch.dataset.perchAt ?? 0.85);
    const dy = Number(perch.dataset.perchDy ?? 0);
    const margin = this.canvas.width * this.k * 0.6;
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

    // Settled, it only moves for a perch in the comfortable middle of the screen.
    // Coming back from a fly-off, anywhere on screen it can stand will do.
    const min = this.away ? headroom : Math.max(headroom, vh * 0.15);
    const max = this.away ? vh * 0.94 : vh * 0.8;

    let best = null;
    let bestScore = Infinity;
    for (const p of this.perches) {
      const y = topOf(p);
      if (y < min || y > max) continue;
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
    this.#fitLayer();
    if (!this.busy && this.perchedOn) this.#snapToPerch();
  };

  /** The layer covers the whole page, so the bird is only ever clipped at its edges. */
  #fitLayer() {
    this.layer.style.height = `${document.body.offsetHeight}px`;
  }

  #snapToPerch() {
    this.pos = this.#pointOf(this.perchedOn);
    this.#render();
  }

  #render() {
    const id = this.anim ? this.anim.currentFrame : null;
    const foot = (id && this.meta[id].footOffsetY) ?? this.restFoot;
    const footLine = ((this.anchor.y + foot) / this.canvas.height) * 100;
    const x = this.pos.x - this.pivot * this.k;
    const y = this.pos.y - (this.anchor.y + foot) * this.k - this.bob;
    this.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    // Mirror about the pin point. On a perch, squash about the feet so they stay
    // put; in the air, pitch about the middle of the body.
    const grounded = id && this.meta[id].footOffsetY != null;
    this.img.style.transformOrigin = `${(this.pivot / this.canvas.width) * 100}% ${grounded ? footLine.toFixed(2) : 50}%`;
    // The tilt is applied before the mirror, so nose-down stays nose-down facing either way.
    this.img.style.transform = this.flip === 1 && this.squash === 1 && this.tilt === 0
      ? '' : `scale(${this.flip.toFixed(3)}, ${this.squash.toFixed(3)}) rotate(${this.tilt.toFixed(2)}deg)`;
  }

  /**
   * Grounded to grounded, the pin point snaps to the new pose's feet: that is
   * what keeps them planted through crouch, impact and settle. Into or out of
   * the air there are no feet to plant, so it eases instead of jumping.
   */
  #onFrame(id) {
    const airborne = (f) => f !== null && this.meta[f].footOffsetY == null;
    const eased = this.lastFrame !== null && (airborne(id) || airborne(this.lastFrame));
    this.lastFrame = id;
    if (eased && !this.reducedMotion) {
      this.#ease('pivot', this.pivotOf(id), PIVOT_MS);
    } else {
      this.tweens.pivot = null;
      this.pivot = this.pivotOf(id);
    }
    this.#render();
  }

  /** Eases this[key] to a value, re-rendering each frame. A newer ease on the same key wins. */
  #ease(key, to, ms) {
    const token = {};
    this.tweens[key] = token;
    const from = this[key];
    return new Promise((resolve) => {
      let t0 = null;
      const tick = (now) => {
        if (this.tweens[key] !== token) { resolve(); return; }
        if (t0 === null) t0 = now;
        const u = Math.min(1, (now - t0) / ms);
        this[key] = from + (to - from) * easeInOut(u);
        this.#render();
        if (u < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  /** Turns to face a direction (1 right, -1 left). Resolves when the turn is done. */
  #turn(dir) {
    this.facing = dir;
    if (this.flip === dir) return Promise.resolve();
    if (this.reducedMotion) { this.flip = dir; this.#render(); return Promise.resolve(); }
    return this.#ease('flip', dir, TURN_MS);
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
    this.#setIdle(false);
    this.away = false;
    this.el.style.visibility = '';

    while (this.target !== this.perchedOn) {
      const to = this.#pointOf(this.target);
      if (this.perchedOn) await this.#launch(this.#dirTo(to.x));
      else await this.#face(to.x);
      this.perchedOn = null;
      this.hopDx = 0;

      // Long flights break up the flapping with a glide.
      const far = Math.hypot(to.x - this.pos.x, to.y - this.pos.y) > GLIDE_OVER;
      const beat = SEQUENCES.flightLoop;
      const loop = far ? [...beat, ...SEQUENCES.glideBeat] : beat;

      const near = new Promise((resolve) => { this.nearArrival = resolve; });
      const moving = this.#move();
      const flapping = this.anim.play(loop, { loop: true });

      await near;
      this.anim.stop();                 // a bird flares abruptly: cut to the approach pose
      await flapping;
      await this.anim.play([['approach', 'approach']]);
      const landedOn = await moving;    // holds the flare for the rest of the glide in

      await this.#touchdown();
      this.perchedOn = landedOn;
      const face = landedOn.dataset.perchFace;
      const dir = face === 'left' ? -1 : 1;
      if (face && dir !== this.facing && this.target === landedOn) {
        await this.anim.play([[REST_FRAME, 'perch']]);   // settle for a beat before looking round
        await this.#lookRound(dir);
      }
    }

    this.busy = false;
    this.taps = 0;
    this.#snapToPerch();
    this.#setTappable(true);
    this.#scheduleIdle();
  }

  /**
   * Leaves the perch: wind up in the crouch, then spring off with a stretch that
   * relaxes once it is flying. Turns first if it is facing the wrong way.
   */
  async #launch(dir) {
    if (dir !== this.facing && this.frames.hasTurn) await this.#hop(this.#pointOf(this.perchedOn), dir);
    this.anim.setFrame('crouch');
    await this.#ease('squash', 0.93, this.anim.holdFor(['crouch', 'crouch']));
    if (dir !== this.facing) this.#setFlip(dir);   // no turn art: swap under cover of the launch
    this.anim.setFrame('wings-up');
    this.#ease('squash', 1.09, 70).then(() => this.#ease('squash', 1, 220));
  }

  /** Lands: squash on impact, a small rebound, settle. */
  async #touchdown() {
    this.bob = 0;
    this.#ease('tilt', 0, 90);
    this.anim.setFrame('impact');
    await this.#ease('squash', 0.87, this.anim.holdFor(['impact', 'impact']) * 0.7);
    this.anim.setFrame('settle');
    await this.#ease('squash', 1.04, this.anim.holdFor(['settle', 'settle']));
    this.anim.setFrame(REST_FRAME);
    await this.#ease('squash', 1, this.anim.holdFor(['perch', 'perch']) * 0.8);
  }

  /**
   * What the air does to the body, called once per frame of flight: it rides up
   * on the downstroke and sinks on the upstroke, and pitches with its path.
   */
  #airPose(dt, vx, vy, flare) {
    const bobTo = (BOB[this.anim.currentFrame] ?? 0) * this.height;
    this.bob += (bobTo - this.bob) * Math.min(1, dt / 70);
    const pitch = flare ? FLARE : clamp(Math.atan2(vy, Math.abs(vx) + 0.15) * (180 / Math.PI) * 0.4, -12, 12);
    this.tilt += (pitch - this.tilt) * Math.min(1, dt / 130);
  }

  /**
   * Eased move along a shallow arc to wherever this.target currently is. The
   * destination is re-read every frame, so a perch that shifts (or a change of
   * target mid-air) bends the path instead of snapping it.
   * @returns {Promise<Element>} the perch arrived at
   */
  #move() {
    return new Promise((resolve) => {
      let dest, from, t0, duration, arc, last;

      const begin = (now) => {
        dest = this.target;
        // A bird left far off-screen joins from just outside the viewport
        // rather than crossing thousands of px in one flight.
        const top = window.scrollY - this.height * 2;
        const bottom = window.scrollY + window.innerHeight + this.height * 2;
        from = { x: this.pos.x, y: Math.min(Math.max(this.pos.y, top), bottom) };
        const to = this.#pointOf(dest);
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        duration = clamp(dist * 1.35, 760, 1750);
        arc = Math.min(120, dist * 0.2);
        t0 = now;
        last = now;
        this.#face(to.x);
      };

      const tick = (now) => {
        if (dest !== this.target) begin(now);
        const to = this.#pointOf(dest);
        const u = Math.min(1, (now - t0) / duration);
        const e = easeFlight(u);
        const next = {
          x: from.x + (to.x - from.x) * e,
          // The arc peaks early: climb out quickly, then glide down onto the perch.
          y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * u ** 0.7) * arc,
        };
        const dt = Math.max(1, now - last);
        this.#airPose(dt, (next.x - this.pos.x) / dt, (next.y - this.pos.y) / dt, u >= 0.72);
        last = now;
        this.pos = next;
        this.#render();

        if (u >= 0.72 && this.nearArrival) {
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

  /**
   * Moves the feet point to `to` along a small arc. Used by hops, and by the
   * exit with `flying` set: that accelerates away and gets the in-air body pose.
   */
  #tween(to, duration, arc, flying = false) {
    return new Promise((resolve) => {
      const from = { ...this.pos };
      let t0 = null;
      let last = null;
      const tick = (now) => {
        if (t0 === null) { t0 = now; last = now; }
        const u = Math.min(1, (now - t0) / duration);
        const e = flying ? u ** 1.7 : easeInOut(u);
        const next = {
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * u) * arc,
        };
        if (flying) {
          const dt = Math.max(1, now - last);
          this.#airPose(dt, (next.x - this.pos.x) / dt, (next.y - this.pos.y) / dt, false);
          last = now;
        }
        this.pos = next;
        this.#render();
        if (u < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  /** A few hops along the perch, each a different size, with a beat between them. */
  async #hopAround() {
    this.busy = true;
    this.hopping = true;
    this.#setIdle(false);

    const perch = this.perchedOn;
    const inset = this.height * 0.3;
    for (let i = 0; i < 3 && !this.leaveAfterHop; i += 1) {
      // Stay on the perch: reverse a hop that would go over either end, and
      // hop on the spot when the perch is too small to travel along.
      const r = perch.getBoundingClientRect();
      const min = r.left + window.scrollX + inset;
      const max = r.right + window.scrollX - inset;
      // Mostly carry on the way it is facing; a reversal is a spin, and one is plenty.
      let step = (0.35 + Math.random() * 0.3) * this.height * (Math.random() < 0.75 ? this.facing : -this.facing);
      if (this.pos.x + step < min || this.pos.x + step > max) step = -step;
      if (this.pos.x + step < min || this.pos.x + step > max) step = 0;

      this.hopDx += step;
      const dir = step ? (step > 0 ? 1 : -1) : this.facing;
      await this.#hop(this.#pointOf(perch), dir, 0.15 + Math.random() * 0.13);
      if (i < 2) await this.#wait(70 + Math.random() * 170);
    }

    this.hopping = false;
    this.busy = false;
    if (this.leaveAfterHop) { this.leaveAfterHop = false; this.#flyAway(); return; }
    if (this.target !== this.perchedOn) { this.#run(); return; }   // page scrolled mid-hop
    this.#snapToPerch();
    this.#scheduleIdle();
  }

  /** Takes off and leaves the screen, up and out the way it is facing. */
  async #flyAway() {
    this.busy = true;
    this.away = true;
    this.#setTappable(false);
    this.#setIdle(false);

    this.target = null;             // a scroll from here on picks the perch to return to
    await this.#launch(this.facing);
    this.perchedOn = null;
    this.hopDx = 0;

    const docW = document.documentElement.clientWidth;
    const exit = {
      x: this.facing === 1 ? docW + this.height * 2 : -this.height * 2,
      y: window.scrollY - this.height * 2,
    };
    const dist = Math.hypot(exit.x - this.pos.x, exit.y - this.pos.y);
    const flapping = this.anim.play(SEQUENCES.flightLoop, { loop: true });
    await this.#tween(exit, clamp(dist * 1.1, 700, 1400), 0, true);
    this.anim.stop();
    await flapping;
    this.tilt = 0;
    this.bob = 0;

    this.el.style.visibility = 'hidden';
    this.busy = false;
    // A scroll during the exit already chose a perch; otherwise wait for one.
    if (this.target) this.#run();
  }

  /** Mirrors the sprite at once. Only ever called under cover of a pose change. */
  #setFlip(dir) {
    this.tweens.flip = null;
    this.facing = dir;
    this.flip = dir;
    this.#render();
  }

  /**
   * Turns round while standing on a perch. With turn-around art it is a real
   * turn: out to the head-on frame, mirror there (that frame is symmetrical),
   * and back in. Without it, a small hop on the spot with the swap at lift-off.
   */
  async #lookRound(dir) {
    if (dir === this.facing) return;
    if (this.frames.hasTurn) {
      await this.#hop({ ...this.pos }, dir);
      return;
    }
    await this.anim.play([['crouch', 'crouch']]);
    this.#setFlip(dir);
    await Promise.all([
      this.#tween({ ...this.pos }, 260, this.height * 0.22),
      this.anim.play([['wings-up', 'launch'], ['approach', 'approach']]),
    ]);
    await this.anim.play([['impact', 'impact'], [REST_FRAME, 'settle']]);
  }

  /**
   * One hop to `to` (which may be where it already is), ending up facing `dir`.
   * Dip, spring up with a stretch, land with a squash, recover. It hops the way
   * a sparrow does, on its legs, so there are no wing frames in it.
   *
   * A hop that reverses direction spins in the air using the turn art. A bird
   * does not rotate on the spot: turning at constant speed on planted feet is
   * what makes a turn look like a figurine on a turntable.
   */
  async #hop(to, dir, lift = 0.2) {
    const hold = (steps) => steps.reduce((ms, step) => ms + this.anim.holdFor(step), 0);
    const spin = dir !== this.facing && this.frames.hasTurn;
    const airMs = spin ? hold(SEQUENCES.turnOut) + hold(SEQUENCES.turnIn) : 190;

    this.anim.setFrame('idle');
    await this.#ease('squash', 0.9, 90);                         // dip: anticipation
    if (dir !== this.facing && !spin) this.#setFlip(dir);        // no turn art: swap at lift-off

    await Promise.all([
      this.#tween(to, airMs, this.height * lift),
      this.#ease('squash', 1.07, airMs * 0.45),                  // stretch on the way up
      spin && (async () => {
        await this.anim.play(SEQUENCES.turnOut);
        this.#setFlip(dir);                                      // on the head-on frame
        await this.anim.play(SEQUENCES.turnIn);
      })(),
    ]);

    this.anim.setFrame('idle');
    await this.#ease('squash', 0.86, 70);                        // land: squash
    await this.#ease('squash', 1, 150);                          // recover
    this.anim.setFrame(REST_FRAME);
  }

  #wait(ms) {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
  }

  #dirTo(x) {
    return Math.abs(x - this.pos.x) <= 4 ? this.facing : (x > this.pos.x ? 1 : -1);
  }

  /** Banks toward a point in the air, unless it is more or less straight above or below. */
  #face(x) {
    return this.#turn(this.#dirTo(x));
  }

  /** Breathing is a CSS animation on the sprite; it only runs while this is set. */
  #setIdle(on) {
    this.el.classList.toggle('is-idle', on);
    if (!on) clearTimeout(this.idleTimer);
  }

  /**
   * Life on the perch. Every few seconds: a blink, sometimes two, and now and
   * then a glance round at the viewer. Anything that needs the bird (a flight,
   * a tap) interrupts it, and each step checks before carrying on.
   */
  #scheduleIdle() {
    this.#setIdle(true);
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(async () => {
      if (this.busy) return;
      const roll = Math.random();
      const done = roll < 0.25 && this.frames.hasTurn ? await this.#glance()
        : await this.#blink(roll > 0.85 ? 2 : 1);
      if (done && !this.busy) {
        this.anim.setFrame(REST_FRAME);
        this.#scheduleIdle();
      }
    }, 2200 + Math.random() * 3600);
  }

  async #blink(times) {
    for (let i = 0; i < times; i += 1) {
      if (await this.anim.play(SEQUENCES.blink) !== 'complete' || this.busy) return false;
    }
    return true;
  }

  /** Looks round toward the viewer, holds it, looks back. */
  async #glance() {
    const out = [['turn-30', 'turn'], ['turn-60', 'turn']];
    if (await this.anim.play([['idle', 'turn'], ...out]) !== 'complete' || this.busy) return false;
    await this.#wait(550 + Math.random() * 650);
    // A flight may have started during the hold; it owns the frames now.
    if (this.busy || this.anim.currentFrame !== 'turn-60') return false;
    return await this.anim.play([['turn-30', 'turn'], ['idle', 'turn']]) === 'complete' && !this.busy;
  }
}
