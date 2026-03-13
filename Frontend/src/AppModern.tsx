// Modern App Root with Clean Architecture
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { antdTheme } from './theme';

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
import ApproverDashboard from './features/approver/pages/ApproverDashboard'; // Approver Dashboard

// Shared Components
import { ErrorBoundary } from './shared/components/ErrorBoundary';
import { SentryTest } from './components/SentryTest';

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
    // Allow ADMIN, APPROVER or CATEGORY_HEAD
    if (userData.role !== 'APPROVER' && userData.role !== 'CATEGORY_HEAD' && userData.role !== 'ADMIN') {
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
    // Approver-side roles should not access creator pages
    if (userData.role === 'APPROVER' || userData.role === 'CATEGORY_HEAD') {
      return <Navigate to="/approver" replace />;
    }
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ConfigProvider theme={antdTheme}>
      <AppProviders>
        <ErrorBoundary>
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

              {/* Approver Routes - With MainLayout */}
              <Route
                path="/approver"
                element={
                  <ApproverRoute>
                    <MainLayout>
                      <ApproverDashboard />
                    </MainLayout>
                  </ApproverRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Router>
        </ErrorBoundary>
      </AppProviders>
    </ConfigProvider>
  );
};

export default App;