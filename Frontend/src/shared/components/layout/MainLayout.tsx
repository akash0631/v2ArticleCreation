import React from 'react';
import { useLocation } from 'react-router-dom';
import { PageTransition } from '../motion/PageTransition';
import { AppSidebar, useSidebarCollapsed } from './AppSidebar';
import './MainLayout.css';

interface MainLayoutProps {
  children: React.ReactNode;
}

const AUTH_PATHS = new Set(['/login', '/register']);

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useSidebarCollapsed();

  const isAuthenticated = !!localStorage.getItem('authToken');
  const isAuthPage = AUTH_PATHS.has(location.pathname);
  const isLandingPage = location.pathname === '/';

  if (isAuthPage) {
    return <div className="auth-layout">{children}</div>;
  }

  // Landing page has its own LandingNavbar — no sidebar chrome.
  if (isLandingPage) {
    return (
      <div className="main-layout flex h-screen flex-col overflow-hidden">
        <main className="content-landing flex-1 overflow-auto">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    );
  }

  // Authenticated app shell — left sidebar + content.
  return (
    <div className="main-layout flex h-screen overflow-hidden">
      {isAuthenticated && <AppSidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />}
      <main className="content-shell flex-1 overflow-auto">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
};

export default MainLayout;
