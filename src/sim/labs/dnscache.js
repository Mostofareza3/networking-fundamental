/* ═══════════════════════════════════════════════════════════════════
   LAB · DNS Cache & TTL — দ্রুততার দাম
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI_IP = '192.168.1.10', CLI_MAC = 'AA:AA:AA:AA:AA:AA';
var NAME = 'www.example.com', OLD_IP = '93.184.216.34', NEW_IP = '93.184.216.99';

function dnsPkt(src, dst, label, answer, from, to, kind){
  return P.make([
    P.ethernet(from === 'client' ? CLI_MAC : 'RR:RR:RR:RR:RR:RR',
               from === 'client' ? 'RR:RR:RR:RR:RR:RR' : CLI_MAC, 'ip'),
    P.ip(src, dst, 64, 'udp', 76),
    { name:'UDP Header', layer:'L4', size:8,
      fields:[ ['srcPort', from === 'client' ? '49152' : '53'],
               ['dstPort', from === 'client' ? '53' : '49152'],
               ['ipLen','48 bytes'], ['fcs','checksum'] ] },
    { name:'DNS Message', layer:'L7', size:40,
      fields: answer ? [['payload','ANSWER: ' + answer]]
                     : [['payload','QNAME=' + NAME + ' QTYPE=A']] }
  ], { label:label, kind:kind || 'data', from:from, to:to });
}

NS.labs.dnscache = {
  id: 'dnscache',
  title: 'DNS Cache & TTL',
  group: 'Phase 4 · Application',
  chapter: 'ch27',
  blurb: 'Cache DNS-কে দ্রুত করে। কিন্তু IP বদলালে সেই cache-ই আপনাকে পুরনো ঠিকানায় পাঠাতে থাকে।',

  learn: [
    'কতগুলো স্তরে DNS cache হয় — এবং প্রত্যেকের আলাদা মেয়াদ',
    'TTL ঠিক কী নিয়ন্ত্রণ করে',
    'IP বদলালে propagation-এ দেরি কেন হয় — এবং সেটি আসলে কীসের দেরি',
    'Migration-এর আগে TTL কমিয়ে রাখার কৌশল'
  ],

  mistakes: [
    { m:'"DNS propagation" মানে পরিবর্তনটি পৃথিবীর সব server-এ ছড়িয়ে পড়তে সময় লাগছে।',
      r:'কিছুই "ছড়ায়" না। Authoritative server-এ পরিবর্তন হয় **সঙ্গে সঙ্গে**। দেরিটা হলো পুরনো উত্তরগুলোর **cache-এ মেয়াদ ফুরানোর অপেক্ষা**। শব্দটিই বিভ্রান্তিকর — এটি ছড়ানো নয়, ভুলে যাওয়া।' },
    { m:'DNS cache শুধু ISP-র resolver-এ থাকে।',
      r:'অন্তত চারটি স্তরে cache হয় — Browser-এর নিজের cache, OS-এর cache, Router-এর cache, তারপর Resolver-এর cache। প্রতিটির মেয়াদ আলাদা। এজন্যই সহকর্মী নতুন site দেখছেন অথচ আপনি পুরনোটাই দেখছেন।' },
    { m:'TTL কম রাখাই সবসময় ভালো।',
      r:'TTL কম মানে বেশি বেশি DNS query — বেশি ভার, প্রতিটি query-তে বাড়তি latency। স্বাভাবিক সময়ে বড় TTL (ঘণ্টা) ভালো। কিন্তু পরিকল্পিত পরিবর্তনের **আগে** TTL কমিয়ে রাখলে পরিবর্তনটি দ্রুত কার্যকর হয়।' }
  ],

  controls: [
    { key:'scene', type:'choice', label:'দৃশ্য', def:'hit',
      options:[ ['hit','Cache Hit — দ্বিতীয়বার জিজ্ঞেস'],
                ['change','IP বদলে গেল — কিন্তু cache পুরনো'],
                ['lowttl','ছোট TTL — migration-এর প্রস্তুতি'] ] }
  ],

  build: function(){
    return {
      devices: [
        N.pc('client', { name:'Browser', x:20, y:50, mac:CLI_MAC, ip:CLI_IP,
                         note:'cache খালি' }),
        N.server('res', { name:'Resolver', x:50, y:50, mac:'RR:RR:RR:RR:RR:RR',
                          ip:'8.8.8.8',
                          listening:[{ port:53, service:'DNS', open:true }],
                          note:'cache খালি' }),
        N.server('auth', { name:'Authoritative', x:82, y:50, mac:'R0:00:00:00:00:03',
                           ip:'199.43.135.53',
                           listening:[{ port:53, service:'DNS', open:true }],
                           note:'A ' + OLD_IP })
      ],
      links: [ N.link('client','res'), N.link('res','auth') ],
      hub:null, wire:null, banner:null,
      cache:null, ttl:0, authIp:OLD_IP, served:null
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var TTL = cfg.scene === 'lowttl' ? 60 : 3600;
    function note(st, id, txt){
      for(var i = 0; i < st.devices.length; i++)
        if(st.devices[i].id === id) st.devices[i].note = txt;
    }

    /* ── ১ম বার: cache miss ── */
    var q1 = dnsPkt(CLI_IP, '8.8.8.8', 'Query (1st)', null, 'client', 'res');
    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'info',
      title:'প্রথমবার জিজ্ঞেস — Cache Miss', packet:q1,
      what:'Browser `' + NAME + '` চাইল। কোথাও cache-এ নেই — না Browser-এ, না OS-এ, না Resolver-এ।',
      why :'Cache Miss মানে পুরো যাত্রাটি করতে হবে: Root → TLD → Authoritative।\n\nএটিই সবচেয়ে ধীর পথ — অন্তত তিনটি RTT। বাস্তবে এতে ১০০-৩০০ মিলিসেকেন্ড লেগে যেতে পারে।\n\nআর এই সময়টুকু page load-এর **একেবারে শুরুতে**, তাই ব্যবহারকারী সরাসরি টের পান।',
      apply: function(st){ st.wire = { pkt:q1, from:'client', to:'res' };
                           st.banner = 'cache miss — পুরো যাত্রা লাগবে'; }
    });

    var a1 = dnsPkt('199.43.135.53', '8.8.8.8', 'A ' + OLD_IP + ' TTL ' + TTL,
                    NAME + ' A ' + OLD_IP + ' (TTL ' + TTL + ')', 'res', 'client', 'ack');
    steps.push({
      t:at(), actor:'auth', layer:'L7', kind:'ok',
      title:'উত্তর এলো — TTL ' + TTL + ' সেকেন্ড', packet:a1,
      what:'Authoritative server দিল `A ' + OLD_IP + '`, TTL `' + TTL + '` সেকেন্ড।\n\nResolver এটি cache করে রাখল, Browser-ও নিজের cache-এ রাখল।',
      why : cfg.scene === 'lowttl'
        ? 'এবার TTL মাত্র **' + TTL + ' সেকেন্ড** — ইচ্ছাকৃতভাবে ছোট রাখা হয়েছে।\n\nএর মানে প্রতি মিনিটে cache-এর মেয়াদ শেষ হবে এবং আবার জিজ্ঞেস করতে হবে। বেশি query, বেশি ভার।\n\nকিন্তু এর বিনিময়ে একটি বড় সুবিধা — IP বদলালে সেটি এক মিনিটের মধ্যেই সবার কাছে পৌঁছে যাবে।'
        : 'TTL মানে "এই উত্তরটি কতক্ষণ পর্যন্ত ব্যবহার করা যাবে"। এখানে `' + TTL + '` সেকেন্ড = ' + (TTL / 60) + ' মিনিট।\n\nএই সময়টুকুতে যেই এই নামটি চাইবে, তাকে **আর জিজ্ঞেস করতে হবে না** — cache থেকেই পাবে।\n\nএখানে একটি সুন্দর ব্যাপার আছে: একজনের প্রথম প্রশ্নের ফল হাজার হাজার মানুষের কাজে লাগে, কারণ তারা সবাই একই resolver ব্যবহার করছে।',
      apply: function(st){
        st.wire = { pkt:a1, from:'res', to:'client' };
        st.cache = OLD_IP; st.ttl = TTL; st.served = OLD_IP;
        note(st, 'res', 'cached ' + TTL + 's'); note(st, 'client', OLD_IP);
        st.banner = 'cached ' + OLD_IP + ' · TTL ' + TTL;
      }
    });

    /* ── Cache Hit ── */
    if(cfg.scene === 'hit'){
      var q2 = dnsPkt(CLI_IP, '8.8.8.8', 'Query (2nd)', null, 'client', 'res');
      steps.push({
        t:at(), actor:'client', layer:'L7', kind:'ok',
        title:'দ্বিতীয়বার — Browser-এর নিজের cache-এই পাওয়া গেল', packet:q2,
        what:'Browser আবার `' + NAME + '` চাইল। এবার **কোনো Packet পাঠাতেই হলো না** — উত্তর তার নিজের cache-এই ছিল।\n\nসময় লাগল প্রায় **শূন্য**।',
        why :'প্রথম স্তরের cache-ই সবচেয়ে দ্রুত, কারণ সেখানে network স্পর্শই করতে হয় না।\n\nCache-এর স্তরগুলো ক্রমানুসারে:\n\n`Browser cache` → `OS cache` → `Router cache` → `Resolver cache` → `Authoritative`\n\nপ্রতিটি স্তর তার আগেরটির চেয়ে ধীর, কিন্তু বেশি নির্ভরযোগ্য। প্রশ্ন যত নিচে নামে, উত্তর তত তাজা — আর তত দেরি।',
        apply: function(st){ st.wire = null; st.banner = 'cache hit · ~0 ms'; }
      });
      steps.push({
        t:at(), actor:'res', layer:'L7', kind:'ok',
        title:'অন্য ব্যবহারকারীরাও দ্রুত পাচ্ছেন',
        what:'একই resolver ব্যবহার করা অন্য হাজার হাজার মানুষও এখন সঙ্গে সঙ্গে উত্তর পাচ্ছেন — যদিও তাঁরা কেউ প্রথম প্রশ্নটি করেননি।',
        why :'এই ভাগাভাগিটাই DNS-কে টিকিয়ে রেখেছে।\n\nভাবুন cache না থাকলে কী হতো — পৃথিবীর প্রতিটি click-এর জন্য `.com` TLD server-এ একটি করে query যেত। কোনো server সেই ভার নিতে পারত না।\n\nCache-এর কারণে প্রকৃত query-র সংখ্যা কয়েক হাজার গুণ কমে যায়।\n\nকিন্তু এই দ্রুততার একটি দাম আছে — পরের দৃশ্যে সেটিই দেখা যাবে।',
        apply: function(st){ st.banner = 'একজনের প্রশ্ন · সবার লাভ'; }
      });
      return steps;
    }

    /* ── IP বদলে গেল ── */
    steps.push({
      t:at(), actor:'auth', layer:'L7', kind:'warn',
      title:'Server migrate হলো — IP বদলে গেল',
      what:'`example.com`-এর মালিক নতুন server-এ চলে গেলেন। Authoritative server-এ record বদলে দেওয়া হলো:\n\n`' + OLD_IP + '` → **`' + NEW_IP + '`**\n\nএই পরিবর্তনটি হয়েছে **সঙ্গে সঙ্গে**।',
      why :'এখানে "propagation" শব্দটির ভুল ধারণাটি ভাঙা দরকার।\n\nকিছুই কোথাও **ছড়িয়ে পড়ছে না**। Authoritative server-এ পরিবর্তনটি তাৎক্ষণিক, এবং সে-ই একমাত্র সত্যের উৎস।\n\nযে দেরিটা হবে, সেটি সম্পূর্ণ ভিন্ন জিনিস — পৃথিবীজুড়ে ছড়িয়ে থাকা cache গুলোতে **পুরনো উত্তরটি এখনো বসে আছে**, এবং তাদের মেয়াদ ফুরানোর অপেক্ষা করতে হবে।\n\nএটি ছড়ানোর দেরি নয়, **ভুলে যাওয়ার** দেরি।',
      apply: function(st){
        st.authIp = NEW_IP;
        note(st, 'auth', 'A ' + NEW_IP + ' (নতুন)');
        st.banner = 'authoritative-এ নতুন IP · সঙ্গে সঙ্গে';
      }
    });

    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'error',
      title:'কিন্তু Browser এখনো পুরনো IP-তেই যাচ্ছে',
      what:'Browser আবার `' + NAME + '` চাইল। Cache-এ TTL এখনো বাকি, তাই সে **পুরনো** `' + OLD_IP + '`-ই দিল।\n\nAuthoritative server-কে জিজ্ঞেসই করা হলো না।',
      why :'এবং এটি একটি bug নয় — cache **ঠিক যা করার কথা তাই করছে**। TTL বলেছিল "' + TTL + ' সেকেন্ড ধরে রাখো", সে ধরে রেখেছে।\n\nএই কারণেই migration-এর সময় অদ্ভুত অবস্থা তৈরি হয় — কিছু ব্যবহারকারী নতুন server দেখছেন, কিছু পুরনোটা। কারও cache খালি ছিল, কারও ছিল না।\n\nএজন্যই migration-এর সময় **পুরনো server কিছুক্ষণ চালু রাখা** জরুরি। TTL সময় পার না হওয়া পর্যন্ত সেখানে traffic আসতেই থাকবে।',
      apply: function(st){
        st.served = OLD_IP;
        st.banner = 'পুরনো IP পরিবেশিত হচ্ছে · cache বৈধ';
      }
    });

    if(cfg.scene === 'lowttl'){
      steps.push({
        t:at(), actor:'res', layer:'L7', kind:'ok',
        title:'TTL মাত্র ' + TTL + 's — এক মিনিটেই মেয়াদ শেষ',
        what:'ছোট TTL হওয়ায় cache-এর মেয়াদ দ্রুত ফুরাল। Resolver আবার জিজ্ঞেস করল এবং **নতুন** IP পেল।',
        why :'এখানেই migration-এর আসল কৌশলটি:\n\n**পরিবর্তনের অন্তত এক TTL আগে** TTL কমিয়ে দিন (যেমন ৩৬০০ → ৬০)।\n\nকেন আগে? কারণ পুরনো TTL-টিও তো cache-এ বসে আছে। ৩৬০০ সেকেন্ডের TTL সহ cache করা উত্তর জানেই না যে আপনি TTL বদলেছেন — তাকে নিজের মেয়াদ শেষ করতেই হবে।\n\nতাই ক্রমটি হয়:\n\n১. TTL কমান (৩৬০০ → ৬০)\n২. অন্তত পুরনো TTL সময় অপেক্ষা করুন\n৩. এবার IP বদলান — এক মিনিটেই সবাই নতুনটা পাবে\n৪. স্থিতিশীল হলে TTL আবার বাড়িয়ে দিন\n\nএই ছোট্ট পরিকল্পনাটি migration-এর দিনটিকে অনেক শান্ত করে দেয়।',
        apply: function(st){
          st.cache = NEW_IP; st.served = NEW_IP;
          note(st, 'res', 'cached ' + NEW_IP); note(st, 'client', NEW_IP);
          st.banner = 'নতুন IP · এক মিনিটেই';
        }
      });
      return steps;
    }

    steps.push({
      t:at(), actor:'res', layer:'L7', kind:'warn',
      title:'অপেক্ষা — TTL ' + TTL + ' সেকেন্ড ফুরানোর',
      what:'Cache-এ TTL ' + TTL + ' সেকেন্ড (' + (TTL / 60) + ' মিনিট)। এই পুরো সময়টা কিছু ব্যবহারকারী পুরনো server-এই যেতে থাকবেন।',
      why :'"DNS propagation-এ ২৪-৪৮ ঘণ্টা লাগে" — এই কথাটি এখান থেকেই এসেছে, এবং এটি বহুলাংশে ভুল।\n\nআসল কথাটি হলো: **সবচেয়ে বড় TTL যতটা, ততটা সময়**। TTL এক ঘণ্টা হলে এক ঘণ্টা। ২৪ ঘণ্টা হলে ২৪ ঘণ্টা।\n\n(কিছু resolver নিয়ম না মেনে বেশিক্ষণ ধরে রাখে, তাই বাস্তবে কিছুটা বেশি সময় লাগতে পারে।)\n\nএর ব্যবহারিক ফল দুটি:\n\n• পুরনো server তখনই বন্ধ করুন যখন TTL সময় পার হয়েছে\n• পরিকল্পিত পরিবর্তনের আগে TTL কমিয়ে রাখুন — `ছোট TTL` দৃশ্যে দেখুন কীভাবে',
      apply: function(st){ st.banner = 'অপেক্ষা · ' + TTL + 's'; }
    });

    steps.push({
      t:at(), actor:'client', layer:'L7', kind:'ok',
      title:'মেয়াদ শেষ — এবার নতুন IP',
      what:'TTL ফুরাল। পরের প্রশ্নে cache-এ কিছু নেই, তাই আবার জিজ্ঞেস করা হলো — এবং এবার এলো নতুন `' + NEW_IP + '`।',
      why :'সব cache শেষ পর্যন্ত সত্যে ফিরে আসে। শুধু নিজের নিজের সময় নেয়।\n\nএই পুরো ব্যবস্থাটি একটি সচেতন আপস: **তাজা তথ্য বনাম গতি**।\n\nTTL সেই আপসের নিয়ন্ত্রক। বড় TTL = দ্রুত ও হালকা, কিন্তু পরিবর্তনে ধীর। ছোট TTL = পরিবর্তনে দ্রুত, কিন্তু বেশি ভার।\n\nএকই আপস আরও অনেক জায়গায় দেখা যাবে — HTTP cache-এ, CDN-এ, ARP cache-এও। প্রশ্নটি সবসময় একই: "পুরনো তথ্য কতক্ষণ সহ্য করা যায়?"',
      apply: function(st){
        st.cache = NEW_IP; st.served = NEW_IP;
        note(st, 'res', 'cached ' + NEW_IP); note(st, 'client', NEW_IP);
        st.banner = 'নতুন IP · migration সম্পূর্ণ';
      }
    });

    return steps;
  }
};

})(window.NetLab);
