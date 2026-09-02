/* ═══════════════════════════════════════════════════════════════════
   LAB · TLS Handshake — HTTPS-এর ভেতরে
   ───────────────────────────────────────────────────────────────────
   সতর্কতা: এটি একটি সরলীকৃত শিক্ষামূলক মডেল। আসল TLS 1.3-এ আরও ধাপ,
   আরও extension এবং cryptography-র অনেক সূক্ষ্মতা আছে। এখানে শুধু
   "কোন ধাপ কোন সমস্যার সমাধান করে" সেটুকুই দেখানো হচ্ছে।
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI_IP = '192.168.1.10', SRV_IP = '93.184.216.34';
var CLI_MAC = 'AA:AA:AA:AA:AA:AA', SRV_MAC = 'SS:SS:SS:SS:SS:SS';

function tlsPkt(from, name, text, label, kind){
  return P.make([
    P.ethernet(from === 'client' ? CLI_MAC : SRV_MAC,
               from === 'client' ? SRV_MAC : CLI_MAC, 'ip'),
    P.ip(from === 'client' ? CLI_IP : SRV_IP,
         from === 'client' ? SRV_IP : CLI_IP, 64, 'tcp', 40 + text.length),
    P.tcp(from === 'client' ? 49152 : 443, from === 'client' ? 443 : 49152,
          1, 1, 'PSH, ACK', 64240),
    { name:name, layer:'L7', size:text.length, fields:[ ['payload', text] ] }
  ], { label:label, kind:kind || 'data', from:from,
       to: from === 'client' ? 'server' : 'client' });
}

NS.labs.tls = {
  id: 'tls',
  title: 'TLS Handshake (HTTPS)',
  group: 'Phase 4 · Application',
  chapter: 'ch33',
  blurb: 'তালার ছবিটির পেছনে কী ঘটে — এবং সেটি ঠিক কী নিশ্চিত করে, কী করে না।',

  learn: [
    'TLS ঠিক তিনটি জিনিস দেয় — সেগুলো কী কী',
    'Certificate কী প্রমাণ করে, আর কী প্রমাণ করে না',
    'কেন Certificate-এ বিশ্বাস করা যায় — Chain of Trust',
    'Key exchange-এর মূল ধারণা: গোপন চাবি পাঠানো হয় না, দুই পাশে আলাদাভাবে তৈরি হয়'
  ],

  mistakes: [
    { m:'HTTPS মানে website-টি নিরাপদ ও বিশ্বাসযোগ্য।',
      r:'HTTPS নিশ্চিত করে **পথটি** নিরাপদ — মাঝখানে কেউ পড়তে বা বদলাতে পারবে না। কিন্তু ওপাশের site-টি সৎ কিনা সে বিষয়ে HTTPS কিছুই বলে না। একটি প্রতারণামূলক site-ও নিখুঁত HTTPS ব্যবহার করতে পারে — এবং করেও।' },
    { m:'Certificate প্রমাণ করে প্রতিষ্ঠানটি আসল।',
      r:'সাধারণ (DV) certificate শুধু প্রমাণ করে — **যে এই certificate পেয়েছে, সে ওই domain-টি নিয়ন্ত্রণ করে**। ব্যস। কোনো প্রতিষ্ঠানের পরিচয় বা সততা যাচাই হয়নি। `paypa1.com`-এর জন্যও বৈধ certificate পাওয়া যায়।' },
    { m:'Encryption-এর চাবিটি handshake-এর সময় পাঠানো হয়।',
      r:'আধুনিক TLS-এ গোপন চাবিটি **কখনো network-এ যায় না**। দুই পাশ কিছু তথ্য বিনিময় করে, তারপর প্রত্যেকে **নিজের দিকে আলাদাভাবে** একই চাবি হিসাব করে বের করে। যে আড়ি পাতছে সে সব বার্তা দেখেও চাবিটি বের করতে পারে না।' }
  ],

  controls: [
    { key:'problem', type:'choice', label:'Certificate-এর অবস্থা', def:'ok',
      options:[ ['ok','বৈধ certificate'],
                ['expired','মেয়াদ শেষ হয়ে গেছে'],
                ['wrongname','অন্য domain-এর certificate'],
                ['selfsigned','নিজে সই করা — অচেনা CA'] ],
      help:'Browser-এর তিন ধরনের সতর্কবার্তা আসলে তিনটি ভিন্ন যাচাই ব্যর্থ হওয়ার ফল।' }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Browser', x:20, y:50, mac:CLI_MAC, ip:CLI_IP,
                         note:'plaintext' }),
        N.server('server', { name:'Web Server', x:80, y:50, mac:SRV_MAC, ip:SRV_IP,
                             listening:[{ port:443, service:'HTTPS', open:true }],
                             note:'TLS' })
      ],
      links: [ N.link('client','server') ],
      hub:null, wire:null, banner:null,
      encrypted:false, verified:null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var bad = cfg.problem !== 'ok';

    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'info',
      title:'আগে TCP, তারপর TLS, তারপর HTTP',
      what:'HTTPS কোনো আলাদা protocol নয়। এটি **HTTP, যা TLS-এর ভেতরে চলছে, যা TCP-র উপরে বসে আছে**।\n\nতাই আগে স্বাভাবিক TCP handshake (৩টি Packet) সেরে নিতে হয়।',
      why :'স্তরগুলো এভাবে সাজানো:\n\n`HTTP` (কী চাই)\n`TLS` (গোপনীয়তা ও পরিচয়)\n`TCP` (নির্ভরযোগ্য পৌঁছানো)\n`IP` (পথ খোঁজা)\n\nএর একটি সুন্দর দিক — HTTP-কে **একটুও বদলাতে হয়নি**। সে আগের মতোই text লিখে যাচ্ছে, শুধু নিচে TLS নামের একটি স্তর বসে সেটিকে encrypt করে দিচ্ছে।\n\nএই কারণেই TLS দিয়ে SMTP, IMAP, এমনকি যেকোনো TCP-ভিত্তিক protocol মুড়ে ফেলা যায়।\n\nএর একটি দামও আছে — এই বাড়তি handshake-এ **অতিরিক্ত RTT** লাগে। TLS 1.3 সেটি কমিয়ে ১ RTT-তে এনেছে (আগে ছিল ২)।',
      apply: function(st){ st.banner = 'TCP তৈরি · এবার TLS'; }
    });

    var hello = tlsPkt('client', 'TLS ClientHello',
      'ClientHello\nversion: TLS 1.3\ncipher suites: [...]\nSNI: example.com\nkey share: (client-এর অংশ)',
      'ClientHello');
    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'info',
      title:'ClientHello — "আমি এসব বুঝি"', packet:hello,
      what:'Browser পাঠাল:\n\n• কোন কোন **TLS version** সে বোঝে\n• কোন কোন **cipher suite** (encryption পদ্ধতি) সে সমর্থন করে\n• একটি এলোমেলো সংখ্যা\n• **SNI** — কোন domain-এর সাথে কথা বলতে চায়\n• নিজের **key share** — চাবি তৈরির জন্য তার অংশটুকু',
      why :'**SNI** ঘরটি লক্ষ্য করার মতো, এবং এটি একটি অদ্ভুত পরিস্থিতি তৈরি করে।\n\nএকটি IP-তে বহু site থাকতে পারে। Server কোন certificate পাঠাবে সেটি জানতে হলে তাকে আগে জানতে হবে আপনি কোন site চাইছেন।\n\nকিন্তু encryption তো এখনো শুরুই হয়নি! তাই **SNI খোলা অবস্থায় যায়** — যে কেউ দেখলে বুঝতে পারে আপনি কোন site-এ যাচ্ছেন।\n\nএটি একটি বাস্তব গোপনীয়তার ফাঁক। আপনি *কী* পড়ছেন তা লুকানো থাকে, কিন্তু *কোথায়* যাচ্ছেন তা নয়। (ECH নামের একটি নতুন ব্যবস্থা এটিও ঢাকতে চাইছে।)\n\nআর **key share** পাঠানো মানে চাবি পাঠানো নয় — এটি চাবি *তৈরির* জন্য একটি উপকরণ মাত্র।',
      apply: function(st){ st.wire = { pkt:hello, from:'client', to:'server' };
                           st.banner = 'ClientHello · এখনো plaintext'; }
    });

    var certDesc = {
      ok:         'CN=example.com\nissuer: Let\'s Encrypt\nvalid: 2026-01-01 → 2026-12-31',
      expired:    'CN=example.com\nissuer: Let\'s Encrypt\nvalid: 2024-01-01 → 2024-12-31',
      wrongname:  'CN=other-site.com\nissuer: Let\'s Encrypt\nvalid: 2026-01-01 → 2026-12-31',
      selfsigned: 'CN=example.com\nissuer: example.com (নিজেই)\nvalid: 2026-01-01 → 2026-12-31'
    }[cfg.problem];

    var cert = tlsPkt('server', 'TLS ServerHello + Certificate',
      'ServerHello\ncipher: TLS_AES_128_GCM_SHA256\nkey share: (server-এর অংশ)\n\nCertificate:\n' + certDesc,
      'ServerHello + Cert', 'ack');
    steps.push({
      t:at(), actor:'server', layer:'L7', kind:'info',
      title:'ServerHello + Certificate', packet:cert,
      what:'Server বেছে নিল কোন cipher suite ব্যবহার হবে, নিজের key share পাঠাল, এবং সাথে দিল তার **Certificate**।\n\nCertificate-এ আছে: কোন domain-এর জন্য, কে সই করেছে, কতদিন বৈধ, আর server-এর public key।',
      why :'Certificate আসলে একটি **সই করা দাবিপত্র**। এতে লেখা: "আমি example.com, আর এই আমার public key।"\n\nকিন্তু যে কেউ তো এমন একটি কাগজ বানাতে পারে। তাহলে বিশ্বাস কীসের জোরে?\n\nজোরটি হলো **সই**। একটি Certificate Authority (CA) এতে সই করেছে, আর সেই CA-র সই যাচাই করার public key ইতিমধ্যেই আপনার browser-এর ভেতরে বসানো আছে।\n\nএভাবেই একটি **Chain of Trust** তৈরি হয়:\n\n`আপনার browser` বিশ্বাস করে → `CA-কে` → যে সই করেছে → `এই certificate-এ`\n\nCA-র কাজ হলো সই করার আগে যাচাই করা যে আবেদনকারী সত্যিই ওই domain-টি নিয়ন্ত্রণ করেন — সাধারণত DNS-এ একটি record বসাতে বলে, বা server-এ একটি file রাখতে বলে।\n\nমনে রাখবেন — এটুকুই যাচাই হয়। প্রতিষ্ঠানটি সৎ কিনা, ব্যবসাটি আসল কিনা — CA সেসব দেখে না।',
      apply: function(st){ st.wire = { pkt:cert, from:'server', to:'client' };
                           st.banner = 'certificate এলো'; }
    });

    /* ── যাচাই ── */
    var FAIL = {
      expired: { title:'যাচাই ব্যর্থ — মেয়াদ শেষ',
        what:'Browser তারিখ মিলিয়ে দেখল certificate-টির মেয়াদ **শেষ হয়ে গেছে**।\n\n`NET::ERR_CERT_DATE_INVALID`',
        why:'Certificate-এর মেয়াদ থাকে কেন?\n\nকারণ private key কোনো এক সময় ফাঁস হয়ে যেতে পারে। মেয়াদ থাকলে ক্ষতির সময়সীমা নির্দিষ্ট থাকে — চিরকালের জন্য নয়।\n\nএজন্যই আধুনিক certificate-এর মেয়াদ ছোট হয়ে আসছে (আগে ছিল ৩ বছর, এখন প্রায়ই ৯০ দিন), আর নবায়ন স্বয়ংক্রিয় করা হয়।\n\nবাস্তবে মেয়াদোত্তীর্ণ certificate সাধারণত **আক্রমণ নয়, ভুলে যাওয়া** — কেউ নবায়ন করতে ভুলে গেছে। তবু browser-কে সন্দেহ করতেই হয়, কারণ সে ভুল আর আক্রমণের পার্থক্য বুঝতে পারে না।' },
      wrongname: { title:'যাচাই ব্যর্থ — নাম মিলছে না',
        what:'Certificate-টি `other-site.com`-এর জন্য, কিন্তু আপনি `example.com`-এ এসেছেন।\n\n`NET::ERR_CERT_COMMON_NAME_INVALID`',
        why:'এই যাচাইটিই man-in-the-middle আক্রমণ ঠেকায়।\n\nভাবুন যাচাইটি না থাকলে — আক্রমণকারী নিজের যেকোনো একটি **বৈধ** certificate (তার নিজের domain-এর) দেখিয়ে আপনার আর আসল server-এর মাঝে বসে পড়তে পারত। Certificate বৈধ, সই ঠিক, মেয়াদ ঠিক — সব ঠিক।\n\nতাই বৈধতা যথেষ্ট নয়। Certificate-টি **ঠিক এই domain-এর জন্যই** হতে হবে।\n\nএটি ভুল করে হওয়া সহজ — ভুল virtual host, বা `www.` সহ/ছাড়া নাম certificate-এ না থাকা।' },
      selfsigned: { title:'যাচাই ব্যর্থ — অচেনা সইকারী',
        what:'Certificate-এ সই করেছে `example.com` নিজেই। Browser-এর তালিকায় এই সইকারী নেই।\n\n`NET::ERR_CERT_AUTHORITY_INVALID`',
        why:'একটি নিজে-সই-করা certificate নিজের সম্পর্কে নিজেই সাক্ষ্য দিচ্ছে — "আমি যে আমি, তার প্রমাণ আমি নিজেই"।\n\nএতে কোনো তৃতীয় পক্ষ যাচাই করেনি যে এই ব্যক্তি সত্যিই domain-টি নিয়ন্ত্রণ করেন।\n\nএখানে গুরুত্বপূর্ণ কথা — **encryption কিন্তু ঠিকঠাক কাজ করবে**। যা কাজ করছে না তা হলো **পরিচয় যাচাই**।\n\nমানে data গোপন থাকবে, কিন্তু আপনি জানেন না গোপন কথাটি **কার সাথে** বলছেন। আর যার সাথে বলছেন সে যদি আক্রমণকারী হয়, তাহলে encryption-এর কোনো মূল্যই নেই।\n\nএজন্যই এটি অভ্যন্তরীণ পরীক্ষায় চলে, কিন্তু public site-এ চলে না।' }
    }[cfg.problem];

    if(bad){
      steps.push({
        t:at(), actor:'client', layer:'L7', kind:'error',
        title:FAIL.title, what:FAIL.what, why:FAIL.why,
        apply: function(st){ st.wire = null; st.verified = false;
                             st.banner = 'certificate যাচাই ব্যর্থ'; }
      });
      steps.push({
        t:at(), actor:'client', layer:'L7', kind:'error',
        title:'Browser সতর্কবার্তা দেখাল — connection থামল',
        what:'Browser পুরো লাল পর্দার সতর্কবার্তা দেখাল। কোনো HTTPS data আদান-প্রদান হলো না।',
        why :'লক্ষ্য করুন এই তিনটি ব্যর্থতা আসলে **তিনটি আলাদা প্রশ্নের** উত্তর:\n\n• **মেয়াদ** — এই দাবিপত্রটি কি এখনো বৈধ?\n• **নাম** — এটি কি ঠিক এই domain-এর জন্য?\n• **সইকারী** — যে সই করেছে তাকে কি আমি চিনি?\n\nতিনটির যেকোনো একটি ব্যর্থ হলেই সব থেমে যায়।\n\nএখানে একটি কঠিন সত্য আছে: এই সতর্কবার্তায় **"তবু এগিয়ে যান" বেছে নেওয়া যায়**, এবং বহু মানুষ যান। কিন্তু সেটি করলে TLS-এর পুরো নিরাপত্তা ব্যবস্থাটিই অকেজো হয়ে যায় — আপনি তখন হয়তো সরাসরি আক্রমণকারীর সাথেই encrypted কথা বলছেন।\n\nব্যক্তিগত পরীক্ষার server হলে এক কথা। কিন্তু bank-এর site-এ এই সতর্কতা দেখলে **থেমে যাওয়াই একমাত্র সঠিক সিদ্ধান্ত**।',
        apply: function(st){ st.banner = 'বন্ধ — কোনো data যায়নি'; }
      });
      return steps;
    }

    /* ── সফল যাচাই ── */
    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'ok',
      title:'Certificate যাচাই সফল — তিনটি প্রশ্নেরই উত্তর মিলল',
      what:'Browser তিনটি জিনিস মিলিয়ে দেখল:\n\n**১.** সইকারী CA-টি কি আমার বিশ্বাসের তালিকায় আছে? ✓\n**২.** Certificate-এর নাম কি `example.com`? ✓\n**৩.** মেয়াদ কি এখনো আছে? ✓',
      why :'তিনটিই একসাথে মিলতে হয়।\n\nএখানে বিশ্বাসের ভিত্তিটি কোথায় সেটি একবার ভেবে দেখার মতো — আপনার browser-এর (বা OS-এর) ভেতরে **আগে থেকেই** কয়েকশো CA-র public key বসানো আছে। এদের বলে root store।\n\nএই তালিকাটিই পুরো ব্যবস্থার ভিত্তি। আর এটিই তার সবচেয়ে দুর্বল জায়গাও — একটি CA যদি ভুল বা অসৎভাবে কাউকে certificate দিয়ে দেয়, browser সেটি বিশ্বাস করবে।\n\nএই ঝুঁকি কমাতে **Certificate Transparency** নামের একটি ব্যবস্থা এসেছে — সব ইস্যু করা certificate একটি প্রকাশ্য খাতায় লিখে রাখা হয়, যাতে কেউ চুপিচুপি আপনার domain-এর নামে certificate নিতে না পারে।',
      apply: function(st){ st.verified = true; st.banner = 'certificate বৈধ ✓'; }
    });

    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'ok',
      title:'চাবি তৈরি — কিন্তু চাবিটি পাঠানো হয়নি',
      what:'দুই পাশ নিজেদের key share বিনিময় করেছিল। এখন **প্রত্যেকে নিজের দিকে আলাদাভাবে** একই গোপন চাবি হিসাব করে বের করল।\n\nচাবিটি **কখনো network-এ যায়নি**।',
      why :'এটাই TLS-এর সবচেয়ে চমৎকার ধারণা, আর প্রথমে অসম্ভব মনে হয়।\n\nসরল একটি উপমা: ভাবুন দুজন মানুষ প্রকাশ্যে রঙ বিনিময় করছেন। প্রত্যেকের কাছে একটি গোপন রঙ আছে, আর একটি সাধারণ রঙ সবাই জানে। প্রত্যেকে নিজের গোপন রঙ সাধারণ রঙের সাথে মিশিয়ে ফলাফলটি পাঠায়।\n\nএবার প্রত্যেকে অন্যজনের পাঠানো মিশ্রণে **নিজের গোপন রঙ** আবার মেশায়। দুজনের হাতে একই চূড়ান্ত রঙ তৈরি হয়!\n\nকিন্তু যে আড়ি পেতে ছিল, সে শুধু মিশ্রণ দুটি দেখেছে। মিশ্রণ থেকে মূল রঙ আলাদা করা তার পক্ষে সম্ভব নয়।\n\n(আসলটি রঙ নয়, গণিত — Diffie-Hellman key exchange। কিন্তু ধারণাটি ঠিক এই।)\n\nএর একটি বড় ফল আছে: server-এর private key পরে ফাঁস হয়ে গেলেও **আজকের কথোপকথন পড়া যাবে না**, কারণ আজকের চাবিটি সেই key থেকে তৈরি হয়নি। একে বলে **Forward Secrecy**।',
      apply: function(st){ st.banner = 'গোপন চাবি তৈরি · পাঠানো হয়নি'; }
    });

    var enc = tlsPkt('client', 'TLS Application Data',
      '(encrypted) — বাইরে থেকে শুধু এলোমেলো byte দেখা যায়',
      '🔒 encrypted', 'ack');
    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'ok',
      title:'এবার HTTP — কিন্তু encrypted', packet:enc,
      what:'এখন থেকে সব HTTP request/response **encrypted** হয়ে যাচ্ছে। মাঝখানে কেউ ধরলে শুধু এলোমেলো byte দেখবে।',
      why :'TLS ঠিক **তিনটি** জিনিস দেয় — এর বেশি নয়, কম নয়:\n\n**১. গোপনীয়তা** — মাঝের কেউ পড়তে পারবে না\n**২. অখণ্ডতা** — মাঝের কেউ বদলে দিলে ধরা পড়বে\n**৩. পরিচয়** — ওপাশে যে আছে সে ওই domain-টির নিয়ন্ত্রক\n\nএখন সমান গুরুত্ব দিয়ে দেখুন **কী দেয় না**:\n\n• Website-টি সৎ কিনা — বলে না\n• তারা আপনার data দিয়ে কী করবে — বলে না\n• Server-এ কোনো নিরাপত্তা ত্রুটি আছে কিনা — বলে না\n• Site-টি malware ছড়াচ্ছে কিনা — বলে না\n\nএকটি প্রতারণামূলক site নিখুঁত HTTPS ব্যবহার করতে পারে, এবং সাধারণত করেও — certificate তো বিনামূল্যেই পাওয়া যায়।\n\nতাই তালার ছবিটির অর্থ: **"এই কথোপকথনটি ব্যক্তিগত"** — "এই site-টি বিশ্বাসযোগ্য" নয়।',
      apply: function(st){
        st.wire = { pkt:enc, from:'client', to:'server' };
        st.encrypted = true;
        for(var i = 0; i < st.devices.length; i++)
          if(st.devices[i].id === 'client') st.devices[i].note = '🔒 encrypted';
        st.banner = '🔒 encrypted · HTTP চলছে';
      }
    });

    return steps;
  }
};

})(window.NetLab);
