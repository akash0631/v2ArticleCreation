/**
 * Category Extraction Service
 * 
 * This service provides access to the new category-based extraction API endpoints.
 * These endpoints were created in Phase 2 for database-driven extraction.
 * 
 * Key Features:
 * - Get category hierarchy for dropdowns
 * - Get category schema (attributes + allowed values)
 * - Search categories
 * - Extract attributes using category code
 */

import axios from 'axios';
import type { SchemaItem } from '../shared/types/extraction/ExtractionTypes';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');

// ===========================
// TYPE DEFINITIONS
// ===========================

export interface CategoryHierarchyResponse {
  departments: DepartmentHierarchy[];
  stats: {
    totalDepartments: number;
    totalSubDepartments: number;
    totalCategories: number;
  };
}

export interface DepartmentHierarchy {
  code: string;
  name: string;
  description: string | null;
  subDepartments: SubDepartmentHierarchy[];
}

export interface SubDepartmentHierarchy {
  code: string;
  name: string;
  description: string | null;
  categories: CategoryHierarchyItem[];
}

export interface CategoryHierarchyItem {
  code: string;
  name: string;
  fullForm: string | null;
  fabricDivision: string | null;
}

export interface CategorySchemaResponse {
  category: {
    id: number;
    code: string;
    name: string;
    fullForm: string | null;
    merchandiseCode: string | null;
    merchandiseDesc: string | null;
    fabricDivision: string | null;
    department: {
      code: string;
      name: string;
    };
    subDepartment: {
      code: string;
      name: string;
    };
  };
  schema: SchemaItemWithMetadata[];
  stats: {
    totalAttributes: number;
    aiExtractableCount: number;
    requiredCount: number;
  };
}

export interface SchemaItemWithMetadata extends SchemaItem {
  _metadata: {
    attributeId: number;
    aiExtractable: boolean;
    visibleFromDistance: boolean;
    extractionPriority: number;
    confidenceThreshold: string;
    category: string | null;
    isRequired: boolean;
    defaultValue: string | null;
    allowedValuesDetail: {
      id: number;
      shortForm: string;
      fullForm: string | null;
      aliases: string[];
    }[];
  };
}

export interface CategorySearchResult {
  code: string;
  name: string;
  fullForm: string | null;
  department: string;
  subDepartment: string;
  fabricDivision: string | null;
}

export interface CategoryExtractionRequest {
  image: string; // base64 encoded
  categoryCode: string;
  vendorName?: string;
  designNumber?: string;
  costPrice?: number;
  sellingPrice?: number;
  notes?: string;
  discoveryMode?: boolean;
  customPrompt?: string;
}

export interface CategoryExtractionResponse {
  attributes: Record<string, any>;
  confidence: number;
  processingTime: number;
  modelUsed: string;
  tokensUsed?: number;
  discoveries?: any[];
  category: {
    code: string;
    name: string;
    fullForm: string | null;
    department: string;
    subDepartment: string;
    fabricDivision: string | null;
  };
  metadata: {
    vendorName?: string;
    designNumber?: string;
    costPrice?: number | null;
    sellingPrice?: number | null;
    notes?: string;
  };
  schemaStats: {
    totalAttributes: number;
    aiExtractableCount: number;
    requiredCount: number;
  };
}

// ===========================
// API METHODS
// ===========================

/**
 * Get auth headers for API requests
 */
const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Get the complete category hierarchy for dropdowns
 * This loads all departments, sub-departments, and categories in one call
 * Updated: /api/user/categories/hierarchy
 */
export const getCategoryHierarchy = async (): Promise<CategoryHierarchyResponse> => {
  const response = await axios.get<{ success: boolean; data: CategoryHierarchyResponse }>(
    `${API_BASE_URL}/user/categories/hierarchy`,
    { headers: getAuthHeaders() }
  );
  return response.data.data;
};

/**
 * Get category schema with attributes and allowed values
 * This is what you need before extraction
 * Updated: /api/user/categories/:code/schema
 */
export const getCategorySchema = async (categoryCode: string): Promise<CategorySchemaResponse> => {
  const response = await axios.get<{ success: boolean; data: CategorySchemaResponse }>(
    `${API_BASE_URL}/user/categories/${categoryCode}/schema`,
    { headers: getAuthHeaders() }
  );
  return response.data.data;
};

/**
 * Search categories by query string
 * Updated: /api/user/categories/search
 */
export const searchCategories = async (query: string, limit = 20): Promise<CategorySearchResult[]> => {
  const response = await axios.get<{ success: boolean; data: CategorySearchResult[]; count: number }>(
    `${API_BASE_URL}/user/categories/search`,
    { 
      params: { q: query, limit },
      headers: getAuthHeaders()
    }
  );
  return response.data.data;
};

/**
 * Extract attributes using category code
 * This is the new extraction endpoint that uses database schema
 * Updated: /api/user/extract/category
 */
export const extractWithCategory = async (
  request: CategoryExtractionRequest
): Promise<CategoryExtractionResponse> => {
  const response = await axios.post<{ success: boolean; data: CategoryExtractionResponse }>(
    `${API_BASE_URL}/user/extract/category`,
    request,
    { headers: getAuthHeaders() }
  );
  return response.data.data;
};

// ===========================
// QUERY KEYS (for React Query)
// ===========================

export const categoryExtractionQueryKeys = {
  all: ['categoryExtraction'] as const,
  hierarchy: () => [...categoryExtractionQueryKeys.all, 'hierarchy'] as const,
  schema: (categoryCode: string) => [...categoryExtractionQueryKeys.all, 'schema', categoryCode] as const,
  search: (query: string) => [...categoryExtractionQueryKeys.all, 'search', query] as const,
};
