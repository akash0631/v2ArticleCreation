import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Rocket, Zap, Plug, Users, FileText } from 'lucide-react';
import { Button, Drawer, DrawerContent, Separator } from '@/shared/components/ui-tw';
import './LandingNavbar.css';

interface LandingNavbarProps {
  transparent?: boolean;
  fixed?: boolean;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({ transparent = false, fixed = true }) => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAuthenticated = !!localStorage.getItem('authToken');

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 20;
      if (isScrolled !== scrolled) setScrolled(isScrolled);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [scrolled]);

  const navItems = [
    { key: 'features', label: 'Features', Icon: Zap, href: '#features' },
    { key: 'how-it-works', label: 'How It Works', Icon: Rocket, href: '#how-it-works' },
    { key: 'api', label: 'API', Icon: Plug, href: '#api' },
    { key: 'testimonials', label: 'Testimonials', Icon: Users, href: '#testimonials' },
    { key: 'docs', label: 'Docs', Icon: FileText, href: '#docs' },
  ];

  const handleNavClick = (href: string) => {
    setMobileMenuOpen(false);
    const element = document.querySelector(href);
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  const handleGetStarted = () => navigate(isAuthenticated ? '/dashboard' : '/register');
  const handleSignIn = () => navigate('/login');

  const navbarClass = `landing-navbar ${fixed ? 'landing-navbar-fixed' : ''} ${
    !scrolled && transparent ? 'landing-navbar-transparent' : 'landing-navbar-scrolled'
  }`;

  return (
    <>
      <nav className={navbarClass}>
        <div className="landing-navbar-container">
          <div className="landing-navbar-logo" onClick={() => navigate('/')}>
            <img src="/V2retail.png" alt="Logo" width={32} height={32} />
            <span className="landing-navbar-logo-text">Article Creation</span>
          </div>

          <div className="landing-navbar-menu">
            {navItems.map((item) => (
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

          <div className="landing-navbar-actions flex items-center gap-3">
            {!isAuthenticated && (
              <Button variant="ghost" onClick={handleSignIn} className="landing-navbar-signin">
                Sign In
              </Button>
            )}
            <Button onClick={handleGetStarted} className="landing-navbar-cta">
              {!isAuthenticated && <Rocket />}
              {isAuthenticated ? 'Go to Dashboard' : 'Get Started Free'}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="landing-navbar-mobile-toggle"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu />
          </Button>
        </div>
      </nav>

      <Drawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DrawerContent
          side="right"
          title={
            <div className="flex items-center gap-3">
              <img src="/V2retail.png" alt="Logo" width={32} height={32} />
              <span className="font-semibold">Menu</span>
            </div>
          }
        >
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => handleNavClick(item.href)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <item.Icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>

          <Separator className="my-6" />

          <div className="flex flex-col gap-3">
            {!isAuthenticated && (
              <Button variant="outline" className="w-full" onClick={handleSignIn}>
                Sign In
              </Button>
            )}
            <Button className="w-full" onClick={handleGetStarted}>
              <Rocket />
              {isAuthenticated ? 'Go to Dashboard' : 'Get Started Free'}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default LandingNavbar;
