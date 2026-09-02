# Networking Fundamentals

**A Software Engineer's Mental Model of Computer Networks**
*From Packets and IP to TCP, DNS, HTTP, TLS, and the Internet*

বাংলায় লেখা একটি networking textbook — ১৬টি part, ৫০টি chapter, software
engineer-এর দৃষ্টিকোণ থেকে। লক্ষ্য memorization নয়, **mental model**।

---

## পড়তে চাইলে

`index.html` double-click করুন। ব্যস।

ফাইলটি সম্পূর্ণ self-contained — কোনো internet লাগে না, কোনো external
dependency নেই, কোনো build step লাগে না। যে কাউকে শুধু এই একটি ফাইল
পাঠিয়ে দিলেই সে পড়তে পারবে।

## চালিয়ে দেখতে চাইলে

`simulator.html` double-click করুন — **Network Core Lab**।

বইটা যা ব্যাখ্যা করে, simulator সেটা **চোখের সামনে ঘটিয়ে দেখায়**। প্রতিটি
ধাপে Packet কোথায় যাচ্ছে, কোন device কী সিদ্ধান্ত নিচ্ছে, Frame-এর ভেতরে
কোন field-এ কী আছে — সব Bangla ব্যাখ্যাসহ।

এটিও সম্পূর্ণ self-contained, একই রকম double-click করলেই চলে।

দুটো ফাইল একে অপরের সাথে যুক্ত — বই-এর topbar-এ **🧪 Lab**, আর প্রতিটি
lab-এর নিচে *"এই concept সম্পর্কে বিস্তারিত পড়ুন →"*।

```
Book  ⟷  Simulator
```

## Edit করতে চাইলে

```bash
# 1. src/-এর ভেতরে যেটা বদলাতে চান বদলান
vim src/chapters/23-ch17.html      # TCP-র chapter

# 2. আবার build করুন
./build.sh

# অথবা — লেখার সময় নিজে নিজে rebuild হোক
./build.sh --watch
```

`./build.sh` চালালে `src/` থেকে `index.html` তৈরি হয় **এবং যাচাই করা হয়**।
কোনো সমস্যা থাকলে build ব্যর্থ হয় এবং ঠিক কোন লাইনে সমস্যা তা বলে দেয়।

> ⚠️ `index.html` সরাসরি edit করবেন না — পরের build-এ সেই পরিবর্তন
> মুছে যাবে। সবসময় `src/`-এ কাজ করুন।

---

## গঠন

```
.
├── index.html            ← generated, এটাই পড়ার ফাইল (edit করবেন না)
├── simulator.html        ← generated, এটাই simulator (edit করবেন না)
├── build.sh              ← ./build.sh  বা  ./build.sh --watch
├── build.py              ← আসল build + verification logic
├── test-sim.js           ← node test-sim.js — simulator-এর engine যাচাই
└── src/
    ├── head.html         ← <head>, topbar, sidebar-এর খোলস
    ├── style.css         ← সব CSS (theme token, layout, component)
    ├── app.js            ← সব JS (sidebar, search, stepper, calculator…)
    ├── tail.html         ← search modal + closing tag
    ├── sim/              ← Simulator (নিচে বিস্তারিত)
    └── chapters/
        ├── _order.json   ← কোন ফাইল কোন ক্রমে জোড়া লাগবে
        ├── 00-hero.html
        ├── 01-preface.html
        ├── 02-part1.html         ← Part-এর মলাট
        ├── 03-ch1.html           ← Chapter 1
        ├── …
        └── 70-onepage.html
```

`head.html`-এ `<!--INJECT:CSS-->` আর `tail.html`-এ `<!--INJECT:JS-->` —
build এখানেই `style.css` ও `app.js` বসিয়ে দেয়।

---

## নতুন chapter যোগ করা

```bash
# 1. ফাইল বানান (নামের সংখ্যাটাই ক্রম ঠিক করে)
vim src/chapters/71-ch51.html

# 2. _order.json-এ যোগ করুন (না করলেও চলবে — শেষে যুক্ত হবে,
#    তবে build একটা note দেখাবে)
vim src/chapters/_order.json

# 3. sidebar-এ দেখাতে হলে app.js-এর TOC array-তে যোগ করুন
vim src/app.js        # const TOC = [...] খুঁজুন

./build.sh
```

Chapter ফাইলের কাঠামো:

```html
<section class="chapter" id="ch51">
  <div class="ch-eyebrow">Chapter 51</div>
  <h1>শিরোনাম</h1>
  <p class="ch-lede">এক-দুই লাইনের ভূমিকা…</p>
  ...
  <div class="chnav">
    <a href="#ch50">…</a>
    <a class="nx" href="#cheatsheet">…</a>
  </div>
</section>
```

---

## Build কী কী যাচাই করে

| # | পরীক্ষা | কেন |
|---|---|---|
| 1 | `<pre>`-এর ভেতরে raw HTML tag | browser সেটাকে আসল tag ভেবে পরের content গিলে ফেলে |
| 2 | `<script>` / `<style>` জোড়া | একটাই থাকা উচিত |
| 3 | `<section> <div> <details> <table>` balance | layout ভাঙা ধরে |
| 4 | CSS brace balance | |
| 5 | প্রতিটি `#anchor` আসলেই আছে কিনা | ভাঙা chapter-nav link |
| 6 | কোনো external `http(s)://` resource নেই | self-containment রক্ষা |
| 7 | Sidebar-এর TOC-র প্রতিটি id বাস্তবে আছে | |
| 8 | Stepper-এর `data-steps` আসল ধাপের সংখ্যার সমান | warning |

১–৭ নম্বর ব্যর্থ হলে build থামে (exit 1); ৮ নম্বর শুধু warning।

---

## Component গুলো

লেখার সময় এই class গুলো ব্যবহার করতে পারেন:

| Class | কী |
|---|---|
| `.box.why` / `.tip` / `.warn` / `.note` / `.model` / `.dev` | callout box |
| `.myth` → `.m-row.m` + `.m-row.r` | MYTH / REALITY |
| `.cb` + `.cb-lang` | code block (copy button নিজে যোগ হয়) |
| `.cb.diagram` | ASCII diagram |
| `.lab` → `.lab-h` + `.lab-q` | Linux experiment |
| `.recap` → `.rt` | chapter summary |
| `details.qa` → `summary` + `.ans` | collapsible Q&A |
| `.tw` > `table` | scroll-able table |
| `.tabs` → `.tab-btns` + `.tab-pane` | tab group |
| `.stepper[data-steps=N]` → `.sp-step[data-i]` | ধাপে ধাপে ব্যাখ্যা |

---

## Simulator Roadmap — কতটুকু হয়েছে, কতটুকু বাকি

মূল পরিকল্পনায় **৩০টি lab**, ৬টি phase-এ ভাগ করা।
**সবগুলোই সম্পূর্ণ হয়েছে (১০০%)।**

```
Phase 1  ██████████████████████  5/5    ✅ সম্পূর্ণ
Phase 2  ██████████████████████  6/6    ✅ সম্পূর্ণ
Phase 3  ██████████████████████  7/7    ✅ সম্পূর্ণ
Phase 4  ██████████████████████  6/6    ✅ সম্পূর্ণ
Phase 5  ██████████████████████  5/5    ✅ সম্পূর্ণ
Phase 6  ██████████████████████  1/1    ✅ সম্পূর্ণ
─────────────────────────────────────
মোট      ██████████████████████  30/30  (১০০%)
```

| Core | অবস্থা |
|---|---|
| Engine — step / back / seek / replay, deterministic | ✅ |
| Event Timeline — click করে যেকোনো ধাপে ফেরত | ✅ |
| Packet Inspector — প্রতিটি field-এ Bangla ব্যাখ্যা | ✅ |
| Device Inspector — PC / Switch / Router / Server | ✅ |
| "এখন কী হলো? / কেন?" panel | ✅ |
| Learning System — শিখবেন / ভুল ধারণা / বই-এর link | ✅ |
| Network Canvas — device, packet, flood, layer stack | ✅ |
| Break-It Mode — নিজস্ব lab + অন্য lab-এ toggle | ✅ |
| Calculator panel — interactive lab-এর জন্য (`panel()`) | ✅ |
| IP / Subnet / LPM-এর গণিত (`core/net.js`) | ✅ |
| Prediction Mode — ঘটার আগে user predict করবে | ⬜ পরিকল্পনায় আছে |

---

### ✅ Phase 1 · Foundation + Layer 2

| # | Lab | বই |
|---|---|---|
| 1 | Packet Visualizer | `ch4` |
| 2 | Encapsulation Lab | `ch3` |
| 3 | Ethernet & MAC Lab | `ch6` |
| 4 | Switching Lab | `ch7` |
| 5 | ARP Lab | `ch8` |

### ✅ Phase 2 · Layer 3 — IP ও Routing

| # | Lab | বই |
|---|---|---|
| 6 | IP Addressing Lab | `ch11` |
| 7 | Subnet Calculator | `ch10` |
| 8 | Routing Lab | `ch12` |
| 9 | Longest Prefix Match | `ch12` |
| 10 | TTL & Traceroute | `ch14` |
| 11 | Router Hop Visualization | `ch13` |

### ✅ Phase 3 · Layer 4 — TCP / UDP

| # | Lab | বই | কী দেখায় |
|---|---|---|---|
| 12 | TCP Three-Way Handshake | `ch18` | SYN → SYN-ACK → ACK; RST বনাম নীরব drop |
| 13 | TCP Reliability | `ch19` | Fast Retransmit বনাম Timeout, duplicate ACK |
| 14 | TCP Ordering | `ch19` | Receive Buffer, Head-of-Line Blocking |
| 15 | Flow Control | `ch20` | Receive Window, Zero Window, probe |
| 16 | Connection Close & TIME_WAIT | `ch22` | চারটি Packet, half-close, RST-এর দাম |
| 17 | UDP | `ch23` | Fire-and-forget; voice আর DNS-এ ভিন্ন ফল |
| 18 | TCP vs UDP | `ch24` | একই loss-এ দুজনের আচরণ পাশাপাশি |
| 19 | Sockets & Ports | `ch16` | 4-tuple, demultiplexing, EADDRINUSE |

### ✅ Phase 4 · Application Layer

| # | Lab | বই | কী দেখায় |
|---|---|---|---|
| 20 | DNS Resolution | `ch26` | Root → TLD → Authoritative; NXDOMAIN বনাম SERVFAIL |
| 21 | DNS Cache & TTL | `ch27` | Cache hit, migration-এ পুরনো IP, ছোট TTL-এর কৌশল |
| 22 | HTTP | `ch28` | 200/301/404/500, stateless, Keep-Alive |
| 23 | TLS Handshake | `ch33` | সরলীকৃত model; তিন ধরনের certificate ব্যর্থতা |
| 24 | NAT | `ch34` | NAT table, port forwarding, অযাচিত inbound |
| 25 | Firewall | `ch35` | নিয়মের ক্রম, default DENY, DROP বনাম REJECT |

### ✅ Phase 5 · Performance ও Scale

| # | Lab | বই | কী দেখায় |
|---|---|---|---|
| 26 | Latency — দেরির চার উৎস | `ch36` | কোনটি bandwidth-নির্ভর, কোনটি পদার্থবিজ্ঞান |
| 27 | Router Queue & Loss | `ch38` | Tail Drop, Bufferbloat-এর ফাঁদ |
| 28 | CDN | `ch46` | Edge বনাম origin, cache hit/miss |
| 29 | Load Balancer | `ch47` | Round Robin, health check, sticky-র দাম |
| 30 | Break-It Mode | `ch39` | ৬ রকম ভাঙন, প্রতিটির উপসর্গ ও সরঞ্জাম |

### ✅ Phase 6 · Master Simulation

| # | Lab | বই | কী দেখায় |
|---|---|---|---|
| 31 | Full URL Journey | `ch48` | DNS → ARP → TCP → NAT → TLS → HTTP, RTT-র হিসাবসহ |

> তালিকায় ৩১টি — মূল পরিকল্পনার ৩০টির সাথে **Connection Close & TIME_WAIT**
> আলাদা lab হিসেবে যোগ হয়েছে, কারণ FIN আর TIME_WAIT handshake-এর সাথে
> একই lab-এ রাখলে দুটোই চাপা পড়ে যাচ্ছিল।

---

### যাচাই

```
./build.sh        # index.html + simulator.html তৈরি ও structural check
node test-sim.js  # 11,852 checks · 0 failures
```

`test-sim.js` শুধু "crash করে না" দেখে না — **lab যা শেখাচ্ছে তা সত্যি কিনা**
সেটাও যাচাই করে। যেমন:

- Handshake-এ `ack = ISN + 1` (SYN নিজে একটি ক্রম দখল করে)
- ফাঁক থাকলে cumulative ACK আটকে থাকে, ভরলে লাফায়
- Firewall-এ **প্রথম মিলই চূড়ান্ত** — DENY উপরে বসালে সব বন্ধ হয়ে যায়
- Bandwidth বাড়ালে propagation delay একটুও কমে না
- মৃত server load balancer থেকে একটিও request পায় না
- বাইরে যাওয়া কোনো Packet-এ private IP থাকতে পারে না
- Timeline-এর ঘড়ি সবসময় সামনে এগোয়

প্রতিটি assertion **ইচ্ছা করে কোড ভেঙে** যাচাই করা হয়েছে — অর্থাৎ নিশ্চিত
করা হয়েছে যে ভুল ঢুকলে test সত্যিই ধরতে পারে।

---

### বাকি কাজের ধরন

| কাজ | অবস্থা |
|---|---|
| Prediction Mode — ঘটার আগে option দিয়ে predict করানো | ⬜ |
| Packet Inspector-এ payload hex view | ⬜ |
| প্রতিটি lab-এ "Try it yourself" experiment | 🟡 controls আছে, আলাদা section নেই |

> Core অংশটা (engine, timeline, inspector, learning system) একবারই লেখা
> হয়েছে এবং সব lab সেটাই ব্যবহার করে — তাই নতুন lab মানে মূলত একটি
> `build()` আর একটি `script()` লেখা, পুরো UI আবার বানানো নয়।

---

## Simulator — `src/sim/`

Simulation-এর logic আর UI **আলাদা রাখা হয়েছে**। Engine DOM-এর কিছুই জানে
না, তাই সেটিকে browser ছাড়াই (`node test-sim.js`) পরীক্ষা করা যায়।

```
Simulation Engine  →  State  →  Event  →  UI  →  Visualization
```

```
src/sim/
├── shell.html          ← layout-এর খোলস
├── style.css           ← বই-এর সাথে হুবহু একই theme token
├── core/
│   ├── engine.js       ← step / back / seek, deterministic (seeded RNG)
│   ├── packet.js       ← Packet-এর গঠন + প্রতিটি field-এর Bangla ব্যাখ্যা
│   ├── net.js          ← Device, Link, IP helper
│   └── registry.js     ← কোন lab কোন ক্রমে
├── labs/               ← এক lab = এক ফাইল (৩১টি)
│   ├── packet.js  encap.js  ethernet.js  switching.js  arp.js       ← Phase 1
│   ├── ip.js  subnet.js  routing.js  lpm.js  ttl.js  hop.js         ← Phase 2
│   ├── handshake.js  reliable.js  ordering.js  flow.js  close.js
│   │   udp.js  tcpudp.js  socket.js                                 ← Phase 3
│   ├── dns.js  dnscache.js  http.js  tls.js  nat.js  firewall.js    ← Phase 4
│   ├── latency.js  queue.js  cdn.js  lb.js  breakit.js              ← Phase 5
│   └── journey.js                                                   ← Phase 6
└── ui/
    ├── canvas.js  inspector.js  timeline.js  app.js
```

### নতুন Lab যোগ করা

```js
// src/sim/labs/routing.js
(function(NS){
NS.labs.routing = {
  id:'routing', title:'Routing Lab', group:'Phase 2 · Layer 3',
  chapter:'ch12',                 // বই-এর কোন chapter
  blurb:'…', learn:['…'], mistakes:[{m:'ভুল ধারণা…', r:'সঠিক ধারণা…'}],
  controls:[{key:'x', type:'toggle', label:'…', def:false, help:'…'}],
  build:function(cfg){ return { devices:[…], links:[…], hub:null, wire:null }; },
  script:function(state, cfg, rand){
    return [{
      t:1, actor:'client', layer:'L3', kind:'info',
      title:'…',                  // timeline-এ এক লাইন
      what:'এখন কী হলো — Bangla',
      why :'কেন হলো — Bangla',
      packet: …,                  // Inspector-এ যা দেখাবে
      apply:function(st){ /* state বদলান */ }
    }];
  }
};
})(window.NetLab);
```

তারপর দুই জায়গায় নাম যোগ করুন:

```bash
vim src/sim/core/registry.js   # LAB_ORDER
vim build.py                   # SIM_JS  (load order)
./build.sh && node test-sim.js
```

`script()` একই config-এ সবসময় একই step ফেরত দিতে হবে — এলোমেলো কিছু
লাগলে `Math.random()` নয়, `script(state, cfg, rand)`-এর `rand` ব্যবহার
করুন।

### Simulator-এর build কী কী যাচাই করে

| পরীক্ষা | কেন |
|---|---|
| `<script>`/`<style>` জোড়া, CSS brace | ভাঙা output ধরে |
| external `http(s)://` resource নেই | self-containment রক্ষা |
| `$('id')` যা খোঁজে shell-এ সেটা আছে | নীরব `null` crash ধরে |
| প্রতিটি lab-এর `chapter` বই-এ আছে | ভাঙা Book↔Simulator link |
| `LAB_ORDER`-এর প্রতিটি lab আসলেই register হয় | sidebar-এ ফাঁকা entry ধরে |

`node test-sim.js` আরও যাচাই করে — determinism, rewind/replay, `seek()`,
প্রতিটি step-এ Bangla what/why, render-এ `undefined` না আসা, এবং flood
যে port দিয়ে এসেছে সেদিকে ফেরত না যাওয়া।

---

## Requirements

- পড়তে ও simulator চালাতে: যেকোনো আধুনিক browser।
- Build করতে: Python 3 (কোনো package লাগে না)।
- Simulator test চালাতে: Node.js (ঐচ্ছিক — `node test-sim.js`)।
