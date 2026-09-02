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
├── build.sh              ← ./build.sh  বা  ./build.sh --watch
├── build.py              ← আসল build + verification logic
└── src/
    ├── head.html         ← <head>, topbar, sidebar-এর খোলস
    ├── style.css         ← সব CSS (theme token, layout, component)
    ├── app.js            ← সব JS (sidebar, search, stepper, calculator…)
    ├── tail.html         ← search modal + closing tag
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

## Requirements

- পড়তে: যেকোনো আধুনিক browser।
- Build করতে: Python 3 (কোনো package লাগে না)।
