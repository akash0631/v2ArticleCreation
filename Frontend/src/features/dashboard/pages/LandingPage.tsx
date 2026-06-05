import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  FastForward,
  ShieldCheck,
  Cloud,
  ArrowRight,
  CheckCircle2,
  Zap,
  ShieldAlert,
  Globe,
  Plug,
  Mail,
  Phone,
  MapPin,
  Github,
  Twitter,
  Linkedin,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Separator,
} from '@/shared/components/ui-tw';
import { Stagger } from '../../../shared/components/motion';
import { colors } from '../../../theme/colors';
import { LandingNavbar } from '../../../shared/components/layout/LandingNavbar';
import './LandingPage.css';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const isAuthenticated = !!localStorage.getItem('authToken');

  const features = [
    { Icon: Bot, color: colors.primary[500], title: 'AI-Powered Extraction', description: 'Vision models analyse each garment image and propose attribute values in seconds — no manual data entry.' },
    { Icon: FastForward, color: colors.warning[500], title: 'Bulk Pipeline', description: 'Submit hundreds of images at once via the background job pipeline and download a clean Excel when it finishes.' },
    { Icon: ShieldCheck, color: colors.success[500], title: 'Per-Field Confidence', description: 'Every extracted value carries a confidence score. Approvers see what to trust and what to double-check at a glance.' },
    { Icon: Cloud, color: colors.primary[600], title: 'Catalogue-Aware', description: '283+ major categories, complete with allowed values per category and SAP-aligned naming for downstream systems.' },
    { Icon: Zap, color: colors.warning[600], title: 'Single-Article Review', description: 'Approvers move Prev / Next through the queue with inline edits — no full-page reloads, no list scrolling.' },
    { Icon: ShieldAlert, color: colors.error[500], title: 'Role-Aware Access', description: 'Creator, Sub-Division Head, Category Head, Approver, PO Committee and Admin — each sees only what they need.' },
    { Icon: Globe, color: colors.success[600], title: 'Excel-Native Export', description: 'Validated rows export to Excel with per-category dropdowns intact, ready for SAP / SRM upload.' },
    { Icon: Plug, color: colors.primary[500], title: 'Direct SAP Integration', description: 'Approved articles flow straight through to SAP and SRM via the bundled sync pipeline, with status visible in Admin.' },
  ];

  const stats = [
    { title: '283+', description: 'Major categories' },
    { title: '50+', description: 'Attributes per article' },
    { title: '6', description: 'Roles, one workflow' },
    { title: 'SAP', description: 'End-to-end integration' },
  ];

  const handleGetStarted = () => navigate(isAuthenticated ? '/dashboard' : '/register');

  return (
    <div className="min-h-screen">
      <LandingNavbar transparent={true} fixed={true} />

      <div style={{ background: 'linear-gradient(135deg, #FF6F61 0%, #FFA62B 100%)' }}>
        {/* Hero */}
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center text-white">
          <h1 className="font-display mb-6 text-5xl font-semibold tracking-tight drop-shadow-lg md:text-7xl">Article Creation</h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-white/90">
            V2Retail's in-house workflow for extracting, reviewing, and approving fashion article attributes — from a single
            garment photo to a SAP-ready article number.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={handleGetStarted}
              className="h-12 border-white/30 bg-white/20 px-8 text-base backdrop-blur hover:bg-white/30"
            >
              <ArrowRight />
              {isAuthenticated ? 'Go to Dashboard' : 'Get Started Free'}
            </Button>

            {!isAuthenticated && (
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/login')}
                className="h-12 border-white/50 bg-transparent px-8 text-base text-white hover:bg-white/10 hover:text-white"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="border-y border-white/10 bg-white/10 px-6 py-16 backdrop-blur-md">
          <div className="mx-auto max-w-6xl">
            <Stagger className="grid grid-cols-2 gap-8 sm:grid-cols-4" stagger={0.07} whenInView amount={0.4}>
              {stats.map((stat, i) => (
                <div key={i} className="text-center text-white">
                  <div className="font-display mb-2 text-5xl font-semibold tracking-tight drop-shadow-lg">{stat.title}</div>
                  <div className="text-sm text-white/80">{stat.description}</div>
                </div>
              ))}
            </Stagger>
          </div>
        </div>

        {/* Features */}
        <div id="features" className="bg-white px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mb-20 text-center">
              <h2 className="font-display mb-4 text-3xl font-semibold tracking-tight md:text-5xl">Built around how the team actually works</h2>
              <p className="mx-auto max-w-xl text-lg text-muted-foreground">
                Eight pieces that turn a garment photo into a SAP article number — without the spreadsheet relay race.
              </p>
            </div>

            <Stagger
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
              stagger={0.06}
              whenInView
              amount={0.2}
            >
              {features.map((feature, i) => (
                <Card
                  key={i}
                  className="h-full rounded-2xl text-center card-3d glass"
                >
                  <CardContent className="px-5 py-8">
                    <div className="mb-5 flex justify-center">
                      <feature.Icon className="h-12 w-12 transition-transform duration-300 hover:scale-110" style={{ color: feature.color }} />
                    </div>
                    <h3 className="font-display mb-3 text-lg font-semibold tracking-tight">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </Stagger>
          </div>
        </div>

        {/* How it works */}
        <div id="how-it-works" className="bg-[#f8f9fa] px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mb-20 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl">How It Works</h2>
              <p className="text-lg text-muted-foreground">Simple 3-step process to extract fashion data</p>
            </div>

            <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
              {[
                { n: 1, title: 'Upload Images', text: 'Upload your fashion product images in bulk or individually' },
                { n: 2, title: 'AI Analysis', text: 'Our AI analyzes images and extracts detailed product attributes' },
                { n: 3, title: 'Export Data', text: 'Download structured data in Excel, CSV, or JSON format' },
              ].map((step) => (
                <div key={step.n} className="text-center">
                  <div
                    className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-white"
                    style={{ background: 'linear-gradient(45deg, #FF6F61, #FFA62B)' }}
                  >
                    {step.n}
                  </div>
                  <h3 className="mb-3 text-xl font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div
          className="px-6 py-20 text-center text-white"
          style={{ background: `linear-gradient(135deg, ${colors.primary[500]} 0%, ${colors.warning[500]} 100%)` }}
        >
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display mb-6 text-3xl font-semibold tracking-tight md:text-5xl">Ready to extract your next batch?</h2>
            <p className="mb-10 text-lg text-white/90">
              Upload images, review proposed values, push approved articles to SAP. All in one place.
            </p>

            <div className="flex flex-col items-center gap-4">
              <Button
                size="lg"
                onClick={handleGetStarted}
                className="h-12 bg-white px-10 text-base text-primary hover:bg-white/90"
              >
                <CheckCircle2 />
                {isAuthenticated ? 'Open dashboard' : 'Sign in'}
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-neutral-900 px-6 pb-6 pt-16 text-neutral-200">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <h3 className="mb-5 text-lg font-semibold text-white">AI Fashion Extractor</h3>
                <p className="leading-relaxed text-neutral-400">
                  Transform your fashion catalog with intelligent AI-powered image analysis and attribute extraction.
                </p>
                <div className="mt-5 flex gap-5">
                  <Github className="h-6 w-6 cursor-pointer text-neutral-400 hover:text-white" />
                  <Twitter className="h-6 w-6 cursor-pointer text-neutral-400 hover:text-white" />
                  <Linkedin className="h-6 w-6 cursor-pointer text-neutral-400 hover:text-white" />
                </div>
              </div>

              <div>
                <h4 className="mb-5 font-semibold text-white">Product</h4>
                <div className="flex flex-col gap-3">
                  {['Features', 'Pricing', 'API Docs', 'Integrations'].map((label) => (
                    <a key={label} href={`#${label.toLowerCase().replace(' ', '-')}`} className="text-neutral-400 hover:text-white">
                      {label}
                    </a>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="mb-5 font-semibold text-white">Company</h4>
                <div className="flex flex-col gap-3">
                  {['About Us', 'Careers', 'Blog', 'Press Kit'].map((label) => (
                    <a key={label} href={`#${label.toLowerCase().replace(' ', '-')}`} className="text-neutral-400 hover:text-white">
                      {label}
                    </a>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="mb-5 font-semibold text-white">Contact</h4>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-primary" />
                    <span className="text-neutral-400">support@aifashion.ai</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-primary" />
                    <span className="text-neutral-400">+1 (555) 123-4567</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="text-neutral-400">San Francisco, CA</span>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-10 bg-neutral-700" />

            <div className="flex flex-col items-center justify-between gap-4 text-sm md:flex-row">
              <span className="text-neutral-500">© 2025 AI Fashion Extractor. All rights reserved.</span>
              <div className="flex items-center gap-4">
                <a href="#privacy" className="text-neutral-500 hover:text-white">Privacy Policy</a>
                <span className="text-neutral-600">|</span>
                <a href="#terms" className="text-neutral-500 hover:text-white">Terms of Service</a>
                <span className="text-neutral-600">|</span>
                <a href="#cookies" className="text-neutral-500 hover:text-white">Cookie Policy</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
