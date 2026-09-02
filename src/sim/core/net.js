/* ═══════════════════════════════════════════════════════════════════
   NETWORK MODEL
   ───────────────────────────────────────────────────────────────────
   Device, Link এবং topology-র গঠন। Lab গুলো এখান থেকে device বানায়,
   তাই Device Inspector সব lab-এ একই ভাবে কাজ করে।
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";

/* কোন device-এ কোন কোন তথ্য থাকে তা এখানেই ঠিক হয় */
function pc(id, o){
  return {
    id: id, type:'pc', name: o.name || id,
    x: o.x, y: o.y,
    mac: o.mac, ip: o.ip,
    mask: o.mask || '255.255.255.0',
    gw: o.gw || '',
    arp: {},            // ARP Cache: ip → {mac, age}
    ports: o.ports || [],
    note: o.note || ''
  };
}

function sw(id, o){
  return {
    id: id, type:'switch', name: o.name || id,
    x: o.x, y: o.y,
    macTable: {},       // mac → {port, age}
    portsOf: o.portsOf || {},   // deviceId → port নম্বর
    queue: [],
    note: o.note || ''
  };
}

function router(id, o){
  return {
    id: id, type:'router', name: o.name || id,
    x: o.x, y: o.y,
    ifaces: o.ifaces || [],     // [{name, ip, mac, mask}]
    routes: o.routes || [],     // [{dst, prefix, via, iface}]
    arp: {},
    queue: [],
    note: o.note || ''
  };
}

function server(id, o){
  return {
    id: id, type:'server', name: o.name || id,
    x: o.x, y: o.y,
    mac: o.mac, ip: o.ip,
    mask: o.mask || '255.255.255.0',
    gw: o.gw || '',
    arp: {},
    listening: o.listening || [],  // [{port, service, open}]
    note: o.note || ''
  };
}

function link(a, b, o){
  o = o || {};
  return { a:a, b:b, label:o.label || '', kind:o.kind || 'copper' };
}

/* ───────── IP helpers — Subnet lab এবং IP lab দুটোই ব্যবহার করে ───────── */
function ip2int(s){
  var p = String(s).split('.');
  if(p.length !== 4) return null;
  var n = 0;
  for(var i = 0; i < 4; i++){
    var v = parseInt(p[i], 10);
    if(isNaN(v) || v < 0 || v > 255 || p[i] === '') return null;
    n = (n * 256) + v;
  }
  return n;
}
function int2ip(n){
  return [ Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256,
           Math.floor(n / 256) % 256, n % 256 ].join('.');
}
function maskInt(cidr){
  return cidr === 0 ? 0 : (Math.pow(2, 32) - Math.pow(2, 32 - cidr));
}
function maskToCidr(m){
  var n = ip2int(m); if(n === null) return null;
  var c = 0, seen0 = false;
  for(var b = 31; b >= 0; b--){
    var bit = Math.floor(n / Math.pow(2, b)) % 2;
    if(bit === 1){ if(seen0) return null; c++; } else seen0 = true;
  }
  return c;
}
/* দুটি IP একই subnet-এ আছে কিনা — IP lab-এর মূল প্রশ্ন */
function sameSubnet(a, b, mask){
  var m = ip2int(mask), x = ip2int(a), y = ip2int(b);
  if(m === null || x === null || y === null) return false;
  return netAddr(x, m) === netAddr(y, m);
}
function netAddr(ipn, maskn){
  /* JS-এর bitwise 32-bit signed, তাই ভাগ-গুণ দিয়ে করা হচ্ছে */
  var out = 0;
  for(var b = 31; b >= 0; b--){
    var p = Math.pow(2, b);
    var ib = Math.floor(ipn / p) % 2, mb = Math.floor(maskn / p) % 2;
    if(ib && mb) out += p;
  }
  return out;
}

/* ───────── Subnet হিসাব — Subnet Calculator ও IP lab দুটোই ব্যবহার করে ─────────
   JS-এর bitwise operator 32-bit signed, তাই 255.255.255.255-এর মতো মান
   ঋণাত্মক হয়ে যায়। সেজন্য সব হিসাব ভাগ-গুণ দিয়ে করা হচ্ছে। */
function subnet(ipStr, cidr){
  var n = ip2int(ipStr);
  if(n === null) return { err:'IP Address টি সঠিক নয়। উদাহরণ: 192.168.1.10' };
  if(cidr === null || isNaN(cidr) || cidr < 0 || cidr > 32)
    return { err:'CIDR ০ থেকে ৩২-এর মধ্যে হতে হবে।' };

  var m     = maskInt(cidr);
  var net   = netAddr(n, m);
  var size  = Math.pow(2, 32 - cidr);
  var bcast = net + size - 1;

  /* /31 আর /32 বিশেষ — এদের স্বাভাবিক host range নেই */
  var usable, first, last;
  if(cidr >= 31){
    usable = cidr === 32 ? 1 : 2;   /* /31 point-to-point link (RFC 3021) */
    first  = net;
    last   = bcast;
  } else {
    usable = size - 2;              /* network ও broadcast বাদ */
    first  = net + 1;
    last   = bcast - 1;
  }

  return {
    ip:        ipStr,
    cidr:      cidr,
    mask:      int2ip(m),
    network:   int2ip(net),
    broadcast: int2ip(bcast),
    first:     int2ip(first),
    last:      int2ip(last),
    total:     size,
    usable:    usable,
    special:   cidr >= 31
  };
}

/* একটি IP-কে 8-bit করে binary-তে দেখানো — কোন bit network, কোনটি host */
function bits(ipStr){
  var n = ip2int(ipStr);
  if(n === null) return '';
  var out = [];
  for(var o = 3; o >= 0; o--){
    var byte = Math.floor(n / Math.pow(256, o)) % 256, s = '';
    for(var b = 7; b >= 0; b--) s += (Math.floor(byte / Math.pow(2, b)) % 2);
    out.push(s);
  }
  return out.join('.');
}

/* Longest Prefix Match — সব মিল বের করে, সবচেয়ে দীর্ঘ prefix জেতে */
function lpm(dstStr, routes){
  var d = ip2int(dstStr), matches = [];
  for(var i = 0; i < routes.length; i++){
    var r = routes[i];
    var rn = ip2int(r.dst);
    if(rn === null) continue;
    var m = maskInt(r.prefix);
    if(netAddr(d, m) === netAddr(rn, m)) matches.push(r);
  }
  matches.sort(function(a, b){ return b.prefix - a.prefix; });
  return { matches: matches, best: matches.length ? matches[0] : null };
}

NS.net = {
  pc:pc, sw:sw, router:router, server:server, link:link,
  ip2int:ip2int, int2ip:int2ip, maskInt:maskInt,
  maskToCidr:maskToCidr, sameSubnet:sameSubnet, netAddr:netAddr,
  subnet:subnet, bits:bits, lpm:lpm
};

})(window.NetLab = window.NetLab || {});
