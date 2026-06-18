// Web Worker for XLSX export with image embedding - eliminates UI blocking
import ExcelJS from 'exceljs';

const KEY_TO_LABEL: Record<string, string> = {
  macro_mvgr:        'M_IMP_ATBT',
  yarn_01:           'M_YARN',
  main_mvgr:         'M_FAB_MAIN_MVGR_1',
  fabric_main_mvgr:  'M_FAB_MAIN_MVGR_2',
  weave:             'M_WEAVE_01',
  m_fab2:            'M_WEAVE_02',
  composition:       'M_COMPOSITION',
  f_count:           'M_COUNT',
  f_construction:    'M_CONSTRUCTION',
  lycra_non_lycra:   'M_LYCRA',
  finish:            'M_FINISH',
  gsm:               'M_GSM',
  f_ounce:           'M_OUNZ',
  f_width:           'M_WIDTH',
  fab_div:           'M_FAB_DIV',
  fab_vdr:           'M_FAB_VDR',
  collar:            'M_COLLAR_TYPE',
  collar_style:      'M_COLLAR_STYLE',
  neck_details:      'M_NECK_STYLE',
  neck:              'M_NECK_TYPE',
  placket:           'M_PLACKET',
  father_belt:       'M_BLT_TYPE',
  sleeve:            'M_SLEEVES_MAIN_STYLE',
  sleeve_fold:       'M_SLEEVE_FOLD',
  bottom_fold:       'M_BTM_FOLD',
  no_of_pocket:      'M_NO_OF_POCKET',
  pocket_type:       'M_POCKET',
  extra_pocket:      'M_EXTRA_POCKET',
  fit:               'M_FIT',
  body_style:        'M_BODY_STYLE',
  length:            'M_LENGTH',
  drawcord:          'M_DC_STYLE',
  dc_shape:          'M_DC_SHAPE',
  button:            'M_BTN_TYPE',
  btn_colour:        'M_BTN_CLR',
  zipper:            'M_ZIP_TYPE',
  zip_colour:        'M_ZIP_COL',
  patches_type:      'M_PATCH_STYLE',
  patches:           'M_PATCHE_TYPE',
  print_type:        'M_PRINT_TYPE',
  print_style:       'M_PRINT_STYLE',
  print_placement:   'M_PRINT_PLACEMENT',
  embroidery:        'M_EMB_TYPE',
  embroidery_type:   'M_EMBROIDERY_STYLE',
  wash:              'M_WASH',
  shade:             'SHADE',
  weight:            'WEIGHT',
  drawcord_shape:    'M_DC_SHAPE',
  emb_placement:     'M_EMB_PLACEMENT',
  htrf_type:         'M_HTRF_TYPE',
  htrf_style:        'M_HTRF_STYLE',
  age_group:         'M_AGE_GROUP',
  segment:           'SEGMENT',
  article_fashion_type: 'ARTICLE FASHION TYPE',
  mvgr_brand_vendor: 'MVGR_BRAND_VENDOR',
  child_belt:        'M_BLT_STYLE',
  front_open_style:  'FO BTN STYLE',
};

interface ExtractedRow {
  status: string;
  attributes: Record<string, { value: string; confidence: number; schemaValue?: unknown }>;
  imageName: string;
  originalFileName: string;
  imagePreviewUrl: string;
  processingTime: number;
  extractionTime: number;
  extractionDate: string;
  updatedAt?: { toISOString?: () => string };
  aiModel: string;
  modelUsed: string;
  tokensUsed: number;
  apiTokensUsed: number;
  confidence: number;
}

interface ExportMessage {
  id: string;
  type: 'EXPORT_XLSX';
  payload: {
    extractedRows: ExtractedRow[];
    filename: string;
    schema: Record<string, unknown>[];
  };
}

interface ExportResponse {
  id: string;
  type: 'EXPORT_COMPLETE' | 'EXPORT_ERROR' | 'EXPORT_PROGRESS';
  payload: {
    success?: boolean;
    progress?: number;
    downloadUrl?: string;
    error?: string;
  };
}

self.onmessage = async (event: MessageEvent<ExportMessage>) => {
  const { id, type, payload } = event.data;
  
  if (type !== 'EXPORT_XLSX') return;
  
  try {
    const { extractedRows, schema } = payload;
    
    // Progress reporting
    self.postMessage({
      id,
      type: 'EXPORT_PROGRESS',
      payload: { progress: 10 }
    } as ExportResponse);
    
    // Filter completed rows
    const doneRows = extractedRows.filter((r: ExtractedRow) => r.status === 'Done');
    
    self.postMessage({
      id,
      type: 'EXPORT_PROGRESS', 
      payload: { progress: 20 }
    } as ExportResponse);
    
    // Transform data efficiently (batched processing)
    const batchSize = 100;
    const exportData: Record<string, unknown>[] = [];
    
    for (let i = 0; i < doneRows.length; i += batchSize) {
      const batch = doneRows.slice(i, i + batchSize);
      
      const batchData = batch.map((row: ExtractedRow, index: number) => {
        const exportRow: Record<string, unknown> = {
          'Row': i + index + 1,
          'Image Name': row.originalFileName,
          'Status': row.status,
          'Extraction Date': row.updatedAt?.toISOString?.() || new Date().toISOString(),
          'Processing Time (ms)': row.extractionTime || 0,
          'AI Model': row.modelUsed || 'gpt-4o',
          'Tokens Used': row.apiTokensUsed || 0,
          'Confidence': row.confidence || 0,
        };

        // Add schema attributes using Excel label names as column headers
        if (row.attributes) {
          Object.entries(row.attributes).forEach(([key, attribute]: [string, { value: string; confidence: number; schemaValue?: unknown }]) => {
            if (attribute && attribute.schemaValue !== null && attribute.schemaValue !== undefined) {
              const value = attribute.schemaValue;
              const label = KEY_TO_LABEL[key] ?? key;
              exportRow[label] = typeof value === 'string' || typeof value === 'number' ? value : String(value);
            }
          });
        }

        return exportRow;
      });
      
      exportData.push(...batchData);
      
      // Report progress
      const progress = 20 + (i / doneRows.length) * 50;
      self.postMessage({
        id,
        type: 'EXPORT_PROGRESS',
        payload: { progress: Math.round(progress) }
      } as ExportResponse);
    }
    
    self.postMessage({
      id,
      type: 'EXPORT_PROGRESS',
      payload: { progress: 75 }
    } as ExportResponse);
    
    // Create Excel workbook with ExcelJS
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AI Fashion Extractor';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('Fashion Extraction Data');
    
    // Define columns - add Image column as first column
    const columns: Array<{ header: string; key: string; width: number }> = [
      { header: 'Image', key: 'image', width: 20 }
    ];
    
    // Add other columns based on exportData
    if (exportData.length > 0) {
      Object.keys(exportData[0]).forEach((key) => {
        columns.push({
          header: key,
          key: key,
          width: key === 'Image Name' ? 30 : 15
        });
      });
    }
    
    worksheet.columns = columns;
    
    // Style the header row
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).font = { ...worksheet.getRow(1).font, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    
    // Add data rows with images
    for (let i = 0; i < doneRows.length; i++) {
      const row = doneRows[i];
      const rowData = exportData[i];
      
      // Add the data row (Excel rows are 1-indexed, +2 accounts for header)
      const excelRow = worksheet.addRow(rowData);
      const rowIndex = i + 2;
      
      // Set row height to accommodate image
      excelRow.height = 100;
      
      // Add image if available
      if (row.imagePreviewUrl) {
        try {
          // Fetch the image as blob
          const response = await fetch(row.imagePreviewUrl);
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          
          // Determine image extension
          const ext = row.originalFileName.split('.').pop()?.toLowerCase() || 'png';
          const imageId = workbook.addImage({
            buffer: arrayBuffer,
            extension: ext === 'jpg' ? 'jpeg' : (ext === 'jpeg' || ext === 'png' ? ext : 'png')
          });
          
          // Add image to cell A using range notation
          worksheet.addImage(imageId, `A${rowIndex}:A${rowIndex}`);
        } catch (imgError) {
          console.error('Failed to add image:', imgError);
          // Continue without image
        }
      }
      
      // Report progress
      if (i % 10 === 0) {
        const progress = 75 + (i / doneRows.length) * 15;
        self.postMessage({
          id,
          type: 'EXPORT_PROGRESS',
          payload: { progress: Math.round(progress) }
        } as ExportResponse);
      }
    }
    
    // Add metadata sheet
    const metadataSheet = workbook.addWorksheet('Metadata');
    metadataSheet.columns = [
      { header: 'Property', key: 'property', width: 25 },
      { header: 'Value', key: 'value', width: 40 }
    ];
    
    metadataSheet.addRow({ property: 'Export Date', value: new Date().toISOString() });
    metadataSheet.addRow({ property: 'Total Rows', value: exportData.length });
    metadataSheet.addRow({ property: 'Schema Attributes', value: schema.length });
    metadataSheet.addRow({ property: 'App Version', value: '2.0.0' });
    
    metadataSheet.getRow(1).font = { bold: true };
    
    self.postMessage({
      id,
      type: 'EXPORT_PROGRESS',
      payload: { progress: 95 }
    } as ExportResponse);
    
    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const downloadUrl = URL.createObjectURL(blob);
    
    self.postMessage({
      id,
      type: 'EXPORT_COMPLETE',
      payload: { 
        success: true, 
        downloadUrl,
        progress: 100 
      }
    } as ExportResponse);
    
  } catch (error) {
    self.postMessage({
      id,
      type: 'EXPORT_ERROR',
      payload: { 
        error: error instanceof Error ? error.message : 'Export failed' 
      }
    } as ExportResponse);
  }
};
