/* ═══════════════════════════════════════════════════════════════════
   LAB · Ethernet & MAC — MAC Address আসলে কী করে
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

NS.labs.ethernet = {
  id: 'ethernet',
  title: 'Ethernet & MAC Lab',
  group: 'Phase 1 · Layer 2',
  chapter: 'ch6',
  blurb: 'একটি Frame-এ Source আর Destination MAC — এই দুটি মাত্র field দিয়েই local network-এর পুরো delivery ব্যবস্থা চলে।',

  learn: [
    'MAC Address কে দেখে আর কে দেখে না',
    'Destination MAC না মিললে NIC ঠিক কী করে',
    'Broadcast MAC (`FF:FF:FF:FF:FF:FF`) কেন আলাদা',
    'MAC Address বদলে দিলে যোগাযোগ কেন ভেঙে যায়'
  ],

  mistakes: [
    { m:'MAC Address পুরো Internet জুড়ে device-টিকে চিনিয়ে দেয়।',
      r:'MAC Address শুধু একটি local network-এর ভেতরে অর্থবহ। Router পার হওয়ার সাথে সাথেই পুরোনো MAC মুছে গিয়ে নতুন MAC বসে। দূরের কোনো Server আপনার MAC Address কখনো দেখেই না।' },
    { m:'ভুল destination MAC-এর Frame ঠিক device-এ পৌঁছে যায়, কারণ IP তো ঠিক আছে।',
      r:'NIC প্রথমেই destination MAC মেলায়। না মিললে Frame সেখানেই বাদ পড়ে — ভেতরের IP Header পড়াই হয় না। Layer 2-তে আটকে গেলে Layer 3 কখনো কাজে আসে না।' }
  ],

  controls: [
    { key:'dst', type:'choice', label:'Destination MAC', def:'ok',
      options:[ ['ok','সঠিক — PC-B এর MAC'],
                ['wrong','ভুল MAC (কারো সাথেই মেলে না)'],
                ['bcast','Broadcast — FF:FF:FF:FF:FF:FF'] ],
      help:'তিনটি ক্ষেত্রেই NIC-এর আচরণ আলাদা। বদলে দেখুন।' }
  ],

  build: function(){
    return {
      devices: [
        N.pc('pcA', { name:'PC-A', x:14, y:50, mac:'AA:AA:AA:AA:AA:AA', ip:'192.168.1.10' }),
        N.pc('pcB', { name:'PC-B', x:86, y:28, mac:'BB:BB:BB:BB:BB:BB', ip:'192.168.1.20' }),
        N.pc('pcC', { name:'PC-C', x:86, y:72, mac:'CC:CC:CC:CC:CC:CC', ip:'192.168.1.30' })
      ],
      links: [ N.link('pcA','sw1'), N.link('sw1','pcB'), N.link('sw1','pcC') ],
      hub: N.sw('sw1', { name:'Switch', x:50, y:50 }),
      wire: null,
      banner: null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }

    var mode = cfg.dst || 'ok';
    var dstMac = mode === 'ok' ? 'BB:BB:BB:BB:BB:BB'
               : mode === 'bcast' ? 'FF:FF:FF:FF:FF:FF'
               : 'DE:AD:BE:EF:00:99';

    var f = P.make([
      P.ethernet('AA:AA:AA:AA:AA:AA', dstMac, 'ip'),
      P.ip('192.168.1.10', '192.168.1.20', 64, 'tcp', 60),
      P.tcp(51000, 80, 1, 0, 'SYN', 64240)
    ], { label:'Frame', kind: mode === 'bcast' ? 'arp' : 'data', from:'pcA', to:'pcB' });

    steps.push({
      t:at(), actor:'pcA', layer:'L2', kind:'info',
      title:'PC-A Frame তৈরি করল', packet:f,
      what:'Frame-এর Source MAC `AA:AA:AA:AA:AA:AA` (PC-A এর নিজের NIC), Destination MAC `' + dstMac + '`।',
      why :'Source MAC সবসময় নিজের NIC-এর — এটি NIC নিজেই বসিয়ে দেয়। Destination MAC ঠিক করে দেয় Frame-টি এই local network-এ কে তুলে নেবে।',
      apply: function(st){ st.wire = { pkt:f, from:'pcA', to:'sw1' }; st.banner = 'Frame পাঠানো হলো'; }
    });

    if(mode === 'bcast'){
      steps.push({
        t:at(), actor:'sw1', layer:'L2', kind:'warn',
        title:'Broadcast — Switch সবাইকে পাঠাল', packet:f,
        what:'Destination MAC `FF:FF:FF:FF:FF:FF` দেখে Switch কোনো lookup-ই করল না, সোজা সব port-এ পাঠিয়ে দিল।',
        why :'`FF:FF:FF:FF:FF:FF` একটি বিশেষ সংরক্ষিত address — এর মানেই "এই network-এর সবাই"। ARP ঠিক এভাবেই কাজ করে।',
        apply: function(st){ st.wire = { pkt:f, from:'sw1', to:'flood', origin:'pcA' }; st.banner = 'সবাইকে পাঠানো হলো'; }
      });
      steps.push({
        t:at(), actor:'pcB', layer:'L3', kind:'ok',
        title:'PC-B এবং PC-C দুজনেই গ্রহণ করল', packet:f,
        what:'দুটি PC-ই Frame-টি গ্রহণ করে ভেতরের IP Packet উপরের layer-এ পাঠিয়ে দিল।',
        why :'Broadcast MAC-এর সাথে প্রতিটি NIC-ই "মেলে"। তাই সবাই Frame-টি তুলে নেয়।\n\nএর একটি খরচ আছে — অপ্রয়োজনীয় device-এরও CPU খরচ হয়। এজন্যই বড় network-এ অতিরিক্ত broadcast একটি সমস্যা।',
        apply: function(st){ st.wire = null; st.banner = 'সবাই গ্রহণ করল'; }
      });
      return steps;
    }

    steps.push({
      t:at(), actor:'sw1', layer:'L2', kind:'info',
      title:'Switch Frame টি forward করল', packet:f,
      what: mode === 'ok'
        ? 'Switch Destination MAC তার Table-এ পেয়ে Frame-টি PC-B এর port-এ পাঠাল।'
        : 'Destination MAC `' + dstMac + '` Switch-এর Table-এ নেই, তাই সে Frame-টি সব port-এ flood করল।',
      why : mode === 'ok'
        ? 'Switch শুধু MAC দেখে সিদ্ধান্ত নেয় — ভেতরের IP Address সে খুলেও দেখে না। এটি বিশুদ্ধ Layer 2 device।'
        : 'অজানা destination হলে Switch flood করে, এই আশায় যে কেউ না কেউ Frame-টি নেবে। কিন্তু এই MAC-টি কারোরই নয়…',
      apply: function(st){
        st.wire = { pkt:f, from:'sw1', to: mode === 'ok' ? 'pcB' : 'flood', origin:'pcA' };
        st.banner = mode === 'ok' ? 'PC-B এর দিকে' : 'অজানা MAC — flood';
      }
    });

    if(mode === 'ok'){
      steps.push({
        t:at(), actor:'pcB', layer:'L2', kind:'ok',
        title:'PC-B এর NIC মিলিয়ে দেখল — মিলেছে', packet:f,
        what:'PC-B এর NIC destination MAC-এর সাথে নিজের MAC মেলাল। মিলে যাওয়ায় Frame-টি গ্রহণ করল।',
        why :'এই মিলিয়ে দেখার কাজটি NIC hardware-এই হয়, OS পর্যন্ত পৌঁছানোর আগেই। মিললে তবেই Frame উপরে ওঠে।',
        apply: function(st){ st.wire = null; st.banner = 'PC-B গ্রহণ করল'; }
      });
      steps.push({
        t:at(), actor:'pcB', layer:'L3', kind:'ok',
        title:'Ethernet Header খুলে IP Packet বের হলো', packet:f,
        what:'PC-B Ethernet Header ফেলে দিয়ে ভেতরের IP Packet-টি Layer 3-এ পাঠিয়ে দিল।',
        why :'Layer 2-এর কাজ এখানেই শেষ — সে Frame-টিকে এই local link পার করিয়ে দিয়েছে। এর পরের সিদ্ধান্ত IP-র।',
        apply: function(st){ st.banner = 'Layer 3-এ হস্তান্তর'; }
      });
    } else {
      steps.push({
        t:at(), actor:'pcB', layer:'L2', kind:'error',
        title:'কেউই MAC মেলাতে পারল না', packet:f,
        what:'PC-B আর PC-C দুজনেই Frame-টি পেল, কিন্তু `' + dstMac + '` কারো MAC-এর সাথেই মিলল না। দুজনেই Frame-টি ফেলে দিল।',
        why :'Frame-টি ভেতরে সঠিক destination IP `192.168.1.20` বহন করছিল, কিন্তু সেটি কেউ পড়েই দেখল না।\n\nকারণ NIC আগে MAC মেলায়, তারপর IP-র কথা ভাবে। MAC না মিললে Frame সেখানেই শেষ — এটাই প্রমাণ করে যে Layer 3 ঠিক থাকলেও Layer 2 ভুল হলে কিছুই কাজ করে না।',
        apply: function(st){ st.wire = null; st.banner = 'Frame drop — কারো MAC মেলেনি'; }
      });
    }

    return steps;
  }
};

})(window.NetLab);
