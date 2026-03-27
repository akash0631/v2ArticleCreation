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
  Layout, Typography, Card, Button, Space, Steps, Alert, Progress, Row, Col, Statistic, Modal, Image
} from "antd";
import {
  ClearOutlined, DownloadOutlined,
  CheckCircleOutlined, UploadOutlined, RobotOutlined, AppstoreOutlined
} from "@ant-design/icons";

import { SimplifiedCategorySelector } from "../components/SimplifiedCategorySelector";
import type { SimplifiedCategory } from "../components/SimplifiedCategorySelector";
import { UploadArea } from "../components";
import { AttributeTable } from "../components/AttributeTable";
import ExportManager from "../components/ExportManager";
import { useImageExtraction } from "../../../shared/hooks/extraction/useImageExtraction";
import type { SchemaItem } from "../../../shared/types/extraction/ExtractionTypes";
import { MAJOR_CATEGORY_ALLOWED_VALUES } from "../../../data/majorCategoryMcCodeMap";

import "./ExtractionPage.css";
import "../../../styles/App.css";

const { Content } = Layout;
const { Title, Text } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const UPPER_ONLY_KEYS = ['neck', 'neck_details', 'collar', 'placket', 'sleeve', 'front_open_style'];
const LOWER_ONLY_KEYS = ['drawcord', 'father_belt', 'child_belt'];

const KEY_ALIASES: Record<string, string> = {
  neck_details: 'neck_detail',
  colour: 'color',
  child_belt: 'child_belt_detail',
  lycra_non_lycra: 'lycra_non\nlycra',
  patches_type: 'patch_type'
};


const BASE_SIMPLIFIED_SCHEMA: SchemaItem[] = [
  {
    key: 'division',
    label: 'Division',
    type: 'select',
    allowedValues: [
      { shortForm: 'MEN', fullForm: 'MEN' },
      { shortForm: 'KIDS', fullForm: 'KIDS' },
      { shortForm: 'LADIES', fullForm: 'LADIES' }
    ]
  },
  { key: 'major_category', label: 'Major Category', type: 'select', allowedValues: MAJOR_CATEGORY_ALLOWED_VALUES },
  { key: 'reference_article_number', label: 'Reference Article Number', type: 'text' },
  { key: 'reference_article_description', label: 'Reference Article Description', type: 'text' },
  { key: 'vendor_name', label: 'Vendor Name', type: 'text' },
  { key: 'design_number', label: 'Design Number', type: 'text' },
  { key: 'ppt_number', label: 'PPT Number', type: 'text' },
  { key: 'rate', label: 'Rate/Price', type: 'text' },
  { key: 'size', label: 'Size', type: 'text' },
  { key: 'yarn_01', label: 'Yarn 1', type: 'select' },
  { key: 'yarn_02', label: 'Yarn 2', type: 'select' },
  { key: 'fabric_main_mvgr', label: 'Fabric Main MVGR', type: 'select' },
  { key: 'weave', label: 'Weave', type: 'select' },
  { key: 'composition', label: 'Composition', type: 'select' },
  { key: 'finish', label: 'Finish', type: 'select' },
  { key: 'gsm', label: 'GSM', type: 'select' },
  { key: 'shade', label: 'Shade', type: 'select' },
  { key: 'weight', label: 'G-Weight', type: 'text' },
  { key: 'lycra_non_lycra', label: 'Lycra/Non Lycra', type: 'select' },
  { key: 'neck', label: 'Neck', type: 'select' },
  { key: 'neck_details', label: 'Neck Details', type: 'select' },
  { key: 'collar', label: 'Collar', type: 'select' },
  { key: 'placket', label: 'Placket', type: 'select' },
  { key: 'sleeve', label: 'Sleeve', type: 'select' },
  { key: 'bottom_fold', label: 'Bottom Fold', type: 'select' },
  { key: 'front_open_style', label: 'Front Open Style', type: 'select' },
  { key: 'pocket_type', label: 'Pocket Type', type: 'select' },
  { key: 'fit', label: 'Fit', type: 'select' },
  { key: 'pattern', label: 'Pattern', type: 'select' },
  { key: 'length', label: 'Length', type: 'select' },
  { key: 'drawcord', label: 'Drawcord', type: 'select' },
  { key: 'button', label: 'Button', type: 'select' },
  { key: 'zipper', label: 'Zipper', type: 'select' },
  { key: 'zip_colour', label: 'Zip Colour', type: 'select' },
  { key: 'print_type', label: 'Print Type', type: 'select' },
  { key: 'print_style', label: 'Print Style', type: 'select' },
  { key: 'print_placement', label: 'Print Placement', type: 'select' },
  { key: 'patches', label: 'Patches', type: 'select' },
  { key: 'patches_type', label: 'Patches Type', type: 'select' },
  { key: 'embroidery', label: 'Embroidery', type: 'select' },
  { key: 'embroidery_type', label: 'Embroidery Type', type: 'select' },
  { key: 'wash', label: 'Wash', type: 'select' },
  { key: 'colour', label: 'Colour', type: 'select' },
  { key: 'father_belt', label: 'Father Belt', type: 'select' },
  { key: 'child_belt', label: 'Child Belt', type: 'select' }
];

const BOTTOM_CODES = ['KB-L', 'KG-L', 'ML', 'MS-L', 'LL'];
const TOP_CODES = ['KB-U', 'MU', 'MS-U', 'KG-U', 'LU'];

const isBottomCategory = (value?: string) => {
  if (!value) return false;
  return BOTTOM_CODES.includes(value);
};

const isTopCategory = (value?: string) => {
  if (!value) return false;
  return TOP_CODES.includes(value);
};

const isFullBodyCategory = (value?: string) => {
  if (!value) return false;
  return !BOTTOM_CODES.includes(value) && !TOP_CODES.includes(value);
};

const filterSchemaByCategory = (schema: SchemaItem[], majorCategory?: string) => {
  if (!majorCategory || isFullBodyCategory(majorCategory)) return schema;
  if (isBottomCategory(majorCategory)) {
    return schema.filter(item => !UPPER_ONLY_KEYS.includes(item.key));
  }
  if (isTopCategory(majorCategory)) {
    return schema.filter(item => !LOWER_ONLY_KEYS.includes(item.key));
  }
  return schema;
};

const SimplifiedExtractionPage = () => {
  const [selectedCategory, setSelectedCategory] = useState<SimplifiedCategory | null>(null);
  const [currentStep, setCurrentStep] = useState<'category' | 'upload' | 'extraction'>('category');
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
    const saved = localStorage.getItem('simplifiedExtractionState');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.selectedCategory) {
          setSelectedCategory(parsed.selectedCategory);
        }
        if (parsed?.currentStep) {
          setCurrentStep(parsed.currentStep);
        }
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


  // Handle category selection
  const handleCategorySelect = useCallback((category: SimplifiedCategory | null) => {
    setSelectedCategory(category);
    setSimplifiedSchema(filterSchemaByCategory(baseSchema, category?.majorCategory));
    if (category) {
      setManualNavigation(false);
      setTimeout(() => setCurrentStep('upload'), 300);
    }
  }, [baseSchema]);

  // Auto-detect Creator scope
  useEffect(() => {
    // Only auto-select if we haven't manually reset/navigated away
    if (manualNavigation) return;

    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return;

      const user = JSON.parse(userStr);
      if (user.role === 'CREATOR' && user.division && user.subDivision) {
        // Normalize division: MEN -> Mens, KIDS -> Kids, LADIES -> Ladies
        let normalizedDept = user.division;
        const upperDept = user.division.toUpperCase();
        if (upperDept === 'MEN') normalizedDept = 'Mens';
        else if (upperDept === 'KIDS') normalizedDept = 'Kids';
        else if (upperDept === 'LADIES') normalizedDept = 'Ladies';

        // Only auto-select if not already selected to avoid infinite loops/flicker
        if (!selectedCategory) {
          const autoCategory = {
            department: normalizedDept,
            majorCategory: user.subDivision,
            displayName: `${normalizedDept} - ${user.subDivision}`
          };

          setSelectedCategory(autoCategory);
          setSimplifiedSchema(filterSchemaByCategory(baseSchema, user.subDivision));
          setCurrentStep('upload');
          console.log(`🚀 Auto-selected scope for Creator: ${autoCategory.displayName}`);
        }
      }
    } catch (error) {
      console.warn('Failed to auto-detect user scope', error);
    }
  }, [baseSchema, selectedCategory, manualNavigation]);

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
              allowedValues: MAJOR_CATEGORY_ALLOWED_VALUES
            };
          }

          const aliasKey = KEY_ALIASES[keyLower] || keyLower;
          const fetchedAllowed = allowedMap.get(keyLower) || allowedMap.get(aliasKey);
          return {
            ...item,
            allowedValues: (fetchedAllowed && fetchedAllowed.length > 0)
              ? fetchedAllowed
              : (item.allowedValues || [])
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
    setSimplifiedSchema(filterSchemaByCategory(baseSchema, selectedCategory?.majorCategory));
  }, [baseSchema, selectedCategory?.majorCategory]);

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
      extractAllPending(
        simplifiedSchema,
        selectedCategory.displayName,
        `${selectedCategory.department}-${selectedCategory.majorCategory}`,
        {} // No metadata
      );
    }
  }, [selectedCategory, extractAllPending, simplifiedSchema]);

  const handleStartOver = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isRestrictedCreator = user.role === 'CREATOR' && user.division && user.subDivision;

    setManualNavigation(isRestrictedCreator ? false : true);
    clearAll();
    setCurrentStep(isRestrictedCreator ? 'upload' : 'category');
    setSelectedCategory(isRestrictedCreator ? selectedCategory : null);
    localStorage.removeItem('simplifiedExtractionState');
  };

  const handleBackToCategory = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role === 'CREATOR' && user.division) return; // Block back for creators

    setManualNavigation(true);
    setSelectedCategory(null);
    setCurrentStep('category');
    localStorage.removeItem('simplifiedExtractionState');
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
    <Layout className="app-layout extraction-scroll-page">
      <Content className="app-content">
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
                (() => {
                  const user = JSON.parse(localStorage.getItem('user') || '{}');
                  const isRestricted = user.role === 'CREATOR' && user.division;
                  if (isRestricted) {
                    return currentStep === 'upload' ? 0 : 1;
                  }
                  return currentStep === 'category' ? 0 : currentStep === 'upload' ? 1 : 2;
                })()
              }
              items={(() => {
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                const isRestricted = user.role === 'CREATOR' && user.division;
                const items = [
                  { title: 'Select Category', icon: <AppstoreOutlined /> },
                  { title: 'Upload Images', icon: <UploadOutlined /> },
                  { title: 'Auto-Extract', icon: <RobotOutlined /> }
                ];
                return isRestricted ? items.slice(1) : items;
              })()}
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
                    key={selectedCategory?.displayName || 'none'}
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
                      Selected: <strong>{selectedCategory?.displayName}</strong> |
                      Upload images to auto-start extraction
                    </Text>
                  </div>

                  {(!localStorage.getItem('user') || JSON.parse(localStorage.getItem('user') || '{}').role !== 'CREATOR' || !JSON.parse(localStorage.getItem('user') || '{}').division) && (
                    <div style={{ marginBottom: 12 }}>
                      <Button
                        onClick={handleBackToCategory}
                        type="link"
                        size="small"
                        style={{ paddingLeft: 0 }}
                      >
                        ← Back to Category Selection
                      </Button>
                    </div>
                  )}

                  <Alert
                    message="Simplified Workflow Active"
                    description="No metadata form required. Extraction will start automatically after upload with fixed 42 attributes."
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />

                  <UploadArea onUpload={async (_file: File, fileList: File[]) => {
                    await handleImagesUpload(fileList);
                    return false;
                  }} />
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
                        onClick={() => setExportModalVisible(true)}
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
                    onAttributeChange={updateRowAttribute}
                    onDeleteRow={removeRow}
                    onImageClick={handleImageClick}
                    onReExtract={() => { }}
                    isExtracting={isExtracting}
                  />
                </Card>
              )}
            </div>
          </div>
        </div>
      </Content>

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
    </Layout>
  );
};

export default SimplifiedExtractionPage;
