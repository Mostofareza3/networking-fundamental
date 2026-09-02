/* ═══════════════════════════════════════════════════════════════════
   LAB · Load Balancer — ভার ভাগ করে নেওয়া
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var VIP = '203.0.113.10';                /* Load Balancer-এর public IP */
var BACKENDS = [
  { id:'s1', name:'Server 1', ip:'10.0.0.11', mac:'S1:S1:S1:S1:S1:S1', y:20 },
  { id:'s2', name:'Server 2', ip:'10.0.0.12', mac:'S2:S2:S2:S2:S2:S2', y:50 },
  { id:'s3', name:'Server 3', ip:'10.0.0.13', mac:'S3:S3:S3:S3:S3:S3', y:80 }
];

function pkt(sIp, dIp, label, from, to, kind){
  return P.make([
    P.ethernet('AA:AA:AA:AA:AA:AA', 'LL:LL:LL:LL:LL:LL', 'ip'),
    P.ip(sIp, dIp, 64, 'tcp', 200),
    P.tcp(49152, 443, 1, 1, 'PSH, ACK', 64240)
  ], { label:label, kind:kind || 'data', from:from, to:to });
}

NS.labs.lb = {
  id: 'lb',
  title: 'Load Balancer',
  group: 'Phase 5 · Performance',
  chapter: 'ch47',
  blurb: 'একটি IP, পেছনে অনেক server। কে কোনটিতে যাবে — এবং একটি মরে গেলে কী হয়?',

  learn: [
    'Load Balancer কীভাবে request বণ্টন করে',
    'Health Check কী এবং কেন এটিই সবচেয়ে গুরুত্বপূর্ণ অংশ',
    'Sticky Session কী — এবং কেন এটি এড়ানোই ভালো',
    'Stateless নকশা কেন scaling-এর পূর্বশর্ত'
  ],

  mistakes: [
    { m:'Load Balancer শুধু ভার সমান করে ভাগ করে।',
      r:'ভাগ করাটা একটি কাজ, কিন্তু প্রায়ই **বেশি মূল্যবান কাজটি হলো অসুস্থ server বাদ দেওয়া**। Health check ছাড়া load balancer অকেজো — সে নিয়মিত মরে যাওয়া server-এও request পাঠাতে থাকবে।' },
    { m:'Sticky Session ভালো, কারণ ব্যবহারকারী একই server পান।',
      r:'Sticky session একটি **আপস, সুবিধা নয়**। এটি ভার অসমান করে দেয়, আর ওই server মরে গেলে সেই ব্যবহারকারীদের session হারিয়ে যায়। ভালো সমাধান হলো session-কে বাইরে (Redis, database) রাখা, যাতে যেকোনো server যে কাউকে সামলাতে পারে।' },
    { m:'Load Balancer থাকলে আর কোনো single point of failure নেই।',
      r:'Load Balancer **নিজেই** একটি single point of failure হয়ে যায়। এজন্য বাস্তবে load balancer-ও জোড়ায় থাকে (active-passive বা active-active), আর তার উপরে DNS বা Anycast দিয়ে আরেকটি স্তর যোগ করা হয়।' }
  ],

  controls: [
    { key:'algo', type:'choice', label:'বণ্টনের নিয়ম', def:'rr',
      options:[ ['rr','Round Robin — পালা করে'],
                ['sticky','Sticky — একই client একই server-এ'] ] },
    { key:'fail', type:'toggle', label:'Server 2 মরে গেছে', def:false,
      help:'Health check কী করে — সেটিই এই lab-এর সবচেয়ে গুরুত্বপূর্ণ অংশ।' }
  ],

  build: function(cfg){
    var devs = [ N.pc('client', { name:'Clients', x:10, y:50,
      mac:'AA:AA:AA:AA:AA:AA', ip:'203.0.113.99', note:'অনেক request' }) ];
    devs.push(N.router('lb', { name:'Load Balancer', x:42, y:50,
      ifaces:[{ name:'vip', ip:VIP, mac:'LL:LL:LL:LL:LL:LL', mask:'255.255.255.0' }],
      routes:[{ dst:'10.0.0.0', prefix:24, via:'', iface:'lan' }],
      note:(cfg && cfg.fail ? '2' : '3') + ' server সুস্থ' }));
    for(var i = 0; i < BACKENDS.length; i++){
      var b = BACKENDS[i];
      var dead = cfg && cfg.fail && b.id === 's2';
      devs.push(N.server(b.id, { name:b.name, x:80, y:b.y, mac:b.mac, ip:b.ip,
        listening:[{ port:443, service:'HTTPS', open:!dead }],
        note: dead ? '✗ মৃত' : 'সুস্থ' }));
    }
    return {
      devices: devs,
      links: [ N.link('client','lb'), N.link('lb','s1'),
               N.link('lb','s2'), N.link('lb','s3') ],
      hub:null, wire:null, banner:null,
      counts:{ s1:0, s2:0, s3:0 }, healthy:['s1','s2','s3'], failed:0
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var dead = cfg.fail;

    steps.push({
      t:at(), actor:'lb', layer:'L4', kind:'info',
      title:'একটি IP, পেছনে তিনটি server',
      what:'বাইরের সবাই শুধু একটি ঠিকানা জানে — `' + VIP + '` (Virtual IP)।\n\nপেছনে যে তিনটি server আছে, তা কেউ জানে না।',
      why :'এই আড়াল করাটাই মূল কথা।\n\nএর ফলে পেছনে যা খুশি বদলানো যায় — server যোগ করা, সরানো, আপডেট করা — বাইরের কারো কিছু বদলাতে হয় না।\n\nবিশেষ করে **deploy**-এর সময় এটি অমূল্য। এক এক করে server load balancer থেকে সরিয়ে, আপডেট করে, আবার যোগ করা যায়। কোনো ব্যবহারকারী টের পান না।',
      apply: function(st){ st.banner = 'VIP ' + VIP + ' → ৩টি server'; }
    });

    /* ── Health check ── */
    if(dead){
      steps.push({
        t:at(), actor:'lb', layer:'L4', kind:'error',
        title:'Health Check ব্যর্থ — Server 2 উত্তর দিচ্ছে না',
        what:'Load Balancer নিয়মিত প্রতিটি server-কে ছোট একটি request পাঠায় — "তুমি ঠিক আছ?"\n\nServer 2 পরপর কয়েকবার উত্তর দিল না। তাই তাকে **তালিকা থেকে বাদ** দেওয়া হলো।',
        why :'**এটিই load balancer-এর সবচেয়ে মূল্যবান কাজ।**\n\nHealth check ছাড়া সে প্রতি তিনটির একটি request একটি মৃত server-এ পাঠাত। ফলে এক-তৃতীয়াংশ ব্যবহারকারী error দেখতেন — অথচ দুটি server দিব্যি চালু আছে।\n\nকয়েকবার ব্যর্থ হলে তবেই বাদ দেওয়া হয়, একবারে নয় — কারণ একটি ব্যর্থতা নিছক সাময়িক গোলযোগ হতে পারে। বারবার ব্যর্থতাই প্রকৃত সমস্যার প্রমাণ।\n\nআর health check-এর মান কতটা গভীর হবে সেটি একটি সিদ্ধান্ত:\n\n• শুধু TCP port খোলা কিনা — দ্রুত, কিন্তু অগভীর\n• একটি `/health` endpoint — application সত্যিই কাজ করছে কিনা দেখে\n• Database পর্যন্ত যাচাই — সবচেয়ে গভীর, কিন্তু ঝুঁকিও আছে (database ধীর হলে সব server একসাথে "অসুস্থ" হয়ে যেতে পারে)',
        apply: function(st){
          st.healthy = ['s1','s3'];
          for(var i = 0; i < st.devices.length; i++){
            if(st.devices[i].id === 's2') st.devices[i].note = '✗ বাদ দেওয়া হলো';
            if(st.devices[i].id === 'lb') st.devices[i].note = '2 server সুস্থ';
          }
          st.banner = 'Server 2 বাদ · ২টি সুস্থ';
        }
      });
    }

    /* ── request বণ্টন ── */
    var pool = dead ? ['s1','s3'] : ['s1','s2','s3'];
    var counts = { s1:0, s2:0, s3:0 };
    var N_REQ = 6;

    for(var r = 0; r < N_REQ; r++){
      (function(idx){
        /* Round Robin: পালা করে; Sticky: client-এর hash দিয়ে স্থির */
        var target = cfg.algo === 'sticky'
          ? pool[0]                       /* একই client, তাই সবসময় একই server */
          : pool[idx % pool.length];
        counts[target]++;
        var snap = { s1:counts.s1, s2:counts.s2, s3:counts.s3 };
        var b = BACKENDS.filter(function(x){ return x.id === target; })[0];

        var p = pkt('203.0.113.99', b.ip, '→ ' + b.name, 'lb', target);
        steps.push({
          t:at(), actor:'lb', layer:'L4',
          kind: cfg.algo === 'sticky' && idx === N_REQ - 1 ? 'warn' : 'ok',
          title:'Request ' + (idx + 1) + ' → ' + b.name, packet:p,
          what:'Load Balancer request ' + (idx + 1) + ' পাঠাল `' + b.name + '` (`' + b.ip + '`)-এ।\n\nএ পর্যন্ত বণ্টন: `S1=' + snap.s1 + '` `S2=' + snap.s2 + '` `S3=' + snap.s3 + '`',
          why : cfg.algo === 'sticky'
            ? (idx === 0
                ? '**Sticky Session** — এই client-কে একটি নির্দিষ্ট server-এর সাথে বেঁধে দেওয়া হলো (cookie বা source IP-র hash দিয়ে)।\n\nএখন থেকে এই client-এর সব request একই server-এ যাবে।\n\nকারণ? যদি server নিজের স্মৃতিতে session রাখে (কে login করেছে, cart-এ কী আছে), তাহলে অন্য server-এ গেলে সে কিছুই চিনবে না।'
                : (idx === N_REQ - 1
                    ? '**Sticky-র দাম এখানে স্পষ্ট।**\n\nদেখুন বণ্টনটি: `S1=' + snap.s1 + '` `S2=' + snap.s2 + '` `S3=' + snap.s3 + '`\n\nএকটি server সব ভার নিচ্ছে, বাকিরা বসে আছে। "Load balancer" নাম নিয়ে সে আসলে ভার ভাগ করছে না।\n\nআর আসল বিপদ — ওই server মরে গেলে **সেই সব ব্যবহারকারীর session হারিয়ে যাবে**। তাঁরা হঠাৎ logout হয়ে যাবেন, cart খালি হয়ে যাবে।\n\n**ভালো সমাধান sticky নয়** — session-কে server-এর বাইরে রাখা (Redis, database, বা signed cookie)। তখন প্রতিটি server stateless হয়ে যায়, আর যেকোনো server যে কাউকে সামলাতে পারে।\n\nএজন্যই HTTP-র stateless নকশাটি এত মূল্যবান — সেটিই এই স্বাধীনতা দেয়।'
                    : 'একই client, তাই আবারও একই server।\n\nলক্ষ্য করুন বাকি server গুলো এই client-এর কোনো কাজেই আসছে না।'))
            : (idx < pool.length
                ? '**Round Robin** — সবচেয়ে সহজ নিয়ম: পালা করে একটির পর একটি।\n\nএটি ভালো কাজ করে যখন প্রতিটি server সমান ক্ষমতার আর প্রতিটি request মোটামুটি সমান ভারী।\n\nঅন্য নিয়মও আছে: **Least Connections** (যার হাতে সবচেয়ে কম কাজ তাকে দাও) ভিন্ন ভিন্ন দৈর্ঘ্যের request-এ ভালো, আর **Weighted** নিয়মে শক্তিশালী server বেশি ভার নেয়।'
                : (dead
                    ? 'লক্ষ্য করুন — Server 2-কে **একবারও** দেওয়া হচ্ছে না। সে তালিকা থেকেই বাদ।\n\nব্যবহারকারীরা কিছুই টের পাচ্ছেন না। কোনো error নেই, কোনো দেরি নেই।\n\nএটাই high availability-র মূল কথা: **ব্যর্থতা ঘটে, কিন্তু ব্যবহারকারী পর্যন্ত পৌঁছায় না।**'
                    : 'ভার সমানভাবে ভাগ হচ্ছে। এটি সম্ভব হচ্ছে কারণ প্রতিটি server **stateless** — তারা কেউ কারো চেয়ে বিশেষ কিছু জানে না।\n\nযেকোনো server যেকোনো request সামলাতে পারে, তাই বণ্টন সম্পূর্ণ স্বাধীন।')),
          apply: function(st){
            st.wire = { pkt:p, from:'lb', to:target };
            st.counts = snap;
            st.banner = 'S1=' + snap.s1 + ' S2=' + snap.s2 + ' S3=' + snap.s3;
          }
        });
      })(r);
    }

    var vals = [counts.s1, counts.s2, counts.s3];
    var spread = Math.max.apply(null, vals) - Math.min.apply(null, vals);
    steps.push({
      t:at(), actor:'lb', layer:'L4', kind: spread <= 1 ? 'ok' : 'warn',
      title:'ফলাফল — S1=' + counts.s1 + ' S2=' + counts.s2 + ' S3=' + counts.s3,
      what:'মোট ' + N_REQ + 'টি request বণ্টন হলো।\n\n' +
           (spread <= 1 ? 'ভার প্রায় সমানভাবে ভাগ হয়েছে।'
                        : 'ভার অসমান — সবচেয়ে ব্যস্ত আর সবচেয়ে অলস server-এর পার্থক্য ' + spread + 'টি request।'),
      why : dead
        ? 'সবচেয়ে গুরুত্বপূর্ণ কথাটি এখানে: **একটি server মরে গেছে, অথচ একটি ব্যবহারকারীও error দেখেননি।**\n\nএটি নিজে থেকে হয়নি। এটি সম্ভব হয়েছে তিনটি জিনিসের কারণে:\n\n**১. একাধিক server** — একটি মরলেও অন্যরা আছে\n**২. Health check** — মৃতটিকে চিনে বাদ দেওয়া গেছে\n**৩. Stateless নকশা** — বাকি server গুলো ওই ব্যবহারকারীদের সামলাতে পেরেছে\n\nতিনটির একটিও না থাকলে ব্যবহারকারী error দেখতেন।\n\nএজন্যই "একটা load balancer বসিয়ে দিলাম" যথেষ্ট নয় — নকশার প্রতিটি স্তরে এই তিনটি শর্ত মেনে চলতে হয়।'
        : (cfg.algo === 'sticky'
            ? 'Sticky session-এর সাথে এই অসাম্য অনিবার্য।\n\nপ্রশ্নটি হলো — এই অসাম্য মেনে নেওয়ার মতো যথেষ্ট কারণ আছে কি?\n\nবেশিরভাগ ক্ষেত্রে নেই। Session-কে বাইরে সরিয়ে রাখলে sticky-র দরকারই পড়ে না, আর তখন `Round Robin` দিয়ে নিখুঁত বণ্টন পাওয়া যায়।\n\nSticky মূলত পুরনো application-এর জন্য একটি সাময়িক ব্যবস্থা, যেগুলো নতুন করে লেখা সম্ভব নয়।'
            : 'সমান বণ্টন সম্ভব হচ্ছে কারণ server গুলো stateless।\n\nএখান থেকে একটি বড় শিক্ষা: **scaling-এর সবচেয়ে বড় বাধা প্রায়ই network নয়, বরং application-এর নকশা।**\n\nServer যদি নিজের স্মৃতিতে গুরুত্বপূর্ণ কিছু রাখে, তাহলে সে আর প্রতিস্থাপনযোগ্য থাকে না — আর তখন সহজে server যোগ করা যায় না।\n\n`Server 2 মরে গেছে` চালু করে দেখুন এই নকশা কীভাবে ব্যর্থতা লুকিয়ে ফেলে।'),
      apply: function(st){ st.wire = null;
                           st.banner = 'S1=' + counts.s1 + ' S2=' + counts.s2 +
                                       ' S3=' + counts.s3; }
    });

    return steps;
  }
};

})(window.NetLab);
