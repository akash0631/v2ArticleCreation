/**
 * Simplified Prompt Service
 * 
 * Generates VLM prompts for the simplified extraction list
 * Enforces strict confidence threshold (65-75%)
 */

import { SIMPLIFIED_ATTRIBUTES } from '../config/simplifiedAttributes';

export class SimplifiedPromptService {
  /**
   * Generate prompt for simplified extraction
  * Only extracts the fixed attributes with strict confidence rules
   */
  generateSimplifiedPrompt(department?: string, majorCategory?: string): string {
    const attributeList = SIMPLIFIED_ATTRIBUTES
      .map(attr => `- ${attr.label} (${attr.key})`)
      .join('\n');

    const categoryContext = department && majorCategory 
      ? `\n\nCATEGORY CONTEXT:\nYou are analyzing a ${department} garment from the ${majorCategory} category.\nFocus on attributes most relevant to this type of clothing.`
      : '';

    return `
You are an AI fashion attribute extraction specialist. Analyze this clothing image and extract ONLY the following attributes.

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

CRITICAL RULES:
1. Extract ONLY these specific attributes - do not hallucinate or make up attributes
2. Only provide a value if you are AT LEAST 65% confident
3. If confidence is below 65%, leave the attribute as null
4. For each attribute, provide your confidence score (0-100)
5. Be honest about uncertainty - it's better to leave blank than guess

REQUIRED ATTRIBUTES:
${attributeList}
${categoryContext}

EXTRACTION GUIDELINES:
- Examine the image carefully for each attribute
- Base your extraction on VISIBLE features only
- Use simple, descriptive values (e.g., "round neck", "long sleeve", "regular fit")
- Provide confidence scores honestly based on visibility
- If an attribute is not visible or you're uncertain (< 65% confidence), set rawValue to null

⚠️ CRITICAL - DO NOT REPEAT ATTRIBUTE NAMES AS VALUES:
- WRONG: "neck": { "rawValue": "Neck" } ❌
- CORRECT: "neck": { "rawValue": "round neck" } ✅
- WRONG: "button": { "rawValue": "Button" } ❌
- CORRECT: "button": { "rawValue": "yes" } or { "rawValue": "metal buttons" } ✅
- WRONG: "wash": { "rawValue": "Wash" } ❌
- CORRECT: "wash": { "rawValue": "acid wash" } or { "rawValue": "stone wash" } ✅

OUTPUT FORMAT (JSON ONLY):
{
  "neck": {
    "rawValue": "round neck" or null,
    "schemaValue": "round neck" or null,
    "visualConfidence": 85,
    "reasoning": "clearly visible round neckline"
  },
  "collar": {
    "rawValue": "spread collar" or null,
    "schemaValue": "spread collar" or null,
    "visualConfidence": 90,
    "reasoning": "clear spread collar visible"
  },
  "sleeve": {
    "rawValue": "long sleeve" or null,
    "schemaValue": "long sleeve" or null,
    "visualConfidence": 95,
    "reasoning": "full length sleeves visible"
  },
  "button": {
    "rawValue": "yes" or null,
    "schemaValue": "yes" or null,
    "visualConfidence": 88,
    "reasoning": "front button closure visible"
  },
  ... (repeat for all attributes)
}

CRITICAL: Return ONLY valid JSON. No markdown formatting, no code blocks, no explanations outside the JSON.
Only include attributes where visualConfidence >= 65%. For others, set rawValue and schemaValue to null.
`.trim();
  }

  /**
   * Get human-readable description of the simplified workflow
   */
  getWorkflowDescription(): string {
    return `
Simplified Fashion Extraction Workflow:
1. Select Department (Kids, Ladies, Mens)
2. Select Major Category (e.g., Tops, Bottoms, Dresses)
3. Upload image(s)
4. AI extracts 27 fixed attributes
5. Only attributes with ≥65% confidence are shown
6. Proceed to batch processing
    `.trim();
  }
}
