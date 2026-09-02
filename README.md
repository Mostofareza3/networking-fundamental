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
├── labs/               ← এক lab = এক ফাইল
│   ├── packet.js  encap.js  ethernet.js  switching.js  arp.js
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
