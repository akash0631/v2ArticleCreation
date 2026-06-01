// Modern App Root with Clean Architecture
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// App Configuration
import { AppProviders } from './app/providers/AppProviders';

// Layout
import MainLayout from './shared/components/layout/MainLayout';

// Feature Pages
import { LoginPage, RegisterPage } from './features/auth';

import SimplifiedExtractionPage from './features/extraction/pages/SimplifiedExtractionPage'; // NEW: Simplified workflow
import { DashboardPage, ProfilePage, ProductsPage } from './features/dashboard';
import { HierarchyManagement, UsersManagement } from './features/admin';
import Admin from './features/admin/pages/Admin'; // Admin Dashboard
import SrmFailedExtractionsPage from './features/admin/pages/SrmFailedExtractionsPage'; // SRM Failed Extractions
import ApproverDashboard from './features/approver/pages/ApproverDashboard'; // Approver Dashboard
import POPresentationPage from './features/po-presentation/pages/POPresentationPage'; // PO Presentation
import ModelGenerationPage from './features/model-generation/pages/ModelGenerationPage';

// Shared Components
import { ErrorBoundary } from './shared/components/ErrorBoundary';
import { SentryTest } from './components/SentryTest';
import { Toaster } from './shared/components/ui-tw';

// Global Styles
import './styles/App.css';
import './styles/index.css';

// Route Guards
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('authToken');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('authToken');
  const user = localStorage.getItem('user');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (user) {
    const userData = JSON.parse(user);
    if (userData.role !== 'ADMIN') {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};

const ApproverRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('authToken');
  const user = localStorage.getItem('user');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (user) {
    const userData = JSON.parse(user);
    // Allow ADMIN, APPROVER, CATEGORY_HEAD, SUB_DIVISION_HEAD, CREATOR or PO_COMMITTEE (read-only)
    if (userData.role !== 'APPROVER' && userData.role !== 'CATEGORY_HEAD' && userData.role !== 'SUB_DIVISION_HEAD' && userData.role !== 'ADMIN' && userData.role !== 'CREATOR' && userData.role !== 'PO_COMMITTEE') {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};

const CreatorRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('authToken');
  const user = localStorage.getItem('user');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (user) {
    const userData = JSON.parse(user);
    // APPROVER and CATEGORY_HEAD cannot access creator pages; SUB_DIVISION_HEAD can
    if (userData.role === 'APPROVER' || userData.role === 'CATEGORY_HEAD') {
      return <Navigate to="/approver" replace />;
    }
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <AppProviders>
      <ErrorBoundary>
        <Toaster />
        <Router>
            <Routes>
              {/* Public Routes - No MainLayout */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Sentry Test Route (Development Only - Remove or protect in production) */}
              {import.meta.env.MODE === 'development' && (
                <Route path="/sentry-test" element={<SentryTest />} />
              )}

              {/* Protected Routes - With MainLayout */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <MainLayout>
                      <DashboardPage />
                    </MainLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/products"
                element={
                  <CreatorRoute>
                    <MainLayout>
                      <ProductsPage />
                    </MainLayout>
                  </CreatorRoute>
                }
              />
              <Route
                path="/extraction"
                element={
                  <CreatorRoute>
                    <MainLayout>
                      <SimplifiedExtractionPage />
                    </MainLayout>
                  </CreatorRoute>
                }
              />

              <Route
                path="/extraction/simplified"
                element={
                  <CreatorRoute>
                    <MainLayout>
                      <SimplifiedExtractionPage />
                    </MainLayout>
                  </CreatorRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <MainLayout>
                      <ProfilePage />
                    </MainLayout>
                  </ProtectedRoute>
                }
              />

              {/* Admin Routes - With MainLayout */}
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <MainLayout>
                      <Admin />
                    </MainLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/dashboard"
                element={
                  <AdminRoute>
                    <MainLayout>
                      <Admin />
                    </MainLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/hierarchy"
                element={
                  <AdminRoute>
                    <MainLayout>
                      <HierarchyManagement />
                    </MainLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <AdminRoute>
                    <MainLayout>
                      <UsersManagement />
                    </MainLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/expenses"
                element={
                  <AdminRoute>
                    <MainLayout>
                      <Admin />
                    </MainLayout>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/srm-failed"
                element={
                  <AdminRoute>
                    <MainLayout>
                      <SrmFailedExtractionsPage />
                    </MainLayout>
                  </AdminRoute>
                }
              />

              {/* Approver Routes - With MainLayout */}
              <Route
                path="/approver"
                element={
                  <ApproverRoute>
                    <MainLayout>
                      <ApproverDashboard key="new-articles" pathType="new" />
                    </MainLayout>
                  </ApproverRoute>
                }
              />
              <Route
                path="/approver/old-articles"
                element={
                  <ApproverRoute>
                    <MainLayout>
                      <ApproverDashboard key="old-articles" pathType="old" />
                    </MainLayout>
                  </ApproverRoute>
                }
              />
              <Route
                path="/approver/rejected"
                element={
                  <ApproverRoute>
                    <MainLayout>
                      <ApproverDashboard key="rejected-articles" pathType="rejected" />
                    </MainLayout>
                  </ApproverRoute>
                }
              />
              <Route
                path="/approver/created"
                element={
                  <ApproverRoute>
                    <MainLayout>
                      <ApproverDashboard key="created-articles" pathType="created" />
                    </MainLayout>
                  </ApproverRoute>
                }
              />

              {/* PO Presentation */}
              <Route
                path="/po-presentation"
                element={
                  <ApproverRoute>
                    <MainLayout>
                      <POPresentationPage />
                    </MainLayout>
                  </ApproverRoute>
                }
              />

              {/* Model Generation */}
              <Route
                path="/model-generation"
                element={
                  <CreatorRoute>
                    <MainLayout>
                      <ModelGenerationPage />
                    </MainLayout>
                  </CreatorRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </Router>
      </ErrorBoundary>
    </AppProviders>
  );
};

export default App;