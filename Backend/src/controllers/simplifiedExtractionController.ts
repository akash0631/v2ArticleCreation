/**
 * Simplified Extraction Controller
 * 
 * This controller handles the simplified extraction workflow:
 * - Department → Major Category only (no sub-department)
 * - Fixed schema of 27 attributes
 * - No metadata input required
 * - Confidence threshold: 65-75% minimum
 * 
 * To preserve rollback capability, this runs alongside the existing
 * enhancedExtractionController without modifying it.
 */

import { Request, Response, NextFunction } from 'express';
import { VLMService } from '../services/vlm/vlmService';
import { ImageProcessor } from '../utils/imageProcessor';
import { SIMPLIFIED_ATTRIBUTES, getSimplifiedSchema, filterByConfidence, applyGarmentTypeRules } from '../config/simplifiedAttributes';
import { SimplifiedPromptService } from '../services/simplifiedPromptService';
import { getMcCodeByMajorCategory } from '../utils/mcCodeMapper';
import { hierarchyService } from '../services/hierarchyService';
import type { FashionExtractionRequest } from '../types/vlm';

export class SimplifiedExtractionController {
  private vlmService = new VLMService();
  private promptService = new SimplifiedPromptService();

  /**
   * Simplified extraction from uploaded image
   * Uses fixed 27-attribute schema, no metadata required
   */
  extractSimplified = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No image file provided',
          timestamp: Date.now()
        });
        return;
      }

      // Validate the image file
      ImageProcessor.validateImageFile(req.file);

      // Parse request - only need department and majorCategory
      const { 
        department,
        majorCategory,
        categoryName
      } = req.body;

      const normalizedMajorCategory = String(majorCategory || '').trim();

      // Load category from DB (falls back to hardcoded if DB is empty)
      const dbCategory = await hierarchyService.getCategoryForExtraction(normalizedMajorCategory);
      if (!dbCategory && !getMcCodeByMajorCategory(normalizedMajorCategory)) {
        res.status(400).json({
          success: false,
          error: 'Invalid majorCategory. Category not found.',
          timestamp: Date.now()
        });
        return;
      }

      // Convert image to base64
      const base64Image = await ImageProcessor.processImageToBase64(req.file);

      const attrCount = dbCategory ? dbCategory.attributes.length : SIMPLIFIED_ATTRIBUTES.length;
      console.log(`🚀 Simplified Extraction Started`);
      console.log(`   Department: ${department}`);
      console.log(`   Major Category: ${majorCategory}`);
      console.log(`   Attributes: ${attrCount} (${dbCategory ? 'DB-driven' : 'hardcoded fallback'})`);

      // Use DB attributes if available, else fall back to hardcoded
      const schema = dbCategory
        ? dbCategory.attributes.map(a => ({ key: a.key, label: a.label, type: a.type as any, required: false, confidenceThreshold: a.confidenceThreshold }))
        : getSimplifiedSchema();

      // Generate simplified prompt
      const customPrompt = this.promptService.generateSimplifiedPrompt(department, majorCategory);

      // Create VLM request with simplified prompt
      const vlmRequest: FashionExtractionRequest = {
        image: base64Image,
        schema,
        categoryName: categoryName || majorCategory,
        department,
        customPrompt, // Use our simplified prompt
        discoveryMode: false // No discovery in simplified mode
      };

      // Extract using VLM service
      const result = await this.vlmService.extractFashionAttributes(vlmRequest);

      const filteredAttributes = filterByConfidence(result.attributes);
      const garmentSafeAttributes = dbCategory
        ? applyGarmentTypeRules(filteredAttributes, undefined, dbCategory.garmentType as any)
        : applyGarmentTypeRules(filteredAttributes, majorCategory);

      console.log(`✅ Simplified Extraction Complete`);
      console.log(`   Confidence: ${result.confidence}%`);
      console.log(`   Time: ${result.processingTime}ms`);
      console.log(`   High-confidence attributes: ${Object.keys(garmentSafeAttributes).filter(k => garmentSafeAttributes[k] !== null).length}/${attrCount}`);

      res.json({
        success: true,
        data: {
          ...result,
          attributes: garmentSafeAttributes
        },
        metadata: {
          simplifiedMode: true,
          dbDriven: !!dbCategory,
          totalAttributes: attrCount,
          highConfidenceCount: Object.keys(garmentSafeAttributes).filter(k => garmentSafeAttributes[k] !== null).length,
          confidenceThreshold: 65
        },
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('❌ Simplified extraction failed:', error);
      next(error);
    }
  };

  extractSimplifiedBase64 = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { image, department, majorCategory, categoryName } = req.body;

      if (!image) {
        res.status(400).json({ success: false, error: 'Base64 image is required', timestamp: Date.now() });
        return;
      }

      const normalizedMajorCategory = String(majorCategory || '').trim();
      const dbCategory = await hierarchyService.getCategoryForExtraction(normalizedMajorCategory);
      if (!dbCategory && !getMcCodeByMajorCategory(normalizedMajorCategory)) {
        res.status(400).json({ success: false, error: 'Invalid majorCategory. Category not found.', timestamp: Date.now() });
        return;
      }

      const attrCount = dbCategory ? dbCategory.attributes.length : SIMPLIFIED_ATTRIBUTES.length;
      console.log(`🚀 Simplified Base64 Extraction Started — ${department} / ${majorCategory} (${attrCount} attrs)`);

      const schema = dbCategory
        ? dbCategory.attributes.map(a => ({ key: a.key, label: a.label, type: a.type as any, required: false, confidenceThreshold: a.confidenceThreshold }))
        : getSimplifiedSchema();

      // Generate simplified prompt
      const customPrompt = this.promptService.generateSimplifiedPrompt(department, majorCategory);

      // Create VLM request
      const vlmRequest: FashionExtractionRequest = {
        image,
        schema,
        categoryName: categoryName || majorCategory,
        department,
        customPrompt, // Use our simplified prompt
        discoveryMode: false
      };

      // Extract
      const result = await this.vlmService.extractFashionAttributes(vlmRequest);

      const filteredAttributes = filterByConfidence(result.attributes);
      const garmentSafeAttributes = dbCategory
        ? applyGarmentTypeRules(filteredAttributes, undefined, dbCategory.garmentType as any)
        : applyGarmentTypeRules(filteredAttributes, majorCategory);

      const highConf = Object.keys(garmentSafeAttributes).filter(k => garmentSafeAttributes[k] !== null).length;
      console.log(`✅ Simplified Base64 Extraction Complete - ${highConf}/${attrCount} high-confidence`);

      res.json({
        success: true,
        data: { ...result, attributes: garmentSafeAttributes },
        metadata: {
          simplifiedMode: true,
          dbDriven: !!dbCategory,
          totalAttributes: attrCount,
          highConfidenceCount: highConf,
          confidenceThreshold: 65
        },
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('❌ Simplified base64 extraction failed:', error);
      next(error);
    }
  };
}
