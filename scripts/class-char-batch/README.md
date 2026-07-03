# Class-Char Batch Runner

Bulk-adds characteristics to classification classes via `Z_CLS_ADD_CHAR_BAPI` through the rfc-api generic proxy.

## Usage

```bash
python v2_grouped_runner.py <env> <class_conc> [input_path] [outdir]
```

Args:
- `env` — `qa` or `prod` (default `qa`)
- `class_conc` — parallel classes (default `8`)
- `input_path` — flat pairs JSON or grouped (default `data/insert_pool.json`)
- `outdir` — CSV output dir (default `.`)

Env vars: `POOL`, `OUTDIR`.

Examples:
```bash
python v2_grouped_runner.py qa 8
python v2_grouped_runner.py qa 8 data/insert_pool.json ./out
POOL=data/insert_pool.json OUTDIR=./out python v2_grouped_runner.py qa 8
```

## Input format

Flat array (auto-grouped by `mc`):
```json
[{"mc":"111010301","attr":"M_AGE_GROUP","clint":"0000008065","imerk":"0000001233"}, ...]
```

Or pre-grouped:
```json
{"by_class":{"111010301":[{...}, {...}], ...}}
```

## Output

CSV `<outdir>/v2_grouped_<env>.csv` with columns: `mc,attr,clint,imerk,subrc,msg,attempt`.

## Concurrency model

- Classes parallel via ThreadPool (`class_conc` workers)
- Pairs serial within each class (avoids SAP class-level lock)
- 5 retries per pair on `BRONZE_BOT` / `locked` msg
