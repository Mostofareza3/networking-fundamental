/* ═══════════════════════════════════════════════════════════════════
   LAB · ARP — IP জানি, কিন্তু MAC জানি না
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLIENT_MAC = 'AA:AA:AA:AA:AA:AA';
var ROUTER_MAC = 'RR:RR:RR:RR:RR:RR';
var OTHER_MAC  = 'CC:CC:CC:CC:CC:CC';
var BROADCAST  = 'FF:FF:FF:FF:FF:FF';

NS.labs.arp = {
  id: 'arp',
  title: 'ARP Lab',
  group: 'Phase 1 · Layer 2',
  chapter: 'ch8',
  blurb: 'IP Address জানা থাকলেও Frame পাঠাতে MAC Address লাগে। ARP সেই ফাঁকটা পূরণ করে।',

  learn: [
    'ARP ঠিক কোন সমস্যাটা সমাধান করে',
    'ARP Request কেন broadcast, কিন্তু ARP Reply কেন unicast',
    'ARP Cache কী কাজে লাগে এবং cache থাকলে কী বদলায়',
    'যার IP জিজ্ঞেস করা হয়নি সেই device কেন Frame-টা ফেলে দেয়'
  ],

  mistakes: [
    { m:'ARP Internet-এর যেকোনো IP-র MAC Address বের করতে পারে।',
      r:'ARP শুধু নিজের local network-এ কাজ করে। বাইরের কোনো IP-তে যেতে হলে Client নিজের Default Gateway-এর MAC Address খোঁজে, destination-এর নয়।' },
    { m:'ARP Request সরাসরি Router-এর কাছে যায়।',
      r:'ARP Request broadcast — local network-এর প্রতিটি device Frame-টি পায়। কিন্তু শুধু যার IP মিলেছে সে-ই Reply দেয়, বাকিরা চুপচাপ Frame-টি ফেলে দেয়।' }
  ],

  controls: [
    { key:'cached', type:'toggle', label:'ARP Cache-এ আগে থেকেই entry আছে', def:false,
      help:'চালু করলে Client-কে আর জিজ্ঞেস করতে হবে না — সরাসরি Frame পাঠাবে।' },
    { key:'gone', type:'toggle', label:'Router টি বন্ধ (কেউ উত্তর দেবে না)', def:false,
      help:'কেউ ARP Reply না দিলে কী হয় দেখুন — Break-It Mode।' }
  ],

  /* ───────── শুরুর অবস্থা ───────── */
  build: function(cfg){
    var client = N.pc('client', {
      name:'Client', x:14, y:50, mac:CLIENT_MAC,
      ip:'192.168.1.10', gw:'192.168.1.1'
    });
    if(cfg.cached) client.arp['192.168.1.1'] = { mac:ROUTER_MAC, age:0 };

    var other = N.pc('other', {
      name:'PC-B', x:50, y:14, mac:OTHER_MAC, ip:'192.168.1.20', gw:'192.168.1.1'
    });
    var rtr = N.router('router', {
      name:'Router', x:86, y:50,
      ifaces:[{ name:'eth0', ip:'192.168.1.1', mac:ROUTER_MAC, mask:'255.255.255.0' }]
    });
    if(cfg.gone) rtr.note = 'বন্ধ';

    return {
      devices: [client, other, rtr],
      links: [
        N.link('client','sw1'), N.link('other','sw1'), N.link('sw1','router')
      ],
      hub: N.sw('sw1', { name:'Switch', x:50, y:50 }),
      wire: null,       // এই মুহূর্তে তারে যে packet আছে
      banner: null
    };
  },

  /* ───────── ধাপে ধাপে কী ঘটবে ───────── */
  script: function(s0, cfg){
    P.resetIds();
    var steps = [];
    var t = 0;
    function at(){ t += 1; return t; }

    /* Frame পাঠানোর জন্য যে MAC দরকার সেটি Client-এর জানা আছে কি? */
    if(cfg.cached){
      steps.push({
        t:at(), actor:'client', layer:'L3', kind:'info',
        title:'Packet তৈরি করল',
        what:'Client `192.168.1.1`-এ একটি Packet পাঠাতে চায়। সে প্রথমেই নিজের ARP Cache দেখল।',
        why :'প্রতিবার জিজ্ঞেস করা অপচয়। তাই Client আগে নিজের ARP Cache-এ খোঁজে — উত্তর পেলে ARP Request পাঠানোরই দরকার নেই।',
        apply: function(st){ st.banner = 'ARP Cache দেখা হচ্ছে…'; }
      });
      steps.push({
        t:at(), actor:'client', layer:'L2', kind:'ok',
        title:'Cache HIT — MAC Address জানা আছে',
        what:'ARP Cache-এ `192.168.1.1 → ' + ROUTER_MAC + '` entry-টি পাওয়া গেল।',
        why :'আগে একবার ARP হয়েছিল বলে উত্তরটি জমা ছিল। তাই এবার কোনো ARP Request লাগল না — এটাই ARP Cache-এর মূল লাভ।',
        apply: function(st){ st.banner = 'Cache HIT'; }
      });
      steps.push(sendData(at()));
      return steps;
    }

    /* ── Cache খালি: পুরো ARP প্রক্রিয়া ── */
    steps.push({
      t:at(), actor:'client', layer:'L3', kind:'info',
      title:'Packet তৈরি করল',
      what:'Client `192.168.1.1`-এ Packet পাঠাতে চায়। কিন্তু Ethernet Frame বানাতে গিয়ে সে আটকে গেল।',
      why :'Frame-এর destination MAC Address-এর ঘরটি ফাঁকা। IP Address জানা আছে, কিন্তু এই local network-এ Frame পৌঁছাতে হলে MAC Address লাগে।',
      apply: function(st){ st.banner = 'destination MAC অজানা'; }
    });

    steps.push({
      t:at(), actor:'client', layer:'L2', kind:'warn',
      title:'ARP Cache খালি',
      what:'Client নিজের ARP Cache দেখল — `192.168.1.1`-এর কোনো entry নেই।',
      why :'এর আগে এই IP-র সাথে কথা হয়নি, তাই cache-এ কিছু জমা নেই। এখন জিজ্ঞেস করা ছাড়া উপায় নেই।',
      apply: function(st){ st.banner = 'Cache MISS'; }
    });

    var req = P.make([
      P.ethernet(CLIENT_MAC, BROADCAST, 'arp'),
      P.arp(1, CLIENT_MAC, '192.168.1.10', '00:00:00:00:00:00', '192.168.1.1')
    ], { label:'ARP Request', kind:'arp', from:'client', to:'সবাই' });

    steps.push({
      t:at(), actor:'client', layer:'L2', kind:'info',
      title:'ARP Request broadcast করল', packet:req,
      what:'Client একটি ARP Request পাঠাল: **"`192.168.1.1` কার? তোমার MAC Address কী?"** Frame-টির destination MAC হলো `' + BROADCAST + '` — অর্থাৎ broadcast।',
      why :'কার MAC Address লাগবে সেটাই তো জানা নেই, তাই কাকে জিজ্ঞেস করবে তাও জানা নেই। তাই প্রশ্নটি সবাইকে শোনানো হচ্ছে। `FF:FF:FF:FF:FF:FF` মানে "এই network-এর সবাই"।',
      apply: function(st){ st.wire = { pkt:req, from:'client', to:'sw1' }; st.banner = 'ARP Request পথে'; }
    });

    steps.push({
      t:at(), actor:'sw1', layer:'L2', kind:'info',
      title:'Switch সব port-এ flood করল', packet:req,
      what:'Switch broadcast Frame-টি পেয়ে সেটি সব port-এ পাঠিয়ে দিল (যে port দিয়ে এসেছে সেটি বাদে)।',
      why :'Destination MAC broadcast হলে Switch কোনো lookup করে না — broadcast-এর সংজ্ঞাই হলো সবার কাছে পৌঁছানো।',
      apply: function(st){
        st.wire = { pkt:req, from:'sw1', to:'both', origin:'client' };
        st.hub.macTable[CLIENT_MAC] = { port:1, age:0 };
        st.banner = 'সব port-এ flood';
      }
    });

    steps.push({
      t:at(), actor:'other', layer:'L2', kind:'warn',
      title:'PC-B Frame টি ফেলে দিল', packet:req,
      what:'PC-B ARP Request-টি পেল, ভেতরের Target IP `192.168.1.1` দেখল, নিজের IP `192.168.1.20`-এর সাথে মেলাল — মিলল না। তাই সে চুপচাপ Frame-টি ফেলে দিল।',
      why :'Broadcast মানে সবাই Frame-টি **পায়**, কিন্তু সবাই **উত্তর দেয় না**। শুধু যার IP মিলেছে সে-ই Reply দেবে।',
      apply: function(st){ st.banner = 'PC-B: আমার IP নয়, drop'; }
    });

    /* ── Break-It: কেউ উত্তর না দিলে ── */
    if(cfg.gone){
      steps.push({
        t:at(), actor:'router', layer:'L2', kind:'error',
        title:'Router বন্ধ — কোনো Reply নেই',
        what:'Router-টি বন্ধ, তাই ARP Request-এর কোনো উত্তর এল না।',
        why :'ARP-তে কোনো "উত্তর পাইনি" বলে error message আসে না। শুধু নীরবতা — Client অপেক্ষা করতে থাকে।',
        apply: function(st){ st.wire = null; st.banner = 'কোনো Reply নেই'; }
      });
      steps.push({
        t:at() + 2, actor:'client', layer:'L3', kind:'error',
        title:'Timeout — Packet পাঠানো গেল না',
        what:'কয়েকবার চেষ্টা করেও কোনো ARP Reply না পাওয়ায় Client হাল ছেড়ে দিল। মূল Packet-টি আর কখনোই পাঠানো হলো না।',
        why :'destination MAC Address ছাড়া Ethernet Frame তৈরিই করা যায় না। তাই Layer 2-তে আটকে গেলে উপরের Layer 3 বা 4 কিছুই করতে পারে না।\n\nএকেই বলে **ARP Failure** — application-এ এটি সাধারণত "Host unreachable" হিসেবে দেখা যায়।',
        apply: function(st){ st.banner = 'ARP Failure'; }
      });
      return steps;
    }

    var rep = P.make([
      P.ethernet(ROUTER_MAC, CLIENT_MAC, 'arp'),
      P.arp(2, ROUTER_MAC, '192.168.1.1', CLIENT_MAC, '192.168.1.10')
    ], { label:'ARP Reply', kind:'arp', from:'router', to:'client' });

    steps.push({
      t:at(), actor:'router', layer:'L2', kind:'ok',
      title:'Router ARP Reply দিল', packet:rep,
      what:'Router দেখল Target IP `192.168.1.1` তারই। তাই সে উত্তর পাঠাল: **"`192.168.1.1` আমি, আমার MAC হলো `' + ROUTER_MAC + '`"**।',
      why :'লক্ষ্য করুন — Reply-টি broadcast নয়, **unicast**। কে জিজ্ঞেস করেছিল তা Request-এর ভেতরেই ছিল (Sender MAC), তাই উত্তরটি শুধু তাকেই পাঠানো হচ্ছে। অন্যদের বিরক্ত করার দরকার নেই।',
      apply: function(st){ st.wire = { pkt:rep, from:'router', to:'client' }; st.banner = 'ARP Reply আসছে'; }
    });

    steps.push({
      t:at(), actor:'client', layer:'L2', kind:'ok',
      title:'ARP Cache-এ জমা করল', packet:rep,
      what:'Client উত্তরটি পেয়ে নিজের ARP Cache-এ লিখে রাখল: `192.168.1.1 → ' + ROUTER_MAC + '`।',
      why :'এখন থেকে কিছুক্ষণ (সাধারণত কয়েক মিনিট) এই IP-তে পাঠাতে হলে আর জিজ্ঞেস করতে হবে না। এতে network-এ অপ্রয়োজনীয় broadcast কমে।',
      apply: function(st){
        st.devices[0].arp['192.168.1.1'] = { mac:ROUTER_MAC, age:0 };
        st.wire = null;
        st.banner = 'ARP Cache updated';
      }
    });

    steps.push(sendData(at()));
    return steps;

    /* আসল data Frame — cache আর non-cache দুই পথেই শেষ ধাপ একই */
    function sendData(tt){
      var d = P.make([
        P.ethernet(CLIENT_MAC, ROUTER_MAC, 'ip'),
        P.ip('192.168.1.10', '8.8.8.8', 64, 'tcp', 60),
        P.tcp(54321, 443, 1000, 0, 'SYN', 64240)
      ], { label:'Data Frame', kind:'data', from:'client', to:'router' });

      return {
        t:tt, actor:'client', layer:'L2', kind:'ok',
        title:'এবার আসল Frame পাঠাল', packet:d,
        what:'destination MAC জানা হয়ে গেছে, তাই Client এবার সম্পূর্ণ Ethernet Frame তৈরি করে পাঠাল।',
        why :'এখানে একটি গুরুত্বপূর্ণ ব্যাপার আছে — Frame-এর destination MAC হলো **Router-এর**, কিন্তু Packet-এর destination IP হলো **`8.8.8.8`**।\n\nকারণ MAC Address শুধু এই local link পর্যন্ত কাজ করে, আর IP Address পুরো journey-র গন্তব্য বলে। Router এই Frame খুলে ভেতরের Packet-টি পরের hop-এ নতুন Frame-এ ভরে পাঠাবে।',
        apply: function(st){ st.wire = { pkt:d, from:'client', to:'router' }; st.banner = 'Data Frame পাঠানো হলো'; }
      };
    }
  }
};

})(window.NetLab);
