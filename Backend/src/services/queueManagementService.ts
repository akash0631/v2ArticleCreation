// Queue Management Service - Backend handles all job processing logic

import { IExtractionRepository } from '../repositories/interfaces/IExtractionRepository';
import { InMemoryExtractionRepository } from '../repositories/implementations/InMemoryExtractionRepository';
import type { ExtractionJob } from '../repositories/interfaces/IExtractionRepository';

interface QueueConfig {
  maxConcurrentJobs: number;
  tpmLimit: number; // Tokens per minute
  maxRetries: number;
  priorityWeights: {
    high: number;
    normal: number;
    low: number;
  };
}

interface TokenBudget {
  used: number;
  limit: number;
  resetTime: Date;
  remainingQuota: number;
}

export class QueueManagementService {
  private repository: IExtractionRepository;
  private config: QueueConfig;
  private tokenBudget: TokenBudget;
  private activeJobs: Set<string> = new Set();
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(
    repository?: IExtractionRepository,
    config?: Partial<QueueConfig>
  ) {
    this.repository = repository || new InMemoryExtractionRepository();
    
    this.config = {
      maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_EXTRACTIONS || '4'),
      tpmLimit: parseInt(process.env.TPM_LIMIT || '40000'), // 40k tokens per minute
      maxRetries: 3,
      priorityWeights: { high: 10, normal: 5, low: 1 },
      ...config
    };

    this.tokenBudget = this.initializeTokenBudget();
    this.startProcessing();
  }

  // Add job to queue with intelligent priority and token estimation
  async addJob(jobData: {
    imageData: string;
    schema: any[];
    department?: string;
    subDepartment?: string;
    categoryName?: string;
    userId?: string;
    priority?: 'low' | 'normal' | 'high';
  }): Promise<string> {
    
    // Estimate tokens based on schema complexity and category
    const estimatedTokens = this.estimateTokenUsage(
      jobData.schema, 
      jobData.department, 
      jobData.subDepartment, 
      jobData.categoryName
    );

    // Auto-adjust priority based on user type and token usage
    const priority = this.calculateJobPriority(jobData.priority, estimatedTokens, jobData.userId);

    const job = await this.repository.createJob({
      ...jobData,
      status: 'pending',
      priority,
      estimatedTokens
    });

    console.log(`📋 Job queued: ${job.id}, Priority: ${priority}, Est. tokens: ${estimatedTokens}`);
    
    return job.id;
  }

  // Get job status for frontend polling
  async getJobStatus(jobId: string) {
    const job = await this.repository.getJob(jobId);
    if (!job) return null;

    const stats = await this.repository.getQueueStats();
    const position = await this.getJobPositionInQueue(jobId);

    return {
      id: job.id,
      status: job.status,
      result: job.result,
      error: job.error,
      processingTime: job.processingTime,
      estimatedTokens: job.estimatedTokens,
      actualTokens: job.actualTokens,
      queuePosition: position,
      estimatedWaitTime: this.calculateEstimatedWaitTime(position, job.estimatedTokens),
      queueStats: stats
    };
  }

  // Get queue overview for admin/monitoring
  async getQueueOverview() {
    const stats = await this.repository.getQueueStats();
    const tokenUsageToday = await this.repository.getTotalTokensUsedToday();
    
    return {
      queueStats: stats,
      tokenBudget: {
        ...this.tokenBudget,
        usedToday: tokenUsageToday,
        utilizationPercent: (this.tokenBudget.used / this.tokenBudget.limit) * 100
      },
      systemHealth: {
        activeJobs: this.activeJobs.size,
        maxConcurrent: this.config.maxConcurrentJobs,
        canAcceptJobs: this.canAcceptNewJob(),
        averageProcessingTime: stats.averageProcessingTime
      }
    };
  }

  // Process jobs from queue
  private async startProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.processingInterval = setInterval(() => {
      void this.processNextJob().catch((err: any) => console.error('[Queue] processNextJob failed:', err?.message));
    }, 2000); // Check every 2 seconds

    console.log('Queue processing started');
  }

  private async processNextJob() {
    try {
      // Check if we can process more jobs
      if (!this.canAcceptNewJob()) {
        return;
      }

      const job = await this.repository.getNextJob();
      if (!job) {
        return; // No jobs to process
      }

      console.log(`🔄 Processing job: ${job.id}`);
      this.activeJobs.add(job.id);

      // Process job in background
      this.processJob(job).finally(() => {
        this.activeJobs.delete(job.id);
      });

    } catch (error) {
      console.error('❌ Error in queue processing:', error);
    }
  }

  private async processJob(job: ExtractionJob) {
    const startTime = Date.now();
    
    try {
      // Check token budget before processing
      if (!this.hasTokenBudget(job.estimatedTokens)) {
        await this.repository.updateJobStatus(
          job.id, 
          'failed', 
          null, 
          'Token budget exceeded. Please try again later.'
        );
        return;
      }

      // Import extraction service
      const { ExtractionService } = await import('./extractionService');
      const extractionService = new ExtractionService();

      // Process the extraction
      const result = await extractionService.extractWithDiscovery(
        job.imageData,
        job.schema,
        job.categoryName,
        false // Discovery mode handled separately
      );

      // Update token budget
      this.updateTokenBudget(result.tokensUsed);

      // Record token usage
      await this.repository.recordTokenUsage({
        jobId: job.id,
        modelUsed: result.modelUsed,
        tokensUsed: result.tokensUsed,
        cost: this.calculateCost(result.tokensUsed, result.modelUsed)
      });

      // Update job as completed
      await this.repository.updateJobStatus(job.id, 'completed', result);

      const processingTime = Date.now() - startTime;
      console.log(`✅ Job completed: ${job.id} in ${processingTime}ms, tokens: ${result.tokensUsed}`);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Job failed: ${job.id}`, error);
      
      await this.repository.updateJobStatus(
        job.id, 
        'failed', 
        null, 
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  // Token and capacity management
  private canAcceptNewJob(): boolean {
    return (
      this.activeJobs.size < this.config.maxConcurrentJobs &&
      this.tokenBudget.remainingQuota > 1000 // Reserve some tokens
    );
  }

  private hasTokenBudget(estimatedTokens: number): boolean {
    return this.tokenBudget.remainingQuota >= estimatedTokens;
  }

  private updateTokenBudget(tokensUsed: number) {
    this.tokenBudget.used += tokensUsed;
    this.tokenBudget.remainingQuota = Math.max(0, this.tokenBudget.limit - this.tokenBudget.used);

    // Reset budget if time window passed
    if (new Date() > this.tokenBudget.resetTime) {
      this.tokenBudget = this.initializeTokenBudget();
    }
  }

  private initializeTokenBudget(): TokenBudget {
    const resetTime = new Date();
    resetTime.setMinutes(resetTime.getMinutes() + 1); // 1-minute window

    return {
      used: 0,
      limit: this.config.tpmLimit,
      resetTime,
      remainingQuota: this.config.tpmLimit
    };
  }

  // Utility methods
  private estimateTokenUsage(
    schema: any[], 
    department?: string, 
    subDepartment?: string, 
    categoryName?: string
  ): number {
    const baseTokens = 1500; // Base prompt + image processing
    const schemaTokens = schema.length * 100; // ~100 tokens per attribute
    const contextTokens = department && subDepartment && categoryName ? 300 : 150;
    
    return baseTokens + schemaTokens + contextTokens;
  }

  private calculateJobPriority(
    requestedPriority?: 'low' | 'normal' | 'high',
    estimatedTokens?: number,
    userId?: string
  ): 'low' | 'normal' | 'high' {
    // Premium users get higher priority
    if (userId?.includes('premium')) return 'high';
    
    // Large jobs get lower priority to prevent queue blocking
    if (estimatedTokens && estimatedTokens > 5000) return 'low';
    
    return requestedPriority || 'normal';
  }

  private async getJobPositionInQueue(jobId: string): Promise<number> {
    const pendingJobs = await this.repository.getPendingJobsByPriority();
    return pendingJobs.findIndex(job => job.id === jobId) + 1;
  }

  private calculateEstimatedWaitTime(position: number, estimatedTokens: number): number {
    const avgProcessingTime = 20000; // 20 seconds average
    const queueDelayFactor = position * 0.5; // Queue position delay
    
    return Math.round((avgProcessingTime * queueDelayFactor) / 1000); // Return seconds
  }

  private calculateCost(tokens: number, model: string): number {
    const costs: Record<string, number> = {
      'gpt-4o': 0.005 / 1000, // $0.005 per 1k tokens
      'gpt-4o-mini': 0.0015 / 1000, // $0.0015 per 1k tokens
      'claude-3-haiku': 0.00025 / 1000 // $0.00025 per 1k tokens
    };
    
    return tokens * (costs[model] || costs['gpt-4o']);
  }

  // Cleanup and shutdown
  public async shutdown() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    // Wait for active jobs to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.activeJobs.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('🛑 Queue service shutdown completed');
  }
}