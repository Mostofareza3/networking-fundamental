/* ═══════════════════════════════════════════════════════════════════
   LAB · CDN — দূরত্বই সমস্যা, তাই কাছে নিয়ে আসা
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var C_FIBER = 200000;
var FAR_KM = 12000, NEAR_KM = 50;

function pkt(sIp, dIp, label, from, to, kind){
  return P.make([
    P.ethernet('AA:AA:AA:AA:AA:AA', 'SS:SS:SS:SS:SS:SS', 'ip'),
    P.ip(sIp, dIp, 64, 'tcp', 500),
    P.tcp(49152, 443, 1, 1, 'PSH, ACK', 64240)
  ], { label:label, kind:kind || 'data', from:from, to:to });
}

NS.labs.cdn = {
  id: 'cdn',
  title: 'CDN — কাছের কপি',
  group: 'Phase 5 · Performance',
  chapter: 'ch46',
  blurb: 'আলোর গতি বাড়ানো যায় না। কিন্তু দূরত্ব কমানো যায় — সেটাই CDN-এর পুরো ধারণা।',

  learn: [
    'CDN ঠিক কোন সমস্যাটির সমাধান করে',
    'DNS কীভাবে আপনাকে কাছের edge server-এ পাঠায়',
    'Cache Hit আর Miss — edge-এ না থাকলে কী হয়',
    'কোন জিনিস CDN-এ রাখা যায়, কোনটি যায় না'
  ],

  mistakes: [
    { m:'CDN মানে শুধু একটি বড় cache।',
      r:'Cache তার একটি অংশ মাত্র। CDN-এর মূল অবদান হলো **ভৌগোলিক দূরত্ব কমানো** — কারণ latency-র সবচেয়ে বড় অংশ প্রায়ই propagation delay, যা কেবল দূরত্ব কমিয়েই কমানো সম্ভব।' },
    { m:'CDN দিয়ে সব কিছুই দ্রুত করা যায়।',
      r:'CDN **স্থির (static)** জিনিসে দুর্দান্ত — ছবি, CSS, JS, video। কিন্তু প্রতিটি ব্যবহারকারীর জন্য আলাদা তৈরি হওয়া content (dashboard, account page) edge-এ cache করা যায় না, কারণ সেটি সবার জন্য এক নয়।' },
    { m:'CDN ব্যবহার করলে মূল server আর লাগে না।',
      r:'মূল server (origin) **সত্যের উৎস** হিসেবে থাকতেই হয়। Edge-এ না থাকলে সে origin থেকে এনে দেয়, আর cache-এর মেয়াদ শেষ হলে আবার যাচাই করে। CDN origin-কে সরায় না, তার ভার কমায়।' }
  ],

  controls: [
    { key:'mode', type:'choice', label:'কোথা থেকে আসছে', def:'edge',
      options:[ ['origin','CDN নেই — সরাসরি origin থেকে'],
                ['edge','CDN আছে — Cache Hit'],
                ['miss','CDN আছে — কিন্তু Cache Miss'] ] }
  ],

  build: function(){
    return {
      devices: [
        N.pc('user', { name:'ব্যবহারকারী (ঢাকা)', x:12, y:50,
                       mac:'AA:AA:AA:AA:AA:AA', ip:'103.10.20.30' }),
        N.server('edge', { name:'CDN Edge (ঢাকা)', x:45, y:50,
                           mac:'EE:EE:EE:EE:EE:EE', ip:'103.10.99.1',
                           listening:[{ port:443, service:'HTTPS', open:true }],
                           note:'50 km দূরে' }),
        N.server('origin', { name:'Origin (আমেরিকা)', x:85, y:50,
                             mac:'SS:SS:SS:SS:SS:SS', ip:'93.184.216.34',
                             listening:[{ port:443, service:'HTTPS', open:true }],
                             note:'12,000 km দূরে' })
      ],
      links: [ N.link('user','edge'), N.link('edge','origin') ],
      hub:null, wire:null, banner:null,
      rtt:0, served:null, hit:null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }

    var farRtt  = Math.round((FAR_KM  / C_FIBER) * 1000 * 2);   /* 120 ms */
    var nearRtt = Math.round((NEAR_KM / C_FIBER) * 1000 * 2 * 10) / 10;  /* 0.5 ms */

    /* ── CDN ছাড়া ── */
    if(cfg.mode === 'origin'){
      var p1 = pkt('103.10.20.30', '93.184.216.34', '→ origin', 'user', 'origin');
      steps.push({
        t:at(), actor:'user', layer:'L4', kind:'warn',
        title:'সরাসরি origin-এ — ' + FAR_KM.toLocaleString('en-US') + ' km দূরে', packet:p1,
        what:'ঢাকা থেকে আমেরিকার server-এ request গেল। দূরত্ব প্রায় ' +
             FAR_KM.toLocaleString('en-US') + ' km।\n\nএক RTT ≈ **' + farRtt + ' ms**।',
        why :'এই ' + farRtt + ' ms-এর কোনো অংশই bandwidth দিয়ে কমানো যাবে না। এটি নিছক দূরত্ব ভাগ আলোর গতি।\n\nআর একটি page load-এ এই RTT বারবার লাগে:\n\n`DNS` + `TCP handshake` + `TLS handshake` + `HTTP request` ≈ ৪ RTT\n\n= প্রায় **' + (farRtt * 4) + ' ms** — প্রথম byte আসার আগেই।\n\nআধা সেকেন্ডের বেশি, শুধু আনুষ্ঠানিকতায়।',
        apply: function(st){ st.wire = { pkt:p1, from:'user', to:'origin' };
                             st.rtt = farRtt; st.banner = 'RTT ' + farRtt + ' ms'; }
      });
      var p2 = pkt('93.184.216.34', '103.10.20.30', 'content', 'origin', 'user', 'ack');
      steps.push({
        t:at(), actor:'origin', layer:'L7', kind:'warn',
        title:'উত্তর এলো — কিন্তু ' + farRtt + ' ms পরে', packet:p2,
        what:'Content পৌঁছাল, কিন্তু পুরো যাত্রাটি করতে হলো।\n\nআর page-এর প্রতিটি ছবি, CSS, JS-এর জন্য **একই দূরত্ব বারবার** পাড়ি দিতে হবে।',
        why :'এখানে দ্বিতীয় সমস্যাটিও আছে — origin server-এর উপর **পুরো পৃথিবীর ভার**।\n\nএকই ছবি হয়তো লক্ষ লক্ষ মানুষ চাইছেন, আর প্রতিবার সেটি আমেরিকা থেকে পাঠাতে হচ্ছে। Bandwidth-এর খরচ, server-এর ভার, সবই বাড়ছে।\n\nদুটি সমস্যাই একই কারণে — content আর ব্যবহারকারীর মাঝে বিশাল দূরত্ব।\n\n`CDN আছে` বেছে দেখুন এই দূরত্বটি কীভাবে ভেঙে ফেলা হয়।',
        apply: function(st){ st.wire = { pkt:p2, from:'origin', to:'user' };
                             st.served = 'origin';
                             st.banner = 'origin থেকে · ' + farRtt + ' ms'; }
      });
      return steps;
    }

    /* ── CDN আছে ── */
    steps.push({
      t:at(), actor:'user', layer:'L7', kind:'info',
      title:'DNS-ই আপনাকে কাছের edge-এ পাঠিয়ে দেয়',
      what:'আপনি `cdn.example.com` চাইলেন। DNS আপনার অবস্থান দেখে **ঢাকার** edge server-এর IP দিল — `103.10.99.1`।\n\nআমেরিকার কেউ একই নাম চাইলে সে পেত আমেরিকার edge-এর IP।',
      why :'এটাই CDN-এর সবচেয়ে চতুর অংশটি — **একই নাম, ভিন্ন উত্তর**।\n\nCDN-এর DNS server আপনার resolver-এর অবস্থান (বা EDNS Client Subnet) দেখে সিদ্ধান্ত নেয় কোন edge সবচেয়ে কাছে।\n\nএর ফলে ব্যবহারকারীর কিছুই বদলাতে হয় না। কোনো বিশেষ software নেই, কোনো setting নেই। সে শুধু একটি নাম চায়, আর কাছের কপিটি পেয়ে যায়।\n\n(আরেকটি পদ্ধতি আছে — Anycast, যেখানে একই IP পৃথিবীর বহু জায়গায় ঘোষণা করা হয় এবং routing নিজেই কাছেরটিতে পাঠায়।)',
      apply: function(st){ st.banner = 'DNS → কাছের edge'; }
    });

    var e1 = pkt('103.10.20.30', '103.10.99.1', '→ edge', 'user', 'edge');
    steps.push({
      t:at(), actor:'user', layer:'L4', kind:'ok',
      title:'Edge মাত্র ' + NEAR_KM + ' km দূরে — RTT ' + nearRtt + ' ms', packet:e1,
      what:'Request গেল ঢাকার edge server-এ। দূরত্ব ' + NEAR_KM + ' km।\n\nRTT ≈ **' + nearRtt + ' ms** — আগের ' + farRtt + ' ms-এর জায়গায়।',
      why :'দূরত্ব কমেছে প্রায় **' + Math.round(FAR_KM / NEAR_KM) + ' গুণ**, তাই propagation delay-ও তত গুণ কমেছে।\n\nএখানেই CDN-এর মূল যুক্তিটি স্পষ্ট হয়: **আলোর গতি বাড়ানো যায় না, কিন্তু দূরত্ব কমানো যায়।**\n\nআর যেহেতু একটি page load-এ কয়েক ডজন RTT লাগে, প্রতিটি RTT-তে ' + (farRtt - nearRtt).toFixed(1) + ' ms বাঁচানো মানে মোট সাশ্রয় বিশাল।',
      apply: function(st){ st.wire = { pkt:e1, from:'user', to:'edge' };
                           st.rtt = nearRtt; st.banner = 'RTT ' + nearRtt + ' ms'; }
    });

    /* ── Cache Miss ── */
    if(cfg.mode === 'miss'){
      var m1 = pkt('103.10.99.1', '93.184.216.34', '→ origin (miss)', 'edge', 'origin');
      steps.push({
        t:at(), actor:'edge', layer:'L7', kind:'warn',
        title:'Cache Miss — edge-এ এই জিনিসটি নেই', packet:m1,
        what:'Edge server-এর কাছে এই file-টি নেই (হয় কখনো চাওয়া হয়নি, নয় মেয়াদ শেষ)।\n\nতাই সে **নিজেই** origin-এ গিয়ে আনতে গেল।',
        why :'এই request-টি দুর্ভাগ্যজনক — তাকে পুরো দূরত্বটাই পাড়ি দিতে হচ্ছে, উল্টো edge-এ একটি বাড়তি ধাপও যোগ হয়েছে।\n\nকিন্তু এটি **একবারের খরচ**। Edge জিনিসটি এনে নিজের কাছে রেখে দেবে।\n\nএরপর এই অঞ্চলের বাকি সবাই — হাজার, লক্ষ মানুষ — সঙ্গে সঙ্গে পাবেন।\n\nCDN-এর সাফল্য মাপা হয় **cache hit ratio** দিয়ে। ৯৫% hit মানে প্রতি ২০টি request-এর মাত্র একটি origin পর্যন্ত যাচ্ছে।',
        apply: function(st){ st.wire = { pkt:m1, from:'edge', to:'origin' };
                             st.hit = false; st.rtt = farRtt + nearRtt;
                             st.banner = 'MISS → origin-এ যাচ্ছে'; }
      });
      var m2 = pkt('93.184.216.34', '103.10.99.1', 'content', 'origin', 'edge', 'ack');
      steps.push({
        t:at(), actor:'origin', layer:'L7', kind:'ok',
        title:'Origin দিল — Edge cache করে রাখল', packet:m2,
        what:'Origin content পাঠাল। Edge সেটি ব্যবহারকারীকে দিল, **এবং নিজের কাছে রেখেও দিল**।\n\nএই প্রথম ব্যবহারকারীর জন্য সময় লাগল প্রায় ' + (farRtt + nearRtt) + ' ms।',
        why :'পরের ব্যবহারকারী পাবেন মাত্র ' + nearRtt + ' ms-এ।\n\nএকজনের অপেক্ষা, বাকি সবার লাভ — DNS cache-এর মতোই একই ধারণা।\n\nCache কতক্ষণ থাকবে সেটি ঠিক করে HTTP-র `Cache-Control` header। এখানেও সেই চিরচেনা আপস: বড় মেয়াদ = কম origin ভার কিন্তু পুরনো content-এর ঝুঁকি।\n\nএই সমস্যার একটি সুন্দর সমাধান আছে — **content hashing**। File-এর নামেই তার বিষয়বস্তুর hash জুড়ে দেওয়া হয় (`app.a3f9c2.js`)। তখন file বদলালে নামও বদলায়, তাই cache-এর মেয়াদ এক বছর রাখলেও কোনো ঝুঁকি নেই।',
        apply: function(st){ st.wire = { pkt:m2, from:'origin', to:'edge' };
                             st.served = 'origin→edge';
                             st.banner = 'cache করা হলো · পরেরজন দ্রুত পাবেন'; }
      });
      return steps;
    }

    /* ── Cache Hit ── */
    var h1 = pkt('103.10.99.1', '103.10.20.30', 'content (HIT)', 'edge', 'user', 'ack');
    steps.push({
      t:at(), actor:'edge', layer:'L7', kind:'ok',
      title:'Cache Hit — origin পর্যন্ত যেতেই হলো না', packet:h1,
      what:'File-টি edge-এর কাছেই ছিল। সে সঙ্গে সঙ্গে পাঠিয়ে দিল।\n\n**Origin server এই request-এর কথা জানতেই পারল না।**',
      why :'দুটি লাভ একসাথে হলো:\n\n**১. ব্যবহারকারীর জন্য দ্রুত** — ' + farRtt + ' ms-এর বদলে ' + nearRtt + ' ms\n\n**২. Origin-এর ভার কম** — এই request তার কাছে পৌঁছায়ইনি\n\nদ্বিতীয়টি প্রায়ই কম আলোচিত হয়, অথচ সমান গুরুত্বপূর্ণ। জনপ্রিয় site-এ ৯০-৯৯% traffic edge-এই সামলে যায়। Origin তখন শুধু বিশেষ কাজগুলোর জন্য থাকে।\n\nএটি একটি বড় ঘটনার সময় বিশেষভাবে কাজে লাগে — হঠাৎ ভিড় বাড়লে edge গুলো সামলে নেয়, origin ভেঙে পড়ে না।',
      apply: function(st){ st.wire = { pkt:h1, from:'edge', to:'user' };
                           st.hit = true; st.served = 'edge';
                           st.banner = 'HIT · ' + nearRtt + ' ms'; }
    });

    steps.push({
      t:at(), actor:'user', layer:'L7', kind:'info',
      title:'কী CDN-এ রাখা যায়, কী যায় না',
      what:'CDN-এ ভালো কাজ করে **যা সবার জন্য এক**:\n\n• ছবি, video, font\n• CSS, JavaScript\n• অপরিবর্তনীয় API response\n\nCDN-এ কাজ করে না **যা প্রত্যেকের জন্য আলাদা**:\n\n• আপনার dashboard\n• Shopping cart\n• Login-পরবর্তী যেকোনো page',
      why :'পার্থক্যটি সহজ — **একই URL সবাইকে একই জিনিস দেয় কিনা**।\n\nদিলে cache করা যায়। না দিলে যায় না, কারণ edge তো জানে না কে চাইছে (এবং জানা উচিতও নয়)।\n\nএজন্যই আধুনিক site-এ প্রায়ই একটি ভাগাভাগি দেখা যায়:\n\n• **Static জিনিস** → CDN থেকে, দ্রুত\n• **ব্যক্তিগত data** → origin থেকে API call-এ\n\nএভাবে page-এর কাঠামোটি সঙ্গে সঙ্গে দেখা যায়, আর ব্যক্তিগত অংশটুকু পরে এসে বসে।\n\nমূল কথাটি মনে রাখুন: **CDN দূরত্বের সমস্যার সমাধান, গতির সমস্যার নয়।** দেরি যদি origin-এর ধীর database-এর কারণে হয়, CDN তাতে কিছুই করতে পারবে না।',
      apply: function(st){ st.wire = null; st.banner = 'static → edge · ব্যক্তিগত → origin'; }
    });

    return steps;
  }
};

})(window.NetLab);
