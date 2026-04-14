const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { API_BASE_URL, WATCHER_API_KEY, EXTRACTION_SCHEMA } = require('./config');
const log = require('./logger');

/**
 * Submit one image to the backend watcher endpoint.
 *
 * @param {string} filePath   - Full path to the image file
 * @param {object} meta       - Parsed metadata from pathParser
 * @param {object} catData    - Category data from categoryMapping { sub_division, mc_code, division }
 */
async function submitImage(filePath, meta, catData) {
  const form = new FormData();

  // Image file
  form.append('image', fs.createReadStream(filePath), {
    filename: meta.imageName,
    contentType: guessContentType(meta.imageName),
  });

  // Extraction schema — backend requires this
  form.append('schema', EXTRACTION_SCHEMA);

  // Category name so backend can resolve schema
  form.append('categoryName', meta.majorCategoryFolder);

  // Watcher identity fields
  form.append('source', 'WATCHER');
  form.append('image_unc_path', filePath);

  // Watcher metadata extracted from folder path and Excel mapping:
  //   division       → always from folder path (MENS / WOMENS / LADIES / KIDS)
  //   vendor_name    → from folder path
  //   vendor_code    → from folder path
  //   major_category → raw folder name (e.g. M_TEES_HS)
  //   sub_division   → Excel mapping only (major_category → sub_division)
  //   mc_code        → Excel mapping only (major_category → mc_code)
  form.append('watcher_division',          meta.division);
  form.append('watcher_vendor_name',       meta.vendorName);
  form.append('watcher_vendor_code',       meta.vendorCode);
  form.append('watcher_major_category',    meta.majorCategoryFolder);
  form.append('watcher_sub_division',      catData?.sub_division  || '');
  form.append('watcher_mc_code',           catData?.mc_code       || '');

  const response = await axios.post(
    `${API_BASE_URL}/api/watcher/extract/upload`,
    form,
    {
      headers: {
        ...form.getHeaders(),
        'X-Watcher-Key': WATCHER_API_KEY,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300_000, // 5 min per image
    }
  );

  return response.data;
}

function guessContentType(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  return map[ext] || 'image/jpeg';
}

module.exports = { submitImage };
