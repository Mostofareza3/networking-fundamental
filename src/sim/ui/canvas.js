/* ═══════════════════════════════════════════════════════════════════
   UI · NETWORK CANVAS
   ───────────────────────────────────────────────────────────────────
   State থেকে SVG এঁকে দেয়। এই file কোনো simulation সিদ্ধান্ত নেয় না —
   শুধু যা state-এ আছে তা-ই দেখায়।
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";

var ICON = { pc:'🖥', switch:'🔀', router:'🧭', server:'🗄' };

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* সব device (hub সহ) এক তালিকায় — অবস্থান খোঁজার জন্য */
function allNodes(st){
  var a = st.devices.slice();
  if(st.hub) a.push(st.hub);
  return a;
}
function findNode(st, id){
  var a = allNodes(st);
  for(var i = 0; i < a.length; i++) if(a[i].id === id) return a[i];
  return null;
}

function render(el, st, opts){
  opts = opts || {};
  var active = opts.active || null;     // এই মুহূর্তে যে device কাজ করছে
  var sel    = opts.selected || null;   // user যাকে click করেছে
  var nodes  = allNodes(st);
  var out    = [];

  out.push('<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="nc-wires">');
  /* ── তার ── */
  for(var i = 0; i < st.links.length; i++){
    var L = st.links[i];
    var a = findNode(st, L.a), b = findNode(st, L.b);
    if(!a || !b) continue;
    out.push('<line x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'" class="nc-wire"/>');
  }
  out.push('</svg>');

  /* ── device ── */
  for(var j = 0; j < nodes.length; j++){
    var d = nodes[j];
    var cls = 'nc-node t-' + d.type;
    if(d.id === active) cls += ' active';
    if(d.id === sel)    cls += ' sel';
    var sub = d.ip ? d.ip
            : d.type === 'router' && d.ifaces && d.ifaces[0] ? d.ifaces[0].ip
            : d.type === 'switch' ? 'Layer 2' : '';
    out.push(
      '<button class="' + cls + '" style="left:' + d.x + '%;top:' + d.y + '%" ' +
        'data-dev="' + esc(d.id) + '" title="Inspect করতে click করুন">' +
        '<span class="ic">' + ICON[d.type] + '</span>' +
        '<span class="nm">' + esc(d.name) + '</span>' +
        (sub ? '<span class="ip">' + esc(sub) + '</span>' : '') +
        (d.note ? '<span class="badge">' + esc(d.note) + '</span>' : '') +
      '</button>'
    );
  }

  /* ── তারের উপরে চলমান packet ── */
  if(st.wire && st.wire.pkt){
    var w = st.wire;
    var from = findNode(st, w.from);
    var targets = [];
    if(w.to === 'flood' || w.to === 'both'){
      /* Broadcast/flood: Switch থেকে সবার দিকে — কিন্তু যে port দিয়ে Frame টি
         ঢুকেছে সেদিকে ফেরত যায় না। তাই মূল প্রেরককেও (w.origin) বাদ দিতে হয়। */
      for(var k = 0; k < nodes.length; k++){
        var n = nodes[k];
        if(n.id === w.from || n.id === w.origin) continue;
        if(n.type === 'switch') continue;
        targets.push(n);
      }
    } else {
      var tnode = findNode(st, w.to);
      if(tnode) targets.push(tnode);
    }
    if(from){
      for(var m = 0; m < targets.length; m++){
        var tg = targets[m];
        var mx = (from.x + tg.x) / 2, my = (from.y + tg.y) / 2;
        out.push(
          '<button class="nc-pkt k-' + esc(st.wire.pkt.kind) + '" ' +
            'style="left:' + mx + '%;top:' + my + '%" data-pkt="1" ' +
            'title="Packet Inspector-এ দেখুন">' +
            esc(st.wire.pkt.label || 'Packet') +
          '</button>'
        );
      }
    }
  }

  el.innerHTML = out.join('');
}

NS.ui = NS.ui || {};
NS.ui.canvas = { render: render, esc: esc };

})(window.NetLab);
