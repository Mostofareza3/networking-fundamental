/* ═══════════════════════════════════════════════════════════════════
   SIMULATION ENGINE
   ───────────────────────────────────────────────────────────────────
   এই file-এ কোনো DOM নেই, কোনো UI নেই। শুধু simulation-এর logic।

   একটি Lab একটি script() function দেয় যা step-এর array return করে।
   Engine সেই step গুলো একটার পর একটা চালায় এবং প্রতিটি step-এ
   একটি নতুন immutable state তৈরি করে।

   Deterministic: একই lab + একই config = সবসময় একই step sequence.
   কোনো Math.random() নেই — এলোমেলো লাগলে seeded RNG ব্যবহার হয়।
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";

/* ───────── Seeded RNG — determinism রক্ষার জন্য ───────── */
/* Math.random() ব্যবহার করলে একই input-এ ভিন্ন result আসত, তাই
   mulberry32 — ছোট, দ্রুত, এবং seed দিলে সবসময় একই sequence। */
function rng(seed){
  var s = seed >>> 0;
  return function(){
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────── deep clone — structuredClone সব browser-এ নেই ───────── */
function clone(v){
  if(v === null || typeof v !== 'object') return v;
  if(Array.isArray(v)){
    var a = new Array(v.length);
    for(var i = 0; i < v.length; i++) a[i] = clone(v[i]);
    return a;
  }
  var o = {};
  for(var k in v) if(Object.prototype.hasOwnProperty.call(v, k)) o[k] = clone(v[k]);
  return o;
}

/* ═══════════════ Engine ═══════════════ */
/*  lab = {
        id, title, blurb,
        chapter,                  ← book-এর কোন chapter-এ এই concept
        learn:[…], mistakes:[…],  ← Learning System-এর অংশ
        controls:[…],             ← user যা যা বদলাতে পারে
        build(cfg) → state        ← শুরুর state
        script(state, cfg, rand) → [step…]
    }

    step = {
        t,                        ← simulated clock (ms)
        actor,                    ← কোন device কাজ করছে
        title,                    ← timeline-এ এক লাইন (Bangla)
        layer,                    ← 'L1'|'L2'|'L3'|'L4'|'L7'
        what, why,                ← "এখন কী হলো?" / "কেন?"  (Bangla)
        kind,                     ← 'ok'|'warn'|'error'|'info'
        packet,                   ← inspect করার মতো packet (optional)
        apply(state)              ← state mutate করে (engine clone দেয়)
    }                                                                  */
function Engine(lab, cfg){
  this.lab     = lab;
  this.cfg     = cfg || {};
  this.rand    = rng(this.cfg.seed == null ? 1 : this.cfg.seed);
  this.subs    = [];
  this.reset();
}

Engine.prototype.reset = function(){
  this.rand    = rng(this.cfg.seed == null ? 1 : this.cfg.seed);
  this.initial = this.lab.build(this.cfg);
  this.steps   = this.lab.script(clone(this.initial), this.cfg, this.rand) || [];
  this.i       = -1;                     // -1 = কিছুই চলেনি
  this.state   = clone(this.initial);
  this.history = [clone(this.initial)];  // history[n] = n ধাপের পরের state
  this.playing = false;
  this.emit();
};

/* এক ধাপ এগোনো */
Engine.prototype.step = function(){
  if(this.i >= this.steps.length - 1) return false;
  this.i++;
  var st = clone(this.state);
  var s  = this.steps[this.i];
  if(s.apply) s.apply(st);
  this.state = st;
  this.history[this.i + 1] = clone(st);
  this.emit();
  return true;
};

/* এক ধাপ পিছনে — history থেকে, তাই কোনো "undo" logic লাগে না */
Engine.prototype.back = function(){
  if(this.i < 0) return false;
  this.i--;
  this.state = clone(this.history[this.i + 1]);
  this.emit();
  return true;
};

/* নির্দিষ্ট step-এ লাফ */
Engine.prototype.seek = function(n){
  n = Math.max(-1, Math.min(n, this.steps.length - 1));
  if(n === this.i) return;
  if(n < this.i){
    this.i = n;
    this.state = clone(this.history[n + 1]);
  } else {
    while(this.i < n) this.step();
  }
  this.emit();
};

Engine.prototype.done    = function(){ return this.i >= this.steps.length - 1; };
Engine.prototype.current = function(){ return this.i < 0 ? null : this.steps[this.i]; };

/* ───────── subscription — UI এখানে হুক করে ───────── */
Engine.prototype.on   = function(fn){ this.subs.push(fn); return this; };
Engine.prototype.emit = function(){
  for(var i = 0; i < this.subs.length; i++) this.subs[i](this);
};

NS.Engine = Engine;
NS.rng    = rng;
NS.clone  = clone;

})(window.NetLab = window.NetLab || {});
