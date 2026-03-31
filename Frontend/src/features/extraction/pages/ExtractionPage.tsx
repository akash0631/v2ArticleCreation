import React, { useState, useEffect, useCallback, useMemo } from "react";
// Force HMR update
import {
  Layout, Typography, Card, Spin, Alert, Button, Space, Modal, Progress,
  Steps, Statistic, Row, Col, Image, Tag, message
} from "antd";
import {
  ClearOutlined, DownloadOutlined, DashboardOutlined,
  CheckCircleOutlined, UploadOutlined, RobotOutlined, AppstoreOutlined,
  ClockCircleOutlined, DeleteOutlined
} from "@ant-design/icons";
import "./ExtractionPage.css";

import { CategorySelector } from "../components/CategorySelector";
import { AttributeTable } from "../components/AttributeTable";
import { BulkActions } from "../components/BulkActions";
import { UploadArea, MetadataInputs } from "../components";
import type { ProductMetadata } from "../components";
import { useCategorySelector } from "../../../shared/hooks/category/useCategorySelector";
import { useLocalStorage } from "../../../shared/hooks/ui/useLocalStorage";
import { useCategoryConfig, useAllCategoriesAsConfigs } from "../../../hooks/useHierarchyQueries";
import { indexedDBService } from "../../../shared/services/storage/indexedDBService";
import { useImageExtraction } from "../../../shared/hooks/extraction/useImageExtraction";
import { DiscoveryToggle } from "../components/DiscoveryToggle";
import { DiscoveryDetailModal } from "../components/DiscoveryDetailModal";
import { DiscoveryPanel } from "../components/DiscoveryPanel";
import ExportManager from "../components/ExportManager";
import CostBreakdown from "../../../components/CostBreakdown";
import type {
  DiscoveredAttribute
} from "../../../shared/types/extraction/ExtractionTypes";
import type { CategoryConfig } from "../../../shared/types/category/CategoryTypes";

import "../../../styles/App.css";

const { Content } = Layout;
const { Title, Text } = Typography;

const ExtractionPage = () => {
  // UI State
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name?: string } | null>(null);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [activeDiscovery, setActiveDiscovery] = useState<DiscoveredAttribute | null>(null);
  const [manualNavigation, setManualNavigation] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  // Step Flow State
  const [currentStep, setCurrentStep] = useState<'category' | 'upload' | 'extraction'>('category');

  // Metadata State
  const [metadata, setMetadata] = useState<ProductMetadata>({});

  const [analytics] = useLocalStorage("analytics", {
    totalExtractions: 0,
    totalTokens: 0,
    totalTime: 0,
    averageAccuracy: 0,
    sessionsToday: 0,
    lastUsed: null,
  });
  const [persistedCategoryCode, setPersistedCategoryCode] = useLocalStorage("selectedCategory", "");

  // Fetch persisted category from database
  const { data: persistedCategory, isLoading: isLoadingPersistedCategory } = useCategoryConfig(
    persistedCategoryCode,
    { enabled: !!persistedCategoryCode }
  );

  // Fetch all categories for stats
  const { data: allCategories = [], isLoading: isLoadingAllCategories } = useAllCategoriesAsConfigs();

  const { selectedCategory, handleCategorySelect, schema } = useCategorySelector();

  const {
    extractedRows,
    isExtracting,
    progress,
    stats,
    addImages,
    extractImageAttributes,
    extractAllPending,
    cancelExtraction,
    pauseExtraction,
    resumeExtraction,
    retryFailed,
    clearCompleted,
    isPaused,
    estimatedTimeRemaining,
    totalTokensUsed,
    removeRow,
    clearAll,
    updateRowAttribute,
    markRowReviewCompleted,
    markRowsReviewCompleted,
    discoverySettings,
    setDiscoverySettings,
    globalDiscoveries,
    promoteDiscoveryToSchema
  } = useImageExtraction();

  const reviewedCount = useMemo(() => extractedRows.filter((row) => row.reviewCompleted).length, [extractedRows]);
  const eligibleForReviewCount = useMemo(
    () => extractedRows.filter((row) => row.status === 'Done' && !!row.persistedJobId).length,
    [extractedRows]
  );

  const handleMarkSelectedDone = useCallback(async () => {
    const targetIds = selectedRowKeys.map(String);
    const result = await markRowsReviewCompleted(targetIds, true);
    if (result.successCount > 0) message.success(`Marked ${result.successCount} selected article(s) as done.`);
    if (result.failureCount > 0) message.error(`${result.failureCount} selected article(s) failed to mark.`);
    if (result.skippedCount > 0) message.info(`${result.skippedCount} selected row(s) were skipped (not ready/already done).`);
  }, [selectedRowKeys, markRowsReviewCompleted]);

  const handleMarkAllDone = useCallback(async () => {
    const targetIds = extractedRows.map((row) => row.id);
    const result = await markRowsReviewCompleted(targetIds, true);
    if (result.successCount > 0) message.success(`Marked ${result.successCount} article(s) as done.`);
    if (result.failureCount > 0) message.error(`${result.failureCount} article(s) failed to mark.`);
    if (result.skippedCount > 0) message.info(`${result.skippedCount} row(s) were skipped (not ready/already done).`);
  }, [extractedRows, markRowsReviewCompleted]);

  // Enhanced category selection handler that moves to next step
  const handleCategorySelectWithStep = useCallback((category: CategoryConfig | null) => {
    handleCategorySelect(category);
    if (category) {
      setManualNavigation(false);
      setTimeout(() => setCurrentStep('upload'), 300); // Smooth transition
    }
  }, [handleCategorySelect]);

  // Enhanced image upload handler that moves to extraction step
  const handleImagesUpload = useCallback(async (fileList: File[]) => {
    await addImages(fileList);
    if (fileList.length > 0) {
      setManualNavigation(false);
      setTimeout(() => setCurrentStep('extraction'), 500); // Smooth transition after upload
    }
  }, [addImages]);

  // Reset flow when clearing all data
  const handleClearAllWithReset = useCallback(() => {
    setManualNavigation(true);
    clearAll();
    setCurrentStep('category');
    handleCategorySelect(null);
  }, [clearAll, handleCategorySelect]);

  const isBatchComplete = stats && stats.total > 0 && stats.done === stats.total;

  useEffect(() => {
    if (extractedRows.length > 0 && !manualNavigation) {
      setCurrentStep('extraction');
    }
  }, [extractedRows.length, manualNavigation]);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await indexedDBService.initialize();
        // Wait for persisted category to load from database
        if (persistedCategoryCode && persistedCategory) {
          handleCategorySelect(persistedCategory);
        }
        setAppReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unknown error occurred during initialization");
      }
    };

    // Don't initialize until we've loaded the persisted category (if any)
    if (!persistedCategoryCode || persistedCategory || !isLoadingPersistedCategory) {
      initializeApp();
    }
  }, [persistedCategoryCode, persistedCategory, isLoadingPersistedCategory, handleCategorySelect]);

  useEffect(() => {
    if (selectedCategory) {
      setPersistedCategoryCode(selectedCategory.category);
    }
  }, [selectedCategory, setPersistedCategoryCode]);

  const handleImageClick = useCallback((url: string, name?: string) => {
    setSelectedImage({ url, name });
    setImageModalVisible(true);
  }, []);

  const handleRowSelection = useCallback((keys: React.Key[]) => {
    setSelectedRowKeys(keys);
  }, []);

  const handleToggleAnalytics = useCallback(() => {
    setShowAnalytics(prev => !prev);
  }, []);

  const handleDiscoveryClick = useCallback((discovery: DiscoveredAttribute) => {
    setActiveDiscovery(discovery);
  }, []);

  const handlePromoteDiscovery = useCallback((discoveryKey: string) => {
    const discovery = globalDiscoveries.find(d => d.key === discoveryKey);
    if (discovery) {
      promoteDiscoveryToSchema(discovery.key);
    }
    setActiveDiscovery(null);
  }, [promoteDiscoveryToSchema, globalDiscoveries]);

  const handleBulkEdit = useCallback((attributeKey: string, value: string | number | null) => {
    selectedRowKeys.forEach(rowKey => {
      const rowId = rowKey.toString();
      updateRowAttribute(rowId, attributeKey, value);
    });
  }, [selectedRowKeys, updateRowAttribute]);

  return (!appReady || isLoadingAllCategories) ? (
    <Layout style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
      <Content style={{ textAlign: "center" }}>
        <Card style={{ textAlign: "center", maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
          <Spin size="large" />
          <Title level={4} style={{ marginTop: 16, color: "#FF6F61" }}>
            Initializing AI Fashion System
          </Title>
          <Text type="secondary">
            {isLoadingAllCategories
              ? "Loading categories from database..."
              : `Setting up ${allCategories.length} categories...`
            }
          </Text>
          {error && (
            <Alert
              message="Initialization Error"
              description={error}
              type="error"
              style={{ marginTop: 16, textAlign: "left" }}
            />
          )}
        </Card>
      </Content>
    </Layout>
  ) : (
    <Layout className="app-layout extraction-scroll-page">
      <Content className="app-content">
        <div className="content-wrapper">
          {/* Step Indicator - Compact */}
          <Card size="small" className="steps-card" style={{ marginBottom: 12, padding: '8px 12px' }}>
            <Steps
              size="small"
              current={
                currentStep === 'category' ? 0 :
                  currentStep === 'upload' ? 1 : 2
              }
              items={[
                {
                  title: 'Select Category',
                  icon: <AppstoreOutlined />,
                },
                {
                  title: 'Upload Images',
                  icon: <UploadOutlined />,
                },
                {
                  title: 'AI Extraction',
                  icon: <RobotOutlined />,
                }
              ]}
            />
          </Card>

          {showAnalytics && (
            <Card size="small" className="stats-card animate-slide-up" style={{ marginBottom: 12, padding: '12px' }}>
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={12} lg={6}>
                  <Statistic
                    title="Total Extractions"
                    value={analytics.totalExtractions}
                    prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                    valueStyle={{ fontSize: '20px' }}
                  />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Statistic
                    title="Tokens Used"
                    value={analytics.totalTokens}
                    prefix={<RobotOutlined style={{ color: '#FF6F61' }} />}
                    valueStyle={{ fontSize: '20px' }}
                  />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Statistic
                    title="Processing Time"
                    value={(analytics.totalTime / 1000).toFixed(1)}
                    suffix="s"
                    prefix={<DashboardOutlined style={{ color: '#fa8c16' }} />}
                    valueStyle={{ fontSize: '20px' }}
                  />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Statistic
                    title="Avg Accuracy"
                    value={(analytics.averageAccuracy * 100).toFixed(1)}
                    suffix="%"
                    prefix={<CheckCircleOutlined style={{ color: '#722ed1' }} />}
                    valueStyle={{ fontSize: '20px' }}
                  />
                </Col>
              </Row>
            </Card>
          )}

          <div className="main-grid">
            <div className="left-panel">
              {/* Step 1: Category Selection */}
              {currentStep === 'category' && (
                <Card className="step-card" style={{
                  border: '2px solid #FF6F61',
                  boxShadow: '0 8px 32px rgba(24, 144, 255, 0.1)',
                  padding: '16px'
                }}>
                  <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <Title level={4} style={{ color: '#FF6F61', marginBottom: 4 }}>
                      Step 1: Select Fashion Division
                    </Title>
                    <Text type="secondary" style={{ fontSize: '13px' }}>Choose the division that matches your images</Text>
                  </div>
                  <CategorySelector
                    selectedCategory={selectedCategory}
                    onCategorySelect={handleCategorySelectWithStep}
                  />
                </Card>
              )}

              {/* Step 2: Image Upload */}
              {currentStep === 'upload' && (
                <Card className="step-card" style={{
                  border: '2px solid #52c41a',
                  boxShadow: '0 8px 32px rgba(82, 196, 26, 0.1)',
                  padding: '16px'
                }}>
                  <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <Title level={4} style={{ color: '#52c41a', marginBottom: 4 }}>
                      📸 Step 2: Upload Images
                    </Title>
                    <Text type="secondary" style={{ fontSize: '13px' }}>
                      Selected: <strong>{selectedCategory?.displayName}</strong> |
                      Upload your fashion images for AI analysis
                    </Text>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <Button
                      onClick={() => setCurrentStep('category')}
                      type="link"
                      size="small"
                      style={{ paddingLeft: 0 }}
                    >
                      ← Back to Division Selection
                    </Button>
                    <Space>
                      <DiscoveryToggle
                        settings={discoverySettings}
                        onChange={setDiscoverySettings}
                      />
                      <Button
                        icon={<DashboardOutlined />}
                        onClick={handleToggleAnalytics}
                        className={showAnalytics ? "btn-primary" : "btn-secondary"}
                      >
                        Analytics
                      </Button>
                    </Space>
                  </div>

                  {/* Product Metadata Inputs */}
                  <MetadataInputs
                    value={metadata}
                    onChange={setMetadata}
                    disabled={isExtracting}
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
                  border: '2px solid #722ed1',
                  boxShadow: '0 8px 32px rgba(114, 46, 209, 0.1)',
                  padding: '12px 16px'
                }}>
                  {/* Compact Header with Inline Stats */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <Title level={5} style={{ color: '#722ed1', margin: 0, display: 'inline-block', marginRight: 12 }}>
                          Step 3: AI Extraction Results
                        </Title>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {selectedCategory?.displayName} | {extractedRows.length} images
                        </Text>
                      </div>
                      {stats && (
                        <Space size="middle">
                          <Text style={{ fontSize: '12px' }}>
                            <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{stats.done}</span> Done
                          </Text>
                          <Text style={{ fontSize: '12px' }}>
                            <span style={{ color: '#fa8c16', fontWeight: 'bold' }}>{stats.pending}</span> Pending
                          </Text>
                          <Text style={{ fontSize: '12px' }}>
                            <span style={{ color: '#722ed1', fontWeight: 'bold' }}>{Math.round(stats.successRate)}%</span> Success
                          </Text>
                        </Space>
                      )}
                    </div>
                  </div>

                  {/* Processing Status Section - Compact */}
                  {extractedRows.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      {/* Overall Progress Bar */}
                      {(isExtracting || stats.done > 0) && (
                        <div style={{ marginBottom: 12 }}>
                          <Progress
                            percent={Math.round(progress)}
                            status={
                              isExtracting ? 'active' :
                                stats.error > 0 && stats.done + stats.error === stats.total ? 'exception' :
                                  stats.done === stats.total ? 'success' : 'normal'
                            }
                            strokeColor={{
                              from: '#722ed1',
                              to: '#eb2f96'
                            }}
                            size="small"
                          />

                          {/* Live Processing Info */}
                          {isExtracting && (
                            <div style={{ marginTop: 8 }}>
                              <Space size="middle" wrap>
                                {stats.extracting > 0 && (
                                  <Text type="secondary" style={{ fontSize: '12px' }}>
                                    🔄 Processing: <strong>{stats.extracting}</strong>
                                  </Text>
                                )}
                                {totalTokensUsed > 0 && (
                                  <Text type="secondary" style={{ fontSize: '12px' }}>
                                    Tokens: <strong>{totalTokensUsed.toLocaleString()}</strong>
                                  </Text>
                                )}
                                {estimatedTimeRemaining > 0 && (
                                  <Text type="secondary" style={{ fontSize: '12px' }}>
                                    ⏱️ ETA: <strong>{Math.round(estimatedTimeRemaining)}s</strong>
                                  </Text>
                                )}
                              </Space>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status Banner */}
                      {isExtracting && isPaused && (
                        <Alert
                          message="Batch processing is paused"
                          description="Click Resume to continue processing, or Stop to cancel."
                          type="warning"
                          showIcon
                          style={{ marginBottom: 12 }}
                        />
                      )}

                      {!isExtracting && stats.done + stats.error === stats.total && stats.total > 0 && (
                        <Alert
                          message={
                            stats.error === 0
                              ? 'Batch processing completed successfully!'
                              : `Batch completed with ${stats.error} failed items`
                          }
                          description={
                            stats.error === 0
                              ? `All ${stats.done} items processed successfully.`
                              : `${stats.done} succeeded, ${stats.error} failed. You can retry failed items below.`
                          }
                          type={stats.error === 0 ? 'success' : 'warning'}
                          showIcon
                          style={{ marginBottom: 12 }}
                        />
                      )}

                      {/* Action Controls */}
                      <div style={{ marginTop: 12, marginBottom: 12 }}>
                        <Space wrap size="small">
                          {/* Start/Pause/Resume/Stop */}
                          {!isExtracting && stats.pending > 0 && (
                            <Button
                              type="primary"
                              icon={<RobotOutlined />}
                              onClick={() => extractAllPending && extractAllPending(
                                schema,
                                selectedCategory?.displayName,
                                selectedCategory?.category, // category code
                                metadata // metadata object
                              )}
                              style={{
                                background: 'linear-gradient(135deg, #722ed1 0%, #eb2f96 100%)',
                                border: 'none'
                              }}
                            >
                              Start Batch ({stats.pending + stats.error})
                            </Button>
                          )}

                          {isExtracting && !isPaused && (
                            <Button
                              icon={<ClockCircleOutlined />}
                              onClick={pauseExtraction}
                            >
                              Pause
                            </Button>
                          )}

                          {isExtracting && isPaused && (
                            <Button
                              type="primary"
                              icon={<RobotOutlined />}
                              onClick={resumeExtraction}
                            >
                              Resume
                            </Button>
                          )}

                          {isExtracting && (
                            <Button
                              danger
                              icon={<ClearOutlined />}
                              onClick={cancelExtraction}
                            >
                              Stop
                            </Button>
                          )}

                          {/* Batch Operations */}
                          {!isExtracting && stats.error > 0 && (
                            <Button
                              icon={<CheckCircleOutlined />}
                              onClick={retryFailed}
                            >
                              Retry Failed ({stats.error})
                            </Button>
                          )}

                          {!isExtracting && stats.done > 0 && (
                            <Button
                              icon={<DeleteOutlined />}
                              onClick={clearCompleted}
                            >
                              Clear Completed ({stats.done})
                            </Button>
                          )}
                        </Space>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, marginTop: 8 }}>
                    <Space size="small">
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
                      <Button
                        onClick={() => {
                          setManualNavigation(true);
                          setCurrentStep('category');
                        }}
                        type="link"
                        size="small"
                      >
                        ← Change Category
                      </Button>
                    </Space>
                    <Space>
                      <Tag color="green">Checked: {reviewedCount}/{eligibleForReviewCount}</Tag>
                      <Button
                        onClick={handleMarkSelectedDone}
                        disabled={selectedRowKeys.length === 0}
                      >
                        Mark Selected Done
                      </Button>
                      <Button
                        onClick={handleMarkAllDone}
                        disabled={eligibleForReviewCount === 0 || reviewedCount >= eligibleForReviewCount}
                      >
                        Mark All Done
                      </Button>
                      <BulkActions
                        selectedRowKeys={selectedRowKeys}
                        selectedRowCount={selectedRowKeys.length}
                        onBulkEdit={handleBulkEdit}
                        schema={schema}
                        onClearSelection={() => setSelectedRowKeys([])}
                      />
                      <Button
                        icon={<DownloadOutlined />}
                        onClick={() => setExportModalVisible(true)}
                        className="btn-secondary"
                      >
                        Export
                      </Button>
                      <Button
                        onClick={() => setShowCostBreakdown(!showCostBreakdown)}
                        type={showCostBreakdown ? 'primary' : 'default'}
                      >
                        💰 Cost Tracking
                      </Button>
                      <Button
                        icon={<ClearOutlined />}
                        onClick={handleClearAllWithReset}
                        className="btn-danger"
                      >
                        Start Over
                      </Button>
                    </Space>
                  </div>

                  {isExtracting && !isBatchComplete && (
                    <div className="extraction-progress">
                      <Progress
                        percent={progress}
                        status="active"
                        strokeColor="#FF6F61"
                        trailColor="#e6f3fe"
                      />
                      <div className="progress-info">
                        <Space>
                          <Text> AI Processing...</Text>
                          <Text type="secondary">({progress.toFixed(1)}%)</Text>
                        </Space>
                      </div>
                    </div>
                  )}

                  <AttributeTable
                    extractedRows={extractedRows}
                    schema={schema}
                    selectedRowKeys={selectedRowKeys}
                    onSelectionChange={handleRowSelection}
                    onAttributeChange={updateRowAttribute}
                    onDeleteRow={removeRow}
                    onImageClick={handleImageClick}
                    onReExtract={(rowId: string) => {
                      const row = extractedRows.find(r => r.id === rowId);
                      if (row && schema && selectedCategory) {
                        // Call direct extraction
                        extractImageAttributes(
                          row,
                          schema,
                          selectedCategory.displayName
                        );
                      }
                    }}
                    onMarkReviewComplete={markRowReviewCompleted}
                    isExtracting={isExtracting}
                  />

                  {/* Cost Breakdown Section */}
                  {showCostBreakdown && (
                    <div style={{ marginTop: 24, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
                      <CostBreakdown />
                    </div>
                  )}
                </Card>
              )}
            </div>

            {/* Right Panel - Show Discovery Panel only during extraction step */}
            {currentStep === 'extraction' && (
              <div className="right-panel">
                <DiscoveryPanel
                  discoveries={globalDiscoveries}
                  onPromoteToSchema={(discoveryKey: string) => promoteDiscoveryToSchema(discoveryKey)}
                  onViewDetails={handleDiscoveryClick}
                />
              </div>
            )}
          </div>
        </div>
      </Content>

      {/* Modals */}
      <Modal
        title={selectedImage?.name || "Image Preview"}
        open={imageModalVisible}
        onCancel={() => setImageModalVisible(false)}
        footer={null}
        width={800}
        centered
      >
        <div style={{ textAlign: 'center' }}>
          <Image
            src={selectedImage?.url || ""}
            alt={selectedImage?.name || "Product Image"}
            style={{ maxWidth: '100%', maxHeight: '70vh' }}
            preview={{
              mask: 'Click to zoom',
            }}
          />
        </div>
      </Modal>

      <Modal
        title="Export Data"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={null}
        width={800}
      >
        <ExportManager
          extractedRows={extractedRows}
          schema={schema}
          categoryName={selectedCategory?.displayName}
          onClose={() => setExportModalVisible(false)}
        />
      </Modal>

      <DiscoveryDetailModal
        visible={!!activeDiscovery}
        discovery={activeDiscovery}
        onClose={() => setActiveDiscovery(null)}
        onPromote={handlePromoteDiscovery}
      />
    </Layout>
  );
};

export default ExtractionPage;