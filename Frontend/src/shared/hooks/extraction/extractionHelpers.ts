// src/hooks/extraction/extractionHelpers.ts

import { message } from '@/lib/message';
import { logger } from '../../utils/common/logger';
import { generateId } from '../../utils/common/helpers';
import { ImageCompressionService } from '../../services/processing/ImageCompressionService';
import type {
  ExtractedRowEnhanced,
  PerformanceMetrics
} from '../../types/extraction/ExtractionTypes';

/**
 * Safely get JS heap memory usage if available.
 */
export const getMemoryUsage = (): number | undefined => {
  const perf = performance as Performance & { memory?: Partial<Performance['memory']> };
  return perf.memory?.usedJSHeapSize;
};

/**
 * Return memory info in MB if available.
 */
export const getMemoryInfo = () => {
  const perf = performance as Performance & { memory?: Partial<Performance['memory']> };
  const m = perf.memory;
  if (!m) return null;
  return {
    used: Math.round((m.usedJSHeapSize ?? 0) / 1024 / 1024),
    total: Math.round((m.totalJSHeapSize ?? 0) / 1024 / 1024),
    limit: Math.round((m.jsHeapSizeLimit ?? 0) / 1024 / 1024)
  };
};

/**
 * Compress an image via Web Worker (fallback to synchronous) and record metrics.
 */
export const compressImage = async (
  file: File,
  service: ImageCompressionService,
  recordPerf: (metrics: PerformanceMetrics) => void
): Promise<string> => {
  const start = performance.now();
  try {
    const result = await service.compressImage?.(file, { quality: 0.8, maxWidth: 800, maxHeight: 800 }) || await service.compressImageFallback(file, { quality: 0.8, maxWidth: 800, maxHeight: 800 });
    const compressionTime = performance.now() - start;
    logger.info('Worker compression complete', { file: file.name, compressionTime });
    recordPerf({
      compressionTime,
      apiRequestTime: 0,
      parsingTime: 0,
      totalTime: compressionTime,
      memoryUsed: getMemoryUsage()
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Compression error';
    logger.error('Worker compression failed', { file: file.name, error: msg });
    // fallback synchronous
    const syncResult = await service.compressImageFallback(file, { quality: 0.8, maxWidth: 800, maxHeight: 800 });
    const fallbackTime = performance.now() - start;
    recordPerf({
      compressionTime: fallbackTime,
      apiRequestTime: 0,
      parsingTime: 0,
      totalTime: fallbackTime,
      memoryUsed: getMemoryUsage()
    });
    return syncResult;
  }
};


/**
 * Create a new ExtractedRowEnhanced object for a file.
 */
export const createExtractedRow = async (
  file: File,
  compress: (f: File, cb?: (p: number) => void) => Promise<string>
): Promise<ExtractedRowEnhanced> => {
  try {
    const preview = await compress(file);
    return {
      id: generateId(),
      file,
      originalFileName: file.name,
      imagePreviewUrl: preview,
      status: 'Pending',
      attributes: {},
      discoveries: [],
      createdAt: new Date(),
      processingProgress: 0,
      queuePosition: 0,
      retryCount: 0,
      confidence: 0,
      discoveryMode: "default"
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Row creation error';
    logger.error('createExtractedRow failed', { error: msg });
    message.error(`Failed to prepare image row: ${msg}`);
    return {
      id: generateId(),
      file,
      originalFileName: file.name,
      imagePreviewUrl: URL.createObjectURL(file),
      status: 'Error',
      attributes: {},
      discoveries: [],
      createdAt: new Date(),
      retryCount: 0,
      confidence: 0,
      error: msg,
      discoveryMode: "default"
    };
  }
};

