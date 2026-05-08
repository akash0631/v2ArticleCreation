import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { runBatchPipeline, ensureOutputFolder } from '../services/modelGenerationService';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Invalid file type. Allowed: JPEG, PNG, WebP'));
  },
});

const uploadFields = upload.fields([
  { name: 'designs', maxCount: 10 },
  { name: 'pattern', maxCount: 1 },
  { name: 'broach', maxCount: 1 },
]);

router.post('/generate', uploadFields, async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[ModelGen] POST /generate called');
    const files = req.files as Record<string, Express.Multer.File[]>;
    const designs = files?.['designs'] || [];
    const patternFile = files?.['pattern']?.[0];
    const broachFile = files?.['broach']?.[0];

    console.log('[ModelGen] Files received:', {
      designs: designs.map(f => ({ name: f.originalname, size: f.size, mime: f.mimetype })),
      pattern: patternFile ? { name: patternFile.originalname, size: patternFile.size } : null,
      broach: broachFile ? { name: broachFile.originalname, size: broachFile.size } : null,
    });

    if (!designs.length) {
      console.warn('[ModelGen] Rejected: no design files');
      res.status(400).json({ success: false, error: 'At least one garment image is required.' });
      return;
    }

    const { gender, bodytype, imagesCount, broach_placement, special_instructions, color_name } = req.body;
    console.log('[ModelGen] Body fields:', { gender, bodytype, imagesCount, broach_placement, special_instructions, color_name });

    if (!gender || !bodytype) {
      console.warn('[ModelGen] Rejected: missing gender or bodytype');
      res.status(400).json({ success: false, error: 'gender and bodytype are required.' });
      return;
    }

    const uploadsBase = path.join(process.cwd(), 'uploads');
    const { todayStr, hitFolder, hitIndex } = ensureOutputFolder(uploadsBase);
    console.log('[ModelGen] Output folder:', hitFolder);

    console.log('[ModelGen] Starting batch pipeline for', designs.length, 'file(s), imagesCount:', imagesCount || '1');
    const results = await runBatchPipeline(
      designs,
      gender,
      bodytype,
      imagesCount || '1',
      patternFile,
      broachFile,
      broach_placement,
      special_instructions,
      color_name
    );
    console.log('[ModelGen] Batch pipeline done, results count:', results.length);

    const outputUrls: Array<{ file: string; view: string; url: string }> = [];
    const errors: Array<{ file: string; view: string; error: string }> = [];

    for (const item of results) {
      if (typeof item.output === 'string') {
        errors.push({ file: item.fileName, view: item.view, error: item.output });
        console.error(`[ModelGen] Failed ${item.fileName}/${item.view}: ${item.output}`);
        continue;
      }

      const safeName = path.basename(item.fileName, path.extname(item.fileName));
      const filename = `${safeName}_${item.view.replace(/\s+/g, '_')}.png`;
      const filepath = path.join(hitFolder, filename);
      fs.writeFileSync(filepath, item.output as Buffer);

      outputUrls.push({
        file: item.fileName,
        view: item.view,
        url: `/uploads/model-generation/${todayStr}/${hitIndex}/${filename}`,
      });
    }

    if (outputUrls.length === 0 && errors.length > 0) {
      res.status(500).json({
        success: false,
        error: errors[0].error,
        errors,
      });
      return;
    }

    res.json({
      success: true,
      count: outputUrls.length,
      results: outputUrls,
      errors: errors.length > 0 ? errors : undefined,
      date_folder: todayStr,
      hit_folder: hitIndex,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
