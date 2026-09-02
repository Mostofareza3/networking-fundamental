/* ═══════════════════════════════════════════════════════════════════
   LAB · Packet Visualizer — একটি Packet-এর ভেতরে ঠিক কী আছে
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

NS.labs.packet = {
  id: 'packet',
  title: 'Packet Visualizer',
  group: 'Phase 1 · Foundation',
  chapter: 'ch4',
  blurb: 'একটি Frame-এর প্রতিটি স্তর খুলে দেখুন — কোন field কে ব্যবহার করে, আর কে করে না।',

  learn: [
    'একটি সাধারণ HTTPS request-এর Frame-এ কী কী থাকে',
    'কোন device কোন header পড়ে — Switch, Router, Server',
    'Header আর Payload-এর পার্থক্য',
    'একটি field বদলালে কে সেটা খেয়াল করে'
  ],

  mistakes: [
    { m:'সব device পুরো Packet-টি খুলে পড়ে।',
      r:'প্রতিটি device শুধু নিজের প্রয়োজনীয় layer পর্যন্ত পড়ে। Switch শুধু Ethernet Header দেখে, Router সেই সাথে IP Header, আর Port-এর খবর রাখে কেবল গন্তব্য host। বাকিটা তার কাছে নিছক payload।' },
    { m:'Header মানে বাড়তি ঝামেলা, data-ই আসল।',
      r:'Header ছাড়া data-র কোনো মানে নেই — কোথায় যাবে, কে পাঠিয়েছে, কোন application-এর জন্য, কিছুই জানা যেত না। এই ৫৪ byte header-ই পুরো delivery ব্যবস্থাটা সম্ভব করে।' }
  ],

  controls: [
    { key:'view', type:'choice', label:'কে দেখছে', def:'all',
      options:[ ['all','সবকিছু (আমরা)'], ['switch','Switch যতটুকু দেখে'],
                ['router','Router যতটুকু দেখে'], ['server','Server যতটুকু দেখে'] ],
      help:'বদলে দেখুন প্রতিটি device আসলে কতটুকু পড়ে।' }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Client', x:16, y:50, mac:'AA:AA:AA:AA:AA:AA', ip:'192.168.1.10' }),
        N.router('router', { name:'Router', x:50, y:50,
          ifaces:[{ name:'eth0', ip:'192.168.1.1', mac:'RR:RR:RR:RR:RR:RR', mask:'255.255.255.0' }] }),
        N.server('srv', { name:'Server', x:84, y:50, mac:'SS:SS:SS:SS:SS:SS', ip:'93.184.216.34',
          listening:[{ port:443, service:'HTTPS', open:true }] })
      ],
      links: [ N.link('client','router'), N.link('router','srv') ],
      hub: null,
      wire: null,
      banner: null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var view = cfg.view || 'all';
    var steps = [], t = 0;
    function at(){ return ++t; }

    var body = P.data('GET /users HTTP/1.1');
    var l4 = P.tcp(54321, 443, 1000, 0, 'PSH, ACK', 64240);
    var l3 = P.ip('192.168.1.10', '93.184.216.34', 64, 'tcp', 20 + 20 + body.size);
    var l2 = P.ethernet('AA:AA:AA:AA:AA:AA', 'RR:RR:RR:RR:RR:RR', 'ip');
    var full = P.make([l2, l3, l4, body], { label:'Frame', kind:'data', from:'client', to:'srv' });

    steps.push({
      t:at(), actor:'client', layer:'L2', kind:'info',
      title:'সম্পূর্ণ Frame টি দেখুন', packet:full,
      what:'এটি একটি সাধারণ HTTPS request-এর Frame। মোট চারটি স্তর — Ethernet, IP, TCP এবং Payload। ডানপাশের Packet Inspector-এ যেকোনো field-এ click করে তার ব্যাখ্যা দেখুন।',
      why :'মোট header ৫৪ byte (14 + 20 + 20), আর আসল data ' + body.size + ' byte।\n\nছোট request-এ header-ই বেশি জায়গা নেয় — এজন্যই অনেক ছোট ছোট request পাঠানোর চেয়ে কম সংখ্যক বড় request পাঠানো efficient।',
      apply: function(st){ st.banner = 'সম্পূর্ণ Frame'; }
    });

    if(view === 'all' || view === 'switch'){
      steps.push({
        t:at(), actor:'client', layer:'L2', kind:'ok',
        title:'Switch শুধু এইটুকু পড়ে',
        packet: P.make([l2], { label:'Ethernet Header', kind:'data' }),
        what:'একটি Switch শুধু Ethernet Header পড়ে — Source MAC আর Destination MAC। ব্যস।',
        why :'Switch একটি Layer 2 device। IP Address কী, Port কত, ভেতরে HTTP না DNS — এসবের কিছুই তার জানার দরকার নেই।\n\nএই সরলতার জন্যই Switch এত দ্রুত কাজ করতে পারে।',
        apply: function(st){ st.banner = 'Switch এর দৃষ্টি — শুধু Layer 2'; }
      });
    }

    if(view === 'all' || view === 'router'){
      steps.push({
        t:at(), actor:'router', layer:'L3', kind:'ok',
        title:'Router এইটুকু পর্যন্ত পড়ে',
        packet: P.make([l2, l3], { label:'Ethernet + IP', kind:'data' }),
        what:'Router Ethernet Header খুলে ফেলে ভেতরের IP Header পড়ে — মূলত Destination IP আর TTL।',
        why :'Destination IP দেখে সে Routing Table-এ খুঁজে বের করে Packet-টি কোন দিকে পাঠাতে হবে, আর TTL ১ কমিয়ে দেয়।\n\nএরপর সে **নতুন একটি Ethernet Header** বানিয়ে Packet-টি পরের hop-এ পাঠায়। অর্থাৎ MAC Address বদলে যায়, কিন্তু ভেতরের IP Header প্রায় অপরিবর্তিত থাকে।\n\nTCP Port কত — Router সেটি সাধারণত দেখেই না।',
        apply: function(st){ st.banner = 'Router এর দৃষ্টি — Layer 3 পর্যন্ত'; }
      });
    }

    if(view === 'all' || view === 'server'){
      steps.push({
        t:at(), actor:'srv', layer:'L4', kind:'ok',
        title:'Server পুরোটাই পড়ে',
        packet: full,
        what:'গন্তব্য Server একে একে সব খুলে ফেলে — Ethernet, IP, TCP, এবং শেষে আসল HTTP data।',
        why :'শুধু গন্তব্য host-ই Port 443 দেখে বুঝতে পারে এই data কোন application-এর জন্য, আর Sequence Number দেখে বুঝতে পারে data-টি stream-এর কোন জায়গায় বসবে।\n\nমাঝপথের কোনো device এতদূর পড়ে না — পড়ার দরকারও নেই।',
        apply: function(st){ st.wire = null; st.banner = 'Server সম্পূর্ণ পড়ল'; }
      });
    }

    return steps;
  }
};

})(window.NetLab);
