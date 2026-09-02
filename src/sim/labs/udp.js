/* ═══════════════════════════════════════════════════════════════════
   LAB · UDP — যখন "না পাঠানোই" ভালো
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net, P = NS.pkt;

var CLI_IP = '192.168.1.10', SRV_IP = '10.0.0.50';
var CLI_MAC = 'AA:AA:AA:AA:AA:AA', SRV_MAC = 'SS:SS:SS:SS:SS:SS';

/* UDP header মাত্র ৮ byte — TCP-র ২০-এর বিপরীতে */
function udpHdr(sp, dp, len){
  return {
    name:'UDP Header', layer:'L4', size:8,
    fields:[ ['srcPort', String(sp)], ['dstPort', String(dp)],
             ['ipLen', String(len + 8) + ' bytes'],
             ['fcs', 'checksum — নষ্ট হয়েছে কিনা তা ধরে, কিন্তু ঠিক করে না'] ]
  };
}
function dgram(n, sp, dp, text, lost){
  return P.make([
    P.ethernet(CLI_MAC, SRV_MAC, 'ip'),
    P.ip(CLI_IP, SRV_IP, 64, 'udp', 28 + text.length),
    udpHdr(sp, dp, text.length),
    P.data(text)
  ], { label:'#' + n + (lost ? ' ✗' : ''), kind:'data', from:'client', to:'server' });
}

NS.labs.udp = {
  id: 'udp',
  title: 'UDP — Fire and Forget',
  group: 'Phase 3 · Layer 4',
  chapter: 'ch23',
  blurb: 'কোনো handshake নেই, কোনো ACK নেই, কোনো ক্রম নেই। এবং সেটাই অনেক সময় ঠিক সিদ্ধান্ত।',

  learn: [
    'UDP ঠিক কী দেয় — এবং কী দেয় না',
    'Datagram আর byte-stream-এর পার্থক্য কোথায়',
    'Packet হারালে UDP কী করে (উত্তর: কিছুই না) এবং কেন সেটি কখনো কখনো ভালো',
    'কোন কাজে UDP আসলেই TCP-র চেয়ে ভালো'
  ],

  mistakes: [
    { m:'UDP মানে "অবিশ্বস্ত", তাই এটি নিম্নমানের বা অসম্পূর্ণ protocol।',
      r:'"Unreliable" এখানে গালি নয়, একটি **নকশার সিদ্ধান্ত**। UDP প্রতিশ্রুতি দেয় না, তাই সে কখনো আপনাকে অপেক্ষা করায় না। যেখানে দেরির চেয়ে হারানো কম ক্ষতিকর — voice call, live video, game — সেখানে এটিই সঠিক বাছাই।' },
    { m:'UDP-তে কোনো error detection নেই।',
      r:'UDP-তে **checksum আছে** — নষ্ট হয়ে যাওয়া datagram ধরা পড়ে এবং ফেলে দেওয়া হয়। যা নেই তা হলো **recovery** — সে ফেলে দেয়, কিন্তু আবার চায় না। "ধরতে পারা" আর "ঠিক করা" এক জিনিস নয়।' },
    { m:'UDP সবসময় TCP-র চেয়ে দ্রুত।',
      r:'একটি datagram একটি segment-এর চেয়ে দ্রুত ভ্রমণ করে না — একই network, একই গতি। UDP দ্রুত মনে হয় কারণ সে **অপেক্ষা করে না** — handshake নেই, হারানো Packet-এর জন্য থামে না, ক্রম মেলাতে buffer-এ বসে থাকে না।' }
  ],

  controls: [
    { key:'loss', type:'toggle', label:'একটি datagram হারিয়ে যাক', def:true,
      help:'হারালে UDP কী করে — এই প্রশ্নের উত্তরই এই lab-এর মূল কথা।' },
    { key:'app', type:'choice', label:'কোন application', def:'voice',
      options:[ ['voice','Voice Call — এক টুকরো শব্দ'],
                ['dns','DNS Query — একটি ছোট প্রশ্ন'] ] }
  ],

  build: function(cfg){
    var isDns = cfg && cfg.app === 'dns';
    return {
      devices: [
        N.pc('client', { name:'Client', x:18, y:50, mac:CLI_MAC, ip:CLI_IP }),
        N.server('server', { name: isDns ? 'DNS Server' : 'Voice Server',
                             x:82, y:50, mac:SRV_MAC, ip:SRV_IP,
                             listening:[{ port: isDns ? 53 : 5004,
                                          service: isDns ? 'DNS' : 'RTP', open:true }] })
      ],
      links: [ N.link('client','server') ],
      hub:null, wire:null, banner:null,
      sent:0, got:0, dropped:0
    };
  },

  script: function(s0, cfg){
    P.resetIds();
    var steps = [], t = 0;
    function at(){ return ++t; }
    var isDns = cfg.app === 'dns';
    var DP = isDns ? 53 : 5004, SP = 49152;

    steps.push({
      t:at(), actor:'client', layer:'L4', kind:'info',
      title:'কোনো handshake নেই — সরাসরি পাঠানো',
      what:'TCP হলে এখানে তিনটি Packet খরচ করে handshake করতে হতো। UDP-তে সেটির প্রয়োজনই নেই — প্রথম datagram-ই আসল data নিয়ে যাবে।',
      why : isDns
        ? 'একটি DNS query মাত্র কয়েক ডজন byte, উত্তরও তাই। এর জন্য তিনটি handshake Packet খরচ করা মানে **কাজের চেয়ে আনুষ্ঠানিকতা বেশি**।\n\nআর DNS-এর নিজস্ব একটি সহজ ব্যবস্থা আছে — উত্তর না এলে সে আবার জিজ্ঞেস করে। এইটুকুর জন্য TCP-র পুরো ব্যবস্থার দরকার নেই।'
        : 'Voice call-এ প্রতিটি মিলিসেকেন্ড দামি। Handshake-এর এক RTT মানে কথা শুরু হতে দেরি।\n\nআরও বড় কথা — TCP-র reliability এখানে **উল্টো ক্ষতি** করত। কেন, সেটি একটু পরেই দেখা যাবে।',
      apply: function(st){ st.banner = 'handshake ছাড়াই শুরু'; }
    });

    /* চারটি datagram; loss চালু থাকলে দ্বিতীয়টি হারাবে */
    var texts = isDns
      ? ['Q: example.com A?', 'Q: example.com A? (retry)', 'A: 93.184.216.34', 'done']
      : ['audio 0-20ms', 'audio 20-40ms', 'audio 40-60ms', 'audio 60-80ms'];
    var lostIdx = cfg.loss ? 1 : -1;

    for(var i = 0; i < 4; i++){
      (function(idx){
        var lost = idx === lostIdx;
        var p = dgram(idx + 1, SP, DP, texts[idx], lost);
        steps.push({
          t:at(), actor:'client', layer:'L4', kind: lost ? 'warn' : 'info',
          title:'Datagram #' + (idx + 1) + ' পাঠানো হলো' + (lost ? ' — হারিয়ে গেল' : ''),
          packet:p,
          what:'`' + texts[idx] + '` পাঠানো হলো।' +
               (lost ? '\n\n**পথে হারিয়ে গেল।** কোনো Router-এর queue ভরে গিয়েছিল।' : ''),
          why : lost
            ? 'এবার মূল প্রশ্ন — Client কি টের পেল?\n\n**না।** সে কোনো ACK আশা করছিল না, কোনো timer বসায়নি, কোনো হিসাব রাখেনি। তার কাছে এই datagram-টি পাঠানোর পরেই স্মৃতি থেকে মুছে গেছে।\n\nএটাই "fire and forget" — পাঠাও এবং ভুলে যাও।'
            : 'UDP header মাত্র **৮ byte** — source port, destination port, length, checksum। ব্যস।\n\nTCP-র ২০ byte-এ থাকে sequence number, ACK number, window, flag — এসব লাগে হিসাব রাখার জন্য। UDP হিসাব রাখে না, তাই জায়গাও লাগে না।\n\nHeader-এর এই ছোট আকারটাই আসলে পুরো দর্শনটির প্রতীক।',
          apply: function(st){
            st.wire = { pkt:p, from:'client', to:'server' };
            st.sent = st.sent + 1;
            if(lost) st.dropped = st.dropped + 1; else st.got = st.got + 1;
            st.banner = '#' + (idx + 1) + (lost ? ' হারাল' : ' পৌঁছাল');
          }
        });
      })(i);
    }

    steps.push({
      t:at(), actor:'client', layer:'L4', kind: cfg.loss ? 'warn' : 'ok',
      title: cfg.loss ? 'কোনো retransmission নেই' : 'চারটিই পৌঁছেছে',
      what: cfg.loss
        ? 'Client পরেরগুলো পাঠিয়েই গেছে। হারানো #২ নিয়ে সে কিছুই করেনি — কোনো duplicate ACK নেই, কোনো timeout নেই, কোনো retransmit নেই।'
        : 'কোনো ACK ছাড়াই চারটি datagram পৌঁছে গেল। কোনো অপেক্ষা হয়নি।',
      why : cfg.loss
        ? 'TCP হলে এখানে থেমে যেত — হারানো segment আবার পাঠাত, আর সেটি না পৌঁছানো পর্যন্ত পরের data application-কে দিত না (Head-of-Line Blocking)।\n\nUDP তার কিছুই করেনি। ভালো না খারাপ, সেটি নির্ভর করে application কী চায় তার উপর।'
        : 'হারানো না ঘটলে UDP-র সরলতা সম্পূর্ণ লাভ। কোনো অপচয় নেই।\n\nএবার `একটি datagram হারিয়ে যাক` চালু করে দেখুন — হারালে কী হয়, আর সেটি কার জন্য সমস্যা।',
      apply: function(st){ st.wire = null; st.banner = cfg.loss ? '#2 চিরতরে হারাল' : 'সব পৌঁছেছে'; }
    });

    if(cfg.loss){
      steps.push({
        t:at(), actor:'server', layer:'L7', kind: isDns ? 'ok' : 'warn',
        title: isDns ? 'DNS নিজেই আবার জিজ্ঞেস করল' : 'Voice — ২০ মিলিসেকেন্ড শব্দ হারাল',
        what: isDns
          ? 'উত্তর না পেয়ে DNS client কিছুক্ষণ পর **নিজেই** আবার query পাঠাল। এটি UDP করেনি — করেছে DNS নিজে।'
          : 'শ্রোতা ২০ মিলিসেকেন্ডের একটি ছোট্ট ফাঁক শুনল — সামান্য একটু খচখচ শব্দ, ব্যস।',
        why : isDns
          ? 'এখানে একটি গুরুত্বপূর্ণ কথা: reliability একেবারে অদৃশ্য হয়ে যায় না — সে শুধু **অন্য স্তরে সরে যায়**।\n\nDNS নিজের প্রয়োজন মতো একটি সহজ retry বসিয়ে নিয়েছে: উত্তর না এলে আবার জিজ্ঞেস করো। এটুকুই তার দরকার।\n\nTCP ব্যবহার করলে সে পেত sequence number, window, congestion control — যার একটিও একটি প্রশ্ন-উত্তরের জন্য দরকার ছিল না।\n\nএজন্যই বলা হয় UDP আসলে একটি **ভিত্তি** — যার উপর application নিজের প্রয়োজন মতো ঠিক ততটুকু ব্যবস্থা গড়ে নেয়, তার বেশি নয়।'
          : '**এখানেই UDP বাছার আসল কারণ।**\n\nভাবুন TCP ব্যবহার করলে কী হতো। সে হারানো টুকরোটি আবার চাইত, আর সেটি না আসা পর্যন্ত পরের সব শব্দ **আটকে রাখত**।\n\nফলে ২০ms-এর ফাঁকের বদলে শ্রোতা পেত কয়েকশো মিলিসেকেন্ডের একটি নীরবতা, তারপর হঠাৎ সব শব্দ একসাথে — কথোপকথন অসম্ভব হয়ে যেত।\n\nআর সবচেয়ে বড় কথা: **ওই ২০ms শব্দ ততক্ষণে অপ্রাসঙ্গিক**। যে মুহূর্তে সেটি বাজার কথা ছিল সেটি পেরিয়ে গেছে। দেরিতে আসা শব্দ আর কোনো কাজেই লাগে না।\n\nতাই এখানে হারানোই ভালো। "না পাঠানো" এখানে একটি সঠিক সিদ্ধান্ত।',
        apply: function(st){
          st.banner = isDns ? 'DNS নিজে retry করল' : '20ms ফাঁক — কথা চলতেই থাকল';
        }
      });
    }

    steps.push({
      t:at(), actor:'server', layer:'L4', kind:'ok',
      title:'Datagram-এর সীমানা অক্ষত থাকে',
      what:'Server ঠিক যতগুলো datagram পৌঁছেছে, ততগুলো আলাদা টুকরো হিসেবেই পেল। একটি ' + (isDns ? 'query' : 'audio টুকরো') + ' পাঠালে সে ঠিক একটিই পড়ে।',
      why :'এটি TCP-র সাথে একটি সূক্ষ্ম কিন্তু বড় পার্থক্য।\n\nTCP একটি **byte-stream** — সীমানা বলে কিছু নেই। আপনি তিনবার `write()` করলে receiver একবারেই সবটুকু পড়তে পারে, অথবা এক `write()`-এর অংশ দুবারে পেতে পারে। তাই TCP-তে আপনাকে নিজেই বার্তার সীমানা ঠিক করতে হয় — দৈর্ঘ্য লিখে দিয়ে, বা বিশেষ চিহ্ন দিয়ে।\n\nUDP একটি **datagram** protocol — এক `send()` মানে ঠিক এক `recv()`। সীমানা নিজেই রক্ষিত।\n\nএই সুবিধাটির কথা প্রায়ই ভুলে যাওয়া হয়। যেসব বার্তার নিজস্ব সীমানা আছে (একটি DNS query, একটি log line, একটি metric), তাদের জন্য এটি খুব স্বাভাবিক একটি মিল।',
      apply: function(st){ st.wire = null; st.banner = 'datagram সীমানা অক্ষত'; }
    });

    return steps;
  }
};

})(window.NetLab);
