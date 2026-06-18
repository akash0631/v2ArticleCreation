import React, { useState, useMemo, useCallback } from 'react';
import { FileSpreadsheet, Download } from 'lucide-react';
import { Button, Progress } from '@/shared/components/ui-tw';
import { notification } from '@/lib/message';
import type { ExtractedRow, SchemaItem } from '../../../shared/types/extraction/ExtractionTypes';
import { ExportService } from '../../../shared/services/processing/ExportService';
import { logger } from '../../../shared/utils/common/logger';

interface ExportButtonProps {
  extractedRows: ExtractedRow[];
  schema: SchemaItem[];
  disabled?: boolean;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ extractedRows, schema, disabled = false }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const exportService = useMemo(() => new ExportService(), []);

  const exportableCount = useMemo(
    () => extractedRows.filter((row) => row.status === 'Done').length,
    [extractedRows],
  );

  const handleExport = useCallback(async () => {
    if (exportableCount === 0) {
      notification.warning({
        message: 'No Data to Export',
        description: 'Please complete some extractions before exporting.',
      });
      return;
    }

    setLoading(true);
    setProgress(0);

    const startTime = Date.now();
    const filename = `fashion-extraction-${new Date().toISOString().split('T')[0]}.xlsx`;

    try {
      logger.info('Export started', { exportableCount, totalRows: extractedRows.length, filename });

      const downloadUrl = await exportService.exportToExcel(
        extractedRows,
        filename,
        schema,
        (progressValue) => setProgress(progressValue),
      );

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

      const exportTime = Date.now() - startTime;

      notification.success({
        message: 'Export Successful!',
        description: `Exported ${exportableCount} rows in ${(exportTime / 1000).toFixed(1)}s`,
      });

      logger.info('Export completed successfully', { exportableCount, exportTime, filename });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown export error';
      notification.error({
        message: 'Export Failed',
        description: `${errorMessage}. Please try again.`,
      });
      logger.error('Export failed', { error: errorMessage, exportableCount, filename });
    } finally {
      setLoading(false);
      setProgress(0);
    }
  }, [exportService, extractedRows, schema, exportableCount]);

  return (
    <div className="flex w-full flex-col gap-2">
      <Button
        size="lg"
        onClick={handleExport}
        disabled={loading || disabled || exportableCount === 0}
        className="w-full"
      >
        {loading ? <Download /> : <FileSpreadsheet />}
        {loading ? 'Exporting...' : `Export to Excel (${exportableCount} rows)`}
      </Button>

      {loading && progress > 0 && <Progress value={progress} />}

      {!loading && exportableCount === 0 && (
        <div className="text-center text-xs text-muted-foreground">
          Complete some extractions to enable export
        </div>
      )}
    </div>
  );
};
