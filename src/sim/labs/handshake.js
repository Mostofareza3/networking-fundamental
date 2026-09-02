/* ═══════════════════════════════════════════════════════════════════
   LAB · TCP Three-Way Handshake — কথা বলার আগে হাত মেলানো
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI_IP = '192.168.1.10', SRV_IP = '93.184.216.34';
var CLI_MAC = 'AA:AA:AA:AA:AA:AA', SRV_MAC = 'SS:SS:SS:SS:SS:SS';

/* Client ও Server দুজনেই নিজের ISN নিজে বাছে — এখানে স্থির রাখা হয়েছে
   যাতে প্রতিবার একই সংখ্যা দেখে শেখা সহজ হয়। */
var CSEQ = 1000, SSEQ = 5000;

function seg(sp, dp, seq, ack, flags, win, label, from, to, kind){
  return P.make([
    P.ethernet(from === 'client' ? CLI_MAC : SRV_MAC,
               from === 'client' ? SRV_MAC : CLI_MAC, 'ip'),
    P.ip(from === 'client' ? CLI_IP : SRV_IP,
         from === 'client' ? SRV_IP : CLI_IP, 64, 'tcp', 40),
    P.tcp(sp, dp, seq, ack, flags, win)
  ], { label:label, kind:kind || 'data', from:from, to:to });
}

NS.labs.handshake = {
  id: 'handshake',
  title: 'TCP Three-Way Handshake',
  group: 'Phase 3 · Layer 4',
  chapter: 'ch18',
  blurb: 'কোনো data পাঠানোর আগেই তিনটি Packet যায়-আসে। কেন তিনটি — দুটিতে হয় না কেন?',

  learn: [
    'SYN, SYN-ACK, ACK — প্রতিটি Packet ঠিক কী কাজ করে',
    'তিনটি কেন লাগে — দুটিতে কী অসম্পূর্ণ থেকে যায়',
    'Sequence Number কোথা থেকে আসে এবং ACK Number কীভাবে হিসাব হয়',
    'Server-এর port বন্ধ থাকলে RST কেন আসে, আর ফেলে দিলে কেন শুধু নীরবতা'
  ],

  mistakes: [
    { m:'Handshake-এর মধ্যেই আসল data চলে যায়।',
      r:'সাধারণ TCP handshake-এ কোনো application data থাকে না — তিনটি Packet-ই শুধু **নিয়ন্ত্রণের** জন্য। আসল data যায় চতুর্থ Packet থেকে। এজন্যই নতুন connection-এ অন্তত এক RTT সময় নষ্ট হয়।' },
    { m:'SYN মানে "connection তৈরি হলো"।',
      r:'SYN মানে শুধু "আমি শুরু করতে চাই, আমার Sequence Number এই"। Connection তৈরি হয় তখনই যখন **দুই পক্ষই** একে অপরের Sequence Number স্বীকার করে নেয় — সেটিই তৃতীয় Packet-এর কাজ।' },
    { m:'Three-Way Handshake নিরাপত্তা দেয়, তাই TCP নিরাপদ।',
      r:'Handshake শুধু নিশ্চিত করে দুই পক্ষ পরস্পরকে **শুনতে পাচ্ছে** এবং Sequence Number-এ একমত। এতে কোনো encryption নেই, কোনো পরিচয় যাচাই নেই। Encryption আসে TLS থেকে, TCP-র উপরে আলাদা একটি স্তর হিসেবে।' }
  ],

  controls: [
    { key:'mode', type:'choice', label:'Server-এর অবস্থা', def:'open',
      options:[ ['open','Port খোলা — স্বাভাবিক handshake'],
                ['closed','Port বন্ধ — RST আসবে'],
                ['drop','Firewall চুপচাপ ফেলে দিচ্ছে'] ],
      help:'তিনটি অবস্থার পার্থক্যটাই debugging-এ সবচেয়ে কাজে লাগে।' }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Client', x:18, y:50, mac:CLI_MAC, ip:CLI_IP,
                         gw:'192.168.1.1', note:'CLOSED' }),
        N.server('server', { name:'Web Server', x:82, y:50, mac:SRV_MAC, ip:SRV_IP,
                             listening:[{ port:80, service:'HTTP', open:true }],
                             note:'LISTEN' })
      ],
      links: [ N.link('client','server') ],
      hub:null, wire:null, banner:null, stack:null,
      cstate:'CLOSED', sstate:'LISTEN'
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var SP = 49152, DP = 80;

    /* device-এর গায়ে TCP state দেখানো — connection কোন পর্যায়ে আছে বোঝা যায় */
    function setState(st, c, s){
      for(var i = 0; i < st.devices.length; i++){
        if(st.devices[i].id === 'client' && c){ st.devices[i].note = c; st.cstate = c; }
        if(st.devices[i].id === 'server' && s){ st.devices[i].note = s; st.sstate = s; }
      }
    }

    /* ── ধাপ ১: SYN ── */
    var syn = seg(SP, DP, CSEQ, 0, 'SYN', 64240, 'SYN seq=' + CSEQ, 'client', 'server');
    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'info',
      title:'১ম Packet — SYN পাঠানো হলো', packet:syn,
      what:'Client একটি **SYN** segment পাঠাল। এতে কোনো data নেই — শুধু `seq=' + CSEQ + '` আর SYN flag।\n\nClient এখন `SYN_SENT` অবস্থায় অপেক্ষা করছে।',
      why :'TCP একটি byte-stream protocol — প্রতিটি byte-এর একটি ক্রমিক নম্বর থাকে। কিন্তু গণনা শুরু হবে কোন সংখ্যা থেকে?\n\nClient নিজেই একটি শুরুর সংখ্যা (Initial Sequence Number) বেছে নেয় এবং SYN-এর মাধ্যমে Server-কে জানায়: "আমার গণনা ' + CSEQ + ' থেকে শুরু হচ্ছে।"\n\nসংখ্যাটি সবসময় ০ থেকে শুরু হয় না — এলোমেলো বাছা হয়, যাতে পুরনো connection-এর ভেসে থাকা Packet নতুন connection-এ ভুল করে ঢুকে না পড়ে।',
      apply: function(st){
        st.wire = { pkt:syn, from:'client', to:'server' };
        setState(st, 'SYN_SENT', null);
        st.banner = 'SYN → seq=' + CSEQ;
      }
    });

    /* ── Port বন্ধ: RST ── */
    if(cfg.mode === 'closed'){
      var rst = seg(DP, SP, 0, CSEQ + 1, 'RST, ACK', 0, 'RST', 'server', 'client', 'ack');
      steps.push({
        t:at(), actor:'server', layer:'L4', kind:'error',
        title:'Port বন্ধ — Server RST পাঠাল', packet:rst,
        what:'Server-এর ৮০ নম্বর port-এ কোনো application listen করছে না। তাই সে সঙ্গে সঙ্গে একটি **RST** (Reset) পাঠিয়ে দিল।',
        why :'RST মানে সাফ কথা — "এখানে কেউ নেই, চেষ্টা কোরো না।"\n\nএটি আসলে ভালো ব্যবহার। Client সঙ্গে সঙ্গে জানতে পারল, অপেক্ষা করতে হলো না।\n\nএই কারণেই বন্ধ port-এ `curl` চালালে **সঙ্গে সঙ্গে** `Connection refused` আসে — কোনো দেরি হয় না।',
        apply: function(st){
          st.wire = { pkt:rst, from:'server', to:'client' };
          setState(st, 'CLOSED', 'LISTEN');
          st.banner = 'RST — Connection refused';
        }
      });
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'error',
        title:'Connection refused',
        what:'Client RST পেয়ে চেষ্টা ছেড়ে দিল। Application একটি `Connection refused` error পেল।',
        why :'লক্ষ্য করুন — Packet কিন্তু গন্তব্যে **পৌঁছেছিল**। Network ঠিক ছিল, route ঠিক ছিল, Server চালু ছিল। শুধু ওই port-এ কোনো service ছিল না।\n\nতাই `Connection refused` দেখলে network নিয়ে চিন্তা না করে বরং দেখা উচিত — service টি কি আদৌ চালু আছে? ঠিক port-এ আছে তো?\n\nএর সাথে `Connection timed out`-এর পার্থক্যটা `drop` mode-এ দেখুন।',
        apply: function(st){ st.wire = null; st.banner = 'Connection refused'; }
      });
      return steps;
    }

    /* ── Firewall চুপচাপ ফেলে দিচ্ছে ── */
    if(cfg.mode === 'drop'){
      for(var r = 1; r <= 3; r++){
        (function(n){
          var re = seg(SP, DP, CSEQ, 0, 'SYN', 64240, 'SYN (retry ' + n + ')', 'client', 'server');
          steps.push({
            t:at(), actor:'client', layer:'L4', kind:'warn',
            title:'কোনো উত্তর নেই — SYN আবার পাঠানো হলো (' + n + ')', packet:re,
            what:'কোনো উত্তর আসেনি। Client আবার SYN পাঠাল।\n\nপ্রতিবার অপেক্ষার সময় **দ্বিগুণ** হচ্ছে — ১ সেকেন্ড, ২ সেকেন্ড, ৪ সেকেন্ড…',
            why :'Firewall Packet-টি ফেলে দিয়েছে কিন্তু কিছুই জানায়নি। Client-এর কাছে "ফেলে দেওয়া হয়েছে" আর "এখনো পথে আছে" — এই দুটো অবস্থা দেখতে **একদম একরকম**। নীরবতা।\n\nতাই সে ধরে নেয় Packet হারিয়ে গেছে এবং আবার পাঠায়। বারবার অপেক্ষার সময় দ্বিগুণ করাকে বলে exponential backoff — এতে সত্যিই যদি network ব্যস্ত থাকে, তাহলে বারবার চেষ্টা করে সেটিকে আরও ব্যস্ত করা হয় না।',
            apply: function(st){
              st.wire = { pkt:re, from:'client', to:'server' };
              setState(st, 'SYN_SENT', null);
              st.banner = 'retry ' + n + ' — কোনো উত্তর নেই';
            }
          });
        })(r);
      }
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'error',
        title:'Connection timed out',
        what:'কয়েকবার চেষ্টার পর Client হাল ছেড়ে দিল। Application পেল `Connection timed out`।',
        why :'এখানেই `Connection refused`-এর সাথে আসল পার্থক্য:\n\n`Connection refused` = **সঙ্গে সঙ্গে** — কেউ একজন RST দিয়ে উত্তর দিয়েছে। Packet পৌঁছেছে।\n\n`Connection timed out` = **দীর্ঘ অপেক্ষার পর** — কেউ কিছুই বলেনি। সাধারণত Firewall চুপচাপ ফেলে দিয়েছে, অথবা Packet পথই খুঁজে পায়নি।\n\nDebugging-এ এই পার্থক্যটাই প্রথম সূত্র। কতক্ষণে error এলো — সেটাই বলে দেয় সমস্যা কোথায়।',
        apply: function(st){ st.wire = null; setState(st, 'CLOSED', null); st.banner = 'timed out'; }
      });
      return steps;
    }

    /* ── ধাপ ২: SYN-ACK ── */
    var synack = seg(DP, SP, SSEQ, CSEQ + 1, 'SYN, ACK', 65535,
                     'SYN-ACK seq=' + SSEQ + ' ack=' + (CSEQ + 1), 'server', 'client', 'ack');
    steps.push({
      t:at(), actor:'server', layer:'L4', kind:'ok',
      title:'২য় Packet — SYN-ACK', packet:synack,
      what:'Server একটি Packet-এ **দুটি কাজ** একসাথে করল:\n\n• **ACK** `ack=' + (CSEQ + 1) + '` — "তোমার SYN পেয়েছি"\n• **SYN** `seq=' + SSEQ + '` — "আমারও একটা শুরুর সংখ্যা আছে, এই নাও"',
      why :'গুরুত্বপূর্ণ কথা — TCP connection **দ্বিমুখী**। Data দুই দিকেই যাবে। তাই দুই দিকের জন্য দুটি আলাদা Sequence Number দরকার।\n\nএজন্য Server-কেও নিজের SYN পাঠাতে হয়। কিন্তু সে সেটি আলাদা Packet-এ না পাঠিয়ে ACK-এর সাথেই জুড়ে দেয় — একটি Packet বাঁচল।\n\n**ack=' + (CSEQ + 1) + ' কেন, ' + CSEQ + ' নয়?** ACK Number মানে "এর আগ পর্যন্ত সব পেয়েছি, **এখন এটি আশা করছি**"। SYN নিজেই একটি ক্রমিক নম্বর দখল করে, তাই পরের প্রত্যাশিত byte হলো ' + (CSEQ + 1) + '।',
      apply: function(st){
        st.wire = { pkt:synack, from:'server', to:'client' };
        setState(st, null, 'SYN_RCVD');
        st.banner = 'SYN-ACK → seq=' + SSEQ + ' ack=' + (CSEQ + 1);
      }
    });

    /* ── ধাপ ৩: ACK ── */
    var ack = seg(SP, DP, CSEQ + 1, SSEQ + 1, 'ACK', 64240,
                  'ACK ack=' + (SSEQ + 1), 'client', 'server', 'ack');
    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'ok',
      title:'৩য় Packet — ACK, connection তৈরি', packet:ack,
      what:'Client উত্তর দিল `ack=' + (SSEQ + 1) + '` — "তোমার SYN-ও পেয়েছি।"\n\nConnection এখন **ESTABLISHED**। এবার data যেতে পারে।',
      why :'**এখানেই তিনটি Packet কেন লাগে তার উত্তর।**\n\nদুটি Packet-এর পর কে কী জানত?\n\n• Client জানত — তার কথা Server শুনেছে (SYN-ACK এসেছে, তার মানে SYN পৌঁছেছিল)\n• Server জানত না — তার SYN-ACK আদৌ পৌঁছেছে কিনা\n\nএই তৃতীয় ACK Server-কে সেই নিশ্চয়তা দেয়। এখন **দুই পক্ষই জানে যে দুই দিকের পথ কাজ করছে**।\n\nএর কমে হয় না। আর বেশিও লাগে না — তিনটিই যথেষ্ট।',
      apply: function(st){
        st.wire = { pkt:ack, from:'client', to:'server' };
        setState(st, 'ESTABLISHED', 'ESTABLISHED');
        st.banner = 'ESTABLISHED — এবার data যেতে পারে';
      }
    });

    /* ── ধাপ ৪: প্রথম আসল data ── */
    var req = P.make([
      P.ethernet(CLI_MAC, SRV_MAC, 'ip'),
      P.ip(CLI_IP, SRV_IP, 64, 'tcp', 100),
      P.tcp(SP, DP, CSEQ + 1, SSEQ + 1, 'PSH, ACK', 64240),
      P.data('GET / HTTP/1.1')
    ], { label:'GET /', kind:'data', from:'client', to:'server' });

    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'ok',
      title:'৪র্থ Packet — এবার আসল data', packet:req,
      what:'এতক্ষণে প্রথম আসল data গেল — `GET / HTTP/1.1`।\n\nলক্ষ্য করুন `seq=' + (CSEQ + 1) + '` — যেখানে SYN শেষ করেছিল ঠিক সেখান থেকেই data শুরু।',
      why :'এই চতুর্থ Packet-টিই বুঝিয়ে দেয় handshake-এর আসল দাম।\n\nআপনার browser যখন নতুন কোনো site-এ যায়, তখন **একটি byte HTML আসার আগেই** এক RTT সময় চলে যায় শুধু হাত মেলাতে। Server ২০০ms দূরে হলে ২০০ms নষ্ট, তারপর data শুরু।\n\nএই কারণেই connection **পুনর্ব্যবহার** করা এত গুরুত্বপূর্ণ (HTTP Keep-Alive), আর এই কারণেই QUIC handshake-কে TLS-এর সাথে মিশিয়ে ফেলার চেষ্টা করেছে।',
      apply: function(st){ st.wire = { pkt:req, from:'client', to:'server' }; st.banner = 'data চলছে'; }
    });

    return steps;
  }
};

})(window.NetLab);
