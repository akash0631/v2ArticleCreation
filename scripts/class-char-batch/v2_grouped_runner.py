import json, sys, os, time, urllib.request, concurrent.futures, csv
from collections import defaultdict

ENV = sys.argv[1] if len(sys.argv) > 1 else 'qa'
CLASS_CONC = int(sys.argv[2]) if len(sys.argv) > 2 else 8
INPUT = sys.argv[3] if len(sys.argv) > 3 else os.environ.get('POOL', 'data/insert_pool.json')
OUTDIR = sys.argv[4] if len(sys.argv) > 4 else os.environ.get('OUTDIR', '.')
URL = f"https://sap-api.v2retail.net/api/rfc/proxy?env={ENV}"
H = {'Content-Type': 'application/json', 'X-RFC-Key': 'v2-rfc-proxy-2026', 'User-Agent': 'Mozilla/5.0'}

raw = json.load(open(INPUT))
if isinstance(raw, dict) and 'by_class' in raw:
    g = raw['by_class']
else:
    pool = raw if isinstance(raw, list) else raw.get('pairs', [])
    g = defaultdict(list)
    for p in pool:
        g[p['mc']].append(p)
    g = dict(g)
total = sum(len(v) for v in g.values())
print(f'input={INPUT} classes={len(g)} pairs={total} class_conc={CLASS_CONC}')

def call(p):
    body = json.dumps({'bapiname': 'Z_CLS_ADD_CHAR_BAPI', 'IV_CLASS': p['mc'], 'IV_ATNAM': p['attr'], 'IV_KLART': '026', 'IV_TEST': ' '}).encode()
    for a in range(5):
        try:
            req = urllib.request.Request(URL, data=body, headers=H, method='POST')
            with urllib.request.urlopen(req, timeout=60) as r:
                resp = json.loads(r.read().decode())
                msg = resp.get('EV_MSG','')[:80]; subrc = resp.get('EV_SUBRC','')
                if subrc == '0' and ('Added' in msg or 'already' in msg):
                    return {**p, 'subrc': subrc, 'msg': msg, 'attempt': a+1}
                elif 'BRONZE_BOT' in msg or 'locked' in msg.lower():
                    time.sleep(2); continue
                else:
                    return {**p, 'subrc': subrc, 'msg': msg, 'attempt': a+1}
        except Exception as e:
            if a == 4: return {**p, 'subrc': 'EX', 'msg': str(e)[:80], 'attempt': a+1}
            time.sleep(1)
    return {**p, 'subrc': 'LOCKED', 'msg': 'still locked', 'attempt': 5}

def process_class(mc, pairs):
    results = []
    for p in pairs:
        results.append(call(p))
    return results

t0 = time.time()
all_results = []
with concurrent.futures.ThreadPoolExecutor(max_workers=CLASS_CONC) as ex:
    futs = {ex.submit(process_class, mc, pairs): mc for mc, pairs in g.items()}
    done = 0
    for f in concurrent.futures.as_completed(futs):
        results = f.result()
        all_results.extend(results)
        done += 1
        if done % 10 == 0:
            el = time.time() - t0
            print(f'  classes {done}/{len(g)} pairs={len(all_results)} ({el:.0f}s)')

el = time.time() - t0
added = sum(1 for r in all_results if 'Added' in r['msg'])
idem = sum(1 for r in all_results if 'already' in r['msg'])
fail = sum(1 for r in all_results if r['subrc'] not in ('0',''))
print(f'DONE {el:.0f}s')
print(f'  added: {added}')
print(f'  idem: {idem}')
print(f'  fail: {fail}')
outpath = os.path.join(OUTDIR, f'v2_grouped_{ENV}.csv')
os.makedirs(OUTDIR, exist_ok=True)
with open(outpath,'w',newline='') as f:
    w = csv.DictWriter(f, fieldnames=['mc','attr','clint','imerk','subrc','msg','attempt'])
    w.writeheader()
    for r in all_results: w.writerow(r)
print(f'csv={outpath}')
