// The virtual clock for motion exports (openspec add-motion-export,
// "Deterministic Frame Capture"): installed with evaluateOnNewDocument before
// any page script runs, it replaces the page's time sources and timers so the
// exporter decides when time passes. Each advance runs due timers in order,
// then the frame's requestAnimationFrame callbacks, then sets every CSS/Web
// Animation's currentTime, so a frame is identical however long it took to
// capture. The real requestAnimationFrame stays reachable as
// window.__odClock.realRaf for waiting on the compositor.
//
// A string, not a serialized function: it must run as-is inside the page.

export const VIRTUAL_CLOCK_SCRIPT = String.raw`(function () {
  if (window.__odClock) return;
  var realRaf = window.requestAnimationFrame.bind(window);
  var setTimeoutReal = window.setTimeout.bind(window);
  var realNow = performance.now.bind(performance);
  var RealDate = Date;
  var epoch = RealDate.now();
  var now = 0;
  var timers = [];
  var nextId = 1;
  var frameCallbacks = [];
  var nextFrameId = 1;
  var animationStarts = typeof WeakMap === 'function' ? new WeakMap() : null;
  var workers = 0;

  function addTimer(fn, delay, args, repeat) {
    var id = nextId++;
    var d = Math.max(0, Number(delay) || 0);
    timers.push({ id: id, at: now + d, fn: fn, args: args, every: repeat ? Math.max(1, d) : 0 });
    return id;
  }
  function clearTimer(id) {
    for (var i = 0; i < timers.length; i++) if (timers[i].id === id) { timers.splice(i, 1); return; }
  }
  window.setTimeout = function (fn, delay) { return addTimer(fn, delay, Array.prototype.slice.call(arguments, 2), false); };
  window.setInterval = function (fn, delay) { return addTimer(fn, delay, Array.prototype.slice.call(arguments, 2), true); };
  window.clearTimeout = clearTimer;
  window.clearInterval = clearTimer;
  window.requestAnimationFrame = function (cb) { var id = nextFrameId++; frameCallbacks.push({ id: id, cb: cb }); return id; };
  window.cancelAnimationFrame = function (id) {
    for (var i = 0; i < frameCallbacks.length; i++) if (frameCallbacks[i].id === id) { frameCallbacks.splice(i, 1); return; }
  };
  performance.now = function () { return now; };
  function VirtualDate() {
    if (!(this instanceof VirtualDate)) return new RealDate(epoch + now).toString();
    var args = Array.prototype.slice.call(arguments);
    return args.length === 0 ? new RealDate(epoch + now) : new (Function.prototype.bind.apply(RealDate, [null].concat(args)))();
  }
  VirtualDate.prototype = RealDate.prototype;
  VirtualDate.now = function () { return epoch + now; };
  VirtualDate.parse = RealDate.parse;
  VirtualDate.UTC = RealDate.UTC;
  window.Date = VirtualDate;
  if (typeof window.Worker === 'function') {
    var RealWorker = window.Worker;
    window.Worker = function (a, b) { workers++; return new RealWorker(a, b); };
    window.Worker.prototype = RealWorker.prototype;
  }

  function runTimersUntil(t) {
    for (;;) {
      var due = null;
      for (var i = 0; i < timers.length; i++) if (timers[i].at <= t && (!due || timers[i].at < due.at || (timers[i].at === due.at && timers[i].id < due.id))) due = timers[i];
      if (!due) return;
      now = Math.max(now, due.at);
      if (due.every) due.at += due.every;
      else clearTimer(due.id);
      try {
        if (typeof due.fn === 'function') due.fn.apply(window, due.args);
      } catch (e) {
        setTimeoutReal(function () { throw e; });
      }
    }
  }
  // An animation's start is the virtual time it was first seen: animations that already exist when an
  // advance begins started at the previous time (CSS animations from page load start at 0); ones created
  // by timers or frame callbacks during the advance start at the new time.
  function registerAnimations(at) {
    if (!document.getAnimations || !animationStarts) return;
    var list = document.getAnimations();
    for (var i = 0; i < list.length; i++) if (animationStarts.get(list[i]) === undefined) animationStarts.set(list[i], at);
  }
  function syncAnimations() {
    if (!document.getAnimations) return;
    registerAnimations(now);
    var list = document.getAnimations();
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var start = animationStarts ? animationStarts.get(a) : 0;
      try {
        a.pause();
        a.currentTime = now - start;
      } catch (e) {
        // A finished or detached animation can refuse a seek; it stays as it is.
      }
    }
  }

  window.__odClock = {
    realRaf: realRaf,
    realNow: realNow,
    now: function () { return now; },
    workers: function () { return workers; },
    /** Moves time to t (ms), running due timers, then one frame of rAF callbacks, then syncing animations. */
    advanceTo: function (t) {
      registerAnimations(now);
      runTimersUntil(t);
      now = Math.max(now, t);
      var frame = frameCallbacks;
      frameCallbacks = [];
      for (var i = 0; i < frame.length; i++) {
        try { frame[i].cb(now); } catch (e) { setTimeoutReal(function () { throw e; }); }
      }
      syncAnimations();
      return now;
    },
    /** Waits for the compositor to paint what advanceTo changed (real frames). */
    painted: function () { return new Promise(function (r) { realRaf(function () { realRaf(function () { r(); }); }); }); },
  };
})();`;
