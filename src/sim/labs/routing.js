/* ═══════════════════════════════════════════════════════════════════
   LAB · Routing — hop by hop, প্রত্যেকে শুধু পরের ধাপ জানে
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

NS.labs.routing = {
  id: 'routing',
  title: 'Routing Lab',
  group: 'Phase 2 · Layer 3',
  chapter: 'ch12',
  blurb: 'কোনো Router পুরো পথ জানে না। প্রত্যেকে শুধু "পরের ধাপ" জানে — তবু Packet গন্তব্যে পৌঁছে যায়।',

  learn: [
    'Routing Table-এর প্রতিটি কলাম আসলে কী বলে',
    'প্রতিটি Router স্বাধীনভাবে সিদ্ধান্ত নেয় — কেউ পুরো পথ জানে না',
    'একটি Router-এর table ভুল হলে ঠিক কোথায় Packet আটকে যায়',
    'IP কেন stateless — Packet নিজে কিছু মনে রাখে না'
  ],

  mistakes: [
    { m:'প্রথম Router পুরো পথটা ঠিক করে দেয়, বাকিরা শুধু অনুসরণ করে।',
      r:'প্রতিটি Router সম্পূর্ণ স্বাধীনভাবে নিজের সিদ্ধান্ত নেয়। Packet-এর ভেতরে "পথ" বলে কিছু লেখা থাকে না — শুধু গন্তব্য লেখা থাকে। এজন্যই একই গন্তব্যের দুটি Packet ভিন্ন পথে যেতে পারে।' },
    { m:'Packet নিজে মনে রাখে সে কোথা দিয়ে এসেছে।',
      r:'IP stateless — Packet কোনো ইতিহাস বহন করে না। প্রতিটি Router শুধু destination IP দেখে নিজের table-এ খোঁজে। এজন্যই ফেরার পথ সম্পূর্ণ আলাদা হতে পারে।' }
  ],

  controls: [
    { key:'broken', type:'toggle', label:'Router B-র route মুছে দিন', def:false,
      help:'মাঝপথের একটি Router গন্তব্য না চিনলে কী হয় — Break-It Mode।' }
  ],

  build: function(cfg){
    var ra = N.router('ra', { name:'Router A', x:34, y:50,
      ifaces:[{ name:'eth0', ip:'192.168.1.1', mac:'A1:A1:A1:A1:A1:A1', mask:'255.255.255.0' },
              { name:'eth1', ip:'10.0.0.1',    mac:'A2:A2:A2:A2:A2:A2', mask:'255.255.255.0' }],
      routes:[ { dst:'192.168.1.0', prefix:24, via:'', iface:'eth0' },
               { dst:'10.0.0.0',    prefix:24, via:'', iface:'eth1' },
               { dst:'192.168.2.0', prefix:24, via:'10.0.0.2', iface:'eth1' } ] });

    var rbRoutes = [ { dst:'10.0.0.0', prefix:24, via:'', iface:'eth0' },
                     { dst:'192.168.1.0', prefix:24, via:'10.0.0.1', iface:'eth0' } ];
    if(!cfg.broken) rbRoutes.push({ dst:'192.168.2.0', prefix:24, via:'', iface:'eth1' });

    var rb = N.router('rb', { name:'Router B', x:66, y:50,
      ifaces:[{ name:'eth0', ip:'10.0.0.2',    mac:'B1:B1:B1:B1:B1:B1', mask:'255.255.255.0' },
              { name:'eth1', ip:'192.168.2.1', mac:'B2:B2:B2:B2:B2:B2', mask:'255.255.255.0' }],
      routes: rbRoutes });
    if(cfg.broken) rb.note = 'route নেই';

    return {
      devices: [
        N.pc('client', { name:'Client', x:8, y:50, mac:'AA:AA:AA:AA:AA:AA',
                         ip:'192.168.1.10', gw:'192.168.1.1' }),
        ra, rb,
        N.server('srv', { name:'Server', x:92, y:50, mac:'SS:SS:SS:SS:SS:SS',
                          ip:'192.168.2.50', gw:'192.168.2.1',
                          listening:[{ port:443, service:'HTTPS', open:true }] })
      ],
      links: [ N.link('client','ra'), N.link('ra','rb'), N.link('rb','srv') ],
      hub: null, wire: null, banner: null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var SRC = '192.168.1.10', DST = '192.168.2.50';

    function frame(sm, dm, ttl, label, from, to){
      return P.make([
        P.ethernet(sm, dm, 'ip'),
        P.ip(SRC, DST, ttl, 'tcp', 60),
        P.tcp(54321, 443, 1000, 0, 'SYN', 64240)
      ], { label:label, kind:'data', from:from, to:to });
    }

    var f1 = frame('AA:AA:AA:AA:AA:AA', 'A1:A1:A1:A1:A1:A1', 64, 'Frame → Router A', 'client', 'ra');
    steps.push({
      t:at(), actor:'client', layer:'L3', kind:'info',
      title:'Client Packet পাঠাল', packet:f1,
      what:'গন্তব্য `' + DST + '` নিজের network-এ নেই, তাই Client Packet-টি নিজের Default Gateway — Router A-কে দিয়ে দিল।',
      why :'Client পুরো পথ জানে না, জানার দরকারও নেই। তার শুধু একটাই কাজ — "যা আমি চিনি না, তা Gateway-কে দাও।"',
      apply: function(st){ st.wire = { pkt:f1, from:'client', to:'ra' }; st.banner = 'Client → Router A'; }
    });

    var f2 = frame('A2:A2:A2:A2:A2:A2', 'B1:B1:B1:B1:B1:B1', 63, 'Frame → Router B', 'ra', 'rb');
    steps.push({
      t:at(), actor:'ra', layer:'L3', kind:'ok',
      title:'Router A: পরের ধাপ Router B', packet:f2,
      what:'Router A তার table-এ `' + DST + '` খুঁজে পেল — `192.168.2.0/24 via 10.0.0.2 dev eth1`। তাই Packet-টি Router B-এর দিকে পাঠাল।',
      why :'লক্ষ্য করুন Router A **পুরো পথ জানে না** — সে শুধু জানে "192.168.2.0/24-এর জন্য 10.0.0.2-কে দাও"। এরপর কী হবে তা Router B-এর ব্যাপার।\n\nসে নতুন Ethernet Header বানাল (নতুন source ও destination MAC) আর TTL ৬৪ থেকে ৬৩ করল। কিন্তু ভেতরের source/destination IP অপরিবর্তিত।',
      apply: function(st){ st.wire = { pkt:f2, from:'ra', to:'rb' }; st.banner = 'TTL 63 · নতুন MAC'; }
    });

    if(cfg.broken){
      steps.push({
        t:at(), actor:'rb', layer:'L3', kind:'error',
        title:'Router B গন্তব্য চেনে না — Packet drop',
        what:'Router B তার table-এ `' + DST + '` খুঁজল, কিন্তু কোনো route পেল না। তাই Packet-টি ফেলে দিল।',
        why :'মজার ব্যাপার — Router B-এর `eth1` interface-টি সরাসরি `192.168.2.0/24`-এ যুক্ত, অর্থাৎ **Server ঠিক তার পাশেই**। তবু route না থাকায় সে Packet পাঠাল না।\n\nRouter অনুমান করে না, সে শুধু table পড়ে। Table-এ না থাকলে গন্তব্য পাশে থাকলেও Packet drop হয়।\n\nএখানে Client-এর কোনো দোষ নেই, Router A-রও নয় — সমস্যা শুধু পথের মাঝের একটি table-এ। এজন্যই network debug করার সময় প্রতিটি hop আলাদা করে দেখতে হয়।',
        apply: function(st){ st.wire = null; st.banner = 'Router B: no route'; }
      });
      return steps;
    }

    var f3 = frame('B2:B2:B2:B2:B2:B2', 'SS:SS:SS:SS:SS:SS', 62, 'Frame → Server', 'rb', 'srv');
    steps.push({
      t:at(), actor:'rb', layer:'L3', kind:'ok',
      title:'Router B: গন্তব্য সরাসরি যুক্ত', packet:f3,
      what:'Router B তার table-এ পেল `192.168.2.0/24 dev eth1` — কোনো next hop নেই, অর্থাৎ এই network তার সাথে **সরাসরি যুক্ত**।',
      why :'"Directly connected" মানে আর কোনো Router লাগবে না। Router B এখন ARP করে Server-এর MAC Address বের করে সরাসরি Frame পাঠাবে।\n\nTTL আরেকবার কমে ৬২ হলো।',
      apply: function(st){ st.wire = { pkt:f3, from:'rb', to:'srv' }; st.banner = 'directly connected · TTL 62'; }
    });

    steps.push({
      t:at(), actor:'srv', layer:'L3', kind:'ok',
      title:'Server পেয়ে গেল', packet:f3,
      what:'Packet গন্তব্যে পৌঁছাল। পথে দুটি Router পার হয়েছে, TTL ৬৪ থেকে ৬২ হয়েছে, MAC Address তিনবার বদলেছে।',
      why :'কিন্তু source IP `' + SRC + '` আর destination IP `' + DST + '` — এই দুটি শুরু থেকে শেষ পর্যন্ত এক রইল।\n\nএবং সবচেয়ে গুরুত্বপূর্ণ: **কেউই পুরো পথটা জানত না**। Client জানত শুধু Router A-কে। Router A জানত শুধু Router B-কে। Router B জানত Server তার পাশে। তিনটি স্থানীয় সিদ্ধান্ত মিলে একটি সম্পূর্ণ যাত্রা তৈরি হলো।',
      apply: function(st){ st.wire = null; st.banner = 'পৌঁছাল · 2 hop'; }
    });

    return steps;
  }
};

})(window.NetLab);
