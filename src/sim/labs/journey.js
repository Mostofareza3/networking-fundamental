/* ═══════════════════════════════════════════════════════════════════
   LAB · Full URL Journey — Enter চাপার পর সব মিলিয়ে যা ঘটে
   ───────────────────────────────────────────────────────────────────
   এটি শেষ lab — আগের ২৯টি lab-এ আলাদা আলাদা করে যা দেখা হয়েছে,
   এখানে সেগুলো একটি ধারাবাহিক গল্পে সাজানো হচ্ছে।
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI = { ip:'192.168.1.10', mac:'AA:AA:AA:AA:AA:AA' };
var GW  = { ip:'192.168.1.1',  mac:'GG:GG:GG:GG:GG:GG', pub:'203.0.113.7' };
var RES = { ip:'8.8.8.8',      mac:'DD:DD:DD:DD:DD:DD' };
var WEB = { ip:'93.184.216.34', mac:'SS:SS:SS:SS:SS:SS' };

function mk(layers, label, kind, from, to){
  return P.make(layers, { label:label, kind:kind, from:from, to:to });
}

NS.labs.journey = {
  id: 'journey',
  title: 'Full URL Journey',
  group: 'Phase 6 · সব একসাথে',
  chapter: 'ch48',
  blurb: 'https://example.com লিখে Enter চাপলেন। এই একটি কাজে আগের ২৯টি lab-এর প্রায় সবগুলোই ঘটে।',

  learn: [
    'একটি সাধারণ page load-এ কতগুলো ভিন্ন protocol জড়িত',
    'প্রতিটি স্তর কোথায় শুরু হয়, কোথায় শেষ — আর কে কার উপর নির্ভরশীল',
    'কোন ধাপে কত RTT খরচ হয়, আর কেন optimization-এর লক্ষ্য RTT কমানো',
    'পুরো ছবিটি একসাথে দেখলে debugging-এর মানচিত্র তৈরি হয়'
  ],

  mistakes: [
    { m:'Browser সরাসরি website-এর সাথে কথা বলে, ব্যস।',
      r:'একটি page load-এ অন্তত ছয়টি ভিন্ন protocol জড়িত — DNS, ARP, IP, TCP, TLS, HTTP — এবং সাধারণত চার-পাঁচটি ভিন্ন যন্ত্রের সাথে কথা হয়। "Website-এর সাথে কথা" শুরু হয় সবার শেষে।' },
    { m:'Page ধীরে খুললে সমস্যা server-এ।',
      r:'দেরি যেকোনো স্তরে হতে পারে — DNS cache miss, দূরত্বজনিত RTT, TCP slow start, TLS handshake, তারপর server-এর নিজের সময়। প্রথম byte আসার আগেই প্রায়ই ৪ RTT খরচ হয়ে যায়। Server হয়তো ৫ ms-এ উত্তর দিয়েছে, অথচ ব্যবহারকারী অপেক্ষা করেছেন ৫০০ ms।' },
    { m:'এতগুলো ধাপ মানে নকশাটি অপ্রয়োজনীয়ভাবে জটিল।',
      r:'প্রতিটি স্তর একটি নির্দিষ্ট সমস্যার সমাধান করে, এবং **অন্যদের কিছু না জানিয়েই** বদলাতে পারে। এই স্বাধীনতার কারণেই IPv6, TLS 1.3, HTTP/2 — সবই আলাদা আলাদা করে এসেছে, পুরো Internet একসাথে বদলাতে হয়নি।' }
  ],

  controls: [
    { key:'warm', type:'toggle', label:'সবকিছু আগে থেকে cache-এ আছে', def:false,
      help:'দ্বিতীয়বার একই site খুললে কত ধাপ বাদ পড়ে — সেটাই দেখুন।' }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Browser', x:8, y:50, mac:CLI.mac, ip:CLI.ip,
                         gw:GW.ip, note:'Enter চাপা হলো' }),
        N.router('gw', { name:'Router (NAT)', x:32, y:50,
          ifaces:[ { name:'lan', ip:GW.ip,  mac:GW.mac, mask:'255.255.255.0' },
                   { name:'wan', ip:GW.pub, mac:'GG:GG:GG:GG:GG:02', mask:'255.255.255.0' } ],
          routes:[ { dst:'0.0.0.0', prefix:0, via:'ISP', iface:'wan' } ] }),
        N.server('res', { name:'DNS Resolver', x:58, y:18, mac:RES.mac, ip:RES.ip,
          listening:[{ port:53, service:'DNS', open:true }] }),
        N.server('web', { name:'Web Server', x:86, y:62, mac:WEB.mac, ip:WEB.ip,
          listening:[ { port:443, service:'HTTPS', open:true },
                      { port:80,  service:'HTTP',  open:true } ] })
      ],
      links: [ N.link('client','gw'), N.link('gw','res'), N.link('gw','web') ],
      hub:null, wire:null, banner:null,
      phase:null, rtt:0, done:[]
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var warm = cfg.warm;
    var rtt = 0;
    function add(st, tag){ st.done = st.done.concat([tag]); }

    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'info',
      title:'০. Enter চাপা হলো — URL ভাঙা হচ্ছে',
      what:'`https://example.com/` — Browser প্রথমে এটিকে টুকরো করে:\n\n• **scheme** `https` → port ৪৪৩, TLS লাগবে\n• **host** `example.com` → এর IP লাগবে\n• **path** `/` → কোন জিনিসটি চাই',
      why :'এখনো একটিও Packet যায়নি। এটি সম্পূর্ণ Browser-এর ভেতরের কাজ।\n\n`scheme`-টিই ঠিক করে দেয় পরের সব ধাপ কেমন হবে — `https` মানে ৪৪৩ নম্বর port, আর TLS-এর একটি বাড়তি স্তর।\n\nআর `host`-টিই পরের ধাপের প্রশ্ন তৈরি করে: এই নামের IP কী?',
      apply: function(st){ st.phase = 'parse'; st.banner = 'URL ভাঙা হলো'; }
    });

    /* ── ১. DNS ── */
    if(warm){
      steps.push({
        t:at(), actor:'client', layer:'L7', kind:'ok',
        title:'১. DNS — cache-এ ছিল, ০ RTT',
        what:'`example.com` → `' + WEB.ip + '` — Browser-এর নিজের cache-এই পাওয়া গেল।\n\nকোনো Packet পাঠাতে হলো না।',
        why :'এই একটি ধাপ বাদ যাওয়ায় পুরো একটি RTT (কখনো তিনটি) বেঁচে গেল।\n\nএখান থেকেই বোঝা যায় কেন দ্বিতীয়বার একই site খুললে এত দ্রুত মনে হয়। কাজ কমেনি — শুধু আগের কাজের ফল ধরে রাখা হয়েছে।',
        apply: function(st){ st.phase = 'dns'; add(st, 'DNS (cache)');
                             st.banner = 'DNS cache hit · 0 RTT'; }
      });
    } else {
      var dq = mk([ P.ethernet(CLI.mac, GW.mac, 'ip'),
                    P.ip(CLI.ip, RES.ip, 64, 'udp', 76),
                    { name:'UDP Header', layer:'L4', size:8,
                      fields:[['srcPort','49152'],['dstPort','53'],
                              ['ipLen','48 bytes'],['fcs','checksum']] },
                    { name:'DNS Query', layer:'L7', size:40,
                      fields:[['payload','QNAME=example.com QTYPE=A']] } ],
                  'DNS query', 'data', 'client', 'res');
      rtt++;
      steps.push({
        t:at(), actor:'client', layer:'L7', kind:'info',
        title:'১. DNS — নাম থেকে IP (১ RTT)', packet:dq,
        what:'Browser resolver-কে জিজ্ঞেস করল। উত্তর এলো `' + WEB.ip + '`।\n\nএটি UDP-তে গেল, TCP-তে নয়।',
        why :'লক্ষ্য করুন — এটি একটি **সম্পূর্ণ আলাদা কথোপকথন**, ভিন্ন server-এর সাথে, ভিন্ন protocol-এ (UDP), ভিন্ন port-এ (৫৩)।\n\nএখনো আসল website-এর সাথে একটিও শব্দ বিনিময় হয়নি।\n\nCache miss হলে resolver-কে Root → TLD → Authoritative ঘুরে আসতে হয় — তখন এই এক ধাপেই তিন RTT লেগে যেতে পারে।\n\n*(বিস্তারিত: DNS Resolution lab)*',
        apply: function(st){ st.wire = { pkt:dq, from:'client', to:'res' };
                             st.phase = 'dns'; st.rtt = rtt; add(st, 'DNS');
                             st.banner = 'DNS → ' + WEB.ip + ' · 1 RTT'; }
      });
    }

    /* ── ২. ARP ── */
    if(!warm){
      var ap = mk([ P.ethernet(CLI.mac, 'FF:FF:FF:FF:FF:FF', 'arp'),
                    P.arp(1, CLI.mac, CLI.ip, '00:00:00:00:00:00', GW.ip) ],
                  'ARP: কে ' + GW.ip + '?', 'arp', 'client', 'gw');
      steps.push({
        t:at(), actor:'client', layer:'L2', kind:'info',
        title:'২. ARP — Gateway-র MAC জানা দরকার', packet:ap,
        what:'IP পাওয়া গেছে, কিন্তু Frame পাঠাতে **MAC Address** লাগে।\n\n`' + WEB.ip + '` অন্য network-এ, তাই Frame যাবে **Gateway**-র MAC-এ। সেই MAC জানতে ARP।',
        why :'এখানে একটি গুরুত্বপূর্ণ ব্যাপার — ARP জিজ্ঞেস করা হচ্ছে **Gateway-র** MAC, web server-এর নয়।\n\nWeb server অন্য network-এ, তার MAC এই local link-এ কোনো কাজেই আসবে না।\n\nএটাই সেই মূল নিয়ম: **IP গন্তব্য পর্যন্ত অপরিবর্তিত থাকে, MAC প্রতিটি hop-এ বদলায়।**\n\n*(বিস্তারিত: ARP এবং Hop-by-Hop lab)*',
        apply: function(st){ st.wire = { pkt:ap, from:'client', to:'gw' };
                             st.phase = 'arp'; add(st, 'ARP');
                             st.banner = 'ARP → Gateway-র MAC'; }
      });
    }

    /* ── ৩. TCP ── */
    rtt++;
    var syn = mk([ P.ethernet(CLI.mac, GW.mac, 'ip'),
                   P.ip(CLI.ip, WEB.ip, 64, 'tcp', 40),
                   P.tcp(49152, 443, 1000, 0, 'SYN', 64240) ],
                 'SYN :443', 'ack', 'client', 'gw');
    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'info',
      title:'৩. TCP Handshake — ১ RTT', packet:syn,
      what:'SYN → SYN-ACK → ACK। Connection **ESTABLISHED**।\n\nএখনো কোনো application data যায়নি।',
      why :'তিনটি Packet, এক RTT — শুধু এটুকু নিশ্চিত করতে যে দুই পক্ষ পরস্পরকে শুনতে পাচ্ছে এবং sequence number-এ একমত।\n\nএই খরচটুকু অনিবার্য, কিন্তু **পুনর্ব্যবহারযোগ্য**। Keep-Alive দিয়ে একই connection বারবার ব্যবহার করলে পরের request গুলোতে এই খরচ আর লাগে না।\n\n*(বিস্তারিত: TCP Three-Way Handshake lab)*',
      apply: function(st){ st.wire = { pkt:syn, from:'client', to:'gw' };
                           st.phase = 'tcp'; st.rtt = rtt; add(st, 'TCP');
                           st.banner = 'TCP ESTABLISHED · ' + rtt + ' RTT'; }
    });

    /* ── ৪. NAT ── */
    var np = mk([ P.ethernet('GG:GG:GG:GG:GG:02', WEB.mac, 'ip'),
                  P.ip(GW.pub, WEB.ip, 63, 'tcp', 40),
                  P.tcp(60001, 443, 1000, 0, 'SYN', 64240) ],
                'NAT: → ' + GW.pub, 'data', 'gw', 'web');
    steps.push({
      t:at(), actor:'gw', layer:'L3', kind:'info',
      title:'৪. NAT — ঠিকানা বদলে গেল', packet:np,
      what:'Router source বদলে দিল:\n\n`192.168.1.10:49152` → `' + GW.pub + ':60001`\n\nআর TTL ৬৪ থেকে ৬৩ হলো।',
      why :'Private IP Internet-এ route হয় না, তাই বদলাতেই হবে।\n\nএখানে দুটি জিনিস একসাথে ঘটছে, আর দুটোই এই যাত্রার নিয়মিত অংশ:\n\n• **NAT** — source ঠিকানা বদল, যাতে উত্তর ফেরত আসতে পারে\n• **TTL কমানো** — প্রতিটি Router বাধ্যতামূলকভাবে এটি করে\n\nWeb server কখনোই জানবে না `192.168.1.10` বলে কেউ আছে।\n\n*(বিস্তারিত: NAT এবং TTL lab)*',
      apply: function(st){ st.wire = { pkt:np, from:'gw', to:'web' };
                           st.phase = 'nat'; add(st, 'NAT');
                           st.banner = 'NAT → ' + GW.pub + ':60001'; }
    });

    /* ── ৫. TLS ── */
    if(warm){
      steps.push({
        t:at(), actor:'client', layer:'L7', kind:'ok',
        title:'৫. TLS — Session Resumption, ০ RTT বাড়তি',
        what:'আগের connection-এর TLS session ticket ছিল। তাই পুরো handshake আবার করতে হলো না।\n\nবাড়তি খরচ প্রায় শূন্য।',
        why :'TLS 1.3-এর একটি বড় অর্জন এটি। আগে দেখা হয়েছে এমন server-এর সাথে সে **0-RTT** পর্যন্ত করতে পারে — অর্থাৎ handshake-এর সাথেই data পাঠিয়ে দেওয়া।\n\nএখান থেকেই বোঝা যায় আধুনিক optimization-এর মূল লক্ষ্য কী: RTT দ্রুত করা নয় (সেটি অসম্ভব), বরং **RTT-র সংখ্যা কমানো**।\n\n*(বিস্তারিত: TLS Handshake lab)*',
        apply: function(st){ st.phase = 'tls'; add(st, 'TLS (resume)');
                             st.banner = 'TLS resumed · 0 RTT'; }
      });
    } else {
      rtt++;
      var tp = mk([ P.ethernet(CLI.mac, GW.mac, 'ip'),
                    P.ip(CLI.ip, WEB.ip, 64, 'tcp', 300),
                    P.tcp(49152, 443, 1001, 5001, 'PSH, ACK', 64240),
                    { name:'TLS ClientHello', layer:'L7', size:250,
                      fields:[['payload','ClientHello · SNI=example.com · key share']] } ],
                  'ClientHello', 'data', 'client', 'web');
      steps.push({
        t:at(), actor:'client', layer:'L7', kind:'info',
        title:'৫. TLS Handshake — আরও ১ RTT', packet:tp,
        what:'ClientHello → ServerHello + Certificate → যাচাই → চাবি তৈরি।\n\nBrowser তিনটি জিনিস মিলিয়ে দেখল: সইকারী চেনা? নাম মেলে? মেয়াদ আছে?',
        why :'TLS 1.3-এ এটি **১ RTT** (TLS 1.2-এ ছিল ২)।\n\nএখানে গোপন চাবিটি কখনো network-এ যায় না — দুই পাশ আলাদাভাবে সেটি হিসাব করে বের করে।\n\nমনে রাখবেন TLS তিনটি জিনিস দেয়: গোপনীয়তা, অখণ্ডতা, আর পরিচয়। **Website-টি সৎ কিনা সে বিষয়ে সে কিছুই বলে না।**\n\n*(বিস্তারিত: TLS Handshake lab)*',
        apply: function(st){ st.wire = { pkt:tp, from:'client', to:'web' };
                             st.phase = 'tls'; st.rtt = rtt; add(st, 'TLS');
                             st.banner = 'TLS ✓ · ' + rtt + ' RTT'; }
      });
    }

    /* ── ৬. HTTP ── */
    rtt++;
    var hp = mk([ P.ethernet(CLI.mac, GW.mac, 'ip'),
                  P.ip(CLI.ip, WEB.ip, 64, 'tcp', 200),
                  P.tcp(49152, 443, 1300, 5300, 'PSH, ACK', 64240),
                  P.data('GET / HTTP/1.1  Host: example.com  (encrypted)') ],
                '🔒 GET /', 'data', 'client', 'web');
    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'ok',
      title:'৬. HTTP Request — অবশেষে আসল প্রশ্ন', packet:hp,
      what:'এতগুলো ধাপের পর এই প্রথম আসল request গেল:\n\n`GET / HTTP/1.1`\n`Host: example.com`\n\nএবং এটি এখন **encrypted**।',
      why :'এতক্ষণে মোট **' + rtt + ' RTT** খরচ হয়ে গেছে — একটি byte HTML আসার আগেই।\n\nServer যদি ১০০ ms দূরে হয়, তার মানে ' + (rtt * 100) + ' ms শুধু প্রস্তুতিতে।\n\nএই হিসাবটিই আধুনিক web performance-এর কেন্দ্রীয় সমস্যা, আর সব সমাধানই এই এক লক্ষ্যে:\n\n• **CDN** → দূরত্ব কমিয়ে প্রতিটি RTT ছোট করা\n• **Keep-Alive** → TCP handshake বারবার না করা\n• **TLS resumption** → TLS handshake বারবার না করা\n• **QUIC** → TCP আর TLS handshake একসাথে মিশিয়ে ফেলা\n\n*(বিস্তারিত: HTTP এবং Latency lab)*',
      apply: function(st){ st.wire = { pkt:hp, from:'client', to:'web' };
                           st.phase = 'http'; st.rtt = rtt; add(st, 'HTTP');
                           st.banner = 'GET / · মোট ' + rtt + ' RTT'; }
    });

    var rp = mk([ P.ethernet(WEB.mac, GW.mac, 'ip'),
                  P.ip(WEB.ip, GW.pub, 64, 'tcp', 1500),
                  P.tcp(443, 60001, 5300, 1400, 'PSH, ACK', 65535),
                  P.data('HTTP/1.1 200 OK  <html>… (encrypted)') ],
                '🔒 200 OK', 'ack', 'web', 'client');
    steps.push({
      t:at(), actor:'web', layer:'L7', kind:'ok',
      title:'৭. Response — 200 OK, HTML এলো', packet:rp,
      what:'Server `200 OK` দিল এবং HTML পাঠাল।\n\nউত্তরটি NAT Router-এ গিয়ে আবার `192.168.1.10:49152`-এ রূপান্তরিত হয়ে Browser-এ পৌঁছাল।',
      why :'HTML এলো, কিন্তু **কাজ শেষ হয়নি**।\n\nBrowser এবার HTML পড়বে, আর তাতে পাবে CSS, JavaScript, ছবি, font-এর তালিকা। প্রতিটির জন্য আবার request যাবে।\n\nভাগ্য ভালো, বেশিরভাগ ক্ষেত্রে সেগুলো **একই connection** ব্যবহার করবে (Keep-Alive), তাই handshake আর লাগবে না। আর CDN থেকে এলে দূরত্বও কম।\n\nএকটি সাধারণ page-এ ৫০-১০০টি এমন request হয়।\n\n*(বিস্তারিত: TCP Reliability এবং CDN lab)*',
      apply: function(st){ st.wire = { pkt:rp, from:'web', to:'client' };
                           st.phase = 'done'; add(st, 'Response');
                           st.banner = '200 OK · HTML এলো'; }
    });

    var tags = warm
      ? ['DNS (cache)','TCP','NAT','TLS (resume)','HTTP','Response']
      : ['DNS','ARP','TCP','NAT','TLS','HTTP','Response'];

    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'ok',
      title:'সম্পূর্ণ — মোট ' + rtt + ' RTT' + (warm ? ' (cache-এর কারণে কম)' : ''),
      what:'পুরো যাত্রা এক নজরে:\n\n`' + tags.join('` → `') + '`\n\nমোট **' + rtt + ' RTT**।',
      why : warm
        ? 'Cache থাকায় দুটি ধাপ প্রায় বিনামূল্যে হয়ে গেল — DNS আর TLS।\n\nএই তুলনাটিই দেখিয়ে দেয় কেন cache এত গুরুত্বপূর্ণ। কোনো কাজ দ্রুত হয়নি; কিছু কাজ **করতেই হয়নি**।\n\nএখন `সবকিছু আগে থেকে cache-এ আছে` বন্ধ করে দেখুন প্রথমবার কত বেশি কাজ লাগে।\n\nএবং একবার ভেবে দেখুন — এই পুরো ব্যবস্থাটি প্রতিদিন কোটি কোটি বার ঘটছে, প্রায় সবসময় নিখুঁতভাবে, আর কেউ টেরও পাচ্ছেন না।'
        : 'এই একটিমাত্র page load-এ যা যা জড়িত ছিল:\n\n**ছয়টি protocol** — DNS, ARP, IP, TCP, TLS, HTTP\n**চারটি যন্ত্র** — Browser, Router, DNS Resolver, Web Server\n**পাঁচটি স্তর** — L2 থেকে L7\n\nআর প্রতিটি স্তর তার নিচেরটির উপর সম্পূর্ণ নির্ভরশীল, অথচ **তার ভেতরের কিছুই জানে না**।\n\nএই অজ্ঞতাটাই আসলে সবচেয়ে বড় শক্তি। HTTP জানে না নিচে TCP আছে না QUIC। TCP জানে না নিচে fiber আছে না wifi। তাই প্রতিটি স্তর আলাদাভাবে বদলাতে পেরেছে — IPv6, TLS 1.3, HTTP/2, HTTP/3 — কখনো পুরো Internet একসাথে বদলাতে হয়নি।\n\nDebugging-এর সময় এই ক্রমটিই আপনার মানচিত্র। যেখানে থেমে যায়, সেখান থেকেই খোঁজা শুরু — নিচ থেকে উপরে।\n\n*(অনুশীলন: Break-It Mode lab-এ এক এক করে ভেঙে দেখুন)*',
      apply: function(st){ st.wire = null; st.rtt = rtt;
                           st.banner = 'সম্পূর্ণ · ' + rtt + ' RTT · ' + tags.length + ' ধাপ'; }
    });

    return steps;
  }
};

})(window.NetLab);
