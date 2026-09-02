/* ═══════════════════════════════════════════════════════════════════
   LAB · Router Queue — ভিড় জমলে কী হয়
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var QCAP = 6;      /* Router-এর queue-তে সর্বোচ্চ কত Packet ধরে */

function pkt(n, label, from, to, kind){
  return P.make([
    P.ethernet('AA:AA:AA:AA:AA:AA', '11:11:11:11:11:11', 'ip'),
    P.ip('192.168.1.10', '93.184.216.34', 64, 'tcp', 1500),
    P.tcp(49152, 443, n * 1500, 1, 'PSH, ACK', 64240)
  ], { label:label, kind:kind || 'data', from:from, to:to });
}

NS.labs.queue = {
  id: 'queue',
  title: 'Router Queue & Packet Loss',
  group: 'Phase 5 · Performance',
  chapter: 'ch38',
  blurb: 'Packet কোথায় হারায়? প্রায় সবসময় কোনো Router-এর ভরে যাওয়া queue-তে।',

  learn: [
    'Queue কেন দরকার — এবং কেন সে সীমিত',
    'Tail Drop কী — queue ভরলে কে বাদ পড়ে',
    'Bufferbloat — বড় queue কেন সমাধান নয়, বরং নতুন সমস্যা',
    'Packet loss আসলে congestion-এর সংকেত, ব্যর্থতা নয়'
  ],

  mistakes: [
    { m:'Router-এর queue বড় করলে packet loss কমবে, তাই ভালো হবে।',
      r:'Loss কমবে ঠিকই, কিন্তু বিনিময়ে **latency ভয়াবহ বেড়ে যাবে** — Packet গুলো ফেলে দেওয়ার বদলে দীর্ঘ লাইনে দাঁড়িয়ে থাকবে। একে বলে **Bufferbloat**। TCP loss দেখে গতি কমায়; loss না পেলে সে বুঝতেই পারে না যে থামা দরকার, তাই আরও পাঠাতে থাকে।' },
    { m:'Packet loss মানে network-এ কিছু নষ্ট হয়ে গেছে।',
      r:'বেশিরভাগ loss কোনো ত্রুটি নয় — এটি একটি **সচেতন সিদ্ধান্ত**। Router-এর queue ভরে গেছে, তাই সে নতুন Packet ফেলে দিচ্ছে। এই ফেলে দেওয়াটাই TCP-কে বলে দেয় "আস্তে পাঠাও" — এটি network-এর নিজস্ব সংকেত ব্যবস্থা।' },
    { m:'Packet loss শতাংশে কম হলে তার প্রভাবও কম।',
      r:'১% loss-ও TCP-র throughput নাটকীয়ভাবে কমিয়ে দিতে পারে, কারণ প্রতিটি loss-এ সে congestion window অর্ধেক করে ফেলে। দীর্ঘ দূরত্বে (বড় RTT) এই ক্ষতি আরও বেশি, কারণ window আবার বড় হতে অনেক সময় লাগে।' }
  ],

  controls: [
    { key:'rate', type:'choice', label:'কত দ্রুত আসছে', def:'burst',
      options:[ ['steady','Router যত পারে, ততই আসছে'],
                ['burst','Router যা পারে তার চেয়ে বেশি আসছে'] ] },
    { key:'bigbuf', type:'toggle', label:'Queue তিন গুণ বড় করে দিন', def:false,
      help:'Loss কমে যাবে — কিন্তু তার বদলে কী হয় সেটিই আসল প্রশ্ন।' }
  ],

  build: function(cfg){
    var cap = (cfg && cfg.bigbuf) ? QCAP * 3 : QCAP;
    return {
      devices: [
        N.pc('client', { name:'Sender', x:14, y:50, mac:'AA:AA:AA:AA:AA:AA',
                         ip:'192.168.1.10', note:'পাঠাচ্ছে' }),
        N.router('r1', { name:'Router', x:50, y:50,
          ifaces:[{ name:'eth0', ip:'10.0.0.1', mac:'11:11:11:11:11:11',
                    mask:'255.255.255.0' }],
          note:'queue 0/' + cap }),
        N.server('srv', { name:'Server', x:86, y:50, mac:'SS:SS:SS:SS:SS:SS',
          ip:'93.184.216.34',
          listening:[{ port:443, service:'HTTPS', open:true }] })
      ],
      links: [ N.link('client','r1'), N.link('r1','srv') ],
      hub:null, wire:null, banner:null,
      q:0, cap:cap, dropped:0, sent:0, delivered:0, wait:0
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var cap = cfg.bigbuf ? QCAP * 3 : QCAP;
    /* Router প্রতি "ধাপে" একটি Packet ছাড়তে পারে; burst-এ দুটি আসে */
    var inRate = cfg.rate === 'burst' ? 2 : 1;
    var q = 0, dropped = 0, sent = 0, delivered = 0;

    function note(st, qq){
      for(var i = 0; i < st.devices.length; i++)
        if(st.devices[i].id === 'r1')
          st.devices[i].note = 'queue ' + qq + '/' + cap;
    }

    steps.push({
      t:at(), actor:'r1', layer:'L3', kind:'info',
      title:'Queue কেন দরকার',
      what:'Router-এর সামনের লাইনটি (queue) ধরে রাখতে পারে সর্বোচ্চ **' + cap + 'টি** Packet।\n\nএই Router প্রতি একক সময়ে **একটি** Packet এগিয়ে দিতে পারে।',
      why :'Queue না থাকলে কী হতো? Router যখন একটি Packet পাঠাতে ব্যস্ত, ঠিক তখন আরেকটি এলে সেটি **সঙ্গে সঙ্গে ফেলে দিতে** হতো।\n\nকিন্তু traffic কখনো সমান তালে আসে না — সে ঝাঁকে ঝাঁকে আসে। মুহূর্তের জন্য বেশি এলেও পরের মুহূর্তে কম আসতে পারে।\n\nQueue এই ওঠানামা সামলায়। এটি একটি **সাময়িক ভিড় শোষণের ব্যবস্থা**।\n\nকিন্তু এটি সাময়িক ভিড়ের জন্য — **স্থায়ী ভিড়ের জন্য নয়**। এই পার্থক্যটিই পরের ধাপগুলোতে স্পষ্ট হবে।',
      apply: function(st){ st.banner = 'queue ধারণক্ষমতা ' + cap; }
    });

    /* ── কয়েক দফা traffic ── */
    var rounds = 6;
    for(var r = 0; r < rounds; r++){
      (function(round){
        var arriving = inRate, thisDrop = 0, accepted = 0;
        for(var k = 0; k < arriving; k++){
          sent++;
          if(q < cap){ q++; accepted++; }
          else { dropped++; thisDrop++; }
        }
        /* Router একটি ছাড়ল */
        var served = 0;
        if(q > 0){ q--; served = 1; delivered++; }

        var qNow = q, dNow = dropped, wait = q;   /* queue দৈর্ঘ্যই অপেক্ষার মাপ */
        var p = pkt(round + 1, thisDrop ? 'drop ✗' : 'queue-এ',
                    'client', 'r1', thisDrop ? 'data' : 'data');

        steps.push({
          t:at(), actor: thisDrop ? 'r1' : 'client', layer:'L3',
          kind: thisDrop ? 'error' : (qNow >= cap - 1 ? 'warn' : 'info'),
          title: thisDrop
            ? 'Queue ভরা — ' + thisDrop + 'টি Packet ফেলে দেওয়া হলো'
            : arriving + 'টি এলো, ১টি এগিয়ে গেল — queue ' + qNow + '/' + cap,
          packet:p,
          what: thisDrop
            ? 'Queue-তে আর জায়গা নেই (' + cap + '/' + cap + ')। নতুন আসা ' + thisDrop +
              'টি Packet **ফেলে দেওয়া হলো**।\n\nএখন পর্যন্ত মোট drop: ' + dNow + 'টি।'
            : 'এই দফায় ' + arriving + 'টি Packet এলো, Router ' + served +
              'টি এগিয়ে দিল। Queue-তে এখন **' + qNow + '/' + cap + '**।',
          why : thisDrop
            ? 'একে বলে **Tail Drop** — লাইনের শেষে যে এসেছে সে-ই বাদ পড়ল।\n\nএটি নিষ্ঠুর মনে হলেও Router-এর আর কোনো উপায় নেই। তার স্মৃতি সীমিত, লাইন ভরে গেছে।\n\nএখানে একটি গভীর কথা আছে: **এই drop-টাই আসলে একটি বার্তা**।\n\nRouter কোনো নালিশ পাঠায় না, কিছুই বলে না। কিন্তু sender যখন দেখে ACK আসছে না, সে বুঝে যায় network-এ ভিড়। তখন সে নিজে থেকেই গতি কমিয়ে দেয়।\n\nএভাবেই Internet নিজেকে সামলায় — কোনো কেন্দ্রীয় নিয়ন্ত্রক নেই, শুধু হারানো Packet-এর নীরব সংকেত।'
            : (qNow >= cap - 1
                ? 'Queue প্রায় ভরে এসেছে। এখানে দুটি জিনিস একসাথে ঘটছে:\n\n• পরের Packet drop হওয়ার ঝুঁকি বাড়ছে\n• **যারা লাইনে আছে তাদের অপেক্ষাও বাড়ছে**\n\nদ্বিতীয়টি প্রায়ই খেয়াল করা হয় না। লম্বা queue মানে প্রতিটি Packet-কে বেশিক্ষণ দাঁড়াতে হচ্ছে — অর্থাৎ latency বাড়ছে।'
                : (inRate > 1
                    ? 'আসছে ' + arriving + 'টি, যাচ্ছে ' + served + 'টি। পার্থক্যটি queue-তে জমছে।\n\nএটি একটি সরল কিন্তু নির্মম হিসাব: **আসার হার > যাওয়ার হার** হলে queue বাড়তেই থাকবে। কতক্ষণে ভরবে সেটা শুধু সময়ের ব্যাপার।'
                    : 'যতটা আসছে ততটাই যাচ্ছে, তাই queue জমছে না। এটিই সুস্থ অবস্থা।\n\n`Router যা পারে তার চেয়ে বেশি আসছে` বেছে দেখুন কী হয়।')),
          apply: function(st){
            st.wire = { pkt:p, from:'client', to:'r1' };
            st.q = qNow; st.dropped = dNow; st.sent = sent; st.delivered = delivered;
            st.wait = wait;
            note(st, qNow);
            st.banner = 'queue ' + qNow + '/' + cap +
                        (dNow ? ' · drop ' + dNow : '');
          }
        });
      })(r);
    }

    /* ── সারাংশ ── */
    var lossPct = Math.round(dropped / sent * 100);
    steps.push({
      t:at(), actor:'r1', layer:'L3', kind: dropped ? 'warn' : 'ok',
      title: dropped ? 'ফলাফল: ' + lossPct + '% packet loss, queue-তে ' + q + 'টি অপেক্ষায়'
                     : 'ফলাফল: কোনো loss নেই',
      what:'পাঠানো হয়েছে **' + sent + '**টি, পৌঁছেছে **' + delivered + '**টি, ফেলে দেওয়া হয়েছে **' + dropped + '**টি।\n\nQueue-তে এখনো **' + q + '**টি অপেক্ষা করছে।',
      why : cfg.bigbuf
        ? '**এখানেই Bufferbloat-এর ফাঁদটি স্পষ্ট হয়।**\n\nQueue তিন গুণ বড় করায় drop কমেছে — শুনতে ভালোই লাগে।\n\nকিন্তু দেখুন queue-তে কতগুলো Packet দাঁড়িয়ে আছে: **' + q + 'টি**। এদের প্রত্যেককে নিজের পালার জন্য অপেক্ষা করতে হচ্ছে।\n\nএর ফল দুটি, দুটিই খারাপ:\n\n**১. Latency বেড়ে যায়** — Packet হারায় না ঠিকই, কিন্তু পৌঁছাতে অনেক দেরি হয়। Video call কেঁপে যায়, game-এ ping লাফায়, ssh-এ typing পিছিয়ে যায়।\n\n**২. TCP অন্ধ হয়ে যায়** — এটিই বেশি ভয়ংকর। TCP loss দেখে বোঝে কখন থামতে হবে। Loss না পেলে সে ভাবে সব ঠিক আছে, আর **আরও বেশি পাঠাতে থাকে** — queue আরও ভরে।\n\nএজন্যই আধুনিক সমাধান বড় buffer নয়, বরং **স্মার্ট queue** (CoDel, FQ-CoDel) — যা ইচ্ছা করে আগেভাগে Packet ফেলে দেয়, যাতে TCP সময়মতো সংকেত পায়।\n\nএকটি চমকপ্রদ উপসংহার: **সময়মতো Packet ফেলে দেওয়াই ভালো ব্যবহার।**'
        : (dropped
            ? 'Loss-কে ব্যর্থতা ভাবার দরকার নেই — এটি network-এর **সংকেত ব্যবস্থা**।\n\nRouter বলছে: "আমার ধারণক্ষমতার বেশি পাঠানো হচ্ছে।" TCP এই সংকেত পেয়ে গতি কমাবে, আর ভারসাম্য ফিরে আসবে।\n\nএটি ছাড়া Internet কাজ করত না। কোনো কেন্দ্রীয় নিয়ন্ত্রক নেই যে সবাইকে বলে দেবে কত জোরে পাঠাতে হবে। প্রত্যেকে নিজে থেকে টের পায় এবং মানিয়ে নেয়।\n\nএবার `Queue তিন গুণ বড় করে দিন` চালু করে দেখুন — drop কমবে, কিন্তু বিনিময়ে কী হারাবেন।'
            : 'আসার হার আর যাওয়ার হার সমান, তাই queue জমেনি, কিছু হারায়নি।\n\nএটিই সুস্থ অবস্থা — এবং বেশিরভাগ সময় network এমনই থাকে।'),
      apply: function(st){ st.wire = null;
                           st.banner = dropped ? lossPct + '% loss · queue ' + q
                                               : 'কোনো loss নেই'; }
    });

    return steps;
  }
};

})(window.NetLab);
