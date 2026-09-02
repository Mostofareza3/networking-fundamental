/* ═══════════════════════════════════════════════════════════════════
   LAB · Encapsulation — উপর থেকে নিচে নামার সময় কী যোগ হয়
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

NS.labs.encap = {
  id: 'encap',
  title: 'Encapsulation Lab',
  group: 'Phase 1 · Foundation',
  chapter: 'ch3',
  blurb: 'Application-এর data নিচের দিকে নামার সময় প্রতিটি layer নিজের header যোগ করে। সেই স্তরে স্তরে মোড়ানোটাই Encapsulation।',

  learn: [
    'প্রতিটি layer ঠিক কী তথ্য যোগ করে এবং কেন',
    'একই data-র নাম layer ভেদে বদলায় কেন (Segment → Packet → Frame)',
    'নিচের layer উপরের layer-এর ভেতরে কী আছে তা জানে না — কেন সেটা ভালো',
    'Receiver-এর দিকে ঠিক উল্টো ক্রমে খোলা হয় (Decapsulation)'
  ],

  mistakes: [
    { m:'Packet, Frame আর Segment — তিনটি আলাদা জিনিস।',
      r:'একই data ভিন্ন layer-এ ভিন্ন নামে ডাকা হয়। TCP header লাগালে Segment, তার উপর IP header লাগালে Packet, তার উপর Ethernet header লাগালে Frame। জিনিসটা একটাই, মোড়কটা বাড়ছে।' },
    { m:'নিচের layer উপরের data পড়ে বুঝে সিদ্ধান্ত নেয়।',
      r:'প্রতিটি layer শুধু নিজের header দেখে। Ethernet-এর কাছে পুরো IP Packet-টা নিছক payload — ভেতরে কী আছে তার জানার দরকারই নেই। এই স্বাধীনতার জন্যই একই IP অন্য যেকোনো Layer 2 প্রযুক্তির উপর চলতে পারে।' }
  ],

  controls: [
    { key:'proto', type:'choice', label:'Transport protocol', def:'tcp',
      options:[ ['tcp','TCP'], ['udp','UDP'] ],
      help:'TCP হলে reliability-র জন্য বাড়তি field থাকে, UDP-র header অনেক ছোট।' }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Client', x:18, y:50, mac:'AA:AA:AA:AA:AA:AA', ip:'192.168.1.10' }),
        N.server('srv', { name:'Server', x:82, y:50, mac:'SS:SS:SS:SS:SS:SS', ip:'93.184.216.34' })
      ],
      links: [ N.link('client','srv') ],
      hub: null,
      stack: [],     /* এখন পর্যন্ত কয়টি layer মোড়ানো হয়েছে */
      wire: null,
      banner: null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var isTcp = cfg.proto !== 'udp';
    var steps = [], t = 0;
    function at(){ return ++t; }

    var body = P.data('GET /users HTTP/1.1');
    var l4   = isTcp
      ? P.tcp(54321, 443, 1000, 0, 'PSH, ACK', 64240)
      : { name:'UDP Header', layer:'L4', size:8, fields:[
          ['srcPort','54321'], ['dstPort','443'] ] };
    var l3 = P.ip('192.168.1.10', '93.184.216.34', 64, isTcp ? 'tcp' : 'udp',
                  20 + l4.size + body.size);
    var l2 = P.ethernet('AA:AA:AA:AA:AA:AA', 'RR:RR:RR:RR:RR:RR', 'ip');

    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'info',
      title:'Application data তৈরি হলো',
      packet: P.make([body], { label:'Data', kind:'data' }),
      what:'Browser একটি HTTP request বানাল — `GET /users HTTP/1.1`। এই মুহূর্তে এটি নিছক কিছু byte, কোনো header নেই।',
      why :'Application layer জানে **কী** পাঠাতে হবে, কিন্তু সেটি কীভাবে গন্তব্যে পৌঁছাবে তা নিয়ে সে ভাবে না। সেই দায়িত্ব নিচের layer গুলোর।',
      apply: function(st){ st.stack = ['L7']; st.banner = 'Payload তৈরি'; }
    });

    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'ok',
      title: (isTcp ? 'TCP' : 'UDP') + ' Header যোগ হলো',
      packet: P.make([l4, body], { label: isTcp ? 'TCP Segment' : 'UDP Datagram', kind:'data' }),
      what:'data-র সামনে ' + (isTcp ? 'TCP' : 'UDP') + ' Header বসল। এখন এর নাম **' +
           (isTcp ? 'Segment' : 'Datagram') + '**।',
      why : isTcp
        ? 'Port দিয়ে বোঝা যাবে কোন application-এর data। আর Sequence Number ও ACK Number-এর জন্যই TCP হারানো data আবার পাঠাতে এবং ঠিক ক্রমে সাজাতে পারে।\n\nHeader-এর আকার ২০ byte — এই বাড়তি খরচেই reliability কেনা হচ্ছে।'
        : 'UDP-র header মাত্র ৮ byte — শুধু Port আর length। কোনো Sequence Number নেই, কোনো ACK নেই।\n\nতাই UDP হালকা ও দ্রুত, কিন্তু data হারিয়ে গেলে UDP নিজে কিছুই করবে না।',
      apply: function(st){ st.stack = ['L7','L4']; st.banner = (isTcp?'TCP':'UDP') + ' Header যোগ'; }
    });

    steps.push({
      t:at(), actor:'client', layer:'L3', kind:'ok',
      title:'IP Header যোগ হলো',
      packet: P.make([l3, l4, body], { label:'IP Packet', kind:'data' }),
      what:'পুরো Segment-টির সামনে IP Header বসল — Source IP `192.168.1.10`, Destination IP `93.184.216.34`। এখন এর নাম **Packet**।',
      why :'IP-র কাজ হলো ভিন্ন ভিন্ন network পেরিয়ে গন্তব্যে পৌঁছানো। পথের প্রতিটি Router এই Destination IP দেখেই সিদ্ধান্ত নেবে Packet-টি কোন দিকে পাঠাতে হবে।\n\nলক্ষণীয় — IP-র কাছে পুরো TCP Segment-টি নিছক payload। ভেতরে Port কত, Sequence কত — IP এসব দেখেই না।',
      apply: function(st){ st.stack = ['L7','L4','L3']; st.banner = 'IP Header যোগ'; }
    });

    steps.push({
      t:at(), actor:'client', layer:'L2', kind:'ok',
      title:'Ethernet Header যোগ হলো',
      packet: P.make([l2, l3, l4, body], { label:'Ethernet Frame', kind:'data' }),
      what:'সবার বাইরে Ethernet Header বসল — Destination MAC হলো Router-এর। এখন এর নাম **Frame**।',
      why :'IP গন্তব্য ঠিক করে, কিন্তু এই মুহূর্তে Frame-টিকে শুধু পাশের device পর্যন্ত পৌঁছাতে হবে। সেই "পাশের device" চেনার কাজটাই MAC Address-এর।\n\nএজন্যই destination MAC হলো Router-এর, অথচ destination IP হলো দূরের Server-এর। প্রতিটি hop-এ Frame-এর MAC বদলাবে, কিন্তু ভেতরের IP একই থাকবে।',
      apply: function(st){ st.stack = ['L7','L4','L3','L2']; st.banner = 'Ethernet Frame প্রস্তুত'; }
    });

    steps.push({
      t:at(), actor:'client', layer:'L1', kind:'info',
      title:'Bit হিসেবে তারে চলে গেল',
      packet: P.make([l2, l3, l4, body], { label:'Bits', kind:'data' }),
      what:'পুরো Frame-টি এখন 0 আর 1-এর একটি ধারা হিসেবে cable-এ electrical signal আকারে যাচ্ছে।',
      why :'এখানেই নামার পথ শেষ। মজার ব্যাপার — তারের ভেতরে "Header" বলে আলাদা কিছু নেই, সবটাই একটানা bit। কোন bit কোন header তা receiver জানে কারণ প্রতিটি protocol-এর header-এর গঠন আগে থেকেই নির্ধারিত।',
      apply: function(st){
        st.stack = ['L7','L4','L3','L2','L1'];
        st.wire = { pkt: P.make([l2,l3,l4,body], {label:'Frame', kind:'data'}), from:'client', to:'srv' };
        st.banner = 'তারে পাঠানো হলো';
      }
    });

    steps.push({
      t:at(), actor:'srv', layer:'L2', kind:'ok',
      title:'Server উল্টো ক্রমে খুলতে শুরু করল',
      packet: P.make([l3, l4, body], { label:'Decapsulation', kind:'data' }),
      what:'Server Frame-টি পেয়ে Ethernet Header খুলে ফেলল, তারপর IP Header, তারপর ' +
           (isTcp ? 'TCP' : 'UDP') + ' Header — একে একে।',
      why :'এটাই **Decapsulation** — Encapsulation-এর ঠিক উল্টো। প্রতিটি layer নিজের header খুলে ভেতরের অংশটুকু উপরের layer-এ পাঠিয়ে দেয়।\n\nশেষে Application যা পায়, তা হুবহু সেই `GET /users HTTP/1.1` — মাঝখানে কী কী মোড়ক লেগেছিল সে তার কিছুই জানে না। এই না-জানাটাই layered design-এর সৌন্দর্য।',
      apply: function(st){ st.stack = ['L7']; st.wire = null; st.banner = 'Decapsulation সম্পন্ন'; }
    });

    return steps;
  }
};

})(window.NetLab);
