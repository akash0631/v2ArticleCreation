/**
 * Simplified Extraction Page
 * 
 * Workflow:
 * 1. Select Division → Category (Upper/Lower/Sets/Denim)
 * 2. Upload images (no metadata form)
 * 3. Auto-start batch extraction
 * 4. Show only validated results
 * 5. Go straight to batch processing page
 * 
 * This runs alongside the original ExtractionPage for rollback capability.
 */

import { useState, useCallback, useEffect } from "react";
import {
  Typography, Card, Button, Space, Steps, Alert, Progress, Row, Col, Statistic, Modal, Image, Select
} from "antd";
import {
  ClearOutlined, DownloadOutlined,
  CheckCircleOutlined, UploadOutlined, RobotOutlined, AppstoreOutlined
} from "@ant-design/icons";

import { SimplifiedCategorySelector, SIMPLIFIED_HIERARCHY } from "../components/SimplifiedCategorySelector";
import type { SimplifiedCategory } from "../components/SimplifiedCategorySelector";
import { UploadArea } from "../components";
import { AttributeTable } from "../components/AttributeTable";
import ExportManager from "../components/ExportManager";
import { useImageExtraction } from "../../../shared/hooks/extraction/useImageExtraction";
import type { SchemaItem } from "../../../shared/types/extraction/ExtractionTypes";
import { MAJOR_CATEGORY_ALLOWED_VALUES } from "../../../data/majorCategoryMcCodeMap";
import { getMajCatAllowedValues, getMajCatMandatoryKeys } from "../../../data/majCatAttributeMap";
import { preloadAttributeValues } from "../../../services/articleConfigService";

import "./ExtractionPage.css";
import "../../../styles/App.css";

const { Title, Text } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:5001/api" : "/api");

const KEY_ALIASES: Record<string, string> = {
  neck_details: 'neck_detail',
  colour: 'color',
  child_belt: 'child_belt_detail',
  lycra_non_lycra: 'lycra_non\nlycra',
  patches_type: 'patch_type'
};

const ATTRIBUTE_VALUE_CORRECTIONS: Record<string, Record<string, string>> = {
  weave: {
    CH_TWL: 'CHN_TWL',
    CHINA_TWL: 'CHN_TWL'
  },
  m_fab2: {
    '3': '3/1'
  }
};

const normalizeAllowedValues = (attributeKey: string, allowedValues: any[] = []) => {
  const normalizedKey = String(attributeKey || '').trim().toLowerCase();
  const correctionMap = ATTRIBUTE_VALUE_CORRECTIONS[normalizedKey] || {};
  const deduped = new Map<string, { shortForm: string; fullForm: string }>();

  for (const item of allowedValues) {
    const shortFormRaw = String(item?.shortForm ?? item?.value ?? '').trim();
    const fullFormRaw = String(item?.fullForm ?? shortFormRaw).trim();

    if (!shortFormRaw && !fullFormRaw) {
      continue;
    }

    const correctedShortForm = correctionMap[shortFormRaw] || shortFormRaw;
    const key = correctedShortForm.toUpperCase();

    if (!key) {
      continue;
    }

    if (!deduped.has(key)) {
      deduped.set(key, {
        shortForm: correctedShortForm,
        fullForm: fullFormRaw || correctedShortForm
      });
    }
  }

  return Array.from(deduped.values());
};


const BASE_SIMPLIFIED_SCHEMA: SchemaItem[] = [
  // ── Header / identity fields ──────────────────────────────────────────────
  {
    key: 'division',
    label: 'Division',
    type: 'select',
    allowedValues: [
      { shortForm: 'MEN', fullForm: 'MENS' },
      { shortForm: 'KIDS', fullForm: 'KIDS' },
      { shortForm: 'LADIES', fullForm: 'LADIES' }
    ]
  },
  { key: 'sub_division',                  label: 'Sub-Division',                  type: 'text' },
  { key: 'major_category',                label: 'Major Category',                type: 'select', allowedValues: MAJOR_CATEGORY_ALLOWED_VALUES },
  { key: 'design_number',                 label: 'Design Number',                 type: 'text' },
  { key: 'vendor_name',                   label: 'Vendor Name',                   type: 'text' },
  { key: 'reference_article_number',      label: 'Reference Article Number',      type: 'text' },
  { key: 'reference_article_description', label: 'Reference Article Description', type: 'text', required: false },
  { key: 'rate',                          label: 'Rate/Price',                    type: 'text' },
  { key: 'mrp',                           label: 'MRP',                           type: 'text' },
  { key: 'imp_atrbt_2',                   label: 'IMP_ATRBT-2',                   type: 'text' },

  // ── FAB ──────────────────────────────────────────────────────────────────
  { key: 'macro_mvgr',       label: 'IMP ATBT-1',           type: 'select' },
  { key: 'yarn_01',          label: 'M_YARN',               type: 'select' },
  { key: 'main_mvgr',        label: 'FAB_MAIN_MVGR-1',      type: 'select' },
  { key: 'fabric_main_mvgr', label: 'FAB-MAIN-MVGR-2',      type: 'select' },
  { key: 'weave',            label: 'WEAVE 01',             type: 'select' },
  { key: 'm_fab2',           label: 'WEAVE 02',             type: 'select' },
  { key: 'composition',      label: 'M_COMPOSITION',        type: 'select' },
  { key: 'f_count',          label: 'M_COUNT',              type: 'select' },
  { key: 'f_construction',   label: 'M_CONSTRUCTION',       type: 'select' },
  { key: 'lycra_non_lycra',  label: 'M_LYCRA',              type: 'select' },
  { key: 'finish',           label: 'M_FINISH',             type: 'select' },
  { key: 'gsm',              label: 'M_GSM',                type: 'select' },
  { key: 'f_ounce',          label: 'M_OUNZ',               type: 'select' },
  { key: 'f_width',          label: 'M_WIDTH',              type: 'select' },
  { key: 'fab_div',          label: 'M_FAB_DIV',            type: 'select' },

  // ── BODY ─────────────────────────────────────────────────────────────────
  { key: 'collar',        label: 'M_COLLAR_TYPE',        type: 'select' },
  { key: 'collar_style',  label: 'M_COLLAR_STYLE',       type: 'select' },
  { key: 'neck_details',  label: 'M_NECK_STYLE',         type: 'select' },
  { key: 'neck',          label: 'M_NECK_TYPE',          type: 'select' },
  { key: 'placket',       label: 'M_PLACKET',            type: 'select' },
  { key: 'father_belt',   label: 'M_BLT_TYPE',           type: 'select' },
  { key: 'sleeve',        label: 'M_SLEEVES_MAIN_STYLE', type: 'select' },
  { key: 'sleeve_fold',   label: 'M_SLEEVE_FOLD',        type: 'select' },
  { key: 'bottom_fold',   label: 'M_BTM_FOLD',           type: 'select' },
  { key: 'no_of_pocket',  label: 'M_NO_OF_POCKET',       type: 'select' },
  { key: 'pocket_type',   label: 'M_POCKET',             type: 'select' },
  { key: 'extra_pocket',  label: 'M_EXTRA_POCKET',       type: 'select' },
  { key: 'fit',           label: 'M_FIT',                type: 'select' },
  { key: 'body_style',    label: 'BODY STYLE',           type: 'select' },
  { key: 'length',        label: 'M_LENGTH',             type: 'select' },

  // ── VA ACC. ──────────────────────────────────────────────────────────────
  { key: 'drawcord',     label: 'M_DC_STYLE',    type: 'select' },
  { key: 'dc_shape',     label: 'M_DC_SHAPE',    type: 'select' },
  { key: 'button',       label: 'M_BTN_TYPE',    type: 'select' },
  { key: 'btn_colour',   label: 'M_BTN_CLR',     type: 'select' },
  { key: 'zipper',       label: 'M_ZIP_TYPE',    type: 'select' },
  { key: 'zip_colour',   label: 'M_ZIP_COL',     type: 'select' },
  { key: 'patches_type', label: 'M_PATCH_STYLE', type: 'select' },
  { key: 'patches',      label: 'M_PATCHE_TYPE', type: 'select' },

  // ── VA PRCS ──────────────────────────────────────────────────────────────
  { key: 'print_type',       label: 'M_PRINT_TYPE',        type: 'select' },
  { key: 'print_style',      label: 'M_PRINT_STYLE',       type: 'select' },
  { key: 'print_placement',  label: 'M_PRINT_PLACEMENT',   type: 'select' },
  { key: 'embroidery',       label: 'M_EMB_TYPE',          type: 'select' },
  { key: 'embroidery_type',  label: 'M_EMBROIDERY_STYLE',  type: 'select' },
  { key: 'wash',             label: 'M_WASH',              type: 'select' },
];


const { Option } = Select;

// Detect CREATOR with a pre-assigned division — they skip Step 1 entirely.
const getCreatorDivision = (): string | null => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role !== 'CREATOR') return null;
    const div = String(user.division || '').toUpperCase();
    if (div === 'MEN' || div === 'MENS') return 'MENS';
    if (div === 'KIDS') return 'Kids';
    if (div === 'LADIES') return 'Ladies';
    return user.division || null;
  } catch {
    return null;
  }
};

const SimplifiedExtractionPage = () => {
  const creatorDivision = getCreatorDivision();

  const [selectedCategory, setSelectedCategory] = useState<SimplifiedCategory | null>(
    creatorDivision ? { department: creatorDivision, majorCategory: '', displayName: creatorDivision } : null
  );
  const [selectedSubDivision, setSelectedSubDivision] = useState<string | null>(null);
  // CREATOR: start at upload step (division already known); ADMIN: start at category step
  const [currentStep, setCurrentStep] = useState<'category' | 'upload' | 'extraction'>(
    creatorDivision ? 'upload' : 'category'
  );
  const [baseSchema, setBaseSchema] = useState<SchemaItem[]>(BASE_SIMPLIFIED_SCHEMA);
  const [simplifiedSchema, setSimplifiedSchema] = useState<SchemaItem[]>(BASE_SIMPLIFIED_SCHEMA);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name?: string } | null>(null);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [manualNavigation, setManualNavigation] = useState(false);

  const {
    extractedRows,
    isExtracting,
    progress,
    stats,
    addImages,
    extractAllPending,
    clearAll,
    updateRowAttribute,
    removeRow
  } = useImageExtraction();

  useEffect(() => {
    // For CREATOR, ignore saved state — their division is always from the profile.
    if (creatorDivision) return;

    const saved = localStorage.getItem('simplifiedExtractionState');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.selectedCategory) {
          setSelectedCategory(parsed.selectedCategory);
        }
        // Always land on 'category' step so Division/Sub-Division are always visible.
        // The saved selectedCategory pre-fills the dropdowns — user must confirm before uploading.
        // Never restore 'extraction' step — the rows-loaded effect handles that when rows exist.
      } catch {
        // ignore invalid storage
      }
    }
  }, []);

  const isBatchComplete = stats && stats.total > 0 && stats.done === stats.total;

  useEffect(() => {
    if (extractedRows.length > 0 && !manualNavigation) {
      setCurrentStep('extraction');
    }
  }, [extractedRows.length, manualNavigation]);

  useEffect(() => {
    localStorage.setItem(
      'simplifiedExtractionState',
      JSON.stringify({ selectedCategory, currentStep })
    );
  }, [selectedCategory, currentStep]);


  // Called when user clicks "Continue to Upload" in the category selector.
  // Also called with null when the user changes division (to clear stale selection).
  const handleCategorySelect = useCallback((category: SimplifiedCategory | null) => {
    setSelectedCategory(category);
    setSelectedSubDivision(null); // reset sub-division whenever division changes
    if (category) {
      // User confirmed division — build schema and advance to upload step
      setSimplifiedSchema(baseSchema);
      setManualNavigation(false);
      setCurrentStep('upload');
    }
  }, [baseSchema]);

  // Note: No auto-select on load — users always start at Step 1 (category selection)
  // so they can always see and change the Division / Sub-Division.

  useEffect(() => {
    const loadAllowedValues = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/user/attributes?includeValues=true`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });

        if (!response.ok) {
          console.warn('Failed to load master attributes for dropdowns');
          return;
        }

        const payload = await response.json();
        const attributes = payload?.data || [];
        const allowedMap = new Map<string, any[]>(
          attributes.map((attr: any) => [String(attr.key).toLowerCase(), attr.allowedValues || []])
        );

        const schemaWithAllowed = BASE_SIMPLIFIED_SCHEMA.map((item) => {
          const keyLower = item.key.toLowerCase();

          // Enforce mc code list (mc des) for major category (do not override from backend)
          if (keyLower === 'major_category') {
            return {
              ...item,
              allowedValues: normalizeAllowedValues(item.key, MAJOR_CATEGORY_ALLOWED_VALUES)
            };
          }

          const aliasKey = KEY_ALIASES[keyLower] || keyLower;
          const fetchedAllowed = allowedMap.get(keyLower) || allowedMap.get(aliasKey);
          return {
            ...item,
            allowedValues: normalizeAllowedValues(
              item.key,
              (fetchedAllowed && fetchedAllowed.length > 0)
              ? fetchedAllowed
              : (item.allowedValues || [])
            )
          };
        });

        setBaseSchema(schemaWithAllowed);
      } catch (error) {
        console.warn('Failed to load allowed values for simplified schema', error);
      }
    };

    loadAllowedValues();
  }, []);

  useEffect(() => {
    const majorCat = selectedCategory?.majorCategory;
    if (!majorCat) {
      setSimplifiedSchema(baseSchema);
      return;
    }
    const division = selectedCategory?.department || '';
    preloadAttributeValues(division).catch(() => {});
    const mandatoryKeys = getMajCatMandatoryKeys(majorCat);
    const filtered = baseSchema.map((item) => {
      const majCatValues = getMajCatAllowedValues(division, item.key);
      const isRequired = mandatoryKeys.has(item.key);
      return {
        ...item,
        ...(majCatValues ? { allowedValues: majCatValues } : {}),
        required: isRequired
      };
    });
    setSimplifiedSchema(filtered);
  }, [baseSchema, selectedCategory]);

  // When a user adds a custom value not in the master list, update the local schema immediately
  const handleAddToSchema = useCallback((attributeKey: string, value: string) => {
    setSimplifiedSchema(prev => prev.map(item => {
      if (item.key !== attributeKey) return item;
      const normalizedIncoming = normalizeAllowedValues(attributeKey, [{ shortForm: value, fullForm: value }])[0];
      if (!normalizedIncoming) return item;
      const alreadyExists = item.allowedValues?.some(
        v => (v.shortForm || '').toLowerCase() === normalizedIncoming.shortForm.toLowerCase()
      );
      if (alreadyExists) return item;
      return {
        ...item,
        allowedValues: [...(item.allowedValues || []), normalizedIncoming]
      };
    }));
  }, []);

  // When rate changes, auto-compute MRP = rate * 1.47 rounded up to next multiple of 25.
  // MRP field remains editable — user can override at any time.
  const handleAttributeChange = useCallback((rowId: string, attributeKey: string, value: string | number | null) => {
    updateRowAttribute(rowId, attributeKey, value);
    if (attributeKey === 'rate') {
      const rate = parseFloat(String(value ?? ''));
      if (!isNaN(rate) && rate > 0) {
        const mrp = Math.ceil((rate * 1.47) / 25) * 25;
        updateRowAttribute(rowId, 'mrp', mrp);
      }
    }
  }, [updateRowAttribute]);

  // Handle image upload - move to extraction step
  const handleImagesUpload = useCallback(async (fileList: File[]) => {
    await addImages(fileList);
    if (fileList.length > 0) {
      setManualNavigation(false);
      setCurrentStep('extraction');
    }
  }, [addImages]);

  // Auto-start extraction when images are ready
  const handleStartBatch = useCallback(() => {
    if (selectedCategory && extractAllPending) {
      const subDiv = selectedSubDivision ?? selectedCategory.majorCategory;
      extractAllPending(
        simplifiedSchema,
        selectedCategory.displayName,
        `${selectedCategory.department}-${subDiv}`,
        {} // No metadata
      );
    }
  }, [selectedCategory, selectedSubDivision, extractAllPending, simplifiedSchema]);

  const handleExportClick = useCallback(() => {
    const mandatoryItems = simplifiedSchema.filter((item) => item.required);
    if (mandatoryItems.length === 0) {
      setExportModalVisible(true);
      return;
    }

    type MissingInfo = { rowName: string; missingLabels: string[] };
    const missing: MissingInfo[] = [];

    for (const row of extractedRows) {
      const missingLabels: string[] = [];
      for (const item of mandatoryItems) {
        const attr = row.attributes?.[item.key];
        const val = attr?.schemaValue ?? attr?.rawValue;
        if (val === null || val === undefined || String(val).trim() === '') {
          missingLabels.push(item.label);
        }
      }
      if (missingLabels.length > 0) {
        missing.push({ rowName: row.originalFileName || row.id, missingLabels });
      }
    }

    if (missing.length === 0) {
      setExportModalVisible(true);
      return;
    }

    Modal.error({
      title: 'Mandatory Fields Missing',
      width: 560,
      content: (
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <p style={{ marginBottom: 12, color: '#595959' }}>
            The following rows are missing mandatory fields required for article creation. Please fill them before exporting.
          </p>
          {missing.map(({ rowName, missingLabels }) => (
            <div key={rowName} style={{ marginBottom: 10 }}>
              <strong style={{ fontSize: 12 }}>{rowName}</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {missingLabels.map((label) => (
                  <span
                    key={label}
                    style={{
                      background: '#fff1f0',
                      border: '1px solid #ffa39e',
                      borderRadius: 3,
                      padding: '1px 6px',
                      fontSize: 11,
                      color: '#cf1322'
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ),
    });
  }, [simplifiedSchema, extractedRows]);

  const handleStartOver = () => {
    setManualNavigation(true);
    clearAll();
    setSelectedSubDivision(null);
    if (creatorDivision) {
      // CREATOR: reset to upload step with division pre-filled, not all the way to Step 1
      setSelectedCategory({ department: creatorDivision, majorCategory: '', displayName: creatorDivision });
      setCurrentStep('upload');
    } else {
      setCurrentStep('category');
      setSelectedCategory(null);
      localStorage.removeItem('simplifiedExtractionState');
    }
  };

  const handleBackToCategory = () => {
    setManualNavigation(true);
    setSelectedSubDivision(null);
    if (creatorDivision) {
      // CREATOR: "back" means reset sub-division and stay on upload step
      setSelectedCategory({ department: creatorDivision, majorCategory: '', displayName: creatorDivision });
      setCurrentStep('upload');
    } else {
      setSelectedCategory(null);
      setCurrentStep('category');
      localStorage.removeItem('simplifiedExtractionState');
    }
  };

  const handleGoHome = () => {
    setManualNavigation(true);
    localStorage.removeItem('simplifiedExtractionState');
    window.location.href = '/dashboard';
  };

  const handleImageClick = useCallback((url: string, name?: string) => {
    setSelectedImage({ url, name });
    setImageModalVisible(true);
  }, []);

  return (
    <div className="extraction-scroll-page">
        <div className="content-wrapper">
          {/* Header */}
          <Card size="small" style={{ marginBottom: 12, background: 'linear-gradient(135deg, #7DB9B6 0%, #E6C79C 100%)', border: 'none' }}>
            <div style={{ textAlign: 'center' }}>
              <Title level={3} style={{ color: 'white', margin: 0 }}>
                🚀 Simplified AI Fashion Extraction
              </Title>
              <Text style={{ color: 'rgba(255,255,255,0.9)' }}>
                Division → Category → Upload → Auto-Extract (42 attributes)
              </Text>
            </div>
          </Card>

          {/* Step Indicator */}
          <Card size="small" className="steps-card" style={{ marginBottom: 12, padding: '8px 12px' }}>
            <Steps
              size="small"
              current={
                currentStep === 'category' ? 0 : currentStep === 'upload' ? 1 : 2
              }
              items={[
                  { title: 'Select Category', icon: <AppstoreOutlined /> },
                  { title: 'Upload Images', icon: <UploadOutlined /> },
                  { title: 'Auto-Extract', icon: <RobotOutlined /> }
              ]}
            />
          </Card>

          <div className="main-grid">
            <div className="left-panel">
              {/* Step 1: Category Selection */}
              {currentStep === 'category' && (
                <Card className="step-card" style={{
                  border: '2px solid #7DB9B6',
                  boxShadow: '0 8px 32px rgba(125, 185, 182, 0.18)',
                  padding: '16px'
                }}>
                  <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <Title level={4} style={{ color: '#7DB9B6', marginBottom: 4 }}>
                      Step 1: Select Division
                    </Title>
                    <Text type="secondary" style={{ fontSize: '13px' }}>
                      Choose Division → Sub-Division (Upper/Lower/Sets/Denim)
                    </Text>
                  </div>
                  <SimplifiedCategorySelector
                    selectedCategory={selectedCategory}
                    onCategorySelect={handleCategorySelect}
                  />
                </Card>
              )}

              {/* Step 2: Image Upload */}
              {currentStep === 'upload' && (
                <Card className="step-card" style={{
                  border: '2px solid #E6C79C',
                  boxShadow: '0 8px 32px rgba(230, 199, 156, 0.18)',
                  padding: '16px'
                }}>
                  <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <Title level={4} style={{ color: '#CFAF7F', marginBottom: 4 }}>
                      📸 Step 2: Upload Images
                    </Title>
                    <Text type="secondary" style={{ fontSize: '13px' }}>
                      Division: <strong>{selectedCategory?.department}</strong>
                      {selectedSubDivision ? <> | Sub-Division: <strong>{selectedSubDivision}</strong></> : null}
                      {' '}| Upload images to auto-start extraction
                    </Text>
                  </div>

                  {/* Only show "Change Division" button for Admin — CREATOR's division is fixed */}
                  {!creatorDivision && (
                    <div style={{ marginBottom: 12 }}>
                      <Button
                        onClick={handleBackToCategory}
                        type="link"
                        size="small"
                        style={{ paddingLeft: 0 }}
                      >
                        ← Change Division
                      </Button>
                    </div>
                  )}

                  {/* Sub-Division selector */}
                  <div style={{ marginBottom: 20 }}>
                    <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                      {creatorDivision ? '1.' : '2.'} Sub-Division
                    </Text>
                    <Select
                      placeholder="Select Sub-Division (e.g. MU, MW, LU, LW…)"
                      value={selectedSubDivision ?? undefined}
                      onChange={(value: string) => {
                        setSelectedSubDivision(value);
                        setSelectedCategory(prev =>
                          prev ? { ...prev, majorCategory: value, displayName: `${prev.department} - ${value}` } : prev
                        );
                      }}
                      style={{ width: '100%' }}
                      size="large"
                      allowClear
                      showSearch
                      filterOption={(input, option) =>
                        String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                    >
                      {(SIMPLIFIED_HIERARCHY[selectedCategory?.department ?? ''] || []).map(sub => (
                        <Option key={sub} value={sub}>{sub}</Option>
                      ))}
                    </Select>
                  </div>

                  {!selectedSubDivision && (
                    <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, fontSize: 13, color: '#ad6800' }}>
                      Please select a Sub-Division before uploading images.
                    </div>
                  )}

                  <div style={{ opacity: selectedSubDivision ? 1 : 0.4, pointerEvents: selectedSubDivision ? 'auto' : 'none' }}>
                    <UploadArea onUpload={async (_file: File, fileList: File[]) => {
                      await handleImagesUpload(fileList);
                      return false;
                    }} />
                  </div>
                </Card>
              )}

              {/* Step 3: Extraction Results */}
              {currentStep === 'extraction' && extractedRows.length > 0 && (
                <Card className="step-card" style={{
                  border: '2px solid #A7B6D9',
                  boxShadow: '0 8px 32px rgba(167, 182, 217, 0.18)',
                  padding: '12px 16px'
                }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <Title level={5} style={{ color: '#7F8EB8', margin: 0, display: 'inline-block', marginRight: 12 }}>
                          🤖 Step 3: Auto-Extraction Results
                        </Title>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {selectedCategory?.displayName} | {extractedRows.length} images | 42 attributes
                        </Text>
                      </div>
                      {stats && (
                        <Space size="middle">
                          <Text style={{ fontSize: '12px' }}>
                            <span style={{ color: '#7BAF7A', fontWeight: 'bold' }}>{stats.done}</span> Done
                          </Text>
                          <Text style={{ fontSize: '12px' }}>
                            <span style={{ color: '#CFAF7F', fontWeight: 'bold' }}>{stats.pending}</span> Pending
                          </Text>
                          <Text style={{ fontSize: '12px' }}>
                            <span style={{ color: '#7F8EB8', fontWeight: 'bold' }}>{Math.round(stats.successRate)}%</span> Success
                          </Text>
                        </Space>
                      )}
                    </div>
                  </div>

                  {/* Processing Status */}
                  {(stats.pending > 0 && !isExtracting) && (
                    <div style={{ marginBottom: 12 }}>
                      <Alert
                        message="Ready to Extract"
                        description={`${stats.pending} image(s) ready for AI extraction. Click "Start Batch" to begin.`}
                        type="info"
                        showIcon
                      />
                    </div>
                  )}

                  {isExtracting && !isBatchComplete && (
                    <div style={{ marginBottom: 12 }}>
                      <Progress
                        percent={Math.round(progress)}
                        status="active"
                        strokeColor={{ from: '#7DB9B6', to: '#E6C79C' }}
                      />
                    </div>
                  )}

                  {/* Stats Summary */}
                  {isBatchComplete && (
                    <Alert
                      message="Extraction Complete!"
                      description={
                        <Row gutter={16} style={{ marginTop: 8 }}>
                          <Col span={8}>
                            <Statistic
                              title="Processed"
                              value={stats.done}
                              prefix={<CheckCircleOutlined />}
                              valueStyle={{ fontSize: '20px', color: '#7BAF7A' }}
                            />
                          </Col>
                          <Col span={8}>
                            <Statistic
                              title="Success Rate"
                              value={Math.round(stats.successRate)}
                              suffix="%"
                              valueStyle={{ fontSize: '20px', color: '#7F8EB8' }}
                            />
                          </Col>
                          <Col span={8}>
                            <Statistic
                              title="Auto-Validated"
                              value="Enabled"
                              valueStyle={{ fontSize: '16px', color: '#7F8EB8' }}
                            />
                          </Col>
                        </Row>
                      }
                      type="success"
                      showIcon
                      style={{ marginBottom: 12 }}
                    />
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <Button
                      onClick={() => {
                        setManualNavigation(true);
                        setCurrentStep('upload');
                      }}
                      type="link"
                      size="small"
                      style={{ paddingLeft: 0 }}
                    >
                      ← Back to Upload
                    </Button>
                    <Space>
                      {!isExtracting && stats.pending > 0 && (
                        <Button
                          type="primary"
                          icon={<RobotOutlined />}
                          onClick={handleStartBatch}
                          size="large"
                          style={{
                            background: 'linear-gradient(135deg, #7DB9B6 0%, #E6C79C 100%)',
                            border: 'none',
                            fontWeight: 600
                          }}
                        >
                          Start Batch ({stats.pending})
                        </Button>
                      )}
                      <Button
                        icon={<DownloadOutlined />}
                        type="primary"
                        disabled={stats?.done === 0}
                        onClick={handleExportClick}
                      >
                        Export Results
                      </Button>
                      {stats && stats.done === stats.total && stats.total > 0 && (
                        <Button
                          onClick={handleGoHome}
                        >
                          Go Home
                        </Button>
                      )}
                      <Button
                        icon={<ClearOutlined />}
                        onClick={handleStartOver}
                        danger
                      >
                        Start Over
                      </Button>
                    </Space>
                  </div>

                  {/* Results Table */}
                  <div style={{
                    background: '#fafafa',
                    padding: '12px',
                    borderRadius: 8,
                    marginBottom: 12
                  }}>
                    <Text strong>📊 Extraction Results</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      Results are validated automatically. Low-confidence values are hidden.
                    </Text>
                  </div>

                  <AttributeTable
                    extractedRows={extractedRows}
                    schema={simplifiedSchema}
                    selectedRowKeys={[]}
                    onSelectionChange={() => { }}
                    onAttributeChange={handleAttributeChange}
                    onDeleteRow={removeRow}
                    onImageClick={handleImageClick}
                    onReExtract={() => { }}
                    onAddToSchema={handleAddToSchema}
                    isExtracting={isExtracting}
                  />
                </Card>
              )}
            </div>
          </div>
        </div>

      <Modal
        title={selectedImage?.name || "Image Preview"}
        open={imageModalVisible}
        onCancel={() => setImageModalVisible(false)}
        footer={null}
        width={720}
        centered
      >
        <div style={{ textAlign: 'center' }}>
          <Image
            src={selectedImage?.url || ""}
            alt={selectedImage?.name || "Product Image"}
            style={{ maxWidth: '100%', maxHeight: '60vh' }}
            preview={{
              mask: 'Click to zoom',
            }}
          />
        </div>
      </Modal>

      <Modal
        title="Export Results"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={null}
        width={720}
        centered
      >
        <ExportManager
          extractedRows={extractedRows}
          schema={simplifiedSchema}
          categoryName={selectedCategory?.displayName}
          onClose={() => setExportModalVisible(false)}
        />
      </Modal>
    </div>
  );
};

export default SimplifiedExtractionPage;
