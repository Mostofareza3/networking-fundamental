/* ═══════════════════════════════════════════════════════════════════
   LAB · Router Hop — IP একই থাকে, MAC প্রতি hop-এ বদলায়
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var SRC = '192.168.1.10', DST = '8.8.8.8';

NS.labs.hop = {
  id: 'hop',
  title: 'Router Hop Visualization',
  group: 'Phase 2 · Layer 3',
  chapter: 'ch13',
  blurb: 'এক Packet, তিনটি link, তিন জোড়া MAC Address — অথচ IP Header প্রায় অপরিবর্তিত। এই পার্থক্যটাই networking-এর মূল ধারণা।',

  learn: [
    'কেন destination IP পুরো পথে একই থাকে',
    'কেন destination MAC প্রতিটি link-এ বদলে যায়',
    'একটি Router আসলে ঠিক কী কী বদলায় আর কী কী রেখে দেয়',
    'Layer 2 আর Layer 3-এর "পরিধি" কেন আলাদা'
  ],

  mistakes: [
    { m:'Packet-এর সাথে প্রেরকের MAC Address পুরো পথে যায়, তাই Server জানে কার NIC থেকে এসেছে।',
      r:'Server কখনোই আপনার MAC Address দেখে না। প্রথম Router-েই আপনার MAC মুছে গিয়ে তার নিজের MAC বসে যায়। Server শুধু শেষ Router-এর MAC দেখে — আর IP Header থেকে আপনার IP।' },
    { m:'MAC Address আর IP Address আসলে একই কাজ করে, শুধু লেখার ধরন আলাদা।',
      r:'দুটোর পরিধি সম্পূর্ণ আলাদা। MAC-এর পরিধি একটি local link — এক hop। IP-এর পরিধি পুরো যাত্রা — শুরু থেকে শেষ। এজন্যই MAC বারবার বদলায় আর IP বদলায় না।' }
  ],

  controls: [
    { key:'show', type:'choice', label:'কী হাইলাইট করব', def:'both',
      options:[ ['both','দুটোই — MAC ও IP'],
                ['mac','শুধু MAC — কীভাবে বদলায়'],
                ['ip','শুধু IP — কীভাবে অপরিবর্তিত থাকে'] ],
      help:'আলাদা করে দেখলে পার্থক্যটা আরও পরিষ্কার হয়।' }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Client', x:9, y:50, mac:'AA:AA:AA:AA:AA:AA',
                         ip:SRC, gw:'192.168.1.1' }),
        N.router('r1', { name:'Router 1', x:36, y:50,
          ifaces:[{ name:'eth0', ip:'192.168.1.1', mac:'R1:LA:N0:00:00:01', mask:'255.255.255.0' },
                  { name:'eth1', ip:'10.0.0.1',    mac:'R1:WA:N0:00:00:02', mask:'255.255.255.0' }] }),
        N.router('r2', { name:'Router 2', x:64, y:50,
          ifaces:[{ name:'eth0', ip:'10.0.0.2',    mac:'R2:LA:N0:00:00:01', mask:'255.255.255.0' },
                  { name:'eth1', ip:'203.0.113.1', mac:'R2:WA:N0:00:00:02', mask:'255.255.255.0' }] }),
        N.server('srv', { name:'8.8.8.8', x:91, y:50, mac:'SS:SS:SS:SS:SS:SS', ip:DST,
                          listening:[{ port:53, service:'DNS', open:true }] })
      ],
      links: [ N.link('client','r1'), N.link('r1','r2'), N.link('r2','srv') ],
      hub: null, wire: null, banner: null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var show = cfg.show || 'both';

    /* তিনটি link, প্রতিটিতে আলাদা MAC জোড়া — কিন্তু IP এক */
    var LINKS = [
      { from:'client', to:'r1',  sm:'AA:AA:AA:AA:AA:AA', dm:'R1:LA:N0:00:00:01',
        ttl:64, name:'Link 1 · Client → Router 1', net:'192.168.1.0/24' },
      { from:'r1', to:'r2',  sm:'R1:WA:N0:00:00:02', dm:'R2:LA:N0:00:00:01',
        ttl:63, name:'Link 2 · Router 1 → Router 2', net:'10.0.0.0/24' },
      { from:'r2', to:'srv', sm:'R2:WA:N0:00:00:02', dm:'SS:SS:SS:SS:SS:SS',
        ttl:62, name:'Link 3 · Router 2 → Server', net:'203.0.113.0/24' }
    ];

    function frame(L){
      return P.make([
        P.ethernet(L.sm, L.dm, 'ip'),
        P.ip(SRC, DST, L.ttl, 'udp', 60)
      ], { label:'Frame', kind:'data', from:L.from, to:L.to });
    }

    for(var i = 0; i < LINKS.length; i++){
      (function(L, n){
        var isFirst = n === 0;
        var what, why;

        if(show === 'ip'){
          what = 'এই link-এ Packet-টির IP Header: `' + SRC + '` → `' + DST + '`।' +
                 (isFirst ? '' : ' আগের link-এ ঠিক এটাই ছিল।');
          why  = isFirst
            ? 'IP Header-এর কাজ পুরো যাত্রার গন্তব্য মনে রাখা। এটি এখন থেকে শেষ পর্যন্ত এক থাকবে — শুধু TTL কমবে।'
            : 'লক্ষ্য করুন — source আর destination IP এক চুলও বদলায়নি। শুধু TTL ' + (L.ttl + 1) + ' থেকে ' + L.ttl + ' হয়েছে।\n\nএজন্যই গন্তব্যের Server জানতে পারে Packet-টি মূলত কার কাছ থেকে এসেছে।';
        } else if(show === 'mac'){
          what = 'এই link-এ Frame-এর MAC জোড়া: `' + L.sm + '` → `' + L.dm + '`।';
          why  = isFirst
            ? 'এটি প্রথম link-এর MAC জোড়া। পরের link-এ এই দুটোই সম্পূর্ণ বদলে যাবে।'
            : 'আগের link-এর MAC দুটো **সম্পূর্ণ মুছে গেছে**। Router পুরোনো Ethernet Header ফেলে দিয়ে একদম নতুন একটি বানিয়েছে।\n\nকারণ MAC Address শুধু একটি local link-এর ভেতরে অর্থবহ। নতুন link মানে নতুন ঠিকানা।';
        } else {
          what = '**' + L.name + '** (`' + L.net + '`)\n\n' +
                 'MAC: `' + L.sm + '` → `' + L.dm + '`\n' +
                 'IP: `' + SRC + '` → `' + DST + '`  (TTL ' + L.ttl + ')';
          why  = isFirst
            ? 'শুরুতে দুটোই "স্বাভাবিক" মনে হচ্ছে। কিন্তু পরের ধাপে খেয়াল করুন কোনটা বদলায় আর কোনটা বদলায় না।'
            : 'এই link-এ **MAC জোড়া সম্পূর্ণ নতুন**, অথচ **IP জোড়া হুবহু আগের মতোই**।\n\n' +
              'কারণ দুটোর দায়িত্ব আলাদা:\n\n' +
              '`MAC` — "এই তারের ওপাশে কে?" — পরিধি এক hop\n' +
              '`IP` — "শেষ পর্যন্ত কোথায় যাবে?" — পরিধি পুরো যাত্রা';
        }

        steps.push({
          t:at(), actor: isFirst ? 'client' : L.from, layer:'L2', kind: isFirst ? 'info' : 'ok',
          title: L.name, packet: frame(L),
          what: what, why: why,
          apply: function(st){
            st.wire = { pkt: frame(L), from:L.from, to:L.to };
            st.banner = show === 'ip' ? 'IP অপরিবর্তিত · TTL ' + L.ttl
                      : show === 'mac' ? 'নতুন MAC জোড়া'
                      : 'hop ' + (n + 1) + ' · TTL ' + L.ttl;
          }
        });
      })(LINKS[i], i);
    }

    steps.push({
      t:at(), actor:'srv', layer:'L3', kind:'ok',
      title:'গন্তব্যে — সব মিলিয়ে কী বদলাল',
      what:'Packet পৌঁছে গেল। পুরো যাত্রায়:\n\n' +
           '`MAC জোড়া` — ৩ বার সম্পূর্ণ বদলেছে\n' +
           '`Source IP` — একবারও বদলায়নি\n' +
           '`Destination IP` — একবারও বদলায়নি\n' +
           '`TTL` — ৬৪ থেকে ৬২ হয়েছে',
      why :'Server এখন IP Header দেখে জানতে পারছে Packet-টি `' + SRC + '` থেকে এসেছে।\n\nকিন্তু সে Client-এর MAC Address `AA:AA:AA:AA:AA:AA` কখনোই দেখেনি — সেটি প্রথম Router-েই মুছে গিয়েছিল। Server শুধু শেষ Router-এর MAC দেখেছে।\n\n**এটাই মূল কথা:** MAC এক ধাপের ঠিকানা, IP পুরো যাত্রার ঠিকানা। দুটো আলাদা স্তরে কাজ করে বলেই একই IP নিয়ে পৃথিবীর যেকোনো প্রান্তে যাওয়া যায়, অথচ প্রতিটি local network নিজের মতো করে delivery সামলাতে পারে।',
      apply: function(st){ st.wire = null; st.banner = 'MAC বদলাল ৩ বার · IP বদলাল ০ বার'; }
    });

    return steps;
  }
};

})(window.NetLab);
