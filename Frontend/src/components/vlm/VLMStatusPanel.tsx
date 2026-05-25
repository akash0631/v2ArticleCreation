import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Info } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  Tooltip,
} from '@/shared/components/ui-tw';
import { BackendApiService } from '../../services/api/backendApi';

interface VLMProvider {
  id: string;
  name: string;
  status: boolean;
  description: string;
  type: 'primary' | 'fallback' | 'local' | 'specialized';
}

export const VLMStatusPanel: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<VLMProvider[]>([]);
  const [systemHealth, setSystemHealth] = useState<number>(0);
  const [recommendation, setRecommendation] = useState<string>('');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const backendApi = new BackendApiService();

  const checkVLMHealth = async () => {
    setIsLoading(true);
    try {
      const response = await backendApi.vlmHealthCheck();
      if (response.success && response.data) {
        const providerData = response.data.providers as Record<string, boolean>;
        const health = response.data.systemHealth as number;
        const rec = response.data.recommendation as string;

        const providerList: VLMProvider[] = [
          { id: 'fashion-clip', name: 'Fashion-CLIP', status: providerData['fashion-clip'] || false, description: 'Fashion-specialized vision model (fastest)', type: 'specialized' },
          { id: 'ollama-llava', name: 'Local LLaVA', status: providerData['ollama-llava'] || false, description: 'Local processing (free, private)', type: 'local' },
          { id: 'huggingface-llava', name: 'HuggingFace LLaVA', status: providerData['huggingface-llava'] || false, description: 'Cloud-based open-source model', type: 'primary' },
          { id: 'openai-gpt4v', name: 'OpenAI GPT-4V', status: providerData['openai-gpt4v'] || false, description: 'Reliable fallback (most capable)', type: 'fallback' },
        ];

        setProviders(providerList);
        setSystemHealth(Math.round(health * 100));
        setRecommendation(rec);
        setLastCheck(new Date());
      }
    } catch (error) {
      console.error('VLM health check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkVLMHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typeDotColor = (type: string) => {
    switch (type) {
      case 'specialized': return 'bg-primary';
      case 'local': return 'bg-emerald-500';
      case 'primary': return 'bg-purple-500';
      case 'fallback': return 'bg-amber-500';
      default: return 'bg-muted';
    }
  };

  const healthyProviders = providers.filter((p) => p.status).length;
  const healthBarColor = systemHealth > 75 ? 'bg-emerald-500' : systemHealth > 50 ? 'bg-amber-500' : 'bg-red-500';
  const healthBadgeColor = systemHealth > 75 ? 'success' : systemHealth > 50 ? 'warning' : 'destructive';

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Enhanced VLM System</CardTitle>
          <Badge variant={healthBadgeColor as 'success' | 'warning' | 'destructive'}>
            {healthyProviders}/{providers.length}
          </Badge>
        </div>
        <Button size="sm" variant="outline" onClick={checkVLMHealth} disabled={isLoading}>
          <RefreshCw className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <span className="text-sm font-medium">System Health: </span>
          <Progress value={systemHealth} indicatorClassName={healthBarColor} className="mt-1" />
        </div>

        <div className="flex flex-wrap gap-3">
          {providers.map((provider) => (
            <Tooltip
              key={provider.id}
              title={
                <div>
                  <div className="font-semibold">{provider.name}</div>
                  <div>{provider.description}</div>
                  <div>Status: {provider.status ? 'Online' : 'Offline'}</div>
                </div>
              }
            >
              <div className="inline-flex cursor-help items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1">
                <span className={`h-2 w-2 rounded-full ${typeDotColor(provider.type)}`} />
                {provider.status ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-xs">{provider.name}</span>
              </div>
            </Tooltip>
          ))}
        </div>

        {recommendation && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <Info className="h-4 w-4 text-emerald-600" />
            <span className="text-xs text-emerald-900">{recommendation}</span>
          </div>
        )}

        {lastCheck && (
          <span className="text-[11px] text-muted-foreground">
            Last checked: {lastCheck.toLocaleTimeString()}
          </span>
        )}

        <div className="rounded bg-muted/50 px-2 py-1.5">
          <span className="text-[11px]">
            Enhanced system uses {healthyProviders} AI models for {systemHealth > 50 ? '85-95%' : '70-85%'} accuracy
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default VLMStatusPanel;
