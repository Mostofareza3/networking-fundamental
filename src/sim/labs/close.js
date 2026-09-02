/* ═══════════════════════════════════════════════════════════════════
   LAB · Connection Close — FIN, FIN-ACK এবং TIME_WAIT
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI_IP = '192.168.1.10', SRV_IP = '93.184.216.34';
var CLI_MAC = 'AA:AA:AA:AA:AA:AA', SRV_MAC = 'SS:SS:SS:SS:SS:SS';

function seg(from, seq, ack, flags, label, kind){
  return P.make([
    P.ethernet(from === 'client' ? CLI_MAC : SRV_MAC,
               from === 'client' ? SRV_MAC : CLI_MAC, 'ip'),
    P.ip(from === 'client' ? CLI_IP : SRV_IP,
         from === 'client' ? SRV_IP : CLI_IP, 64, 'tcp', 40),
    P.tcp(from === 'client' ? 49152 : 80, from === 'client' ? 80 : 49152,
          seq, ack, flags, 64240)
  ], { label:label, kind:kind || 'ack', from:from,
       to: from === 'client' ? 'server' : 'client' });
}

NS.labs.close = {
  id: 'close',
  title: 'Connection Close & TIME_WAIT',
  group: 'Phase 3 · Layer 4',
  chapter: 'ch22',
  blurb: 'শুরু হয় তিনটি Packet-এ, শেষ হয় চারটিতে। আর শেষ হওয়ার পরেও connection কিছুক্ষণ বেঁচে থাকে।',

  learn: [
    'কেন close-এ চারটি Packet লাগে, handshake-এ যেখানে তিনটি',
    'Half-close কী — এক দিক বন্ধ হলেও অন্য দিক খোলা থাকতে পারে',
    'TIME_WAIT কী এবং কেন সেটি ২ MSL সময় ধরে থাকে',
    'হাজার হাজার TIME_WAIT socket দেখলে সেটি সমস্যা কিনা'
  ],

  mistakes: [
    { m:'TIME_WAIT একটি সমস্যা, একে বন্ধ করে দেওয়া উচিত।',
      r:'TIME_WAIT একটি **নিরাপত্তা ব্যবস্থা**, bug নয়। এটি নিশ্চিত করে পুরনো connection-এর দেরিতে আসা Packet নতুন connection-এ ঢুকে data নষ্ট না করে। জোর করে বন্ধ করলে বিরল কিন্তু ভয়াবহ data corruption হতে পারে।' },
    { m:'FIN পাঠানো মানে connection সঙ্গে সঙ্গে বন্ধ।',
      r:'FIN মানে শুধু **"আমার আর পাঠানোর কিছু নেই"**। অন্য পাশ তখনও data পাঠাতে পারে, এবং TCP সেটি ঠিকঠাক গ্রহণ করে। একে বলে **half-close** — এজন্যই দুই দিক আলাদাভাবে বন্ধ করতে হয়, তাই চারটি Packet।' },
    { m:'RST দিয়ে connection বন্ধ করা FIN-এর চেয়ে দ্রুত, তাই ভালো।',
      r:'দ্রুত ঠিকই, কিন্তু **নিরাপদ নয়**। RST সঙ্গে সঙ্গে সব ফেলে দেয় — buffer-এ যে data এখনো পাঠানো হয়নি সেটিও। FIN নিশ্চিত করে সব data পৌঁছেছে, তারপর বন্ধ হয়। RST অস্বাভাবিক পরিস্থিতির জন্য।' }
  ],

  controls: [
    { key:'mode', type:'choice', label:'কীভাবে বন্ধ হবে', def:'graceful',
      options:[ ['graceful','স্বাভাবিক — চারটি Packet (FIN)'],
                ['halfclose','Half-close — Server তখনও data পাঠাচ্ছে'],
                ['rst','RST — হঠাৎ ছিঁড়ে ফেলা'] ] }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Client', x:18, y:50, mac:CLI_MAC, ip:CLI_IP,
                         note:'ESTABLISHED' }),
        N.server('server', { name:'Server', x:82, y:50, mac:SRV_MAC, ip:SRV_IP,
                             listening:[{ port:80, service:'HTTP', open:true }],
                             note:'ESTABLISHED' })
      ],
      links: [ N.link('client','server') ],
      hub:null, wire:null, banner:null,
      cstate:'ESTABLISHED', sstate:'ESTABLISHED'
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    function setState(st, c, s){
      for(var i = 0; i < st.devices.length; i++){
        if(st.devices[i].id === 'client' && c){ st.devices[i].note = c; st.cstate = c; }
        if(st.devices[i].id === 'server' && s){ st.devices[i].note = s; st.sstate = s; }
      }
    }

    /* ── RST — হঠাৎ ── */
    if(cfg.mode === 'rst'){
      var rst = seg('client', 5000, 8000, 'RST', 'RST', 'ack');
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'error',
        title:'RST — এক Packet-এই সব শেষ', packet:rst,
        what:'Client একটি **RST** পাঠাল। কোনো আলোচনা নেই, কোনো অপেক্ষা নেই — connection সঙ্গে সঙ্গে শেষ।',
        why :'RST মানে "এই connection আর নেই, ভুলে যাও"।\n\nসাধারণত এটি ঘটে অস্বাভাবিক পরিস্থিতিতে — process হঠাৎ মারা গেছে, অথবা এমন connection-এ Packet এসেছে যার কোনো অস্তিত্ব নেই।\n\nএর একটা বড় বিপদ আছে: send buffer-এ যদি কোনো data এখনো পাঠানো বাকি থাকত, সেটি **হারিয়ে যাবে**। RST অপেক্ষা করে না।',
        apply: function(st){
          st.wire = { pkt:rst, from:'client', to:'server' };
          setState(st, 'CLOSED', 'CLOSED');
          st.banner = 'RST — connection ছিঁড়ে গেল';
        }
      });
      steps.push({
        t:at(), actor:'server', layer:'L4', kind:'error',
        title:'Server-ও সঙ্গে সঙ্গে মুছে ফেলল',
        what:'Server RST পেয়ে connection-এর সব তথ্য মুছে ফেলল। কোনো TIME_WAIT নেই, কোনো অপেক্ষা নেই।',
        why :'এখানে ভালো দিকটি হলো — কোনো TIME_WAIT পড়ে থাকল না, resource সঙ্গে সঙ্গে মুক্ত।\n\nকিন্তু দামটাও বড়। কোনো নিশ্চয়তা নেই যে সব data পৌঁছেছে। Application যদি ঠিক আগেই কিছু লিখে থাকে, সেটি নীরবে হারিয়ে যেতে পারে।\n\nএজন্যই "TIME_WAIT এড়াতে RST ব্যবহার করি" — এই পরামর্শটি বিপজ্জনক। স্বাভাবিক close-এর জন্য FIN-ই সঠিক।',
        apply: function(st){ st.wire = null; st.banner = 'দুই পাশেই CLOSED'; }
      });
      return steps;
    }

    /* ── ধাপ ১: Client-এর FIN ── */
    var fin1 = seg('client', 5000, 8000, 'FIN, ACK', 'FIN seq=5000');
    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'info',
      title:'১ম — Client FIN পাঠাল', packet:fin1,
      what:'Client-এর application `close()` ডাকল। TCP একটি **FIN** পাঠাল।\n\nClient এখন `FIN_WAIT_1` অবস্থায়।',
      why :'FIN-এর অর্থ সাবধানে বোঝা দরকার — এটি "connection বন্ধ করো" নয়।\n\nএর মানে **"আমার আর পাঠানোর কিছু নেই"**। শুধু নিজের দিকটার কথা বলছে।\n\nTCP connection দ্বিমুখী, আর প্রতিটি দিক **স্বাধীনভাবে** বন্ধ হয়। Client-এর কথা শেষ মানে এই নয় যে Server-এরও শেষ।\n\nএই স্বাধীনতাই handshake আর close-এর পার্থক্য গড়ে দেয়। SYN-ACK-এ দুটি কাজ একসাথে করা গিয়েছিল, কারণ Server তখনই দুটোতেই রাজি। কিন্তু FIN-এর সময় Server হয়তো তখনো কথা শেষ করেনি।',
      apply: function(st){
        st.wire = { pkt:fin1, from:'client', to:'server' };
        setState(st, 'FIN_WAIT_1', 'ESTABLISHED');
        st.banner = 'FIN → Client-এর কথা শেষ';
      }
    });

    /* ── ধাপ ২: Server-এর ACK ── */
    var ack1 = seg('server', 8000, 5001, 'ACK', 'ACK 5001');
    steps.push({
      t:at(), actor:'server', layer:'L4', kind:'ok',
      title:'২য় — Server ACK দিল (কিন্তু FIN দিল না)', packet:ack1,
      what:'Server FIN-টি স্বীকার করল `ack=5001`। কিন্তু নিজে এখনো FIN পাঠায়নি।\n\nServer এখন `CLOSE_WAIT` — Client `FIN_WAIT_2`।',
      why :'**এই ধাপটিই বুঝিয়ে দেয় কেন চারটি Packet লাগে।**\n\nServer বলছে "তোমার কথা শেষ, বুঝলাম।" কিন্তু সে নিজে এখনো প্রস্তুত নয় — হয়তো তার application-এর আরও কিছু পাঠানোর আছে।\n\nহাত মেলানোর সময় SYN আর ACK একসাথে যেতে পেরেছিল, কারণ Server তখনই দুটোতেই রাজি ছিল। এখানে সেই সুবিধা নেই — তাই ACK আর FIN আলাদা হয়ে যায়, আর মোট চারটি Packet লাগে।\n\n`CLOSE_WAIT` অবস্থাটি debugging-এ খুব কাজের। বহু `CLOSE_WAIT` জমে থাকা মানে **application `close()` ডাকতে ভুলে গেছে** — TCP অপেক্ষা করছে কিন্তু কোড থেকে নির্দেশ আসছে না। এটি প্রায় সবসময়ই একটি bug।',
      apply: function(st){
        st.wire = { pkt:ack1, from:'server', to:'client' };
        setState(st, 'FIN_WAIT_2', 'CLOSE_WAIT');
        st.banner = 'ACK · Server এখনো CLOSE_WAIT-এ';
      }
    });

    /* ── Half-close: Server তখনও data পাঠাচ্ছে ── */
    if(cfg.mode === 'halfclose'){
      var late = P.make([
        P.ethernet(SRV_MAC, CLI_MAC, 'ip'),
        P.ip(SRV_IP, CLI_IP, 64, 'tcp', 140),
        P.tcp(80, 49152, 8000, 5001, 'PSH, ACK', 64240),
        P.data('বাকি 100 byte response')
      ], { label:'data', kind:'data', from:'server', to:'client' });

      steps.push({
        t:at(), actor:'server', layer:'L7', kind:'ok',
        title:'Server তখনও data পাঠাচ্ছে', packet:late,
        what:'Client FIN পাঠানোর **পরেও** Server ১০০ byte data পাঠাল। আর Client সেটি স্বাভাবিকভাবেই গ্রহণ করল।',
        why :'এটাই **half-close**। Client শুধু বলেছিল "আমার পাঠানো শেষ" — "আমি আর শুনব না" বলেনি।\n\nClient→Server দিকটি বন্ধ, কিন্তু Server→Client দিকটি সম্পূর্ণ খোলা।\n\nএর একটি চমৎকার বাস্তব ব্যবহার আছে। ভাবুন একটি কাজ যেখানে আপনি একটি বড় file পাঠাবেন, তারপর ফলাফল শুনবেন। File পাঠানো শেষ হলেই আপনি নিজের দিক বন্ধ করে দিতে পারেন — এতে অন্য পাশ **নিশ্চিতভাবে** জানে যে আর কিছু আসছে না, তাই সে কাজ শুরু করতে পারে। অথচ আপনি তখনও উত্তরের অপেক্ষায় শুনতে থাকেন।\n\nUnix-এ `shutdown(sock, SHUT_WR)` ঠিক এই কাজটিই করে।',
        apply: function(st){
          st.wire = { pkt:late, from:'server', to:'client' };
          st.banner = 'half-close — এক দিক খোলা';
        }
      });
    }

    /* ── ধাপ ৩: Server-এর FIN ── */
    var fin2 = seg('server', cfg.mode === 'halfclose' ? 8100 : 8000, 5001,
                   'FIN, ACK', 'FIN');
    var sseq = cfg.mode === 'halfclose' ? 8101 : 8001;
    steps.push({
      t:at(), actor:'server', layer:'L4', kind:'info',
      title:'৩য় — এবার Server-এর FIN', packet:fin2,
      what:'Server-এর application-ও `close()` ডাকল। সে এবার নিজের **FIN** পাঠাল।\n\nServer এখন `LAST_ACK` — শেষ স্বীকৃতির অপেক্ষায়।',
      why :'এখন দুই দিকই বন্ধ হওয়ার পথে। প্রতিটি দিকের জন্য একটি FIN আর একটি ACK — মোট চারটি।\n\nএখানে একটি সৌন্দর্য আছে: এই একই চারটি Packet-এর ব্যবস্থা **যে কোনো ক্রমে** কাজ করে। দুই পাশ একসাথে FIN পাঠালেও (simultaneous close) TCP সেটি সামলাতে পারে।',
      apply: function(st){
        st.wire = { pkt:fin2, from:'server', to:'client' };
        setState(st, null, 'LAST_ACK');
        st.banner = 'Server-এর FIN';
      }
    });

    /* ── ধাপ ৪: Client-এর শেষ ACK ── */
    var ack2 = seg('client', 5001, sseq, 'ACK', 'ACK ' + sseq);
    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'ok',
      title:'৪র্থ — শেষ ACK, আর তারপর TIME_WAIT', packet:ack2,
      what:'Client শেষ ACK পাঠাল। Server এটি পেয়েই connection মুছে ফেলবে — তার কাজ শেষ।\n\nকিন্তু Client নিজে সঙ্গে সঙ্গে মুক্ত হয় না। সে যায় **TIME_WAIT** অবস্থায়।',
      why :'কেন এই বাড়তি অপেক্ষা? দুটি কারণ, দুটিই গুরুত্বপূর্ণ।\n\n**এক — শেষ ACK যদি হারিয়ে যায়।** তাহলে Server ভাববে তার FIN পৌঁছায়নি, আর আবার FIN পাঠাবে। Client যদি ততক্ষণে সব মুছে ফেলে থাকে, সে সেই FIN-এর উত্তরে RST পাঠাবে — Server-এর কাছে যা একটি error বলে মনে হবে। TIME_WAIT-এ থাকলে সে ACK-টি আবার পাঠাতে পারে।\n\n**দুই — পুরনো Packet-এর ভূত।** এই connection-এর কোনো Packet হয়তো এখনো network-এ ঘুরছে (Router-এর queue-তে আটকে ছিল)। যদি সঙ্গে সঙ্গে একই port দিয়ে নতুন connection খোলা হয়, সেই দেরিতে আসা Packet নতুন connection-এ ঢুকে **data নষ্ট করে দিতে পারে**।',
      apply: function(st){
        st.wire = { pkt:ack2, from:'client', to:'server' };
        setState(st, 'TIME_WAIT', 'CLOSED');
        st.banner = 'শেষ ACK · Client TIME_WAIT-এ';
      }
    });

    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'warn',
      title:'TIME_WAIT — ২ MSL অপেক্ষা',
      what:'Client প্রায় **৬০ সেকেন্ড** (2 × MSL) এই অবস্থায় থাকবে। এই সময়ে ওই port অন্য কেউ ব্যবহার করতে পারবে না।',
      why :'MSL মানে Maximum Segment Lifetime — একটি Packet network-এ সর্বোচ্চ কতক্ষণ বাঁচতে পারে।\n\nদ্বিগুণ কেন? এক MSL যাওয়ার পথের ভেসে থাকা Packet-এর জন্য, আরেক MSL তার উত্তরের জন্য। এই সময় পার হলে নিশ্চিতভাবে বলা যায় — এই connection-এর কোনো Packet আর কোথাও বেঁচে নেই।\n\n**যে দিক আগে close করে, TIME_WAIT তার ঘাড়েই পড়ে।** এই কথাটির একটি ব্যবহারিক ফল আছে: ব্যস্ত Server-এ যদি Server নিজে আগে close করে, তাহলে হাজার হাজার TIME_WAIT socket জমে যায়। HTTP Keep-Alive এই সমস্যা অনেকটাই কমায়, কারণ তখন connection বারবার খোলা-বন্ধই হয় না।\n\n`ss -tan | grep TIME-WAIT` দিয়ে অনেক দেখলে আতঙ্কিত হওয়ার কিছু নেই — এটি স্বাভাবিক ও সাময়িক। কিন্তু সংখ্যাটি যদি ক্রমাগত বাড়তে থাকে, তাহলে বুঝতে হবে connection পুনর্ব্যবহার হচ্ছে না।',
      apply: function(st){ st.wire = null; st.banner = 'TIME_WAIT · ~60s'; }
    });

    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'ok',
      title:'সময় শেষ — এবার সত্যিই CLOSED',
      what:'২ MSL পার হলো। Client-ও এখন `CLOSED`। Port আবার ব্যবহারযোগ্য।',
      why :'পুরো ব্যবস্থাটি একবার মিলিয়ে দেখুন:\n\n`ESTABLISHED → FIN_WAIT_1 → FIN_WAIT_2 → TIME_WAIT → CLOSED`\n\nএতগুলো অবস্থা কেবল **বিদায় নেওয়ার** জন্য! কিন্তু প্রতিটি অবস্থার পেছনে একটি নির্দিষ্ট প্রশ্ন আছে: "যদি এই Packet-টি হারিয়ে যায়, তখন কী হবে?"\n\nTCP-র পুরো নকশাটাই এই এক প্রশ্নের চারপাশে গড়া। অবিশ্বস্ত একটি network-এর উপরে বিশ্বাসযোগ্যতা তৈরি করতে হলে প্রতিটি সম্ভাব্য ব্যর্থতার উত্তর আগে থেকে ভেবে রাখতে হয়।',
      apply: function(st){
        setState(st, 'CLOSED', 'CLOSED');
        st.banner = 'দুই পাশেই CLOSED';
      }
    });

    return steps;
  }
};

})(window.NetLab);
