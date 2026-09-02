/* ═══════════════════════════════════════════════════════════════════
   LAB · TCP Ordering — উল্টো ক্রমে এলে কী হয়
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI_IP = '192.168.1.10', SRV_IP = '93.184.216.34';
var CLI_MAC = 'AA:AA:AA:AA:AA:AA', SRV_MAC = 'SS:SS:SS:SS:SS:SS';
var MSS = 100, BASE = 1;

/* পাঠানোর ক্রম বনাম পৌঁছানোর ক্রম — এই lab-এর পুরো বিষয়টাই এই দুটির পার্থক্য */
var WORD = { 1:'"নেট"', 101:'"ওয়ার্কিং"', 201:'" শেখা"', 301:'" সহজ"' };

function dseg(seq){
  return P.make([
    P.ethernet(CLI_MAC, SRV_MAC, 'ip'),
    P.ip(CLI_IP, SRV_IP, 64, 'tcp', 40 + MSS),
    P.tcp(49152, 80, seq, 1, 'PSH, ACK', 64240),
    P.data(WORD[seq] || ('data ' + seq))
  ], { label:'seq=' + seq, kind:'data', from:'client', to:'server' });
}
function ackseg(ackNo, dup){
  return P.make([
    P.ethernet(SRV_MAC, CLI_MAC, 'ip'),
    P.ip(SRV_IP, CLI_IP, 64, 'tcp', 40),
    P.tcp(80, 49152, 1, ackNo, 'ACK', 65535)
  ], { label:'ACK ' + ackNo + (dup ? ' (dup)' : ''), kind:'ack',
       from:'server', to:'client' });
}

NS.labs.ordering = {
  id: 'ordering',
  title: 'TCP Ordering — ক্রম ঠিক রাখা',
  group: 'Phase 3 · Layer 4',
  chapter: 'ch19',
  blurb: 'Packet ভিন্ন পথে গেলে ভিন্ন ক্রমে পৌঁছাতে পারে। Application তবু ঠিক ক্রমেই পায় — কীভাবে?',

  learn: [
    'কেন Packet উল্টো ক্রমে পৌঁছাতে পারে',
    'Receive Buffer কী এবং সে কীভাবে ক্রম ঠিক করে',
    'ক্রম ভাঙলেও কেন cumulative ACK এগোতে পারে না',
    'Head-of-Line Blocking — একটি Packet কীভাবে বাকি সবাইকে আটকে রাখে'
  ],

  mistakes: [
    { m:'Packet যেই ক্রমে পাঠানো হয়, সেই ক্রমেই পৌঁছায়।',
      r:'IP কোনো ক্রমের প্রতিশ্রুতি দেয় না। দুটি Packet ভিন্ন পথে গেলে (load balancing, route পরিবর্তন) পরেরটা আগে পৌঁছাতেই পারে। ক্রম ঠিক রাখার দায়িত্ব **TCP-র**, IP-র নয়।' },
    { m:'উল্টো ক্রমে এলে TCP সেগুলো ফেলে দিয়ে আবার চায়।',
      r:'একদমই না — ফেলে দিলে তো অপচয় হতো। TCP সেগুলো **Receive Buffer-এ জমা রাখে** এবং ফাঁকটি ভরার অপেক্ষা করে। ফাঁক ভরলেই একসাথে সবটা application-কে দিয়ে দেয়।' },
    { m:'Buffer-এ data থাকা মানেই application সেটি পড়তে পারে।',
      r:'না। TCP **ক্রম না মেলা পর্যন্ত** কিছুই উপরে দেয় না, কারণ তার প্রতিশ্রুতি হলো ধারাবাহিক byte-stream। এজন্যই একটি হারানো Packet তার পরের সব data-কে আটকে রাখে — একে বলে **Head-of-Line Blocking**।' }
  ],

  controls: [
    { key:'mode', type:'choice', label:'পৌঁছানোর ক্রম', def:'reorder',
      options:[ ['inorder','ঠিক ক্রমেই পৌঁছাচ্ছে'],
                ['reorder','২য় segment দেরিতে পৌঁছাচ্ছে'] ],
      help:'দুটি চালিয়ে buffer-এর আচরণের পার্থক্য দেখুন।' }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Client', x:18, y:50, mac:CLI_MAC, ip:CLI_IP }),
        N.server('server', { name:'Server', x:82, y:50, mac:SRV_MAC, ip:SRV_IP,
                             listening:[{ port:80, service:'HTTP', open:true }],
                             note:'buffer খালি' })
      ],
      links: [ N.link('client','server') ],
      hub:null, wire:null, banner:null,
      buf: [], delivered: '', ackNo: BASE
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }

    /* পাঠানোর ক্রম সবসময় একই; শুধু পৌঁছানোর ক্রম বদলায় */
    var order = cfg.mode === 'inorder' ? [1, 101, 201, 301] : [1, 201, 301, 101];

    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'info',
      title:'চারটি segment পাঠানো হলো — ক্রমে',
      what:'Client ৪০০ byte চারটি segment-এ ভাগ করে **ক্রমানুসারে** পাঠাল: `1`, `101`, `201`, `301`।\n\nএকসাথে লিখলে বার্তাটি হয়: ' + WORD[1] + ' + ' + WORD[101] + ' + ' + WORD[201] + ' + ' + WORD[301] + '।',
      why : cfg.mode === 'inorder'
        ? 'Client-এর কাজ এখানেই শেষ — সে ঠিক ক্রমেই পাঠিয়েছে। এবার দেখা যাক network কী করে।'
        : 'Client ঠিক ক্রমেই পাঠিয়েছে। কিন্তু এই চারটি Packet এখন IP-র হাতে, আর **IP কোনো ক্রমের প্রতিশ্রুতি দেয় না**।\n\nবড় network-এ একাধিক পথ থাকে। Router load ভাগ করতে ভিন্ন Packet ভিন্ন পথে পাঠাতে পারে, অথবা মাঝপথে route বদলে যেতে পারে। এক পথ অন্যটির চেয়ে ধীর হলে পরের Packet আগে পৌঁছে যায়।',
      apply: function(st){ st.banner = 'পাঠানো হলো: 1, 101, 201, 301'; }
    });

    var buf = [], expect = BASE, delivered = '';

    for(var i = 0; i < order.length; i++){
      (function(seq, idx){
        var p = dseg(seq);
        var wasExpected = (seq === expect);

        /* buffer-এ যোগ করে দেখি কতদূর ধারাবাহিক হলো */
        buf.push(seq);
        buf.sort(function(a, b){ return a - b; });
        var newExpect = expect, given = [];
        while(buf.indexOf(newExpect) !== -1){
          given.push(newExpect);
          newExpect += MSS;
        }
        var beforeExpect = expect;
        expect = newExpect;
        var deliverNow = given.map(function(s){ return WORD[s]; }).join(' + ');
        if(given.length) delivered += given.map(function(s){ return WORD[s]; }).join('');

        var isDup = !given.length;
        var a = ackseg(expect, isDup);

        steps.push({
          t:at(), actor:'server', layer:'L4', kind: wasExpected ? 'ok' : 'warn',
          title:'seq=' + seq + ' পৌঁছাল' + (wasExpected ? '' : ' — কিন্তু ক্রম ভেঙেছে'),
          packet:p,
          what: wasExpected
            ? 'Segment `' + seq + '` পৌঁছাল — ঠিক যেটি আশা করা হচ্ছিল।' +
              (given.length > 1
                ? '\n\nআর সঙ্গে সঙ্গে buffer-এ আটকে থাকা segment গুলোও মুক্তি পেল! একসাথে application-এ গেল: ' + deliverNow
                : '\n\nসরাসরি application-এ চলে গেল: ' + deliverNow)
            : 'Segment `' + seq + '` পৌঁছাল, কিন্তু আশা করা হচ্ছিল `' + beforeExpect + '`।\n\nতাই এটি **Receive Buffer-এ জমা রাখা হলো** — application-কে দেওয়া হলো না।',
          why : wasExpected
            ? (given.length > 1
                ? 'এই মুহূর্তটিই দেখার মতো। ফাঁকটি ভরার সাথে সাথে buffer-এ জমে থাকা সব segment এক ধাক্কায় ধারাবাহিক হয়ে গেল, আর TCP সবটা একসাথে application-এ পাঠিয়ে দিল।\n\nApplication-এর দৃষ্টিতে data এলো নিখুঁত ক্রমে। সে জানতেই পারল না যে কয়েকটি টুকরো কিছুক্ষণ buffer-এ বসে অপেক্ষা করছিল।'
                : 'ক্রম মিলে গেছে, তাই আটকানোর কিছু নেই। TCP সরাসরি উপরে দিয়ে দিল আর ACK এগিয়ে গেল।')
            : 'Data-টি ফেলে দেওয়া হলো না — সেটি হতো অপচয়, কারণ Packet তো ঠিকঠাকই আছে।\n\nকিন্তু application-কেও দেওয়া গেল না। TCP-র প্রতিশ্রুতি হলো একটি **ধারাবাহিক byte-stream**। ' + beforeExpect + ' নম্বর byte না দিয়ে ' + seq + ' দিয়ে দিলে সেই প্রতিশ্রুতি ভাঙা হতো — application ভুল ক্রমে data পড়ত।\n\nতাই সে অপেক্ষা করে। একেই বলে **Head-of-Line Blocking** — একটি অনুপস্থিত টুকরো তার পরের সব টুকরোকে আটকে রাখে, যদিও সেগুলো নিরাপদে পৌঁছে গেছে।',
          apply: function(st){
            st.wire = { pkt:p, from:'client', to:'server' };
            st.buf = buf.slice();
            st.ackNo = expect;
            st.delivered = delivered;
            for(var d = 0; d < st.devices.length; d++)
              if(st.devices[d].id === 'server')
                st.devices[d].note = 'buffer: ' + (buf.length - given.length > 0
                  ? (buf.length - given.length) + ' আটকে' : 'খালি');
            st.banner = 'seq=' + seq + (wasExpected ? ' · ঠিক ক্রমে' : ' · buffer-এ জমা');
          }
        });

        steps.push({
          t:at(), actor:'server', layer:'L4', kind: isDup ? 'warn' : 'ok',
          title:'ACK ' + expect + (isDup ? ' — একই সংখ্যা আবার' : ''),
          packet:a,
          what: isDup
            ? 'Server আবারও `ack=' + expect + '` পাঠাল — আগেরটার মতোই। যদিও সে মাত্র নতুন একটি segment পেয়েছে।'
            : 'Server `ack=' + expect + '` পাঠাল — "এর আগ পর্যন্ত সব ধারাবাহিকভাবে পেয়েছি।"',
          why : isDup
            ? 'এটাই cumulative ACK-এর সীমাবদ্ধতা। ACK একটিমাত্র সংখ্যা — সে শুধু বলতে পারে "এই বিন্দু পর্যন্ত সব ঠিক"।\n\nSegment `' + seq + '` যে buffer-এ নিরাপদে আছে, সেই খবরটি এই একটি সংখ্যা দিয়ে বলার **কোনো উপায় নেই**। ফাঁকের ওপারের কথা cumulative ACK বলতেই পারে না।\n\nএই সীমাবদ্ধতা কাটাতেই পরে **SACK** (Selective ACK) নামের একটি TCP option যোগ হয়েছে — সেখানে receiver আলাদা করে জানাতে পারে "এই টুকরোগুলোও আমার কাছে আছে"। তখন sender অকারণে সেগুলো আবার পাঠায় না।'
            : 'ACK এগিয়ে গেল, কারণ ধারাবাহিক অংশটিও এগিয়েছে। Client এবার জানল ' + expect + '-এর আগের সব byte নিরাপদ।',
          apply: function(st){
            st.wire = { pkt:a, from:'server', to:'client' };
            st.ackNo = expect;
            st.banner = 'ACK ' + expect + (isDup ? ' (duplicate)' : '');
          }
        });
      })(order[i], i);
    }

    steps.push({
      t:at(), actor:'server', layer:'L7', kind:'ok',
      title:'Application পেল — নিখুঁত ক্রমে',
      what:'Application-এর কাছে পুরো বার্তাটি পৌঁছাল ঠিক যেই ক্রমে পাঠানো হয়েছিল।' +
           (cfg.mode === 'reorder'
             ? '\n\nঅথচ Packet গুলো পৌঁছেছিল এই ক্রমে: `1 → 201 → 301 → 101`।'
             : ''),
      why : cfg.mode === 'reorder'
        ? 'এটাই TCP-র সবচেয়ে বড় অবদান — **বিশৃঙ্খলাকে সে নিজের ভেতরে লুকিয়ে ফেলে**।\n\nনিচে IP স্তরে Packet গুলো এলোমেলো ক্রমে এসেছে, কিছু segment কিছুক্ষণ buffer-এ বসে ছিল, ACK একই সংখ্যা বারবার গেছে। এসবের কিছুই application দেখেনি।\n\nসে শুধু একটি socket থেকে পড়েছে এবং ঠিক ক্রমে byte পেয়েছে।\n\nএর একটি দামও আছে — এই অপেক্ষা। HTTP/2-তে একটি TCP connection দিয়ে অনেকগুলো request চলে, তাই একটি Packet হারালে **সব request আটকে যায়**। এই সমস্যা সমাধানের জন্যই QUIC তৈরি হয়েছে — সে TCP ছেড়ে UDP-র উপর নিজের ক্রম-ব্যবস্থা বানিয়েছে, যেখানে প্রতিটি stream আলাদাভাবে এগোতে পারে।'
        : 'ক্রম ঠিক থাকলে কাজটি সহজ — TCP প্রতিটি segment পাওয়া মাত্রই উপরে দিয়ে দেয়, কোনো অপেক্ষা নেই।\n\nএবার `reorder` mode-এ চালিয়ে দেখুন — ক্রম ভাঙলে কী কী বাড়তি কাজ করতে হয়।',
      apply: function(st){
        st.wire = null;
        st.banner = 'Application পেল · ক্রম নিখুঁত';
        for(var d = 0; d < st.devices.length; d++)
          if(st.devices[d].id === 'server') st.devices[d].note = 'buffer খালি';
      }
    });

    return steps;
  }
};

})(window.NetLab);
