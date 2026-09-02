/* ═══════════════════════════════════════════════════════════════════
   LAB · NAT — একটি Public IP, অনেক Device
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var PUB = '203.0.113.7';                 /* Router-এর public IP */
var SRV_IP = '93.184.216.34', SRV_MAC = 'SS:SS:SS:SS:SS:SS';
var RMAC_IN = 'RR:RR:RR:RR:RR:01', RMAC_OUT = 'RR:RR:RR:RR:RR:02';

var HOSTS = [
  { id:'pc1', name:'Laptop',  ip:'192.168.1.10', mac:'AA:AA:AA:AA:AA:01', sp:49152, np:60001, y:22 },
  { id:'pc2', name:'Phone',   ip:'192.168.1.11', mac:'AA:AA:AA:AA:AA:02', sp:49152, np:60002, y:50 },
  { id:'pc3', name:'Tablet',  ip:'192.168.1.12', mac:'AA:AA:AA:AA:AA:03', sp:51000, np:60003, y:78 }
];

function pkt(sIp, sMac, dIp, dMac, sp, dp, label, from, to, kind){
  return P.make([
    P.ethernet(sMac, dMac, 'ip'),
    P.ip(sIp, dIp, 64, 'tcp', 60),
    P.tcp(sp, dp, 1, 1, 'PSH, ACK', 64240)
  ], { label:label, kind:kind || 'data', from:from, to:to });
}

NS.labs.nat = {
  id: 'nat',
  title: 'NAT — ঠিকানা বদল',
  group: 'Phase 4 · Application',
  chapter: 'ch34',
  blurb: 'বাড়ির ২০টি device, অথচ Internet-এ একটিই IP। Router মাঝখানে ঠিকানা বদলে দেয়।',

  learn: [
    'Private IP আর Public IP-র পার্থক্য এবং কেন দুটি দরকার',
    'NAT Table কী এবং সে কীভাবে উত্তর ফেরত পাঠায়',
    'Port কেন NAT-এর মূল হাতিয়ার',
    'বাইরে থেকে ভেতরে connection কেন যায় না — এবং Port Forwarding কী করে'
  ],

  mistakes: [
    { m:'NAT একটি Firewall, তাই NAT থাকলে নিরাপদ।',
      r:'NAT-এর **পার্শ্বপ্রতিক্রিয়া** হিসেবে বাইরের অযাচিত connection ঢুকতে পারে না — কারণ NAT Table-এ কোনো entry নেই, তাই Router জানে না Packet-টি কাকে দেবে। কিন্তু এটি নিরাপত্তা নয়, **নকশার একটি ফল**। আসল Firewall নিয়ম দেখে সিদ্ধান্ত নেয়; NAT শুধু জানে না কোথায় পাঠাবে।' },
    { m:'একটি Private IP পৃথিবীতে একটিই থাকে।',
      r:'`192.168.1.10` এই মুহূর্তে কোটি কোটি বাড়িতে ব্যবহার হচ্ছে। Private IP (`10.x`, `172.16-31.x`, `192.168.x`) Internet-এ route হয় না, তাই একই ঠিকানা সবাই নিজের ভেতরে ব্যবহার করতে পারে।' },
    { m:'NAT শুধু IP Address বদলায়।',
      r:'IP বদলালেই যথেষ্ট হতো না — উত্তর ফিরে এলে Router বুঝত না কাকে দেবে। তাই সে **port-ও বদলায়**, আর প্রতিটি connection-কে একটি অনন্য port দেয়। এজন্যই পুরো নামটি **PAT** বা NAPT — Port Address Translation।' }
  ],

  controls: [
    { key:'dir', type:'choice', label:'কোন দিক থেকে', def:'out',
      options:[ ['out','ভেতর থেকে বাইরে — স্বাভাবিক'],
                ['in','বাইরে থেকে ভেতরে — অযাচিত'],
                ['fwd','Port Forwarding সেট করা আছে'] ] }
  ],

  build: function(){
    var devs = [];
    for(var i = 0; i < HOSTS.length; i++){
      var h = HOSTS[i];
      devs.push(N.pc(h.id, { name:h.name, x:10, y:h.y, mac:h.mac, ip:h.ip,
                             gw:'192.168.1.1', note:'private' }));
    }
    devs.push(N.router('nat', { name:'NAT Router', x:45, y:50,
      ifaces:[ { name:'LAN', ip:'192.168.1.1', mac:RMAC_IN, mask:'255.255.255.0' },
               { name:'WAN', ip:PUB,           mac:RMAC_OUT, mask:'255.255.255.0' } ],
      routes:[ { dst:'192.168.1.0', prefix:24, via:'', iface:'LAN' },
               { dst:'0.0.0.0',     prefix:0,  via:'ISP', iface:'WAN' } ],
      note:'table খালি' }));
    devs.push(N.server('web', { name:'Web Server', x:85, y:50, mac:SRV_MAC, ip:SRV_IP,
      listening:[{ port:80, service:'HTTP', open:true }], note:'public' }));
    return {
      devices: devs,
      links: [ N.link('pc1','nat'), N.link('pc2','nat'),
               N.link('pc3','nat'), N.link('nat','web') ],
      hub:null, wire:null, banner:null, table:[]
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    function note(st, id, txt){
      for(var i = 0; i < st.devices.length; i++)
        if(st.devices[i].id === id) st.devices[i].note = txt;
    }

    /* ── বাইরে থেকে অযাচিত connection ── */
    if(cfg.dir === 'in'){
      var un = pkt(SRV_IP, SRV_MAC, PUB, RMAC_OUT, 40000, 80,
                   '→ ' + PUB + ':80', 'web', 'nat');
      steps.push({
        t:at(), actor:'web', layer:'L4', kind:'warn',
        title:'বাইরে থেকে কেউ ' + PUB + '-এ connect করতে চাইছে', packet:un,
        what:'Internet থেকে কেউ আপনার public IP `' + PUB + '`-এর ৮০ নম্বর port-এ একটি Packet পাঠাল।',
        why :'এটি সম্পূর্ণ স্বাভাবিক ঘটনা — Internet-এ যেকোনো public IP-তে যে কেউ Packet পাঠাতে পারে।\n\nপ্রশ্ন হলো Router এটি নিয়ে কী করবে।',
        apply: function(st){ st.wire = { pkt:un, from:'web', to:'nat' };
                             st.banner = 'বাইরে থেকে আসছে…'; }
      });
      steps.push({
        t:at(), actor:'nat', layer:'L4', kind:'error',
        title:'NAT Table-এ কিছু নেই — Packet ফেলে দেওয়া হলো',
        what:'Router তার NAT Table-এ খুঁজল: "port ৮০-এর জন্য ভেতরে কে?"\n\nকোনো entry নেই। তাই Packet-টি **ফেলে দিল**।',
        why :'এখানে সূক্ষ্ম কিন্তু গুরুত্বপূর্ণ কথাটি হলো — Router Packet-টি **আটকায়নি**, সে **জানেই না কোথায় পাঠাবে**।\n\nতার ভেতরে তিনটি device আছে। Packet-টি কার জন্য? কোনো তথ্য নেই।\n\nNAT Table-এর entry তৈরি হয় **ভেতর থেকে বাইরে** যাওয়ার সময়। ভেতরের কেউ কখনো এই বাইরের ঠিকানায় কথা বলেনি, তাই কোনো entry-ও নেই।\n\nএই আচরণের ফলে বাইরের অযাচিত connection ঢোকে না — যা নিরাপত্তার দিক থেকে সুবিধাজনক।\n\nকিন্তু এটিকে **Firewall বলা ভুল হবে**। Firewall নিয়ম দেখে সিদ্ধান্ত নেয় — "এটি অনুমোদিত নয়"। NAT বলে — "আমি জানি না কাকে দেব"। দুটি সম্পূর্ণ ভিন্ন জিনিস, যদিও ফলাফল কাছাকাছি।\n\nএই আচরণটিই peer-to-peer application-এর জন্য বড় বাধা — দুই পাশই NAT-এর পেছনে থাকলে কেউ কারো কাছে পৌঁছাতে পারে না। STUN, TURN, hole punching — এসব কৌশল এই সমস্যা সমাধানের চেষ্টা।',
        apply: function(st){ st.wire = null; st.banner = 'drop — table-এ entry নেই'; }
      });
      return steps;
    }

    /* ── Port Forwarding ── */
    if(cfg.dir === 'fwd'){
      steps.push({
        t:at(), actor:'nat', layer:'L4', kind:'info',
        title:'Port Forwarding — হাতে লেখা একটি স্থায়ী নিয়ম',
        what:'Router-এ একটি নিয়ম বসানো হয়েছে:\n\n`' + PUB + ':80` → `192.168.1.10:80`\n\nএটি স্বয়ংক্রিয়ভাবে তৈরি হয়নি — মানুষ হাতে লিখে দিয়েছে।',
        why :'এটিই সেই অনুপস্থিত তথ্যটি সরবরাহ করে।\n\nএতক্ষণ Router জানত না বাইরের Packet কাকে দেবে। এই নিয়মটি সেই প্রশ্নের একটি **স্থায়ী উত্তর** — "৮০ নম্বর port-এ যা আসবে, সব Laptop-কে দাও"।\n\nএজন্যই বাড়িতে game server বা NAS চালাতে গেলে port forwarding সেট করতে হয়। ভেতরের machine-টি প্রস্তুত থাকলেও Router-কে পথ দেখিয়ে দিতে হয়।\n\nএর একটি নিরাপত্তা দিকও আছে — এই একটি নিয়ম লিখে আপনি আপনার ভেতরের একটি machine-কে পুরো Internet-এর সামনে খুলে দিলেন। তাই সেই machine-টির নিজস্ব সুরক্ষা এখন অনেক বেশি গুরুত্বপূর্ণ।',
        apply: function(st){
          st.table = [{ pub:PUB + ':80', priv:'192.168.1.10:80', kind:'static' }];
          note(st, 'nat', 'forward :80 → .10');
          st.banner = 'port forward সেট করা আছে';
        }
      });
      var f1 = pkt(SRV_IP, SRV_MAC, PUB, RMAC_OUT, 40000, 80,
                   '→ ' + PUB + ':80', 'web', 'nat');
      steps.push({
        t:at(), actor:'web', layer:'L4', kind:'info',
        title:'বাইরে থেকে Packet এলো', packet:f1,
        what:'Internet থেকে `' + PUB + ':80`-এ একটি Packet এলো।',
        why :'আগের দৃশ্যে এটি ফেলে দেওয়া হয়েছিল। এবার Router-এর কাছে একটি নিয়ম আছে, তাই ফল ভিন্ন হবে।',
        apply: function(st){ st.wire = { pkt:f1, from:'web', to:'nat' };
                             st.banner = 'বাইরে থেকে :80'; }
      });
      var f2 = pkt(SRV_IP, RMAC_IN, '192.168.1.10', HOSTS[0].mac, 40000, 80,
                   '→ 192.168.1.10:80', 'nat', 'pc1');
      steps.push({
        t:at(), actor:'nat', layer:'L4', kind:'ok',
        title:'নিয়ম অনুযায়ী ভেতরে পাঠানো হলো', packet:f2,
        what:'Router destination IP বদলে দিল:\n\n`' + PUB + ':80` → `192.168.1.10:80`\n\nতারপর Packet-টি Laptop-কে দিল।',
        why :'লক্ষ্য করুন এবার **destination** বদলাচ্ছে — একে বলে DNAT (Destination NAT)।\n\nস্বাভাবিক NAT-এ বদলায় **source** — SNAT। ভেতর থেকে বাইরে গেলে source লুকাতে হয়; বাইরে থেকে ভেতরে এলে destination খুঁজে দিতে হয়।\n\nএকই ধারণা load balancer-এও কাজ করে — সে একটি public IP-তে আসা traffic-কে ভেতরের অনেকগুলো server-এর মধ্যে ভাগ করে দেয়। প্রতিবার destination বদলে।',
        apply: function(st){ st.wire = { pkt:f2, from:'nat', to:'pc1' };
                             st.banner = 'DNAT → 192.168.1.10'; }
      });
      return steps;
    }

    /* ── ভেতর থেকে বাইরে — মূল দৃশ্য ── */
    var table = [];
    for(var i = 0; i < HOSTS.length; i++){
      (function(h, idx){
        var p1 = pkt(h.ip, h.mac, SRV_IP, RMAC_IN, h.sp, 80,
                     h.ip + ':' + h.sp, h.id, 'nat');
        steps.push({
          t:at(), actor:h.id, layer:'L3', kind:'info',
          title:h.name + ' বাইরে যেতে চাইছে — source ' + h.ip + ':' + h.sp, packet:p1,
          what:'`' + h.name + '` (`' + h.ip + '`) web server-এ যেতে চাইছে। Source port `' + h.sp + '`।',
          why : idx === 0
            ? '`192.168.1.10` একটি **private IP**। এই ধরনের ঠিকানা (`10.x`, `172.16-31.x`, `192.168.x`) Internet-এ route হয় না — কোনো Router এদের এগিয়ে দেবে না।\n\nকারণটি সহজ: এই একই ঠিকানা কোটি কোটি বাড়িতে ব্যবহার হচ্ছে। উত্তর ফেরত পাঠাতে হলে কোন `192.168.1.10`-এ পাঠাবে?\n\nতাই বাইরে যেতে হলে ঠিকানা বদলাতেই হবে।'
            : idx === 2
              ? 'এই device-টির source port `' + h.sp + '` — আগের দুজনের চেয়ে আলাদা।\n\nকিন্তু এটি নিছক কাকতালীয়, আর সেটাই আসল কথা। আগের দুজন তো একই port বেছে ফেলেছিল।\n\nRouter আগে থেকে জানতে পারে না কে কোন port বাছবে। তাই তাকে **সবসময়** নিজের একটি অনন্য port বসিয়ে দিতে হয় — মিল হোক বা না হোক।'
              : '**গুরুত্বপূর্ণ:** এই device-টিও source port `' + h.sp + '` বেছেছে — Laptop-এর মতোই একই সংখ্যা!\n\nএতে কোনো ভুল নেই। তারা আলাদা computer, একে অপরের কথা জানে না, তাই একই port বাছতেই পারে।\n\nকিন্তু এখন সমস্যা — বাইরে গেলে দুজনেরই source হবে `' + PUB + '` আর port হবে `' + h.sp + '`। তখন উত্তর এলে Router কীভাবে বুঝবে কোনটি কার?\n\nএজন্যই NAT-কে **port-ও বদলাতে হয়**।',
          apply: function(st){ st.wire = { pkt:p1, from:h.id, to:'nat' };
                               st.banner = h.ip + ':' + h.sp + ' → বাইরে'; }
        });

        table.push({ priv: h.ip + ':' + h.sp, pub: PUB + ':' + h.np });
        var snap = table.slice();
        var p2 = pkt(PUB, RMAC_OUT, SRV_IP, SRV_MAC, h.np, 80,
                     PUB + ':' + h.np, 'nat', 'web');
        steps.push({
          t:at(), actor:'nat', layer:'L3', kind:'ok',
          title:'NAT: ' + h.ip + ':' + h.sp + ' → ' + PUB + ':' + h.np, packet:p2,
          what:'Router দুটি জিনিস বদলাল:\n\n• Source IP: `' + h.ip + '` → `' + PUB + '`\n• Source Port: `' + h.sp + '` → `' + h.np + '`\n\nআর এই জোড়াটি তার **NAT Table**-এ লিখে রাখল।',
          why : idx === HOSTS.length - 1
            ? 'পুরো table-টি এখন এমন:\n\n`192.168.1.10:49152` ↔ `' + PUB + ':60001`\n`192.168.1.11:49152` ↔ `' + PUB + ':60002`\n`192.168.1.12:51000` ↔ `' + PUB + ':60003`\n\n**এই table-টিই NAT-এর পুরো রহস্য।** বাইরের দুনিয়া শুধু একটি IP দেখে, কিন্তু প্রতিটি connection-এর একটি অনন্য port আছে।\n\nআর port ১৬ bit — অর্থাৎ ৬৫,৫৩৫টি সম্ভাব্য মান। তাই একটি public IP দিয়ে হাজার হাজার connection সামলানো যায়।\n\nএই কৌশলটিই IPv4-কে টিকিয়ে রেখেছে। ১৯৯০-এর দশকে ঠিকানা ফুরিয়ে যাওয়ার আশঙ্কা করা হয়েছিল, কিন্তু NAT সেই সংকট বহু বছর পিছিয়ে দিয়েছে।'
            : 'এই দুটি ঘর একসাথে লেখা থাকাই মূল কথা — `(private IP, private port)` ↔ `(public IP, public port)`।\n\nএই entry না থাকলে উত্তর ফিরে এলে Router সম্পূর্ণ অসহায় হয়ে যেত।',
          apply: function(st){
            st.wire = { pkt:p2, from:'nat', to:'web' };
            st.table = snap;
            note(st, 'nat', snap.length + ' entry');
            st.banner = 'NAT → ' + PUB + ':' + h.np;
          }
        });
      })(HOSTS[i], i);
    }

    /* ── উত্তর ফেরত ── */
    var h0 = HOSTS[1];
    var r1 = pkt(SRV_IP, SRV_MAC, PUB, RMAC_OUT, 80, h0.np,
                 '→ ' + PUB + ':' + h0.np, 'web', 'nat', 'ack');
    steps.push({
      t:at(), actor:'web', layer:'L3', kind:'info',
      title:'উত্তর এলো — কিন্তু ' + PUB + '-এ, কারো নামে নয়', packet:r1,
      what:'Web server উত্তর পাঠাল `' + PUB + ':' + h0.np + '`-এ।\n\nসে জানেই না ভেতরে তিনটি device আছে। তার কাছে পুরো বাড়িটি একটিমাত্র computer।',
      why :'বাইরের কেউ কখনো আপনার ভেতরের গঠন দেখতে পায় না। তিনটি device না ত্রিশটি — বাইরে থেকে বোঝার কোনো উপায় নেই।\n\nএটি একদিক থেকে গোপনীয়তার সুবিধা। তবে মনে রাখবেন, এটি নকশার একটি পার্শ্বফল — উদ্দেশ্য ছিল ঠিকানা বাঁচানো, গোপনীয়তা নয়।',
      apply: function(st){ st.wire = { pkt:r1, from:'web', to:'nat' };
                           st.banner = 'উত্তর → ' + PUB + ':' + h0.np; }
    });

    var r2 = pkt(SRV_IP, RMAC_IN, h0.ip, h0.mac, 80, h0.sp,
                 '→ ' + h0.ip + ':' + h0.sp, 'nat', h0.id, 'ack');
    steps.push({
      t:at(), actor:'nat', layer:'L3', kind:'ok',
      title:'Table দেখে সঠিক device-এ পাঠানো হলো', packet:r2,
      what:'Router destination port `' + h0.np + '` দেখে table-এ খুঁজল, পেল `' + h0.ip + ':' + h0.sp + '`।\n\nতারপর ঠিকানা ফিরিয়ে দিয়ে `' + h0.name + '`-কে Packet দিল।',
      why :'**Port-টিই এখানে ঠিকানার কাজ করছে।**\n\nএটি খুব ছোট একটি ধারণা, কিন্তু এর উপরেই পুরো ব্যবস্থাটি দাঁড়িয়ে। ৬৫,৫৩৫টি port মানে ৬৫,৫৩৫টি সম্ভাব্য "ভেতরের ঠিকানা"।\n\nএখান থেকেই NAT-এর সীমাবদ্ধতাগুলোও বোঝা যায়:\n\n• Table-এর entry-র একটি **মেয়াদ** আছে। বহুক্ষণ চুপ থাকলে entry মুছে যায়, connection ভেঙে যায়। এজন্যই অনেক application মাঝে মাঝে keep-alive Packet পাঠায়।\n\n• কোনো protocol যদি নিজের data-র ভেতরে IP Address লিখে রাখে (পুরনো FTP-র মতো), তাহলে NAT সেটি বদলাতে পারে না — ভেতরের ঠিকানাটি ভুল থেকে যায়।\n\n• দুই পাশই NAT-এর পেছনে থাকলে সরাসরি সংযোগ কঠিন হয়ে পড়ে।\n\nIPv6-তে এই সমস্যাগুলো নেই, কারণ ঠিকানা এত বেশি যে NAT-এর দরকারই পড়ে না।',
      apply: function(st){ st.wire = { pkt:r2, from:'nat', to:h0.id };
                           st.banner = '→ ' + h0.name; }
    });

    return steps;
  }
};

})(window.NetLab);
