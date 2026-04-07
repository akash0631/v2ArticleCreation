import { VLMProvider, FashionExtractionRequest, VLMResult } from '../../../types/vlm';
import { EnhancedExtractionResult, AttributeData } from '../../../types/extraction';
import Anthropic from '@anthropic-ai/sdk';
import { FULL_WEAVE_CLASSIFICATION_GUIDANCE } from '../prompts/fabricWeaveGuidance';

export interface ClaudeVLMConfig {
  model: 'claude-3-5-sonnet-20241022' | 'claude-3-opus-20240229' | 'claude-3-sonnet-20240229' | 'claude-3-haiku-20240307';
  maxTokens: number;
  temperature: number;
  timeout: number;
}

export class ClaudeVLMProvider implements VLMProvider {
  public readonly name = 'Claude 3.5 Sonnet';
  private config: ClaudeVLMConfig;
  private client: Anthropic | null = null;

  constructor(config?: Partial<ClaudeVLMConfig>) {
    this.config = {
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4000,
      temperature: 0.1,
      timeout: 30000,
      ...config
    };
    this.initializeClient();
  }

  private initializeClient(): void {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && apiKey.startsWith('sk-ant-')) {
      this.client = new Anthropic({ apiKey });
      console.log('✅ Claude provider initialized successfully');
    } else {
      console.log('⚠️ Claude provider: API key not configured');
    }
  }

  async extractAttributes(request: FashionExtractionRequest): Promise<EnhancedExtractionResult> {
    const startTime = Date.now();
    console.log(`🤖 [Claude ${this.config.model}] Starting extraction with ${request.schema.length} attributes`);
    
    if (!this.client) {
      throw new Error('Claude API client not initialized. Please set ANTHROPIC_API_KEY');
    }

    try {
      const prompt = this.buildPrompt(request);
      const response = await this.callClaudeVision(request.image, prompt);
      
      const { attributes, extractedMetadata } = await this.parseResponse(response.content, request.schema);
      const confidence = this.calculateConfidence(attributes);

      const processingTime = Date.now() - startTime;
      const extractedCount = Object.values(attributes).filter(attr => attr !== null).length;
      
      console.log(`✅ [Claude] Extraction complete: ${extractedCount}/${Object.keys(attributes).length} attributes, ${processingTime}ms`);
      console.log(`📊 [Claude] Performance: Confidence=${confidence}%, Tokens=${response.tokensUsed}`);

      return {
        attributes,
        confidence,
        tokensUsed: response.tokensUsed,
        modelUsed: this.config.model as any,
        processingTime,
        discoveries: [],
        discoveryStats: {
          totalFound: 0,
          highConfidence: 0,
          schemaPromotable: 0,
          uniqueKeys: 0
        },
        extractedMetadata: extractedMetadata || undefined
      };
    } catch (error) {
      console.error(`❌ [Claude] Extraction failed:`, error instanceof Error ? error.message : 'Unknown error');
      throw new Error(`Claude VLM extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    return this.client !== null && !!process.env.ANTHROPIC_API_KEY;
  }

  async configure(config: Partial<ClaudeVLMConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    this.initializeClient();
  }

  private buildPrompt(request: FashionExtractionRequest): string {
    const { schema, categoryName, department, subDepartment, garmentType } = request;
    
    const categoryContext = categoryName 
      ? `\nCATEGORY: ${categoryName} (${department}/${subDepartment})`
      : '';

    const schemaDefinition = schema.map(item => {
      const allowedValues = item.allowedValues?.length
        ? ` (allowed: ${item.allowedValues.map(av => typeof av === 'string' ? av : av.shortForm).slice(0, 5).join(', ')}${item.allowedValues.length > 5 ? '...' : ''})`
        : '';
      return `- ${item.key}: ${item.label}${allowedValues}`;
    }).join('\n');

    return `You are an expert fashion AI analyst. Analyze this clothing image with precision.${categoryContext}

${FULL_WEAVE_CLASSIFICATION_GUIDANCE}

📋 EXTRACT ALL ${schema.length} ATTRIBUTES:
${schemaDefinition}

EXTRACTION PROCESS:
1. READ TAG/BOARD (if visible): Extract metadata (Vendor Name, Vendor Code, Design Number, Rate, PPT Number, GSM)
   - Vendor Code is typically a numeric ID written on the board/tag, often appearing directly after or below the vendor name (e.g. a 6-digit number like "201394")
2. ANALYZE GARMENT: Extract every attribute listed above
3. HANDLE MISSING VALUES: If truly not visible/determinable, use null
4. PROVIDE CONFIDENCE: Rate each extraction 0-100%

NULL VALUE HANDLING:
• "no_packet", "no_placket", "no plackets" → Use null
• "not visible", "cannot determine" → Use null
• Empty or N/A → Use null
• Only extract what you can actually see or infer confidently

CRITICAL: Return valid JSON only:
{
  "metadata": {
    "vendorName": "from tag" or null,
    "vendorCode": "numeric/alphanumeric code from tag near vendor name" or null,
    "designNumber": "from tag" or null,
    "rate": "from tag" or null,
    "pptNumber": "from tag" or null,
    "gsm": "from tag" or null
  },
  "attributes": {
    "attribute_key": {
      "rawValue": "exact observation" or null,
      "schemaValue": "normalized value" or null,
      "visualConfidence": 85,
      "reasoning": "brief explanation"
    }
  }
}`;
  }

  private async callClaudeVision(imageData: string, prompt: string): Promise<{ content: string; tokensUsed: number }> {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    // Extract base64 data and media type
    const base64Match = imageData.match(/^data:image\/(jpeg|jpg|png|gif|webp);base64,(.+)$/);
    if (!base64Match) {
      throw new Error('Invalid image data format');
    }

    const [, mediaType, base64Data] = base64Match;
    const imageMediaType = `image/${mediaType}` as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    // Add timeout wrapper around Claude API call
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Claude API timeout (${this.config.timeout}ms) - request took too long`)), this.config.timeout);
    });

    const responsePromise = this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageMediaType,
              data: base64Data
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }]
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);

    const textContent = (response as any).content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    return {
      content: textContent.text,
      tokensUsed: (response as any).usage.input_tokens + (response as any).usage.output_tokens
    };
  }

  private async parseResponse(content: string, schema: any[]): Promise<{ attributes: AttributeData; extractedMetadata?: any }> {
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanContent);
      
      const extractedMetadata = parsed.metadata || null;
      const attributeSource = parsed.attributes || parsed;
      
      const attributes: AttributeData = {};
      
      const metadataMapping: Record<string, string> = {
        'vendorName': 'vendor_name',
        'designNumber': 'design_number',
        'pptNumber': 'ppt_number',
        'price': 'rate'
      };
      
      for (const schemaItem of schema) {
        const key = schemaItem.key;
        
        if (attributeSource[key]) {
          const rawValue = this.normalizeNullValue(attributeSource[key].rawValue);
          const schemaValue = this.normalizeNullValue(attributeSource[key].schemaValue);
          
          attributes[key] = {
            rawValue,
            schemaValue,
            visualConfidence: attributeSource[key].visualConfidence || 0,
            isNewDiscovery: false,
            mappingConfidence: attributeSource[key].visualConfidence || 0,
            reasoning: attributeSource[key].reasoning
          };
        } else if (extractedMetadata && Object.values(metadataMapping).includes(key)) {
          const metadataKey = Object.keys(metadataMapping).find(k => metadataMapping[k] === key);
          const value = metadataKey ? extractedMetadata[metadataKey] : null;
          
          if (value) {
            attributes[key] = {
              rawValue: value,
              schemaValue: value,
              visualConfidence: 95,
              isNewDiscovery: false,
              mappingConfidence: 95,
              reasoning: 'Extracted from visible tag/board'
            };
          } else {
            attributes[key] = null;
          }
        } else {
          attributes[key] = null;
        }
      }
      
      return { attributes, extractedMetadata };
    } catch (error) {
      console.error('❌ [Claude] Failed to parse response:', error);
      throw new Error(`Failed to parse Claude response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Normalize null/missing value variations to null
   */
  private normalizeNullValue(value: any): any {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    
    const lowerValue = value.toLowerCase().trim();
    const nullVariants = [
      'no_packet', 'no_placket', 'no plackets', 'no placket',
      'not visible', 'cannot determine', 'n/a', 'na', 
      'not applicable', 'none', 'not found', 'unknown'
    ];
    
    if (nullVariants.includes(lowerValue)) {
      return null;
    }
    
    return value;
  }

  private calculateConfidence(attributes: AttributeData): number {
    const values = Object.values(attributes).filter(attr => attr !== null);
    if (values.length === 0) return 0;
    
    const totalConfidence = values.reduce((sum, attr) => sum + (attr?.visualConfidence || 0), 0);
    return Math.round(totalConfidence / values.length);
  }
}
