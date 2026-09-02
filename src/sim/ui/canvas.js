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

  /* কিছু lab (Encapsulation) movement নয়, স্তর দেখায় — তখন canvas-এ
     মোড়কগুলো ছবির মতো করে দেখানো হয়। */
  if(st.stack && st.stack.length){
    out.push(stackHTML(st.stack));
  }

  el.innerHTML = out.join('');
}

/* Encapsulation-এর স্তর — বাইরের মোড়ক আগে, ভেতরের data শেষে */
var STACK_INFO = {
  L7: ['Application Data', 'payload'],
  L4: ['TCP / UDP Header',  'L4'],
  L3: ['IP Header',         'L3'],
  L2: ['Ethernet Header',   'L2'],
  L1: ['Bits',              'L1']
};
function stackHTML(stack){
  /* state-এ ক্রম L7→L1 (যোগ হওয়ার ক্রম); দেখাতে হবে বাইরের মোড়ক উপরে */
  var order = ['L1','L2','L3','L4','L7'];
  var o = ['<div class="nc-stack">'];
  for(var i = 0; i < order.length; i++){
    var k = order[i];
    if(stack.indexOf(k) === -1) continue;
    var info = STACK_INFO[k];
    var isNewest = stack[stack.length - 1] === k;
    o.push('<div class="ns-row l-' + k + (isNewest ? ' new' : '') + '">' +
             '<span class="ns-tag">' + k + '</span>' +
             '<span class="ns-nm">' + info[0] + '</span>' +
           '</div>');
  }
  o.push('</div>');
  return o.join('');
}

/* ───────── Calculator panel (Subnet Calculator-এর মতো lab-এর জন্য) ───────── */
function renderPanel(el, p){
  if(p.err){
    el.innerHTML = '<div class="cp-err">' + esc(p.err) + '</div>';
    return;
  }
  var o = ['<div class="cp">'];

  /* bit গুলো — কোনটা network আর কোনটা host, রঙ দিয়ে আলাদা */
  o.push('<div class="cp-bits"><span class="n">' + esc(p.bits.net) + '</span>' +
         '<span class="h">' + esc(p.bits.host) + '</span></div>');
  o.push('<div class="cp-legend">' +
           '<span><i class="sw-n"></i>' + p.cidr + ' bit network</span>' +
           '<span><i class="sw-h"></i>' + (32 - p.cidr) + ' bit host</span>' +
         '</div>');

  o.push('<div class="cp-rows">');
  for(var i = 0; i < p.rows.length; i++){
    var r = p.rows[i];
    o.push('<button class="cp-row" data-why="' + esc(r[2]) + '">' +
             '<span class="k">' + esc(r[0]) + '</span>' +
             '<span class="v">' + esc(r[1]) + '</span>' +
           '</button>' +
           '<div class="cp-why">' + esc(r[2]) + '</div>');
  }
  o.push('</div></div>');
  el.innerHTML = o.join('');
}

NS.ui = NS.ui || {};
NS.ui.canvas = { render: render, renderPanel: renderPanel, esc: esc };

})(window.NetLab);
