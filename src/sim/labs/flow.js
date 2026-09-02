/* ═══════════════════════════════════════════════════════════════════
   LAB · Flow Control — Receiver-কে ডুবতে না দেওয়া
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI_IP = '192.168.1.10', SRV_IP = '93.184.216.34';
var CLI_MAC = 'AA:AA:AA:AA:AA:AA', SRV_MAC = 'SS:SS:SS:SS:SS:SS';
var MSS = 500;          /* এক segment = ৫০০ byte */
var CAP = 2000;         /* Receiver-এর buffer মোট ২০০০ byte */

function dseg(seq, win){
  return P.make([
    P.ethernet(CLI_MAC, SRV_MAC, 'ip'),
    P.ip(CLI_IP, SRV_IP, 64, 'tcp', 40 + MSS),
    P.tcp(49152, 80, seq, 1, 'PSH, ACK', win),
    P.data(MSS + ' bytes')
  ], { label:'seq=' + seq, kind:'data', from:'client', to:'server' });
}
function ackseg(ackNo, win, label){
  return P.make([
    P.ethernet(SRV_MAC, CLI_MAC, 'ip'),
    P.ip(SRV_IP, CLI_IP, 64, 'tcp', 40),
    P.tcp(80, 49152, 1, ackNo, 'ACK', win)
  ], { label:label, kind:'ack', from:'server', to:'client' });
}

NS.labs.flow = {
  id: 'flow',
  title: 'Flow Control — Window',
  group: 'Phase 3 · Layer 4',
  chapter: 'ch20',
  blurb: 'দ্রুত sender আর ধীর receiver। Receiver নিজেই বলে দেয় "আর কত পাঠাতে পারো"।',

  learn: [
    'Receive Window কী এবং সেটি কে ঠিক করে',
    'Buffer ভরে গেলে window কীভাবে শূন্য হয়ে যায়',
    'Zero Window হলে sender কী করে — এবং deadlock কীভাবে এড়ায়',
    'Flow Control আর Congestion Control — দুটি সম্পূর্ণ ভিন্ন সমস্যা'
  ],

  mistakes: [
    { m:'Flow Control আর Congestion Control একই জিনিস।',
      r:'দুটি ভিন্ন সমস্যার সমাধান। **Flow Control** receiver-কে বাঁচায় — "তুমি আমার চেয়ে দ্রুত পাঠাচ্ছ, আমার buffer উপচে পড়বে"। **Congestion Control** network-কে বাঁচায় — "মাঝের Router গুলোর queue ভরে যাচ্ছে"। Sender আসলে দুটির মধ্যে যেটি ছোট সেটিই মেনে চলে।' },
    { m:'Window শূন্য হওয়া মানে connection নষ্ট হয়ে গেছে।',
      r:'একদমই না। Zero Window সম্পূর্ণ স্বাভাবিক — এর মানে receiver বলছে "একটু থামো, আমি এখনো আগেরগুলো পড়িনি"। Application buffer থেকে data পড়ে নিলেই window আবার খুলে যায় এবং connection যেখানে ছিল সেখান থেকেই চলতে থাকে।' },
    { m:'Window Size মানে network কত দ্রুত।',
      r:'Window Size পুরোপুরি **receiver-এর buffer-এর খালি জায়গা** — network-এর গতির সাথে এর কোনো সম্পর্ক নেই। ১ Gbps সংযোগেও receiver-এর window ছোট হলে গতি কম হবে।' }
  ],

  controls: [
    { key:'slow', type:'toggle', label:'Application ধীরে পড়ছে', def:true,
      help:'বন্ধ করলে receiver সঙ্গে সঙ্গে পড়ে নেয়, তাই window কখনো ভরে না।' }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Client (fast)', x:18, y:50, mac:CLI_MAC, ip:CLI_IP,
                         note:'পাঠাচ্ছে' }),
        N.server('server', { name:'Server (slow)', x:82, y:50, mac:SRV_MAC, ip:SRV_IP,
                             listening:[{ port:80, service:'upload', open:true }],
                             note:'buffer 0/' + CAP })
      ],
      links: [ N.link('client','server') ],
      hub:null, wire:null, banner:null,
      used: 0, cap: CAP, win: CAP
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }

    var used = 0, seq = 1;
    function win(){ return CAP - used; }
    function note(st, w){
      for(var i = 0; i < st.devices.length; i++)
        if(st.devices[i].id === 'server')
          st.devices[i].note = 'buffer ' + (CAP - w) + '/' + CAP;
    }

    steps.push({
      t:at(), actor:'server', layer:'L4', kind:'info',
      title:'Server জানাল — window ' + CAP + ' byte',
      what:'Handshake-এর সময়েই Server তার **Receive Window** জানিয়ে দিয়েছে: `window=' + CAP + '`।\n\nঅর্থাৎ "তুমি সর্বোচ্চ ' + CAP + ' byte পাঠাতে পারো ACK-এর অপেক্ষা না করে।"',
      why :'এই সংখ্যাটি Server-এর **buffer-এ কত জায়গা খালি** তা-ই বলে। এর সাথে network-এর গতির কোনো সম্পর্ক নেই।\n\nWindow ছাড়া কী হতো? Client যতটা দ্রুত পারে পাঠাত। Server-এর buffer ভরে গেলে বাকি data ফেলে দিতে হতো, তারপর সেগুলো আবার পাঠাতে হতো — অকারণে network-এর অপচয়।\n\nWindow থাকায় সমস্যাটা আগেই ঠেকানো যায় — Client প্রয়োজনের বেশি পাঠায়ই না।',
      apply: function(st){ st.win = CAP; st.used = 0; st.banner = 'window ' + CAP; }
    });

    /* ── window ভরে যাওয়া পর্যন্ত segment পাঠানো ── */
    var n = CAP / MSS;
    for(var i = 0; i < n; i++){
      (function(idx){
        var thisSeq = seq;
        seq += MSS;
        var p = dseg(thisSeq, 64240);
        var remainBefore = win();
        used += MSS;
        var remainAfter = win();

        steps.push({
          t:at(), actor:'client', layer:'L4', kind: remainAfter === 0 ? 'warn' : 'info',
          title:'Segment পাঠানো — seq=' + thisSeq + ' (window বাকি ' + remainAfter + ')',
          packet:p,
          what:'Client ' + MSS + ' byte পাঠাল। Window-এ জায়গা ছিল ' + remainBefore +
               ', এখন বাকি **' + remainAfter + '**।',
          why : cfg.slow
            ? 'Server-এর application এখনো এই data পড়েনি — সেগুলো buffer-এই জমে থাকছে। তাই খালি জায়গা কমছে।\n\nClient প্রতিটি segment পাঠানোর পর নিজের হিসাব রাখে: "আর কত byte পাঠাতে পারি?" এই হিসাবটাই flow control।'
            : 'Server-এর application দ্রুত পড়ে নিচ্ছে, তাই buffer আসলে বেশি ভরছে না। তবু Client পাঠানোর সময় ধরে নেয় জায়গা কমছে — নিশ্চিত হওয়ার জন্য পরের ACK-এর window দেখতে হবে।',
          apply: function(st){
            st.wire = { pkt:p, from:'client', to:'server' };
            st.used = CAP - remainAfter;
            st.win = remainAfter;
            note(st, remainAfter);
            st.banner = 'পাঠানো ' + MSS + 'B · window বাকি ' + remainAfter;
          }
        });

        /* Application দ্রুত পড়লে buffer খালি হয়ে যাচ্ছে */
        if(!cfg.slow){
          used -= MSS;
          var w = win();
          var a = ackseg(thisSeq + MSS, w, 'ACK win=' + w);
          steps.push({
            t:at(), actor:'server', layer:'L4', kind:'ok',
            title:'ACK — window আবার পুরো ' + w, packet:a,
            what:'Application সঙ্গে সঙ্গে data পড়ে নিল, তাই buffer আবার খালি। Server জানাল `window=' + w + '`।',
            why :'Receiver যখন sender-এর সমান বা বেশি দ্রুত, তখন flow control কার্যত অদৃশ্য থাকে — window কখনো ছোট হয় না, sender কখনো থামে না।\n\nএই ব্যবস্থাটি তখনই দৃশ্যমান হয় যখন দুই পাশের গতিতে অমিল তৈরি হয়। `Application ধীরে পড়ছে` চালু করে দেখুন।',
            apply: function(st){
              st.wire = { pkt:a, from:'server', to:'client' };
              st.used = 0; st.win = w; note(st, w);
              st.banner = 'ACK · window ' + w;
            }
          });
        }
      })(i);
    }

    if(!cfg.slow){
      steps.push({
        t:at(), actor:'client', layer:'L4', kind:'ok',
        title:'পুরো ' + CAP + ' byte নির্বিঘ্নে গেল',
        what:'Receiver তাল মিলিয়ে পড়তে পারায় window কখনো ছোট হয়নি। Client কখনো থামেনি।',
        why :'এটাই কাম্য অবস্থা। Flow control একটি **নিরাপত্তা ব্যবস্থা** — সাধারণ সময়ে সে চুপচাপ থাকে, বিপদ হলে হস্তক্ষেপ করে।\n\nএখন `Application ধীরে পড়ছে` চালু করে দেখুন — receiver পিছিয়ে পড়লে সে কীভাবে sender-কে থামায়।',
        apply: function(st){ st.wire = null; st.banner = 'সম্পন্ন · window কখনো ভরেনি'; }
      });
      return steps;
    }

    /* ── Zero Window ── */
    var z = ackseg(seq, 0, 'ACK win=0');
    steps.push({
      t:at(), actor:'server', layer:'L4', kind:'error',
      title:'Zero Window — "আর পাঠিও না"', packet:z,
      what:'Buffer পুরো ভরে গেছে (' + CAP + '/' + CAP + ')। Server ACK পাঠাল ঠিকই, কিন্তু তাতে লেখা `window=0`।\n\nএর মানে সাফ — **এখন আর একটি byte-ও পাঠিও না**।',
      why :'লক্ষ্য করুন Server কিন্তু কোনো data ফেলে দেয়নি। সে সব পেয়েছে, ACK-ও দিয়েছে। শুধু বলছে "এখন থামো"।\n\nএটাই flow control-এর সৌন্দর্য — সমস্যা **ঘটার আগেই** ঠেকানো। Packet ফেলে দিয়ে তারপর আবার পাঠানোর চেয়ে আগেই থামিয়ে দেওয়া অনেক সস্তা।\n\nএখানে আসল অপরাধী network নয়, Server-এর **application**। সে socket থেকে যথেষ্ট দ্রুত পড়ছে না। হয়তো ব্যস্ত, হয়তো disk-এ লিখছে, হয়তো ধীর।',
      apply: function(st){
        st.wire = { pkt:z, from:'server', to:'client' };
        st.win = 0; st.used = CAP; note(st, 0);
        st.banner = 'window = 0 — sender থেমে গেল';
      }
    });

    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'warn',
      title:'Client থেমে গেল',
      what:'Client পাঠানো বন্ধ করে দিল। তার কাছে আরও data আছে, কিন্তু পাঠাতে পারছে না।',
      why :'এখানে একটি সূক্ষ্ম বিপদ লুকিয়ে আছে।\n\nClient অপেক্ষা করছে Server-এর নতুন window খোলার খবরের জন্য। কিন্তু সেই খবরটি আসবে একটি ACK-এর মাধ্যমে। আর Server ACK পাঠায় সাধারণত **data পেলে**। Client তো data পাঠাচ্ছে না।\n\nদুজনেই অপেক্ষা করছে অন্যজনের জন্য — এটিই **deadlock**। পরের ধাপে দেখুন TCP কীভাবে এটি এড়ায়।',
      apply: function(st){ st.wire = null; st.banner = 'sender অপেক্ষায়'; }
    });

    var probe = P.make([
      P.ethernet(CLI_MAC, SRV_MAC, 'ip'),
      P.ip(CLI_IP, SRV_IP, 64, 'tcp', 41),
      P.tcp(49152, 80, seq, 1, 'ACK', 64240),
      P.data('1 byte probe')
    ], { label:'Window Probe', kind:'data', from:'client', to:'server' });

    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'info',
      title:'Window Probe — মাঝে মাঝে টোকা দেওয়া', packet:probe,
      what:'Client একটি খুব ছোট Packet পাঠাল — মাত্র **১ byte**। একে বলে **Window Probe**।',
      why :'এভাবেই deadlock ভাঙা হয়। Client পুরোপুরি চুপ করে বসে থাকে না — সে মাঝে মাঝে ছোট্ট একটি Packet পাঠিয়ে জিজ্ঞেস করে "এখন জায়গা হয়েছে?"\n\nSever বাধ্য হয়ে উত্তর দেয়, আর সেই উত্তরে বর্তমান window থাকে।\n\nকেন এই ব্যবস্থা দরকার? কারণ window খোলার খবর যে ACK-টিতে ছিল সেটি নিজেই যদি পথে হারিয়ে যেত, তাহলে Client চিরকাল অপেক্ষা করত। Probe সেই ঝুঁকিটাই দূর করে দেয়।\n\nবারবার probe পাঠালে অপচয় হতো, তাই এর মাঝেও সময় বাড়ানো হয়।',
      apply: function(st){
        st.wire = { pkt:probe, from:'client', to:'server' };
        st.banner = 'Window Probe';
      }
    });

    steps.push({
      t:at(), actor:'server', layer:'L7', kind:'info',
      title:'Application অবশেষে data পড়ল',
      what:'Server-এর application buffer থেকে ' + (CAP / 2) + ' byte পড়ে নিল। এখন buffer-এ জায়গা হলো।',
      why :'এটি নিছক application-এর কাজ — TCP-র নয়। TCP শুধু হিসাব রাখে কতটুকু খালি হলো।\n\nএখান থেকেই একটি বাস্তব শিক্ষা: connection ধীর মানেই network ধীর নয়। প্রায়ই আসল কারণ থাকে receiving application-এর ধীরগতি — সে socket থেকে পড়তে দেরি করছে।\n\n`ss -tn` চালিয়ে `Recv-Q` বড় দেখলে ঠিক এই অবস্থাটাই ধরা পড়ে — data এসে গেছে, কিন্তু application তুলছে না।',
      apply: function(st){
        st.used = CAP / 2; st.win = CAP / 2; note(st, CAP / 2);
        st.banner = 'application পড়ল · ' + (CAP / 2) + 'B খালি হলো';
      }
    });

    var open = ackseg(seq + 1, CAP / 2, 'ACK win=' + (CAP / 2));
    steps.push({
      t:at(), actor:'server', layer:'L4', kind:'ok',
      title:'Window Update — window খুলল ' + (CAP / 2), packet:open,
      what:'Server একটি ACK পাঠাল `window=' + (CAP / 2) + '` নিয়ে — "আবার পাঠাতে পারো, ' + (CAP / 2) + ' byte পর্যন্ত।"',
      why :'Connection কখনো ভাঙেনি, কোনো data হারায়নি, কোনো error হয়নি। শুধু কিছুক্ষণের জন্য থেমে ছিল।\n\nএটাই TCP-র **self-clocking** স্বভাব — sender-এর গতি receiver-এর গতির সাথে নিজে থেকেই মিলে যায়। কেউ আগে থেকে হিসাব করে গতি ঠিক করে দেয়নি; ব্যবস্থাটি নিজেই ভারসাম্য খুঁজে নেয়।\n\nআর মনে রাখুন — এটি **শুধু receiver-কে** বাঁচানোর ব্যবস্থা। মাঝের Router গুলোর queue ভরে গেলে এই window কিছুই টের পায় না। সেটি সামলায় Congestion Control, একটি সম্পূর্ণ আলাদা ব্যবস্থা। Sender আসলে দুটির মধ্যে **যেটি ছোট** সেই সীমাই মেনে চলে।',
      apply: function(st){
        st.wire = { pkt:open, from:'server', to:'client' };
        st.win = CAP / 2;
        st.banner = 'window খুলল ' + (CAP / 2) + ' — আবার চলছে';
      }
    });

    return steps;
  }
};

})(window.NetLab);
