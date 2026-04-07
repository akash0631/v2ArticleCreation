import type { SchemaItem, AllowedValue } from '../types/extraction';

export class PromptService {
  // NEW: Token-optimized schema-driven prompt generation
  generateOptimizedPrompt(
    schema: SchemaItem[], 
    categoryName?: string, 
    department?: string, 
    subDepartment?: string
  ): string {
    const tokenBudget = this.calculateTokenBudget(schema.length);
    const categoryContext = this.getCategorySpecificContext(department, subDepartment, categoryName);
    
    // Compress schema based on token budget
    const optimizedSchema = this.compressSchemaForTokens(schema, tokenBudget);
    
    return this.buildOptimizedPrompt(optimizedSchema, categoryContext, tokenBudget);
  }

  // ✅ Original method for v1.0, enhanced for allowedValues objects and fullForm
  generateGenericPrompt(schema: SchemaItem[]): string {
    const attributeDescriptions = schema
      .map((item) => {
        const allowedValues =
          item.allowedValues?.length
            ? ` (allowed values: ${item.allowedValues
                .map((av) => {
                  if (typeof av === 'string') {
                    return av;
                  }
                  return av.fullForm ?? av.shortForm;
                })
                .join(', ')})`
            : '';
        return `- ${item.key}: ${item.label}${allowedValues}`;
      })
      .join('\n');

    return `
You are an AI fashion attribute extraction specialist. Analyze this clothing image and extract the following attributes with high accuracy.

FABRIC CLASSIFICATION GUIDANCE:
For fabric_main_mvgr attribute, use these detailed definitions to classify the fabric type:

BASIC FABRIC TYPES:
- SOLID: Single uniform color with no patterns or designs
- YARN-DYED CHECKS: Checks created by weaving pre-dyed yarns (pattern is part of fabric, not printed)
- ENGINEERING STRIPE: Stripes placed in a planned/structured way (not evenly repeated)
- HORIZONTAL STRIPE: Stripes running left to right across the fabric
- VERTICAL STRIPE: Stripes running top to bottom along the fabric
- CHECK PRINT: Printed check pattern (not woven like yarn-dyed checks)

PRINT CATEGORIES:
- ANIMAL PRINT: Patterns inspired by animal skins (leopard, zebra, etc.)
- ALL OVER PRINT - ABSTRACT: Non-realistic, artistic shapes and forms
- ALL OVER PRINT - BOOTY (BUTI): Small traditional Indian motifs repeated evenly
- ALL OVER PRINT - CLOUD: Soft, cloud-like shapes or sky-inspired patterns
- ALL OVER PRINT - FLORAL: Repeating flower-based designs
- ALL OVER PRINT - GEOMETRIC: Shapes like squares, triangles, circles in repetition
- ALL OVER PRINT - TROPICAL: Palm leaves, exotic plants, beach-inspired prints
- ALL OVER PRINT - ANIMAL: Repeating animal or animal-skin patterns
- ALL OVER PRINT - CARTOON: Animated or character-based prints
- ALL OVER PRINT - CAMOUFLAGE: Military-style irregular patch patterns
- ALL OVER PRINT - NUMERIC: Repeating numbers or digits
- ALL OVER PRINT - ALPHABETICAL: Letters or text-based repeating patterns
- ALL OVER PRINT - SCARF: Designs inspired by scarf layouts (often bordered + ornate)
- ALL OVER PRINT - PAISLEY: Curved teardrop-shaped traditional motif
- ALL OVER PRINT - BANDHANI: Tie-dye style dotted patterns (traditional Indian)
- ALL OVER PRINT AHMEDABAD: Regional print style from Ahmedabad (often block print-inspired)
- ALL OVER PRINT JAIPURI: Traditional Jaipur-style prints (floral, block prints, ethnic motifs)

REQUIRED ATTRIBUTES:
${attributeDescriptions}

INSTRUCTIONS:
1. Examine the image carefully for each attribute
2. For select attributes, ONLY use values from the allowed list
3. For text/number attributes, provide precise descriptive values
4. If an attribute is not visible/applicable, use null
5. Provide confidence scores (0-100) for visual attributes

⚠️ CRITICAL - DO NOT USE ATTRIBUTE NAMES AS VALUES:
- Extract actual observed values from the image
- WRONG: "neck": "Neck", "button": "Button", "wash": "Wash" ❌
- CORRECT: "neck": "round neck", "button": "yes", "wash": "acid wash" ✅

CRITICAL: Return ONLY valid JSON without markdown formatting or code blocks.

OUTPUT FORMAT (JSON ONLY):
{
  "attribute_key": {
    "rawValue": "extracted_value",
    "schemaValue": "normalized_value",
    "visualConfidence": 85,
    "reasoning": "brief_explanation"
  }
}

Return pure JSON only. No markdown, no explanations, no code blocks.`.trim();
  }

  // ✅ Original category method, enhanced for allowedValues objects
  generateCategorySpecificPrompt(schema: SchemaItem[], categoryName: string): string {
    const basePrompt = this.generateGenericPrompt(schema);
    const categoryContext = this.getCategoryContext(categoryName);

    return `${basePrompt}

CATEGORY CONTEXT:
You are analyzing a ${categoryName}. ${categoryContext}
Pay special attention to attributes most relevant to this category type.

CRITICAL: Return pure JSON only, no markdown code blocks.`.trim();
  }

  // 🆕 Discovery method for v1.1 R&D, enhanced for allowedValues objects
  generateDiscoveryPrompt(schema: SchemaItem[], categoryName?: string): string {
    const schemaAttributes = schema
      .map(
        (item) =>
          `- ${item.key}: ${item.label}${
            item.allowedValues?.length
              ? ` (allowed: ${item.allowedValues
                  .map((av) => {
                    if (typeof av === 'string') {
                      return av;
                    }
                    return av.fullForm ?? av.shortForm;
                  })
                  .join(', ')})`
              : ''
          }`
      )
      .join('\n');

    const categoryContext = categoryName ? this.getCategoryContext(categoryName) : '';

    return `
You are an advanced AI fashion attribute extraction specialist. Analyze this clothing image comprehensively.

FABRIC CLASSIFICATION GUIDANCE:
For fabric_main_mvgr attribute, use these detailed definitions to classify the fabric type:

BASIC FABRIC TYPES:
- SOLID: Single uniform color with no patterns or designs
- YARN-DYED CHECKS: Checks created by weaving pre-dyed yarns (pattern is part of fabric, not printed)
- ENGINEERING STRIPE: Stripes placed in a planned/structured way (not evenly repeated)
- HORIZONTAL STRIPE: Stripes running left to right across the fabric
- VERTICAL STRIPE: Stripes running top to bottom along the fabric
- CHECK PRINT: Printed check pattern (not woven like yarn-dyed checks)

PRINT CATEGORIES:
- ANIMAL PRINT: Patterns inspired by animal skins (leopard, zebra, etc.)
- ALL OVER PRINT - ABSTRACT: Non-realistic, artistic shapes and forms
- ALL OVER PRINT - BOOTY (BUTI): Small traditional Indian motifs repeated evenly
- ALL OVER PRINT - CLOUD: Soft, cloud-like shapes or sky-inspired patterns
- ALL OVER PRINT - FLORAL: Repeating flower-based designs
- ALL OVER PRINT - GEOMETRIC: Shapes like squares, triangles, circles in repetition
- ALL OVER PRINT - TROPICAL: Palm leaves, exotic plants, beach-inspired prints
- ALL OVER PRINT - ANIMAL: Repeating animal or animal-skin patterns
- ALL OVER PRINT - CARTOON: Animated or character-based prints
- ALL OVER PRINT - CAMOUFLAGE: Military-style irregular patch patterns
- ALL OVER PRINT - NUMERIC: Repeating numbers or digits
- ALL OVER PRINT - ALPHABETICAL: Letters or text-based repeating patterns
- ALL OVER PRINT - SCARF: Designs inspired by scarf layouts (often bordered + ornate)
- ALL OVER PRINT - PAISLEY: Curved teardrop-shaped traditional motif
- ALL OVER PRINT - BANDHANI: Tie-dye style dotted patterns (traditional Indian)
- ALL OVER PRINT AHMEDABAD: Regional print style from Ahmedabad (often block print-inspired)
- ALL OVER PRINT JAIPURI: Traditional Jaipur-style prints (floral, block prints, ethnic motifs)

REQUIRED SCHEMA ATTRIBUTES (extract these first):
${schemaAttributes}

${categoryName ? `CATEGORY CONTEXT: You are analyzing a ${categoryName}. ${categoryContext}` : ''}

DISCOVERY MODE - ALSO EXTRACT ADDITIONAL VISIBLE ATTRIBUTES:

BRAND & LABELS:
- Brand logos, designer labels, manufacturer tags
- Care instruction labels, size tags, country of origin
- Model numbers, style codes, fabric content labels

CONSTRUCTION & HARDWARE:
- Button details: material (plastic/metal/wood), style, count
- Zipper details: brand (YKK/other), material, color, style
- Hardware: buckles, grommets, rivets, snaps, hooks
- Stitching: color, style (flat-fell, overlock, topstitch)
- Seam details: French seams, bound seams, raw edges

FABRIC & TEXTURE:
- Fabric weave: twill, plain, herringbone, jacquard
- Texture: smooth, textured, ribbed, waffle, cable knit
- Surface treatments: stonewashed, distressed, coated
- Fabric weight: lightweight, medium, heavy, structured

DESIGN DETAILS:
- Embellishments: embroidery, appliqué, beading, sequins
- Prints: floral, geometric, abstract, text, brand logos
- Functional details: pockets (patch/welt/slash), belts, ties
- Decorative elements: piping, contrast trim, color blocking

OUTPUT FORMAT - RETURN VALID JSON:
{
  "schemaAttributes": {
    "schema_key": {
      "rawValue": "exactly what you observe",
      "schemaValue": "normalized to fit schema",
      "visualConfidence": 85,
      "reasoning": "clear explanation"
    }
  },
  "discoveries": {
    "descriptive_key": {
      "rawValue": "detailed observation",
      "normalizedValue": "clean, structured value",
      "confidence": 82,
      "reasoning": "what you saw and why it's significant",
      "suggestedType": "text|select|number",
      "possibleValues": ["value1", "value2"]
    }
  }
}

CRITICAL RULES:
1. Only extract what you can clearly and confidently see
2. Use descriptive keys: "button_material" not "btn_mat"
3. Provide detailed reasoning for discoveries
4. Suggest data types: "select" for categories, "text" for descriptions
5. Include possible values for select types
6. Return pure JSON only - no markdown

Focus on commercially valuable attributes that fashion professionals would find useful.`.trim();
  }

  getDiscoveryHints(categoryName: string): string[] {
    const hints: Record<string, string[]> = {
      'Kids Bermuda': [
        'waistband_type',
        'closure_type',
        'pocket_count',
        'leg_opening_style',
        'belt_loops',
        'fabric_stretch',
        'safety_features',
        'size_adjustability',
      ],
      'Ladies Cig Pant': [
        'waist_height',
        'leg_cut',
        'pleat_style',
        'hem_style',
        'fabric_drape',
        'closure_quality',
        'trouser_style',
        'professional_features',
      ],
      'Mens T Shirt': [
        'collar_style',
        'sleeve_hem',
        'side_seams',
        'shoulder_construction',
        'neckline_binding',
        'fabric_weight',
        'print_technique',
        'tag_style',
      ],
    };

    return hints[categoryName] || [
      'fabric_texture',
      'construction_quality',
      'design_elements',
      'functional_features',
    ];
  }

  private getCategoryContext(categoryName: string): string {
    const contexts: Record<string, string> = {
      'Kids Bermuda':
        "Focus on casual wear attributes like fit, length, fabric type, and comfort features typical for children's shorts.",
      'Ladies Cig Pant':
        'Emphasize formal wear characteristics, fit type, fabric composition, and professional styling details.',
      'Mens T Shirt':
        'Prioritize casual wear elements like neck type, sleeve style, fabric composition, and print details.',
    };

    return contexts[categoryName] || 'Analyze all visible fashion attributes systematically.';
  }

  // TOKEN OPTIMIZATION METHODS

  private calculateTokenBudget(schemaLength: number): 'minimal' | 'standard' | 'extended' {
    if (schemaLength <= 5) return 'minimal';    // ~1500 tokens
    if (schemaLength <= 12) return 'standard';  // ~2500 tokens  
    return 'extended';                          // ~3500 tokens
  }

  private getCategorySpecificContext(
    department?: string, 
    subDepartment?: string, 
    categoryName?: string
  ): string {
    const contextKey = `${department}_${subDepartment}_${categoryName}`.toLowerCase();
    
    const contexts: Record<string, string> = {
      // Kids department contexts
      'kids_bottoms_bermuda': 'Focus: comfort, safety features, adjustable waistbands, durable materials',
      'kids_tops_tshirt': 'Focus: soft fabrics, easy care, fun prints, comfortable fit',
      
      // Ladies department contexts  
      'ladies_bottoms_cigarette_pant': 'Focus: professional fit, fabric drape, tailored construction',
      'ladies_tops_blouse': 'Focus: elegant details, fabric quality, professional styling',
      
      // Mens department contexts
      'mens_tops_tshirt': 'Focus: fit type, fabric weight, construction quality, style details',
      'mens_bottoms_jeans': 'Focus: wash treatment, fit type, construction, hardware quality'
    };

    return contexts[contextKey] || this.getCategoryContext(categoryName || '');
  }

  private compressSchemaForTokens(schema: SchemaItem[], budget: 'minimal' | 'standard' | 'extended'): SchemaItem[] {
    if (budget === 'minimal') {
      // Keep only essential attributes, compress descriptions
      return schema.slice(0, 5).map(item => ({
        ...item,
        label: item.label.length > 20 ? item.label.substring(0, 20) + '...' : item.label,
        allowedValues: item.allowedValues?.slice(0, 3) // Limit allowed values
      }));
    }
    
    if (budget === 'standard') {
      // Moderate compression
      return schema.slice(0, 12).map(item => ({
        ...item,
        allowedValues: item.allowedValues?.slice(0, 5)
      }));
    }
    
    // Extended budget - minimal compression
    return schema.map(item => ({
      ...item,
      allowedValues: item.allowedValues?.slice(0, 8)
    }));
  }

  private buildOptimizedPrompt(
    schema: SchemaItem[], 
    categoryContext: string, 
    budget: 'minimal' | 'standard' | 'extended'
  ): string {
    const attributeDescriptions = schema
      .map((item) => {
        const allowedValues = item.allowedValues?.length
          ? ` (values: ${item.allowedValues
              .map((av) => typeof av === 'string' ? av : av.shortForm)
              .join(', ')})`
          : '';
        return `${item.key}: ${item.label}${allowedValues}`;
      })
      .join('\n');

    const baseInstructions = budget === 'minimal' 
      ? 'Extract attributes quickly and accurately.'
      : 'Examine the image carefully for each attribute with high precision.';

    return `
You are a fashion AI specialist. ${categoryContext}

EXTRACT THESE ATTRIBUTES:
${attributeDescriptions}

RULES:
1. ${baseInstructions}
2. Use ONLY provided allowed values
3. Return null if not visible
4. Provide confidence (0-100)

OUTPUT JSON:
{
  "attribute_key": {
    "rawValue": "observed_value",
    "schemaValue": "normalized_value", 
    "visualConfidence": 85,
    "reasoning": "brief_explanation"
  }
}

Return pure JSON only.`.trim();
  }
}