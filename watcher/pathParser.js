const path = require('path');
const { VALID_DIVISIONS, IMAGE_EXTENSIONS, WATCH_ROOT } = require('./config');

// Normalize folder names to consistent division values:
// WOMENS / WOMEN / LADIES → all stored as LADIES (same department)
// MENS / MEN → MENS
// KIDS / KID → KIDS
const DIVISION_NORMALIZE = {
  WOMENS: 'LADIES',
  WOMEN:  'LADIES',
  LADIES: 'LADIES',
  MENS:   'MENS',
  MEN:    'MENS',
  KIDS:   'KIDS',
  KID:    'KIDS',
};

/**
 * Parse a full image file path and extract all metadata from the folder hierarchy.
 *
 * Expected structure:
 * <WATCH_ROOT>\<YEAR>\<MONTH>\<DIVISION>\<DATE>\<VENDOR_NAME-VENDOR_CODE>\<MAJOR_CATEGORY>\<image.jpg>
 *
 * Example:
 * \\File\0-v2\...\02-P-PHOTOS\2026\MAR\MENS\26.03.2026\AR ENTERPRISES-200605\MW_TXT_JKT_FS\image.jpg
 *
 * Returns null if the path doesn't match the expected structure.
 */
function parsePath(filePath) {
  // Normalize separators
  const normalized = filePath.replace(/\//g, '\\');
  const root = WATCH_ROOT.replace(/\//g, '\\');

  // Strip the root prefix
  let relative = normalized;
  if (normalized.toLowerCase().startsWith(root.toLowerCase())) {
    relative = normalized.slice(root.length).replace(/^\\+/, '');
  }

  // Split remaining path into parts
  const parts = relative.split('\\').filter(Boolean);

  // Minimum required: YEAR \ MONTH \ DIVISION \ DATE \ VENDOR_FOLDER \ MAJOR_CATEGORY \ image
  if (parts.length < 7) return null;

  const [year, month, division, date, vendorFolder, majorCategoryFolder, ...rest] = parts;
  const imageFile = rest.length > 0 ? rest[rest.length - 1] : majorCategoryFolder;

  // Validate division and normalize (WOMENS → LADIES etc.)
  const upperDivision = division.toUpperCase();
  if (!VALID_DIVISIONS.includes(upperDivision)) return null;
  const normalizedDivision = DIVISION_NORMALIZE[upperDivision] || upperDivision;

  // Validate image extension
  const ext = path.extname(imageFile).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) return null;

  // Parse vendor: everything before last hyphen = name, everything after = code
  const lastHyphen = vendorFolder.lastIndexOf('-');
  let vendorName = vendorFolder;
  let vendorCode = '';
  if (lastHyphen !== -1) {
    vendorName = vendorFolder.slice(0, lastHyphen).trim();
    vendorCode = vendorFolder.slice(lastHyphen + 1).trim();
  }

  return {
    year,
    month,
    division: normalizedDivision,
    date,
    vendorName,
    vendorCode,
    majorCategoryFolder,  // raw folder name → used to look up in categoryMapping
    imageName: imageFile,
  };
}

module.exports = { parsePath };
