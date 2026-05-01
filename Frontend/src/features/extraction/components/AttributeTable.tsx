import React, { useMemo, useState } from 'react';
import { Table, Image, Tag, Button, Tooltip, Space, Dropdown } from 'antd';
import { ReloadOutlined, EyeOutlined, MoreOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ExtractedRow, SchemaItem } from '../../../shared/types/extraction/ExtractionTypes';
import { StatusBadge } from '../../../shared/components/ui/StatusBadge';
import { AttributeCell } from './AttributeCell';
import { formatDuration, formatFileSize } from '../../../shared/utils/common/helpers';

interface AttributeTableProps {
  extractedRows: ExtractedRow[]; // ≡ƒô╕ Your uploaded images with data
  schema: SchemaItem[]; // ≡ƒôï List of attributes for current category
  selectedRowKeys: React.Key[]; // Γ£à Which rows are selected (checkboxes)
  onSelectionChange: (selectedRowKeys: React.Key[]) => void; // When user selects rows
  onAttributeChange: (rowId: string, attributeKey: string, value: string | number | null) => void; // When user edits attribute
  onDeleteRow: (rowId: string) => void; // When user deletes a row
  onImageClick: (imageUrl: string, imageName?: string) => void; // When user clicks image to view
  onReExtract: (rowId: string, forceRefresh?: boolean) => void; // When user wants to re-run AI extraction (forceRefresh=true to bypass cache)
  onAddToSchema?: (attributeKey: string, value: string) => void; // When user adds new value to schema
  isExtracting?: boolean; // Whether AI is currently working
  disableEditing?: boolean; // Disable editing even after extraction
}

export const AttributeTable: React.FC<AttributeTableProps> = ({
  extractedRows,
  schema,
  selectedRowKeys,
  onSelectionChange,
  onAttributeChange,
  onDeleteRow,
  onImageClick,
  onReExtract,
  onAddToSchema,
  disableEditing = false
}) => {
  // focusedCellKey format: `${rowId}::${schemaKey}`
  const [focusedCellKey, setFocusedCellKey] = useState<string | null>(null);

  // ≡ƒÅù∩╕Å BUILD TABLE COLUMNS DYNAMICALLY
  const columns: ColumnsType<ExtractedRow> = useMemo(() => {
    // 1∩╕ÅΓâú FIXED COLUMNS (always show these)
    const baseColumns: ColumnsType<ExtractedRow> = [
      // ≡ƒöó PICTURE NUMBER COLUMN (original filename, for creator reference only)
      {
        title: 'Picture No.',
        key: 'pictureNumber',
        width: 130,
        fixed: 'left',
        render: (_, record) => (
          <div style={{ fontSize: 11, wordBreak: 'break-all', color: '#595959' }}>
            {record.originalFileName}
          </div>
        ),
      },

      // ≡ƒô╕ IMAGE COLUMN
      {
        title: 'Image',
        key: 'image',
        width: 80,
        fixed: 'left', // Always visible on left
        render: (_, record) => (
          <div style={{ textAlign: 'center' }}>
            {/* Show thumbnail image */}
            <Image
              src={record.imagePreviewUrl || "/placeholder.svg"}
              alt={record.originalFileName}
              width={50}
              height={50}
              style={{ objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
              onClick={() => onImageClick(record.imagePreviewUrl, record.originalFileName)}
              preview={false}
            />
            {/* Show file size below image */}
            <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>
              {formatFileSize(record.file.size)}
            </div>
          </div>
        ),
      },
      
      // ≡ƒöä STATUS COLUMN
      {
        title: 'Status',
        key: 'status',
        width: 100,
        fixed: 'left', // Always visible on left
        render: (_, record) => (
          <div>
            {/* Show status badge (Pending/Done/Error/Extracting) */}
            <StatusBadge status={record.status} />
            
            {/* Show how long extraction took */}
            {record.extractionTime && (
              <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>
                {formatDuration(record.extractionTime)}
              </div>
            )}
            
            {/* Show error message if extraction failed */}
            {record.error && (
              <Tooltip title={record.error} trigger="hover">
                <div style={{ fontSize: 9, color: '#f5222d', marginTop: 2, cursor: 'help' }}>
                  ΓÜá∩╕Å Error
                </div>
              </Tooltip>
            )}
          </div>
        ),
      },
    ];

    // 2∩╕ÅΓâú DYNAMIC ATTRIBUTE COLUMNS (changes based on category)
    // For each attribute in the schema, create a column
    const attributeColumns: ColumnsType<ExtractedRow> = schema.map((schemaItem, schemaIndex) => ({
      title: (
        <div>
          {/* Column header shows attribute name */}
          <div style={{ fontSize: 12 }}>{schemaItem.label}</div>
          {/* Show "Required" tag if mandatory */}
          {schemaItem.required && <Tag color="red" style={{ fontSize: 10, padding: '0 4px', marginTop: 2 }}>Required</Tag>}
        </div>
      ),
      key: schemaItem.key,
      width: 150,
      render: (_, record) => {
        if (schemaItem.key === 'fab_yarn-01' || schemaItem.key === 'fab_yarn-02' || schemaItem.key === 'fab_weave-02') {
          console.log(`[AttributeTable] Rendering ${schemaItem.key}:`, {
            schemaItemKey: schemaItem.key,
            attributeKeys: Object.keys(record.attributes || {}),
            attributeValue: record.attributes[schemaItem.key],
            hasAttribute: !!record.attributes[schemaItem.key]
          });
        }

        const cellKey = `${record.id}::${schemaItem.key}`;
        // Multi-article: Enter moves DOWN to same attribute on next row.
        // Single article: Enter moves RIGHT to next attribute on same row.
        let nextCellKey: string | null = null;
        if (extractedRows.length === 1) {
          const nextSchemaItem = schema[schemaIndex + 1];
          nextCellKey = nextSchemaItem ? `${record.id}::${nextSchemaItem.key}` : null;
        } else {
          const currentRowIndex = extractedRows.findIndex(r => r.id === record.id);
          const nextRow = extractedRows[currentRowIndex + 1];
          nextCellKey = nextRow ? `${nextRow.id}::${schemaItem.key}` : null;
        }

        return (
          <AttributeCell
            attribute={record.attributes[schemaItem.key]}
            schemaItem={schemaItem}
            onChange={(value) => onAttributeChange(record.id, schemaItem.key, value)}
            onAddToSchema={(value) => onAddToSchema?.(schemaItem.key, value)}
            disabled={record.status === 'Extracting' || disableEditing}
            autoFocus={focusedCellKey === cellKey}
            onAutoFocused={() => setFocusedCellKey(null)}
            onSaveAndNext={nextCellKey ? () => setFocusedCellKey(nextCellKey) : undefined}
          />
        );
      }
    }));

    // 3∩╕ÅΓâú ACTIONS COLUMN (always on the right)
    const actionsColumn: ColumnsType<ExtractedRow> = [
      {
        title: 'Actions',
        key: 'actions',
        width: 100,
        fixed: 'right', // Always visible on right
        render: (_, record) => (
          <Space direction="horizontal" size={2}>
            {/* ≡ƒæü∩╕Å View Image Button */}
            <Tooltip title="View Image">
              <Button
                type="text"
                icon={<EyeOutlined />}
                size="small"
                onClick={() => onImageClick(record.imagePreviewUrl, record.originalFileName)}
              />
            </Tooltip>
            
            {/* ≡ƒöä Re-extract Button (uses cache if available) */}
            <Tooltip title="Re-extract">
              <Button
                type="text"
                icon={<ReloadOutlined />}
                size="small"
                onClick={() => onReExtract(record.id, false)}
                disabled={record.status === 'Extracting'}
              />
            </Tooltip>
            
            {/*  Force Re-extract Button (bypasses cache) */}
            <Tooltip title="Force fresh">
              <Button
                type="text"
                icon={<ThunderboltOutlined />}
                size="small"
                onClick={() => onReExtract(record.id, true)}
                disabled={record.status === 'Extracting'}
                style={{ color: '#faad14' }}
              />
            </Tooltip>
            
            {/* ≡ƒùæ∩╕Å Delete Button (in dropdown menu) */}
            <Dropdown
              menu={{
                items: [{
                  key: 'delete',
                  label: 'Delete Row',
                  danger: true,
                  onClick: () => onDeleteRow(record.id)
                }]
              }}
              trigger={['click']}
            >
              <Button type="text" icon={<MoreOutlined />} size="small" />
            </Dropdown>
          </Space>
        ),
      },
    ];

    // Inject Markdown computed column right after MRP column (if schema has both rate and mrp)
    const hasMrp = schema.some(s => s.key === 'mrp');
    const hasRate = schema.some(s => s.key === 'rate');
    const markdownColumn: ColumnsType<ExtractedRow> = (hasMrp && hasRate) ? [{
      title: <div style={{ fontSize: 12 }}>Markdown</div>,
      key: '__markdown__',
      width: 110,
      render: (_: unknown, record: ExtractedRow) => {
        const mrp = parseFloat(String(record.attributes?.['mrp'] ?? ''));
        const rate = parseFloat(String(record.attributes?.['rate'] ?? ''));
        if (!isFinite(mrp) || !isFinite(rate) || mrp === 0) return <span style={{ color: '#bfbfbf' }}>ΓÇö</span>;
        const md = ((mrp - rate) / mrp * 100).toFixed(1);
        return <span style={{ color: '#2f54eb', fontWeight: 600 }}>{md}%</span>;
      }
    }] : [];

    // Insert markdown column right after mrp column in attributeColumns
    const mrpIdx = attributeColumns.findIndex(c => (c as any).key === 'mrp');
    if (mrpIdx >= 0 && markdownColumn.length > 0) {
      attributeColumns.splice(mrpIdx + 1, 0, ...markdownColumn);
    }

    // ≡ƒöù COMBINE ALL COLUMNS: Fixed Left + Dynamic Attributes + Fixed Right
    return [...baseColumns, ...attributeColumns, ...actionsColumn];
  }, [schema, extractedRows, onAttributeChange, onAddToSchema, onDeleteRow, onImageClick, onReExtract, focusedCellKey]);

  // Γ£à ROW SELECTION CONFIGURATION (checkboxes)
  const rowSelection = {
    selectedRowKeys,
    onChange: onSelectionChange,
    getCheckboxProps: (record: ExtractedRow) => ({
      disabled: record.status === 'Extracting', // Can't select if AI is working
      name: record.originalFileName,
    }),
  };

  // ≡ƒÄ¿ RENDER THE TABLE
  return (
    <Table<ExtractedRow>
      columns={columns} // All our column definitions
      dataSource={extractedRows} // The actual data (your images)
      rowKey="id" // Unique identifier for each row
      rowSelection={rowSelection} // Checkbox functionality
      
      // ≡ƒô▒ RESPONSIVE SCROLLING
      scroll={{
        x: 'max-content', // Horizontal scroll for many columns
        y: 'calc(100vh - 320px)' // Increased from 280px to give more table space
      }}
      
      // ≡ƒôä PAGINATION
      pagination={{
        pageSize: 100, // Show 100 rows per page for less scrolling
        showSizeChanger: true, // Let user change page size
        pageSizeOptions: ['50', '100', '200', '500'],
        showQuickJumper: true, // Jump to specific page
        showTotal: (total, range) => // Show "1-100 of 200 items"
          `${range[0]}-${range[1]} of ${total} items`,
      }}
      
      size="small" // Compact table for more data
      bordered // Show borders around cells
      
      // ≡ƒÄ¿ ROW STYLING based on status
      rowClassName={(record) => {
        if (record.status === 'Error') return 'table-row-error';
        if (record.status === 'Done') return 'table-row-success';
        if (record.status === 'Extracting') return 'table-row-processing';
        return '';
      }}
      
      // ≡ƒôè SUMMARY ROW at bottom showing stats
      summary={(pageData) => {
        const stats = {
          total: pageData.length,
          done: pageData.filter(row => row.status === 'Done').length,
          error: pageData.filter(row => row.status === 'Error').length,
          pending: pageData.filter(row => row.status === 'Pending').length,
        };
        
        return (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}>
                <strong>Summary:</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1}>
                <Tag color="success">Done: {stats.done}</Tag>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2}>
                <Tag color="error">Error: {stats.error}</Tag>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3}>
                <Tag color="processing">Pending: {stats.pending}</Tag>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4}>
                <Tag>Total: {stats.total}</Tag>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        );
      }}
    />
  );
};
