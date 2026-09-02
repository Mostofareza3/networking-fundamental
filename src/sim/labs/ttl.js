/* ═══════════════════════════════════════════════════════════════════
   LAB · TTL & Traceroute — একটি সংখ্যা কমতে কমতে শূন্য
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var HOPS = [
  { id:'r1', name:'Router 1', ip:'192.168.1.1',  mac:'11:11:11:11:11:11' },
  { id:'r2', name:'Router 2', ip:'10.0.0.1',     mac:'22:22:22:22:22:22' },
  { id:'r3', name:'Router 3', ip:'172.16.0.1',   mac:'33:33:33:33:33:33' }
];

NS.labs.ttl = {
  id: 'ttl',
  title: 'TTL & Traceroute',
  group: 'Phase 2 · Layer 3',
  chapter: 'ch14',
  blurb: 'TTL একটি সাধারণ কাউন্টার, কিন্তু এর উপরেই দাঁড়িয়ে আছে loop protection এবং traceroute — দুটোই।',

  learn: [
    'প্রতিটি Router কেন TTL এক কমায়',
    'TTL শূন্য হলে ঠিক কী ঘটে, আর কে জানতে পারে',
    'Traceroute কীভাবে এই একই নিয়মকে কাজে লাগিয়ে পুরো পথ আবিষ্কার করে',
    'TTL ছাড়া routing loop কেন ভয়ঙ্কর হতো'
  ],

  mistakes: [
    { m:'TTL মানে Packet কত সেকেন্ড বাঁচবে।',
      r:'নামটি "Time To Live" হলেও এটি সময় নয়, **hop গোনে**। প্রতিটি Router একে ১ কমায়। শূন্য হলে Packet drop — তাতে কত সময় লেগেছে সেটা অপ্রাসঙ্গিক।' },
    { m:'Traceroute-এর জন্য আলাদা কোনো বিশেষ protocol লাগে।',
      r:'Traceroute কোনো নতুন জিনিস আবিষ্কার করেনি — সে শুধু TTL-এর স্বাভাবিক নিয়মটাকে কাজে লাগায়। TTL=1 দিয়ে পাঠালে প্রথম Router নালিশ করে, TTL=2 দিয়ে পাঠালে দ্বিতীয় — এভাবেই পুরো পথ বেরিয়ে আসে।' }
  ],

  controls: [
    { key:'mode', type:'choice', label:'কী চালাবেন', def:'normal',
      options:[ ['normal','সাধারণ Packet — TTL 64'],
                ['low','TTL 2 দিয়ে পাঠান — মাঝপথে মরবে'],
                ['trace','Traceroute — পুরো পথ আবিষ্কার'] ],
      help:'Traceroute দেখলে বোঝা যাবে TTL কীভাবে একটি tool-এ পরিণত হয়।' }
  ],

  build: function(){
    var devs = [ N.pc('client', { name:'Client', x:8, y:50, mac:'AA:AA:AA:AA:AA:AA',
                                  ip:'192.168.1.10', gw:'192.168.1.1' }) ];
    for(var i = 0; i < HOPS.length; i++){
      var h = HOPS[i];
      devs.push(N.router(h.id, { name:h.name, x:26 + i * 22, y:50,
        ifaces:[{ name:'eth0', ip:h.ip, mac:h.mac, mask:'255.255.255.0' }] }));
    }
    devs.push(N.server('srv', { name:'Server', x:92, y:50, mac:'SS:SS:SS:SS:SS:SS',
                                ip:'93.184.216.34' }));
    return {
      devices: devs,
      links: [ N.link('client','r1'), N.link('r1','r2'),
               N.link('r2','r3'), N.link('r3','srv') ],
      hub: null, wire: null, banner: null, hops: []
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var SRC = '192.168.1.10', DST = '93.184.216.34';

    function pkt(ttl, label, from, to){
      return P.make([
        P.ethernet('AA:AA:AA:AA:AA:AA', '11:11:11:11:11:11', 'ip'),
        P.ip(SRC, DST, ttl, 'icmp', 60)
      ], { label:label, kind:'data', from:from, to:to });
    }
    function icmp(fromIp, label, from){
      return P.make([
        P.ethernet('11:11:11:11:11:11', 'AA:AA:AA:AA:AA:AA', 'ip'),
        P.ip(fromIp, SRC, 64, 'icmp', 56)
      ], { label:label, kind:'ack', from:from, to:'client' });
    }

    /* ── Traceroute: একই কৌশল বারবার, প্রতিবার TTL এক বাড়িয়ে ── */
    if(cfg.mode === 'trace'){
      steps.push({
        t:at(), actor:'client', layer:'L3', kind:'info',
        title:'Traceroute শুরু',
        what:'Client পুরো পথটা জানতে চায় — কোন কোন Router পার হয়ে Packet গন্তব্যে যায়।',
        why :'কিন্তু Packet-এর ভেতরে তো পথ লেখা থাকে না, আর কোনো Router-ও নিজে থেকে পরিচয় দেয় না।\n\nTraceroute একটি চতুর কৌশল ব্যবহার করে — ইচ্ছা করে TTL কম দিয়ে Packet পাঠায়, যাতে Router বাধ্য হয়ে নালিশ করে। সেই নালিশ থেকেই Router-এর পরিচয় পাওয়া যায়।',
        apply: function(st){ st.banner = 'Traceroute শুরু'; st.hops = []; }
      });

      for(var i = 0; i < HOPS.length; i++){
        (function(n, h){
          var p = pkt(n, 'TTL=' + n, 'client', h.id);
          steps.push({
            t:at(), actor:'client', layer:'L3', kind:'info',
            title:'TTL=' + n + ' দিয়ে পাঠানো হলো', packet:p,
            what:'এবার Packet পাঠানো হলো TTL=**' + n + '** দিয়ে।',
            why : n === 1
              ? 'TTL=1 মানে প্রথম Router-ই একে ০ করে ফেলবে, তাই সে-ই নালিশ করবে। এভাবে প্রথম hop-এর পরিচয় জানা যাবে।'
              : 'TTL=' + n + ' মানে Packet-টি ' + n + ' নম্বর Router পর্যন্ত পৌঁছে তারপর মরবে। তাই এবার ' + n + ' নম্বর hop নিজের পরিচয় দেবে।',
            apply: function(st){ st.wire = { pkt:p, from:'client', to:h.id }; st.banner = 'TTL=' + n; }
          });

          var rep = icmp(h.ip, 'Time Exceeded', h.id);
          steps.push({
            t:at(), actor:h.id, layer:'L3', kind:'warn',
            title:'Hop ' + n + ' নিজের পরিচয় দিল', packet:rep,
            what:'`' + h.name + '` TTL ০ পেয়ে Packet ফেলে দিল এবং Client-কে একটি **ICMP Time Exceeded** বার্তা পাঠাল। সেই বার্তার source IP `' + h.ip + '` — এটিই hop ' + n + '-এর পরিচয়।',
            why :'Router যখন TTL শূন্য করে Packet ফেলে, তখন সে চুপ করে থাকে না — প্রেরককে জানায়। আর সেই বার্তাটি পাঠাতে গিয়ে সে নিজের IP Address ব্যবহার করে।\n\nএটাই traceroute-এর পুরো রহস্য — Router নিজের অজান্তেই নিজের পরিচয় দিয়ে দেয়।',
            apply: function(st){
              st.wire = { pkt:rep, from:h.id, to:'client' };
              st.hops = st.hops.concat([{ n:n, ip:h.ip, name:h.name }]);
              st.banner = 'hop ' + n + ' = ' + h.ip;
            }
          });
        })(i + 1, HOPS[i]);
      }

      var last = pkt(64, 'TTL=64', 'client', 'srv');
      steps.push({
        t:at(), actor:'srv', layer:'L3', kind:'ok',
        title:'গন্তব্যে পৌঁছে গেল — Traceroute শেষ', packet:last,
        what:'যথেষ্ট TTL দিয়ে পাঠানোয় Packet এবার Server পর্যন্ত পৌঁছাল। Server নিজে উত্তর দিল, তাই বোঝা গেল পথের শেষ এসেছে।',
        why :'পুরো পথটি এখন জানা:\n\n`1. 192.168.1.1`\n`2. 10.0.0.1`\n`3. 172.16.0.1`\n`4. 93.184.216.34` (গন্তব্য)\n\nএকটি সাধারণ কাউন্টারকে বারবার ব্যবহার করে পুরো পথ আবিষ্কার হয়ে গেল। TTL-এর নকশা যখন করা হয়েছিল, তখন কেউ এই ব্যবহারের কথা ভাবেনি।',
        apply: function(st){ st.wire = null; st.banner = 'Traceroute সম্পন্ন — 3 hop'; }
      });
      return steps;
    }

    /* ── সাধারণ Packet, অথবা TTL কম দিয়ে ── */
    var startTtl = cfg.mode === 'low' ? 2 : 64;
    var p0 = pkt(startTtl, 'TTL=' + startTtl, 'client', 'r1');

    steps.push({
      t:at(), actor:'client', layer:'L3', kind:'info',
      title:'Packet পাঠানো হলো — TTL ' + startTtl, packet:p0,
      what:'Packet-টি TTL=**' + startTtl + '** নিয়ে যাত্রা শুরু করল।',
      why : cfg.mode === 'low'
        ? 'TTL মাত্র ২ — অর্থাৎ এই Packet সর্বোচ্চ ২টি Router পার হতে পারবে। কিন্তু গন্তব্যে পৌঁছাতে ৩টি Router লাগে। দেখা যাক কী হয়।'
        : 'সাধারণত OS ৬৪ (কখনো ১২৮ বা ২৫৫) দিয়ে শুরু করে। Internet-এ বেশিরভাগ গন্তব্য ৩০ hop-এর মধ্যেই, তাই ৬৪ যথেষ্ট বেশি।',
      apply: function(st){ st.wire = { pkt:p0, from:'client', to:'r1' }; st.banner = 'TTL ' + startTtl; }
    });

    var ttl = startTtl;
    for(var k = 0; k < HOPS.length; k++){
      var h = HOPS[k];
      ttl--;
      var dead = ttl === 0;
      var nextId = k < HOPS.length - 1 ? HOPS[k + 1].id : 'srv';

      (function(h, ttlNow, dead, nextId, idx){
        if(dead){
          var rep = icmp(h.ip, 'Time Exceeded', h.id);
          steps.push({
            t:at(), actor:h.id, layer:'L3', kind:'error',
            title:'TTL শূন্য — Packet drop', packet:rep,
            what:'`' + h.name + '` TTL ১ কমিয়ে **০** পেল। তাই সে Packet-টি আর এগিয়ে দিল না, ফেলে দিল।',
            why :'এটাই TTL-এর মূল উদ্দেশ্য। যদি কোনো কারণে routing table ভুল হয়ে Packet একই কয়েকটি Router-এর মধ্যে ঘুরতে থাকত, TTL ছাড়া সেটি **চিরকাল ঘুরত** এবং ধীরে ধীরে পুরো network-এর bandwidth খেয়ে ফেলত।\n\nTTL নিশ্চিত করে প্রতিটি Packet-এর একটি নির্দিষ্ট আয়ু আছে। তারপর সে মরবেই।\n\nRouter প্রেরককে একটি **ICMP Time Exceeded** পাঠাল — এটিই traceroute-এর ভিত্তি।',
            apply: function(st){ st.wire = { pkt:rep, from:h.id, to:'client' }; st.banner = 'TTL 0 — drop'; }
          });
        } else {
          var fp = pkt(ttlNow, 'TTL=' + ttlNow, h.id, nextId);
          steps.push({
            t:at(), actor:h.id, layer:'L3', kind:'ok',
            title:h.name + ': TTL ' + (ttlNow + 1) + ' → ' + ttlNow, packet:fp,
            what:'`' + h.name + '` Packet-টি পেয়ে TTL ১ কমিয়ে **' + ttlNow + '** করল, তারপর পরের দিকে পাঠিয়ে দিল।',
            why :'প্রতিটি Router এই কাজটি বাধ্যতামূলকভাবে করে — এটি IP-র নিয়ম। TTL কমানো ছাড়া কোনো Router Packet forward করতে পারে না।\n\nএখনো ' + ttlNow + ' বাকি, তাই Packet বেঁচে আছে।',
            apply: function(st){ st.wire = { pkt:fp, from:h.id, to:nextId }; st.banner = 'TTL ' + ttlNow; }
          });
        }
      })(h, ttl, dead, nextId, k);

      if(dead){
        steps.push({
          t:at(), actor:'client', layer:'L3', kind:'warn',
          title:'Client নালিশটি পেল',
          what:'Client একটি ICMP Time Exceeded বার্তা পেল `' + h.ip + '` থেকে। সে বুঝল Packet গন্তব্যে পৌঁছায়নি।',
          why :'এখানে একটা গুরুত্বপূর্ণ কথা — Client জানতে পারল **কোথায়** Packet মরেছে, কারণ নালিশকারী Router নিজের IP দিয়ে বার্তা পাঠিয়েছে।\n\nএই তথ্যটুকুই traceroute-কে সম্ভব করে তোলে। Control mode-এ `Traceroute` বেছে দেখুন কীভাবে।',
          apply: function(st){ st.wire = null; st.banner = 'Time Exceeded from ' + h.ip; }
        });
        return steps;
      }
    }

    steps.push({
      t:at(), actor:'srv', layer:'L3', kind:'ok',
      title:'গন্তব্যে পৌঁছাল — TTL ' + ttl + ' বাকি',
      what:'৩টি Router পার হয়ে Packet Server-এ পৌঁছাল। TTL ' + startTtl + ' থেকে কমে ' + ttl + ' হয়েছে।',
      why :'TTL-এর এই কমে যাওয়া থেকেই একটা কাজের তথ্য পাওয়া যায় — `ping`-এর উত্তরে TTL দেখে অনুমান করা যায় গন্তব্য কত hop দূরে।\n\nযেমন উত্তরে TTL=৫৬ দেখলে বোঝা যায় শুরু হয়েছিল ৬৪ দিয়ে, তাই প্রায় ৮টি hop পার হয়েছে।',
      apply: function(st){ st.wire = null; st.banner = 'পৌঁছাল · TTL ' + ttl; }
    });

    return steps;
  }
};

})(window.NetLab);
