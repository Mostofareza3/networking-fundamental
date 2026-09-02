/* ═══════════════════════════════════════════════════════════════════
   LAB · Sockets & Ports — একই Server, হাজারো connection
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var SRV_IP = '10.0.0.50', SRV_MAC = 'SS:SS:SS:SS:SS:SS';
var CLIENTS = [
  { id:'c1', name:'Browser Tab 1', ip:'192.168.1.10', mac:'AA:AA:AA:AA:AA:01', port:49152, x:12, y:22 },
  { id:'c2', name:'Browser Tab 2', ip:'192.168.1.10', mac:'AA:AA:AA:AA:AA:01', port:49153, x:12, y:52 },
  { id:'c3', name:'অন্য Computer', ip:'192.168.1.22', mac:'BB:BB:BB:BB:BB:02', port:49152, x:12, y:82 }
];

function seg(c, dp, flags, label, kind){
  return P.make([
    P.ethernet(c.mac, SRV_MAC, 'ip'),
    P.ip(c.ip, SRV_IP, 64, 'tcp', 40),
    P.tcp(c.port, dp, 1, 1, flags, 64240)
  ], { label:label, kind:kind || 'data', from:c.id, to:'server' });
}

NS.labs.socket = {
  id: 'socket',
  title: 'Sockets & Ports',
  group: 'Phase 3 · Layer 4',
  chapter: 'ch16',
  blurb: 'একটি Server, একটি port 80, অথচ হাজার হাজার connection আলাদা করে চেনা যায়। কীভাবে?',

  learn: [
    'Socket আসলে কী — এবং কেন এটি শুধু একটি port নয়',
    '4-tuple কী এবং সেটিই কেন connection-এর প্রকৃত পরিচয়',
    'Listening Socket আর Connected Socket-এর পার্থক্য',
    'Ephemeral Port কে দেয়, কেন দেয়, আর সেটি ফুরিয়ে গেলে কী হয়'
  ],

  mistakes: [
    { m:'একটি port-এ একসাথে একটিই connection থাকতে পারে।',
      r:'Port ৮০-তে একসাথে হাজার হাজার connection থাকতে পারে। কারণ connection চেনা হয় port দিয়ে নয়, **4-tuple** দিয়ে — (source IP, source port, destination IP, destination port)। এই চারটির সমষ্টি আলাদা হলেই connection আলাদা।' },
    { m:'Client-ও নির্দিষ্ট port ব্যবহার করে।',
      r:'Client-এর port সাধারণত **OS নিজে বেছে দেয়** — একে বলে ephemeral port (সাধারণত ৩২৭৬৮–৬০৯৯৯)। Client-এর কোনো নির্দিষ্ট port লাগে না, কারণ কেউ তাকে খুঁজে আসছে না; সে-ই যাচ্ছে।' },
    { m:'Socket আর Port একই জিনিস।',
      r:'Port একটি **সংখ্যা**। Socket একটি **সংযোগের প্রান্ত** — যার মধ্যে আছে IP, port, protocol, এবং সেই সাথে buffer, sequence number, connection state। একটি port-এর উপর বহু socket দাঁড়াতে পারে।' }
  ],

  controls: [
    { key:'conflict', type:'toggle', label:'দুটি process একই port চাইছে', def:false,
      help:'চালু করলে দেখা যাবে "Address already in use" ঠিক কেন হয়।' }
  ],

  build: function(){
    var devs = [];
    for(var i = 0; i < CLIENTS.length; i++){
      var c = CLIENTS[i];
      devs.push(N.pc(c.id, { name:c.name, x:c.x, y:c.y, mac:c.mac, ip:c.ip,
                             note:'port ' + c.port }));
    }
    devs.push(N.server('server', { name:'Web Server', x:80, y:52, mac:SRV_MAC, ip:SRV_IP,
      listening:[{ port:80, service:'HTTP', open:true },
                 { port:443, service:'HTTPS', open:true },
                 { port:22, service:'SSH', open:true }],
      note:'LISTEN :80' }));
    return {
      devices: devs,
      links: [ N.link('c1','server'), N.link('c2','server'), N.link('c3','server') ],
      hub:null, wire:null, banner:null, sockets: []
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }

    steps.push({
      t:at(), actor:'server', layer:'L4', kind:'info',
      title:'Listening Socket — অপেক্ষায় বসা',
      what:'Server একটি socket খুলে port ৮০-তে `listen()` করছে। এটিই **Listening Socket**।\n\nএখনো কোনো connection নেই — শুধু অপেক্ষা।',
      why :'এই socket-টি একটু অন্যরকম। এর পরিচয়ে মাত্র দুটি জিনিস ঠিক করা আছে:\n\n`(10.0.0.50, 80)` — বাকি দুটি ঘর খালি।\n\nসে জানে না কে আসবে, কোন IP থেকে আসবে, কোন port থেকে আসবে। এই socket দিয়ে কোনো data আদান-প্রদান হয় না — তার একমাত্র কাজ **নতুন connection গ্রহণ করা**।\n\nপ্রতিটি connection এলে সে একটি **নতুন, আলাদা socket** তৈরি করে, যার চারটি ঘরই ভরা থাকে। আর নিজে আবার পরের জনের অপেক্ষায় বসে।',
      apply: function(st){ st.banner = 'LISTEN 10.0.0.50:80'; }
    });

    /* Port conflict — bind() ব্যর্থ */
    if(cfg.conflict){
      steps.push({
        t:at(), actor:'server', layer:'L4', kind:'error',
        title:'দ্বিতীয় process-ও port ৮০ চাইল — ব্যর্থ',
        what:'আরেকটি process port ৮০-তে `bind()` করতে চাইল। OS বলল:\n\n`Address already in use` (EADDRINUSE)',
        why :'এখানে একটি সূক্ষ্ম কিন্তু গুরুত্বপূর্ণ কথা আছে।\n\n**Listening socket** একটি port-এ একটিই থাকতে পারে। কারণ যদি দুটি থাকত, তাহলে নতুন connection এলে OS কাকে দেবে সেই সিদ্ধান্ত নিতে পারত না — দুজনেরই দাবি সমান।\n\nকিন্তু **connected socket** একই port-এ হাজারটা থাকতে পারে! কারণ তাদের প্রত্যেকের চারটি ঘরই ভরা, তাই কে কোনটি সেই প্রশ্নে কোনো অস্পষ্টতা নেই।\n\nএজন্যই `Address already in use` মানে network-এর সমস্যা নয় — এর মানে **আরেকটি process ইতিমধ্যে ওই দরজায় দাঁড়িয়ে আছে**। `ss -tlnp` দিয়ে দেখা যায় কে।\n\n(TIME_WAIT-এ থাকা পুরনো socket-এর জন্যও একই error আসতে পারে — সেটি `SO_REUSEADDR` দিয়ে সমাধান হয়।)',
        apply: function(st){ st.banner = 'EADDRINUSE — দ্বিতীয়টি ব্যর্থ'; }
      });
      return steps;
    }

    var socks = [];
    for(var i = 0; i < CLIENTS.length; i++){
      (function(c, idx){
        var p = seg(c, 80, 'SYN', 'SYN from :' + c.port, 'ack');
        var tuple = c.ip + ':' + c.port + ' ↔ ' + SRV_IP + ':80';

        steps.push({
          t:at(), actor:c.id, layer:'L4', kind:'info',
          title:c.name + ' connect করল — source port ' + c.port, packet:p,
          what:'`' + c.name + '` connection শুরু করল।\n\nOS তাকে একটি **ephemeral port** দিল: `' + c.port + '`।',
          why : idx === 0
            ? 'Client নিজে কোনো port বাছেনি — OS দিয়েছে। ৩২৭৬৮ থেকে ৬০৯৯৯-এর মধ্যে যেটি খালি, সেটি।\n\nClient-এর কোনো নির্দিষ্ট port দরকার নেই, কারণ কেউ তাকে খুঁজতে আসছে না। Server-এর দরকার — সবাইকে জানতে হবে HTTP ৮০-তে থাকে। তাই server port নির্দিষ্ট, client port যেকোনো।'
            : idx === 1
              ? '**লক্ষ্য করার মতো ব্যাপার:** এটি প্রথম tab-এর সাথে **একই computer, একই IP** (`' + c.ip + '`)। কিন্তু OS একটি **ভিন্ন** port দিল — `' + c.port + '`।\n\nএখানেই আসল কৌশল। একই IP থেকে দুটি connection আলাদা করা যাচ্ছে শুধুমাত্র source port ভিন্ন হওয়ায়।'
              : 'এই client-টি সম্পূর্ণ **ভিন্ন computer** (`' + c.ip + '`), অথচ তার port `' + c.port + '` — যা প্রথম tab-এর portটির সমান!\n\nতবু কোনো সংঘাত নেই। কারণ তাদের **source IP আলাদা**, তাই পূর্ণ পরিচয় দুটি ভিন্ন।',
          apply: function(st){
            st.wire = { pkt:p, from:c.id, to:'server' };
            st.banner = c.ip + ':' + c.port + ' → :80';
          }
        });

        socks.push(tuple);
        var snap = socks.slice();
        steps.push({
          t:at(), actor:'server', layer:'L4', kind:'ok',
          title:'নতুন Connected Socket — মোট ' + snap.length + 'টি',
          what:'Server একটি **নতুন socket** তৈরি করল:\n\n`' + tuple + '`\n\nএখন তার ৮০ নম্বর port-এ মোট **' + snap.length + 'টি** connection চলছে।',
          why : idx === CLIENTS.length - 1
            ? 'তিনটি socket পাশাপাশি দেখুন:\n\n`192.168.1.10:49152 ↔ 10.0.0.50:80`\n`192.168.1.10:49153 ↔ 10.0.0.50:80`\n`192.168.1.22:49152 ↔ 10.0.0.50:80`\n\nডান পাশটা **তিনটিতেই একই**। তবু প্রতিটি সারি অনন্য, কারণ বাম পাশ আলাদা।\n\nএটাই **4-tuple** — (source IP, source port, destination IP, destination port)। Packet এলে OS এই চারটি মিলিয়ে দেখে ঠিক কোন socket-এর জন্য এসেছে।\n\nএজন্যই একটি Server তার একটিমাত্র port ৮০ দিয়ে **হাজার হাজার** client সামলাতে পারে। Port-এর সংখ্যা কোনো সীমা নয়।'
            : 'Listening socket-টি কিন্তু অক্ষত রয়ে গেছে — সে আবার পরের জনের অপেক্ষায়।\n\nএই নতুন socket-এর সাথে জড়িয়ে আছে নিজস্ব send buffer, receive buffer, sequence number, window — একটি সম্পূর্ণ আলাদা কথোপকথন।',
          apply: function(st){
            st.wire = null;
            st.sockets = snap;
            for(var d = 0; d < st.devices.length; d++)
              if(st.devices[d].id === 'server')
                st.devices[d].note = snap.length + ' connection';
            st.banner = snap.length + 'টি socket চলছে';
          }
        });
      })(CLIENTS[i], i);
    }

    /* Packet demultiplexing */
    var back = P.make([
      P.ethernet(SRV_MAC, CLIENTS[1].mac, 'ip'),
      P.ip(SRV_IP, CLIENTS[1].ip, 64, 'tcp', 100),
      P.tcp(80, CLIENTS[1].port, 500, 1, 'PSH, ACK', 65535),
      P.data('Tab 2-এর জন্য response')
    ], { label:'→ :' + CLIENTS[1].port, kind:'data', from:'server', to:'c2' });

    steps.push({
      t:at(), actor:'server', layer:'L4', kind:'ok',
      title:'উত্তর কোন socket-এ যাবে — Demultiplexing', packet:back,
      what:'Server Tab 2-র জন্য উত্তর পাঠাচ্ছে। Packet-এর destination port `' + CLIENTS[1].port + '`।\n\nএটি Tab 1-এ যাবে না, যদিও দুটি **একই computer-এ** আছে।',
      why :'এই কাজটির নাম **demultiplexing** — একটি মেশানো ধারা থেকে সঠিক গ্রাহককে খুঁজে বের করা।\n\nClient-এর OS Packet পেয়ে চারটি ঘর মিলিয়ে দেখে:\n\n`src 10.0.0.50:80` + `dst 192.168.1.10:' + CLIENTS[1].port + '`\n\nএটি একটিমাত্র socket-এর সাথে মেলে — Tab 2-র। তাই data সেই socket-এর receive buffer-এ যায়, আর Tab 2 যখন `read()` করে তখন পায়।\n\nTab 1-এর socket-এর port `' + CLIENTS[0].port + '`, তাই সে এই Packet-এর কিছুই জানে না।\n\nএটাই সেই ব্যবস্থা যার জন্য আপনি একসাথে বিশটা tab খুলে রাখতে পারেন, আর প্রতিটি নিজের নিজের data পায়।',
      apply: function(st){
        st.wire = { pkt:back, from:'server', to:'c2' };
        st.banner = '→ Tab 2-র socket-এ';
      }
    });

    steps.push({
      t:at(), actor:'server', layer:'L4', kind:'warn',
      title:'সীমা কোথায় — Ephemeral Port ফুরিয়ে যাওয়া',
      what:'একটি client একটি নির্দিষ্ট server-এর সাথে সর্বোচ্চ প্রায় **২৮,০০০** connection খুলতে পারে — কারণ ephemeral port-এর পরিসর ওইটুকুই (৩২৭৬৮–৬০৯৯৯)।',
      why :'লক্ষ্য করুন সীমাটি কার উপর পড়ছে — **client-এর উপর**, server-এর উপর নয়।\n\nServer-এর দিক থেকে সীমা অনেক দূরে, কারণ তার সব connection-এর source IP+port আলাদা। বিভিন্ন client থেকে আসছে বলেই 4-tuple সহজে আলাদা থাকে।\n\nকিন্তু **একটি** client যদি **একটি** server-এর একটি port-এ বারবার connect করে, তার শুধু নিজের port বদলানোর সুযোগ আছে — আর সেই সংখ্যাটি সীমিত।\n\nএই সমস্যাটি বাস্তবে দেখা যায় load testing-এ, অথবা এমন service-এ যেটি অন্য একটি service-এ অসংখ্য ছোট connection খোলে। TIME_WAIT-এ আটকে থাকা port গুলো ব্যাপারটা আরও দ্রুত ঘটায়।\n\nসমাধান? **Connection পুনর্ব্যবহার** — connection pool, HTTP Keep-Alive। নতুন connection না খুলে পুরনোটাই আবার ব্যবহার করা।',
      apply: function(st){ st.wire = null; st.banner = 'সীমা ≈ 28,000 (client-এর দিকে)'; }
    });

    return steps;
  }
};

})(window.NetLab);
