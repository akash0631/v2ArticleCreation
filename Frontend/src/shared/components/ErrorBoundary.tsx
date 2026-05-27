import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCw, Bug } from "lucide-react";
import { Alert, Button, Card, CardContent } from "@/shared/components/ui-tw";
import { logger } from "../../utils/common/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("Error Boundary caught an error:", {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
    });
    this.setState({ error, errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  private handleReload = () => window.location.reload();

  private handleReset = () => this.setState({ hasError: false, error: null, errorInfo: null });

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="flex min-h-[400px] items-center justify-center p-6"
          role="alertdialog"
          aria-live="assertive"
        >
          <Card className="w-full max-w-[500px]">
            <CardContent className="pt-6 text-center">
              <Bug className="mx-auto mb-4 h-12 w-12 text-red-500" aria-label="Error icon" />

              <h3 className="mb-2 text-xl font-semibold">Something went wrong</h3>

              <p className="mb-4 text-sm text-muted-foreground">
                We're sorry! An unexpected error occurred in the application. The error has been logged and our team
                will investigate.
              </p>

              <Alert
                type="error"
                showIcon
                message="Error Details"
                description={
                  <div>
                    <code className="rounded bg-muted px-1 text-xs">{this.state.error?.message}</code>
                    {process.env.NODE_ENV === "development" && this.state.errorInfo && (
                      <details className="mt-2">
                        <summary>Component Stack (Development Only)</summary>
                        <pre className="mt-2 max-h-[200px] overflow-auto rounded bg-muted p-2 text-xs">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </details>
                    )}
                  </div>
                }
                className="mb-4 text-left"
              />

              <div className="flex justify-center gap-2">
                <Button onClick={this.handleReload}>
                  <RotateCw />
                  Reload Page
                </Button>
                <Button variant="outline" onClick={this.handleReset}>
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
