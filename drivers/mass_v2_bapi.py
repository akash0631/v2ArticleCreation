import json, sys, time, urllib.request, csv, concurrent.futures

ENV = sys.argv[1] if len(sys.argv) > 1 else 'qa'
CONC = int(sys.argv[2]) if len(sys.argv) > 2 else 3
URL = f"https://sap-api.v2retail.net/api/rfc/proxy?env={ENV}"
H = {'Content-Type': 'application/json', 'X-RFC-Key': 'v2-rfc-proxy-2026', 'User-Agent': 'Mozilla/5.0'}

pool = json.load(open('C:/Users/akash.agarwal/.tmp/insert_pool.json'))
print(f'pool={len(pool)} env={ENV} conc={CONC} mode=V2_BAPI')

def call(p):
    body = json.dumps({
        'bapiname': 'Z_CLS_ADD_CHAR_BAPI',
        'IV_CLASS': p['mc'],
        'IV_ATNAM': p['attr'],
        'IV_KLART': '026',
        'IV_TEST': ' '
    }).encode()
    for a in range(3):
        try:
            req = urllib.request.Request(URL, data=body, headers=H, method='POST')
            with urllib.request.urlopen(req, timeout=60) as r:
                resp = json.loads(r.read().decode())
                return {**p, 'subrc': resp.get('EV_SUBRC',''), 'msg': resp.get('EV_MSG','')[:80]}
        except Exception as e:
            if a == 2:
                return {**p, 'subrc': 'EX', 'msg': str(e)[:100]}
            time.sleep(1)

t0 = time.time()
results = []
with concurrent.futures.ThreadPoolExecutor(max_workers=CONC) as ex:
    futures = {ex.submit(call, p): p for p in pool}
    done = 0
    for f in concurrent.futures.as_completed(futures):
        r = f.result(); results.append(r); done += 1
        if done % 50 == 0:
            el = time.time() - t0
            print(f'  {done}/{len(pool)} ({el:.0f}s {done/el:.1f}rps)')

el = time.time() - t0
ok_added = sum(1 for r in results if 'Added via BAPI' in r['msg'])
idem = sum(1 for r in results if 'already in class' in r['msg'])
fail = sum(1 for r in results if r['subrc'] not in ('0',''))
ex_err = sum(1 for r in results if r['subrc']=='EX')
print(f'DONE {el:.0f}s')
print(f'  added: {ok_added}')
print(f'  idem: {idem}')
print(f'  fail: {fail}')
print(f'  ex: {ex_err}')
with open(f'C:/Users/akash.agarwal/.tmp/mass_v2_{ENV}.csv','w',newline='') as f:
    w = csv.DictWriter(f, fieldnames=['mc','attr','clint','imerk','subrc','msg'])
    w.writeheader()
    for r in results: w.writerow({k:r.get(k,'') for k in ['mc','attr','clint','imerk','subrc','msg']})
