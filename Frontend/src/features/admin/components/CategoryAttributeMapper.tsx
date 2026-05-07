/**
 * CategoryAttributeMapper
 * Dedicated tab for managing which attributes are enabled for each category.
 * Select any category (grouped by department) then toggle its attributes.
 */

import { useState, useMemo } from 'react';
import { Select, Empty, Typography, Space, Tag, Spin, message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getHierarchyTree, updateCategory } from '../../../services/adminApi';
import { AttributePanel, SelectedCategory } from './HierarchyTreeEditor';

const { Text } = Typography;

export const CategoryAttributeMapper: React.FC = () => {
  const [selectedCat, setSelectedCat] = useState<SelectedCategory | null>(null);
  const qc = useQueryClient();

  const { data: hierarchyData, isLoading } = useQuery({
    queryKey: ['hierarchy-tree'],
    queryFn: getHierarchyTree,
  });

  const changeGarmentType = useMutation({
    mutationFn: ({ catId, type }: { catId: number; type: string }) =>
      updateCategory(catId, { garmentType: type }),
    onSuccess: (_, { type }) => {
      message.success('Garment type updated');
      setSelectedCat(prev => prev ? { ...prev, garmentType: type } : prev);
      qc.invalidateQueries({ queryKey: ['hierarchy-tree'] });
    },
    onError: () => message.error('Update failed'),
  });

  // Build grouped options: dept → sub-dept › category (code)
  const groupedOptions = useMemo(() => {
    if (!Array.isArray(hierarchyData)) return [];
    return (hierarchyData as any[]).map(dept => ({
      label: dept.name,
      options: (dept.subDepartments ?? []).flatMap((sub: any) =>
        (sub.categories ?? []).map((cat: any) => ({
          label: `${sub.name} › ${cat.name} (${cat.code})`,
          value: cat.id,
          _cat: cat,
          _dept: dept,
        }))
      ),
    })).filter(g => g.options.length > 0);
  }, [hierarchyData]);

  const totalCategories = useMemo(() =>
    groupedOptions.reduce((sum, g) => sum + g.options.length, 0),
    [groupedOptions]
  );

  const handleSelect = (_: number, option: any) => {
    const cat = option._cat;
    const dept = option._dept;
    setSelectedCat({
      id: cat.id,
      name: cat.name,
      code: cat.code,
      garmentType: cat.garmentType ?? 'UPPER',
      departmentName: dept.name,
    });
  };

  return (
    <div>
      {/* Category picker */}
      <div style={{
        background: '#fff', padding: '16px 24px', borderRadius: 8,
        border: '1px solid #f0f0f0', marginBottom: 20,
      }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <Text strong style={{ fontSize: 15 }}>Select Category</Text>
            {totalCategories > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {totalCategories} categories across {groupedOptions.length} departments
              </Text>
            )}
          </div>
          <Spin spinning={isLoading} size="small">
            <Select
              showSearch
              placeholder="Type to search by name or code (e.g. MU, KB-L, Ladies Upper)…"
              options={groupedOptions}
              value={selectedCat?.id}
              onSelect={handleSelect}
              onClear={() => setSelectedCat(null)}
              allowClear
              filterOption={(input, option) => {
                // Groups have nested options — filter only leaf options
                if (option?.options) return false;
                return String(option?.label ?? '').toLowerCase().includes(input.toLowerCase());
              }}
              style={{ width: '100%', maxWidth: 600 }}
              size="large"
              notFoundContent={isLoading ? 'Loading…' : 'No categories found'}
            />
          </Spin>

          {/* Quick-pick tags */}
          {!selectedCat && !isLoading && groupedOptions.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>Quick pick:</Text>
              {groupedOptions.map(group => (
                group.options.slice(0, 4).map((opt: any) => (
                  <Tag
                    key={opt.value}
                    style={{ cursor: 'pointer', marginBottom: 4 }}
                    color="blue"
                    onClick={() => handleSelect(opt.value, opt)}
                  >
                    {opt._cat.code}
                  </Tag>
                ))
              ))}
            </div>
          )}
        </Space>
      </div>

      {/* Attribute panel or placeholder */}
      <div style={{ background: '#fff', padding: 24, borderRadius: 8, border: '1px solid #f0f0f0' }}>
        {selectedCat ? (
          <AttributePanel
            key={selectedCat.id}
            category={selectedCat}
            onGarmentTypeChange={(catId, type) => changeGarmentType.mutate({ catId, type })}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 40, marginBottom: 40 }}
            description={
              <Space direction="vertical" size={4} style={{ textAlign: 'center' }}>
                <Text strong>No category selected</Text>
                <Text type="secondary">
                  Pick a category above to enable/disable attributes and set the garment type.
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Enabled attributes appear in extraction. Required attributes must always have a value.
                </Text>
              </Space>
            }
          />
        )}
      </div>
    </div>
  );
};
