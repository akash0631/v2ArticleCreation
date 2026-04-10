const fs = require('fs');
const path = require('path');
const {
  WATCH_ROOT, VALID_DIVISIONS, IMAGE_EXTENSIONS, FLAT_MODE,
  DEFAULT_DIVISION, DEFAULT_SUB_DIVISION, DEFAULT_VENDOR_NAME,
  DEFAULT_VENDOR_CODE, DEFAULT_MAJOR_CATEGORY, DEFAULT_MC_CODE,
  CONCURRENCY,
} = require('./config');
const { parsePath } = require('./pathParser');
const { has: alreadyProcessed, mark } = require('./processedTracker');
const { submitImage } = require('./apiClient');
const log = require('./logger');

const categoryMapping = require('./categoryMapping.json');

/**
 * Recursively collect all image files under a directory.
 */
function collectImages(dir, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    log.warn(`Cannot read directory: ${dir} — ${e.message}`);
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectImages(fullPath, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Process an array of tasks (async functions) with a concurrency cap.
 * Returns { ok, dup, fail } counts aggregated from each task.
 */
async function processInBatches(tasks, concurrency) {
  let ok = 0, dup = 0, fail = 0;
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(fn => fn()));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        ok  += r.value.ok;
        dup += r.value.dup;
        fail += r.value.fail;
      } else {
        log.error('Unexpected batch error:', r.reason);
        fail++;
      }
    }
    log.info(`  Batch ${Math.floor(i / concurrency) + 1} done — processed ${Math.min(i + concurrency, tasks.length)} / ${tasks.length}`);
  }
  return { ok, dup, fail };
}

/**
 * Run one scan cycle:
 * 1. Walk WATCH_ROOT → find all images under MENS/WOMENS/LADIES/KIDS
 * 2. For each new image (not in processedTracker):
 *    - Parse path → extract metadata
 *    - Look up category mapping
 *    - Submit to backend API
 *    - Mark as processed
 */
/**
 * Get today's date folder name in DD.MM.YYYY format (matches folder naming convention).
 * e.g. April 3 2026 → "03.04.2026"
 */
const MONTH_NAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function getTodayFolderName(overrideDate) {
  const now = overrideDate || new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function getCurrentYear(overrideDate) {
  return String((overrideDate || new Date()).getFullYear());
}

function getCurrentMonthName(overrideDate) {
  return MONTH_NAMES[(overrideDate || new Date()).getMonth()]; // e.g. "APR"
}

/**
 * Parse --date=DD.MM.YYYY from CLI args, returns a Date object or null.
 */
function parseDateArg() {
  const arg = process.argv.find(a => a.startsWith('--date='));
  if (!arg) return null;
  const val = arg.split('=')[1]; // e.g. "02.04.2026"
  const parts = val.split('.');
  if (parts.length !== 3) {
    log.warn(`Invalid --date format "${val}". Use DD.MM.YYYY`);
    return null;
  }
  const [dd, mm, yyyy] = parts;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

async function runScan() {
  if (FLAT_MODE) {
    return runFlatScan();
  }
  return runHierarchyScan();
}

/**
 * Submit one image and return { ok, dup, fail } counts.
 * Marks the image as processed on success or confirmed duplicate.
 */
async function submitOne(imgPath, meta, catData) {
  try {
    const result = await submitImage(imgPath, meta, catData);
    if (result?.success) {
      log.ok(`  OK — ${imgPath} — jobId: ${result.data?.persistence?.jobId}`);
      mark(imgPath);
      return { ok: 1, dup: 0, fail: 0 };
    } else if (result?.code === 'DUPLICATE') {
      log.warn(`  DUPLICATE (body) — marking: ${imgPath}`);
      mark(imgPath);
      return { ok: 0, dup: 1, fail: 0 };
    } else {
      log.error(`  Backend failure: ${imgPath}`, JSON.stringify(result));
      return { ok: 0, dup: 0, fail: 1 };
    }
  } catch (err) {
    const status = err?.response?.status;
    const data   = err?.response?.data;
    if (status === 409 && data?.code === 'DUPLICATE') {
      log.warn(`  DUPLICATE (409) — marking: ${imgPath}`);
      mark(imgPath);
      return { ok: 0, dup: 1, fail: 0 };
    }
    log.error(`  Request failed (HTTP ${status || 'N/A'}): ${imgPath}`, err.message);
    if (data) log.error(`  Response:`, JSON.stringify(data));
    return { ok: 0, dup: 0, fail: 1 };
  }
}

// ── FLAT MODE ────────────────────────────────────────────────────────────────
// Collect every image directly under WATCH_ROOT (and sub-folders) and submit
// with whatever DEFAULT_* metadata was configured in .env.
async function runFlatScan() {
  log.info('=== Flat-mode scan started ===');
  log.info(`Root: ${WATCH_ROOT}`);
  log.info(`Default division: "${DEFAULT_DIVISION || '(none)'}" | Vendor: "${DEFAULT_VENDOR_NAME || '(none)'}" | MC: "${DEFAULT_MAJOR_CATEGORY || '(none)'}"`);

  if (!fs.existsSync(WATCH_ROOT)) {
    log.error(`Watch root not accessible: ${WATCH_ROOT}`);
    return;
  }

  const images = collectImages(WATCH_ROOT);
  const totalFound = images.length;

  log.info(`Images found: ${totalFound} | Concurrency: ${CONCURRENCY}`);

  // Split into new vs already-done
  const newImages = [];
  let totalDup = 0;
  for (const imgPath of images) {
    if (alreadyProcessed(imgPath)) { totalDup++; } else { newImages.push(imgPath); }
  }
  log.info(`  New: ${newImages.length} | Already processed: ${totalDup}`);

  const catData = DEFAULT_MC_CODE || DEFAULT_SUB_DIVISION
    ? { sub_division: DEFAULT_SUB_DIVISION, mc_code: DEFAULT_MC_CODE }
    : null;

  const tasks = newImages.map(imgPath => async () => {
    const imageName = path.basename(imgPath);
    log.info(`Processing: ${imgPath}`);
    const meta = {
      division:            DEFAULT_DIVISION,
      vendorName:          DEFAULT_VENDOR_NAME,
      vendorCode:          DEFAULT_VENDOR_CODE,
      majorCategoryFolder: DEFAULT_MAJOR_CATEGORY,
      imageName,
    };
    return submitOne(imgPath, meta, catData);
  });

  const { ok: totalOk, dup: dupFromSubmit, fail: totalFail } = await processInBatches(tasks, CONCURRENCY);
  totalDup += dupFromSubmit;

  log.info('=== Flat-mode scan complete ===');
  log.info(`  Found:     ${totalFound}`);
  log.info(`  New:       ${newImages.length}`);
  log.info(`  Submitted: ${totalOk}`);
  log.info(`  Duplicate: ${totalDup}`);
  log.info(`  Failed:    ${totalFail}`);
}

// ── HIERARCHY MODE (original) ────────────────────────────────────────────────
async function runHierarchyScan() {
  const overrideDate = parseDateArg();
  const todayFolder = getTodayFolderName(overrideDate);

  log.info('=== Scan started ===');
  log.info(`Root: ${WATCH_ROOT}`);
  if (overrideDate) {
    log.info(`Date override: processing folder "${todayFolder}" (--date flag)`);
  } else {
    log.info(`Date filter: only processing folder "${todayFolder}"`);
  }

  if (!fs.existsSync(WATCH_ROOT)) {
    log.error(`Watch root not accessible: ${WATCH_ROOT}`);
    return;
  }

  // Walk only YEAR → MONTH → <DIVISION> → <TARGET DATE> subdirectories
  let totalFound = 0;
  let totalNew = 0;
  let totalOk = 0;
  let totalDup = 0;
  let totalFail = 0;

  const currentYear = getCurrentYear(overrideDate);
  const currentMonth = getCurrentMonthName(overrideDate);
  log.info(`Year filter: ${currentYear} | Month filter: ${currentMonth}`);

  // Only enter current year folder
  const yearDir = path.join(WATCH_ROOT, currentYear);
  if (!fs.existsSync(yearDir)) {
    log.warn(`Year folder not found: ${yearDir}`);
    return;
  }

  // Only enter current month folder
  const monthDirs = listSubDirs(yearDir).filter(d => path.basename(d).toUpperCase() === currentMonth);
  for (const monthDir of monthDirs) {
      // Only enter VALID_DIVISIONS folders, ignore the rest
      let divDirs;
      try {
        divDirs = fs.readdirSync(monthDir, { withFileTypes: true })
          .filter(e => e.isDirectory() && VALID_DIVISIONS.includes(e.name.toUpperCase()))
          .map(e => path.join(monthDir, e.name));
      } catch (e) {
        log.warn(`Cannot read month dir: ${monthDir} — ${e.message}`);
        continue;
      }

      for (const divDir of divDirs) {
        // Only enter the date folder that matches TODAY — skip all other dates
        let dateDirs;
        try {
          dateDirs = fs.readdirSync(divDir, { withFileTypes: true })
            .filter(e => e.isDirectory() && e.name === todayFolder)
            .map(e => path.join(divDir, e.name));
        } catch (e) {
          log.warn(`Cannot read division dir: ${divDir} — ${e.message}`);
          continue;
        }

        if (dateDirs.length === 0) {
          log.info(`  No folder "${todayFolder}" found under ${divDir} — skipping`);
          continue;
        }

        // Collect all images inside today's date folder only
        const images = collectImages(dateDirs[0]);
        totalFound += images.length;

        // Separate new from already-processed
        const newImages = [];
        for (const imgPath of images) {
          if (alreadyProcessed(imgPath)) { totalDup++; } else { newImages.push(imgPath); }
        }
        totalNew += newImages.length;

        // Build task list
        const tasks = [];
        for (const imgPath of newImages) {
          const meta = parsePath(imgPath);
          if (!meta) {
            log.warn(`Could not parse path, skipping: ${imgPath}`);
            totalFail++;
            mark(imgPath);
            continue;
          }
          const catData = categoryMapping[meta.majorCategoryFolder] || null;
          if (!catData) {
            log.warn(`Unknown major category: "${meta.majorCategoryFolder}" — submitting without sub_division/mc_code`);
          }
          log.info(`Queuing: ${imgPath}`);
          log.info(`  Division: ${meta.division} | Vendor: ${meta.vendorName} (${meta.vendorCode}) | MC: ${meta.majorCategoryFolder}`);
          tasks.push(() => submitOne(imgPath, meta, catData));
        }

        const counts = await processInBatches(tasks, CONCURRENCY);
        totalOk   += counts.ok;
        totalDup  += counts.dup;
        totalFail += counts.fail;
      }
    }

  log.info('=== Scan complete ===');
  log.info(`  Found:     ${totalFound}`);
  log.info(`  New:       ${totalNew}`);
  log.info(`  Submitted: ${totalOk}`);
  log.info(`  Duplicate: ${totalDup}`);
  log.info(`  Failed:    ${totalFail}`);
}

function listSubDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => path.join(dir, e.name));
  } catch (e) {
    log.warn(`Cannot list directory: ${dir} — ${e.message}`);
    return [];
  }
}

module.exports = { runScan };
