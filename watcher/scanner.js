const fs = require('fs');
const path = require('path');
const { WATCH_ROOT, VALID_DIVISIONS, IMAGE_EXTENSIONS } = require('./config');
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
function getTodayFolderName() {
  const now = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

async function runScan() {
  const todayFolder = getTodayFolderName();

  log.info('=== Scan started ===');
  log.info(`Root: ${WATCH_ROOT}`);
  log.info(`Date filter: only processing folder "${todayFolder}"`);

  if (!fs.existsSync(WATCH_ROOT)) {
    log.error(`Watch root not accessible: ${WATCH_ROOT}`);
    return;
  }

  // Walk only YEAR → MONTH → <DIVISION> → <TODAY's DATE> subdirectories
  let totalFound = 0;
  let totalNew = 0;
  let totalOk = 0;
  let totalDup = 0;
  let totalFail = 0;

  // Enumerate year folders
  const yearDirs = listSubDirs(WATCH_ROOT);
  for (const yearDir of yearDirs) {
    // Enumerate month folders
    const monthDirs = listSubDirs(yearDir);
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

        for (const imgPath of images) {
          if (alreadyProcessed(imgPath)) {
            totalDup++;
            continue;
          }

          totalNew++;
          const meta = parsePath(imgPath);
          if (!meta) {
            log.warn(`Could not parse path, skipping: ${imgPath}`);
            totalFail++;
            mark(imgPath); // mark so we don't retry bad paths forever
            continue;
          }

          const catData = categoryMapping[meta.majorCategoryFolder] || null;
          if (!catData) {
            log.warn(`Unknown major category: "${meta.majorCategoryFolder}" — will submit without sub_division/mc_code`);
          }

          log.info(`Processing: ${imgPath}`);
          log.info(`  Division: ${meta.division} | Vendor: ${meta.vendorName} (${meta.vendorCode}) | MC: ${meta.majorCategoryFolder}`);

          try {
            const result = await submitImage(imgPath, meta, catData);

            if (result?.success) {
              log.ok(`  Submitted OK — jobId: ${result.data?.persistence?.jobId}`);
              mark(imgPath);
              totalOk++;
            } else if (result?.code === 'DUPLICATE') {
              log.warn(`  Already in DB (DUPLICATE) — marking as processed`);
              mark(imgPath);
              totalDup++;
            } else {
              log.error(`  Backend returned failure:`, JSON.stringify(result));
              totalFail++;
            }
          } catch (err) {
            const status = err?.response?.status;
            const data   = err?.response?.data;

            if (status === 409 && data?.code === 'DUPLICATE') {
              log.warn(`  Already in DB (409 DUPLICATE) — marking as processed`);
              mark(imgPath);
              totalDup++;
            } else {
              log.error(`  Request failed (HTTP ${status || 'N/A'}):`, err.message);
              if (data) log.error(`  Response:`, JSON.stringify(data));
              totalFail++;
              // Do NOT mark — will retry on next scheduled run
            }
          }
        }
      }
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
