#!/usr/bin/env python3
"""
Build src/ into a single self-contained index.html

Usage:
    ./build.sh            # build + verify
    ./build.sh --watch    # rebuild automatically when src/ changes
"""
import json, os, re, sys, time, hashlib

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(ROOT, 'src')
CH   = os.path.join(SRC, 'chapters')
SIM  = os.path.join(SRC, 'sim')
OUT  = os.path.join(ROOT, 'index.html')
SIMOUT = os.path.join(ROOT, 'simulator.html')

# Simulator JS load order matters: core defines the namespace the labs and UI
# attach themselves to, and registry must exist before any lab registers.
SIM_JS = [
    'core/engine.js', 'core/packet.js', 'core/net.js', 'core/registry.js',
    'labs/packet.js', 'labs/encap.js', 'labs/ethernet.js',
    'labs/switching.js', 'labs/arp.js',
    'labs/ip.js', 'labs/subnet.js', 'labs/routing.js',
    'labs/lpm.js', 'labs/ttl.js', 'labs/hop.js',
    'labs/handshake.js', 'labs/reliable.js', 'labs/ordering.js',
    'labs/flow.js', 'labs/close.js', 'labs/udp.js',
    'labs/tcpudp.js', 'labs/socket.js',
    'labs/dns.js', 'labs/dnscache.js', 'labs/http.js',
    'labs/tls.js', 'labs/nat.js', 'labs/firewall.js',
    'labs/latency.js', 'labs/queue.js', 'labs/cdn.js',
    'labs/lb.js', 'labs/breakit.js',
    'labs/journey.js',
    'ui/canvas.js', 'ui/inspector.js', 'ui/timeline.js', 'ui/app.js',
]

GREEN, RED, YEL, DIM, OFF = '\033[32m', '\033[31m', '\033[33m', '\033[2m', '\033[0m'


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def chapter_files():
    """Ordered chapter list. _order.json wins; otherwise sorted filenames."""
    order_path = os.path.join(CH, '_order.json')
    names = sorted(f for f in os.listdir(CH)
                   if f.endswith('.html') and not f.startswith('_'))
    if os.path.exists(order_path):
        order = json.load(open(order_path, encoding='utf-8'))
        known = set(order)
        # keep declared order, then append any new files alphabetically
        extra = [n for n in names if n not in known]
        if extra:
            print(f'{YEL}  note: {len(extra)} file(s) not in _order.json, appended: '
                  f'{", ".join(extra)}{OFF}')
        return [n for n in order if n in set(names)] + extra
    return names


def build():
    head = read(os.path.join(SRC, 'head.html'))
    tail = read(os.path.join(SRC, 'tail.html'))
    css  = read(os.path.join(SRC, 'style.css')).rstrip('\n')
    js   = read(os.path.join(SRC, 'app.js')).rstrip('\n')

    files = chapter_files()
    body = '\n'.join(read(os.path.join(CH, f)).rstrip('\n') for f in files)

    if '<!--INJECT:CSS-->' not in head:
        raise SystemExit('src/head.html is missing the <!--INJECT:CSS--> marker')
    if '<!--INJECT:JS-->' not in tail:
        raise SystemExit('src/tail.html is missing the <!--INJECT:JS--> marker')

    html = head.replace('<!--INJECT:CSS-->', css) \
         + '\n' + body + '\n' \
         + tail.replace('<!--INJECT:JS-->', js)

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    return html, files


def build_sim():
    """Bundle src/sim/ into a single self-contained simulator.html."""
    shell = read(os.path.join(SIM, 'shell.html'))
    css   = read(os.path.join(SIM, 'style.css')).rstrip('\n')

    parts = []
    for rel in SIM_JS:
        path = os.path.join(SIM, rel)
        if not os.path.exists(path):
            raise SystemExit(f'src/sim/{rel} is missing (listed in SIM_JS)')
        parts.append(f'/* ─── {rel} ─── */\n' + read(path).rstrip('\n'))
    js = '\n\n'.join(parts)

    if '<!--INJECT:CSS-->' not in shell:
        raise SystemExit('src/sim/shell.html is missing the <!--INJECT:CSS--> marker')
    if '<!--INJECT:JS-->' not in shell:
        raise SystemExit('src/sim/shell.html is missing the <!--INJECT:JS--> marker')

    html = shell.replace('<!--INJECT:CSS-->', css).replace('<!--INJECT:JS-->', js)
    with open(SIMOUT, 'w', encoding='utf-8') as f:
        f.write(html)
    return html, len(SIM_JS)


def verify_sim(html):
    """Simulator-specific checks. The book's rules do not all apply here."""
    errs = []

    for tag in ('script', 'style'):
        o = len(re.findall(r'<%s[\s>]' % tag, html))
        c = len(re.findall(r'</%s>' % tag, html))
        if o != c:
            errs.append(f'sim: <{tag}> unbalanced: {o} open, {c} close')

    css = re.search(r'<style>(.*?)</style>', html, re.S)
    if css and css.group(1).count('{') != css.group(1).count('}'):
        errs.append('sim: CSS braces unbalanced')

    # Self-contained, exactly like the book.
    for e in sorted(set(re.findall(r'(?:src|href)="(https?://[^"]+)"', html))):
        errs.append(f'sim: external resource breaks self-containment: {e}')

    # Every element the UI reaches for by id must exist in the shell.
    ids = set(re.findall(r'\sid="([^"]+)"', html))
    for need in re.findall(r"\$\('([A-Za-z0-9_]+)'\)", html):
        if need not in ids:
            errs.append(f'sim: app.js uses #{need} but the shell has no such element')

    # Every registered lab must point at a chapter that exists in the book.
    if os.path.exists(OUT):
        book = read(OUT)
        book_ids = set(re.findall(r'\sid="([^"]+)"', book))
        for ch in re.findall(r"chapter:\s*'([^']+)'", html):
            if ch not in book_ids:
                errs.append(f'sim: lab links to missing book section #{ch}')

    # Every lab named in LAB_ORDER must actually register itself.
    order = re.search(r'LAB_ORDER\s*=\s*\[([^\]]*)\]', html)
    if order:
        declared = re.findall(r"'([^']+)'", order.group(1))
        defined  = set(re.findall(r"NS\.labs\.([A-Za-z0-9_]+)\s*=", html))
        for d in declared:
            if d not in defined:
                errs.append(f'sim: LAB_ORDER lists "{d}" but no lab registers it')

    return errs


def verify(html):
    """Structural checks that catch the mistakes that actually happen."""
    errs, warns = [], []

    # 1. Raw HTML tags inside <pre> would be parsed by the browser and eat content.
    for m in re.finditer(r'<pre>(.*?)</pre>', html, re.S):
        for t in re.finditer(r'<(/?[a-zA-Z][a-zA-Z0-9]*)', m.group(1)):
            line = html[:m.start() + t.start()].count('\n') + 1
            errs.append(f'line {line}: raw <{t.group(1)}> inside <pre> '
                        f'(escape it as &lt;{t.group(1)})')

    # 2. Exactly one real <script>/<style> pair.
    for tag in ('script', 'style'):
        o = len(re.findall(r'<%s[\s>]' % tag, html))
        c = len(re.findall(r'</%s>' % tag, html))
        if o != c:
            errs.append(f'<{tag}> tags unbalanced: {o} open, {c} close')

    # 3. Tag balance for containers that break layout when wrong.
    for tag in ('section', 'div', 'details', 'table', 'pre', 'tbody', 'thead'):
        o = len(re.findall(r'<%s[\s>]' % tag, html))
        c = len(re.findall(r'</%s>' % tag, html))
        if o != c:
            errs.append(f'<{tag}> unbalanced: {o} open, {c} close')

    # 4. CSS braces.
    css = re.search(r'<style>(.*?)</style>', html, re.S)
    if css and css.group(1).count('{') != css.group(1).count('}'):
        errs.append('CSS braces unbalanced')

    # 5. Every #anchor resolves to a real id.
    ids   = set(re.findall(r'\sid="([^"]+)"', html))
    hrefs = set(re.findall(r'href="#([^"]+)"', html))
    for h in sorted(hrefs - ids):
        if "' +" in h:      # JS template strings, not real hrefs
            continue
        errs.append(f'broken anchor: #{h}')

    # 6. Self-contained: no external resources.
    ext = set(re.findall(r'(?:src|href)="(https?://[^"]+)"', html))
    for e in sorted(ext):
        errs.append(f'external resource breaks self-containment: {e}')

    # 7. Sidebar TOC entries must point at sections that exist.
    for cid in re.findall(r"\['(ch\d+|preface|cheatsheet|onepage)',", html):
        if cid not in ids:
            errs.append(f'sidebar links to missing section: #{cid}')

    # 8. Stepper data-steps must match actual step count.
    for m in re.finditer(r'<div class="stepper" data-steps="(\d+)" id="([^"]+)"', html):
        declared, sid = int(m.group(1)), m.group(2)
        seg = html[m.end():html.find('</div>\n    <div class="dots">', m.end()) + 1]
        actual = len(re.findall(r'class="sp-step" data-i="', seg))
        if actual and actual != declared:
            warns.append(f'stepper #{sid}: data-steps={declared} but {actual} steps found')

    return errs, warns


def stats(html, files):
    def n(p):
        return len(re.findall(p, html))
    return {
        'chapters':  n(r'<section class="chapter" id='),
        'parts':     n(r'class="part-head"'),
        'diagrams':  n(r'class="cb diagram"'),
        'code':      n(r'class="cb'),
        'tables':    n(r'<table>'),
        'qa':        n(r'details class="qa"'),
        'labs':      n(r'class="lab">'),
        'steppers':  n(r'class="stepper"'),
        'files':     len(files),
        'bytes':     len(html.encode('utf-8')),
    }


def once():
    html, files = build()
    errs, warns = verify(html)
    st = stats(html, files)

    sim_html, sim_n = build_sim()
    errs += verify_sim(sim_html)

    for w in warns:
        print(f'{YEL}  warn  {w}{OFF}')
    if errs:
        print(f'{RED}✗ build failed — {len(errs)} problem(s):{OFF}')
        for e in errs[:25]:
            print(f'{RED}  · {e}{OFF}')
        if len(errs) > 25:
            print(f'{RED}  … and {len(errs) - 25} more{OFF}')
        return False

    mb = st['bytes'] / 1024 / 1024
    print(f'{GREEN}✓ index.html{OFF}  '
          f'{st["bytes"]:,} bytes ({mb:.2f} MB)  from {st["files"]} source files')
    print(f'{DIM}  {st["chapters"]} chapters · {st["parts"]} parts · '
          f'{st["diagrams"]} diagrams · {st["code"]} code blocks · '
          f'{st["tables"]} tables · {st["qa"]} Q&A · {st["labs"]} labs{OFF}')

    n_labs = len(re.findall(r'NS\.labs\.[A-Za-z0-9_]+\s*=', sim_html))
    print(f'{GREEN}✓ simulator.html{OFF}  '
          f'{len(sim_html.encode("utf-8")):,} bytes  from {sim_n} modules')
    print(f'{DIM}  {n_labs} labs · engine + UI আলাদা · deterministic{OFF}')
    return True


def watch():
    def snapshot():
        h = hashlib.md5()
        for root, _, fs in os.walk(SRC):
            for f in sorted(fs):
                p = os.path.join(root, f)
                h.update(f.encode())
                try:
                    with open(p, 'rb') as fh:
                        h.update(fh.read())
                except OSError:
                    pass
        return h.hexdigest()

    print(f'{DIM}watching src/ — Ctrl+C to stop{OFF}')
    once()
    last = snapshot()
    try:
        while True:
            time.sleep(0.6)
            cur = snapshot()
            if cur != last:
                last = cur
                print(f'{DIM}{time.strftime("%H:%M:%S")}{OFF} change detected')
                once()
    except KeyboardInterrupt:
        print('\nstopped')


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except AttributeError:
        pass
    if '--watch' in sys.argv:
        watch()
    else:
        sys.exit(0 if once() else 1)
