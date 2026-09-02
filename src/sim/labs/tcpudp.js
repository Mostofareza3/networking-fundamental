/* ═══════════════════════════════════════════════════════════════════
   LAB · TCP vs UDP — একই কাজ, দুই পথ
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI_IP = '192.168.1.10', SRV_IP = '10.0.0.50';
var CLI_MAC = 'AA:AA:AA:AA:AA:AA', SRV_MAC = 'SS:SS:SS:SS:SS:SS';

function udpHdr(sp, dp, len){
  return { name:'UDP Header', layer:'L4', size:8,
    fields:[ ['srcPort', String(sp)], ['dstPort', String(dp)],
             ['ipLen', String(len + 8) + ' bytes'],
             ['fcs', 'checksum — নষ্ট ধরা পড়ে, ঠিক হয় না'] ] };
}

NS.labs.tcpudp = {
  id: 'tcpudp',
  title: 'TCP vs UDP — পাশাপাশি',
  group: 'Phase 3 · Layer 4',
  chapter: 'ch24',
  blurb: 'একই ৩টি টুকরো data, একটি হারায়। TCP আর UDP দুজনে কী করে — মিলিয়ে দেখুন।',

  learn: [
    'একই ঘটনায় TCP আর UDP-র আচরণ ঠিক কোথায় আলাদা হয়',
    'Reliability-র দাম কী — সময়ে ও জটিলতায়',
    'কোন প্রশ্নটি জিজ্ঞেস করলে সঠিক protocol বাছা যায়',
    'কোনটি "ভালো" নয় — কোনটি কোন কাজের জন্য'
  ],

  mistakes: [
    { m:'গুরুত্বপূর্ণ data-র জন্য TCP, কম গুরুত্বপূর্ণের জন্য UDP।',
      r:'গুরুত্বের সাথে সম্পর্ক নেই — সম্পর্ক **সময়ের** সাথে। DNS query খুবই গুরুত্বপূর্ণ, তবু UDP-তে যায়। প্রশ্নটি হলো: "দেরিতে আসা data-টি কি এখনো কাজে লাগবে?" লাগলে TCP, না লাগলে UDP।' },
    { m:'UDP ব্যবহার করলে reliability পাওয়াই যায় না।',
      r:'পাওয়া যায় — কিন্তু আপনাকে **নিজে বানাতে হয়**, ঠিক যতটুকু দরকার ততটুকু। QUIC এটিই করেছে: UDP-র উপরে বসে নিজের retransmission ও ordering বানিয়েছে, কিন্তু TCP-র Head-of-Line Blocking ছাড়া।' },
    { m:'TCP ধীর, তাই performance দরকার হলে UDP।',
      r:'ভালো network-এ TCP-র overhead নগণ্য। TCP ধীর হয় তখনই যখন **Packet হারায়** — কারণ তখন সে অপেক্ষা করে। সমস্যাটি "TCP ধীর" নয়, সমস্যাটি "TCP অপেক্ষা করে"। যেখানে অপেক্ষা ক্ষতিকর সেখানেই কেবল UDP।' }
  ],

  controls: [
    { key:'proto', type:'choice', label:'কোন protocol', def:'tcp',
      options:[ ['tcp','TCP — হারালে আবার পাঠায়'],
                ['udp','UDP — হারালে ভুলে যায়'] ],
      help:'দুটিই চালিয়ে ধাপের সংখ্যা আর শেষ ফলাফল মিলিয়ে দেখুন।' }
  ],

  build: function(cfg){
    var isTcp = !cfg || cfg.proto !== 'udp';
    return {
      devices: [
        N.pc('client', { name:'Client', x:18, y:50, mac:CLI_MAC, ip:CLI_IP,
                         note: isTcp ? 'TCP' : 'UDP' }),
        N.server('server', { name:'Server', x:82, y:50, mac:SRV_MAC, ip:SRV_IP,
                             listening:[{ port: isTcp ? 80 : 5004,
                                          service: isTcp ? 'TCP' : 'UDP', open:true }],
                             note: isTcp ? 'TCP' : 'UDP' })
      ],
      links: [ N.link('client','server') ],
      hub:null, wire:null, banner:null,
      got:[], steps:0
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var isTcp = cfg.proto !== 'udp';
    var SP = 49152, DP = isTcp ? 80 : 5004;

    function mk(n, seq, label, kind){
      var layers = [
        P.ethernet(CLI_MAC, SRV_MAC, 'ip'),
        P.ip(CLI_IP, SRV_IP, 64, isTcp ? 'tcp' : 'udp', (isTcp ? 60 : 48))
      ];
      layers.push(isTcp ? P.tcp(SP, DP, seq, 1, 'PSH, ACK', 64240) : udpHdr(SP, DP, 20));
      layers.push(P.data('টুকরো ' + n));
      return P.make(layers, { label:label, kind:kind || 'data', from:'client', to:'server' });
    }
    function ackOf(no, dup){
      return P.make([
        P.ethernet(SRV_MAC, CLI_MAC, 'ip'),
        P.ip(SRV_IP, CLI_IP, 64, 'tcp', 40),
        P.tcp(DP, SP, 1, no, 'ACK', 65535)
      ], { label:'ACK ' + no + (dup ? ' dup' : ''), kind:'ack',
           from:'server', to:'client' });
    }

    /* TCP হলে আগে handshake — এটাই প্রথম পার্থক্য */
    if(isTcp){
      var syn = P.make([
        P.ethernet(CLI_MAC, SRV_MAC, 'ip'),
        P.ip(CLI_IP, SRV_IP, 64, 'tcp', 40),
        P.tcp(SP, DP, 0, 0, 'SYN', 64240)
      ], { label:'SYN', kind:'ack', from:'client', to:'server' });
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'info',
        title:'TCP: আগে handshake (৩টি Packet)', packet:syn,
        what:'কোনো data পাঠানোর আগেই SYN → SYN-ACK → ACK — তিনটি Packet এবং এক RTT সময়।',
        why :'এই খরচটি ছোট কাজের জন্য বড় হয়ে দাঁড়ায়।\n\nমাত্র ২০ byte পাঠাতে চাইলে ৩টি Packet আগে খরচ করতে হচ্ছে। UDP এই ধাপটি সম্পূর্ণ এড়িয়ে যায়।\n\nতবে connection বেশিক্ষণ চললে এই এককালীন খরচ নগণ্য হয়ে যায় — এজন্যই Keep-Alive এত গুরুত্বপূর্ণ।',
        apply: function(st){ st.wire = { pkt:syn, from:'client', to:'server' };
                             st.banner = 'handshake — data-র আগে ৩ Packet'; }
      });
    } else {
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'info',
        title:'UDP: কোনো handshake নেই',
        what:'প্রথম Packet-ই আসল data নিয়ে যাচ্ছে। কোনো প্রস্তুতি নেই।',
        why :'শূন্য setup খরচ। এক RTT বেঁচে গেল।\n\nএর একটি দামও আছে — Server জানেই না কেউ কথা বলতে আসছে। কোনো state নেই, কোনো connection নেই। প্রতিটি datagram সম্পূর্ণ স্বাধীন।',
        apply: function(st){ st.banner = 'সরাসরি data'; }
      });
    }

    /* তিনটি টুকরো, দ্বিতীয়টি হারায় — দুই protocol-এ একই ঘটনা */
    for(var i = 0; i < 3; i++){
      (function(n){
        var lost = n === 2;
        var p = mk(n, 1 + (n - 1) * 20, '#' + n + (lost ? ' ✗' : ''));
        steps.push({
          t:at(), actor:'client', layer:'L4', kind: lost ? 'warn' : 'info',
          title:'টুকরো ' + n + ' পাঠানো হলো' + (lost ? ' — হারিয়ে গেল' : ''), packet:p,
          what:'টুকরো ' + n + ' গেল।' + (lost ? '\n\n**পথে হারিয়ে গেল** — Router-এর queue ভরা ছিল।' : ''),
          why : lost
            ? 'ঘটনাটি দুই protocol-এই **হুবহু একই**। Network জানেই না উপরে কে বসে আছে — সে TCP আর UDP-র মধ্যে পার্থক্য করে না।\n\nপার্থক্য শুরু হয় এর **পরে** — কে কী প্রতিক্রিয়া দেখায় তা নিয়ে।'
            : (isTcp
                ? 'TCP প্রতিটি byte-এর হিসাব রাখছে — sequence number দিয়ে। পরে দরকার হলে ঠিক কোনটি হারিয়েছে বলতে পারবে।'
                : 'UDP কোনো হিসাব রাখছে না। পাঠিয়েই ভুলে যাচ্ছে। Header-এ sequence number-এর জায়গাই নেই।'),
          apply: function(st){
            st.wire = { pkt:p, from:'client', to:'server' };
            if(!lost) st.got = st.got.concat([n]);
            st.banner = '#' + n + (lost ? ' হারাল' : ' পৌঁছাল');
          }
        });

        if(isTcp && !lost){
          /* #২ হারানোয় cumulative ACK ২১-এই আটকে থাকে — ৩ পেলেও এগোতে পারে না */
          var expect = 21;
          var a = ackOf(expect, n === 3);
          steps.push({
            t:at(), actor:'server', layer:'L4', kind: n === 3 ? 'warn' : 'ok',
            title:'ACK ' + expect + (n === 3 ? ' — আবার একই (duplicate)' : ''), packet:a,
            what: n === 3
              ? 'Server টুকরো ৩ পেল, কিন্তু আবারও পাঠাল `ack=21` — কারণ ২ নম্বরের ফাঁকটি এখনো খালি।'
              : 'Server `ack=21` পাঠাল — "টুকরো ১ পেয়েছি"।',
            why : n === 3
              ? 'এই duplicate ACK-ই TCP-র সংকেত ব্যবস্থা। UDP-তে এমন কোনো সংকেত নেই, কারণ ACK-ই নেই।'
              : 'TCP প্রতিটি পাওয়া data-র স্বীকৃতি দেয়। এই স্বীকৃতির ধারা থেকেই সে বুঝতে পারে কী পৌঁছেছে আর কী পৌঁছায়নি।',
            apply: function(st){ st.wire = { pkt:a, from:'server', to:'client' };
                                 st.banner = 'ACK ' + expect; }
          });
        }
      })(i + 1);
    }

    /* ── এখানেই আসল পার্থক্য ── */
    if(isTcp){
      var rp = mk(2, 21, '#2 (আবার)');
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'ok',
        title:'TCP: হারানো টুকরো আবার পাঠাল', packet:rp,
        what:'Duplicate ACK দেখে Client বুঝল টুকরো ২ হারিয়েছে, এবং সেটি আবার পাঠাল।',
        why :'এই পুনরায় পাঠানোই TCP-র মূল প্রতিশ্রুতি। কিন্তু খেয়াল করুন এর **দাম**:\n\n• অতিরিক্ত সময় লেগেছে (অন্তত এক RTT)\n• ততক্ষণ পর্যন্ত টুকরো ৩ Server-এর buffer-এ **আটকে ছিল**, application পায়নি\n\nদ্বিতীয় খরচটিই বেশি গুরুতর — একটি টুকরোর জন্য পরেরগুলোও থেমে থাকল।',
        apply: function(st){ st.wire = { pkt:rp, from:'client', to:'server' };
                             st.got = st.got.concat([2]);
                             st.banner = 'retransmit #2'; }
      });
      steps.push({
        t:at(), actor:'server', layer:'L7', kind:'ok',
        title:'Application পেল তিনটিই — ঠিক ক্রমে',
        what:'Application পেল: `টুকরো ১`, `টুকরো ২`, `টুকরো ৩` — সম্পূর্ণ এবং সঠিক ক্রমে।\n\nমোট Packet লেগেছে: handshake ৩ + data ৪ + ACK ৩ = **১০টি**।',
        why :'TCP তার প্রতিশ্রুতি রেখেছে। Application কিছুই টের পায়নি — না হারানো, না retransmit, না অপেক্ষা।\n\nএটি ঠিক তখনই সঠিক বাছাই যখন **অসম্পূর্ণ data অর্থহীন**। অর্ধেক HTML দিয়ে কিছুই হয় না, ৯৯% ঠিক file নষ্ট file।\n\nএখন `UDP` চালিয়ে দেখুন — একই ঘটনায় সে কী করে, আর কয়টি Packet লাগে।',
        apply: function(st){ st.wire = null; st.banner = 'সম্পূর্ণ · ১০ Packet'; }
      });
    } else {
      steps.push({
        t:at(), actor:'server', layer:'L7', kind:'warn',
        title:'UDP: Application পেল দুটি — মাঝেরটি নেই',
        what:'Application পেল: `টুকরো ১`, `টুকরো ৩`। টুকরো ২ চিরতরে হারিয়ে গেছে।\n\nমোট Packet লেগেছে: **৩টি**।',
        why :'TCP-তে লেগেছিল ১০টি Packet, এখানে ৩টি। কোনো অপেক্ষা হয়নি, টুকরো ৩ সঙ্গে সঙ্গেই পৌঁছেছে।\n\n**কোনটি ভালো?** প্রশ্নটাই ভুল। উত্তর নির্ভর করে data-টি কী তার উপর:\n\n• এটি যদি একটি HTML file-এর অংশ হয় → বিপর্যয়। অসম্পূর্ণ page অর্থহীন।\n\n• এটি যদি ২০ms audio হয় → ঠিক আছে। শ্রোতা একটু খচখচ শুনল, কথোপকথন চলতে থাকল।\n\n• এটি যদি একটি game-এ খেলোয়াড়ের অবস্থান হয় → **ভালোই হয়েছে**। পরের update তো এসেই গেছে, আর সেটিই নতুন। পুরনো অবস্থান আবার চেয়ে কী লাভ?\n\nএই তৃতীয় উদাহরণটিই সবচেয়ে স্পষ্ট করে দেখায়: কখনো কখনো **হারানো data আবার চাওয়াটাই ভুল সিদ্ধান্ত**।',
        apply: function(st){ st.wire = null; st.banner = 'অসম্পূর্ণ · ৩ Packet'; }
      });
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'info',
        title:'বাছাইয়ের প্রশ্নটি',
        what:'সঠিক protocol বাছতে একটিই প্রশ্ন যথেষ্ট:\n\n**"দেরিতে আসা এই data-টি কি তখনো কাজে লাগবে?"**',
        why :'**লাগবে** → TCP। File, HTML, API response, database query — এসবের ক্ষেত্রে দেরি বিরক্তিকর, কিন্তু অসম্পূর্ণতা মারাত্মক।\n\n**লাগবে না** → UDP। Live audio, video, game state, metric — এখানে পুরনো data নতুন data-র চেয়ে খারাপ, তাই অপেক্ষা করার কোনো মানে হয় না।\n\nআর তৃতীয় একটি পথও আছে — **QUIC**। সে UDP-র উপরে বসে নিজের reliability বানিয়েছে, কিন্তু প্রতিটি stream-কে আলাদা রেখেছে। ফলে এক stream-এ Packet হারালে অন্য stream আটকায় না। TCP-র সবচেয়ে বড় দুর্বলতাটির উত্তর এখানেই।',
        apply: function(st){ st.banner = 'প্রশ্ন: দেরিতে এলে কি কাজে লাগবে?'; }
      });
    }

    return steps;
  }
};

})(window.NetLab);
