import { saveAs } from 'file-saver';
import { notification } from '@/lib/message';
import { addNotification } from '../../../shared/services/notifications/notificationStore';
import type { ExtractedRow } from '../../../shared/types/extraction/ExtractionTypes';
import type { ExportResult, ExportMessage } from '../../../shared/types/worker.types';

const exportWorker = new Worker(new URL('../../../shared/workers/exportWorker.ts', import.meta.url), { type: 'module' });

export const exportToExcel = (rows: ExtractedRow[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    exportWorker.postMessage({ type: 'EXPORT', payload: rows } as unknown as ExportMessage);
    exportWorker.onmessage = (event: MessageEvent<ExportResult>) => {
      if (event.data.success) {
        const arrayBuffer = event.data.data!;
        const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
        saveAs(blob, 'ClothingAttributes_Export.xlsx');
        addNotification({
          title: 'Excel downloaded',
          description: `Exported ${rows.length} records to Excel.`,
          type: 'success',
        });
        resolve();
      } else {
        notification.error({
          message: 'Failed to export data',
          description: event.data.error || 'Unknown error occurred',
        });
        reject(new Error(event.data.error));
      }
    };
  });
};
