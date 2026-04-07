import { VLMProvider, FashionExtractionRequest, OpenAIVLMConfig, VLMResult } from '../../../types/vlm';
import { EnhancedExtractionResult, AttributeData } from '../../../types/extraction';
import { BaseApiService } from '../../baseApi';
import { promptBuilder } from '../prompts';
import { FULL_WEAVE_CLASSIFICATION_GUIDANCE } from '../prompts/fabricWeaveGuidance';

export class OpenAIVLMProvider extends BaseApiService implements VLMProvider {
  public readonly name = 'OpenAI GPT-4 Vision';
  private config: OpenAIVLMConfig;

  constructor(config?: Partial<OpenAIVLMConfig>) {
    super();
    this.config = {
      model: 'gpt-4o',
      detail: 'high',
      maxTokens: 3000,
      temperature: 0.1,
      timeout: 120000,
      ...config
    };
  }

  async extractAttributes(request: FashionExtractionRequest): Promise<EnhancedExtractionResult> {
    const startTime = Date.now();
    console.log(` [OpenAI GPT-4V] Starting extraction with ${request.schema.length} attributes`);
    console.log(`🔧 OpenAI Config: Model=${this.config.model}, MaxTokens=${this.config.maxTokens}, Detail=${this.config.detail}`);
    
    try {
      const prompt = this.buildPrompt(request);
      const response = await this.callVisionAPI(request.image, prompt);
      
      const { attributes, extractedMetadata } = await this.parseResponse(response.content, request.schema);
      const confidence = this.calculateConfidence(attributes);

      const processingTime = Date.now() - startTime;
      
      // Count non-null attributes
      const extractedCount = Object.values(attributes).filter(attr => attr !== null).length;
      console.log(`✅ [OpenAI GPT-4V] Extraction complete: ${extractedCount}/${Object.keys(attributes).length} attributes extracted, ${processingTime}ms`);
      
      // Log extracted metadata if found
      if (extractedMetadata) {
        console.log(`🏷️ [OpenAI GPT-4V] Extracted metadata from tag:`, extractedMetadata);
      }
      
      // Debug: Log sample of extracted attributes
      const sampleAttrs = Object.entries(attributes)
        .filter(([_, v]) => v !== null)
        .slice(0, 5)
        .map(([k, v]) => `${k}=${v?.rawValue}`)
        .join(', ');
      if (sampleAttrs) {
        console.log(`📝 [OpenAI GPT-4V] Sample attributes: ${sampleAttrs}`);
      }
      
      console.log(`📊 [OpenAI GPT-4V] Performance: Confidence=${confidence}%, Tokens=${response.tokensUsed || 0}`);

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
      console.error(`❌ [OpenAI GPT-4V] Extraction failed:`, error instanceof Error ? error.message : 'Unknown error');
      throw new Error(`OpenAI VLM extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      return this.isConfigured();
    } catch {
      return false;
    }
  }

  async configure(config: OpenAIVLMConfig): Promise<void> {
    this.config = { ...this.config, ...config };
  }

  private buildPrompt(request: FashionExtractionRequest): string {
    const { schema, categoryName, mode, department, subDepartment, garmentType } = request;
    
    // Use specialized prompts if department + garmentType available
    if (department && garmentType) {
      return this.buildSpecializedPrompt(request);
    }
    
    // Fallback to generic prompt
    const basePrompt = `You are an expert fashion AI analyst. Analyze this clothing image and extract attributes with precision.`;
    
    const categoryContext = categoryName 
      ? `\nCATEGORY: ${categoryName} (${department}/${subDepartment})`
      : '';

    const schemaDefinition = schema.map(item => {
      const allowedValues = item.allowedValues?.length
        ? ` (allowed: ${item.allowedValues.map(av => typeof av === 'string' ? av : av.shortForm).join(', ')})`
        : '';
      return `- ${item.key}: ${item.label}${allowedValues}`;
    }).join('\n');

    const modeInstructions = this.getModeSpecificInstructions(mode || 'fashion-focused');

    return `${basePrompt}${categoryContext}

📋 YOU MUST EXTRACT ALL ${schema.length} ATTRIBUTES - BE THOROUGH!

STEP 1: READ TAG/BOARD (if visible)
Extract EXACTLY as written:
- Vendor Name, Design Number, Rate/Price, PPT Number, GSM

STEP 2: ANALYZE GARMENT - EXTRACT EVERY ATTRIBUTE BELOW:
${schemaDefinition}

${modeInstructions}

${FULL_WEAVE_CLASSIFICATION_GUIDANCE}

MANDATORY EXTRACTION GUIDELINES:

FOR EVERY ATTRIBUTE:
• COLOR: Describe exact shade visible (White, Grey, Blue, Black, etc.)
• FABRIC/MATERIAL: Infer from texture/sheen (Cotton, Polyester, Blend, Knit)
• FIT: Observe garment cut (Regular, Slim, Relaxed, Oversized)
• SLEEVE: Clearly visible (Half Sleeve, Full Sleeve, Sleeveless, 3/4)
• NECKLINE: Check collar type (Round, V-Neck, Crew, Polo, Henley)
• PATTERN: Look for prints/designs (Solid, Striped, Printed, Graphic)
• STYLE: Overall design (Casual, Formal, Sports, Basic)
• LENGTH: Garment length (Regular, Long, Short, Cropped)
• CONSTRUCTION: Quality indicators (Single Jersey, Double Jersey, Rib)
• YARN/THREAD: If visible on tag or from texture
• WASH/FINISH: Surface treatment (Enzyme Wash, Stone Wash, Plain)
• BRAND/LOGO: Check for visible branding
• SIZE: From tag if visible (S, M, L, XL, XXL)

CONFIDENCE LEVELS:
• 90-100%: Clearly visible or on tag
• 75-89%: Strong visual inference
• 60-74%: Educated guess from context
• Below 60%: Only if truly uncertain

CRITICAL RULES:
1. EXTRACT ALL ${schema.length} ATTRIBUTES - don't skip any!
2. If you can see the garment, you MUST provide values
3. Use allowed values list EXACTLY (no variations)
4. Better to guess with 60% confidence than leave null
5. Only null if attribute doesn't apply to this garment type

FABRIC_MAIN_MVGR EXTRACTION (REQUIRED):
• You have detailed fabric classification guidance above
• Examine the garment's VISIBLE fabric characteristics:
  - Print patterns (solid, striped, patterned, printed, checks, etc.)
  - Weave type (tight, loose, textured, smooth)
  - Design elements (geometric, floral, abstract, etc.)
• Match what you observe to the classification options provided
• Provide 65-90% confidence for your fabric classification
• Do NOT leave this null if the fabric is visible - make your best classification

JSON RESPONSE FORMAT:
{
  "metadata": {
    "vendorName": "from tag" or null,
    "designNumber": "from tag" or null,
    "price": "from tag" or null,
    "pptNumber": "from tag" or null
  },
  "attributes": {
    "color": {"rawValue": "White", "schemaValue": "White", "visualConfidence": 95, "reasoning": "clearly visible"},
    "fabric": {"rawValue": "Cotton", "schemaValue": "Cotton", "visualConfidence": 80, "reasoning": "soft texture visible"},
    ... (CONTINUE FOR ALL ${schema.length} ATTRIBUTES)
  }
}

⚠️ IMPORTANT: Extract ALL attributes. If garment is visible, analyze it completely!
- Make educated guesses for non-visible attributes with lower confidence`;
  }

  /**
   * Build specialized prompt using promptBuilder
   */
  private buildSpecializedPrompt(request: FashionExtractionRequest): string {
    const { department, garmentType, schema, categoryName, mode } = request;
    
    if (!department || !garmentType) {
      throw new Error('Department and garmentType required for specialized prompt');
    }
    
    // Get specialized prompt context
    const promptContext = promptBuilder.buildSpecializedPrompt({
      department: department.toUpperCase() as 'MENS' | 'LADIES' | 'KIDS',
      garmentType,
      schema,
      categoryName: categoryName || '',
      mode
    });
    
    // Filter and prioritize schema based on garment type
    const relevantSchema = promptBuilder.filterSchemaByRelevance(schema, promptContext.skipAttributes);
    const prioritizedSchema = promptBuilder.prioritizeSchema(relevantSchema, promptContext.focusAreas);
    
    // Build optimized schema definition
    const schemaDefinition = prioritizedSchema.map(item => {
      const allowedValues = item.allowedValues?.length
        ? ` (allowed: ${item.allowedValues.map(av => typeof av === 'string' ? av : av.shortForm).slice(0, 5).join(', ')}${item.allowedValues.length > 5 ? '...' : ''})`
        : '';
      return `- ${item.key}: ${item.label}${allowedValues}`;
    }).join('\n');
    
    // Combine into specialized prompt
    return `${promptContext.systemPrompt}

${FULL_WEAVE_CLASSIFICATION_GUIDANCE}

CATEGORY: ${categoryName} (${department}/${garmentType})

${promptContext.attributeInstructions}

📋 EXTRACT THESE ${prioritizedSchema.length} ATTRIBUTES:
${schemaDefinition}

STEP 1: READ TAG/BOARD (if visible)
Extract metadata: Vendor Name, Design Number, Rate/Price, PPT Number, GSM

STEP 2: ANALYZE GARMENT
Focus areas: ${promptContext.focusAreas.join(', ')}

CONFIDENCE GUIDELINES:
• 90-100%: Clearly visible or on tag
• 75-89%: Strong visual inference  
• 60-74%: Educated guess from context
• Below 60%: Only if truly uncertain

CRITICAL: Return valid JSON only:
{
  "metadata": {
    "vendorName": "from tag" or null,
    "designNumber": "from tag" or null,
    "rate": "from tag" or null,
    "pptNumber": "from tag" or null,
    "gsm": "from tag" or null
  },
  "attributes": {
    "attribute_key": {
      "rawValue": "exact observation",
      "schemaValue": "normalized value",
      "visualConfidence": 85,
      "reasoning": "brief explanation"
    }
  }
}`;
  }

  private getModeSpecificInstructions(mode: string): string {
    switch (mode) {
      case 'fashion-focused':
        return `FOCUS: Core fashion attributes (color, fabric, style, fit). Fast and accurate extraction.`;
      
      case 'detailed-analysis':
        return `FOCUS: Detailed analysis of construction, materials, and fine details. High precision required.`;
      
      case 'discovery-mode':
        return `FOCUS: Discover additional attributes not in schema. Look for brands, care labels, unique features.`;
      
      default:
        return `FOCUS: Standard comprehensive analysis.`;
    }
  }

  private async callVisionAPI(base64Image: string, prompt: string) {
    const formattedImage = base64Image.startsWith('data:') 
      ? base64Image 
      : `data:image/jpeg;base64,${base64Image}`;

    const requestPayload = {
      model: this.config.model,
      messages: [{
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: prompt },
          {
            type: 'image_url' as const,
            image_url: {
              url: formattedImage,
              detail: this.config.detail
            }
          }
        ]
      }],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature
    };

    const response = await this.makeRequest('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(requestPayload)
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'API call failed');
    }

    const apiData = response.data as any;
    const choice = apiData.choices[0];

    return {
      content: choice.message.content,
      tokensUsed: apiData.usage.total_tokens,
      modelUsed: this.config.model
    };
  }

  private async parseResponse(content: string, schema: any[]): Promise<{ attributes: AttributeData; extractedMetadata?: any }> {
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanContent);
      
      // Extract metadata if present in new format
      const extractedMetadata = parsed.metadata || null;
      
      // Handle both old format (flat) and new format (nested in attributes)
      const attributeSource = parsed.attributes || parsed;
      
      // Validate and structure the response
      const attributes: AttributeData = {};
      
      // Map metadata fields to attributes if they exist in schema
      const metadataMapping: Record<string, string> = {
        'vendorName': 'vendor_name',
        'designNumber': 'design_number',
        'pptNumber': 'ppt_number',
        'price': 'rate'
      };
      
      for (const schemaItem of schema) {
        const key = schemaItem.key;
        
        // First check if attribute exists in normal response
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
        }
        // If not found but it's a metadata attribute, map from extractedMetadata
        else if (extractedMetadata && Object.values(metadataMapping).includes(key)) {
          const metadataKey = Object.keys(metadataMapping).find(k => metadataMapping[k] === key);
          const value = metadataKey ? extractedMetadata[metadataKey] : null;
          
          if (value) {
            attributes[key] = {
              rawValue: value,
              schemaValue: value,
              visualConfidence: 90, // High confidence for tag reading
              isNewDiscovery: false,
              mappingConfidence: 90,
              reasoning: 'Extracted from product tag/board'
            };
          } else {
            attributes[key] = null;
          }
        }
        else {
          attributes[key] = null;
        }
      }
      
      return { attributes, extractedMetadata };
    } catch (error) {
      throw new Error(`Failed to parse OpenAI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private calculateConfidence(attributes: AttributeData): number {
    const confidenceValues = Object.values(attributes)
      .filter(attr => attr !== null)
      .map(attr => attr!.visualConfidence)
      .filter(conf => conf > 0);

    if (confidenceValues.length === 0) return 0;
    return Math.round(confidenceValues.reduce((sum, conf) => sum + conf, 0) / confidenceValues.length);
  }

  /**
   * Normalize null/missing value variations to null
   * Handles: "no_packet", "no_placket", "not visible", "N/A", etc.
   */
  private normalizeNullValue(value: any): any {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    
    const lowerValue = value.toLowerCase().trim();
    const nullVariants = [
      'no_packet', 'no_placket', 'no plackets', 'no placket',
      'not visible', 'cannot determine', 'n/a', 'na',
      'not applicable', 'none', 'not found', 'unknown',
      'no pocket', 'no pockets'
    ];
    
    if (nullVariants.includes(lowerValue)) {
      return null;
    }
    
    return value;
  }
}