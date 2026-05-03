import React, { useState, useEffect } from 'react';
import { Button, Space, Drawer, Menu } from 'antd';
import {
  MenuOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  TeamOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { colors } from '../../../theme/colors';
import './LandingNavbar.css';

interface LandingNavbarProps {
  transparent?: boolean;
  fixed?: boolean;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({ 
  transparent = false,
  fixed = true 
}) => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAuthenticated = !!localStorage.getItem('authToken');

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 20;
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [scrolled]);

  const navItems = [
    { key: 'features', label: 'Features', icon: <ThunderboltOutlined />, href: '#features' },
    { key: 'how-it-works', label: 'How It Works', icon: <RocketOutlined />, href: '#how-it-works' },
    { key: 'api', label: 'API', icon: <ApiOutlined />, href: '#api' },
    { key: 'testimonials', label: 'Testimonials', icon: <TeamOutlined />, href: '#testimonials' },
    { key: 'docs', label: 'Docs', icon: <FileTextOutlined />, href: '#docs' },
  ];

  const handleNavClick = (href: string) => {
    setMobileMenuOpen(false);
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      navigate('/register');
    }
  };

  const handleSignIn = () => {
    navigate('/login');
  };

  const navbarClass = `landing-navbar ${fixed ? 'landing-navbar-fixed' : ''} ${
    !scrolled && transparent ? 'landing-navbar-transparent' : 'landing-navbar-scrolled'
  }`;

  return (
    <>
      <nav className={navbarClass}>
        <div className="landing-navbar-container">
          {/* Logo */}
          <div className="landing-navbar-logo" onClick={() => navigate('/')}>
            <img src="/V2retail.png" alt="Logo" width={32} height={32} />
            <span className="landing-navbar-logo-text">
              Article Creation
            </span>
          </div>

          {/* Desktop Navigation */}
          <div className="landing-navbar-menu">
            {navItems.map(item => (
              <a
                key={item.key}
                href={item.href}
                className="landing-navbar-link"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick(item.href);
                }}
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* Desktop Actions */}
          <div className="landing-navbar-actions">
            <Space size="middle">
              {!isAuthenticated && (
                <Button
                  type="text"
                  onClick={handleSignIn}
                  className="landing-navbar-signin"
                >
                  Sign In
                </Button>
              )}
              <Button
                type="primary"
                onClick={handleGetStarted}
                className="landing-navbar-cta"
                icon={isAuthenticated ? undefined : <RocketOutlined />}
              >
                {isAuthenticated ? 'Go to Dashboard' : 'Get Started Free'}
              </Button>
            </Space>
          </div>

          {/* Mobile Menu Button */}
          <Button
            className="landing-navbar-mobile-toggle"
            icon={<MenuOutlined />}
            onClick={() => setMobileMenuOpen(true)}
            type="text"
          />
        </div>
      </nav>

      {/* Mobile Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src="/V2retail.png" alt="Logo" width={32} height={32} />
            <span style={{ fontWeight: 600 }}>Menu</span>
          </div>
        }
        placement="right"
        onClose={() => setMobileMenuOpen(false)}
        open={mobileMenuOpen}
        className="landing-navbar-drawer"
      >
        <Menu
          mode="vertical"
          items={navItems.map(item => ({
            key: item.key,
            icon: item.icon,
            label: item.label,
            onClick: () => handleNavClick(item.href)
          }))}
          style={{ border: 'none' }}
        />
        
        <div style={{ 
          padding: '24px 0', 
          borderTop: `1px solid ${colors.border.secondary}`,
          marginTop: '24px'
        }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {!isAuthenticated && (
              <Button
                block
                size="large"
                onClick={handleSignIn}
              >
                Sign In
              </Button>
            )}
            <Button
              type="primary"
              block
              size="large"
              onClick={handleGetStarted}
              icon={<RocketOutlined />}
            >
              {isAuthenticated ? 'Go to Dashboard' : 'Get Started Free'}
            </Button>
          </Space>
        </div>
      </Drawer>
    </>
  );
};

export default LandingNavbar;
