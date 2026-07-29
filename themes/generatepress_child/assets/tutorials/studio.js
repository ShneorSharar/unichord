/* ============================================================================
 * unichord — Studio engine  ·  studio.js
 * ----------------------------------------------------------------------------
 * A tiny, dependency-free, DETERMINISTIC motion-graphics engine.
 *
 * Every animation is a pure function of time (ms). The exact same scene file
 * therefore:
 *   • plays live in the browser   (requestAnimationFrame loop)  → tutorial page
 *   • renders frame-accurate MP4  (render.mjs calls __seek(t))  → social cuts
 *
 * No randomness, no Date.now() inside animations → identical output every run.
 *
 * Public API (used by scene files):
 *   const S = Studio.create({ fps, duration, aspect })
 *   S.track(selector, { from, to, ease, ...props })   // animate element(s)
 *   S.caption(text, from, to, opts)                   // subtitle bar (RTL he)
 *   S.cursor(keyframes)                               // fake user pointer
 *   S.tap(x, y, at)                                   // tap ripple at point
 *   S.type(selector, text, from, to)                  // typewriter into el
 *   S.ready()                                         // finalise + expose hooks
 *
 * Animatable props:  x, y, scale, rotate, opacity, blur, w (width %),
 *                    clip (inset reveal 0..100)
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---- easing ---- */
  const EASE = {
    linear:   t => t,
    inQuad:   t => t * t,
    outQuad:  t => 1 - (1 - t) * (1 - t),
    inOutQuad:t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inOutCubic:t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    outBack:  t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: t => {
      const c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp  = (a, b, p) => a + (b - a) * p;
  const $all  = sel => (typeof sel === 'string' ? Array.from(document.querySelectorAll(sel)) : [sel]);

  function Studio(opts) {
    this.fps      = opts.fps || 30;
    this.duration = opts.duration || 0;     // ms; auto-grows from tracks
    this.aspect   = opts.aspect || '16x9';
    this.tracks   = [];
    this.captions = [];
    this.cursorKfs = null;
    this.typers   = [];
    this._grow = ms => { if (ms > this.duration) this.duration = ms; };
  }

  /* animate one or more elements between `from`→`to` ms */
  Studio.prototype.track = function (sel, cfg) {
    const els = $all(sel);
    const stagger = cfg.stagger || 0;
    els.forEach((el, i) => {
      const from = (cfg.from || 0) + i * stagger;
      const to   = (cfg.to != null ? cfg.to : from + 600) + i * stagger;
      this.tracks.push({ el, from, to, ease: cfg.ease || 'outCubic', props: extractProps(cfg) });
      this._grow(to);
    });
    return this;
  };

  /* subtitle bar — RTL Hebrew */
  Studio.prototype.caption = function (text, from, to, o) {
    o = o || {};
    this.captions.push({ text, from, to: to || from + 2000, sub: o.sub || '' });
    this._grow(to || from + 2000);
    return this;
  };

  /* fake user pointer following keyframes.
     Each kf is either {x,y,at,click?} (stage px) or {sel,at,click?} (element). */
  Studio.prototype.cursor = function (kfs) {
    this.cursorKfs = kfs.slice().sort((a, b) => a.at - b.at);
    kfs.forEach(k => { if (k.click) this.tap(k, k.at); this._grow(k.at + 200); });
    return this;
  };

  /* tap ripple — point {x,y} or {sel} */
  Studio.prototype.tap = function (pt, at) {
    this.tracks.push({ tap: { pt, at } });
    this._grow(at + 600);
    return this;
  };

  /* typewriter text into an element */
  Studio.prototype.type = function (sel, text, from, to) {
    const el = $all(sel)[0];
    if (el) { this.typers.push({ el, text, from, to }); this._grow(to); }
    return this;
  };

  function extractProps(cfg) {
    const p = {};
    ['x', 'y', 'scale', 'rotate', 'opacity', 'blur', 'w', 'clip'].forEach(k => {
      if (cfg[k] != null) p[k] = Array.isArray(cfg[k]) ? cfg[k] : [cfg[k], cfg[k]];
    });
    return p;
  }

  /* apply a track's animated props to its element at global time t */
  function applyTrack(tr, t) {
    if (tr.tap) return; // ripples handled separately
    const span = Math.max(1, tr.to - tr.from);
    let p = clamp((t - tr.from) / span, 0, 1);
    p = (EASE[tr.ease] || EASE.outCubic)(p);
    const pr = tr.props;
    const tf = [];
    if (pr.x)      tf.push(`translateX(${lerp(pr.x[0], pr.x[1], p)}px)`);
    if (pr.y)      tf.push(`translateY(${lerp(pr.y[0], pr.y[1], p)}px)`);
    if (pr.scale)  tf.push(`scale(${lerp(pr.scale[0], pr.scale[1], p)})`);
    if (pr.rotate) tf.push(`rotate(${lerp(pr.rotate[0], pr.rotate[1], p)}deg)`);
    if (tf.length) tr.el.style.transform = tf.join(' ');
    if (pr.opacity) tr.el.style.opacity = lerp(pr.opacity[0], pr.opacity[1], p);
    if (pr.blur)    tr.el.style.filter  = `blur(${lerp(pr.blur[0], pr.blur[1], p)}px)`;
    if (pr.w)       tr.el.style.width   = `${lerp(pr.w[0], pr.w[1], p)}%`;
    if (pr.clip)    tr.el.style.clipPath = `inset(0 ${100 - lerp(pr.clip[0], pr.clip[1], p)}% 0 0)`;
  }

  /* ---------- finalise: build DOM helpers + expose seek ---------- */
  Studio.prototype.ready = function () {
    const stage = document.querySelector('.stage') || document.body;

    /* caption bar */
    let capBar = document.querySelector('.studio-cap');
    if (!capBar) {
      capBar = document.createElement('div');
      capBar.className = 'studio-cap';
      capBar.innerHTML = '<span class="studio-cap__main"></span><span class="studio-cap__sub"></span>';
      stage.appendChild(capBar);
    }
    const capMain = capBar.querySelector('.studio-cap__main');
    const capSub  = capBar.querySelector('.studio-cap__sub');

    /* cursor + ripple layer */
    let cur = null, ripple = null;
    if (this.cursorKfs || this.tracks.some(t => t.tap)) {
      cur = document.createElement('div'); cur.className = 'studio-cursor';
      ripple = document.createElement('div'); ripple.className = 'studio-ripple';
      stage.appendChild(ripple); stage.appendChild(cur);
    }

    const self = this;
    /* resolve a keyframe / tap point → {x,y} in stage-local px */
    function resolveXY(k) {
      if (k.sel || k.pt && k.pt.sel) {
        const sel = k.sel || k.pt.sel;
        const el = document.querySelector(sel);
        if (el) {
          const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
          return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
        }
      }
      const src = k.pt || k;
      return { x: src.x || 0, y: src.y || 0 };
    }
    function cursorAt(t) {
      if (!self.cursorKfs || !cur) return;
      const k = self.cursorKfs;
      let a = k[0], b = k[k.length - 1];
      for (let i = 0; i < k.length - 1; i++) { if (t >= k[i].at && t <= k[i + 1].at) { a = k[i]; b = k[i + 1]; break; } }
      if (t <= k[0].at) { a = b = k[0]; }
      if (t >= k[k.length - 1].at) { a = b = k[k.length - 1]; }
      const span = Math.max(1, b.at - a.at);
      const p = EASE.inOutCubic(clamp((t - a.at) / span, 0, 1));
      const pa = resolveXY(a), pb = resolveXY(b);
      cur.style.transform = `translate(${lerp(pa.x, pb.x, p)}px, ${lerp(pa.y, pb.y, p)}px)`;
    }

    function rippleAt(t) {
      if (!ripple) return;
      let active = null;
      self.tracks.forEach(tr => { if (tr.tap && t >= tr.tap.at && t < tr.tap.at + 600) active = tr.tap; });
      if (active) {
        const p = (t - active.at) / 600;
        const xy = resolveXY(active);
        ripple.style.opacity = (1 - p).toFixed(3);
        ripple.style.transform = `translate(${xy.x}px, ${xy.y}px) scale(${0.2 + p * 1.6})`;
        ripple.style.display = 'block';
      } else { ripple.style.display = 'none'; }
    }

    /* THE deterministic seek — pure function of t (ms) */
    this.seek = function (t) {
      t = clamp(t, 0, self.duration);
      self.tracks.forEach(tr => applyTrack(tr, t));
      // captions: last active wins
      let active = null;
      self.captions.forEach(c => { if (t >= c.from && t < c.to) active = c; });
      if (active) { capBar.style.opacity = 1; capMain.textContent = active.text; capSub.textContent = active.sub; }
      else { capBar.style.opacity = 0; }
      // typewriters
      self.typers.forEach(ty => {
        const p = clamp((t - ty.from) / Math.max(1, ty.to - ty.from), 0, 1);
        ty.el.textContent = ty.text.slice(0, Math.round(p * ty.text.length));
      });
      cursorAt(t); rippleAt(t);
    };

    this.seek(0);

    /* expose render hooks */
    global.__seek = t => this.seek(t);
    global.__studioDuration = this.duration;
    global.__studioFps = this.fps;
    global.__studioReady = true;

    /* live playback (embedded tutorial). Loops. Click to pause/resume. */
    this._playFrom = 0; this._playing = false; this._raf = 0; this._t0 = 0;
    const loopMs = this.duration + 900; // small hold at end
    const tick = (now) => {
      if (!this._playing) return;
      const t = (now - this._t0) % loopMs;
      this.seek(Math.min(t, this.duration));
      this._raf = requestAnimationFrame(tick);
    };
    this.play = () => { if (this._playing) return; this._playing = true; this._t0 = performance.now() - this._playFrom; this._raf = requestAnimationFrame(tick); };
    this.pause = () => { this._playing = false; cancelAnimationFrame(this._raf); this._playFrom = (performance.now() - this._t0) % loopMs; };
    this.toggle = () => { this._playing ? this.pause() : this.play(); };

    // Autoplay only when NOT rendering (render passes ?render=1)
    const isRender = /[?&]render=1/.test(location.search);
    if (!isRender) {
      // responsive fit: scale the fixed-size stage to fill its viewport/iframe
      const fit = () => {
        const W = stage.offsetWidth, H = stage.offsetHeight;
        const s = Math.min(window.innerWidth / W, window.innerHeight / H);
        stage.style.transformOrigin = 'center center';
        stage.style.transform = `scale(${s})`;
      };
      fit(); window.addEventListener('resize', fit);
      // start when visible (works for IntersectionObserver embeds)
      const startLive = () => this.play();
      if ('IntersectionObserver' in global && stage !== document.body) {
        new IntersectionObserver((ents, ob) => {
          ents.forEach(e => { if (e.isIntersecting) { startLive(); } else { this.pause(); } });
        }, { threshold: 0.4 }).observe(stage);
      } else { startLive(); }
      (stage).addEventListener('click', () => this.toggle());
    }
    return this;
  };

  global.Studio = {
    create: o => new Studio(o || {}),
    ease: EASE,
  };
})(window);
