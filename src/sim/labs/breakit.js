/* ═══════════════════════════════════════════════════════════════════
   LAB · Break-It Mode — একটি জিনিস ভাঙুন, দেখুন কোথায় আটকায়
   ───────────────────────────────────────────────────────────────────
   এই lab-টি অন্যগুলোর চেয়ে আলাদা। এখানে সঠিক আচরণ দেখানো হয় না —
   এখানে ইচ্ছা করে একটি জিনিস ভেঙে দেখা হয় ঠিক কোন স্তরে যাত্রা থামে।
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI = { ip:'192.168.1.10', mac:'AA:AA:AA:AA:AA:AA' };
var GW  = { ip:'192.168.1.1',  mac:'GG:GG:GG:GG:GG:GG' };
var DNS = { ip:'8.8.8.8',      mac:'DD:DD:DD:DD:DD:DD' };
var WEB = { ip:'93.184.216.34', mac:'SS:SS:SS:SS:SS:SS' };

/* প্রতিটি ভাঙন কোন স্তরে, কী উপসর্গ দেখায়, আর কোন সরঞ্জাম দিয়ে ধরা যায় */
var BREAKS = {
  none:    { layer:'—',  stop:null,
             sym:'সব ঠিকঠাক কাজ করছে',
             tool:'—' },
  cable:   { layer:'L1', stop:'arp',
             sym:'কিছুই কাজ করছে না — কোনো উত্তরই আসছে না',
             tool:'`ip link` — interface কি UP?' },
  ip:      { layer:'L3', stop:'arp',
             sym:'একই network-এর কাউকেও ping করা যাচ্ছে না',
             tool:'`ip addr` — IP আছে কি? Subnet mask ঠিক?' },
  gateway: { layer:'L3', stop:'route',
             sym:'ভেতরের সব ঠিক, কিন্তু বাইরে কিছুই যাচ্ছে না',
             tool:'`ip route` — default route আছে?' },
  dns:     { layer:'L7', stop:'dns',
             sym:'IP দিয়ে কাজ করছে, কিন্তু নাম দিয়ে করছে না',
             tool:'`dig example.com` — উত্তর আসছে?' },
  fw:      { layer:'L4', stop:'tcp',
             sym:'DNS ঠিক, কিন্তু connection timeout হচ্ছে',
             tool:'`curl -v` — কতক্ষণ পরে ব্যর্থ হয়?' },
  server:  { layer:'L7', stop:'http',
             sym:'Connection হচ্ছে, কিন্তু 500 error আসছে',
             tool:'Server-এর log — application কী বলছে?' }
};

function mk(sIp, dIp, sMac, dMac, label, from, to, kind, proto){
  return P.make([
    P.ethernet(sMac, dMac, 'ip'),
    P.ip(sIp, dIp, 64, proto || 'tcp', 60),
    P.tcp(49152, 443, 1, 1, 'SYN', 64240)
  ], { label:label, kind:kind || 'data', from:from, to:to });
}

NS.labs.breakit = {
  id: 'breakit',
  title: 'Break-It Mode — কোথায় ভাঙল?',
  group: 'Phase 5 · Performance',
  chapter: 'ch39',
  blurb: 'একটি জিনিস ভাঙুন। দেখুন যাত্রাটি ঠিক কোন স্তরে থেমে যায়, আর উপসর্গটি কেমন দেখায়।',

  learn: [
    'প্রতিটি ভাঙন একটি নির্দিষ্ট স্তরে নির্দিষ্ট উপসর্গ তৈরি করে',
    'উপসর্গ দেখে কোন স্তরে সমস্যা তা অনুমান করা',
    'নিচ থেকে উপরে debug করার নিয়ম — এবং কেন সেটিই সঠিক ক্রম',
    'কোন সরঞ্জাম কোন স্তরের প্রশ্নের উত্তর দেয়'
  ],

  mistakes: [
    { m:'কিছু কাজ না করলে সবার আগে DNS বা application দেখা উচিত।',
      r:'উল্টো ক্রমে দেখলে সময় নষ্ট হয়। **নিচ থেকে উপরে** এগোন — cable আছে? IP আছে? Gateway-তে পৌঁছায়? DNS কাজ করে? তবে HTTP। নিচের স্তর ভাঙা থাকলে উপরের সব পরীক্ষা এমনিতেই ব্যর্থ হবে, আর সেই ব্যর্থতাগুলো বিভ্রান্তিকর।' },
    { m:'"Internet কাজ করছে না" একটি যথেষ্ট বর্ণনা।',
      r:'উপসর্গের সূক্ষ্ম পার্থক্যই আসল সূত্র। "সঙ্গে সঙ্গে refused" বনাম "দীর্ঘ অপেক্ষার পর timeout" — সম্পূর্ণ ভিন্ন দুটি কারণ। "IP-তে কাজ করে কিন্তু নামে করে না" — একটিমাত্র বাক্যেই DNS-এ সমস্যা নিশ্চিত হয়ে যায়।' },
    { m:'Ping কাজ করলে network ঠিক আছে।',
      r:'Ping শুধু ICMP পরীক্ষা করে — Layer 3 পর্যন্ত। কিন্তু Firewall TCP port ৪৪৩ আটকে রাখলে ping দিব্যি কাজ করবে, অথচ HTTPS হবে না। প্রতিটি সরঞ্জাম একটি নির্দিষ্ট স্তরের প্রশ্নের উত্তর দেয়, তার বেশি নয়।' }
  ],

  controls: [
    { key:'brk', type:'choice', label:'কোনটি ভাঙবেন', def:'gateway',
      options:[ ['none','কিছুই না — সব ঠিক আছে'],
                ['cable','Cable খুলে ফেলুন (L1)'],
                ['ip','IP Address মুছে ফেলুন (L3)'],
                ['gateway','Default Gateway মুছে ফেলুন (L3)'],
                ['dns','DNS Server বন্ধ করুন (L7)'],
                ['fw','Firewall port 443 বন্ধ করুন (L4)'],
                ['server','Server-এ ত্রুটি ঘটান (L7)'] ],
      help:'প্রতিটি ভাঙনের উপসর্গ আলাদা — সেই পার্থক্যটাই debugging-এর মূল দক্ষতা।' }
  ],

  build: function(cfg){
    var b = (cfg && cfg.brk) || 'gateway';
    return {
      devices: [
        N.pc('client', { name:'Client', x:12, y:50,
          mac: b === 'cable' ? '(link down)' : CLI.mac,
          ip:  b === 'ip' ? '(নেই)' : CLI.ip,
          gw:  b === 'gateway' ? '' : GW.ip,
          note: b === 'cable' ? '✗ link down' : b === 'ip' ? '✗ IP নেই'
              : b === 'gateway' ? '✗ gateway নেই' : 'ঠিক আছে' }),
        N.router('gw', { name:'Gateway', x:38, y:50,
          ifaces:[{ name:'lan', ip:GW.ip, mac:GW.mac, mask:'255.255.255.0' }],
          routes:[{ dst:'0.0.0.0', prefix:0, via:'ISP', iface:'wan' }],
          note: b === 'fw' ? '✗ :443 বন্ধ' : 'ঠিক আছে' }),
        N.server('dns', { name:'DNS Server', x:64, y:20, mac:DNS.mac, ip:DNS.ip,
          listening:[{ port:53, service:'DNS', open: b !== 'dns' }],
          note: b === 'dns' ? '✗ বন্ধ' : 'ঠিক আছে' }),
        N.server('web', { name:'Web Server', x:88, y:62, mac:WEB.mac, ip:WEB.ip,
          listening:[{ port:443, service:'HTTPS', open:true }],
          note: b === 'server' ? '✗ ত্রুটি' : 'ঠিক আছে' })
      ],
      links: [ N.link('client','gw'), N.link('gw','dns'), N.link('gw','web') ],
      hub:null, wire:null, banner:null,
      broke:b, reached:[], failedAt:null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var b = cfg.brk || 'gateway';
    var B = BREAKS[b];
    var stop = B.stop;

    steps.push({
      t:at(), actor:'client', layer:'L1', kind: b === 'none' ? 'ok' : 'info',
      title: b === 'none' ? 'কিছুই ভাঙা হয়নি — স্বাভাবিক যাত্রা'
                          : 'ভাঙা হলো: ' + B.layer + ' — উপসর্গ দেখা যাক',
      what: b === 'none'
        ? 'সব স্তর ঠিক আছে। পুরো যাত্রাটি শেষ পর্যন্ত যাবে।'
        : '**' + B.layer + ' স্তরে** একটি জিনিস ভাঙা হলো।\n\nউপসর্গ: *' + B.sym + '*\n\nএখন দেখা যাক যাত্রাটি ঠিক কোথায় গিয়ে থামে।',
      why : b === 'none'
        ? 'এটি তুলনার ভিত্তি। এই ধাপগুলো মনে রাখুন — তাহলে পরে যখন কিছু ভাঙবেন, ঠিক কোন ধাপে গিয়ে থামল তা স্পষ্ট বোঝা যাবে।\n\nসম্পূর্ণ যাত্রাটি: `ARP` → `Routing` → `DNS` → `TCP` → `HTTP`'
        : 'Debugging-এর মূল দক্ষতা একটাই: **উপসর্গ থেকে স্তর অনুমান করা**।\n\nপ্রতিটি স্তর ভাঙলে একটি স্বতন্ত্র চিহ্ন রেখে যায়। সেই চিহ্নগুলো চিনতে পারলে খোঁজার এলাকা মুহূর্তেই ছোট হয়ে যায়।\n\nএখানে সবচেয়ে গুরুত্বপূর্ণ নিয়ম — **নিচ থেকে উপরে এগোন**। নিচের স্তর ভাঙা থাকলে উপরের সব পরীক্ষাই ব্যর্থ হবে, আর সেই ব্যর্থতাগুলো ভুল দিকে নিয়ে যাবে।',
      apply: function(st){ st.broke = b; st.banner = b === 'none' ? 'সব ঠিক' : B.layer + ' ভাঙা'; }
    });

    /* ── L1/L2: ARP ── */
    var arpOk = (b !== 'cable' && b !== 'ip');
    var arpP = P.make([
      P.ethernet(CLI.mac, 'FF:FF:FF:FF:FF:FF', 'arp'),
      P.arp(1, CLI.mac, CLI.ip, '00:00:00:00:00:00', GW.ip)
    ], { label:'ARP: কে ' + GW.ip + '?', kind:'arp', from:'client', to:'gw' });

    steps.push({
      t:at(), actor:'client', layer:'L2', kind: arpOk ? 'ok' : 'error',
      title: arpOk ? '✓ ধাপ ১ — ARP: Gateway-র MAC পাওয়া গেল'
                   : '✗ ধাপ ১ — ARP ব্যর্থ, এখানেই সব থেমে গেল',
      packet: arpOk ? arpP : null,
      what: arpOk
        ? 'Client ARP দিয়ে Gateway-র MAC Address জেনে নিল। Layer 2 কাজ করছে।'
        : (b === 'cable'
            ? 'Cable নেই, তাই কোনো Frame পাঠানোই সম্ভব নয়। ARP request বেরোতেই পারল না।'
            : 'IP Address নেই, তাই Client জানেই না সে কোন network-এ আছে। ARP পাঠানোর কোনো ভিত্তিই নেই।'),
      why : arpOk
        ? 'এটি সবচেয়ে নিচের ধাপ, এবং সবার আগে এটিই পরীক্ষা করা উচিত।\n\nARP কাজ করা মানে অনেক কিছু একসাথে প্রমাণিত হলো — cable আছে, interface চালু, IP বসানো আছে, আর একই network-এ অন্তত একজনকে পাওয়া যাচ্ছে।'
        : (b === 'cable'
            ? '**Layer 1 ভাঙলে উপরের কিছুই কাজ করে না।**\n\nএটি স্পষ্ট মনে হলেও বাস্তবে বহু সময় নষ্ট হয় এখানে। মানুষ DNS নিয়ে ঘাঁটাঘাঁটি করে, application-এর কোড দেখে — অথচ cable-টাই ঢিলে।\n\n**সরঞ্জাম:** ' + B.tool + '\n\nএজন্যই ক্রম গুরুত্বপূর্ণ। সবার আগে সবচেয়ে নিচের প্রশ্নটি করুন: link কি আদৌ UP?'
            : 'IP Address ছাড়া Client-এর কোনো পরিচয় নেই, কোনো network-এর সদস্যপদ নেই।\n\nসে জানে না কোনটি "কাছের" আর কোনটি "দূরের", তাই কোথায় পাঠাবে সেই সিদ্ধান্তই নিতে পারে না।\n\n**সরঞ্জাম:** ' + B.tool + '\n\nসাধারণ কারণ — DHCP server-এর সাথে যোগাযোগ হয়নি। তখন OS নিজে থেকে একটি `169.254.x.x` ঠিকানা বসায়, যা দেখলেই বোঝা যায় DHCP ব্যর্থ হয়েছে।'),
      apply: function(st){
        if(arpOk){ st.wire = { pkt:arpP, from:'client', to:'gw' };
                   st.reached = ['arp']; }
        else { st.wire = null; st.failedAt = 'L2'; }
        st.banner = arpOk ? 'ARP ✓' : 'ARP ✗ — এখানেই শেষ';
      }
    });
    if(stop === 'arp'){ return steps; }

    /* ── L3: Routing ── */
    var routeOk = (b !== 'gateway');
    var rp = mk(CLI.ip, DNS.ip, CLI.mac, GW.mac, '→ gateway', 'client', 'gw', 'data', 'udp');
    steps.push({
      t:at(), actor:'client', layer:'L3', kind: routeOk ? 'ok' : 'error',
      title: routeOk ? '✓ ধাপ ২ — Routing: Gateway-তে পাঠানো গেল'
                     : '✗ ধাপ ২ — Default Gateway নেই, বাইরে যাওয়ার পথ নেই',
      packet: routeOk ? rp : null,
      what: routeOk
        ? 'Destination অন্য network-এ, তাই Packet Gateway-কে দেওয়া হলো। Layer 3 কাজ করছে।'
        : 'Routing table-এ কোনো default route নেই। Client জানে না বাইরের কোনো ঠিকানার জন্য Packet কাকে দেবে।',
      why : routeOk
        ? 'Client দেখল destination তার নিজের subnet-এ নেই। তাই routing table দেখে default route ধরে Gateway-কে দিল।\n\nএই ধাপটি কাজ করা মানে ভেতরের সব ঠিক আছে — এবার বাইরের দিকে দেখা যাবে।'
        : '**এই ভাঙনটির উপসর্গ খুব স্বতন্ত্র, তাই চিনতে সহজ।**\n\n• একই network-এর কাউকে ping করা যায় ✓\n• বাইরের কিছুতেই যাওয়া যায় না ✗\n\nএই সংমিশ্রণটি প্রায় নিশ্চিতভাবে gateway-র সমস্যা বোঝায়।\n\n**সরঞ্জাম:** ' + B.tool + '\n\nলক্ষ্য করুন এখানে DNS-ও কাজ করবে না — কিন্তু দোষ DNS-এর নয়। DNS server তো বাইরে, আর বাইরে যাওয়ার পথই নেই।\n\nএজন্যই নিচ থেকে উপরে এগোনো জরুরি। উপর থেকে শুরু করলে "DNS কাজ করছে না" দেখে ভুল দিকে ছুটতে হতো।',
      apply: function(st){
        if(routeOk){ st.wire = { pkt:rp, from:'client', to:'gw' };
                     st.reached = st.reached.concat(['route']); }
        else { st.wire = null; st.failedAt = 'L3'; }
        st.banner = routeOk ? 'Routing ✓' : 'Routing ✗ — gateway নেই';
      }
    });
    if(stop === 'route'){ return steps; }

    /* ── L7: DNS ── */
    var dnsOk = (b !== 'dns');
    var dp = mk(CLI.ip, DNS.ip, GW.mac, DNS.mac, 'DNS query', 'gw', 'dns', 'data', 'udp');
    steps.push({
      t:at(), actor:'gw', layer:'L7', kind: dnsOk ? 'ok' : 'error',
      title: dnsOk ? '✓ ধাপ ৩ — DNS: নাম থেকে IP পাওয়া গেল'
                   : '✗ ধাপ ৩ — DNS উত্তর দিচ্ছে না',
      packet: dnsOk ? dp : null,
      what: dnsOk
        ? '`example.com` → `' + WEB.ip + '`। DNS কাজ করছে।'
        : 'DNS server বন্ধ। কোনো উত্তর আসছে না, তাই নামটির IP জানা গেল না।',
      why : dnsOk
        ? 'এবার আসল ঠিকানা হাতে এলো। এখান থেকেই TCP connection শুরু করা যাবে।'
        : '**এই ভাঙনটির উপসর্গটি সবচেয়ে স্পষ্ট এবং সবচেয়ে কাজের।**\n\n• `ping 93.184.216.34` কাজ করে ✓\n• `ping example.com` কাজ করে না ✗\n\nএই একটিমাত্র তুলনাই DNS-কে দোষী সাব্যস্ত করে দেয়। Network ঠিক আছে (IP-তে পৌঁছাচ্ছে), শুধু অনুবাদটি হচ্ছে না।\n\n**সরঞ্জাম:** ' + B.tool + '\n\nএই দুটি ping-এর তুলনা করাটা debugging-এর একটি চমৎকার অভ্যাস — এক ধাপেই একটি পুরো স্তর বাদ দেওয়া যায়।',
      apply: function(st){
        if(dnsOk){ st.wire = { pkt:dp, from:'gw', to:'dns' };
                   st.reached = st.reached.concat(['dns']); }
        else { st.wire = null; st.failedAt = 'L7-DNS'; }
        st.banner = dnsOk ? 'DNS ✓ → ' + WEB.ip : 'DNS ✗';
      }
    });
    if(stop === 'dns'){ return steps; }

    /* ── L4: TCP ── */
    var tcpOk = (b !== 'fw');
    var tp = mk(CLI.ip, WEB.ip, GW.mac, WEB.mac, 'SYN :443', 'gw', 'web', 'ack');
    steps.push({
      t:at(), actor:'gw', layer:'L4', kind: tcpOk ? 'ok' : 'error',
      title: tcpOk ? '✓ ধাপ ৪ — TCP: connection তৈরি হলো'
                   : '✗ ধাপ ৪ — Firewall SYN ফেলে দিচ্ছে',
      packet: tcpOk ? tp : null,
      what: tcpOk
        ? 'SYN → SYN-ACK → ACK। Connection ESTABLISHED।'
        : 'Firewall port ৪৪৩ বন্ধ করে দিয়েছে এবং SYN গুলো নীরবে ফেলে দিচ্ছে। কোনো উত্তর নেই।',
      why : tcpOk
        ? 'Transport স্তর তৈরি। এবার HTTP-র পালা।'
        : '**এই উপসর্গটি চিনতে সময়ের দিকে তাকাতে হয়।**\n\n• DNS কাজ করছে ✓ (নামের IP পাওয়া গেছে)\n• `ping` হয়তো কাজ করছে ✓ (ICMP আলাদা, Firewall শুধু TCP 443 আটকেছে)\n• কিন্তু `curl` **দীর্ঘ অপেক্ষার পর** timeout ✗\n\nএই "দীর্ঘ অপেক্ষা"-টাই সূত্র। DROP মানে নীরবতা, আর নীরবতা মানে অপেক্ষা।\n\nযদি সঙ্গে সঙ্গে `Connection refused` আসত, তাহলে বুঝতাম কেউ RST দিয়েছে — অর্থাৎ port বন্ধ বা service চালু নেই। তখন খোঁজার জায়গা সম্পূর্ণ আলাদা হতো।\n\n**সরঞ্জাম:** ' + B.tool + '\n\nএখানে একটি সাধারণ ফাঁদ আছে — ping কাজ করছে দেখে অনেকে ভাবেন network ঠিক আছে। কিন্তু ping শুধু Layer 3 পরীক্ষা করে, TCP port নয়।',
      apply: function(st){
        if(tcpOk){ st.wire = { pkt:tp, from:'gw', to:'web' };
                   st.reached = st.reached.concat(['tcp']); }
        else { st.wire = null; st.failedAt = 'L4'; }
        st.banner = tcpOk ? 'TCP ✓ ESTABLISHED' : 'TCP ✗ — timeout';
      }
    });
    if(stop === 'tcp'){ return steps; }

    /* ── L7: HTTP ── */
    var httpOk = (b !== 'server');
    var hp = P.make([
      P.ethernet(WEB.mac, GW.mac, 'ip'),
      P.ip(WEB.ip, CLI.ip, 64, 'tcp', 200),
      P.tcp(443, 49152, 1, 1, 'PSH, ACK', 65535),
      P.data(httpOk ? 'HTTP/1.1 200 OK' : 'HTTP/1.1 500 Internal Server Error')
    ], { label: httpOk ? '200 OK' : '500 Error', kind: httpOk ? 'ack' : 'data',
         from:'web', to:'client' });

    steps.push({
      t:at(), actor:'web', layer:'L7', kind: httpOk ? 'ok' : 'error',
      title: httpOk ? '✓ ধাপ ৫ — HTTP: 200 OK, যাত্রা সম্পূর্ণ'
                    : '✗ ধাপ ৫ — HTTP 500, application-এ ত্রুটি',
      packet:hp,
      what: httpOk
        ? 'Server `200 OK` দিল এবং page পাঠাল। পাঁচটি স্তরই কাজ করেছে।'
        : 'Server `500 Internal Server Error` দিল। Network সম্পূর্ণ ঠিক — সমস্যা application-এর ভেতরে।',
      why : httpOk
        ? 'পুরো যাত্রাটি একবার দেখে নিন:\n\n`ARP` → `Routing` → `DNS` → `TCP` → `HTTP`\n\nপ্রতিটি স্তর নিজের কাজটুকু করেছে, আর পরের স্তরকে তার ভিত্তি দিয়েছে।\n\nDebugging-এ এই ক্রমটিই আপনার মানচিত্র। যেখানে থামে, সেখান থেকেই খোঁজা শুরু।\n\nএবার একটি একটি করে ভেঙে দেখুন — প্রতিটি ভাঙন কোথায় থামে আর কেমন উপসর্গ দেখায়, সেই মিলটাই আসল শিক্ষা।'
        : '**এটি একটি গুরুত্বপূর্ণ ক্ষেত্র — কারণ এখানে network-এর কোনো দোষ নেই।**\n\nদেখুন কী কী কাজ করেছে:\n\n• ARP ✓ • Routing ✓ • DNS ✓ • TCP ✓\n\nএতগুলো স্তর নিখুঁতভাবে কাজ করেছে। Request পৌঁছেছে, Server বুঝেছে, উত্তরও দিয়েছে। শুধু উত্তরটি একটি error।\n\n**সরঞ্জাম:** ' + B.tool + '\n\n`5xx` দেখলে network debugging এখানেই বন্ধ করা উচিত। উত্তর আছে server-এর log-এ, tcpdump-এ নয়।\n\nএই পার্থক্যটি চেনা একটি বড় দক্ষতা — "network-এর সমস্যা" আর "network দিয়ে পৌঁছানো একটি সমস্যা" এক জিনিস নয়।',
      apply: function(st){
        st.wire = { pkt:hp, from:'web', to:'client' };
        st.reached = st.reached.concat(['http']);
        if(!httpOk) st.failedAt = 'L7-app';
        st.banner = httpOk ? '200 OK · সম্পূর্ণ' : '500 — application-এ ত্রুটি';
      }
    });

    return steps;
  }
};

})(window.NetLab);
