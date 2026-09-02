/* ═══════════════════════════════════════════════════════════════════
   LAB · Switching — Switch কীভাবে শেখে
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var A = 'AA:AA:AA:AA:AA:AA', B = 'BB:BB:BB:BB:BB:BB', C = 'CC:CC:CC:CC:CC:CC';

NS.labs.switching = {
  id: 'switching',
  title: 'Switching Lab',
  group: 'Phase 1 · Layer 2',
  chapter: 'ch7',
  blurb: 'Switch জন্ম থেকে কিছুই জানে না। প্রতিটি Frame দেখে সে ধীরে ধীরে শিখে নেয় কে কোন port-এ আছে।',

  learn: [
    'Switch তার MAC Address Table কীভাবে নিজে নিজে তৈরি করে',
    'Source MAC থেকে শেখা আর Destination MAC খোঁজা — দুটি আলাদা কাজ',
    'অজানা destination-এ Switch কেন flood করে',
    'দ্বিতীয়বার একই পথে Frame গেলে কেন আর flood হয় না'
  ],

  mistakes: [
    { m:'Switch আগে থেকেই জানে কোন device কোন port-এ আছে।',
      r:'Switch-এর MAC Table শুরুতে সম্পূর্ণ খালি থাকে। সে শুধু Frame-এর **Source MAC** দেখে শেখে — অর্থাৎ একটি device কথা না বলা পর্যন্ত Switch তার অস্তিত্বই জানে না।' },
    { m:'Flood করা মানে Switch-টি নষ্ট বা ভুল করছে।',
      r:'Flood হলো স্বাভাবিক এবং সঠিক আচরণ। Destination কোথায় জানা না থাকলে Frame ফেলে দেওয়ার চেয়ে সব port-এ পাঠানো ভালো — ঠিক device-টি উত্তর দিলে Switch তখন তাকেও শিখে ফেলে।' }
  ],

  controls: [
    { key:'learned', type:'toggle', label:'MAC Table-এ আগে থেকেই সব entry আছে', def:false,
      help:'চালু করলে Switch আর flood করবে না — সরাসরি ঠিক port-এ পাঠাবে।' },
    { key:'reply', type:'toggle', label:'PC-B উত্তর পাঠাবে', def:true,
      help:'উত্তর এলে Switch PC-B-কেও শিখে ফেলে। তখন পরের Frame আর flood হয় না।' }
  ],

  build: function(cfg){
    var pcA = N.pc('pcA', { name:'PC-A', x:12, y:24, mac:A, ip:'192.168.1.10' });
    var pcB = N.pc('pcB', { name:'PC-B', x:12, y:76, mac:B, ip:'192.168.1.20' });
    var pcC = N.pc('pcC', { name:'PC-C', x:88, y:50, mac:C, ip:'192.168.1.30' });

    var s = N.sw('sw1', { name:'Switch', x:50, y:50 });
    s.portsOf = { pcA:1, pcB:2, pcC:3 };
    if(cfg.learned){
      s.macTable[A] = { port:1, age:0 };
      s.macTable[B] = { port:2, age:0 };
      s.macTable[C] = { port:3, age:0 };
    }

    return {
      devices: [pcA, pcB, pcC],
      links: [ N.link('pcA','sw1'), N.link('pcB','sw1'), N.link('pcC','sw1') ],
      hub: s,
      wire: null,
      banner: null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }

    var f1 = P.make([
      P.ethernet(A, B, 'ip'),
      P.ip('192.168.1.10', '192.168.1.20', 64, 'tcp', 60),
      P.tcp(51000, 80, 1, 0, 'SYN', 64240)
    ], { label:'Frame A→B', kind:'data', from:'pcA', to:'pcB' });

    steps.push({
      t:at(), actor:'pcA', layer:'L2', kind:'info',
      title:'PC-A একটি Frame পাঠাল', packet:f1,
      what:'PC-A একটি Ethernet Frame পাঠাচ্ছে — Source MAC `' + A + '`, Destination MAC `' + B + '`।',
      why :'PC-A ইতিমধ্যে PC-B-এর MAC Address জানে (ARP আগেই হয়ে গেছে)। এখন Frame-টি Switch-এ পৌঁছাবে এবং Switch সিদ্ধান্ত নেবে সেটি কোথায় পাঠাতে হবে।',
      apply: function(st){ st.wire = { pkt:f1, from:'pcA', to:'sw1' }; st.banner = 'Frame Switch-এ ঢুকছে'; }
    });

    /* ── ধাপ ১: Source থেকে শেখা ── */
    steps.push({
      t:at(), actor:'sw1', layer:'L2', kind:cfg.learned ? 'info' : 'ok',
      title: cfg.learned ? 'Source MAC আগেই জানা ছিল' : 'Source MAC শিখল',
      packet:f1,
      what: cfg.learned
        ? 'Switch Source MAC `' + A + '` দেখল — এটি ইতিমধ্যে Table-এ Port 1-এ আছে, তাই শুধু entry-টির সময় নতুন করে লেখা হলো।'
        : 'Switch Frame-টির **Source MAC** `' + A + '` দেখল এবং মনে রাখল যে এই MAC Address **Port 1**-এ আছে।',
      why :'এটাই Switch-এর শেখার একমাত্র উপায়। Frame যে port দিয়ে ঢুকেছে, তার Source MAC নিশ্চয়ই সেই port-এর ওপাশে আছে।\n\nলক্ষ্য করুন — শেখা হচ্ছে **Source** MAC থেকে, কিন্তু পাঠানোর সিদ্ধান্ত হবে **Destination** MAC দেখে। এই দুটি সম্পূর্ণ আলাদা কাজ।',
      apply: function(st){ st.hub.macTable[A] = { port:1, age:0 }; st.banner = 'শিখল: ' + A + ' → Port 1'; }
    });

    /* ── ধাপ ২: Destination খোঁজা ── */
    if(cfg.learned){
      steps.push({
        t:at(), actor:'sw1', layer:'L2', kind:'ok',
        title:'Table-এ পাওয়া গেল — নির্দিষ্ট port-এ forward', packet:f1,
        what:'Switch Destination MAC `' + B + '` তার Table-এ খুঁজল এবং পেয়ে গেল — Port 2।',
        why :'জানা থাকলে Switch শুধু সেই একটি port-এ Frame পাঠায়। PC-C এই Frame-টি কখনো দেখবেই না।\n\nএখানেই Switch আর পুরোনো Hub-এর পার্থক্য — Hub সবসময় সবাইকে পাঠাত, Switch শুধু যাকে দরকার তাকেই পাঠায়।',
        apply: function(st){ st.wire = { pkt:f1, from:'sw1', to:'pcB' }; st.banner = 'Port 2-এ forward'; }
      });
    } else {
      steps.push({
        t:at(), actor:'sw1', layer:'L2', kind:'warn',
        title:'Destination অজানা — flood করল', packet:f1,
        what:'Switch Destination MAC `' + B + '` তার Table-এ খুঁজল, কিন্তু পেল না। তাই সে Frame-টি **Port 1 বাদে সব port-এ** পাঠিয়ে দিল।',
        why :'PC-B এখনো একটিও Frame পাঠায়নি, তাই Switch তার অস্তিত্বই জানে না। এই অবস্থায় Frame ফেলে দিলে যোগাযোগ কখনোই শুরু হতো না।\n\nতাই Switch নিরাপদ পথ নেয় — সবাইকে পাঠাও, ঠিক device-টি নিজেই নিয়ে নেবে। একে বলে **Unknown Unicast Flooding**।',
        apply: function(st){ st.wire = { pkt:f1, from:'sw1', to:'flood' }; st.banner = 'অজানা destination — flood'; }
      });

      steps.push({
        t:at(), actor:'pcC', layer:'L2', kind:'warn',
        title:'PC-C Frame টি ফেলে দিল', packet:f1,
        what:'PC-C Frame-টি পেল, Destination MAC `' + B + '` দেখল, নিজের MAC `' + C + '`-এর সাথে মেলাল — মিলল না। তাই সে Frame-টি ফেলে দিল।',
        why :'প্রতিটি NIC নিজের MAC Address-এর সাথে destination মিলিয়ে দেখে। না মিললে Frame-টি উপরের layer-এ পাঠানোই হয় না।\n\nএজন্যই flood হলেও ভুল device-এ data "পৌঁছে যায়" না — কিন্তু bandwidth খরচ ঠিকই হয়।',
        apply: function(st){ st.banner = 'PC-C: আমার MAC নয়, drop'; }
      });
    }

    steps.push({
      t:at(), actor:'pcB', layer:'L2', kind:'ok',
      title:'PC-B Frame টি গ্রহণ করল', packet:f1,
      what:'PC-B দেখল Destination MAC তারই। তাই সে Frame-টি গ্রহণ করে ভেতরের IP Packet উপরের layer-এ পাঠিয়ে দিল।',
      why :'MAC Address মিলে গেছে, তাই এই Frame-টি তার জন্যই। এখন Layer 2-এর কাজ শেষ, Layer 3 শুরু।',
      apply: function(st){ st.wire = null; st.banner = 'PC-B গ্রহণ করল'; }
    });

    if(!cfg.reply) return steps;

    /* ── ধাপ ৩: উত্তর এলে Switch দ্বিতীয় device-কেও শেখে ── */
    var f2 = P.make([
      P.ethernet(B, A, 'ip'),
      P.ip('192.168.1.20', '192.168.1.10', 64, 'tcp', 60),
      P.tcp(80, 51000, 1, 2, 'SYN-ACK', 64240)
    ], { label:'Frame B→A', kind:'ack', from:'pcB', to:'pcA' });

    steps.push({
      t:at(), actor:'pcB', layer:'L2', kind:'info',
      title:'PC-B উত্তর পাঠাল', packet:f2,
      what:'PC-B এবার নিজে একটি Frame পাঠাচ্ছে — Source MAC `' + B + '`, Destination MAC `' + A + '`।',
      why :'এই Frame-টিই Switch-কে PC-B সম্পর্কে শেখাবে। এখানেই বোঝা যায় Switch শেখে কেবল তখনই যখন কোনো device **নিজে কথা বলে**।',
      apply: function(st){ st.wire = { pkt:f2, from:'pcB', to:'sw1' }; st.banner = 'উত্তর আসছে'; }
    });

    steps.push({
      t:at(), actor:'sw1', layer:'L2', kind:'ok',
      title:'PC-B কেও শিখে ফেলল', packet:f2,
      what:'Switch Source MAC `' + B + '` দেখে Table-এ লিখল — **Port 2**। এখন Table-এ দুটি entry।',
      why :'এখন Switch দুই দিকই জানে। এরপর A→B বা B→A যেকোনো Frame সরাসরি ঠিক port-এ যাবে, আর কখনো flood হবে না।\n\nএভাবেই একটি Switch কয়েক সেকেন্ডের মধ্যেই পুরো network-টা "শিখে" ফেলে।',
      apply: function(st){ st.hub.macTable[B] = { port:2, age:0 }; st.banner = 'শিখল: ' + B + ' → Port 2'; }
    });

    steps.push({
      t:at(), actor:'sw1', layer:'L2', kind:'ok',
      title:'এবার সরাসরি Port 1-এ পাঠাল', packet:f2,
      what:'Destination MAC `' + A + '` Table-এ আছে (Port 1), তাই Frame-টি শুধু সেখানেই গেল। PC-C কিছুই দেখল না।',
      why :'প্রথম Frame-টি flood হয়েছিল, কিন্তু এটি হলো না — কারণ ইতিমধ্যে শেখা হয়ে গেছে। এটাই Switch-এর মূল সুবিধা: যত বেশি traffic, তত ভালো সে জানে, তত কম অপ্রয়োজনীয় Frame।',
      apply: function(st){ st.wire = { pkt:f2, from:'sw1', to:'pcA' }; st.banner = 'Port 1-এ forward'; }
    });

    return steps;
  }
};

})(window.NetLab);
