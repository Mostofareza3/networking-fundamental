/* ═══════════════════════════════════════════════════════════════════
   LAB · Longest Prefix Match — একাধিক route মিললে কে জেতে
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

/* বই-এর ch12-এর টেবিলটিই এখানে ব্যবহার করা হয়েছে */
var ROUTES = [
  { dst:'10.0.5.0', prefix:24, via:'Router A', iface:'eth1' },
  { dst:'10.0.0.0', prefix:16, via:'Router B', iface:'eth2' },
  { dst:'10.0.0.0', prefix:8,  via:'Router C', iface:'eth3' },
  { dst:'0.0.0.0',  prefix:0,  via:'Router D', iface:'eth0' }
];

NS.labs.lpm = {
  id: 'lpm',
  title: 'Longest Prefix Match',
  group: 'Phase 2 · Layer 3',
  chapter: 'ch12',
  blurb: 'একটি destination একসাথে অনেকগুলো route-এর সাথে মিলতে পারে। Router কোনটা বেছে নেবে, আর কেন?',

  learn: [
    'একটি destination কীভাবে একসাথে চারটি route-এর সাথে মিলতে পারে',
    'সবচেয়ে দীর্ঘ prefix কেন জেতে',
    'Default route `0.0.0.0/0` কেন সবার সাথেই মেলে, তবু সবার শেষে আসে',
    'কোনো route না মিললে কী হয়'
  ],

  mistakes: [
    { m:'Routing Table-এ যে route উপরে আছে সেটাই আগে প্রয়োগ হয়।',
      r:'ক্রম দিয়ে কিছু হয় না। Router সব মিল বের করে, তারপর যেটির prefix সবচেয়ে দীর্ঘ সেটিই বেছে নেয়। Table-এ কোন লাইন আগে লেখা তা অপ্রাসঙ্গিক।' },
    { m:'Default route থাকা মানে বাকি route গুলো অপ্রয়োজনীয়।',
      r:'Default route (`0.0.0.0/0`) সবার সাথে মেলে, কিন্তু তার prefix সবচেয়ে ছোট — তাই সে সবার শেষে। নির্দিষ্ট route থাকলে সেটিই জেতে; default শুধু "আর কিছু না মিললে" কাজে আসে।' }
  ],

  controls: [
    { key:'dst', type:'choice', label:'Destination IP', def:'10.0.5.20',
      options:[ ['10.0.5.20','10.0.5.20 — চারটিই মিলবে'],
                ['10.0.9.7','10.0.9.7 — /24 মিলবে না'],
                ['10.7.7.7','10.7.7.7 — শুধু /8 আর default'],
                ['203.0.113.5','203.0.113.5 — শুধু default'] ],
      help:'প্রতিটিতে দেখুন কয়টি route মেলে আর শেষে কে জেতে।' },
    { key:'nodefault', type:'toggle', label:'Default route মুছে দিন', def:false,
      help:'Default route না থাকলে অচেনা গন্তব্যের Packet-এর কী হয়?' }
  ],

  build: function(cfg){
    var routes = ROUTES.slice();
    if(cfg.nodefault) routes = routes.filter(function(r){ return r.prefix !== 0; });

    var rt = N.router('r1', { name:'Router', x:50, y:50, routes:routes,
      ifaces:[{ name:'eth0', ip:'10.0.0.1', mac:'RR:RR:RR:RR:RR:RR', mask:'255.0.0.0' }] });

    return {
      devices: [
        N.pc('client', { name:'Client', x:12, y:50, mac:'AA:AA:AA:AA:AA:AA', ip:'10.0.1.9' }),
        rt,
        N.server('a', { name:'Router A', x:88, y:16, mac:'A1:A1:A1:A1:A1:A1', ip:'10.0.5.1' }),
        N.server('b', { name:'Router B', x:88, y:38, mac:'B1:B1:B1:B1:B1:B1', ip:'10.0.9.1' }),
        N.server('c', { name:'Router C', x:88, y:62, mac:'C1:C1:C1:C1:C1:C1', ip:'10.7.0.1' }),
        N.server('d', { name:'Router D', x:88, y:84, mac:'D1:D1:D1:D1:D1:D1', ip:'203.0.113.1' })
      ],
      links: [ N.link('client','r1'), N.link('r1','a'), N.link('r1','b'),
               N.link('r1','c'), N.link('r1','d') ],
      hub: null, wire: null, banner: null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }

    var dst = cfg.dst;
    var routes = ROUTES.slice();
    if(cfg.nodefault) routes = routes.filter(function(r){ return r.prefix !== 0; });

    var res = N.lpm(dst, routes);
    var pkt = P.make([
      P.ethernet('AA:AA:AA:AA:AA:AA', 'RR:RR:RR:RR:RR:RR', 'ip'),
      P.ip('10.0.1.9', dst, 64, 'tcp', 60),
      P.tcp(51000, 443, 1, 0, 'SYN', 64240)
    ], { label:'Packet → ' + dst, kind:'data', from:'client', to:'r1' });

    steps.push({
      t:at(), actor:'client', layer:'L3', kind:'info',
      title:'Packet Router-এ পৌঁছাল', packet:pkt,
      what:'একটি Packet এসেছে যার destination IP `' + dst + '`। Router-কে এখন ঠিক করতে হবে এটি কোন দিকে পাঠাবে।',
      why :'Router-এর কাছে ' + routes.length + 'টি route আছে। সে একটা একটা করে দেখবে — এই destination কি এই route-এর সাথে মেলে?',
      apply: function(st){ st.wire = { pkt:pkt, from:'client', to:'r1' }; st.banner = 'গন্তব্য ' + dst; }
    });

    /* প্রতিটি route আলাদা ধাপে যাচাই — শেখার জন্য এটাই আসল অংশ */
    for(var i = 0; i < routes.length; i++){
      (function(r){
        var hit = res.matches.indexOf(r) !== -1;
        steps.push({
          t:at(), actor:'r1', layer:'L3', kind: hit ? 'ok' : 'warn',
          title:(hit ? '✓ মিলছে — ' : '✗ মিলছে না — ') + r.dst + '/' + r.prefix,
          what:'`' + r.dst + '/' + r.prefix + '` (via ' + r.via + ') যাচাই করা হলো: ' +
               (hit ? '**মিলছে**।' : '**মিলছে না**।'),
          why : r.prefix === 0
            ? 'Default route-এর prefix `0` — অর্থাৎ ০টি bit মিলতে হবে, যা সবসময়ই সত্য। তাই এটি **সব destination-এর সাথেই মেলে**।\n\nকিন্তু ঠিক এই কারণেই সে সবচেয়ে দুর্বল প্রার্থী — সে আসলে কিছুই "জানে" না।'
            : 'প্রথম ' + r.prefix + 'টি bit মেলাতে হবে।\n\n`' + dst + '` = `' + N.bits(dst) + '`\n`' + r.dst + '` = `' + N.bits(r.dst) + '`\n\n' +
              (hit ? 'প্রথম ' + r.prefix + 'টি bit মিলে গেছে, তাই এই route-টি প্রার্থী তালিকায় থাকল।'
                   : 'প্রথম ' + r.prefix + 'টি bit-এর মধ্যেই পার্থক্য আছে, তাই এই route বাদ।'),
          apply: function(st){ st.banner = r.dst + '/' + r.prefix + (hit ? ' ✓' : ' ✗'); }
        });
      })(routes[i]);
    }

    /* ── কোনো route না মিললে ── */
    if(!res.best){
      steps.push({
        t:at(), actor:'r1', layer:'L3', kind:'error',
        title:'কোনো route মিলল না — Packet drop',
        what:'`' + dst + '`-এর জন্য একটিও route নেই, আর default route-ও মুছে দেওয়া হয়েছে। তাই Router Packet-টি ফেলে দিল।',
        why :'Router শুধু তা-ই করতে পারে যা তার table-এ লেখা আছে। কোথায় পাঠাতে হবে না জানলে সে অনুমান করে না — Packet ফেলে দেয়।\n\nএরপর সে সাধারণত প্রেরককে একটি ICMP **Destination Unreachable — Network** বার্তা পাঠায়, যাতে প্রেরক বুঝতে পারে কী হয়েছে।',
        apply: function(st){ st.wire = null; st.banner = 'No route to host'; }
      });
      return steps;
    }

    var best = res.best;
    var target = { 'Router A':'a', 'Router B':'b', 'Router C':'c', 'Router D':'d' }[best.via];

    steps.push({
      t:at(), actor:'r1', layer:'L3', kind:'ok',
      title:'সবচেয়ে দীর্ঘ prefix জিতল — /' + best.prefix,
      what: res.matches.length > 1
        ? '**' + res.matches.length + 'টি route** মিলেছিল, কিন্তু `' + best.dst + '/' + best.prefix + '` সবচেয়ে নির্দিষ্ট। তাই Packet যাবে **' + best.via + '**-এর দিকে।'
        : 'মাত্র একটি route মিলেছে — `' + best.dst + '/' + best.prefix + '`। তাই Packet যাবে **' + best.via + '**-এর দিকে।',
      why : res.matches.length > 1
        ? 'যে route যত বেশি bit মিলিয়েছে, সে গন্তব্য সম্পর্কে তত বেশি "জানে"। `/' + best.prefix + '` মানে ' + best.prefix + 'টি bit মিলেছে — এটাই সবচেয়ে কঠিন শর্ত, তাই এর সিদ্ধান্তই সবচেয়ে নির্ভরযোগ্য।\n\nলক্ষ্য করুন — Table-এ কোন route আগে লেখা ছিল তাতে কিছুই যায় আসেনি। শুধু prefix-এর দৈর্ঘ্যই সব ঠিক করেছে।'
        : 'অন্য কোনো route এই destination-এর সাথে মেলেনি, তাই প্রতিযোগিতাই হলো না।',
      apply: function(st){ st.wire = { pkt:pkt, from:'r1', to:target }; st.banner = best.via + ' জিতল (/' + best.prefix + ')'; }
    });

    return steps;
  }
};

})(window.NetLab);
