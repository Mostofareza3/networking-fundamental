/* ═══════════════════════════════════════════════════════════════════
   LAB · DNS Resolution — একটি নাম যেভাবে IP হয়
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI_IP = '192.168.1.10', CLI_MAC = 'AA:AA:AA:AA:AA:AA';
var RESOLVER = { ip:'8.8.8.8', mac:'RR:RR:RR:RR:RR:RR' };

/* DNS message-এর ভেতরটা — Inspector-এ দেখানোর জন্য */
function dnsMsg(qname, qtype, answer, kind){
  var f = [ ['payload', 'QNAME=' + qname + ' QTYPE=' + qtype] ];
  if(answer) f.push(['payload', 'ANSWER: ' + answer]);
  return { name:'DNS Message', layer:'L7', size: answer ? 90 : 40, fields:f };
}
function udpHdr(sp, dp){
  return { name:'UDP Header', layer:'L4', size:8,
    fields:[ ['srcPort', String(sp)], ['dstPort', String(dp)],
             ['ipLen', '48 bytes'], ['fcs','checksum'] ] };
}
function q(src, srcMac, dst, dstMac, qname, answer, label, from, to, kind){
  return P.make([
    P.ethernet(srcMac, dstMac, 'ip'),
    P.ip(src, dst, 64, 'udp', 76),
    udpHdr(answer ? 53 : 49152, answer ? 49152 : 53),
    dnsMsg(qname, 'A', answer)
  ], { label:label, kind:kind || 'data', from:from, to:to });
}

NS.labs.dns = {
  id: 'dns',
  title: 'DNS Resolution',
  group: 'Phase 4 · Application',
  chapter: 'ch26',
  blurb: '`www.example.com` লিখলেন। কিন্তু browser IP ছাড়া কিছুই করতে পারে না। মাঝখানে কী ঘটে?',

  learn: [
    'Recursive আর Iterative query — কে কার হয়ে খোঁজে',
    'Root → TLD → Authoritative — এই তিন ধাপ কেন দরকার',
    'Resolver আসলে কী করে, আর কেন সে-ই সব পরিশ্রম করে',
    'NXDOMAIN আর SERVFAIL — দুটি ভিন্ন ব্যর্থতা'
  ],

  mistakes: [
    { m:'DNS একটি বিশাল কেন্দ্রীয় তালিকা, যেখানে সব নাম লেখা আছে।',
      r:'কোনো একক তালিকা নেই। DNS একটি **বিতরণ করা, স্তরে স্তরে সাজানো** ব্যবস্থা। Root জানে `.com` কার কাছে, `.com` জানে `example.com` কার কাছে, আর সেই authoritative server জানে আসল উত্তর। কেউই সবকিছু জানে না।' },
    { m:'Browser নিজেই Root server-এ গিয়ে খোঁজে।',
      r:'Browser শুধু তার **Resolver**-কে একটি প্রশ্ন করে এবং একটি উত্তরের অপেক্ষা করে। Root, TLD, Authoritative — এই পুরো যাত্রাটি Resolver একাই করে। Client-এর কাছে ব্যাপারটা একটি প্রশ্ন, একটি উত্তর।' },
    { m:'DNS ধীর হলে বুঝতে হবে network ধীর।',
      r:'DNS প্রায়ই ধীর হয় **cache miss**-এর কারণে — তখন পুরো Root→TLD→Authoritative যাত্রা করতে হয়, তিন-চারটি আলাদা RTT। একই নাম দ্বিতীয়বার চাইলে cache থেকে প্রায় সঙ্গে সঙ্গেই আসে। এটি network-এর গতির সমস্যা নয়।' }
  ],

  controls: [
    { key:'result', type:'choice', label:'ফলাফল', def:'ok',
      options:[ ['ok','নাম আছে — সফল resolution'],
                ['nx','নাম নেই — NXDOMAIN'],
                ['fail','Authoritative server চুপ — SERVFAIL'] ] }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Browser', x:10, y:50, mac:CLI_MAC, ip:CLI_IP,
                         note:'IP জানে না' }),
        N.server('res', { name:'Resolver', x:32, y:50, mac:RESOLVER.mac, ip:RESOLVER.ip,
                          listening:[{ port:53, service:'DNS', open:true }],
                          note:'cache খালি' }),
        N.server('root', { name:'Root (.)', x:57, y:16, mac:'R0:00:00:00:00:01',
                           ip:'198.41.0.4',
                           listening:[{ port:53, service:'DNS', open:true }] }),
        N.server('tld', { name:'TLD (.com)', x:57, y:50, mac:'R0:00:00:00:00:02',
                          ip:'192.5.6.30',
                          listening:[{ port:53, service:'DNS', open:true }] }),
        N.server('auth', { name:'Authoritative', x:57, y:84, mac:'R0:00:00:00:00:03',
                           ip:'199.43.135.53',
                           listening:[{ port:53, service:'DNS', open:true }] }),
        N.server('web', { name:'Web Server', x:88, y:50, mac:'WW:WW:WW:WW:WW:WW',
                          ip:'93.184.216.34',
                          listening:[{ port:80, service:'HTTP', open:true }] })
      ],
      links: [ N.link('client','res'), N.link('res','root'),
               N.link('res','tld'), N.link('res','auth'), N.link('res','web') ],
      hub:null, wire:null, banner:null, cache:{}, answer:null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var NAME = cfg.result === 'nx' ? 'nosuchname.example.com' : 'www.example.com';
    var IP = '93.184.216.34';

    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'info',
      title:'Browser-এর কাছে শুধু নাম আছে, IP নেই',
      what:'আপনি লিখলেন `' + NAME + '`। কিন্তু কোনো Packet পাঠাতে হলে দরকার একটি **IP Address** — নাম দিয়ে কিছুই হয় না।',
      why :'IP Header-এ `dstIP` নামের একটি ঘর আছে, যেখানে ৩২টি bit বসে। সেখানে "www.example.com" লেখার কোনো উপায় নেই।\n\nNetwork-এর কোনো স্তরই নাম বোঝে না — Router নাম দেখে না, Switch নাম দেখে না। নাম শুধু **মানুষের সুবিধার জন্য**।\n\nতাই আসল কাজ শুরু হওয়ার আগেই এই অনুবাদটি সেরে নিতে হয়। এটাই DNS-এর একমাত্র কাজ।',
      apply: function(st){ st.banner = NAME + ' → ?'; }
    });

    var qp = q(CLI_IP, CLI_MAC, RESOLVER.ip, RESOLVER.mac, NAME, null,
               'Query ' + NAME, 'client', 'res');
    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'info',
      title:'Recursive Query — Resolver-কে দায়িত্ব দেওয়া', packet:qp,
      what:'Browser তার Resolver-কে একটি প্রশ্ন পাঠাল: "`' + NAME + '`-এর IP কী?"\n\nএটি একটি **Recursive Query** — মানে "তুমি খুঁজে বের করো, আমি শুধু চূড়ান্ত উত্তরটা চাই"।',
      why :'"Recursive" শব্দটির অর্থ এখানে দায়িত্ব হস্তান্তর। Client বলছে: "আমি জানতে চাই না তুমি কোথায় কোথায় খুঁজবে। আমাকে শুধু উত্তরটা দাও, অথবা বলো যে নেই।"\n\nএই নকশাটি চমৎকার, কারণ এতে প্রতিটি device-কে DNS-এর পুরো গঠন জানতে হয় না। Client শুধু একটি ঠিকানা জানে — তার resolver-এর — আর ব্যস।\n\nআর সব কাজ যেহেতু কয়েকটি resolver-এই জমা হয়, তাদের cache খুব কার্যকর হয়ে ওঠে — একজনের প্রশ্নের উত্তর অন্য হাজার জনের কাজে লাগে।',
      apply: function(st){ st.wire = { pkt:qp, from:'client', to:'res' };
                           st.banner = 'recursive query → resolver'; }
    });

    /* ── Root → TLD → Authoritative ── */
    var chain = [
      { id:'root', ip:'198.41.0.4',     mac:'R0:00:00:00:00:01', name:'Root (.)',
        ref:'.com-এর TLD server', refIp:'192.5.6.30' },
      { id:'tld',  ip:'192.5.6.30',     mac:'R0:00:00:00:00:02', name:'TLD (.com)',
        ref:'example.com-এর Authoritative server', refIp:'199.43.135.53' }
    ];

    for(var i = 0; i < chain.length; i++){
      (function(c, idx){
        var out = q(RESOLVER.ip, RESOLVER.mac, c.ip, c.mac, NAME, null,
                    'Query → ' + c.name, 'res', c.id);
        steps.push({
          t:at(), actor:'res', layer:'L7', kind:'info',
          title:'Resolver জিজ্ঞেস করল ' + c.name + '-কে', packet:out,
          what:'Resolver `' + c.name + '`-কে একই প্রশ্ন করল।\n\nএগুলো **Iterative Query** — "তুমি যা জানো তাই বলো, না জানলে কার কাছে যাব তা বলে দাও"।',
          why : idx === 0
            ? 'Resolver Root-এর ঠিকানা আগে থেকেই জানে — বিশ্বের ১৩টি root server-এর ঠিকানা প্রতিটি resolver-এর ভেতরে লেখা থাকে। এটাই যাত্রার শুরুর বিন্দু।\n\nলক্ষ্য করুন এখানে দায়িত্বের ধরন উল্টো। Client resolver-কে বলেছিল "তুমি খুঁজে দাও" (recursive)। কিন্তু resolver root-কে বলছে "যতটুকু জানো বলো" (iterative)।\n\nএই পার্থক্যটি ইচ্ছাকৃত। Root server-কে যদি সবার হয়ে পুরো খোঁজাখুঁজি করতে হতো, তাহলে সে মুহূর্তেই ভেঙে পড়ত। সে শুধু দিক দেখায়, পথ হাঁটে না।'
            : 'Root কিন্তু উত্তর দেয়নি — সে শুধু বলেছে "`.com`-এর ব্যাপারটা ওদের জিজ্ঞেস করো"।\n\nএটাই DNS-এর মূল কাঠামো। কেউ সবকিছু জানে না, প্রত্যেকে শুধু **পরের ধাপটি** জানে।\n\nএই নকশার কারণেই DNS তিন দশক ধরে টিকে আছে এবং কোটি কোটি নাম সামলাতে পারছে। নতুন domain যোগ করতে root-কে কিছু জানানোর দরকার হয় না।',
          apply: function(st){ st.wire = { pkt:out, from:'res', to:c.id };
                               st.banner = 'iterative → ' + c.name; }
        });

        var back = q(c.ip, c.mac, RESOLVER.ip, RESOLVER.mac, NAME,
                     'Referral → ' + c.refIp, 'Referral', c.id, 'res', 'ack');
        steps.push({
          t:at(), actor:c.id, layer:'L7', kind:'warn',
          title:c.name + ': "আমি জানি না, ওদের জিজ্ঞেস করো"', packet:back,
          what:'`' + c.name + '` উত্তর দিতে পারল না। কিন্তু সে জানে কে পারবে — সে **' + c.ref + '**-এর ঠিকানা দিল: `' + c.refIp + '`।\n\nএকে বলে **Referral**।',
          why : idx === 0
            ? 'Root server-এর কাছে `www.example.com`-এর কোনো তথ্যই নেই — এবং সেটিই স্বাভাবিক। তার কাজ শুধু প্রতিটি TLD (`.com`, `.org`, `.net`, প্রতিটি দেশের নিজস্ব) কার দায়িত্বে তা মনে রাখা।\n\nএই ভাগাভাগিটাই DNS-কে বিশাল হতে দিয়েছে। Root-এর তালিকা ছোট ও প্রায় অপরিবর্তনীয়, অথচ তার নিচে কোটি কোটি নাম বসতে পারে।'
            : '`.com` TLD server কোটি কোটি `.com` domain-এর হিসাব রাখে — কিন্তু তাদের ভেতরের কিছুই জানে না। সে শুধু জানে `example.com`-এর দায়িত্ব কোন server-এর।\n\nএর অর্থ, `example.com`-এর মালিক নিজের ভেতরের যত নাম খুশি তৈরি করতে পারেন (`www`, `mail`, `api`, `blog`) — TLD-কে কিছুই জানাতে হয় না।\n\nএই স্বাধীনতাটিই DNS-এর সবচেয়ে বড় সাফল্য।',
          apply: function(st){ st.wire = { pkt:back, from:c.id, to:'res' };
                               st.banner = 'referral → ' + c.refIp; }
        });
      })(chain[i], i);
    }

    /* ── Authoritative ── */
    var aq = q(RESOLVER.ip, RESOLVER.mac, '199.43.135.53', 'R0:00:00:00:00:03',
               NAME, null, 'Query → Authoritative', 'res', 'auth');
    steps.push({
      t:at(), actor:'res', layer:'L7', kind:'info',
      title:'শেষ ধাপ — Authoritative server', packet:aq,
      what:'Resolver এবার আসল দায়িত্বপ্রাপ্ত server-কে জিজ্ঞেস করল।',
      why :'"Authoritative" মানে **চূড়ান্ত কর্তৃপক্ষ**। এই server-এর উত্তরই সত্য — সে অন্য কারো কাছ থেকে জেনে বলছে না, তথ্যটি তার নিজের।\n\n`example.com`-এর মালিক এই server-এই তাঁর record গুলো রাখেন। তিনি IP বদলালে এখানেই বদলে যায়, আর ধীরে ধীরে পুরো পৃথিবী নতুন উত্তর পেতে শুরু করে।',
      apply: function(st){ st.wire = { pkt:aq, from:'res', to:'auth' };
                           st.banner = 'authoritative-কে প্রশ্ন'; }
    });

    /* ── NXDOMAIN ── */
    if(cfg.result === 'nx'){
      var nx = q('199.43.135.53', 'R0:00:00:00:00:03', RESOLVER.ip, RESOLVER.mac,
                 NAME, 'NXDOMAIN', 'NXDOMAIN', 'auth', 'res', 'ack');
      steps.push({
        t:at(), actor:'auth', layer:'L7', kind:'error',
        title:'NXDOMAIN — এই নামটি নেই', packet:nx,
        what:'Authoritative server স্পষ্ট উত্তর দিল: **NXDOMAIN** — এই নামটির কোনো অস্তিত্ব নেই।',
        why :'এটি কিন্তু একটি **সফল** DNS lookup — উত্তরটাই "নেই"।\n\nআর এই উত্তরটি নির্ভরযোগ্য, কারণ যে দিয়েছে সে-ই এই domain-এর চূড়ান্ত কর্তৃপক্ষ। সে যদি বলে নেই, তাহলে নেই।\n\nবাস্তবে NXDOMAIN দেখলে প্রথমেই সন্দেহ করা উচিত **বানান ভুল**, অথবা DNS record টি এখনো তৈরি করা হয়নি।\n\nNXDOMAIN-ও cache হয় (negative caching) — যাতে একই ভুল নাম বারবার জিজ্ঞেস করে পুরো যাত্রাটি বারবার করতে না হয়।',
        apply: function(st){ st.wire = { pkt:nx, from:'auth', to:'res' };
                             st.banner = 'NXDOMAIN'; }
      });
      steps.push({
        t:at(), actor:'client', layer:'L7', kind:'error',
        title:'Browser: "এই ঠিকানা খুঁজে পাওয়া যায়নি"',
        what:'Resolver NXDOMAIN-টি Browser-কে জানাল। Browser দেখাল `DNS_PROBE_FINISHED_NXDOMAIN` জাতীয় একটি বার্তা।',
        why :'গুরুত্বপূর্ণ কথা — **কোনো connection চেষ্টাই হয়নি**। কোনো TCP handshake হয়নি, কোনো Packet ওই দিকে যায়ইনি।\n\nDNS ব্যর্থ হলে সবকিছু সেখানেই থেমে যায়, কারণ IP ছাড়া পরের কোনো ধাপ শুরুই করা যায় না।\n\nতাই debug করার সময় ক্রমটি মনে রাখা জরুরি: **আগে DNS, তারপর TCP, তারপর HTTP**। `dig` দিয়ে DNS ঠিক আছে কিনা দেখে নিলে অনেক সময় বাঁচে।',
        apply: function(st){ st.wire = null; st.banner = 'ব্যর্থ — নাম নেই'; }
      });
      return steps;
    }

    /* ── SERVFAIL ── */
    if(cfg.result === 'fail'){
      steps.push({
        t:at(), actor:'res', layer:'L7', kind:'warn',
        title:'Authoritative server কোনো উত্তর দিচ্ছে না',
        what:'Resolver অপেক্ষা করল, আবার জিজ্ঞেস করল, অন্য একটি nameserver-এও চেষ্টা করল। কোথাও থেকে কোনো উত্তর নেই।',
        why :'এটি NXDOMAIN থেকে সম্পূর্ণ আলাদা পরিস্থিতি।\n\nNXDOMAIN = "আমি নিশ্চিতভাবে জানি এই নাম নেই" — একটি **উত্তর**।\n\nএখানে = "আমি জানি না, জানার উপায়ও পাচ্ছি না" — উত্তরের **অনুপস্থিতি**।\n\nকারণ হতে পারে server বন্ধ, network-এ পৌঁছাচ্ছে না, বা Firewall আটকে দিচ্ছে।',
        apply: function(st){ st.wire = null; st.banner = 'কোনো উত্তর নেই…'; }
      });
      steps.push({
        t:at(), actor:'client', layer:'L7', kind:'error',
        title:'SERVFAIL — উত্তর পাওয়া গেল না',
        what:'Resolver হাল ছেড়ে **SERVFAIL** ফেরত দিল।',
        why :'দুটি ব্যর্থতার পার্থক্য মনে রাখা debugging-এ খুব কাজে দেয়:\n\n**NXDOMAIN** → নামটি সত্যিই নেই। বানান দেখুন, record তৈরি হয়েছে কিনা দেখুন।\n\n**SERVFAIL** → নামটি হয়তো আছে, কিন্তু জানা গেল না। Nameserver-এর অবস্থা দেখুন, তার দিকে পথ আছে কিনা দেখুন, DNSSEC যাচাই ব্যর্থ হচ্ছে কিনা দেখুন।\n\nSERVFAIL সাধারণত **সাময়িক**, NXDOMAIN সাধারণত **স্থায়ী**।',
        apply: function(st){ st.wire = null; st.banner = 'SERVFAIL'; }
      });
      return steps;
    }

    /* ── সফল উত্তর ── */
    var ans = q('199.43.135.53', 'R0:00:00:00:00:03', RESOLVER.ip, RESOLVER.mac,
                NAME, NAME + ' A ' + IP + ' (TTL 300)', 'A ' + IP, 'auth', 'res', 'ack');
    steps.push({
      t:at(), actor:'auth', layer:'L7', kind:'ok',
      title:'উত্তর পাওয়া গেল — A record', packet:ans,
      what:'Authoritative server উত্তর দিল:\n\n`' + NAME + ' A ' + IP + '` — সাথে `TTL 300`।',
      why :'**A record** মানে "এই নামের জন্য একটি IPv4 Address"। (IPv6-এর জন্য AAAA।)\n\nসাথের **TTL 300** সংখ্যাটি খুব গুরুত্বপূর্ণ — এর মানে "এই উত্তরটি ৩০০ সেকেন্ড পর্যন্ত ধরে রাখতে পারো"।\n\nএই একটিমাত্র সংখ্যা DNS-এর ভার বহুগুণ কমিয়ে দেয়। এটি না থাকলে প্রতিটি প্রশ্নের জন্য পুরো Root→TLD→Authoritative যাত্রা করতে হতো।\n\nTTL কত রাখা হবে সেটি একটি সিদ্ধান্ত: বড় TTL মানে কম ভার কিন্তু পরিবর্তনে দেরি; ছোট TTL মানে দ্রুত পরিবর্তন কিন্তু বেশি প্রশ্ন।',
      apply: function(st){ st.wire = { pkt:ans, from:'auth', to:'res' };
                           st.banner = 'A ' + IP + ' · TTL 300'; }
    });

    var fin = q(RESOLVER.ip, RESOLVER.mac, CLI_IP, CLI_MAC, NAME,
                NAME + ' A ' + IP, 'A ' + IP, 'res', 'client', 'ack');
    steps.push({
      t:at(), actor:'res', layer:'L7', kind:'ok',
      title:'Resolver উত্তরটি cache করল, তারপর Browser-কে দিল', packet:fin,
      what:'Resolver উত্তরটি নিজের cache-এ ৩০০ সেকেন্ডের জন্য রেখে দিল, তারপর Browser-কে পাঠাল।\n\nBrowser-এর কাছে এটি ছিল **একটি প্রশ্ন, একটি উত্তর** — মাঝের চারটি যাত্রার কিছুই সে দেখেনি।',
      why :'পেছনে ফিরে গুনে দেখুন — Root, TLD, Authoritative মিলিয়ে **অন্তত তিনটি আলাদা RTT** খরচ হয়েছে।\n\nএজন্যই প্রথমবার কোনো site খুলতে DNS-এ কয়েকশো মিলিসেকেন্ড লাগতে পারে।\n\nকিন্তু এখন উত্তরটি cache-এ আছে। পরের বার — শুধু আপনার জন্য নয়, **এই resolver ব্যবহার করা সবার জন্য** — উত্তর আসবে প্রায় সঙ্গে সঙ্গে।\n\nএই cache-এর কার্যকারিতাই DNS-কে বাস্তবে ব্যবহারযোগ্য করে তুলেছে। DNS Cache lab-এ এর ভালো ও খারাপ দুই দিকই দেখা যাবে।',
      apply: function(st){
        st.wire = { pkt:fin, from:'res', to:'client' };
        var c = {}; c[NAME] = { ip:IP, ttl:300 };
        st.cache = c; st.answer = IP;
        for(var d = 0; d < st.devices.length; d++){
          if(st.devices[d].id === 'res') st.devices[d].note = 'cache: 1';
          if(st.devices[d].id === 'client') st.devices[d].note = IP;
        }
        st.banner = 'Browser পেল ' + IP;
      }
    });

    var http = P.make([
      P.ethernet(CLI_MAC, 'WW:WW:WW:WW:WW:WW', 'ip'),
      P.ip(CLI_IP, IP, 64, 'tcp', 40),
      P.tcp(49152, 80, 1000, 0, 'SYN', 64240)
    ], { label:'SYN → ' + IP, kind:'ack', from:'client', to:'web' });

    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'ok',
      title:'এবার আসল কাজ শুরু — TCP handshake', packet:http,
      what:'IP হাতে আসার পর Browser এতক্ষণে **আসল** connection শুরু করল — `' + IP + '`-এ একটি SYN।',
      why :'এই ধাপটি মনে রাখার মতো, কারণ এটি একটি সাধারণ ভুল ধারণা ভাঙে।\n\nDNS আর HTTP **সম্পূর্ণ আলাদা দুটি কথোপকথন**, আলাদা protocol, আলাদা server, প্রায়ই আলাদা transport (DNS-এ UDP, HTTP-তে TCP)।\n\nDNS server আপনার page দেয় না। সে শুধু ঠিকানা দিয়েছে, তারপর তার কাজ শেষ।\n\nএই আলাদা হওয়ার কারণেই debug-এ ধাপে ধাপে এগোনো যায় — `dig` দিয়ে DNS পরীক্ষা করা, তারপর `curl` দিয়ে HTTP। এক ধাপ ঠিক থাকলে পরের ধাপে যাওয়া যায়।',
      apply: function(st){ st.wire = { pkt:http, from:'client', to:'web' };
                           st.banner = 'DNS শেষ · HTTP শুরু'; }
    });

    return steps;
  }
};

})(window.NetLab);
