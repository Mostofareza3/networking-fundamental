/* ═══════════════════════════════════════════════════════════════════
   LAB · IP Addressing — "Destination কি আমার নিজের network-এ?"
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var MY_MAC = 'AA:AA:AA:AA:AA:AA';
var GW_MAC = 'RR:RR:RR:RR:RR:RR';
var PEER_MAC = 'BB:BB:BB:BB:BB:BB';

NS.labs.ip = {
  id: 'ip',
  title: 'IP Addressing Lab',
  group: 'Phase 2 · Layer 3',
  chapter: 'ch11',
  blurb: 'Packet পাঠানোর আগে প্রতিটি machine একটাই প্রশ্ন করে — গন্তব্য কি আমার নিজের network-এ? উত্তরের উপরেই সব নির্ভর করে।',

  learn: [
    'Subnet Mask কীভাবে "আমার network"-এর সীমারেখা আঁকে',
    'একই network হলে সরাসরি, না হলে Default Gateway — কেন',
    'দুই ক্ষেত্রেই destination IP এক, কিন্তু destination MAC আলাদা',
    'Subnet Mask ভুল হলে ঠিক কোথায় গিয়ে যোগাযোগ ভাঙে'
  ],

  mistakes: [
    { m:'Default Gateway-এর কাজ হলো Packet-এর গন্তব্য ঠিক করে দেওয়া।',
      r:'গন্তব্য আগে থেকেই destination IP-তে লেখা আছে। Gateway শুধু সেই Packet-টিকে পরের ধাপে এগিয়ে দেয় — "আমি চিনি না, কিন্তু যে চেনে তার কাছে দিচ্ছি"। এটি delegation, গন্তব্য নির্ধারণ নয়।' },
    { m:'একই network-এ আছে কিনা বোঝা যায় IP-র প্রথম তিনটি অংশ মিলিয়ে।',
      r:'সেটি শুধু `/24`-এর ক্ষেত্রে কাকতালীয়ভাবে ঠিক। আসল হিসাব হয় Subnet Mask দিয়ে — `/25`-এ `192.168.1.10` আর `192.168.1.130` ভিন্ন network-এ, যদিও প্রথম তিন অংশ একই।' }
  ],

  controls: [
    { key:'dst', type:'choice', label:'কোথায় Packet পাঠাবেন', def:'local',
      options:[ ['local','192.168.1.20 — একই network'],
                ['remote','8.8.8.8 — বাইরের network'] ],
      help:'দুটোতেই দেখুন destination MAC কীভাবে বদলায়, অথচ destination IP বদলায় না।' },
    { key:'mask', type:'choice', label:'Subnet Mask', def:'24',
      options:[ ['24','255.255.255.0  (/24)'],
                ['25','255.255.255.128  (/25) — সীমা বদলে যাবে'],
                ['16','255.255.0.0  (/16) — অনেক বড় network'] ],
      help:'/25 করলে 192.168.1.20 আর একই network-এ থাকে না — Break-It Mode।' },
    { key:'nogw', type:'toggle', label:'Default Gateway সেট করা নেই', def:false,
      help:'Gateway ছাড়া বাইরের কোথাও যাওয়া যায় না।' }
  ],

  build: function(cfg){
    var cidr = parseInt(cfg.mask, 10);
    var me = N.pc('me', {
      name:'আমার PC', x:14, y:50, mac:MY_MAC,
      ip:'192.168.1.10', mask: N.subnet('192.168.1.10', cidr).mask,
      gw: cfg.nogw ? '' : '192.168.1.1'
    });
    var peer = N.pc('peer', {
      name:'PC-B', x:50, y:18, mac:PEER_MAC,
      ip:'192.168.1.20', mask: N.subnet('192.168.1.20', cidr).mask, gw:'192.168.1.1'
    });
    var gw = N.router('gw', {
      name:'Gateway', x:50, y:80,
      ifaces:[{ name:'eth0', ip:'192.168.1.1', mac:GW_MAC, mask: N.subnet('192.168.1.1', cidr).mask }]
    });
    var out = N.server('net', {
      name:'8.8.8.8', x:88, y:80, mac:'88:88:88:88:88:88', ip:'8.8.8.8',
      listening:[{ port:53, service:'DNS', open:true }]
    });
    if(cfg.nogw) me.note = 'no GW';

    return {
      devices: [me, peer, gw, out],
      links: [ N.link('me','peer'), N.link('me','gw'), N.link('gw','net') ],
      hub: null, wire: null, banner: null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }

    var cidr  = parseInt(cfg.mask, 10);
    var myIp  = '192.168.1.10';
    var mask  = N.subnet(myIp, cidr).mask;
    var sub   = N.subnet(myIp, cidr);
    var dstIp = cfg.dst === 'local' ? '192.168.1.20' : '8.8.8.8';
    var same  = N.sameSubnet(myIp, dstIp, mask);

    steps.push({
      t:at(), actor:'me', layer:'L3', kind:'info',
      title:'Packet পাঠানোর সিদ্ধান্ত শুরু',
      what:'Application `' + dstIp + '`-এ data পাঠাতে চাইল। কিন্তু Packet তারে দেওয়ার আগে kernel-কে একটা সিদ্ধান্ত নিতে হবে।',
      why :'প্রশ্নটি একটাই — **গন্তব্য কি আমার নিজের network-এ?**\n\nউত্তর "হ্যাঁ" হলে সরাসরি পাঠানো যাবে। "না" হলে Packet-টি Default Gateway-এর হাতে তুলে দিতে হবে। এই একটি সিদ্ধান্তের উপরেই পরের সব ধাপ নির্ভর করছে।',
      apply: function(st){ st.banner = 'সিদ্ধান্ত: গন্তব্য কি local?'; }
    });

    steps.push({
      t:at(), actor:'me', layer:'L3', kind:'info',
      title:'Subnet Mask দিয়ে হিসাব',
      what:'নিজের IP `' + myIp + '` আর Mask `' + mask + '` (/' + cidr + ') মিলিয়ে বের হলো — আমার network হলো **`' + sub.network + '/' + cidr + '`**, আর তার সীমা `' + sub.first + '` থেকে `' + sub.last + '` পর্যন্ত।',
      why :'Mask-এর যত ঘর `1`, ততগুলো bit "network" অংশ। বাকিটা host অংশ।\n\n`' + myIp + '` = `' + N.bits(myIp) + '`\n`' + mask + '` = `' + N.bits(mask) + '`\n\nএই দুটো মিলিয়েই "আমার network" বলতে ঠিক কোন কোন address বোঝায় তা ঠিক হয়।',
      apply: function(st){ st.banner = 'আমার network: ' + sub.network + '/' + cidr; }
    });

    steps.push({
      t:at(), actor:'me', layer:'L3', kind: same ? 'ok' : 'warn',
      title: same ? 'গন্তব্য একই network-এ' : 'গন্তব্য ভিন্ন network-এ',
      what: same
        ? '`' + dstIp + '` হিসাব করে দেখা গেল সেটিও `' + sub.network + '/' + cidr + '`-এর ভেতরেই পড়ে।'
        : '`' + dstIp + '` হিসাব করে দেখা গেল সেটি `' + sub.network + '/' + cidr + '`-এর বাইরে।',
      why : same
        ? 'তাই মাঝখানে কোনো Router লাগবে না। Packet-টি সরাসরি ওই device-এর কাছে পাঠানো যাবে।\n\nএখন শুধু দরকার তার MAC Address — সেটি ARP দিয়ে জানা যাবে।'
        : (cidr === 25 && cfg.dst === 'local'
            ? 'লক্ষ্য করুন — `192.168.1.10` আর `192.168.1.20`-এর প্রথম তিন অংশ একই, তবু এরা **ভিন্ন network-এ**!\n\nকারণ /25 mask `192.168.1.0`-`192.168.1.127` আর `192.168.1.128`-`192.168.1.255` — এই দুই ভাগে ভেঙে দিয়েছে। এজন্যই "প্রথম তিন অংশ মিললেই একই network" ধারণাটি ভুল।'
            : 'তাই Packet-টি নিজে থেকে পাঠানো যাবে না। এটিকে এমন কারো হাতে দিতে হবে যে বাইরের পথ চেনে — অর্থাৎ **Default Gateway**।'),
      apply: function(st){ st.banner = same ? 'একই network — সরাসরি' : 'ভিন্ন network — Gateway লাগবে'; }
    });

    /* ── Break-It: বাইরে যেতে হবে কিন্তু Gateway নেই ── */
    if(!same && cfg.nogw){
      steps.push({
        t:at(), actor:'me', layer:'L3', kind:'error',
        title:'Default Gateway নেই — Packet পাঠানো গেল না',
        what:'Packet-টি বাইরের network-এ যেতে হবে, কিন্তু কোনো Default Gateway সেট করা নেই। তাই এটি কোথাও পাঠানোই হলো না।',
        why :'Machine-টি পৃথিবীর সব network-এর পথ জানে না — জানার দরকারও নেই। তার শুধু একটা ঠিকানা জানা দরকার: "যা আমি চিনি না, তা কার কাছে দেব।"\n\nসেই ঠিকানাটাই নেই। তাই local network-এর ভেতরে সব ঠিক থাকলেও বাইরের কিছুতেই পৌঁছানো যাবে না। Linux-এ এটি `Network is unreachable` হিসেবে দেখা যায়।',
        apply: function(st){ st.banner = 'Network is unreachable'; }
      });
      return steps;
    }

    /* ── কার MAC লাগবে সেটিই আসল পার্থক্য ── */
    var nextHopIp  = same ? dstIp : '192.168.1.1';
    var nextHopMac = same ? PEER_MAC : GW_MAC;
    var nextHopName = same ? 'PC-B' : 'Gateway';

    steps.push({
      t:at(), actor:'me', layer:'L2', kind:'info',
      title:'কার MAC Address লাগবে?',
      what:'ARP করা হবে **`' + nextHopIp + '`**-এর জন্য — অর্থাৎ ' + nextHopName + '-এর MAC Address জানতে।',
      why : same
        ? 'গন্তব্য নিজেই পাশে আছে, তাই তারই MAC Address দরকার।'
        : 'এখানে একটা সূক্ষ্ম কিন্তু গুরুত্বপূর্ণ ব্যাপার — ARP করা হচ্ছে **Gateway-এর IP** `192.168.1.1`-এর জন্য, `' + dstIp + '`-এর জন্য নয়।\n\nকারণ `' + dstIp + '` এই local network-এ নেই, তাকে ARP করে পাওয়া যাবে না। ARP শুধু নিজের network-এর ভেতরেই কাজ করে।',
      apply: function(st){ st.banner = 'ARP: ' + nextHopIp + ' কার?'; }
    });

    var pkt = P.make([
      P.ethernet(MY_MAC, nextHopMac, 'ip'),
      P.ip(myIp, dstIp, 64, 'tcp', 60),
      P.tcp(54321, same ? 80 : 53, 1000, 0, 'SYN', 64240)
    ], { label:'Frame', kind:'data', from:'me', to: same ? 'peer' : 'gw' });

    steps.push({
      t:at(), actor:'me', layer:'L2', kind:'ok',
      title:'Frame তৈরি হলো', packet:pkt,
      what:'Destination IP `' + dstIp + '`, কিন্তু destination MAC `' + nextHopMac + '` — অর্থাৎ ' + nextHopName + '-এর।',
      why : same
        ? 'এখানে IP আর MAC দুটোই একই device-এর, কারণ গন্তব্য পাশেই।'
        : '**এটাই পুরো lab-এর সবচেয়ে গুরুত্বপূর্ণ কথা।**\n\nIP Header বলছে Packet-টি শেষ পর্যন্ত `' + dstIp + '`-এ যাবে। কিন্তু Ethernet Header বলছে এই মুহূর্তে এটি যাচ্ছে শুধু Gateway পর্যন্ত।\n\nIP = পুরো যাত্রার গন্তব্য। MAC = এই এক ধাপের ঠিকানা। প্রতিটি hop-এ MAC বদলাবে, IP বদলাবে না।',
      apply: function(st){
        st.wire = { pkt:pkt, from:'me', to: same ? 'peer' : 'gw' };
        st.devices[0].arp[nextHopIp] = { mac:nextHopMac, age:0 };
        st.banner = 'dst IP ' + dstIp + ' · dst MAC ' + nextHopMac;
      }
    });

    if(same){
      steps.push({
        t:at(), actor:'peer', layer:'L3', kind:'ok',
        title:'PC-B সরাসরি পেয়ে গেল', packet:pkt,
        what:'কোনো Router ছুঁতে হলো না — Frame-টি সরাসরি PC-B-তে পৌঁছাল।',
        why :'একই network-এর ভেতরে যোগাযোগ Layer 2-তেই সম্পন্ন হয়। Router শুধু তখনই দরকার যখন network-এর সীমানা পার হতে হয়।',
        apply: function(st){ st.wire = null; st.banner = 'সরাসরি পৌঁছাল'; }
      });
      return steps;
    }

    steps.push({
      t:at(), actor:'gw', layer:'L3', kind:'ok',
      title:'Gateway Packet টি এগিয়ে দিল', packet:pkt,
      what:'Gateway Frame-টি খুলে ভেতরের IP Packet দেখল — গন্তব্য `' + dstIp + '`, যা তার নিজের নয়। তাই সে TTL ১ কমিয়ে Packet-টি পরের দিকে পাঠিয়ে দিল।',
      why :'Gateway নতুন একটি Ethernet Header বানাল — নতুন source MAC (তার নিজের), নতুন destination MAC (পরের hop-এর)। পুরোনো MAC দুটি মুছে গেল।\n\nকিন্তু ভেতরের IP Header-এ `' + myIp + '` → `' + dstIp + '` অপরিবর্তিত রইল। শুধু TTL ৬৪ থেকে ৬৩ হলো।',
      apply: function(st){ st.wire = { pkt:pkt, from:'gw', to:'net' }; st.banner = 'TTL 64 → 63, নতুন MAC'; }
    });

    steps.push({
      t:at(), actor:'net', layer:'L3', kind:'ok',
      title:'গন্তব্যে পৌঁছাল', packet:pkt,
      what:'`8.8.8.8` Packet-টি পেল। পথে MAC Address কয়েকবার বদলেছে, কিন্তু IP Header-এর গন্তব্য শুরু থেকে শেষ পর্যন্ত একই ছিল।',
      why :'এটাই IP-র মূল নকশা — একটি global ঠিকানা যা পুরো পথে অপরিবর্তিত থাকে, আর প্রতিটি local link-এ আলাদা MAC যা শুধু এক ধাপের জন্য।\n\nএই দুটো স্তর আলাদা বলেই Internet কাজ করে।',
      apply: function(st){ st.wire = null; st.banner = 'পৌঁছে গেল'; }
    });

    return steps;
  }
};

})(window.NetLab);
