/* ═══════════════════════════════════════════════════════════════════
   LAB · Subnet Calculator
   ───────────────────────────────────────────────────────────────────
   এই lab-টি step-ভিত্তিক নয় — এটি interactive। তাই এখানে script()
   ছোট, আর আসল কাজটা করে panel() — user যা টাইপ করে তার হিসাব।
   ═══════════════════════════════════════════════════════════════════ */
(function(NS){
"use strict";
var N = NS.net;

/* CIDR অনুযায়ী কোন bit network আর কোনটি host — রঙ দিয়ে দেখানোর জন্য */
function splitBits(ipStr, cidr){
  var b = N.bits(ipStr).replace(/\./g, '');
  return { net: b.slice(0, cidr), host: b.slice(cidr) };
}

NS.labs.subnet = {
  id: 'subnet',
  title: 'Subnet Calculator',
  group: 'Phase 2 · Layer 3',
  chapter: 'ch10',
  blurb: 'একটি IP আর একটি CIDR দিন — Network, Broadcast, Host range সব বেরিয়ে আসবে, প্রতিটির পাশে কেন সেটা তাই তার ব্যাখ্যাসহ।',

  learn: [
    'CIDR সংখ্যাটা আসলে কী গোনে',
    'Network Address আর Broadcast Address কেন host হিসেবে ব্যবহার করা যায় না',
    'ব্যবহারযোগ্য host সংখ্যা কেন মোটের চেয়ে ২ কম',
    '/24 থেকে /25-এ গেলে network কীভাবে দুই ভাগ হয়ে যায়'
  ],

  mistakes: [
    { m:'/24 মানে ২৫৬টি device যুক্ত করা যাবে।',
      r:'মোট address ২৫৬টি, কিন্তু ব্যবহারযোগ্য ২৫৪টি। প্রথমটি Network Address (পুরো network-কে বোঝায়) আর শেষটি Broadcast Address (সবাইকে বোঝায়) — এই দুটি কোনো নির্দিষ্ট device-কে দেওয়া যায় না।' },
    { m:'CIDR সংখ্যা যত বড়, network তত বড়।',
      r:'ঠিক উল্টো। CIDR গোনে network অংশের bit — বেশি bit network-এ গেলে host-এর জন্য কম bit বাকি থাকে। তাই `/24`-এ ২৫৪টি host, কিন্তু `/26`-এ মাত্র ৬২টি।' }
  ],

  controls: [
    { key:'ip', type:'text', label:'IP Address', def:'192.168.1.10',
      help:'যেকোনো IPv4 address লিখুন।' },
    { key:'cidr', type:'range', label:'CIDR', def:24, min:0, max:32,
      help:'Slider সরিয়ে দেখুন network-এর আকার কীভাবে বদলায়।' }
  ],

  /* Canvas-এর বদলে এই lab নিজের হিসাবের ফলাফল দেখায় */
  panel: function(cfg){
    var cidr = parseInt(cfg.cidr, 10);
    var r = N.subnet(cfg.ip, cidr);
    if(r.err) return { err: r.err };

    var sp = splitBits(r.ip, cidr);
    var rows = [
      ['Network Address', r.network + '/' + cidr,
       'পুরো network-টিকে বোঝায়। কোনো device-কে এই address দেওয়া যায় না।'],
      ['Broadcast Address', r.broadcast,
       'এই network-এর সবার উদ্দেশ্যে পাঠানোর address। এটিও কোনো device পায় না।'],
      ['First Host', r.first,
       'প্রথম যে address কোনো device-কে দেওয়া যায়।'],
      ['Last Host', r.last,
       'শেষ যে address কোনো device-কে দেওয়া যায়।'],
      ['Subnet Mask', r.mask,
       'CIDR /' + cidr + '-এর dotted-decimal রূপ। বাঁ দিক থেকে ' + cidr + 'টি bit এক।'],
      ['Total Addresses', r.total.toLocaleString('en-US'),
       '2^(32-' + cidr + ') = ' + r.total.toLocaleString('en-US') + 'টি address এই range-এ আছে।'],
      ['Usable Hosts', r.usable.toLocaleString('en-US'),
       r.special
         ? (cidr === 32 ? 'একটিমাত্র host — এটি একটি নির্দিষ্ট address বোঝায়।'
                        : '/31 বিশেষ ক্ষেত্র — দুটি router-এর মাঝের link-এ ব্যবহার হয় (RFC 3021)।')
         : 'মোট থেকে Network আর Broadcast — এই ২টি বাদ দিয়ে ' + r.usable.toLocaleString('en-US') + 'টি।']
    ];
    return { r:r, rows:rows, bits:sp, cidr:cidr };
  },

  build: function(cfg){
    return { devices: [], links: [], hub: null, wire: null, banner: null, calc: true };
  },

  script: function(s0, cfg){
    var cidr = parseInt(cfg.cidr, 10);
    var r = N.subnet(cfg.ip, cidr);
    if(r.err){
      return [{
        t:1, actor:'calc', layer:'L3', kind:'error',
        title:'Input টি সঠিক নয়',
        what: r.err,
        why :'একটি IPv4 address চারটি অংশে লেখা হয়, প্রতিটি ০ থেকে ২৫৫-এর মধ্যে। যেমন `192.168.1.10`।',
        apply: function(st){ st.banner = 'ভুল input'; }
      }];
    }

    return [
      { t:1, actor:'calc', layer:'L3', kind:'info',
        title:'CIDR /' + cidr + ' মানে কী',
        what:'`/' + cidr + '` মানে address-এর প্রথম **' + cidr + 'টি bit** network অংশ, বাকি **' + (32 - cidr) + 'টি bit** host অংশ।',
        why :'`' + r.ip + '` = `' + N.bits(r.ip) + '`\n\nবাঁ দিক থেকে ' + cidr + 'টি bit যাদের একই, তারা সবাই একই network-এ। বাকি ' + (32 - cidr) + 'টি bit বদলে বদলে ওই network-এর ভেতরের আলাদা আলাদা device হয়।',
        apply: function(st){ st.banner = '/' + cidr + ' → ' + cidr + ' bit network'; } },

      { t:2, actor:'calc', layer:'L3', kind:'ok',
        title:'Network Address বের করা',
        what:'Host অংশের সব bit **শূন্য** করে দিলে পাওয়া যায় Network Address — `' + r.network + '`।',
        why :'এটি কোনো নির্দিষ্ট device নয়, বরং পুরো network-টির নাম। Routing Table-এ ঠিক এই রূপেই লেখা হয়: `' + r.network + '/' + cidr + '`।',
        apply: function(st){ st.banner = 'Network: ' + r.network; } },

      { t:3, actor:'calc', layer:'L3', kind:'ok',
        title:'Broadcast Address বের করা',
        what:'Host অংশের সব bit **এক** করে দিলে পাওয়া যায় Broadcast Address — `' + r.broadcast + '`।',
        why :'এই address-এ পাঠালে ওই network-এর প্রতিটি device Packet-টি পায়। তাই এটিও কোনো একক device-কে দেওয়া যায় না।',
        apply: function(st){ st.banner = 'Broadcast: ' + r.broadcast; } },

      { t:4, actor:'calc', layer:'L3', kind: r.special ? 'warn' : 'ok',
        title:'ব্যবহারযোগ্য host কতগুলো',
        what: r.special
          ? '/' + cidr + ' একটি বিশেষ ক্ষেত্র — এখানে স্বাভাবিক host range-এর নিয়ম খাটে না। ব্যবহারযোগ্য: **' + r.usable + '**।'
          : 'মোট `' + r.total.toLocaleString('en-US') + '`টি address, কিন্তু ব্যবহারযোগ্য **`' + r.usable.toLocaleString('en-US') + '`**টি — `' + r.first + '` থেকে `' + r.last + '` পর্যন্ত।',
        why : r.special
          ? (cidr === 32
              ? '`/32` মানে একটিমাত্র address — সাধারণত একটি নির্দিষ্ট host বোঝাতে ব্যবহার হয়।'
              : '`/31`-এ Network আর Broadcast বাদ দিলে কিছুই থাকত না। তাই RFC 3021 অনুযায়ী দুটি router-এর মাঝের point-to-point link-এ দুটি address-ই ব্যবহার করা হয়।')
          : 'দুটি address সবসময় সংরক্ষিত — শুরুরটি Network Address, শেষেরটি Broadcast Address। তাই ব্যবহারযোগ্য সংখ্যা সবসময় মোটের চেয়ে ২ কম।\n\nএজন্যই `/24`-এ ২৫৬ নয়, **২৫৪**টি device বসানো যায়।',
        apply: function(st){ st.banner = r.usable.toLocaleString('en-US') + 'টি usable host'; } }
    ];
  }
};

})(window.NetLab);
