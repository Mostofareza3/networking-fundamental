/* ═══════════════════════════════════════════════════════════════════
   PACKET MODEL
   ───────────────────────────────────────────────────────────────────
   Packet/Frame-এর গঠন এবং প্রতিটি field-এর Bangla ব্যাখ্যা এক জায়গায়।

   Inspector এখান থেকেই field-এর explanation নেয়, তাই একই field-এর
   ব্যাখ্যা প্রতিটি lab-এ হুবহু একই থাকে।
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";

/* প্রতিটি field-এর পাশে যে ছোট Bangla ব্যাখ্যা দেখানো হয় */
var FIELD_HELP = {
  /* Layer 2 — Ethernet */
  'dstMAC'   : 'এই local link-এ Frame-টি কোন NIC গ্রহণ করবে। প্রতিটি hop-এ এটি বদলায়।',
  'srcMAC'   : 'যে NIC থেকে Frame-টি বের হলো। এটিও প্রতিটি hop-এ বদলায়।',
  'ethertype': 'Payload-এ কোন protocol আছে তা বলে — 0x0800 মানে IPv4, 0x0806 মানে ARP।',
  'fcs'      : 'Frame Check Sequence — transmission-এ Frame নষ্ট হয়েছে কিনা receiver এটি দিয়ে যাচাই করে।',

  /* Layer 3 — IP */
  'srcIP'    : 'Packet-টি মূলত কোন host থেকে এসেছে। সাধারণত পুরো journey-তে একই থাকে।',
  'dstIP'    : 'Packet-টি শেষ পর্যন্ত কোথায় যাবে। Routing decision এই field দেখেই নেওয়া হয়।',
  'ttl'      : 'Time To Live — প্রতিটি Router এটি ১ কমায়। 0 হলে Packet drop হয়, যাতে loop-এ অসীমকাল ঘুরতে না পারে।',
  'proto'    : 'IP-এর উপরে কোন protocol আছে — 6 মানে TCP, 17 মানে UDP, 1 মানে ICMP।',
  'ipLen'    : 'Header সহ পুরো IP Packet-এর দৈর্ঘ্য (byte)।',

  /* Layer 4 — TCP/UDP */
  'srcPort'  : 'পাঠানো host-এর কোন application এই data পাঠাচ্ছে। সাধারণত OS একটি ephemeral port দেয়।',
  'dstPort'  : 'গন্তব্য host-এর কোন service-এর জন্য data — যেমন 80 মানে HTTP, 443 মানে HTTPS।',
  'seq'      : 'Sequence Number — এই segment-এর প্রথম byte পুরো stream-এর কত নম্বর byte।',
  'ack'      : 'ACK Number — receiver এর আগ পর্যন্ত সব byte পেয়েছে, এখন এটি আশা করছে।',
  'flags'    : 'TCP-র control bit — SYN connection শুরু করে, ACK স্বীকৃতি দেয়, FIN শেষ করে।',
  'window'   : 'Receive Window — receiver আর কত byte নিতে পারবে। Flow control এটি দিয়েই হয়।',

  /* ARP */
  'op'       : 'ARP operation — 1 মানে Request (কে আছে?), 2 মানে Reply (আমি আছি)।',
  'spa'      : 'Sender Protocol Address — যে জিজ্ঞেস করছে তার IP Address।',
  'sha'      : 'Sender Hardware Address — যে জিজ্ঞেস করছে তার MAC Address।',
  'tpa'      : 'Target Protocol Address — যার MAC Address খোঁজা হচ্ছে সেই IP।',
  'tha'      : 'Target Hardware Address — উত্তর আসার আগে এটি অজানা (00:00:00:00:00:00)।',

  /* Payload */
  'payload'  : 'Application-এর আসল data। নিচের প্রতিটি layer এই data-কেই বহন করছে।'
};

/* Layer-এর নাম ও রঙের mapping — সব UI একই vocabulary ব্যবহার করে */
var LAYERS = {
  L1: { n:'Layer 1 · Physical',    c:'faint',  d:'Bit আকারে cable/radio-তে signal।' },
  L2: { n:'Layer 2 · Data Link',   c:'teal',   d:'একই local network-এ MAC Address দিয়ে Frame delivery।' },
  L3: { n:'Layer 3 · Network',     c:'accent', d:'ভিন্ন network-এর মধ্যে IP Address দিয়ে routing।' },
  L4: { n:'Layer 4 · Transport',   c:'purple', d:'Port দিয়ে application চেনা, TCP হলে reliability।' },
  L7: { n:'Layer 7 · Application', c:'warn',   d:'HTTP, DNS-এর মতো protocol — আসল data।' }
};

/* ───────── Packet তৈরির helper ─────────
   প্রতিটি layer একটি {name, layer, fields} object.
   সবচেয়ে বাইরের layer array-র প্রথমে (Encapsulation-এর ক্রম অনুযায়ী)। */
function ethernet(src, dst, type){
  return {
    name  : 'Ethernet Header',
    layer : 'L2',
    size  : 14,
    fields: [
      ['dstMAC', dst],
      ['srcMAC', src],
      ['ethertype', type === 'arp' ? '0x0806 (ARP)' : '0x0800 (IPv4)']
    ]
  };
}

function arp(op, sha, spa, tha, tpa){
  return {
    name  : 'ARP ' + (op === 1 ? 'Request' : 'Reply'),
    layer : 'L2',
    size  : 28,
    fields: [
      ['op',  op === 1 ? '1 (Request)' : '2 (Reply)'],
      ['sha', sha],
      ['spa', spa],
      ['tha', tha],
      ['tpa', tpa]
    ]
  };
}

function ip(src, dst, ttl, proto, len){
  return {
    name  : 'IP Header',
    layer : 'L3',
    size  : 20,
    fields: [
      ['srcIP', src],
      ['dstIP', dst],
      ['ttl',   String(ttl)],
      ['proto', proto === 'tcp' ? '6 (TCP)' : proto === 'udp' ? '17 (UDP)' : '1 (ICMP)'],
      ['ipLen', String(len || 0) + ' bytes']
    ]
  };
}

function tcp(sp, dp, seq, ack, flags, win){
  return {
    name  : 'TCP Header',
    layer : 'L4',
    size  : 20,
    fields: [
      ['srcPort', String(sp)],
      ['dstPort', String(dp)],
      ['seq',     String(seq)],
      ['ack',     String(ack)],
      ['flags',   flags],
      ['window',  String(win) + ' bytes']
    ]
  };
}

function data(text){
  return {
    name  : 'Application Payload',
    layer : 'L7',
    size  : text.length,
    fields: [ ['payload', text] ]
  };
}

/* একটি packet = কয়েকটি layer + কিছু metadata */
var pktId = 0;
function make(layers, meta){
  var m = meta || {};
  var total = 0;
  for(var i = 0; i < layers.length; i++) total += layers[i].size || 0;
  return {
    id     : ++pktId,
    layers : layers,
    size   : total,
    label  : m.label  || '',      // canvas-এ packet-এর গায়ে যা লেখা থাকবে
    kind   : m.kind   || 'data',  // 'arp' | 'data' | 'ack' — রঙ ঠিক করে
    from   : m.from   || '',
    to     : m.to     || ''
  };
}
function resetIds(){ pktId = 0; }

/* একটি packet-এর ভেতর থেকে নির্দিষ্ট field খোঁজা */
function field(pkt, key){
  for(var i = 0; i < pkt.layers.length; i++){
    var f = pkt.layers[i].fields;
    for(var j = 0; j < f.length; j++) if(f[j][0] === key) return f[j][1];
  }
  return null;
}

NS.pkt = {
  FIELD_HELP: FIELD_HELP,
  LAYERS    : LAYERS,
  ethernet  : ethernet,
  arp       : arp,
  ip        : ip,
  tcp       : tcp,
  data      : data,
  make      : make,
  field     : field,
  resetIds  : resetIds
};

})(window.NetLab = window.NetLab || {});
