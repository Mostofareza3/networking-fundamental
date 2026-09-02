/* ═══════════════════════════════════════════════════════════════════
   UI · INSPECTOR
   ───────────────────────────────────────────────────────────────────
   ডানপাশের panel — Packet-এর প্রতিটি field, অথবা Device-এর ভেতরের অবস্থা।
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var esc = NS.ui.canvas.esc;
var P   = NS.pkt;

/* ───────── Packet Inspector ───────── */
function packetHTML(pkt){
  if(!pkt) return '<div class="ins-empty">কোনো Packet select করা নেই।<br><span>Canvas-এ চলন্ত Packet-এ বা Timeline-এর কোনো ধাপে click করুন।</span></div>';

  var o = ['<div class="ins-h">Packet #' + pkt.id +
           '<span class="sz">' + pkt.size + ' bytes</span></div>'];

  for(var i = 0; i < pkt.layers.length; i++){
    var L  = pkt.layers[i];
    var LI = P.LAYERS[L.layer] || { n:L.layer, c:'faint' };
    o.push('<div class="ins-layer c-' + LI.c + '">');
    o.push('<div class="ins-lh"><span class="tag">' + esc(L.layer) + '</span>' +
           '<span class="nm">' + esc(L.name) + '</span>' +
           '<span class="sz">' + (L.size || 0) + 'B</span></div>');
    o.push('<div class="ins-ld">' + esc(LI.d || '') + '</div>');

    for(var j = 0; j < L.fields.length; j++){
      var k = L.fields[j][0], v = L.fields[j][1];
      var help = P.FIELD_HELP[k] || '';
      o.push('<button class="ins-f" data-help="' + esc(help) + '">' +
               '<span class="k">' + esc(k) + '</span>' +
               '<span class="v">' + esc(v) + '</span>' +
             '</button>');
      if(help) o.push('<div class="ins-fh">' + esc(help) + '</div>');
    }
    o.push('</div>');
  }
  return o.join('');
}

/* ───────── Device Inspector ───────── */
function kv(k, v){
  return '<div class="dv-row"><span class="k">' + esc(k) + '</span>' +
         '<span class="v">' + esc(v) + '</span></div>';
}

function tableOrEmpty(rows, head, emptyMsg){
  if(!rows.length) return '<div class="dv-empty">' + esc(emptyMsg) + '</div>';
  var o = ['<table class="dv-t"><thead><tr>'];
  for(var i = 0; i < head.length; i++) o.push('<th>' + esc(head[i]) + '</th>');
  o.push('</tr></thead><tbody>');
  for(var r = 0; r < rows.length; r++){
    o.push('<tr>');
    for(var c = 0; c < rows[r].length; c++) o.push('<td>' + esc(rows[r][c]) + '</td>');
    o.push('</tr>');
  }
  o.push('</tbody></table>');
  return o.join('');
}

function deviceHTML(d){
  if(!d) return '<div class="ins-empty">কোনো Device select করা নেই।<br><span>Canvas-এ যেকোনো device-এ click করুন।</span></div>';

  var o = ['<div class="ins-h">' + esc(d.name) +
           '<span class="sz">' + esc(d.type) + '</span></div>'];

  if(d.type === 'pc' || d.type === 'server'){
    o.push('<div class="dv-sec">');
    o.push(kv('MAC Address', d.mac));
    o.push(kv('IP Address', d.ip));
    o.push(kv('Subnet Mask', d.mask));
    if(d.gw) o.push(kv('Default Gateway', d.gw));
    o.push('</div>');

    var arpRows = [];
    for(var ip in d.arp) if(d.arp.hasOwnProperty(ip)) arpRows.push([ip, d.arp[ip].mac]);
    o.push('<div class="dv-t-h">ARP Cache</div>');
    o.push(tableOrEmpty(arpRows, ['IP Address','MAC Address'],
      'খালি — এই device এখনো কারো MAC Address জানে না।'));

    if(d.listening && d.listening.length){
      var pr = [];
      for(var i = 0; i < d.listening.length; i++){
        var p = d.listening[i];
        pr.push([String(p.port), p.service, p.open ? 'খোলা' : 'বন্ধ']);
      }
      o.push('<div class="dv-t-h">Listening Ports</div>');
      o.push(tableOrEmpty(pr, ['Port','Service','অবস্থা'], ''));
    }
  }

  if(d.type === 'switch'){
    var mr = [];
    for(var mac in d.macTable) if(d.macTable.hasOwnProperty(mac))
      mr.push([mac, 'Port ' + d.macTable[mac].port]);
    o.push('<div class="dv-t-h">MAC Address Table</div>');
    o.push(tableOrEmpty(mr, ['MAC Address','Port'],
      'খালি — Switch এখনো কিছু শেখেনি। Frame এলে Source MAC দেখে শিখবে।'));
    o.push('<div class="dv-note">Switch একটি Layer 2 device — সে IP Address দেখে না, শুধু MAC Address দেখে সিদ্ধান্ত নেয়।</div>');
  }

  if(d.type === 'router'){
    o.push('<div class="dv-t-h">Interfaces</div>');
    var ir = [];
    for(var k = 0; k < (d.ifaces || []).length; k++){
      var f = d.ifaces[k];
      ir.push([f.name, f.ip, f.mac]);
    }
    o.push(tableOrEmpty(ir, ['Interface','IP','MAC'], ''));

    if(d.routes && d.routes.length){
      var rr = [];
      for(var q = 0; q < d.routes.length; q++){
        var rt = d.routes[q];
        rr.push([rt.dst + '/' + rt.prefix, rt.via || 'directly', rt.iface]);
      }
      o.push('<div class="dv-t-h">Routing Table</div>');
      o.push(tableOrEmpty(rr, ['Destination','Next Hop','Interface'], ''));
    }

    var ar = [];
    for(var aip in d.arp) if(d.arp.hasOwnProperty(aip)) ar.push([aip, d.arp[aip].mac]);
    o.push('<div class="dv-t-h">ARP Cache</div>');
    o.push(tableOrEmpty(ar, ['IP Address','MAC Address'], 'খালি।'));
  }

  return o.join('');
}

NS.ui.inspector = { packetHTML: packetHTML, deviceHTML: deviceHTML };

})(window.NetLab);
