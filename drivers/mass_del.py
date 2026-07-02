import json, sys, time, urllib.request, csv, concurrent.futures

ENV = sys.argv[1] if len(sys.argv) > 1 else 'qa'
CONC = int(sys.argv[2]) if len(sys.argv) > 2 else 6
URL = f"https://sap-api.v2retail.net/api/rfc/proxy?env={ENV}"
H = {'Content-Type': 'application/json', 'X-RFC-Key': 'v2-rfc-proxy-2026', 'User-Agent': 'Mozilla/5.0'}

pool = json.load(open('C:/Users/akash.agarwal/.tmp/insert_pool.json'))
print(f'pool={len(pool)} env={ENV} conc={CONC}')

def call(p):
    body = json.dumps({
        'bapiname': 'Z_KSML_DEL_ONE',
        'IV_CLINT': p['clint'],
        'IV_IMERK': p['imerk']
    }).encode()
    for a in range(3):
        try:
            req = urllib.request.Request(URL, data=body, headers=H, method='POST')
            with urllib.request.urlopen(req, timeout=30) as r:
                resp = json.loads(r.read().decode())
                return {**p, 'deleted': resp.get('EV_DELETED','0'), 'subrc': resp.get('EV_SUBRC','')}
        except Exception as e:
            if a == 2:
                return {**p, 'deleted': '?', 'subrc': 'EX', 'msg': str(e)[:100]}
            time.sleep(0.5)

t0 = time.time()
results = []
with concurrent.futures.ThreadPoolExecutor(max_workers=CONC) as ex:
    futures = {ex.submit(call, p): p for p in pool}
    done = 0
    for f in concurrent.futures.as_completed(futures):
        r = f.result(); results.append(r); done += 1
        if done % 200 == 0:
            print(f'  {done}/{len(pool)} ({(time.time()-t0):.0f}s)')

el = time.time() - t0
deleted_1 = sum(1 for r in results if r['deleted']=='1')
deleted_0 = sum(1 for r in results if r['deleted']=='0')
err = sum(1 for r in results if r['subrc']=='EX')
print(f'DONE {el:.0f}s deleted={deleted_1} not_found={deleted_0} err={err}')
with open(f'C:/Users/akash.agarwal/.tmp/mass_del_{ENV}.csv','w',newline='') as f:
    w = csv.DictWriter(f, fieldnames=['mc','attr','clint','imerk','deleted','subrc'])
    w.writeheader()
    for r in results: w.writerow({k:r.get(k,'') for k in ['mc','attr','clint','imerk','deleted','subrc']})
