/* ═══════════════════════════════════════════════════════════════════
   UI · APP SHELL
   ───────────────────────────────────────────────────────────────────
   Engine ↔ UI-র সংযোগস্থল। Engine state বদলালেই এখান থেকে সব panel
   নতুন করে আঁকা হয়।
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var esc = NS.ui.canvas.esc;

var $ = function(id){ return document.getElementById(id); };

var App = {
  eng: null,
  lab: null,
  cfg: {},
  selDev: null,
  selPkt: null,
  timer: null,
  speed: 1200,
  insMode: 'packet'
};

/* ───────── THEME (book-এর সাথে একই key, তাই setting ভাগাভাগি হয়) ───────── */
function initTheme(){
  var root = document.documentElement, btn = $('themeBtn');
  function apply(t){
    root.setAttribute('data-theme', t);
    btn.textContent = t === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem('nf-theme', t); } catch(e){}
  }
  var saved = null;
  try { saved = localStorage.getItem('nf-theme'); } catch(e){}
  if(!saved) saved = window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  apply(saved);
  btn.addEventListener('click', function(){
    apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
}

/* ───────── LAB LIST ───────── */
function renderLabs(){
  var labs = NS.labList(), o = [], group = null;
  for(var i = 0; i < labs.length; i++){
    var L = labs[i];
    if(L.group !== group){ group = L.group; o.push('<div class="lab-group">' + esc(group) + '</div>'); }
    o.push('<button class="lab-item' + (App.lab && L.id === App.lab.id ? ' on' : '') +
           '" data-lab="' + esc(L.id) + '">' +
             '<span class="t">' + esc(L.title) + '</span>' +
             '<span class="d">' + esc(L.blurb) + '</span>' +
           '</button>');
  }
  $('labList').innerHTML = o.join('');
}

/* ───────── CONTROLS (প্রতিটি lab-এর নিজস্ব) ───────── */
function renderControls(){
  var c = App.lab.controls || [], o = [];
  for(var i = 0; i < c.length; i++){
    var ct = c[i], v = App.cfg[ct.key];
    if(ct.type === 'toggle'){
      o.push('<label class="ctl-row"><input type="checkbox" data-ctl="' + esc(ct.key) + '"' +
             (v ? ' checked' : '') + '><span class="cl">' + esc(ct.label) + '</span></label>');
    } else if(ct.type === 'text'){
      o.push('<div class="ctl-row col"><span class="cl">' + esc(ct.label) + '</span>' +
             '<input type="text" data-ctl="' + esc(ct.key) + '" value="' + esc(v) +
             '" spellcheck="false" autocomplete="off"></div>');
    } else if(ct.type === 'range'){
      o.push('<div class="ctl-row col"><span class="cl">' + esc(ct.label) +
               ' <b class="ctl-v">/' + esc(v) + '</b></span>' +
             '<input type="range" data-ctl="' + esc(ct.key) + '" value="' + esc(v) +
             '" min="' + ct.min + '" max="' + ct.max + '" step="1"></div>');
    } else if(ct.type === 'choice'){
      o.push('<div class="ctl-row col"><span class="cl">' + esc(ct.label) + '</span>' +
             '<select data-ctl="' + esc(ct.key) + '">');
      for(var j = 0; j < ct.options.length; j++){
        var op = ct.options[j];
        o.push('<option value="' + esc(op[0]) + '"' +
               (v === op[0] ? ' selected' : '') + '>' + esc(op[1]) + '</option>');
      }
      o.push('</select></div>');
    }
    if(ct.help) o.push('<div class="ctl-help">' + esc(ct.help) + '</div>');
  }
  $('labControls').innerHTML = o.join('') ||
    '<div class="ctl-help">এই lab-এ কোনো বাড়তি setting নেই।</div>';
}

/* explanation-এ `code` আর **bold** লেখা যায় — সেটুকু markdown এখানে রূপান্তর হয় */
function inline(s){
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/* ───────── LEARNING PANEL ───────── */
function renderLearn(){
  var L = App.lab, o = [];

  o.push('<div class="ln-h">এই Lab-এ কী শিখবেন</div><ul class="ln-list">');
  for(var i = 0; i < L.learn.length; i++) o.push('<li>' + inline(L.learn[i]) + '</li>');
  o.push('</ul>');

  if(L.mistakes && L.mistakes.length){
    o.push('<div class="ln-h">প্রচলিত ভুল ধারণা</div>');
    for(var j = 0; j < L.mistakes.length; j++){
      var m = L.mistakes[j];
      o.push('<div class="ln-myth">' +
               '<div class="mm"><span class="lbl">ভুল ধারণা</span>' + inline(m.m) + '</div>' +
               '<div class="mr"><span class="lbl">সঠিক ধারণা</span>' + inline(m.r) + '</div>' +
             '</div>');
    }
  }

  o.push('<a class="ln-book" href="index.html#' + esc(L.chapter) + '" target="_blank" ' +
         'rel="noopener">এই concept সম্পর্কে বিস্তারিত পড়ুন →<span>বই-এর ' +
         esc(L.chapter.toUpperCase()) + '</span></a>');

  $('learnPanel').innerHTML = o.join('');
}

/* ───────── "এখন কী হলো?" ───────── */
function mini(s){
  return inline(s).replace(/\n\n/g, '</p><p>');
}

function renderWhat(){
  var s = App.eng.current();
  if(!s){
    $('whatPanel').innerHTML =
      '<div class="wh-idle">▶ <b>চালু</b> চাপুন, অথবা <b>এক ধাপ</b> দিয়ে ধীরে ধীরে এগোন।<br>' +
      '<span>প্রতিটি ধাপের পর এখানে ব্যাখ্যা আসবে।</span></div>';
    return;
  }
  var LI = NS.pkt.LAYERS[s.layer] || { n:s.layer || '' };
  $('whatPanel').innerHTML =
    '<div class="wh-top"><span class="wh-k k-' + esc(s.kind || 'info') + '">' +
      esc(s.actor) + '</span><span class="wh-layer">' + esc(LI.n) + '</span></div>' +
    '<div class="wh-q">এখন কী হলো?</div><p>' + mini(s.what) + '</p>' +
    '<div class="wh-q">কেন?</div><p>' + mini(s.why) + '</p>';
}

/* ───────── সব panel নতুন করে আঁকা ───────── */
function paint(){
  var eng = App.eng, st = eng.state, cur = eng.current();

  $('canvasWrap').classList.toggle('calc', !!App.lab.panel);
  if(App.lab.panel){
    NS.ui.canvas.renderPanel($('canvas'), App.lab.panel(App.cfg));
  } else {
    NS.ui.canvas.render($('canvas'), st, {
      active: cur ? cur.actor : null,
      selected: App.selDev
    });
  }

  /* current step-এ packet থাকলে সেটিই inspector-এ দেখাও */
  if(cur && cur.packet) App.selPkt = cur.packet;

  NS.ui.timeline.render($('timeline'), eng);
  renderWhat();
  renderInspector();

  $('stepNow').textContent = (eng.i + 1) + ' / ' + eng.steps.length;
  $('banner').textContent  = st.banner || '';
  $('btnStep').disabled    = eng.done();
  $('btnBack').disabled    = eng.i < 0;
  $('btnPlay').textContent = App.timer ? '⏸ বিরতি' : '▶ চালু';
}

function renderInspector(){
  var dev = null;
  if(App.selDev){
    var all = App.eng.state.devices.slice();
    if(App.eng.state.hub) all.push(App.eng.state.hub);
    for(var i = 0; i < all.length; i++) if(all[i].id === App.selDev) dev = all[i];
  }
  $('insBody').innerHTML = App.insMode === 'packet'
    ? NS.ui.inspector.packetHTML(App.selPkt)
    : NS.ui.inspector.deviceHTML(dev);

  var tabs = document.querySelectorAll('#insTabs button');
  for(var t = 0; t < tabs.length; t++)
    tabs[t].classList.toggle('on', tabs[t].getAttribute('data-ins') === App.insMode);
}

/* ───────── PLAYBACK ───────── */
function stop(){
  if(App.timer){ clearInterval(App.timer); App.timer = null; }
}
function play(){
  if(App.timer) { stop(); paint(); return; }
  /* শেষ পর্যন্ত চলে গেলে ▶ চাপলে আবার শুরু থেকে */
  if(App.eng.done()) App.eng.seek(-1);
  App.timer = setInterval(function(){
    var moved = App.eng.step();
    if(!moved) stop();
    /* প্রতিটি ধাপেই আঁকতে হবে — নইলে state এগোয় কিন্তু পর্দায় কিছু বদলায় না */
    paint();
  }, App.speed);
  paint();
}

/* ───────── LAB LOAD ───────── */
function loadLab(id){
  stop();
  var lab = NS.labs[id];
  if(!lab) return;
  App.lab = lab;
  App.cfg = { seed: 1 };
  var c = lab.controls || [];
  for(var i = 0; i < c.length; i++) App.cfg[c[i].key] = c[i].def;

  App.selDev = null;
  App.selPkt = null;
  App.eng = new NS.Engine(lab, App.cfg).on(function(){ /* paint নিজে ডাকা হয় */ });

  $('labTitle').textContent = lab.title;
  $('labBlurb').textContent = lab.blurb;
  renderLabs();
  renderControls();
  renderLearn();
  paint();

  try { localStorage.setItem('nl-lab', id); } catch(e){}
  if(window.innerWidth <= 1080) $('sidebar').classList.remove('open');
}

/* config বদলালে simulation নতুন করে বানাতে হয় */
function rebuild(){
  stop();
  App.eng = new NS.Engine(App.lab, App.cfg);
  App.selPkt = null;
  paint();     /* controls নিজে আবার আঁকা হয় না — তাই typing-এর caret ঠিক থাকে */
}

/* ───────── EVENTS ───────── */
function bind(){
  $('labList').addEventListener('click', function(e){
    var b = e.target.closest('[data-lab]');
    if(b) loadLab(b.getAttribute('data-lab'));
  });

  function onCtl(e){
    var el = e.target.closest('[data-ctl]');
    if(!el) return;
    App.cfg[el.getAttribute('data-ctl')] =
      el.type === 'checkbox' ? el.checked : el.value;
    /* range-এর পাশের সংখ্যাটা সাথে সাথে বদলাক */
    var lbl = el.parentNode.querySelector('.ctl-v');
    if(lbl && el.type === 'range') lbl.textContent = '/' + el.value;
    rebuild();
  }
  $('labControls').addEventListener('change', onCtl);
  $('labControls').addEventListener('input', onCtl);

  $('btnPlay').addEventListener('click', play);
  $('btnStep').addEventListener('click', function(){ stop(); App.eng.step(); paint(); });
  $('btnBack').addEventListener('click', function(){ stop(); App.eng.back(); paint(); });
  $('btnReset').addEventListener('click', function(){ stop(); App.eng.reset(); App.selPkt = null; paint(); });

  $('speed').addEventListener('input', function(){
    App.speed = 2400 - parseInt(this.value, 10);
    $('speedLbl').textContent = (App.speed / 1000).toFixed(1) + 's';
    if(App.timer){ stop(); play(); }
  });

  $('timeline').addEventListener('click', function(e){
    var b = e.target.closest('[data-step]');
    if(!b) return;
    stop();
    App.eng.seek(parseInt(b.getAttribute('data-step'), 10));
    paint();
  });

  $('canvas').addEventListener('click', function(e){
    var d = e.target.closest('[data-dev]');
    if(d){
      App.selDev = d.getAttribute('data-dev');
      App.insMode = 'device';
      renderInspector();
      NS.ui.canvas.render($('canvas'), App.eng.state, {
        active: App.eng.current() ? App.eng.current().actor : null,
        selected: App.selDev
      });
      return;
    }
    if(e.target.closest('[data-pkt]')){
      var st = App.eng.state;
      if(st.wire && st.wire.pkt){ App.selPkt = st.wire.pkt; App.insMode = 'packet'; renderInspector(); }
    }
  });

  $('insTabs').addEventListener('click', function(e){
    var b = e.target.closest('[data-ins]');
    if(!b) return;
    App.insMode = b.getAttribute('data-ins');
    renderInspector();
  });

  /* field-এ click করলে তার ব্যাখ্যা খোলে/বন্ধ হয় */
  /* Calculator-এর সারিতে click করলে ব্যাখ্যা খোলে */
  $('canvas').addEventListener('click', function(e){
    var r = e.target.closest('.cp-row');
    if(!r) return;
    var why = r.nextElementSibling;
    if(why && why.classList.contains('cp-why')){
      why.classList.toggle('on');
      r.classList.toggle('open');
    }
  });

  $('insBody').addEventListener('click', function(e){
    var f = e.target.closest('.ins-f');
    if(!f) return;
    var help = f.nextElementSibling;
    if(help && help.classList.contains('ins-fh')){
      help.classList.toggle('on');
      f.classList.toggle('open');
    }
  });

  $('menuBtn').addEventListener('click', function(){ $('sidebar').classList.toggle('open'); });
  $('backdrop').addEventListener('click', function(){ $('sidebar').classList.remove('open'); });

  document.addEventListener('keydown', function(e){
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if(e.key === ' ' || e.key === 'k'){ e.preventDefault(); play(); }
    else if(e.key === 'ArrowRight'){ stop(); App.eng.step(); paint(); }
    else if(e.key === 'ArrowLeft'){ stop(); App.eng.back(); paint(); }
    else if(e.key === 'r'){ stop(); App.eng.reset(); paint(); }
  });
}

/* ───────── START ───────── */
function boot(){
  initTheme();
  bind();
  var want = null;
  if(location.hash) want = location.hash.slice(1);
  if(!want){ try { want = localStorage.getItem('nl-lab'); } catch(e){} }
  loadLab(NS.labs[want] ? want : NS.LAB_ORDER[0]);
}

if(document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', boot);
else boot();

})(window.NetLab);
