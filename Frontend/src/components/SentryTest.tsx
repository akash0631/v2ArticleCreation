import React from 'react';
import * as Sentry from '@sentry/react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui-tw';

export const SentryTest: React.FC = () => {
  const handleTestMessage = () => {
    Sentry.captureMessage('Test message from UI button!', 'info');
    console.log('Test message sent to Sentry');
  };

  const handleTestError = () => {
    const error = new Error('Test error from UI button!');
    Sentry.captureException(error);
    console.log('Test error sent to Sentry');
  };

  const handleTestThrow = () => {
    throw new Error('Test error - should trigger ErrorBoundary!');
  };

  const handleTestAsync = async () => {
    try {
      await Promise.reject(new Error('Test async error!'));
    } catch (error) {
      Sentry.captureException(error);
      console.log('Async error sent to Sentry');
    }
  };

  const handleCheckSentry = () => {
    const client = Sentry.getClient();
    console.log('Sentry Client:', {
      initialized: !!client,
      lastEventId: Sentry.lastEventId(),
      dsn: client?.getDsn?.(),
    });
  };

  return (
    <Card className="m-5 max-w-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Sentry Testing Panel</CardTitle>
        <span className="text-xs text-muted-foreground">Development Mode Only</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <h5 className="text-sm font-semibold">Test Error Tracking</h5>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleTestMessage}>Send Test Message</Button>
          <Button onClick={handleTestError}>Send Test Error</Button>
          <Button variant="destructive" onClick={handleTestThrow}>
            Throw Error (ErrorBoundary)
          </Button>
          <Button variant="outline" onClick={handleTestAsync}>
            Test Async Error
          </Button>
          <Button variant="outline" onClick={handleCheckSentry}>
            Check Sentry Status
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          After clicking, check your Sentry dashboard in 5-10 seconds
        </p>
      </CardContent>
    </Card>
  );
};

export default SentryTest;
