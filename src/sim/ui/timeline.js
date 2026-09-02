/* ═══════════════════════════════════════════════════════════════════
   UI · EVENT TIMELINE
   ───────────────────────────────────────────────────────────────────
   নিচের অংশ — প্রতিটি ঘটনা ক্রম অনুসারে। click করলে সেই ধাপে ফেরত যায়।
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var esc = NS.ui.canvas.esc;

/* simulated clock — শুরু 10:01:00, প্রতিটি ধাপ ১ সেকেন্ড */
function clock(t){
  var s = t % 60, m = Math.floor(t / 60);
  return '10:' + String(1 + m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function render(el, eng){
  var o = [];
  if(!eng.steps.length){
    el.innerHTML = '<div class="tl-empty">এই lab-এ কোনো ধাপ নেই।</div>';
    return;
  }
  for(var i = 0; i < eng.steps.length; i++){
    var s = eng.steps[i];
    var cls = 'tl-item k-' + (s.kind || 'info');
    if(i === eng.i)  cls += ' now';
    if(i <  eng.i)   cls += ' past';
    if(i >  eng.i)   cls += ' future';
    o.push(
      '<button class="' + cls + '" data-step="' + i + '">' +
        '<span class="tl-t">' + clock(s.t) + '</span>' +
        '<span class="tl-actor">' + esc(s.actor) + '</span>' +
        '<span class="tl-title">' + esc(s.title) + '</span>' +
        '<span class="tl-layer">' + esc(s.layer || '') + '</span>' +
      '</button>'
    );
  }
  el.innerHTML = o.join('');

  var now = el.querySelector('.tl-item.now');
  if(now && now.scrollIntoView) now.scrollIntoView({ block:'nearest', inline:'nearest' });
}

NS.ui.timeline = { render: render, clock: clock };

})(window.NetLab);
