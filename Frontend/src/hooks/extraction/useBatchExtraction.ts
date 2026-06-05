import { useCallback } from 'react';
import { message } from '@/lib/message';
import type { ExtractedRowEnhanced, BatchOperationResult, SchemaItem, PerformanceMetrics } from '../../types/extraction/ExtractionTypes';

/**
 * Hook for batch extraction.
 */
export const useBatchExtraction = (
  extractedRows: ExtractedRowEnhanced[],
  _setExtractedRows: React.Dispatch<React.SetStateAction<ExtractedRowEnhanced[]>>,
  extractFunc: (row: ExtractedRowEnhanced, schema: SchemaItem[], cat?: string) => Promise<ExtractedRowEnhanced>,
  setProgress: (p: number) => void,
  setIsExtracting: (b: boolean) => void,
  _recordPerf: (metrics: PerformanceMetrics) => void,
  abortRef: React.MutableRefObject<AbortController | null>
) => {
  const extractAllPending = useCallback(async (
    schema: SchemaItem[],
    categoryName?: string
  ): Promise<BatchOperationResult | void> => {
    const pending = extractedRows.filter(row =>
      row.status === 'Pending' || (row.status === 'Error' && (row.retryCount || 0) < 3)
    );
    if (pending.length === 0) {
      message.info('No pending extractions.');
      return;
    }

    abortRef.current = new AbortController();
    setIsExtracting(true);
    setProgress(0);

    let successCount = 0;
    let errorCount = 0;
    const tasks: Promise<void>[] = [];

    for (const row of pending) {
      // concurrency limit = 5 (increased from 3 for better throughput)
      while (tasks.length >= 5) {
        await Promise.race(tasks);
      }
      if (abortRef.current.signal.aborted) break;

      const task = extractFunc(row, schema, categoryName)
        .then(updated => { if (updated.status === 'Done') successCount++; })
        .catch(() => { errorCount++; })
        .finally(() => {
          const completed = successCount + errorCount;
          setProgress((completed / pending.length) * 100);
        });

      tasks.push(task);
      task.finally(() => {
        const idx = tasks.indexOf(task);
        if (idx >= 0) tasks.splice(idx, 1);
      });
    }

    await Promise.allSettled(tasks);
    setIsExtracting(false);

    const result: BatchOperationResult = {
      successful: successCount,
      failed: errorCount,
      total: pending.length,
      errors: [],
      duration: Date.now()
    };

    message.success(`Batch complete: ${successCount}/${pending.length} succeeded.`);

    return result;
  }, [
    extractedRows,
    extractFunc,
    setProgress,
    setIsExtracting,
    abortRef
  ]);

  const cancelExtraction = useCallback(() => {
    abortRef.current?.abort();
    setIsExtracting(false);
    setProgress(0);
    message.info('Extraction cancelled.');
  }, [abortRef, setIsExtracting, setProgress]);

  return { extractAllPending, cancelExtraction };
};
