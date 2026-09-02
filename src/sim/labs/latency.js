/* ═══════════════════════════════════════════════════════════════════
   LAB · Latency — দেরি কোথা থেকে আসে
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

/* আলোর গতি fiber-এ প্রায় ২,০০,০০০ km/s — এটিই propagation delay-র ভিত্তি */
var C_FIBER = 200000;

function pkt(label, from, to, kind){
  return P.make([
    P.ethernet('AA:AA:AA:AA:AA:AA', 'SS:SS:SS:SS:SS:SS', 'ip'),
    P.ip('192.168.1.10', '93.184.216.34', 64, 'tcp', 1500),
    P.tcp(49152, 443, 1, 1, 'PSH, ACK', 64240)
  ], { label:label, kind:kind || 'data', from:from, to:to });
}

NS.labs.latency = {
  id: 'latency',
  title: 'Latency — দেরির চার উৎস',
  group: 'Phase 5 · Performance',
  chapter: 'ch36',
  blurb: 'Bandwidth বাড়ালেই সব দ্রুত হয় না। দেরির একটি অংশ পদার্থবিজ্ঞান — সেটি কেনা যায় না।',

  learn: [
    'Latency-র চারটি উপাদান — কোনটি কীসের উপর নির্ভর করে',
    'কোন অংশটি বেশি টাকা খরচ করলেও কমানো যায় না',
    'Bandwidth বাড়ালে কোনটি কমে, কোনটি কমে না',
    'RTT কেন বারবার গুণ হয়ে বড় দেরি তৈরি করে'
  ],

  mistakes: [
    { m:'Internet-এর গতি বাড়ালে সব website দ্রুত খুলবে।',
      r:'Bandwidth বাড়ালে **transmission delay** কমে — অর্থাৎ বড় file দ্রুত যায়। কিন্তু **propagation delay** (দূরত্ব ÷ আলোর গতি) একটুও কমে না। ছোট request-এ বেশিরভাগ সময়ই propagation, তাই সেখানে bandwidth বাড়িয়ে প্রায় কিছুই লাভ হয় না।' },
    { m:'Latency আর Bandwidth মোটামুটি একই জিনিস।',
      r:'দুটি সম্পূর্ণ আলাদা মাপ। **Latency** = একটি bit যেতে কত সময় লাগে। **Bandwidth** = প্রতি সেকেন্ডে কত bit পাঠানো যায়। একটি ট্রাক ভর্তি hard disk-এর bandwidth বিশাল, কিন্তু latency কয়েক ঘণ্টা।' },
    { m:'Ping কম মানে সব ঠিক আছে।',
      r:'Ping শুধু **এক জোড়া ছোট Packet**-এর যাওয়া-আসার সময় মাপে। কিন্তু একটি page load-এ কয়েক ডজন RTT লাগতে পারে — DNS, TCP handshake, TLS handshake, তারপর প্রতিটি resource। ৫০ms ping-ও ২০ বার গুণ হলে এক সেকেন্ড।' }
  ],

  controls: [
    { key:'dist', type:'choice', label:'Server কত দূরে', def:'far',
      options:[ ['near','একই শহর — ২০ km'],
                ['far','অন্য মহাদেশ — ১২,০০০ km'] ] },
    { key:'bw', type:'choice', label:'Bandwidth', def:'low',
      options:[ ['low','১০ Mbps'], ['high','১০০০ Mbps (১০০ গুণ বেশি)'] ] },
    { key:'busy', type:'toggle', label:'পথের Router গুলো ব্যস্ত', def:false,
      help:'Queuing delay-ই একমাত্র উপাদান যা মুহূর্তে মুহূর্তে বদলায়।' }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Client', x:14, y:50, mac:'AA:AA:AA:AA:AA:AA',
                         ip:'192.168.1.10' }),
        N.router('r1', { name:'Router 1', x:38, y:50,
          ifaces:[{ name:'eth0', ip:'10.0.0.1', mac:'11:11:11:11:11:11',
                    mask:'255.255.255.0' }] }),
        N.router('r2', { name:'Router 2', x:62, y:50,
          ifaces:[{ name:'eth0', ip:'10.0.1.1', mac:'22:22:22:22:22:22',
                    mask:'255.255.255.0' }] }),
        N.server('srv', { name:'Server', x:86, y:50, mac:'SS:SS:SS:SS:SS:SS',
          ip:'93.184.216.34',
          listening:[{ port:443, service:'HTTPS', open:true }] })
      ],
      links: [ N.link('client','r1'), N.link('r1','r2'), N.link('r2','srv') ],
      hub:null, wire:null, banner:null,
      trans:0, prop:0, queue:0, proc:0, total:0
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }

    var km    = cfg.dist === 'near' ? 20 : 12000;
    var mbps  = cfg.bw === 'high' ? 1000 : 10;
    var bits  = 1500 * 8;                       /* একটি সাধারণ Packet */
    /* চারটি উপাদান, মিলিসেকেন্ডে */
    var trans = Math.round((bits / (mbps * 1e6)) * 1000 * 100) / 100;
    var prop  = Math.round((km / C_FIBER) * 1000 * 100) / 100;
    var queue = cfg.busy ? 30 : 0.5;
    var proc  = 0.1 * 2;                        /* দুটি Router */
    var total = Math.round((trans + prop + queue + proc) * 100) / 100;

    var p = pkt('1500 B', 'client', 'r1');
    steps.push({
      t:at(), actor:'client', layer:'L1', kind:'info',
      title:'১. Transmission Delay — তার-এ তুলতে যত সময়', packet:p,
      what:'একটি ১৫০০ byte Packet-কে তারে "ঢেলে দিতে" সময় লাগে:\n\n`১৫০০ × ৮ bit ÷ ' + mbps + ' Mbps` = **' + trans + ' ms**',
      why :'এটি একটি সহজ ভাগ — কতগুলো bit, ভাগ প্রতি সেকেন্ডে কতগুলো bit পাঠানো যায়।\n\n**এই অংশটিই bandwidth-এর উপর নির্ভর করে।** Bandwidth ১০ গুণ বাড়ালে এই সময় ১০ ভাগের এক ভাগ হয়ে যায়।\n\nভাবুন একটি পাইপে জল ঢালার মতো — মোটা পাইপে একই পরিমাণ জল দ্রুত ঢালা যায়।\n\nবড় file-এ এই অংশটি প্রধান হয়ে ওঠে। কিন্তু ছোট request-এ এটি প্রায় নগণ্য — সেখানে অন্য উপাদানগুলোই আসল।',
      apply: function(st){ st.wire = { pkt:p, from:'client', to:'r1' };
                           st.trans = trans; st.banner = 'transmission ' + trans + ' ms'; }
    });

    var p2 = pkt('ভ্রমণে', 'r1', 'r2');
    steps.push({
      t:at(), actor:'r1', layer:'L1', kind: cfg.dist === 'far' ? 'warn' : 'ok',
      title:'২. Propagation Delay — পথ পাড়ি দিতে যত সময়', packet:p2,
      what:'Signal-কে ' + km.toLocaleString('en-US') + ' km পাড়ি দিতে হবে। Fiber-এ আলো চলে প্রায় ২,০০,০০০ km/s গতিতে:\n\n`' + km + ' ÷ 200000` = **' + prop + ' ms**',
      why : cfg.dist === 'far'
        ? '**এটিই সেই অংশ যা টাকা দিয়ে কেনা যায় না।**\n\nএটি পদার্থবিজ্ঞান। আলোর চেয়ে দ্রুত কিছু যেতে পারে না, আর fiber-এ আলো শূন্যস্থানের চেয়েও কিছুটা ধীরে চলে।\n\nBandwidth ১০০০ গুণ বাড়ালেও এই ' + prop + ' ms এক চুলও কমবে না।\n\nএখান থেকেই CDN-এর পুরো যুক্তিটি আসে। দেরি যদি দূরত্বের কারণে হয়, তাহলে **একমাত্র সমাধান দূরত্ব কমানো** — অর্থাৎ content-কে ব্যবহারকারীর কাছে নিয়ে যাওয়া।\n\nএটি একটি গভীর কথা: কিছু সমস্যা প্রকৌশল দিয়ে সমাধান হয় না, শুধু ভূগোল বদলে সমাধান হয়।'
        : 'কাছাকাছি হওয়ায় এই অংশটি নগণ্য — মাত্র ' + prop + ' ms।\n\nএখানে দেরির প্রধান কারণ অন্য উপাদানগুলো।\n\n`অন্য মহাদেশ` বেছে দেখুন — তখন এই একটি সংখ্যাই পুরো হিসাবকে গ্রাস করে ফেলে।',
      apply: function(st){ st.wire = { pkt:p2, from:'r1', to:'r2' };
                           st.prop = prop; st.banner = 'propagation ' + prop + ' ms'; }
    });

    var p3 = pkt(cfg.busy ? 'queue-এ অপেক্ষা' : 'দ্রুত পার', 'r2', 'srv');
    steps.push({
      t:at(), actor:'r2', layer:'L3', kind: cfg.busy ? 'error' : 'ok',
      title:'৩. Queuing Delay — Router-এ অপেক্ষা', packet:p3,
      what: cfg.busy
        ? 'Router-এর queue-তে আরও অনেক Packet অপেক্ষা করছে। আমাদের Packet-কে লাইনে দাঁড়াতে হলো:\n\n**' + queue + ' ms**'
        : 'Router-এ প্রায় কোনো ভিড় নেই। অপেক্ষা: **' + queue + ' ms**',
      why : cfg.busy
        ? '**এই উপাদানটিই একমাত্র অস্থির।**\n\nবাকি তিনটি মোটামুটি স্থির — দূরত্ব বদলায় না, bandwidth বদলায় না, Router-এর গতি বদলায় না।\n\nকিন্তু queue মুহূর্তে মুহূর্তে বদলায়, কারণ এটি নির্ভর করে **এই মুহূর্তে আর কারা পাঠাচ্ছে** তার উপর।\n\nএখান থেকেই **jitter** তৈরি হয় — একই পথে পাঠানো দুটি Packet ভিন্ন সময় নেয়। Voice ও video call-এ jitter latency-র চেয়েও বেশি ক্ষতিকর, কারণ শব্দ থেমে থেমে আসে।\n\nআর queue যখন পুরো ভরে যায়, তখন Router নতুন Packet **ফেলে দিতে** বাধ্য হয়। এটাই congestion-এর সময় packet loss-এর প্রধান উৎস।'
        : 'ভিড় না থাকায় Packet প্রায় সঙ্গে সঙ্গেই এগিয়ে গেল।\n\n`পথের Router গুলো ব্যস্ত` চালু করে দেখুন — একই পথ, একই দূরত্ব, একই bandwidth, কিন্তু সময় অনেক বেড়ে যাবে।\n\nএটাই ব্যাখ্যা করে কেন একই connection কখনো দ্রুত, কখনো ধীর মনে হয়।',
      apply: function(st){ st.wire = { pkt:p3, from:'r2', to:'srv' };
                           st.queue = queue; st.banner = 'queuing ' + queue + ' ms'; }
    });

    steps.push({
      t:at(), actor:'srv', layer:'L3', kind:'info',
      title:'৪. Processing Delay — সিদ্ধান্ত নিতে যত সময়',
      what:'প্রতিটি Router header পড়ে, routing table দেখে, TTL কমায়, checksum মেলায়। দুটি Router মিলিয়ে:\n\n**' + proc + ' ms**',
      why :'আধুনিক Router-এ এই কাজটি hardware-এ হয়, তাই সময় খুবই কম — সাধারণত মাইক্রোসেকেন্ডের ঘরে।\n\nএককালে এটি বড় ব্যাপার ছিল, যখন Router software দিয়ে Packet forward করত।\n\nআজকের দিনে এটি সাধারণত নগণ্য — যদি না Router-এ ভারী কাজ যোগ করা হয়, যেমন deep packet inspection বা encryption।',
      apply: function(st){ st.proc = proc; st.banner = 'processing ' + proc + ' ms'; }
    });

    var dominant = prop >= trans && prop >= queue ? 'propagation'
                 : queue >= trans ? 'queuing' : 'transmission';
    var pctProp = Math.round(prop / total * 100);

    steps.push({
      t:at(), actor:'srv', layer:'L3', kind:'ok',
      title:'মোট = ' + total + ' ms (এক দিকে)',
      what:'`transmission ' + trans + '` + `propagation ' + prop + '` + `queuing ' + queue +
           '` + `processing ' + proc + '` = **' + total + ' ms**\n\nRTT (যাওয়া-আসা) ≈ **' + (total * 2).toFixed(2) + ' ms**\n\nসবচেয়ে বড় অংশ: **' + dominant + '** — মোটের প্রায় ' +
           (dominant === 'propagation' ? pctProp : Math.round((dominant === 'queuing' ? queue : trans) / total * 100)) + '%।',
      why : dominant === 'propagation'
        ? 'Propagation-ই এখানে প্রধান, এবং সেটিই সবচেয়ে গুরুত্বপূর্ণ শিক্ষা।\n\nএই অবস্থায় bandwidth বাড়িয়ে প্রায় **কিছুই লাভ হবে না**। `Bandwidth` বদলে ১০০০ Mbps করে দেখুন — মোট সময় কতটুকু কমে।\n\nআর এখানেই RTT-র গুণিতক প্রভাব ভয়ংকর হয়ে ওঠে। একটি সাধারণ HTTPS page load-এ লাগে:\n\n`DNS` ১ RTT + `TCP handshake` ১ RTT + `TLS handshake` ১-২ RTT + `HTTP request` ১ RTT\n\n= অন্তত ৪ RTT, মানে প্রায় ' + (total * 8).toFixed(0) + ' ms — **একটি byte content আসার আগেই**।\n\nএজন্যই আধুনিক optimization-এর বেশিরভাগ চেষ্টা RTT **কমানো** নয়, RTT-র **সংখ্যা কমানো**: Keep-Alive, TLS session resumption, QUIC-এর 0-RTT, আর সর্বোপরি CDN।'
        : dominant === 'queuing'
          ? 'Queue-ই এখানে প্রধান — অর্থাৎ সমস্যাটি **ভিড়ের**, দূরত্ব বা bandwidth-এর নয়।\n\nএটি সবচেয়ে হতাশাজনক ধরনের দেরি, কারণ এটি অনিয়মিত। কখনো দ্রুত, কখনো ধীর, আর কারণটি আপনার নিয়ন্ত্রণের বাইরে।\n\nQueue-র সমস্যার সমাধান bandwidth বাড়ানো নয় — সমাধান হলো ভিড় কমানো, বা QoS দিয়ে গুরুত্বপূর্ণ traffic-কে অগ্রাধিকার দেওয়া।'
          : 'Transmission-ই এখানে প্রধান, অর্থাৎ Packet-টি বড় আর bandwidth কম।\n\n**এই একটিমাত্র ক্ষেত্রেই bandwidth বাড়িয়ে সত্যিকারের লাভ হয়।** বড় file transfer-এ ঠিক এই অবস্থাই তৈরি হয়।\n\nকিন্তু লক্ষ্য করুন — ছোট request-এ (API call, HTML page) এই অংশটি নগণ্য। সেখানে bandwidth বাড়ানো টাকার অপচয়।',
      apply: function(st){ st.wire = null; st.total = total;
                           st.banner = 'মোট ' + total + ' ms · RTT ' + (total * 2).toFixed(1) + ' ms'; }
    });

    return steps;
  }
};

})(window.NetLab);
