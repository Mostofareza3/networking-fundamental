/* ═══════════════════════════════════════════════════════════════════
   LAB · HTTP — Request এবং Response
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI_IP = '192.168.1.10', SRV_IP = '93.184.216.34';
var CLI_MAC = 'AA:AA:AA:AA:AA:AA', SRV_MAC = 'SS:SS:SS:SS:SS:SS';

function httpPkt(from, text, label, kind){
  return P.make([
    P.ethernet(from === 'client' ? CLI_MAC : SRV_MAC,
               from === 'client' ? SRV_MAC : CLI_MAC, 'ip'),
    P.ip(from === 'client' ? CLI_IP : SRV_IP,
         from === 'client' ? SRV_IP : CLI_IP, 64, 'tcp', 40 + text.length),
    P.tcp(from === 'client' ? 49152 : 80, from === 'client' ? 80 : 49152,
          1, 1, 'PSH, ACK', 64240),
    P.data(text)
  ], { label:label, kind:kind || 'data', from:from,
       to: from === 'client' ? 'server' : 'client' });
}

NS.labs.http = {
  id: 'http',
  title: 'HTTP — Request/Response',
  group: 'Phase 4 · Application',
  chapter: 'ch28',
  blurb: 'HTTP আসলে শুধু text। কিন্তু সেই text-এর নিয়মগুলোই পুরো web-কে দাঁড় করিয়ে রেখেছে।',

  learn: [
    'একটি HTTP Request-এ ঠিক কী কী থাকে',
    'Status Code-এর শ্রেণিগুলো কী বলে — 2xx, 3xx, 4xx, 5xx',
    'Stateless মানে কী, এবং তবু login কীভাবে কাজ করে',
    'Keep-Alive কেন এত গুরুত্বপূর্ণ'
  ],

  mistakes: [
    { m:'HTTP একটি জটিল binary protocol।',
      r:'HTTP/1.1 পুরোপুরি **সাধারণ text** — আপনি `telnet` দিয়ে হাতে টাইপ করে একটি request পাঠাতে পারেন। এই সরলতাই তাকে জনপ্রিয় করেছে। (HTTP/2 থেকে binary হয়েছে, কিন্তু ধারণাগুলো একই।)' },
    { m:'404 মানে server-এ সমস্যা।',
      r:'`4xx` মানে **client-এর দিকের ভুল** — আপনি এমন কিছু চেয়েছেন যা নেই (404), বা যার অনুমতি নেই (403), বা request-টি ভুলভাবে লেখা (400)। Server-এর নিজের সমস্যা হলে `5xx` আসে। এই ভাগটি debugging-এ প্রথম সূত্র: দোষ কার দিকে।' },
    { m:'Server মনে রাখে আপনি আগে কে ছিলেন।',
      r:'HTTP **stateless** — প্রতিটি request সম্পূর্ণ স্বাধীন, server আগের কিছুই মনে রাখে না। Login কাজ করে কারণ **আপনি নিজেই** প্রতিবার একটি Cookie পাঠান, যা দেখে server আপনাকে চেনে। স্মৃতিটি আসলে আপনার কাছে, server-এর কাছে নয়।' }
  ],

  controls: [
    { key:'status', type:'choice', label:'Server কী উত্তর দেবে', def:'200',
      options:[ ['200','200 OK — সফল'],
                ['404','404 Not Found — নেই'],
                ['301','301 Moved — অন্য জায়গায়'],
                ['500','500 Server Error — server-এর দোষ'] ] },
    { key:'keepalive', type:'toggle', label:'Keep-Alive ব্যবহার করো', def:true,
      help:'বন্ধ করলে প্রতিটি request-এ নতুন connection লাগবে।' }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Browser', x:20, y:50, mac:CLI_MAC, ip:CLI_IP }),
        N.server('server', { name:'Web Server', x:80, y:50, mac:SRV_MAC, ip:SRV_IP,
                             listening:[{ port:80, service:'HTTP', open:true }] })
      ],
      links: [ N.link('client','server') ],
      hub:null, wire:null, banner:null,
      conns:0, reqs:0, status:null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var CODE = cfg.status;

    var syn = P.make([
      P.ethernet(CLI_MAC, SRV_MAC, 'ip'),
      P.ip(CLI_IP, SRV_IP, 64, 'tcp', 40),
      P.tcp(49152, 80, 0, 0, 'SYN', 64240)
    ], { label:'SYN', kind:'ack', from:'client', to:'server' });

    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'info',
      title:'আগে TCP connection — HTTP তার উপরে বসে', packet:syn,
      what:'HTTP-র কোনো কথা শুরু হওয়ার আগেই একটি TCP connection তৈরি করতে হয় — SYN, SYN-ACK, ACK।',
      why :'HTTP নিজে **কোনো delivery-র দায়িত্ব নেয় না**। সে ধরে নেয় নিচে একটি নির্ভরযোগ্য byte-stream আছে যেখানে সে লিখলেই অন্য পাশে ঠিক ক্রমে পৌঁছে যাবে।\n\nহারানো Packet, retransmit, ক্রম মেলানো — HTTP এসবের কিছুই জানে না। সবটা TCP সামলায়।\n\nএই দায়িত্ব ভাগাভাগিটাই layered নকশার সবচেয়ে বড় সুবিধা। HTTP তার নিজের কাজে মন দিতে পারে — অর্থাৎ, "কী চাই আর কী পেলাম" এই আলাপটুকু।',
      apply: function(st){ st.wire = { pkt:syn, from:'client', to:'server' };
                           st.conns = 1; st.banner = 'TCP connection তৈরি হচ্ছে'; }
    });

    var reqText = 'GET /index.html HTTP/1.1\nHost: example.com\nUser-Agent: Mozilla/5.0\n' +
                  'Accept: text/html\nConnection: ' + (cfg.keepalive ? 'keep-alive' : 'close');
    var req = httpPkt('client', reqText, 'GET /index.html');

    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'info',
      title:'HTTP Request — শুধু কয়েক লাইন text', packet:req,
      what:'Browser যা পাঠাল তা আসলে এইটুকুই:\n\n`GET /index.html HTTP/1.1`\n`Host: example.com`\n`User-Agent: Mozilla/5.0`\n`Connection: ' + (cfg.keepalive ? 'keep-alive' : 'close') + '`',
      why :'প্রথম লাইনটিই মূল কথা — **method** (`GET` — আমি পড়তে চাই), **path** (`/index.html` — কোনটি), **version** (`HTTP/1.1`)।\n\nএরপর header গুলো, প্রতিটি `নাম: মান` আকারে।\n\n`Host` header-টি বিশেষভাবে গুরুত্বপূর্ণ। একই IP-তে শতাধিক website থাকতে পারে (virtual hosting) — server কীভাবে বুঝবে আপনি কোনটি চাইছেন? এই header দেখে। HTTP/1.1-এ এটি **বাধ্যতামূলক**, আর এই একটি header-ই আধুনিক shared hosting-কে সম্ভব করেছে।',
      apply: function(st){ st.wire = { pkt:req, from:'client', to:'server' };
                           st.reqs = 1; st.banner = 'GET /index.html'; }
    });

    var RESP = {
      '200': { line:'200 OK', body:'<html>…',
        title:'200 OK — এই নাও',
        what:'Server উত্তর দিল `HTTP/1.1 200 OK`, তারপর header গুলো, একটি খালি লাইন, তারপর আসল HTML।',
        why:'`2xx` মানে **সফল**। যা চেয়েছিলেন তা পেয়েছেন।\n\nউত্তরের গঠনটি request-এর মতোই: একটি status line, কিছু header, একটি খালি লাইন, তারপর body।\n\nওই **খালি লাইনটি** গুরুত্বপূর্ণ — সেটিই header-এর শেষ আর body-র শুরুর সীমানা। আর `Content-Length` header বলে দেয় body কত byte, যাতে receiver জানে কোথায় থামতে হবে।\n\nমনে রাখবেন TCP একটি সীমানাহীন byte-stream — তাই HTTP-কে নিজেই নিজের সীমানা এঁকে নিতে হয়।' },
      '404': { line:'404 Not Found', body:'<html>Not Found</html>',
        title:'404 Not Found — এমন কিছু নেই',
        what:'Server বলল `HTTP/1.1 404 Not Found`। সে request-টি বুঝেছে, কিন্তু ওই path-এ কিছু নেই।',
        why:'`4xx` মানে **client-এর দিকের সমস্যা**। Server ঠিকঠাক চলছে, কিন্তু আপনার চাওয়াটিতে ভুল আছে।\n\nকাছাকাছি code গুলো আলাদা কথা বলে:\n\n`400` — request-এর গঠনই ভুল\n`401` — আপনি কে তা জানা নেই (login করুন)\n`403` — আপনি কে জানি, কিন্তু অনুমতি নেই\n`404` — এমন কিছু নেই\n`429` — বড্ড বেশি চাইছেন, একটু থামুন\n\nলক্ষ্য করুন — 404 এলেও **connection সফল হয়েছে**। DNS কাজ করেছে, TCP handshake হয়েছে, HTTP আলাপ হয়েছে। শুধু চাওয়া জিনিসটি নেই। এটি network-এর সমস্যা নয়।' },
      '301': { line:'301 Moved Permanently', body:'',
        title:'301 Moved — অন্য ঠিকানায় যান',
        what:'Server বলল `301 Moved Permanently` এবং একটি `Location: https://example.com/new` header দিল।\n\nকোনো body নেই — শুধু নতুন ঠিকানা।',
        why:'`3xx` মানে **অন্য কোথাও দেখুন**। Browser নিজে থেকেই সেই নতুন ঠিকানায় গিয়ে আবার request পাঠাবে।\n\n`301` আর `302`-এর পার্থক্যটি ব্যবহারিকভাবে বড়:\n\n`301` **স্থায়ী** — browser এটি cache করে রাখে। পরের বার সে সরাসরি নতুন ঠিকানায় যাবে, পুরনোটিতে আর আসবেই না।\n\n`302` **সাময়িক** — প্রতিবার আগে পুরনো ঠিকানাতেই আসবে।\n\nএই পার্থক্যটি ভুল করলে ভোগান্তি হয়। ভুল করে ৩০১ দিলে ব্যবহারকারীর browser সেটি মনে রাখে, আর আপনি সহজে সেটি ফেরাতে পারেন না।\n\nHTTP থেকে HTTPS-এ পাঠানোর জন্য 301 খুব সাধারণ ব্যবহার।' },
      '500': { line:'500 Internal Server Error', body:'<html>Error</html>',
        title:'500 — server-এর নিজের সমস্যা',
        what:'Server বলল `500 Internal Server Error`। আপনার request-এ কোনো ভুল ছিল না — সমস্যাটি ওদের দিকে।',
        why:'`5xx` মানে **server-এর দোষ**। আপনি সঠিক জিনিস সঠিকভাবেই চেয়েছিলেন।\n\n`500` — কোডে কোথাও একটি অপ্রত্যাশিত ত্রুটি\n`502` — Proxy তার পেছনের server থেকে আজেবাজে উত্তর পেয়েছে\n`503` — Server সাময়িকভাবে অক্ষম (ভিড়, বা maintenance)\n`504` — Proxy অপেক্ষা করতে করতে হাল ছেড়েছে\n\nDebugging-এ এই শ্রেণিভাগটি **প্রথম প্রশ্নের উত্তর দিয়ে দেয়: দোষ কার দিকে?**\n\n`4xx` দেখলে আপনার request দেখুন। `5xx` দেখলে server-এর log দেখুন। `502`/`504` দেখলে সন্দেহ করুন — সমস্যা সম্ভবত proxy-র পেছনের service-এ।' }
    };
    var R = RESP[CODE];

    var respText = 'HTTP/1.1 ' + R.line + '\nContent-Type: text/html\n' +
                   'Content-Length: ' + (R.body.length || 0) + '\n' +
                   'Connection: ' + (cfg.keepalive ? 'keep-alive' : 'close') +
                   (R.body ? '\n\n' + R.body : '');
    var resp = httpPkt('server', respText, R.line,
                       CODE === '200' ? 'ack' : 'data');

    steps.push({
      t:at(), actor:'server', layer:'L7',
      kind: CODE === '200' ? 'ok' : CODE === '301' ? 'warn' : 'error',
      title:R.title, packet:resp,
      what:R.what, why:R.why,
      apply: function(st){ st.wire = { pkt:resp, from:'server', to:'client' };
                           st.status = CODE; st.banner = R.line; }
    });

    /* ── Stateless ── */
    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'info',
      title:'দ্বিতীয় Request — Server কিছুই মনে রাখেনি',
      what:'একই connection-এ দ্বিতীয় request পাঠানো হলো। কিন্তু Server-এর কাছে এটি সম্পূর্ণ **নতুন একজন**।\n\nপ্রথম request-এর কোনো স্মৃতি তার নেই।',
      why :'এটাই **stateless** — HTTP-র একটি মৌলিক সিদ্ধান্ত। প্রতিটি request নিজের পায়ে দাঁড়ানো, স্বয়ংসম্পূর্ণ।\n\nতাহলে login কাজ করে কীভাবে?\n\nউত্তরটি সুন্দর — **স্মৃতিটি আপনার কাছে থাকে, server-এর কাছে নয়**। Server একবার আপনাকে একটি Cookie দেয়, আর আপনার browser সেটি প্রতিটি request-এ ফেরত পাঠায়। Server সেই Cookie দেখে আপনাকে চেনে।\n\nএই নকশার একটি বিশাল লাভ আছে: যেকোনো server যেকোনো request সামলাতে পারে, কারণ কোনো server-এ বিশেষ কিছু জমা নেই। এজন্যই একটি site-এর পেছনে ১০০টি server রাখা যায় — load balancer আপনাকে যে কোনোটিতে পাঠাতে পারে।\n\nStateless না হলে আধুনিক scaling কার্যত অসম্ভব হতো।',
      apply: function(st){ st.wire = null; st.reqs = 2; st.banner = 'stateless — নতুন request'; }
    });

    /* ── Keep-Alive ── */
    if(cfg.keepalive){
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'ok',
        title:'Keep-Alive — একই connection আবার ব্যবহার',
        what:'`Connection: keep-alive` থাকায় TCP connection-টি খোলাই আছে। দ্বিতীয় request-এ **কোনো নতুন handshake লাগেনি**।\n\nমোট connection: **১টি**, request: **২টি**।',
        why :'একটি সাধারণ web page-এ ৫০-১০০টি জিনিস থাকে — CSS, JS, ছবি, font।\n\nপ্রতিটির জন্য নতুন connection খুললে প্রতিবার তিনটি handshake Packet আর এক RTT খরচ হতো। HTTPS হলে TLS handshake-ও যোগ হতো — আরও দুই RTT।\n\nKeep-Alive এই পুরো খরচটি **একবারেই** সীমাবদ্ধ করে দেয়।\n\nএর একটি বাড়তি সুবিধাও আছে: TCP-র congestion window ধীরে ধীরে বড় হয় (slow start)। Connection পুনর্ব্যবহার করলে সেই বড় window-টাও ধরে রাখা যায়, তাই পরের transfer গুলো শুরু থেকেই দ্রুত।\n\nHTTP/1.1 থেকে Keep-Alive **default** — এটি এতটাই গুরুত্বপূর্ণ।',
        apply: function(st){ st.banner = '১ connection · ২ request'; }
      });
    } else {
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'warn',
        title:'Connection: close — আবার পুরো handshake',
        what:'`Connection: close` থাকায় প্রথম উত্তরের পরেই connection বন্ধ হয়ে গেল। দ্বিতীয় request-এর জন্য **আবার পুরো TCP handshake** করতে হলো।\n\nমোট connection: **২টি**, request: **২টি**।',
        why :'এটিই ছিল HTTP/1.0-র আচরণ, এবং এটি ছিল ভয়াবহ অপচয়।\n\nহিসাবটি দেখুন — ১০০টি জিনিসের একটি page মানে ১০০টি connection, ৩০০টি handshake Packet, ১০০ RTT শুধু হাত মেলাতে।\n\nServer-এর দিকেও ভোগান্তি — প্রতিটি বন্ধ connection একটি TIME_WAIT socket রেখে যায়, আর সেগুলো জমতে থাকে।\n\nএজন্যই HTTP/1.1-এ Keep-Alive default করা হয়েছে। `Keep-Alive ব্যবহার করো` চালু করে ধাপের সংখ্যা মিলিয়ে দেখুন।',
        apply: function(st){ st.conns = 2; st.banner = '২ connection · ২ request'; }
      });
    }

    return steps;
  }
};

})(window.NetLab);
