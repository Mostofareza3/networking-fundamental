#!/usr/bin/env node
/*
 * simulator.html-এর engine ও UI headless-এ যাচাই করে।
 *
 *     node test-sim.js          (./build.sh চালানোর পরে)
 *
 * যা পরীক্ষা করা হয়:
 *   · প্রতিটি lab-এর প্রতিটি control combination-এ step তৈরি হয়
 *   · প্রতিটি step-এ Bangla what/why এবং বৈধ layer/kind আছে
 *   · Determinism — একই config দিলে হুবহু একই শেষ state
 *   · Rewind → replay করলে আগের শেষ state-ই ফিরে আসে
 *   · seek(n) আর n+1 বার step() একই state দেয়
 *   · Canvas / Timeline / Inspector কোথাও throw করে না, "undefined" ছাপে না
 *   · প্রতিটি packet field-এর Bangla ব্যাখ্যা আছে
 *   · Broadcast flood যে port দিয়ে ঢুকেছে সেদিকে ফেরত যায় না
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SIM = path.join(__dirname, 'simulator.html');
if (!fs.existsSync(SIM)) {
  console.error('simulator.html নেই — আগে ./build.sh চালান');
  process.exit(1);
}
const js = fs.readFileSync(SIM, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];

/* ── browser ছাড়া চালানোর জন্য ন্যূনতম DOM ── */
const els = {};
function mkEl(id){
  const listeners = {};
  return { id, innerHTML:'', textContent:'', disabled:false, value:'1200',
    classList:{toggle(){},remove(){},add(){},contains(){return false}},
    addEventListener(ev, fn){ (listeners[ev] = listeners[ev] || []).push(fn); },
    /* আসল UI handler চালানোর জন্য — click() করলে যা হওয়ার কথা তাই হয় */
    fire(ev, e){ for (const fn of (listeners[ev] || [])) fn(e || { target:{ closest:()=>null } }); },
    click(){ this.fire('click'); },
    querySelector(){return null}, querySelectorAll(){return []},
    getAttribute(){return null}, scrollIntoView(){}, closest(){return null} };
}
global.window = { innerWidth:1400, matchMedia:()=>({matches:false}), addEventListener(){} };
global.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
global.document = {
  readyState:'complete',
  documentElement:{ setAttribute(){}, getAttribute:()=>'dark' },
  getElementById(id){ return els[id] || (els[id] = mkEl(id)); },
  querySelectorAll(){ return []; }, addEventListener(){}
};
global.location = { hash:'' };

/* নিয়ন্ত্রণযোগ্য ঘড়ি — Play/Pause-এর আচরণ যাচাই করার জন্য।
   আগে setInterval no-op ছিল, তাই playback কখনো পরীক্ষাই হতো না। */
const clock = { timers: new Map(), next: 1 };
global.setInterval = (fn) => { const id = clock.next++; clock.timers.set(id, fn); return id; };
global.clearInterval = (id) => { clock.timers.delete(id); };
clock.tick = function(n){
  for (let i = 0; i < (n || 1); i++)
    for (const fn of Array.from(this.timers.values())) fn();
};

eval(js);
const NS = global.window.NetLab;

let fail = 0, checks = 0;
const ok = (c, m) => { checks++; if(!c){ fail++; console.log('  ✗ ' + m); } };

/* প্রতিটি control-এর প্রতিটি সম্ভাব্য মান মিলিয়ে সব combination */
function combos(lab){
  let out = [{ seed:1 }];
  for (const c of (lab.controls || [])){
    let vals;
    if (c.type === 'toggle')      vals = [true, false];
    else if (c.type === 'choice') vals = c.options.map(o => o[0]);
    /* range: প্রান্ত ও মাঝের মান — /0, /31, /32-এর মতো বিশেষ ক্ষেত্র সহ */
    else if (c.type === 'range')  vals = [c.min, 8, 16, 24, 25, 30, 31, 32, c.max]
                                    .filter((v,i,a) => v >= c.min && v <= c.max && a.indexOf(v) === i);
    /* text: বৈধ, সীমান্ত এবং অবৈধ — ভুল input-এ crash হয় কিনা দেখতে */
    else if (c.type === 'text')   vals = [c.def, '10.0.0.1', '0.0.0.0', '255.255.255.255',
                                          '999.1.1.1', 'abc', '', '192.168.1'];
    else continue;
    const next = [];
    for (const base of out) for (const v of vals) next.push(Object.assign({}, base, { [c.key]: v }));
    out = next;
  }
  return out;
}

const missingHelp = new Set();

for (const id of NS.LAB_ORDER){
  const lab = NS.labs[id];
  ok(!!lab, `lab "${id}" registered`);
  if (!lab) continue;

  ok(!!lab.chapter, `${id}: বই-এর chapter উল্লেখ আছে`);
  ok(Array.isArray(lab.learn) && lab.learn.length, `${id}: learning objective আছে`);

  let variants = 0, total = 0;
  for (const cfg of combos(lab)){
    variants++;
    const eng = new NS.Engine(lab, cfg);
    const tag = `${id} ${JSON.stringify(cfg)}`;
    ok(eng.steps.length > 0, `${tag}: step তৈরি হয়েছে`);
    total += eng.steps.length;

    for (const s of eng.steps){
      ok(!!s.title && !!s.what && !!s.why, `${tag}: "${s.title}" — title/what/why আছে`);
      ok(['L1','L2','L3','L4','L7'].includes(s.layer), `${tag}: "${s.title}" — layer বৈধ`);
      ok(['ok','warn','error','info'].includes(s.kind), `${tag}: "${s.title}" — kind বৈধ`);
    }

    /* Timeline-এর ঘড়ি সবসময় সামনে এগোবে। কোনো lab যদি step গুলো আগে
       বানিয়ে পরে মাঝখানে বসায়, তখন t এলোমেলো হয়ে যেতে পারে — পর্দায়
       তখন সময় পিছিয়ে যেতে দেখা যায়। */
    const times = eng.steps.map(s => s.t);
    ok(times.every((v, k) => k === 0 || v > times[k - 1]),
       `${tag}: timeline-এর সময় ক্রমাগত বাড়ে (${times.join(',')})`);

    while (eng.step());
    ok(eng.done(), `${tag}: শেষ পর্যন্ত পৌঁছায়`);
    const end = JSON.stringify(eng.state);

    const again = new NS.Engine(lab, cfg);
    while (again.step());
    ok(JSON.stringify(again.state) === end, `${tag}: deterministic`);

    while (eng.back());
    ok(eng.i === -1, `${tag}: শুরুতে ফেরত যায়`);
    while (eng.step());
    ok(JSON.stringify(eng.state) === end, `${tag}: replay মিলে যায়`);

    for (let n = 0; n < eng.steps.length; n++){
      const a = new NS.Engine(lab, cfg);
      for (let k = 0; k <= n; k++) a.step();
      const b = new NS.Engine(lab, cfg);
      b.seek(n);
      ok(JSON.stringify(a.state) === JSON.stringify(b.state), `${tag}: seek(${n}) মিলে যায়`);
    }

    /* ── UI render ── */
    const view = new NS.Engine(lab, cfg);
    for (let n = -1; n < view.steps.length; n++){
      if (n >= 0) view.step();
      const cur = view.current();
      const el = mkEl('c');
      try { NS.ui.canvas.render(el, view.state, { active: cur ? cur.actor : null }); }
      catch(e){ ok(false, `${tag}: canvas throw — ${e.message}`); continue; }
      ok(!/undefined/.test(el.innerHTML), `${tag}: canvas-এ "undefined" নেই (step ${n})`);

      /* actor একটি বাস্তব device হতে হবে — তবে panel()-ভিত্তিক lab-এর
         (Subnet Calculator) কোনো topology নেই, তাই সেখানে এই নিয়ম খাটে না। */
      if (cur && !lab.panel){
        const ids = view.state.devices.map(d => d.id)
          .concat(view.state.hub ? [view.state.hub.id] : []);
        ok(ids.includes(cur.actor), `${tag}: actor "${cur.actor}" canvas-এ আছে`);
      }

      /* flood যে দিক থেকে এসেছে সেদিকে ফেরত যাবে না */
      const w = view.state.wire;
      if (w && (w.to === 'flood' || w.to === 'both')){
        const chips = (el.innerHTML.match(/nc-pkt/g) || []).length;
        const others = view.state.devices.filter(d => d.id !== w.from && d.id !== w.origin).length;
        ok(chips === others,
           `${tag}: flood-এ ${others}টি packet দেখানোর কথা, দেখাচ্ছে ${chips}টি`);
      }

      /* panel()-ভিত্তিক lab (Subnet Calculator) — render + হিসাব যাচাই */
      if (lab.panel){
        const pel = mkEl('p');
        let pv;
        try { pv = lab.panel(cfg); NS.ui.canvas.renderPanel(pel, pv); }
        catch(e){ ok(false, `${tag}: panel throw — ${e.message}`); }
        ok(!/undefined/.test(pel.innerHTML), `${tag}: panel-এ "undefined" নেই`);
        if (pv && !pv.err){
          ok(pv.bits.net.length + pv.bits.host.length === 32,
             `${tag}: bit ভাগ ৩২ হতে হবে`);
          ok(pv.bits.net.length === pv.cidr, `${tag}: network bit = CIDR`);
        }
      }

      const tl = mkEl('t');
      try { NS.ui.timeline.render(tl, view); }
      catch(e){ ok(false, `${tag}: timeline throw — ${e.message}`); }
      ok(!/undefined/.test(tl.innerHTML), `${tag}: timeline-এ "undefined" নেই`);

      if (cur && cur.packet){
        let h = '';
        try { h = NS.ui.inspector.packetHTML(cur.packet); }
        catch(e){ ok(false, `${tag}: packetHTML throw — ${e.message}`); }
        ok(!/undefined/.test(h), `${tag}: packet inspector পরিষ্কার`);
        for (const L of cur.packet.layers)
          for (const f of L.fields)
            if (!NS.pkt.FIELD_HELP[f[0]]) missingHelp.add(f[0]);
      }

      const devs = view.state.devices.concat(view.state.hub ? [view.state.hub] : []);
      for (const d of devs){
        let h = '';
        try { h = NS.ui.inspector.deviceHTML(d); }
        catch(e){ ok(false, `${tag}: deviceHTML(${d.id}) throw — ${e.message}`); }
        ok(h.length > 0 && !/undefined/.test(h), `${tag}: device inspector ${d.id} পরিষ্কার`);
      }
    }
  }
  console.log(`  ${id.padEnd(10)} ${String(variants).padStart(2)} variants · ${total} steps`);
}

/* ───────── IP / Subnet / LPM-এর হিসাব ─────────
   এই সংখ্যাগুলো হাতে বা ipcalc দিয়ে মিলিয়ে দেখা যায়। */
(function(){
  const N = NS.net;
  const cases = [
    ['192.168.1.10', 24, { network:'192.168.1.0', broadcast:'192.168.1.255',
      first:'192.168.1.1', last:'192.168.1.254', total:256, usable:254, mask:'255.255.255.0' }],
    ['10.0.5.20', 8, { network:'10.0.0.0', broadcast:'10.255.255.255',
      total:16777216, usable:16777214, mask:'255.0.0.0' }],
    ['192.168.1.130', 26, { network:'192.168.1.128', broadcast:'192.168.1.191',
      first:'192.168.1.129', last:'192.168.1.190', total:64, usable:62 }],
    ['192.168.1.10', 30, { network:'192.168.1.8', broadcast:'192.168.1.11', usable:2 }],
    ['0.0.0.0', 0, { network:'0.0.0.0', broadcast:'255.255.255.255', total:4294967296 }]
  ];
  for (const [ip, cidr, want] of cases){
    const r = N.subnet(ip, cidr);
    for (const k in want)
      ok(r[k] === want[k], `subnet(${ip}/${cidr}).${k} = ${r[k]}, চাই ${want[k]}`);
  }
  ok(N.subnet('10.0.0.1', 31).usable === 2, '/31 point-to-point (RFC 3021)');
  ok(N.subnet('10.0.0.1', 32).usable === 1, '/32 একটিমাত্র address');

  for (const [ip, c] of [['999.1.1.1',24], ['abc',24], ['',24], ['1.2.3.4',33], ['1.2.3.4',-1]])
    ok(!!N.subnet(ip, c).err, `subnet(${ip}/${c}) ভুল input ধরতে হবে`);

  ok(N.sameSubnet('192.168.1.10','192.168.1.20','255.255.255.0') === true,  'একই /24');
  ok(N.sameSubnet('192.168.1.10','192.168.2.20','255.255.255.0') === false, 'ভিন্ন /24');
  ok(N.sameSubnet('192.168.1.10','192.168.1.130','255.255.255.128') === false,
     '/25 সীমানা আলাদা করে');
  ok(N.bits('192.168.1.5') === '11000000.10101000.00000001.00000101', 'bits() (বই ch9)');

  /* বই-এর ch12-এর টেবিল */
  const rts = [{dst:'10.0.5.0',prefix:24,via:'A'},{dst:'10.0.0.0',prefix:16,via:'B'},
               {dst:'10.0.0.0',prefix:8,via:'C'},{dst:'0.0.0.0',prefix:0,via:'D'}];
  const m = N.lpm('10.0.5.20', rts);
  ok(m.matches.length === 4, 'LPM: চারটিই মেলে');
  ok(m.best.via === 'A',     'LPM: /24 জেতে (বই ch12)');
  ok(N.lpm('203.0.113.5', rts).best.via === 'D', 'LPM: default route শেষ ভরসা');
  ok(N.lpm('8.8.8.8', [{dst:'10.0.0.0',prefix:8}]).best === null, 'LPM: না মিললে null');
})();

/* ───────── Lab-এর শিক্ষাগত দাবিগুলো সত্যি কিনা ─────────
   এগুলো render নয়, বরং "lab যা শেখাচ্ছে তা আসলেই ঘটছে কিনা" যাচাই করে। */
(function(){
  function run(id, cfg){
    const e = new NS.Engine(NS.labs[id], Object.assign({ seed:1 }, cfg));
    while (e.step());
    return e;
  }
  const used = (e, actor) => e.steps.some(s => s.actor === actor);
  const last = e => e.steps[e.steps.length - 1];

  /* IP lab — same subnet হলে Gateway ছোঁয়ার কথা নয় */
  ok(!used(run('ip', { dst:'local',  mask:'24' }), 'gw'),
     'IP: একই subnet-এ Gateway লাগে না');
  ok( used(run('ip', { dst:'remote', mask:'24' }), 'gw'),
     'IP: ভিন্ন network-এ Gateway লাগে');
  /* /25 আসলেই .10 আর .130-কে আলাদা করে — এটাই lab-এর মূল দাবি */
  ok( used(run('ip', { dst:'local',  mask:'25' }), 'gw'),
     'IP: /25 তে 192.168.1.10 ও .130 ভিন্ন network');
  ok(last(run('ip', { dst:'remote', mask:'24', nogw:true })).kind === 'error',
     'IP: Gateway ছাড়া বাইরে যাওয়া যায় না');

  /* LPM — হাতে মিলিয়ে দেখা বিজয়ী */
  const want = { '10.0.5.20':'Router A', '10.0.9.7':'Router B',
                 '10.7.7.7':'Router C', '203.0.113.5':'Router D' };
  for (const dst in want)
    ok(last(run('lpm', { dst })).what.includes(want[dst]),
       `LPM: ${dst} → ${want[dst]}`);
  ok(last(run('lpm', { dst:'203.0.113.5', nodefault:true })).kind === 'error',
     'LPM: default ছাড়া অচেনা গন্তব্য drop হয়');

  /* TTL — কমতে কমতে শূন্য, আর traceroute প্রতিটি hop খুঁজে পায় */
  const lowTtl = run('ttl', { mode:'low' });
  ok(lowTtl.steps.some(s => s.kind === 'error'), 'TTL: TTL 2 তে Packet মাঝপথে মরে');
  ok(last(run('ttl', { mode:'normal' })).kind === 'ok',  'TTL: TTL 64 তে পৌঁছে যায়');
  ok(run('ttl', { mode:'trace' }).state.hops.length === 3, 'Traceroute: তিনটি hop পাওয়া গেছে');

  /* Routing — মাঝের Router-এর route মুছলে সেখানেই আটকাবে */
  ok(last(run('routing', { broken:true })).actor === 'rb',
     'Routing: ভাঙা route Router B-তেই আটকায়');
  ok(last(run('routing', { broken:false })).actor === 'srv',
     'Routing: ঠিক থাকলে Server পর্যন্ত যায়');

  /* Hop — MAC বদলায়, IP বদলায় না (পুরো lab-এর মূল কথা) */
  const hop = run('hop', {});
  const macs = new Set(), ips = new Set();
  for (const s of hop.steps){
    if (!s.packet) continue;
    for (const L of s.packet.layers) for (const f of L.fields){
      if (f[0] === 'dstMAC') macs.add(f[1]);
      if (f[0] === 'dstIP')  ips.add(f[1]);
    }
  }
  ok(macs.size >= 3, `Hop: destination MAC অন্তত ৩ বার বদলায় (পাওয়া গেছে ${macs.size})`);
  ok(ips.size === 1,  `Hop: destination IP একটাই থাকে (পাওয়া গেছে ${ips.size})`);
})();

/* ───────── Phase 3 · TCP/UDP-র দাবিগুলো সত্যি কিনা ─────────
   TCP-র sequence/ACK সংখ্যা ভুল হলে lab ভুল শেখাবে, অথচ render ঠিকই দেখাবে।
   তাই সংখ্যাগুলো এখানে আলাদা করে মিলিয়ে দেখা হচ্ছে। */
(function(){
  function run(id, cfg){
    const e = new NS.Engine(NS.labs[id], Object.assign({ seed:1 }, cfg));
    while (e.step());
    return e;
  }
  const last = e => e.steps[e.steps.length - 1];
  /* একটি step-এর packet থেকে নির্দিষ্ট field */
  const fieldsOf = (e, pred) => e.steps.filter(s => s.packet).filter(pred)
      .map(s => Object.fromEntries(s.packet.layers.flatMap(L => L.fields)));

  /* ── Handshake — SYN/SYN-ACK/ACK-এর সংখ্যা ── */
  const hs = run('handshake', { mode:'open' });
  const hp = fieldsOf(hs, () => true);
  ok(hp[0].flags === 'SYN',      'Handshake: ১ম Packet SYN');
  ok(hp[1].flags === 'SYN, ACK', 'Handshake: ২য় Packet SYN-ACK');
  ok(hp[2].flags === 'ACK',      'Handshake: ৩য় Packet ACK');
  /* ACK Number = অন্য পাশের ISN + 1 — SYN নিজে একটি ক্রম দখল করে */
  ok(+hp[1].ack === +hp[0].seq + 1,
     `Handshake: SYN-ACK-এর ack = client ISN+1 (${hp[1].ack} vs ${+hp[0].seq + 1})`);
  ok(+hp[2].ack === +hp[1].seq + 1,
     `Handshake: শেষ ACK = server ISN+1 (${hp[2].ack} vs ${+hp[1].seq + 1})`);
  /* data ঠিক handshake যেখানে শেষ করেছে সেখান থেকেই শুরু */
  ok(+hp[3].seq === +hp[0].seq + 1, 'Handshake: প্রথম data seq = ISN+1');
  ok(hp[3].payload && hp[3].payload.length > 0, 'Handshake: ৪র্থ Packet-এই প্রথম data');
  /* handshake-এর তিনটি Packet-এ কোনো application data থাকতে পারে না */
  ok(hp.slice(0,3).every(f => f.payload === undefined),
     'Handshake: প্রথম তিন Packet-এ কোনো payload নেই');

  ok(last(run('handshake', { mode:'closed' })).what.includes('refused'),
     'Handshake: বন্ধ port → Connection refused');
  ok(last(run('handshake', { mode:'drop' })).what.includes('timed out'),
     'Handshake: চুপচাপ drop → Connection timed out');
  /* refused সঙ্গে সঙ্গে, timeout দেরিতে — তাই timeout-এ ধাপ বেশি */
  ok(run('handshake', { mode:'drop' }).steps.length >
     run('handshake', { mode:'closed' }).steps.length,
     'Handshake: timeout-এ refused-এর চেয়ে বেশি চেষ্টা লাগে');

  /* ── Reliability — cumulative ACK আর duplicate ── */
  const rNone = run('reliable', { mode:'none' });
  const rAcks = fieldsOf(rNone, s => s.actor === 'server').map(f => +f.ack);
  ok(JSON.stringify(rAcks) === JSON.stringify([101,201,301,401]),
     `Reliability: ফাঁক না থাকলে ACK এগোয় 101→401 (পাওয়া ${rAcks})`);

  const rFast = run('reliable', { mode:'fast' });
  const fAcks = fieldsOf(rFast, s => s.actor === 'server').map(f => +f.ack);
  /* ২য় segment (seq=101) হারানোয় ACK ১০১-এই আটকে থাকতে হবে */
  ok(fAcks.slice(0,3).every(a => a === 101),
     `Reliability: হারানোর পর ACK 101-এ আটকে থাকে (পাওয়া ${fAcks})`);
  ok(fAcks.filter(a => a === 101).length >= 3,
     'Reliability: অন্তত তিনটি duplicate ACK তৈরি হয়');
  ok(fAcks[fAcks.length - 1] === 401,
     'Reliability: ফাঁক ভরলে ACK লাফিয়ে 401-এ যায়');
  /* retransmit হওয়া segment-টিই হারানো segment */
  const reSent = fieldsOf(rFast, s => s.actor === 'client').map(f => +f.seq);
  ok(reSent.filter(q => q === 101).length === 2,
     'Reliability: শুধু হারানো seq=101 দুবার পাঠানো হয়');
  ok(reSent.filter(q => q === 201).length === 1,
     'Reliability: যেগুলো পৌঁছেছে সেগুলো আবার পাঠানো হয় না');

  /* শেষ segment হারালে duplicate ACK আসতেই পারে না — timeout লাগে */
  const rTo = run('reliable', { mode:'timeout' });
  const tAcks = fieldsOf(rTo, s => s.actor === 'server').map(f => +f.ack);
  ok(tAcks.filter(a => a === 301).length === 1,
     'Reliability: শেষটি হারালে duplicate ACK তৈরি হয় না');
  ok(rTo.steps.some(s => s.title.includes('Timeout') || s.title.includes('RTO')),
     'Reliability: শেষটি হারালে timeout-এর পথে যায়');

  /* ── Ordering — buffer আর head-of-line blocking ── */
  const oIn  = run('ordering', { mode:'inorder' });
  const oOut = run('ordering', { mode:'reorder' });
  const inAcks  = fieldsOf(oIn,  s => s.title.startsWith('ACK')).map(f => +f.ack);
  const outAcks = fieldsOf(oOut, s => s.title.startsWith('ACK')).map(f => +f.ack);
  ok(JSON.stringify(inAcks) === JSON.stringify([101,201,301,401]),
     `Ordering: ক্রম ঠিক থাকলে ACK ধাপে ধাপে এগোয় (${inAcks})`);
  /* 1 → 201 → 301 → 101 ক্রমে এলে ACK: 101,101,101,401 */
  ok(JSON.stringify(outAcks) === JSON.stringify([101,101,101,401]),
     `Ordering: ফাঁক থাকলে ACK আটকে থাকে, ভরলে লাফায় (${outAcks})`);
  /* দুই ক্ষেত্রেই application শেষ পর্যন্ত একই পূর্ণ data পায় */
  ok(oIn.state.delivered === oOut.state.delivered && oIn.state.delivered.length > 0,
     'Ordering: ক্রম যাই হোক application একই data পায়');
  ok(oOut.steps.some(s => s.why.includes('Head-of-Line')),
     'Ordering: Head-of-Line Blocking ব্যাখ্যা করা হয়েছে');

  /* ── Flow Control — window কখনো ঋণাত্মক বা সীমার বাইরে যাবে না ── */
  const fSlow = run('flow', { slow:true });
  for (const st of fSlow.history)
    ok(st.win >= 0 && st.win <= st.cap, `Flow: window 0..${st.cap}-এর মধ্যেই থাকে`);
  ok(fSlow.steps.some(s => s.title.includes('Zero Window')),
     'Flow: ধীর receiver-এ window শূন্য হয়');
  ok(fSlow.steps.some(s => s.title.includes('Probe')),
     'Flow: Zero Window-এর পর probe পাঠানো হয়');
  ok(last(fSlow).state === undefined || fSlow.state.win > 0,
     'Flow: শেষে window আবার খোলে');
  const fFast = run('flow', { slow:false });
  ok(fFast.history.every(st => st.win > 0),
     'Flow: দ্রুত receiver-এ window কখনো শূন্য হয় না');

  /* ── Close — চারটি Packet, আর TIME_WAIT ── */
  const cl = run('close', { mode:'graceful' });
  const flags = fieldsOf(cl, () => true).map(f => f.flags);
  ok(JSON.stringify(flags) === JSON.stringify(['FIN, ACK','ACK','FIN, ACK','ACK']),
     `Close: FIN,ACK,FIN,ACK — চারটি Packet (${flags})`);
  ok(cl.steps.some(s => s.title.includes('TIME_WAIT')), 'Close: TIME_WAIT ব্যাখ্যা আছে');
  ok(cl.state.cstate === 'CLOSED' && cl.state.sstate === 'CLOSED',
     'Close: শেষে দুই পাশই CLOSED');
  /* CLOSE_WAIT একটি আলাদা অবস্থা — Server ACK দিয়েছে কিন্তু FIN দেয়নি */
  ok(cl.history.some(st => st.sstate === 'CLOSE_WAIT'),
     'Close: Server কিছুক্ষণ CLOSE_WAIT-এ থাকে');
  const hc = run('close', { mode:'halfclose' });
  ok(hc.steps.some(s => s.actor === 'server' && s.layer === 'L7'),
     'Close: half-close-এ Server তখনও data পাঠায়');
  const rst = run('close', { mode:'rst' });
  ok(rst.steps.length < cl.steps.length, 'Close: RST স্বাভাবিক close-এর চেয়ে ছোট');
  ok(!rst.steps.some(s => s.title.includes('TIME_WAIT')),
     'Close: RST-এ কোনো TIME_WAIT নেই');

  /* ── UDP — কোনো ACK নেই, কোনো retransmit নেই ── */
  for (const app of ['voice','dns']){
    const u = run('udp', { loss:true, app });
    ok(u.steps.every(s => !s.packet ||
        !s.packet.layers.some(L => L.name === 'TCP Header')),
       `UDP(${app}): কোথাও TCP Header নেই`);
    ok(u.steps.every(s => s.actor !== 'server' || !s.title.includes('ACK')),
       `UDP(${app}): কোনো ACK পাঠানো হয় না`);
    /* হারানো datagram আর কখনো পাঠানো হয় না — এটাই UDP-র মূল দাবি */
    const labels = u.steps.filter(s => s.packet).map(s => s.packet.label);
    ok(labels.filter(l => l === '#2 ✗').length === 1,
       `UDP(${app}): হারানো datagram আর পাঠানো হয় না`);
    ok(u.state.dropped === 1, `UDP(${app}): একটি datagram হারিয়েছে`);
  }
  ok(run('udp', { loss:false, app:'voice' }).state.dropped === 0,
     'UDP: loss বন্ধ থাকলে কিছু হারায় না');

  /* ── TCP vs UDP — একই ঘটনা, ভিন্ন ফল ── */
  const vT = run('tcpudp', { proto:'tcp' });
  const vU = run('tcpudp', { proto:'udp' });
  ok(vT.state.got.length === 3, 'TCP vs UDP: TCP-তে তিনটিই পৌঁছায়');
  ok(vU.state.got.length === 2, 'TCP vs UDP: UDP-তে দুটি পৌঁছায়');
  ok(vT.steps.length > vU.steps.length,
     'TCP vs UDP: TCP-তে বেশি Packet লাগে');
  ok(vU.steps.every(s => !s.packet ||
      !s.packet.layers.some(L => L.name === 'TCP Header')),
     'TCP vs UDP: UDP mode-এ TCP Header থাকে না');

  /* ── Socket — 4-tuple সত্যিই অনন্য ── */
  const sk = run('socket', {});
  const tuples = sk.state.sockets;
  ok(tuples.length === 3, 'Socket: তিনটি connected socket তৈরি হয়');
  ok(new Set(tuples).size === 3, 'Socket: প্রতিটি 4-tuple অনন্য');
  /* একই IP-র দুটি tab — port ভিন্ন হওয়াতেই আলাদা */
  ok(tuples[0].startsWith('192.168.1.10:') && tuples[1].startsWith('192.168.1.10:'),
     'Socket: দুটি socket একই client IP থেকে');
  ok(tuples[0] !== tuples[1], 'Socket: একই IP, ভিন্ন source port → ভিন্ন socket');
  /* ভিন্ন IP কিন্তু একই port — তবু সংঘাত নেই */
  ok(tuples[2].indexOf(':49152') > 0 && tuples[0].indexOf(':49152') > 0,
     'Socket: দুটি client একই source port ব্যবহার করছে');
  ok(tuples[2] !== tuples[0], 'Socket: ভিন্ন IP হওয়ায় তবু আলাদা');
  /* সব socket একই server port-এ */
  ok(tuples.every(x => x.endsWith(':80')), 'Socket: সবগুলোই server-এর port 80-এ');
  ok(last(run('socket', { conflict:true })).kind === 'error',
     'Socket: দুটি process একই port চাইলে ব্যর্থ হয়');
})();

/* ───────── Phase 4 · DNS / HTTP / TLS / NAT / Firewall ───────── */
(function(){
  function run(id, cfg){
    const e = new NS.Engine(NS.labs[id], Object.assign({ seed:1 }, cfg));
    while (e.step());
    return e;
  }
  const last = e => e.steps[e.steps.length - 1];
  const fields = e => e.steps.filter(s => s.packet)
    .map(s => Object.fromEntries(s.packet.layers.flatMap(L => L.fields)));

  /* ── DNS — Root → TLD → Authoritative, এই ক্রমেই ── */
  const d = run('dns', { result:'ok' });
  const actors = d.steps.map(s => s.actor);
  ok(actors.indexOf('root') < actors.indexOf('tld'),
     'DNS: Root-এর পরে TLD-তে যায়');
  ok(actors.indexOf('tld') < actors.indexOf('auth'),
     'DNS: TLD-এর পরে Authoritative-এ যায়');
  ok(d.state.answer === '93.184.216.34', 'DNS: শেষে সঠিক IP পাওয়া যায়');
  /* client কখনো সরাসরি root/tld/auth-এ যায় না — সবই resolver-এর কাজ */
  ok(!d.steps.some(s => s.packet && s.actor === 'client' &&
      ['root','tld','auth'].includes(s.packet.to)),
     'DNS: Client সরাসরি Root/TLD-তে যায় না (recursive)');
  /* DNS UDP-তে যায়, TCP-তে নয় */
  ok(d.steps.filter(s => s.packet && s.packet.to !== 'web')
      .every(s => !s.packet.layers.some(L => L.name === 'TCP Header')),
     'DNS: query/response UDP-তে যায়');
  ok(last(d).layer === 'L4', 'DNS: শেষে TCP handshake শুরু হয়');
  ok(last(run('dns', { result:'nx' })).kind === 'error', 'DNS: NXDOMAIN ব্যর্থতা');
  ok(last(run('dns', { result:'fail' })).what.includes('SERVFAIL'), 'DNS: SERVFAIL আলাদা');
  /* NXDOMAIN আর SERVFAIL একই জিনিস নয় — ব্যাখ্যাও আলাদা হতে হবে */
  ok(last(run('dns', { result:'nx' })).why !== last(run('dns', { result:'fail' })).why,
     'DNS: NXDOMAIN আর SERVFAIL আলাদা করে বোঝানো হয়েছে');

  /* ── DNS Cache — TTL না ফুরালে পুরনো IP-ই পরিবেশিত হয় ── */
  const hit = run('dnscache', { scene:'hit' });
  ok(hit.state.cache === '93.184.216.34', 'DNS Cache: প্রথম উত্তর cache হয়');
  const chg = run('dnscache', { scene:'change' });
  /* authoritative বদলে গেছে, কিন্তু মাঝপথে served পুরনোই ছিল */
  ok(chg.history.some(st => st.authIp === '93.184.216.99' &&
                            st.served === '93.184.216.34'),
     'DNS Cache: TTL শেষ না হলে পুরনো IP-ই দেওয়া হয়');
  ok(chg.state.served === '93.184.216.99', 'DNS Cache: শেষে নতুন IP-তে পৌঁছায়');
  const low = run('dnscache', { scene:'lowttl' });
  ok(low.state.ttl === 60 && chg.state.ttl === 3600,
     'DNS Cache: ছোট TTL দৃশ্যে TTL সত্যিই ছোট');
  ok(low.steps.length < chg.steps.length,
     'DNS Cache: ছোট TTL-এ কম অপেক্ষা লাগে');

  /* ── HTTP — status code শ্রেণি অনুযায়ী kind ── */
  const want = { '200':'ok', '301':'warn', '404':'error', '500':'error' };
  for (const code in want){
    const h = run('http', { status:code, keepalive:true });
    const resp = h.steps.find(s => s.title.startsWith(code));
    ok(!!resp, `HTTP: ${code}-এর ধাপ আছে`);
    ok(resp.kind === want[code], `HTTP: ${code} → kind ${want[code]}`);
  }
  /* Keep-Alive-এ একটি connection, বন্ধ থাকলে দুটি */
  ok(run('http', { status:'200', keepalive:true }).state.conns === 1,
     'HTTP: Keep-Alive-এ একটিই connection');
  ok(run('http', { status:'200', keepalive:false }).state.conns === 2,
     'HTTP: Keep-Alive ছাড়া দুটি connection');
  /* দুই ক্ষেত্রেই request দুটি — পার্থক্য শুধু connection-এ */
  ok(run('http', { status:'200', keepalive:true }).state.reqs ===
     run('http', { status:'200', keepalive:false }).state.reqs,
     'HTTP: request সংখ্যা একই, শুধু connection আলাদা');

  /* ── TLS — যাচাই ব্যর্থ হলে কোনো encrypted data যায় না ── */
  const tOk = run('tls', { problem:'ok' });
  ok(tOk.state.verified === true && tOk.state.encrypted === true,
     'TLS: বৈধ certificate-এ encryption শুরু হয়');
  for (const bad of ['expired','wrongname','selfsigned']){
    const tb = run('tls', { problem:bad });
    ok(tb.state.verified === false, `TLS(${bad}): যাচাই ব্যর্থ`);
    /* সবচেয়ে গুরুত্বপূর্ণ দাবি — ব্যর্থ হলে কিছুই encrypt হয় না */
    ok(tb.state.encrypted === false, `TLS(${bad}): কোনো encrypted data যায় না`);
    ok(last(tb).kind === 'error', `TLS(${bad}): error দিয়ে শেষ`);
  }
  /* তিনটি ব্যর্থতার ব্যাখ্যা আলাদা হতে হবে — একই কারণ নয় */
  const reasons = ['expired','wrongname','selfsigned']
    .map(b => run('tls', { problem:b }).steps.find(s => s.kind === 'error').why);
  ok(new Set(reasons).size === 3, 'TLS: তিনটি ব্যর্থতার কারণ আলাদা');
  /* HTTPS "নিরাপদ site" নয় — এই সতর্কতাটি অবশ্যই থাকতে হবে */
  ok(tOk.steps.some(s => s.why.includes('সৎ কিনা')),
     'TLS: "HTTPS মানে site বিশ্বাসযোগ্য নয়" — বলা হয়েছে');

  /* ── NAT — table entry, আর private IP বাইরে যায় না ── */
  const nOut = run('nat', { dir:'out' });
  ok(nOut.state.table.length === 3, 'NAT: তিনটি entry তৈরি হয়');
  /* প্রতিটি public port অনন্য — নইলে উত্তর ভুল জায়গায় যাবে */
  const pubs = nOut.state.table.map(r => r.pub);
  ok(new Set(pubs).size === 3, 'NAT: প্রতিটি public port অনন্য');
  /* দুটি host একই private port ব্যবহার করছে — এটাই lab-এর মূল দাবি */
  const privPorts = nOut.state.table.map(r => r.priv.split(':')[1]);
  ok(privPorts[0] === privPorts[1],
     'NAT: দুটি host একই private port বেছেছে');
  ok(pubs[0] !== pubs[1], 'NAT: তবু তাদের public port আলাদা');
  /* বাইরে যাওয়া কোনো Packet-এ private IP source হিসেবে থাকতে পারে না */
  const outbound = nOut.steps.filter(s => s.packet && s.packet.to === 'web');
  ok(outbound.length > 0, 'NAT: বাইরে যাওয়া Packet আছে');
  ok(outbound.every(s => {
      const f = Object.fromEntries(s.packet.layers.flatMap(L => L.fields));
      return !/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(f.srcIP);
    }), 'NAT: বাইরে যাওয়া Packet-এ কোনো private IP থাকে না');
  /* অযাচিত inbound — table খালি, তাই drop */
  const nIn = run('nat', { dir:'in' });
  ok(last(nIn).kind === 'error', 'NAT: অযাচিত inbound drop হয়');
  ok(!nIn.steps.some(s => s.packet && ['pc1','pc2','pc3'].includes(s.packet.to)),
     'NAT: অযাচিত Packet ভেতরে পৌঁছায় না');
  /* Port forwarding থাকলে পৌঁছায় */
  const nFwd = run('nat', { dir:'fwd' });
  ok(nFwd.steps.some(s => s.packet && s.packet.to === 'pc1'),
     'NAT: port forward থাকলে ভেতরে পৌঁছায়');

  /* ── Firewall — নিয়ম উপর থেকে নিচে, প্রথম মিলই চূড়ান্ত ── */
  const fw = (port, inside, reject) =>
    run('firewall', { port, inside: !!inside, reject: !!reject });

  ok(fw('443').state.verdict === 'ALLOW',  'Firewall: 443 অনুমোদিত');
  ok(fw('3306').state.verdict === 'DENY',  'Firewall: 3306 অনুমোদিত নয়');
  /* SSH source-নির্ভর — এটাই সবচেয়ে সূক্ষ্ম নিয়ম */
  ok(fw('22', true).state.verdict === 'ALLOW',
     'Firewall: SSH ভেতর থেকে অনুমোদিত');
  ok(fw('22', false).state.verdict === 'DENY',
     'Firewall: SSH বাইরে থেকে অনুমোদিত নয়');
  /* প্রথম মিলই চূড়ান্ত — মিলের পরে আর কোনো নিয়ম পড়া হয় না */
  const f443 = fw('443');
  const ruleSteps = f443.steps.filter(s => s.title.startsWith('নিয়ম'));
  ok(ruleSteps.length === 1,
     `Firewall: 443 প্রথম নিয়মেই মেলে, পরেরগুলো পড়া হয় না (পড়েছে ${ruleSteps.length})`);
  const f3306 = fw('3306');
  ok(f3306.steps.filter(s => s.title.startsWith('নিয়ম')).length === 4,
     'Firewall: না মিললে শেষ নিয়ম পর্যন্ত পড়া হয়');
  ok(f3306.state.hit === null || f3306.steps.some(s => s.title.includes('নিয়ম 4')),
     'Firewall: শেষে default DENY-তে পড়ে');
  /* অনুমোদিত হলেই কেবল Server পর্যন্ত পৌঁছায় */
  ok(f443.steps.some(s => s.packet && s.packet.to === 'srv'),
     'Firewall: ALLOW হলে Server-এ পৌঁছায়');
  ok(!f3306.steps.some(s => s.packet && s.packet.to === 'srv'),
     'Firewall: DENY হলে Server-এ পৌঁছায় না');
  /* REJECT উত্তর পাঠায়, DROP পাঠায় না — এটাই মূল পার্থক্য */
  ok(fw('3306', false, true).steps.some(s => s.packet && s.packet.label === 'RST'),
     'Firewall: REJECT-এ RST পাঠানো হয়');
  ok(!fw('3306', false, false).steps.some(s => s.packet && s.packet.label === 'RST'),
     'Firewall: DROP-এ কিছুই পাঠানো হয় না');
  ok(fw('3306', false, true).state.banner.includes('refused'),
     'Firewall: REJECT → Connection refused');
  ok(fw('3306', false, false).state.banner.includes('timed out'),
     'Firewall: DROP → Connection timed out');
})();

/* ───────── Phase 5-6 · Performance / Break-It / Journey ───────── */
(function(){
  function run(id, cfg){
    const e = new NS.Engine(NS.labs[id], Object.assign({ seed:1 }, cfg));
    while (e.step());
    return e;
  }
  const last = e => e.steps[e.steps.length - 1];

  /* ── Latency — চারটি উপাদান, আর কোনটি কীসের উপর নির্ভরশীল ── */
  const L = (dist, bw, busy) => run('latency', { dist, bw, busy: !!busy });
  const farLow = L('far','low'), farHigh = L('far','high');
  const nearLow = L('near','low');

  /* propagation = দূরত্ব ÷ আলোর গতি — হাতে মিলিয়ে দেখা */
  ok(farLow.state.prop === 60,  `Latency: 12000km → 60 ms (পাওয়া ${farLow.state.prop})`);
  ok(nearLow.state.prop === 0.1, `Latency: 20km → 0.1 ms (পাওয়া ${nearLow.state.prop})`);
  ok(farLow.state.trans === 1.2, `Latency: 1500B@10Mbps → 1.2 ms (পাওয়া ${farLow.state.trans})`);
  /* সবচেয়ে গুরুত্বপূর্ণ দাবি: bandwidth বাড়ালে propagation একটুও কমে না */
  ok(farHigh.state.prop === farLow.state.prop,
     'Latency: bandwidth বাড়ালেও propagation অপরিবর্তিত');
  ok(farHigh.state.trans < farLow.state.trans,
     'Latency: bandwidth বাড়ালে transmission কমে');
  /* দূরত্ব বাড়ালে propagation বাড়ে, transmission নয় */
  ok(farLow.state.prop > nearLow.state.prop,
     'Latency: দূরত্ব বাড়লে propagation বাড়ে');
  ok(farLow.state.trans === nearLow.state.trans,
     'Latency: দূরত্ব transmission-কে প্রভাবিত করে না');
  /* queuing-ই একমাত্র উপাদান যা ব্যস্ততার উপর নির্ভর করে */
  ok(L('far','low',true).state.queue > L('far','low',false).state.queue,
     'Latency: ব্যস্ত Router-এ queuing বাড়ে');
  ok(L('far','low',true).state.prop === L('far','low',false).state.prop,
     'Latency: ব্যস্ততা propagation বদলায় না');
  /* মোট = চারটির যোগফল */
  for (const e of [farLow, farHigh, nearLow, L('near','high',true)]){
    const st = e.state;
    const sum = Math.round((st.trans + st.prop + st.queue + st.proc) * 100) / 100;
    ok(Math.abs(st.total - sum) < 0.01,
       `Latency: মোট = চারটির যোগফল (${st.total} vs ${sum})`);
  }
  /* দূরে গেলে bandwidth ১০০ গুণ বাড়িয়েও লাভ সামান্য — lab-এর মূল দাবি */
  ok(farHigh.state.total > farLow.state.total * 0.9,
     'Latency: দূরে bandwidth ১০০ গুণ বাড়িয়েও মোট সময় প্রায় একই');

  /* ── Queue — জমা, drop, আর bufferbloat ── */
  const qSteady = run('queue', { rate:'steady', bigbuf:false });
  const qBurst  = run('queue', { rate:'burst',  bigbuf:false });
  const qBig    = run('queue', { rate:'burst',  bigbuf:true  });
  ok(qSteady.state.dropped === 0, 'Queue: আসা=যাওয়া হলে কিছু হারায় না');
  ok(qBurst.state.dropped > 0,    'Queue: বেশি এলে drop হয়');
  /* বড় buffer → কম drop, কিন্তু বেশি অপেক্ষা — এটাই bufferbloat */
  ok(qBig.state.dropped < qBurst.state.dropped,
     'Queue: buffer বড় করলে drop কমে');
  ok(qBig.state.q > qBurst.state.q,
     `Queue: কিন্তু queue-তে বেশি Packet অপেক্ষা করে (bufferbloat) — ${qBig.state.q} vs ${qBurst.state.q}`);
  ok(qBig.state.cap === qBurst.state.cap * 3, 'Queue: বড় buffer তিন গুণ');
  /* কোনো অবস্থাতেই queue ধারণক্ষমতা ছাড়াতে পারে না */
  for (const e of [qSteady, qBurst, qBig])
    for (const st of e.history)
      ok(st.q >= 0 && st.q <= st.cap, `Queue: 0..${st.cap}-এর মধ্যেই থাকে`);
  /* হিসাব মেলে: পাঠানো = পৌঁছানো + drop + এখনো queue-তে */
  for (const e of [qSteady, qBurst, qBig]){
    const s = e.state;
    ok(s.sent === s.delivered + s.dropped + s.q,
       `Queue: sent(${s.sent}) = delivered(${s.delivered}) + dropped(${s.dropped}) + queue(${s.q})`);
  }

  /* ── CDN — edge কাছে, তাই RTT কম ── */
  const cO = run('cdn', { mode:'origin' });
  const cE = run('cdn', { mode:'edge' });
  const cM = run('cdn', { mode:'miss' });
  ok(cO.state.rtt === 120, `CDN: origin RTT 120 ms (পাওয়া ${cO.state.rtt})`);
  ok(cE.state.rtt === 0.5, `CDN: edge RTT 0.5 ms (পাওয়া ${cE.state.rtt})`);
  ok(cE.state.rtt < cO.state.rtt, 'CDN: edge origin-এর চেয়ে দ্রুত');
  ok(cE.state.hit === true && cM.state.hit === false, 'CDN: hit/miss আলাদা');
  /* Cache hit-এ origin ছোঁয়াই হয় না — এটাই মূল দাবি */
  ok(!cE.steps.some(s => s.packet && (s.packet.to === 'origin' || s.packet.from === 'origin')),
     'CDN: cache hit-এ origin পর্যন্ত যেতেই হয় না');
  ok(cM.steps.some(s => s.packet && s.packet.to === 'origin'),
     'CDN: cache miss-এ origin-এ যেতে হয়');
  ok(cM.state.rtt > cE.state.rtt, 'CDN: miss hit-এর চেয়ে ধীর');

  /* ── Load Balancer — বণ্টন, health check, sticky ── */
  const rr    = run('lb', { algo:'rr', fail:false });
  const rrF   = run('lb', { algo:'rr', fail:true  });
  const st_   = run('lb', { algo:'sticky', fail:false });
  const total = c => c.s1 + c.s2 + c.s3;
  ok(total(rr.state.counts) === 6, 'LB: ছয়টি request বণ্টন হয়');
  /* Round Robin — সমান ভাগ */
  ok(rr.state.counts.s1 === 2 && rr.state.counts.s2 === 2 && rr.state.counts.s3 === 2,
     `LB: Round Robin সমান ভাগ করে (${JSON.stringify(rr.state.counts)})`);
  /* মৃত server একটিও request পায় না — সবচেয়ে গুরুত্বপূর্ণ দাবি */
  ok(rrF.state.counts.s2 === 0,
     `LB: মৃত server একটিও request পায় না (পেয়েছে ${rrF.state.counts.s2})`);
  ok(total(rrF.state.counts) === 6, 'LB: তবু ছয়টি request-ই সামলানো হয়');
  ok(rrF.state.healthy.length === 2, 'LB: health check মৃতটিকে বাদ দেয়');
  ok(!rrF.steps.some(s => s.packet && s.packet.to === 's2'),
     'LB: মৃত server-এ কোনো Packet যায় না');
  /* Sticky — সব একটিতেই, তাই অসম */
  ok(st_.state.counts.s1 === 6,
     `LB: sticky-তে সব request একই server-এ (${JSON.stringify(st_.state.counts)})`);
  const spread = c => Math.max(c.s1,c.s2,c.s3) - Math.min(c.s1,c.s2,c.s3);
  ok(spread(st_.state.counts) > spread(rr.state.counts),
     'LB: sticky Round Robin-এর চেয়ে অসম');

  /* ── Break-It — প্রতিটি ভাঙন নির্দিষ্ট স্তরে থামে ── */
  const stopAt = {
    none:    null,
    cable:   'L2',
    ip:      'L2',
    gateway: 'L3',
    dns:     'L7-DNS',
    fw:      'L4',
    server:  'L7-app'
  };
  for (const brk in stopAt){
    const e = run('breakit', { brk });
    ok(e.state.failedAt === stopAt[brk],
       `Break-It(${brk}): ${stopAt[brk] || 'কোথাও না'}-এ থামে (পাওয়া ${e.state.failedAt})`);
  }
  /* ভাঙা না থাকলে পাঁচটি ধাপই পার হয় */
  const bNone = run('breakit', { brk:'none' });
  ok(JSON.stringify(bNone.state.reached) ===
     JSON.stringify(['arp','route','dns','tcp','http']),
     `Break-It: কিছু না ভাঙলে পাঁচ ধাপই পার হয় (${bNone.state.reached})`);
  ok(last(bNone).kind === 'ok', 'Break-It: none → সফল');
  /* নিচের স্তর ভাঙলে উপরের ধাপে পৌঁছানোই যায় না */
  ok(run('breakit', { brk:'cable' }).state.reached.length === 0,
     'Break-It: cable ভাঙলে কোনো ধাপই পার হয় না');
  ok(run('breakit', { brk:'gateway' }).state.reached.join() === 'arp',
     'Break-It: gateway ভাঙলে ARP-ই শেষ ধাপ');
  ok(run('breakit', { brk:'fw' }).state.reached.join() === 'arp,route,dns',
     'Break-It: firewall ভাঙলে DNS পর্যন্ত যায়, TCP নয়');
  /* server ত্রুটিতে সব স্তর পার হয় — network-এর দোষ নেই, এই দাবিটি গুরুত্বপূর্ণ */
  const bSrv = run('breakit', { brk:'server' });
  ok(bSrv.state.reached.includes('tcp') && bSrv.state.reached.includes('http'),
     'Break-It: server ত্রুটিতে network-এর সব স্তর কাজ করে');
  ok(last(bSrv).kind === 'error', 'Break-It: তবু ফল error');
  /* প্রতিটি ভাঙনের ব্যাখ্যা আলাদা হতে হবে */
  const whys = Object.keys(stopAt).filter(k => k !== 'none')
    .map(k => run('breakit', { brk:k }).steps.filter(s => s.kind === 'error').pop().why);
  ok(new Set(whys).size === whys.length, 'Break-It: প্রতিটি ভাঙনের ব্যাখ্যা আলাদা');

  /* ── Journey — সব একসাথে ── */
  const jCold = run('journey', { warm:false });
  const jWarm = run('journey', { warm:true  });
  ok(jCold.state.rtt === 4, `Journey: প্রথমবার ৪ RTT (পাওয়া ${jCold.state.rtt})`);
  ok(jWarm.state.rtt === 2, `Journey: cache থাকলে ২ RTT (পাওয়া ${jWarm.state.rtt})`);
  ok(jWarm.state.rtt < jCold.state.rtt, 'Journey: cache RTT কমায়');
  /* ঠিক ক্রমে ধাপগুলো ঘটতে হবে — DNS আগে, HTTP শেষে */
  const order = jCold.state.done;
  ok(order.indexOf('DNS')  < order.indexOf('TCP'),  'Journey: DNS TCP-র আগে');
  ok(order.indexOf('ARP')  < order.indexOf('TCP'),  'Journey: ARP TCP-র আগে');
  ok(order.indexOf('TCP')  < order.indexOf('TLS'),  'Journey: TCP TLS-এর আগে');
  ok(order.indexOf('TLS')  < order.indexOf('HTTP'), 'Journey: TLS HTTP-র আগে');
  ok(order[order.length - 1] === 'Response', 'Journey: শেষে Response');
  /* cache থাকলে ARP আর পূর্ণ TLS handshake বাদ পড়ে */
  ok(!jWarm.state.done.includes('ARP'), 'Journey: cache-এ ARP লাগে না');
  ok(jWarm.state.done.includes('TLS (resume)'), 'Journey: TLS resume হয়');
  /* layer গুলো নিচ থেকে উপরে ওঠে — কোনো ধাপ উল্টো দিকে যায় না */
  ok(jCold.steps.some(s => s.layer === 'L2') &&
     jCold.steps.some(s => s.layer === 'L3') &&
     jCold.steps.some(s => s.layer === 'L4') &&
     jCold.steps.some(s => s.layer === 'L7'),
     'Journey: L2 থেকে L7 — সব স্তর জড়িত');
})();

/* ───────── Playback — ▶ চালু বোতাম ─────────
   এখানে আসল UI handler গুলোই চলে, তাই "state এগোচ্ছে কিন্তু পর্দা বদলাচ্ছে না"
   ধরনের bug এখানে ধরা পড়বে। */
(function(){
  const el = id => els[id] || (els[id] = mkEl(id));
  const shown = () => el('stepNow').textContent;

  /* boot() ইতিমধ্যে চলেছে, তাই handler গুলো বসানো আছে; একটি lab ধরে নিই */
  const before = shown();
  ok(/^\d+ \/ \d+$/.test(before), 'stepNow একটি "n / total" দেখাচ্ছে');

  const total = parseInt(before.split('/')[1], 10);
  const play = () => el('btnPlay').click();
  play();                         /* ▶ চালু */
  ok(clock.timers.size === 1, 'Play: একটি timer চালু হয়েছে');

  const afterStart = shown();
  clock.tick(1);
  ok(shown() !== afterStart,
     `Play: এক tick-এর পরে পর্দার সংখ্যা বদলাতে হবে (ছিল ${afterStart}, আছে ${shown()})`);

  clock.tick(total + 3);          /* শেষ পর্যন্ত চালাও */
  ok(shown() === total + ' / ' + total, 'Play: শেষ ধাপ পর্যন্ত পৌঁছায়');
  ok(clock.timers.size === 0, 'Play: শেষে timer নিজে থেমে যায়');

  /* Pause */
  play();
  const mid = shown();
  play();                         /* ⏸ বিরতি */
  ok(clock.timers.size === 0, 'Pause: timer বন্ধ হয়');
  clock.tick(3);
  ok(shown() === mid, 'Pause: থামার পরে আর এগোয় না');
})();

ok(NS.ui.inspector.packetHTML(null).length > 0, 'packet select না থাকলেও চলে');
ok(NS.ui.inspector.deviceHTML(null).length > 0, 'device select না থাকলেও চলে');
ok(missingHelp.size === 0,
   'প্রতিটি packet field-এর Bangla ব্যাখ্যা আছে' +
   (missingHelp.size ? ` (নেই: ${[...missingHelp].join(', ')})` : ''));

console.log(`\n${checks} checks · ${fail} failure${fail === 1 ? '' : 's'}`);
process.exit(fail ? 1 : 0);
