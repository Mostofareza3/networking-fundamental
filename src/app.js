(function(){
"use strict";

/* ═══════════════ THEME ═══════════════ */
var root = document.documentElement;
var themeBtn = document.getElementById('themeBtn');
function applyTheme(t){
  root.setAttribute('data-theme', t);
  themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
  try { localStorage.setItem('nf-theme', t); } catch(e){}
}
var saved = null;
try { saved = localStorage.getItem('nf-theme'); } catch(e){}
if(!saved){
  saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
applyTheme(saved);
themeBtn.addEventListener('click', function(){
  applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

/* ═══════════════ TOC / SIDEBAR ═══════════════ */
var TOC = [
  {p:'শুরু', items:[
    ['preface','Preface — কীভাবে পড়বেন','']
  ]},
  {p:'Part 1 · Big Picture', items:[
    ['ch1','What Is a Computer Network?','1'],
    ['ch2','Network Components','2'],
    ['ch3','Network Layers & Encapsulation','3']
  ]},
  {p:'Part 2 · Data & Packets', items:[
    ['ch4','Bits, Bytes, Frames, Packets','4'],
    ['ch5','MTU and Packet Size','5']
  ]},
  {p:'Part 3 · MAC & Ethernet', items:[
    ['ch6','MAC Addresses and Ethernet','6'],
    ['ch7','Switches','7'],
    ['ch8','ARP','8']
  ]},
  {p:'Part 4 · IP', items:[
    ['ch9','IP Addresses','9'],
    ['ch10','Subnetting','10'],
    ['ch11','Default Gateway','11']
  ]},
  {p:'Part 5 · Routing', items:[
    ['ch12','What Is Routing?','12'],
    ['ch13','Packet Journey','13'],
    ['ch14','ICMP','14']
  ]},
  {p:'Part 6 · Transport', items:[
    ['ch15','Why Transport Layer?','15'],
    ['ch16','Sockets','16'],
    ['ch17','TCP','17'],
    ['ch18','TCP Handshake','18'],
    ['ch19','TCP Data Transfer','19'],
    ['ch20','Flow Control','20'],
    ['ch21','Congestion Control','21'],
    ['ch22','Connection Termination','22'],
    ['ch23','UDP','23'],
    ['ch24','TCP vs UDP','24']
  ]},
  {p:'Part 7 · DNS', items:[
    ['ch25','Why DNS Exists','25'],
    ['ch26','DNS Resolution','26'],
    ['ch27','DNS Caching','27']
  ]},
  {p:'Part 8 · HTTP', items:[
    ['ch28','HTTP Fundamentals','28'],
    ['ch29','Methods & Status Codes','29'],
    ['ch30','HTTP Connections','30']
  ]},
  {p:'Part 9 · TLS & HTTPS', items:[
    ['ch31','Why HTTPS?','31'],
    ['ch32','Cryptography for Developers','32'],
    ['ch33','TLS Handshake','33']
  ]},
  {p:'Part 10 · NAT & Firewall', items:[
    ['ch34','NAT','34'],
    ['ch35','Firewalls','35']
  ]},
  {p:'Part 11 · Performance', items:[
    ['ch36','Latency','36'],
    ['ch37','Bandwidth vs Throughput','37'],
    ['ch38','Packet Loss & Jitter','38']
  ]},
  {p:'Part 12 · Debugging', items:[
    ['ch39','Debugging Toolkit & Sockets','39'],
    ['ch40','DNS Debugging','40'],
    ['ch41','Packet Capture','41']
  ]},
  {p:'Part 13 · The Internet', items:[
    ['ch42','What Is the Internet?','42'],
    ['ch43','Crossing the Internet','43']
  ]},
  {p:'Part 14 · Modern Networking', items:[
    ['ch44','HTTP/2','44'],
    ['ch45','HTTP/3 and QUIC','45'],
    ['ch46','CDN','46'],
    ['ch47','Load Balancing','47']
  ]},
  {p:'Part 15 · End-to-End', items:[
    ['ch48','What Happens When You Type a URL?','48']
  ]},
  {p:'Part 16 · Mental Models', items:[
    ['ch49','Developer Mental Models','49'],
    ['ch50','Final Knowledge Check','50']
  ]},
  {p:'Reference', items:[
    ['cheatsheet','Cheat Sheet',''],
    ['onepage','Networking in One Page','']
  ]}
];

var sb = document.getElementById('sidebar');
var html = '';
TOC.forEach(function(sec){
  html += '<div class="toc-part">' + sec.p + '</div>';
  sec.items.forEach(function(it){
    html += '<a class="' + (it[2] ? '' : 'no-n') + '" href="#' + it[0] +
            '" data-id="' + it[0] + '">' +
            (it[2] ? '<span class="n">' + it[2] + '</span>' : '') +
            '<span class="t">' + it[1] + '</span></a>';
  });
});
sb.innerHTML = html;

/* ═══════════════ MOBILE MENU ═══════════════ */
var menuBtn = document.getElementById('menuBtn');
var backdrop = document.getElementById('backdrop');
function closeMenu(){ sb.classList.remove('open'); backdrop.classList.remove('on'); }
menuBtn.addEventListener('click', function(){
  sb.classList.toggle('open');
  backdrop.classList.toggle('on');
});
backdrop.addEventListener('click', closeMenu);
sb.addEventListener('click', function(e){
  var a = e.target.closest ? e.target.closest('a[data-id]') : null;
  if(a && window.innerWidth <= 1080) closeMenu();
});

/* ═══════════════ ACTIVE SECTION + PROGRESS ═══════════════ */
var links = Array.prototype.slice.call(sb.querySelectorAll('a'));
var linkMap = {};
links.forEach(function(a){ linkMap[a.getAttribute('data-id')] = a; });
var sections = Array.prototype.slice.call(document.querySelectorAll('.chapter[id]'));
var progress = document.getElementById('progress');
var currentActive = null;
var ticking = false;

// A navigated chapter settles with its top edge ~150px down the viewport
// (html scroll-padding-top plus the chapter's own padding and margin). The
// activation line must sit just below that landing point: any higher and a
// chapter never counts as "reached", so the previous one stays lit — the
// leftover highlight this used to show.
var ACTIVE_LINE = 160;

function setActive(id, scrollIntoView){
  if(!id || id === currentActive) return;
  if(currentActive && linkMap[currentActive]) linkMap[currentActive].classList.remove('active');
  currentActive = id;
  var a = linkMap[id];
  if(!a) return;
  a.classList.add('active');
  if(scrollIntoView === false) return;
  var r = a.getBoundingClientRect(), sr = sb.getBoundingClientRect();
  if(r.top < sr.top + 48 || r.bottom > sr.bottom - 48){
    sb.scrollTop += (r.top - sr.top) - sb.clientHeight / 2;
  }
}

function currentSectionId(){
  var found = null;
  for(var i = 0; i < sections.length; i++){
    if(sections[i].getBoundingClientRect().top <= ACTIVE_LINE) found = sections[i].id;
    else break;
  }
  // Above the first chapter (hero) nothing is active; below the last, the
  // final chapter stays active even though its top has scrolled far away.
  if(!found && sections.length &&
     window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4){
    found = sections[sections.length - 1].id;
  }
  return found;
}

// While a click-driven smooth scroll is animating, the intermediate scroll
// events would drag the highlight back through every chapter in between. Lock
// it to the requested target until the page stops moving.
var lockedId = null, lockTimer = null, lastY = -1, settleFrames = 0;

function lockTo(id){
  if(!linkMap[id]) return;
  lockedId = id;
  setActive(id, false);
  if(lockTimer) cancelAnimationFrame(lockTimer);
  lastY = -1; settleFrames = 0;
  (function wait(){
    var y = window.scrollY;
    // Two consecutive identical frames means the smooth scroll has landed.
    settleFrames = (y === lastY) ? settleFrames + 1 : 0;
    lastY = y;
    if(settleFrames >= 2){ lockedId = null; lockTimer = null; return; }
    lockTimer = requestAnimationFrame(wait);
  })();
}

function onScroll(){
  var y = window.scrollY;
  var docH = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = (docH > 0 ? Math.min(100, (y / docH) * 100) : 0) + '%';
  if(!lockedId) setActive(currentSectionId());
  ticking = false;
}
window.addEventListener('scroll', function(){
  if(!ticking){ requestAnimationFrame(onScroll); ticking = true; }
}, {passive:true});

// Clicking a TOC entry latches it immediately, so the previous chapter never
// lingers as a leftover highlight.
sb.addEventListener('click', function(e){
  var a = e.target.closest ? e.target.closest('a[data-id]') : null;
  if(a) lockTo(a.getAttribute('data-id'));
});

// A wheel/touch/key scroll by the reader always wins over the lock.
['wheel','touchstart','keydown'].forEach(function(ev){
  window.addEventListener(ev, function(){
    if(lockedId){
      if(lockTimer) cancelAnimationFrame(lockTimer);
      lockedId = null; lockTimer = null;
    }
  }, {passive:true});
});

window.addEventListener('hashchange', function(){
  var id = location.hash.slice(1);
  if(linkMap[id]) lockTo(id);
});

onScroll();
if(location.hash && linkMap[location.hash.slice(1)]) lockTo(location.hash.slice(1));

/* ═══════════════ COPY BUTTONS ═══════════════ */
Array.prototype.forEach.call(document.querySelectorAll('.cb'), function(cb){
  var pre = cb.querySelector('pre');
  if(!pre) return;
  var btn = document.createElement('button');
  btn.className = 'cb-copy';
  btn.type = 'button';
  btn.textContent = 'copy';
  btn.addEventListener('click', function(){
    var txt = pre.innerText;
    var done = function(){
      btn.textContent = '✓ copied';
      btn.classList.add('done');
      setTimeout(function(){ btn.textContent = 'copy'; btn.classList.remove('done'); }, 1600);
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(done, function(){});
    } else {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch(e){}
      document.body.removeChild(ta);
    }
  });
  cb.appendChild(btn);
});

/* ═══════════════ TABS ═══════════════ */
Array.prototype.forEach.call(document.querySelectorAll('.tabs'), function(tabs){
  var btns = tabs.querySelectorAll('.tab-btns button');
  var panes = tabs.querySelectorAll('.tab-pane');
  Array.prototype.forEach.call(btns, function(b){
    b.addEventListener('click', function(){
      Array.prototype.forEach.call(btns, function(x){ x.classList.remove('on'); });
      Array.prototype.forEach.call(panes, function(x){ x.classList.remove('on'); });
      b.classList.add('on');
      var t = document.getElementById(b.getAttribute('data-t'));
      if(t) t.classList.add('on');
    });
  });
});

/* ═══════════════ PACKET DIAGRAM ═══════════════ */
Array.prototype.forEach.call(document.querySelectorAll('.pkt'), function(pkt){
  Array.prototype.forEach.call(pkt.querySelectorAll('.layer'), function(layer){
    layer.addEventListener('click', function(){
      var d = document.getElementById(layer.getAttribute('data-d'));
      if(!d) return;
      var wasOpen = d.classList.contains('on');
      Array.prototype.forEach.call(pkt.querySelectorAll('.detail'), function(x){ x.classList.remove('on'); });
      Array.prototype.forEach.call(pkt.querySelectorAll('.layer'), function(x){ x.classList.remove('open'); });
      if(!wasOpen){ d.classList.add('on'); layer.classList.add('open'); }
    });
  });
});

/* ═══════════════ STEPPERS ═══════════════ */
Array.prototype.forEach.call(document.querySelectorAll('.stepper'), function(sp){
  var steps = Array.prototype.slice.call(sp.querySelectorAll('.sp-step'));
  if(!steps.length) return;
  var dots = sp.querySelector('.dots');
  var info = sp.querySelector('.sp-i');
  var idx = 0;
  var seen = {};

  var prevB = document.createElement('button');
  prevB.className = 'iconbtn'; prevB.type = 'button'; prevB.textContent = '← আগে';
  var nextB = document.createElement('button');
  nextB.className = 'iconbtn'; nextB.type = 'button'; nextB.textContent = 'পরে →';
  var head = sp.querySelector('.sp-head');
  head.insertBefore(nextB, info);
  head.insertBefore(prevB, nextB);

  var dotBtns = [];
  steps.forEach(function(s, i){
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = (i + 1);
    b.addEventListener('click', function(){ show(i); });
    dots.appendChild(b);
    dotBtns.push(b);
  });

  function show(i){
    idx = Math.max(0, Math.min(steps.length - 1, i));
    seen[idx] = true;
    steps.forEach(function(s, j){ s.style.display = (j === idx ? 'block' : 'none'); });
    dotBtns.forEach(function(b, j){
      b.classList.toggle('on', j === idx);
      b.classList.toggle('seen', !!seen[j] && j !== idx);
    });
    info.textContent = (idx + 1) + ' / ' + steps.length;
    prevB.disabled = (idx === 0);
    nextB.disabled = (idx === steps.length - 1);
    prevB.style.opacity = idx === 0 ? '.4' : '1';
    nextB.style.opacity = idx === steps.length - 1 ? '.4' : '1';
  }
  prevB.addEventListener('click', function(){ show(idx - 1); });
  nextB.addEventListener('click', function(){ show(idx + 1); });
  show(0);
});

/* ═══════════════ SUBNET CALCULATOR ═══════════════ */
(function(){
  var inp = document.getElementById('cidrIn');
  var out = document.getElementById('cidrOut');
  var go = document.getElementById('cidrGo');
  if(!inp || !out) return;

  function toInt(ip){
    var p = ip.split('.');
    if(p.length !== 4) return null;
    var n = 0;
    for(var i = 0; i < 4; i++){
      var v = parseInt(p[i], 10);
      if(isNaN(v) || v < 0 || v > 255 || !/^\d+$/.test(p[i].trim())) return null;
      n = (n * 256) + v;
    }
    return n;
  }
  function toIp(n){
    n = n >>> 0;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  function toBin(n){
    n = n >>> 0;
    var s = '';
    for(var i = 31; i >= 0; i--){
      s += ((n >>> i) & 1);
      if(i % 8 === 0 && i !== 0) s += '.';
    }
    return s;
  }
  function row(k, v, cls){
    return '<div><span class="k">' + k + '</span><span class="' + (cls || 'v') + '">' + v + '</span></div>';
  }

  function calc(){
    var raw = inp.value.trim();
    var m = raw.match(/^([0-9.]+)\s*\/\s*(\d{1,2})$/);
    if(!m){ out.innerHTML = '<div class="err">✗ ফরম্যাট: 192.168.1.100/24</div>'; return; }
    var ipn = toInt(m[1]);
    var pfx = parseInt(m[2], 10);
    if(ipn === null){ out.innerHTML = '<div class="err">✗ অবৈধ IP address</div>'; return; }
    if(isNaN(pfx) || pfx < 0 || pfx > 32){ out.innerHTML = '<div class="err">✗ prefix ০ থেকে ৩২ এর মধ্যে হতে হবে</div>'; return; }

    var mask = pfx === 0 ? 0 : (0xFFFFFFFF << (32 - pfx)) >>> 0;
    var net = (ipn & mask) >>> 0;
    var bcast = (net | (~mask >>> 0)) >>> 0;
    var total = Math.pow(2, 32 - pfx);
    var usable, firstH, lastH;

    if(pfx === 32){ usable = 1; firstH = lastH = net; }
    else if(pfx === 31){ usable = 2; firstH = net; lastH = bcast; }
    else { usable = total - 2; firstH = (net + 1) >>> 0; lastH = (bcast - 1) >>> 0; }

    var isPriv = (ipn >>> 24) === 10 ||
                 ((ipn >>> 24) === 172 && ((ipn >>> 16) & 255) >= 16 && ((ipn >>> 16) & 255) <= 31) ||
                 ((ipn >>> 24) === 192 && ((ipn >>> 16) & 255) === 168);
    var isLoop = (ipn >>> 24) === 127;
    var isLL = (ipn >>> 24) === 169 && ((ipn >>> 16) & 255) === 254;
    var kind = isLoop ? 'Loopback (127.0.0.0/8)' :
               isLL ? '⚠ Link-local — DHCP ব্যর্থ হয়েছে' :
               isPriv ? 'Private (RFC 1918)' : 'Public';

    var h = '';
    h += row('Address', m[1] + '/' + pfx);
    h += row('ধরন', kind);
    h += '<div style="height:8px"></div>';
    h += row('Subnet mask', toIp(mask));
    h += row('Wildcard', toIp(~mask >>> 0));
    h += '<div style="height:8px"></div>';
    h += row('Network address', toIp(net));
    h += row('প্রথম host', pfx >= 31 ? toIp(firstH) : toIp(firstH));
    h += row('শেষ host', toIp(lastH));
    h += row('Broadcast', pfx >= 31 ? '—' : toIp(bcast));
    h += '<div style="height:8px"></div>';
    h += row('মোট address', total.toLocaleString('en-US'));
    h += row('ব্যবহারযোগ্য host', usable.toLocaleString('en-US'));
    h += row('Block size', Math.pow(2, 32 - pfx).toLocaleString('en-US'));
    h += '<div style="height:10px"></div>';
    h += row('Address (binary)', toBin(ipn), 'bin');
    h += row('Mask (binary)', toBin(mask), 'bin');
    h += row('Network (binary)', toBin(net), 'bin');
    h += '<div style="height:10px;border-top:1px solid var(--border);margin-top:8px"></div>';
    h += row('পরিসর', toIp(net) + '  –  ' + toIp(bcast));
    out.innerHTML = h;
  }
  go.addEventListener('click', calc);
  inp.addEventListener('input', calc);
  inp.addEventListener('keydown', function(e){ if(e.key === 'Enter') calc(); });
  calc();
})();

/* ═══════════════ SEARCH ═══════════════ */
(function(){
  var modal = document.getElementById('searchModal');
  var input = document.getElementById('searchInput');
  var results = document.getElementById('searchResults');
  var openBtn = document.getElementById('searchOpen');

  // Build index: chapters + headings + terms
  var index = [];
  TOC.forEach(function(sec){
    sec.items.forEach(function(it){
      index.push({t: it[1], c: sec.p, id: it[0], w: 100});
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.chapter'), function(ch){
    var chId = ch.id;
    var chTitle = ch.querySelector('h1') ? ch.querySelector('h1').textContent.trim() : chId;
    Array.prototype.forEach.call(ch.querySelectorAll('h2, h3'), function(h){
      if(!h.id){ h.id = chId + '-h-' + Math.random().toString(36).slice(2, 8); }
      index.push({t: h.textContent.trim(), c: chTitle, id: h.id, w: 50});
    });
    Array.prototype.forEach.call(ch.querySelectorAll('details.qa > summary'), function(s){
      var p = s.parentElement;
      if(!p.id){ p.id = chId + '-q-' + Math.random().toString(36).slice(2, 8); }
      index.push({t: s.textContent.trim(), c: chTitle, id: p.id, w: 20});
    });
  });

  // Extra technical term aliases
  var TERMS = [
    ['TIME_WAIT','ch22'],['CLOSE_WAIT','ch39'],['SO_REUSEADDR','ch22'],['SO_REUSEPORT','ch15'],
    ['three-way handshake','ch18'],['SYN','ch18'],['FIN','ch22'],['RST','ch22'],
    ['MTU','ch5'],['MSS','ch5'],['PMTUD','ch5'],['fragmentation','ch5'],
    ['ARP','ch8'],['MAC address','ch6'],['broadcast domain','ch7'],['CAM table','ch7'],
    ['CIDR','ch10'],['subnet mask','ch10'],['default gateway','ch11'],['longest prefix match','ch12'],
    ['TTL','ch13'],['traceroute','ch14'],['ping','ch14'],['ICMP','ch14'],
    ['port','ch15'],['ephemeral port','ch15'],['4-tuple','ch15'],['socket','ch16'],
    ['epoll','ch16'],['backpressure','ch20'],['receive window','ch20'],['cwnd','ch21'],
    ['slow start','ch21'],['AIMD','ch21'],['CUBIC','ch21'],['BBR','ch21'],['bufferbloat','ch21'],
    ['SACK','ch19'],['fast retransmit','ch19'],['head-of-line blocking','ch19'],
    ['bandwidth delay product','ch19'],['BDP','ch19'],['window scaling','ch19'],
    ['UDP','ch23'],['datagram','ch23'],['QUIC','ch45'],['HTTP/3','ch45'],['HTTP/2','ch44'],
    ['HPACK','ch44'],['multiplexing','ch44'],['stream','ch44'],
    ['DNS','ch26'],['NXDOMAIN','ch40'],['SERVFAIL','ch40'],['CNAME','ch26'],['A record','ch26'],
    ['MX record','ch26'],['glue record','ch26'],['negative caching','ch27'],['anycast','ch27'],
    ['HTTP','ch28'],['Host header','ch28'],['chunked','ch28'],['keep-alive','ch30'],
    ['status code','ch29'],['idempotent','ch29'],['502','ch29'],['504','ch29'],['401','ch29'],['403','ch29'],
    ['TLS','ch33'],['HTTPS','ch31'],['certificate','ch32'],['SNI','ch33'],['forward secrecy','ch32'],
    ['certificate authority','ch32'],['chain of trust','ch32'],['0-RTT','ch33'],['AEAD','ch32'],
    ['NAT','ch34'],['CGNAT','ch34'],['port forwarding','ch34'],['firewall','ch35'],
    ['DROP','ch35'],['REJECT','ch35'],['stateful','ch35'],
    ['latency','ch36'],['RTT','ch36'],['throughput','ch37'],['jitter','ch38'],['packet loss','ch38'],
    ['ss','ch39'],['tcpdump','ch41'],['dig','ch40'],['mtr','ch38'],['wireshark','ch41'],
    ['BGP','ch42'],['autonomous system','ch42'],['peering','ch42'],['IXP','ch42'],['transit','ch42'],
    ['CDN','ch46'],['cache-control','ch46'],['load balancer','ch47'],['consistent hashing','ch47'],
    ['health check','ch47'],['encapsulation','ch3'],['OSI','ch3'],['byte stream','ch4'],
    ['localhost','ch9'],['0.0.0.0','ch9'],['127.0.0.1','ch9'],['private IP','ch9'],['IPv6','ch9'],
    ['switch','ch7'],['router','ch12'],['Ethernet','ch6']
  ];
  TERMS.forEach(function(t){
    index.push({t: t[0], c: 'Concept', id: t[1], w: 80, term: true});
  });

  function esc(s){ return s.replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function mark(text, q){
    var lt = text.toLowerCase(), lq = q.toLowerCase();
    var i = lt.indexOf(lq);
    if(i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }

  var sel = -1, cur = [];

  function render(q){
    if(!q || q.length < 1){
      results.innerHTML = '<div class="empty">chapter, concept বা technical term লিখুন…<br><span style="font-size:12px">যেমন: TIME_WAIT, MTU, subnetting, TLS handshake</span></div>';
      cur = []; sel = -1;
      return;
    }
    var lq = q.toLowerCase();
    var scored = [];
    index.forEach(function(it){
      var lt = it.t.toLowerCase();
      var pos = lt.indexOf(lq);
      if(pos < 0) return;
      var s = it.w + (pos === 0 ? 40 : 0) + (lt === lq ? 60 : 0) - Math.min(pos, 20);
      scored.push({it: it, s: s});
    });
    scored.sort(function(a, b){ return b.s - a.s; });
    cur = scored.slice(0, 30).map(function(x){ return x.it; });
    sel = cur.length ? 0 : -1;

    if(!cur.length){
      results.innerHTML = '<div class="empty">কিছু পাওয়া যায়নি</div>';
      return;
    }
    results.innerHTML = cur.map(function(it, i){
      return '<a class="sr' + (i === 0 ? ' sel' : '') + '" href="#' + it.id + '" data-i="' + i + '">' +
             '<div class="t">' + mark(it.t, q) + '</div>' +
             '<div class="c">' + esc(it.c) + '</div></a>';
    }).join('');
  }

  function open(){
    modal.classList.add('on');
    input.value = '';
    render('');
    setTimeout(function(){ input.focus(); }, 30);
  }
  function close(){ modal.classList.remove('on'); }
  function goTo(i){
    if(i < 0 || i >= cur.length) return;
    close();
    location.hash = '#' + cur[i].id;
  }
  function updateSel(){
    Array.prototype.forEach.call(results.querySelectorAll('.sr'), function(a, i){
      a.classList.toggle('sel', i === sel);
      if(i === sel && a.scrollIntoView) a.scrollIntoView({block:'nearest'});
    });
  }

  openBtn.addEventListener('click', open);
  input.addEventListener('input', function(){ render(input.value.trim()); });
  results.addEventListener('click', function(e){
    var a = e.target.closest ? e.target.closest('.sr') : null;
    if(a){ e.preventDefault(); goTo(parseInt(a.getAttribute('data-i'), 10)); }
  });
  modal.addEventListener('click', function(e){ if(e.target === modal) close(); });

  document.addEventListener('keydown', function(e){
    if(modal.classList.contains('on')){
      if(e.key === 'Escape'){ close(); }
      else if(e.key === 'ArrowDown'){ e.preventDefault(); sel = Math.min(sel + 1, cur.length - 1); updateSel(); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); sel = Math.max(sel - 1, 0); updateSel(); }
      else if(e.key === 'Enter'){ e.preventDefault(); goTo(sel); }
      return;
    }
    var tag = (e.target.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    if(e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')){
      e.preventDefault(); open();
    }
  });
})();

/* ═══════════════ HASH SCROLL FIX for details ═══════════════ */
window.addEventListener('hashchange', function(){
  var el = document.getElementById(location.hash.slice(1));
  if(el && el.tagName === 'DETAILS') el.open = true;
});
if(location.hash){
  var el0 = document.getElementById(location.hash.slice(1));
  if(el0 && el0.tagName === 'DETAILS') el0.open = true;
}

})();
