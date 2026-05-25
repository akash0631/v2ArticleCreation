import React from 'react';
import { Upload as UploadIcon, FlaskConical, FileSpreadsheet, BarChart3, Table as TableIcon, Eraser } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  Button,
  Input,
  Popconfirm,
  Progress,
  Segmented,
  Tooltip,
  Upload,
} from '@/shared/components/ui-tw';
import type { ExtractedRow } from '../../types/extraction/ExtractionTypes';

interface ExportRowData {
  Row: number;
  'Image Name': string;
  Status: string;
  'Extraction Date': string;
  'Processing Time (ms)': number;
  'AI Model': string;
  'Tokens Used': number;
  [key: string]: string | number;
}

interface AppHeaderProps {
  onUpload: (file: File) => Promise<boolean> | boolean;
  onExtract: () => void;
  onClearAll: () => void;
  isExtracting: boolean;
  rows: ExtractedRow[];
  progress: number;
  currentView: 'extractor' | 'dashboard';
  onViewChange: (view: 'extractor' | 'dashboard') => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = React.memo(
  ({
    onUpload,
    onExtract,
    onClearAll,
    isExtracting,
    rows,
    progress,
    currentView,
    onViewChange,
    searchTerm,
    onSearchChange,
  }) => {
    const pendingCount = rows.filter((r) => r.status === 'Pending' && r.file?.size > 0).length;
    const doneCount = rows.filter((r) => r.status === 'Done').length;
    const totalCount = rows.length;

    const exportToExcel = (extractedRows: ExtractedRow[]): void => {
      try {
        const doneRows = extractedRows.filter((r) => r.status === 'Done');
        if (doneRows.length === 0) {
          alert('No completed extractions to export');
          return;
        }
        const exportData: ExportRowData[] = doneRows.map((row, index) => {
          const exportRow: ExportRowData = {
            Row: index + 1,
            'Image Name': row.originalFileName,
            Status: row.status,
            'Extraction Date': row.updatedAt?.toISOString() || new Date().toISOString(),
            'Processing Time (ms)': row.extractionTime || 0,
            'AI Model': row.modelUsed || 'Unknown',
            'Tokens Used': row.apiTokensUsed || 0,
          };
          Object.entries(row.attributes).forEach(([key, attribute]) => {
            if (attribute && attribute.schemaValue !== null && attribute.schemaValue !== undefined) {
              const value = attribute.schemaValue;
              exportRow[key] =
                typeof value === 'string' || typeof value === 'number' ? value : String(value);
            }
          });
          return exportRow;
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Extracted Attributes');
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `clothing_extraction_${timestamp}.xlsx`;
        XLSX.writeFile(workbook, filename);
        console.log(`Exported ${doneRows.length} rows to ${filename}`);
      } catch (error) {
        console.error('Export failed:', error);
        alert('Export failed. Please try again.');
      }
    };

    return (
      <div className="app-page-header flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="m-0 text-xl font-semibold">Clothing Attribute Extractor</h1>
        <div className="flex items-center gap-2">
          <Segmented<'extractor' | 'dashboard'>
            value={currentView}
            options={[
              { value: 'extractor', icon: <TableIcon className="h-4 w-4" />, label: 'Extractor' },
              { value: 'dashboard', icon: <BarChart3 className="h-4 w-4" />, label: 'Dashboard' },
            ]}
            onChange={onViewChange}
            size="sm"
          />

          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-[200px]"
          />

          <Upload multiple beforeUpload={onUpload}>
            <Button variant="outline" asChild>
              <span className="cursor-pointer">
                <UploadIcon className="h-4 w-4" />
                Upload Images
              </span>
            </Button>
          </Upload>

          <Tooltip title={pendingCount > 0 ? 'Extract attributes for all pending images' : 'No images to extract'}>
            <Button onClick={onExtract} disabled={isExtracting || pendingCount === 0}>
              <FlaskConical className="h-4 w-4" />
              {isExtracting ? 'Extracting...' : `Extract All (${pendingCount})`}
            </Button>
          </Tooltip>

          <Button variant="outline" onClick={() => exportToExcel(rows)} disabled={doneCount === 0}>
            <FileSpreadsheet className="h-4 w-4" />
            Export to Excel ({doneCount})
          </Button>

          <Popconfirm
            title="Are you sure you want to clear all rows?"
            okText="Yes, Clear All"
            cancelText="No"
            disabled={totalCount === 0}
            onConfirm={onClearAll}
          >
            <Button variant="destructive" disabled={totalCount === 0}>
              <Eraser className="h-4 w-4" />
              Clear All
            </Button>
          </Popconfirm>
        </div>
        {isExtracting && <Progress value={progress} />}
      </div>
    );
  },
);
