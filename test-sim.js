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
  return { id, innerHTML:'', textContent:'', disabled:false, value:'1200',
    classList:{toggle(){},remove(){},add(){},contains(){return false}},
    addEventListener(){}, querySelector(){return null}, querySelectorAll(){return []},
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
global.setInterval = () => 0;
global.clearInterval = () => {};

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

ok(NS.ui.inspector.packetHTML(null).length > 0, 'packet select না থাকলেও চলে');
ok(NS.ui.inspector.deviceHTML(null).length > 0, 'device select না থাকলেও চলে');
ok(missingHelp.size === 0,
   'প্রতিটি packet field-এর Bangla ব্যাখ্যা আছে' +
   (missingHelp.size ? ` (নেই: ${[...missingHelp].join(', ')})` : ''));

console.log(`\n${checks} checks · ${fail} failure${fail === 1 ? '' : 's'}`);
process.exit(fail ? 1 : 0);
