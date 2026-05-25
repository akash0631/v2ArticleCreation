import React from 'react';
import * as Sentry from '@sentry/react';
import { RotateCw, Home, Bug } from 'lucide-react';
import { Button, Result } from '@/shared/components/ui-tw';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showDialog?: boolean;
  onReset?: () => void;
}

interface ErrorFallbackProps {
  error: Error;
  componentStack: string | null;
  resetError: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, componentStack, resetError }) => {
  const isDevelopment = import.meta.env.MODE === 'development';

  const handleReportIssue = () => {
    Sentry.showReportDialog({
      eventId: Sentry.lastEventId(),
      title: "It looks like we're having issues.",
      subtitle: 'Our team has been notified.',
      subtitle2: "If you'd like to help, tell us what happened below.",
    });
  };

  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <Result
        status="500"
        title="Something went wrong"
        subTitle="We're sorry for the inconvenience. The error has been reported to our team."
        extra={
          <>
            <Button onClick={resetError}>
              <RotateCw />
              Try Again
            </Button>
            <Button variant="outline" onClick={handleGoHome}>
              <Home />
              Go Home
            </Button>
            <Button variant="outline" onClick={handleReportIssue}>
              <Bug />
              Report Issue
            </Button>
          </>
        }
      >
        {isDevelopment && (
          <div className="mt-6 text-left">
            <details className="whitespace-pre-wrap rounded-md bg-muted p-4 text-xs">
              <summary className="mb-2 cursor-pointer font-bold">Error Details (Development Only)</summary>
              <div>
                <strong>Error:</strong> {error.message}
              </div>
              {componentStack && (
                <div className="mt-2">
                  <strong>Component Stack:</strong>
                  <pre>{componentStack}</pre>
                </div>
              )}
              {error.stack && (
                <div className="mt-2">
                  <strong>Stack Trace:</strong>
                  <pre>{error.stack}</pre>
                </div>
              )}
            </details>
          </div>
        )}
      </Result>
    </div>
  );
};

export const ErrorBoundary: React.FC<ErrorBoundaryProps> = ({
  children,
  fallback,
  showDialog = true,
  onReset,
}) => {
  return (
    <Sentry.ErrorBoundary
      fallback={
        (fallback as any) ||
        ((props: any) => (
          <ErrorFallback
            error={props.error as Error}
            componentStack={props.componentStack}
            resetError={props.resetError}
          />
        ))
      }
      showDialog={showDialog}
      onReset={onReset}
      beforeCapture={(scope) => {
        scope.setTag('error-boundary', 'react');
        scope.setLevel('error');
      }}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
};

export default ErrorBoundary;
