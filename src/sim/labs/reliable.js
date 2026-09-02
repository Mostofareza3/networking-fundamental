/* ═══════════════════════════════════════════════════════════════════
   LAB · TCP Reliability — হারিয়ে গেলে কী হয়
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI_IP = '192.168.1.10', SRV_IP = '93.184.216.34';
var CLI_MAC = 'AA:AA:AA:AA:AA:AA', SRV_MAC = 'SS:SS:SS:SS:SS:SS';
var MSS = 100;      /* এক segment-এ কত byte — হিসাব সহজ রাখতে ১০০ */
var BASE = 1;       /* relative sequence number, tcpdump-এর মতো */

function dseg(seq, n, label, kind){
  return P.make([
    P.ethernet(CLI_MAC, SRV_MAC, 'ip'),
    P.ip(CLI_IP, SRV_IP, 64, 'tcp', 40 + n),
    P.tcp(49152, 80, seq, 1, 'PSH, ACK', 64240),
    P.data('data[' + seq + '..' + (seq + n - 1) + ']')
  ], { label:label, kind:kind || 'data', from:'client', to:'server' });
}
function ackseg(ackNo, label, kind){
  return P.make([
    P.ethernet(SRV_MAC, CLI_MAC, 'ip'),
    P.ip(SRV_IP, CLI_IP, 64, 'tcp', 40),
    P.tcp(80, 49152, 1, ackNo, 'ACK', 65535)
  ], { label:label, kind:kind || 'ack', from:'server', to:'client' });
}

NS.labs.reliable = {
  id: 'reliable',
  title: 'TCP Reliability — হারানো Packet',
  group: 'Phase 3 · Layer 4',
  chapter: 'ch19',
  blurb: 'Network Packet হারায়। TCP সেটা ঠেকাতে পারে না — শুধু টের পেয়ে আবার পাঠায়।',

  learn: [
    'TCP কীভাবে বুঝতে পারে একটি segment হারিয়ে গেছে',
    'ACK Number আসলে কী বলে — "পেয়েছি" নয়, "এখন এটি চাই"',
    'Duplicate ACK কী, আর তিনটি duplicate ACK কেন গুরুত্বপূর্ণ',
    'Timeout আর Fast Retransmit — দুটি ভিন্ন উপায়ে হারানো ধরা'
  ],

  mistakes: [
    { m:'TCP ব্যবহার করলে Packet হারায় না।',
      r:'TCP Packet হারানো **ঠেকাতে পারে না** — সেটি network-এর ব্যাপার। TCP শুধু হারানো **টের পায়** এবং **আবার পাঠায়**। তাই application-এর কাছে data অক্ষত পৌঁছায়, কিন্তু নিচে cable-এ Packet ঠিকই হারিয়েছিল।' },
    { m:'প্রতিটি Packet-এর জন্য আলাদা একটি ACK আসে।',
      r:'TCP-র ACK **cumulative** — `ack=301` মানে "৩০১-এর আগের সবকিছু পেয়েছি"। একটি ACK একসাথে অনেকগুলো segment-এর স্বীকৃতি দিতে পারে। Receiver প্রায়ই কয়েকটি segment জমিয়ে একটি ACK পাঠায়।' },
    { m:'Packet হারালে TCP শুধু ওই একটিই আবার পাঠায়, সাথে সাথেই।',
      r:'"সাথে সাথে" বলতে কিছু নেই — sender তো জানেই না কখন হারিয়েছে। তাকে হয় **timeout** পর্যন্ত অপেক্ষা করতে হয়, নয়তো **তিনটি duplicate ACK** দেখে অনুমান করতে হয়। প্রথমটিতে অনেক সময় নষ্ট হয়, তাই দ্বিতীয়টি আবিষ্কার হয়েছিল।' }
  ],

  controls: [
    { key:'mode', type:'choice', label:'কী ঘটবে', def:'fast',
      options:[ ['none','সব ঠিকঠাক পৌঁছাচ্ছে'],
                ['fast','২য় segment হারাল — Fast Retransmit'],
                ['timeout','শেষ segment হারাল — Timeout লাগবে'] ],
      help:'Fast Retransmit আর Timeout-এর সময়ের পার্থক্যটাই আসল শিক্ষা।' }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Client', x:18, y:50, mac:CLI_MAC, ip:CLI_IP,
                         note:'sending' }),
        N.server('server', { name:'Server', x:82, y:50, mac:SRV_MAC, ip:SRV_IP,
                             listening:[{ port:80, service:'HTTP', open:true }],
                             note:'recv' })
      ],
      links: [ N.link('client','server') ],
      hub:null, wire:null, banner:null,
      sent: [], got: [], lost: [], ackNo: BASE
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }

    /* চারটি segment: seq 1, 101, 201, 301 — প্রতিটি ১০০ byte */
    var segs = [];
    for(var i = 0; i < 4; i++) segs.push({ n:i + 1, seq:BASE + i * MSS, len:MSS });

    var lostIdx = cfg.mode === 'fast' ? 1 : cfg.mode === 'timeout' ? 3 : -1;

    /* ── সব segment পাঠানো ── */
    for(var k = 0; k < segs.length; k++){
      (function(sg, isLost){
        var p = dseg(sg.seq, sg.len, 'seq=' + sg.seq, isLost ? 'data' : 'data');
        steps.push({
          t:at(), actor:'client', layer:'L4', kind:isLost ? 'warn' : 'info',
          title:'Segment ' + sg.n + ' পাঠানো হলো — seq=' + sg.seq, packet:p,
          what:'Client segment ' + sg.n + ' পাঠাল — byte `' + sg.seq + '` থেকে `' +
               (sg.seq + sg.len - 1) + '` পর্যন্ত, মোট ' + sg.len + ' byte।' +
               (isLost ? '\n\n**এই segment-টি পথে হারিয়ে যাবে।** কোনো Router-এর queue ভরে গেছে, তাই সে এটি ফেলে দিল।' : ''),
          why : isLost
            ? 'গুরুত্বপূর্ণ কথা — Client **জানেই না** যে এটি হারিয়েছে। সে দিব্যি পরেরটা পাঠাতে থাকবে।\n\nহারানোর খবর কারো কাছেই নেই। Router নালিশ করে না, Server তো জানেই না কিছু আসার কথা ছিল। TCP-কে নিজেই এটি **অনুমান** করে বের করতে হবে।'
            : 'Client অপেক্ষা করছে না — একটার পর একটা পাঠিয়ে যাচ্ছে। প্রতিটির জন্য ACK-এর অপেক্ষা করলে গতি ভয়াবহ কমে যেত।\n\nএকসাথে কতগুলো পাঠাতে পারবে তা ঠিক করে দেয় **window** — Flow Control lab-এ সেটি দেখা যাবে।',
          apply: function(st){
            st.wire = { pkt:p, from:'client', to:'server' };
            st.sent = st.sent.concat([sg.seq]);
            if(isLost) st.lost = st.lost.concat([sg.seq]);
            st.banner = 'seq=' + sg.seq + (isLost ? ' — হারিয়ে গেল' : '');
          }
        });

        if(isLost) return;

        /* Server পেল — কিন্তু ACK কী হবে তা নির্ভর করে ফাঁক আছে কিনা */
        steps.push({ __ackFor: sg });
      })(segs[k], k === lostIdx);
    }

    /* উপরে শুধু চিহ্ন রাখা হয়েছিল; এখন প্রকৃত ACK হিসাব করে বসানো হচ্ছে,
       কারণ ACK Number নির্ভর করে ততক্ষণে কী কী পৌঁছেছে তার উপর। */
    var out = [], got = [], dupCount = 0;
    for(var q = 0; q < steps.length; q++){
      var s = steps[q];
      if(!s.__ackFor){ out.push(s); continue; }
      var sg = s.__ackFor;
      got.push(sg.seq);

      /* cumulative ACK: শুরু থেকে ফাঁকহীন কতদূর পৌঁছেছে */
      var expect = BASE;
      while(got.indexOf(expect) !== -1) expect += MSS;

      var isDup = expect === BASE + lostIdx * MSS && lostIdx >= 0 && sg.seq > BASE + lostIdx * MSS;
      if(isDup) dupCount++;

      (function(sg, expect, isDup, dupN){
        var a = ackseg(expect, 'ACK ' + expect + (isDup ? ' (dup ' + dupN + ')' : ''),
                       isDup ? 'ack' : 'ack');
        out.push({
          t:at(), actor:'server', layer:'L4', kind:isDup ? 'warn' : 'ok',
          title: isDup ? 'আবার সেই একই ACK ' + expect + ' (duplicate ' + dupN + ')'
                       : 'ACK ' + expect + ' — এর আগ পর্যন্ত সব পেয়েছি',
          packet:a,
          what: isDup
            ? 'Server segment `' + sg.seq + '` পেয়েছে ঠিকই — কিন্তু আবারও পাঠাল `ack=' + expect + '`, আগেরটার মতোই একই সংখ্যা।'
            : 'Server `ack=' + expect + '` পাঠাল — "byte ' + expect + '-এর আগ পর্যন্ত সব পেয়েছি, এখন ' + expect + ' চাই।"',
          why : isDup
            ? 'এখানেই ACK Number-এর আসল অর্থ বোঝা যায়। ACK মানে **"এই byte-টি এখন চাই"** — "শেষ যেটা পেয়েছি সেটা" নয়।\n\nSegment `' + sg.seq + '` পৌঁছেছে বটে, কিন্তু `' + expect + '` থেকে একটা **ফাঁক** রয়ে গেছে। ফাঁক পেরিয়ে Server এগোতে পারে না, কারণ cumulative ACK ফাঁকের ওপারের কথা বলতেই পারে না।\n\nতাই সে বাধ্য হয়ে একই সংখ্যা আবার পাঠায়। Client-এর কাছে এই পুনরাবৃত্তিই একটি **সংকেত**: "কিছু একটা হারিয়েছে।"'
            : 'ACK **cumulative** — একটি সংখ্যাই বলে দেয় শুরু থেকে কতদূর নিখুঁতভাবে পৌঁছেছে।\n\nএর একটা সুন্দর দিক আছে: কোনো ACK পথে হারিয়ে গেলেও ক্ষতি নেই, পরের ACK-টিই আগেরটার কাজ সেরে দেবে।',
          apply: function(st){
            st.wire = { pkt:a, from:'server', to:'client' };
            st.got = st.got.concat([sg.seq]);
            st.ackNo = expect;
            st.banner = 'ACK ' + expect + (isDup ? ' · duplicate ' + dupN : '');
          }
        });
      })(sg, expect, isDup, dupCount);
    }
    steps = out;

    /* উপরে send-step আগে বানিয়ে পরে ACK-step মাঝখানে বসানো হয়েছে, তাই
       ঘড়ির সংখ্যাগুলো এলোমেলো হয়ে গেছে। Timeline-এ সময় সবসময় সামনে
       এগোনো উচিত, তাই এখানে ক্রম অনুযায়ী আবার নম্বর দেওয়া হচ্ছে।
       এর পরে যোগ হওয়া step গুলোও যেন ধারা মেনে চলে, সেজন্য t-ও নামানো হলো। */
    for(var z = 0; z < steps.length; z++) steps[z].t = z + 1;
    t = steps.length;

    /* ── কিছুই হারায়নি ── */
    if(lostIdx < 0){
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'ok',
        title:'চারটি segment-ই পৌঁছেছে',
        what:'৪০০ byte নিখুঁতভাবে পৌঁছে গেল। শেষ ACK `' + (BASE + 4 * MSS) + '` — অর্থাৎ তার আগের সব byte Server-এর কাছে আছে।',
        why :'এটাই স্বাভাবিক অবস্থা এবং বেশিরভাগ সময় এমনই হয়।\n\nকিন্তু TCP-র আসল জটিলতা তৈরি হয় ব্যতিক্রমের জন্য। Control-এ অন্য mode বেছে দেখুন — একটি Packet হারালে পুরো ব্যবস্থাটা কীভাবে সামলায়।',
        apply: function(st){ st.wire = null; st.banner = 'সব পৌঁছেছে · 400 bytes'; }
      });
      return steps;
    }

    var lostSeq = BASE + lostIdx * MSS;

    /* ── Fast Retransmit: তিনটি duplicate ACK ── */
    if(cfg.mode === 'fast'){
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'warn',
        title:'তিনটি duplicate ACK — Client বুঝে ফেলল',
        what:'Client পরপর **তিনটি** একই `ack=' + lostSeq + '` পেল। সে সিদ্ধান্তে এলো — segment `' + lostSeq + '` হারিয়েছে।',
        why :'কেন ঠিক তিনটি, একটি বা দুটি নয়?\n\nএকটি duplicate ACK দেখেই আতঙ্কিত হওয়া যায় না। Packet মাঝে মাঝে **উল্টো ক্রমে** পৌঁছায় — তখনও এক-দুটি duplicate ACK আসতে পারে, অথচ কিছুই হারায়নি।\n\nকিন্তু পরপর তিনটি? তার মানে ফাঁকের পরে অন্তত তিনটি segment ঠিকঠাক পৌঁছেছে, আর ফাঁকটা এখনো ভরেনি। এটি নিছক ক্রম উল্টানো হওয়ার সম্ভাবনা কম।\n\nতিন সংখ্যাটি অভিজ্ঞতা থেকে বাছা — যথেষ্ট নিশ্চিত হওয়া যায়, অথচ বেশি দেরিও হয় না।',
        apply: function(st){ st.wire = null; st.banner = '3 duplicate ACK — হারানো ধরা পড়ল'; }
      });

      var rp = dseg(lostSeq, MSS, 'seq=' + lostSeq + ' (আবার)');
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'ok',
        title:'Fast Retransmit — শুধু হারানোটাই আবার পাঠানো হলো', packet:rp,
        what:'Client শুধুমাত্র segment `' + lostSeq + '` আবার পাঠাল। বাকি তিনটি আবার পাঠাল না — সেগুলো তো পৌঁছেছেই।',
        why :'একে বলে **Fast Retransmit** — timeout-এর অপেক্ষা না করে duplicate ACK দেখেই আবার পাঠানো।\n\nএর দাম বিশাল। Timeout সাধারণত RTT-র কয়েক গুণ (কখনো এক সেকেন্ডের বেশি)। কিন্তু duplicate ACK তিনটি আসতে লাগে মাত্র প্রায় **এক RTT**।\n\nএটি TCP-র নকশার একটি সুন্দর দিক — receiver বাড়তি কিছু করছে না, সে তার স্বাভাবিক নিয়মেই ACK পাঠাচ্ছে। sender সেই স্বাভাবিক আচরণ থেকেই তথ্য বের করে নিচ্ছে।',
        apply: function(st){
          st.wire = { pkt:rp, from:'client', to:'server' };
          st.banner = 'Fast Retransmit seq=' + lostSeq;
        }
      });
    } else {
      /* ── Timeout: শেষ segment হারালে duplicate ACK আসার সুযোগই নেই ── */
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'warn',
        title:'নীরবতা — কোনো duplicate ACK আসছে না',
        what:'শেষ segment `' + lostSeq + '` হারিয়েছে। কিন্তু এবার কোনো duplicate ACK আসছে না — Client শুধু অপেক্ষা করছে।',
        why :'কারণটা লক্ষ্য করার মতো। Duplicate ACK তৈরি হয় তখনই যখন হারানো segment-এর **পরে** আরও segment পৌঁছায়।\n\nকিন্তু এটি ছিল শেষ segment। এর পরে আর কিছু পাঠানোই হয়নি। তাই Server-এর কাছে ACK পাঠানোর কোনো কারণই নেই — সে চুপ করে আছে।\n\nFast Retransmit-এর সূত্র এখানে কাজ করে না। Client-কে পুরনো উপায়ে যেতে হবে — **অপেক্ষা**।',
        apply: function(st){ st.wire = null; st.banner = 'অপেক্ষা… কোনো ACK নেই'; }
      });

      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'error',
        title:'RTO শেষ — Timeout হলো',
        what:'Retransmission Timeout (RTO) শেষ হয়ে গেল। এটি Fast Retransmit-এর চেয়ে **অনেক** বেশি সময়।',
        why :'RTO ঠিক হয় মাপা RTT থেকে — TCP প্রতিটি ACK-এর সময় মেপে গড় ও ওঠানামা হিসাব করে রাখে, তারপর তার চেয়ে যথেষ্ট বড় একটি সময় বেছে নেয়।\n\nবেশি বড় হলে হারানো ধরতে দেরি হয়। বেশি ছোট হলে ঠিকঠাক Packet-ও "হারিয়েছে" ভেবে আবার পাঠানো হয় — network অকারণে ভরে যায়।\n\nএজন্যই **শেষ Packet হারানো সবচেয়ে ব্যয়বহুল**। মাঝেরটা হারালে এক RTT-তেই ধরা পড়ত, শেষেরটার জন্য পুরো RTO অপেক্ষা করতে হলো।',
        apply: function(st){ st.wire = null; st.banner = 'RTO expired'; }
      });

      var rp2 = dseg(lostSeq, MSS, 'seq=' + lostSeq + ' (আবার)');
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'ok',
        title:'Timeout Retransmit', packet:rp2,
        what:'অবশেষে Client segment `' + lostSeq + '` আবার পাঠাল।',
        why :'একই সাথে সে **ধীরেও** হয়ে যায়। Timeout-কে TCP গুরুতর সংকেত হিসেবে দেখে — network সম্ভবত ভীষণ ভিড়ে ঠাসা। তাই sending rate অনেকখানি কমিয়ে দেয়।\n\nFast Retransmit-এ এতটা কমায় না, কারণ সেখানে প্রমাণ আছে যে পরের segment গুলো তো পৌঁছাচ্ছেই — মানে পথ পুরোপুরি বন্ধ নয়।',
        apply: function(st){
          st.wire = { pkt:rp2, from:'client', to:'server' };
          st.banner = 'Timeout retransmit seq=' + lostSeq;
        }
      });
    }

    var fin = ackseg(BASE + 4 * MSS, 'ACK ' + (BASE + 4 * MSS));
    steps.push({
      t:at(), actor:'server', layer:'L4', kind:'ok',
      title:'ফাঁক ভরে গেল — ACK ' + (BASE + 4 * MSS), packet:fin,
      what:'হারানো segment পৌঁছাতেই ফাঁকটি ভরে গেল। Server এবার লাফিয়ে `ack=' + (BASE + 4 * MSS) + '` পাঠাল — চারটি segment-ই স্বীকৃত।',
      why :'একটি ACK একলাফে সব বাকি segment-এর স্বীকৃতি দিয়ে দিল। এটিই cumulative ACK-এর সুবিধা।\n\nএবার সবচেয়ে গুরুত্বপূর্ণ কথাটি — **Application কিছুই টের পায়নি**। সে যেই ক্রমে, যেই নিখুঁত অবস্থায় byte গুলো চেয়েছিল, ঠিক তাই পেয়েছে।\n\nএকটি Packet হারিয়েছিল, আবার পাঠাতে হয়েছিল, দেরি হয়েছিল — এসব TCP নিজের ভেতরেই সামলে নিয়েছে। উপরের application-এর কাছে data-র ধারাটি নিখুঁত ছিল।\n\nএটাই "reliability" শব্দের আসল মানে — হারায় না তা নয়, বরং **হারালেও উপরের স্তর টের পায় না**।',
      apply: function(st){
        st.wire = { pkt:fin, from:'server', to:'client' };
        st.lost = []; st.ackNo = BASE + 4 * MSS;
        st.banner = 'সব পৌঁছেছে · application কিছু টেরই পায়নি';
      }
    });

    return steps;
  }
};

})(window.NetLab);
