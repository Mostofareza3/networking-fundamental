/* ═══════════════════════════════════════════════════════════════════
   LAB · Firewall — নিয়ম মিলিয়ে সিদ্ধান্ত
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var OUT_IP = '203.0.113.99', OUT_MAC = 'CC:CC:CC:CC:CC:CC';
var FW_MAC = 'FF:FF:FF:FF:FF:01', SRV_MAC = 'SS:SS:SS:SS:SS:SS';
var SRV_IP = '10.0.0.20';

/* একটি সহজ, ক্রমানুসারে পড়া rule set — উপরের নিয়ম আগে জেতে */
var RULES = [
  { n:1, act:'ALLOW', port:443, proto:'tcp', from:'any',        note:'HTTPS সবার জন্য খোলা' },
  { n:2, act:'ALLOW', port:80,  proto:'tcp', from:'any',        note:'HTTP সবার জন্য খোলা' },
  { n:3, act:'ALLOW', port:22,  proto:'tcp', from:'10.0.0.0/8', note:'SSH শুধু ভেতরের network থেকে' },
  { n:4, act:'DENY',  port:'*', proto:'*',   from:'any',        note:'বাকি সব বন্ধ' }
];

function pkt(sIp, dIp, dp, label, from, to, kind){
  return P.make([
    P.ethernet(from === 'out' ? OUT_MAC : FW_MAC,
               from === 'out' ? FW_MAC  : SRV_MAC, 'ip'),
    P.ip(sIp, dIp, 64, 'tcp', 40),
    P.tcp(49152, dp, 1, 0, 'SYN', 64240)
  ], { label:label, kind:kind || 'data', from:from, to:to });
}

/* একটি Packet কোন নিয়মে আটকাবে — উপর থেকে নিচে, প্রথম মিলই চূড়ান্ত */
function match(port, srcIp){
  for(var i = 0; i < RULES.length; i++){
    var r = RULES[i];
    if(r.port !== '*' && r.port !== port) continue;
    if(r.from === '10.0.0.0/8' && srcIp.indexOf('10.') !== 0) continue;
    return r;
  }
  return RULES[RULES.length - 1];
}

NS.labs.firewall = {
  id: 'firewall',
  title: 'Firewall — নিয়মের তালিকা',
  group: 'Phase 4 · Application',
  chapter: 'ch35',
  blurb: 'উপর থেকে নিচে নিয়ম পড়া হয়, প্রথম মিলটিই চূড়ান্ত। আর শেষ নিয়মটি প্রায় সবসময় "বাকি সব বন্ধ"।',

  learn: [
    'Firewall নিয়ম কীভাবে মিলিয়ে দেখা হয় — এবং ক্রম কেন গুরুত্বপূর্ণ',
    'Default DENY কী এবং কেন এটিই নিরাপদ নকশা',
    'DROP আর REJECT-এর পার্থক্য — এবং কোনটি কখন',
    'Stateful Firewall কী — উত্তর ফিরে আসতে দেয় কীভাবে'
  ],

  mistakes: [
    { m:'নিয়মের ক্রম গুরুত্বপূর্ণ নয়, সব নিয়ম তো মিলিয়েই দেখা হয়।',
      r:'ক্রমই সবচেয়ে গুরুত্বপূর্ণ। **প্রথম যে নিয়মটি মেলে, সেটিই চূড়ান্ত** — নিচের নিয়ম আর পড়াই হয় না। একটি ভুল জায়গায় বসানো ALLOW নিচের সব DENY-কে অকেজো করে দিতে পারে।' },
    { m:'Port বন্ধ করা আর Packet ফেলে দেওয়া একই জিনিস।',
      r:'**REJECT** একটি উত্তর পাঠায় (RST বা ICMP), তাই প্রেরক সঙ্গে সঙ্গে জানতে পারে। **DROP** কিছুই বলে না, তাই প্রেরককে timeout পর্যন্ত অপেক্ষা করতে হয়। ভেতরের network-এ REJECT সুবিধাজনক (দ্রুত error), বাইরের দিকে DROP পছন্দ করা হয় (আক্রমণকারীকে কম তথ্য)।' },
    { m:'Firewall শুধু বাইরে থেকে ভেতরে আসা traffic দেখে।',
      r:'বাইরে যাওয়া traffic-ও দেখা যায় এবং প্রায়ই দেখা উচিত। ভেতরের কোনো machine যদি আক্রান্ত হয়, egress নিয়মই তাকে বাইরে data পাঠাতে বাধা দিতে পারে। বহু প্রতিষ্ঠান শুধু ingress নিয়ম লিখে egress ভুলে যায়।' }
  ],

  controls: [
    { key:'port', type:'choice', label:'কোন port-এ চেষ্টা', def:'443',
      options:[ ['443','443 (HTTPS) — অনুমোদিত'],
                ['22','22 (SSH) — শর্তসাপেক্ষ'],
                ['3306','3306 (MySQL) — অনুমোদিত নয়'] ] },
    { key:'inside', type:'toggle', label:'ভেতরের network থেকে আসছে', def:false,
      help:'SSH-এর নিয়মটি source দেখে — তাই এটি বদলালে ফল বদলায়।' },
    { key:'reject', type:'toggle', label:'DROP-এর বদলে REJECT', def:false,
      help:'প্রেরক কী টের পায় — সেই পার্থক্যটি দেখুন।' }
  ],

  build: function(cfg){
    var inside = cfg && cfg.inside;
    return {
      devices: [
        N.pc('out', { name: inside ? 'ভেতরের PC' : 'বাইরের Client', x:14, y:50,
                      mac:OUT_MAC, ip: inside ? '10.0.0.55' : OUT_IP,
                      note: inside ? 'trusted' : 'untrusted' }),
        N.router('fw', { name:'Firewall', x:50, y:50,
          ifaces:[ { name:'wan', ip:'203.0.113.1', mac:FW_MAC, mask:'255.255.255.0' },
                   { name:'lan', ip:'10.0.0.1',    mac:FW_MAC, mask:'255.0.0.0' } ],
          routes:[ { dst:'10.0.0.0', prefix:8, via:'', iface:'lan' } ],
          note:RULES.length + ' rule' }),
        N.server('srv', { name:'Server', x:86, y:50, mac:SRV_MAC, ip:SRV_IP,
          listening:[ { port:443, service:'HTTPS', open:true },
                      { port:80,  service:'HTTP',  open:true },
                      { port:22,  service:'SSH',   open:true },
                      { port:3306, service:'MySQL', open:true } ] })
      ],
      links: [ N.link('out','fw'), N.link('fw','srv') ],
      hub:null, wire:null, banner:null,
      rules: RULES, hit: null, verdict: null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var port = parseInt(cfg.port, 10);
    var srcIp = cfg.inside ? '10.0.0.55' : OUT_IP;
    var rule = match(port, srcIp);
    var allowed = rule.act === 'ALLOW';
    var svc = { 443:'HTTPS', 22:'SSH', 3306:'MySQL' }[port];

    var p1 = pkt(srcIp, SRV_IP, port, '→ :' + port, 'out', 'fw');
    steps.push({
      t:at(), actor:'out', layer:'L4', kind:'info',
      title:'Connection চেষ্টা — port ' + port + ' (' + svc + ')', packet:p1,
      what:'`' + srcIp + '` থেকে Server-এর port `' + port + '`-এ একটি SYN পাঠানো হলো।\n\nএটি Firewall-এ গিয়ে পৌঁছাল।',
      why :'Firewall এখন সিদ্ধান্ত নেবে। সে দেখবে মূলত চারটি জিনিস:\n\n• কোথা থেকে এসেছে (source IP)\n• কোথায় যাচ্ছে (destination IP)\n• কোন port\n• কোন protocol\n\nPacket-এর ভেতরের data সে দেখছে না — সেটি অন্য ধরনের firewall-এর কাজ। এই সিদ্ধান্তটি সম্পূর্ণভাবে **header দেখে**।',
      apply: function(st){ st.wire = { pkt:p1, from:'out', to:'fw' };
                           st.banner = srcIp + ' → :' + port; }
    });

    /* ── নিয়ম মেলানো, এক এক করে ── */
    for(var i = 0; i < RULES.length; i++){
      var r = RULES[i];
      var isHit = (r.n === rule.n);
      var skipped = !isHit && r.n < rule.n;
      if(!skipped && !isHit) break;      /* মিলে যাওয়ার পরের নিয়ম পড়াই হয় না */

      (function(r, isHit){
        var why;
        if(isHit && r.act === 'ALLOW' && r.from === '10.0.0.0/8'){
          why = 'এই নিয়মটি শুধু port দেখে না — **source-ও** দেখে।\n\n`' + srcIp + '` `10.0.0.0/8`-এর ভেতরে পড়ে, তাই মিলে গেল।\n\nএই ধরনের নিয়মই বেশি কাজের। SSH পৃথিবীর সবার জন্য খুলে দেওয়া বিপজ্জনক, কিন্তু নিজের network-এর জন্য খোলা রাখা দরকারও।\n\nএভাবে একটি service একই সাথে ব্যবহারযোগ্য ও সুরক্ষিত থাকে।';
        } else if(isHit && r.act === 'ALLOW'){
          why = 'নিয়মটি মিলে গেল, তাই সিদ্ধান্ত এখানেই শেষ। **নিচের নিয়মগুলো আর পড়া হবে না** — নিয়ম ৪-এ যে "বাকি সব বন্ধ" লেখা আছে, সেটি এই Packet-এর জন্য অপ্রাসঙ্গিক।\n\nএখানেই ক্রমের গুরুত্ব। যদি ভুল করে DENY নিয়মটি উপরে বসানো হতো, তাহলে HTTPS-ও বন্ধ হয়ে যেত — অথচ নিচে ALLOW লেখা থাকত।\n\nFirewall-এর নিয়ম ভুল হওয়ার এটিই সবচেয়ে সাধারণ কারণ: নিয়মগুলো ঠিক, কিন্তু ক্রম ভুল।';
        } else if(isHit && r.act === 'DENY'){
          why = 'উপরের কোনো নিয়মের সাথেই মিলল না, তাই শেষ নিয়মটিতে এসে পড়ল — **default DENY**।\n\nএই শেষ নিয়মটি প্রায় প্রতিটি firewall-এ থাকে, এবং এটিই সবচেয়ে গুরুত্বপূর্ণ নিয়ম।\n\nদুটি ভিন্ন দর্শন তুলনা করুন:\n\n**Default ALLOW** — "যা নিষিদ্ধ নয় তা অনুমোদিত"। প্রতিটি বিপদ আগে থেকে ভেবে নিষিদ্ধ করতে হবে। একটি ভুলে গেলেই ফাঁক।\n\n**Default DENY** — "যা অনুমোদিত নয় তা নিষিদ্ধ"। প্রতিটি প্রয়োজন লিখে দিতে হবে। ভুলে গেলে service কাজ করে না — কিন্তু ফাঁক তৈরি হয় না।\n\nদ্বিতীয়টিতে ভুলের ফল **বিরক্তিকর**, প্রথমটিতে ভুলের ফল **বিপজ্জনক**। এজন্যই default DENY-ই সঠিক নকশা।';
        } else {
          why = 'এই নিয়মটি port `' + (r.port === '*' ? 'যেকোনো' : r.port) + '`-এর জন্য, কিন্তু আমাদের Packet `' + port + '`-এ যাচ্ছে' +
                (r.from === '10.0.0.0/8' ? ', আর source-ও মিলছে না' : '') +
                '। তাই মিলল না।\n\nFirewall পরের নিয়মে চলে গেল। এভাবেই সে উপর থেকে নিচে এক এক করে পড়ে — প্রথম মিল না পাওয়া পর্যন্ত।';
        }

        steps.push({
          t:at(), actor:'fw', layer:'L4',
          kind: isHit ? (r.act === 'ALLOW' ? 'ok' : 'error') : 'info',
          title:'নিয়ম ' + r.n + ': ' + r.act + ' ' +
                (r.port === '*' ? 'সব port' : 'port ' + r.port) +
                (isHit ? ' — মিলে গেল ✓' : ' — মিলল না'),
          what:'`নিয়ম ' + r.n + '` — ' + r.note + '\n\n' +
               (isHit ? '**এটিই মিলে গেল। সিদ্ধান্ত: ' + r.act + '।**'
                      : 'মিলল না, পরের নিয়মে যাচ্ছি।'),
          why: why,
          apply: function(st){
            st.hit = isHit ? r.n : null;
            if(isHit) st.verdict = r.act;
            st.banner = 'নিয়ম ' + r.n + (isHit ? ' → ' + r.act : ' — মিলল না');
          }
        });
      })(r, isHit);

      if(isHit) break;
    }

    /* ── ফলাফল ── */
    if(allowed){
      var p2 = pkt(srcIp, SRV_IP, port, '→ Server', 'fw', 'srv');
      steps.push({
        t:at(), actor:'fw', layer:'L4', kind:'ok',
        title:'ALLOW — Packet Server-এ পৌঁছে গেল', packet:p2,
        what:'Firewall Packet-টি এগিয়ে দিল। Server এখন handshake সম্পূর্ণ করবে।',
        why :'একটি গুরুত্বপূর্ণ ব্যাপার এখানে ঘটছে যা চোখে পড়ে না।\n\nআধুনিক firewall **stateful** — সে এই connection-টি একটি table-এ লিখে রাখল।\n\nএতে কী লাভ? উত্তর যখন Server থেকে ফিরে আসবে, তখন সেটি হবে "ভেতর থেকে বাইরে" যাওয়া traffic। কোনো নিয়মে সেটির উল্লেখ নেই।\n\nStateless হলে উত্তর ফেরার জন্যও আলাদা নিয়ম লিখতে হতো — আর সেই নিয়মটি অনেক বেশি ঢিলেঢালা হয়ে যেত।\n\nStateful firewall বলে: "আমি এই connection-টি অনুমোদন করেছি, তাই এর উত্তরও অনুমোদিত।" একটি নিয়ম, দুই দিক।\n\nএটিই আজকের firewall-কে একই সাথে কড়া ও ব্যবহারযোগ্য রাখে।',
        apply: function(st){ st.wire = { pkt:p2, from:'fw', to:'srv' };
                             st.banner = 'ALLOW · পৌঁছে গেল'; }
      });
      return steps;
    }

    if(cfg.reject){
      var rst = P.make([
        P.ethernet(FW_MAC, OUT_MAC, 'ip'),
        P.ip('10.0.0.1', srcIp, 64, 'tcp', 40),
        P.tcp(port, 49152, 0, 1, 'RST, ACK', 0)
      ], { label:'RST', kind:'ack', from:'fw', to:'out' });
      steps.push({
        t:at(), actor:'fw', layer:'L4', kind:'error',
        title:'REJECT — উত্তর দিয়ে জানিয়ে দেওয়া হলো', packet:rst,
        what:'Firewall Packet-টি ফেলে দিল, **এবং** প্রেরককে একটি RST পাঠাল।\n\nপ্রেরক সঙ্গে সঙ্গে `Connection refused` পেল।',
        why :'REJECT আর DROP-এর মধ্যে বাছাইটি আসলে একটি আপস।\n\n**REJECT-এর সুবিধা:** প্রেরক সঙ্গে সঙ্গে জানতে পারে। কোনো দীর্ঘ অপেক্ষা নেই, debugging সহজ।\n\n**REJECT-এর অসুবিধা:** আক্রমণকারীও সঙ্গে সঙ্গে জানতে পারে — "এখানে কিছু একটা আছে, কিন্তু ঢুকতে দিচ্ছে না"। এই তথ্যটুকুও তার কাজে লাগে।\n\nতাই সাধারণ চর্চা:\n\n• **ভেতরের network-এ REJECT** — সহকর্মীর সময় নষ্ট করার মানে নেই\n• **Internet-মুখী দিকে DROP** — অপরিচিতকে কিছু না জানানোই ভালো\n\n`DROP-এর বদলে REJECT` বন্ধ করে পার্থক্যটি দেখুন।',
        apply: function(st){ st.wire = { pkt:rst, from:'fw', to:'out' };
                             st.banner = 'REJECT · RST পাঠানো হলো'; }
      });
      steps.push({
        t:at(), actor:'out', layer:'L4', kind:'error',
        title:'Connection refused — সঙ্গে সঙ্গে',
        what:'প্রেরক RST পেয়ে সাথে সাথেই হাল ছেড়ে দিল। কোনো অপেক্ষা করতে হয়নি।',
        why :'এই দ্রুততাই REJECT-এর মূল সুবিধা।\n\nকিন্তু মনে রাখবেন — এই `Connection refused` দেখতে ঠিক তেমনই লাগে যেমন **port বন্ধ থাকলে** লাগত।\n\nতাই এই error দেখলে দুটি সম্ভাবনা আছে: হয় service চালু নেই, নয়তো firewall আটকাচ্ছে। দুটির পার্থক্য বাইরে থেকে বোঝা যায় না।\n\nএটি ইচ্ছাকৃত — firewall নিজের অস্তিত্ব লুকিয়ে রাখছে।',
        apply: function(st){ st.wire = null; st.banner = 'Connection refused'; }
      });
    } else {
      steps.push({
        t:at(), actor:'fw', layer:'L4', kind:'error',
        title:'DROP — নীরবে ফেলে দেওয়া হলো',
        what:'Firewall Packet-টি ফেলে দিল এবং **কিছুই জানাল না**। কোনো উত্তর নেই।',
        why :'প্রেরকের কাছে এখন দুটি অবস্থা সম্পূর্ণ একরকম দেখাচ্ছে:\n\n• Packet-টি হারিয়ে গেছে\n• Packet-টি ইচ্ছাকৃতভাবে ফেলে দেওয়া হয়েছে\n\nদুটোই নীরবতা। তার কাছে আলাদা করার কোনো উপায় নেই।\n\nএটাই DROP-এর উদ্দেশ্য — কোনো তথ্য না দেওয়া। কেউ port scan করলে সে জানতেও পারবে না এই ঠিকানায় আদৌ কিছু আছে কিনা।',
        apply: function(st){ st.wire = null; st.banner = 'DROP · নীরবতা'; }
      });
      steps.push({
        t:at(), actor:'out', layer:'L4', kind:'error',
        title:'Connection timed out — দীর্ঘ অপেক্ষার পর',
        what:'প্রেরক বারবার SYN পাঠাল, প্রতিবার আরও বেশি অপেক্ষা করল। শেষ পর্যন্ত `Connection timed out`।',
        why :'এই একটি পার্থক্য debugging-এ প্রথম সূত্র হিসেবে কাজ করে:\n\n**`Connection refused` (সঙ্গে সঙ্গে)** → কেউ RST দিয়েছে। হয় port বন্ধ, নয় firewall REJECT করছে। Packet কিন্তু পৌঁছেছিল।\n\n**`Connection timed out` (দীর্ঘ অপেক্ষার পর)** → কেউ কিছুই বলেনি। সাধারণত firewall DROP করছে, অথবা Packet পথই খুঁজে পায়নি।\n\nতাই error-টি **কত সময় পরে এলো** সেটিও একটি তথ্য। তাৎক্ষণিক error আর দীর্ঘ অপেক্ষা — দুটি ভিন্ন গল্প বলে।\n\nএই একই পার্থক্য TCP Handshake lab-এও দেখেছেন — সেখানে RST বনাম নীরবতা।',
        apply: function(st){ st.banner = 'Connection timed out'; }
      });
    }

    return steps;
  }
};

})(window.NetLab);
