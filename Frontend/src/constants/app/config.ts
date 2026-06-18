export const APP_CONFIG = {
  name: import.meta.env.VITE_APP_NAME || 'AI Fashion Attribute Extractor',
  version: import.meta.env.VITE_APP_VERSION || '1.0.0',
  
  // Environment
  isDevelopment: import.meta.env.DEV,
  
  // File upload limits
  maxFileSize: parseInt(import.meta.env.VITE_MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  maxConcurrentExtractions: parseInt(import.meta.env.VITE_MAX_CONCURRENT_EXTRACTIONS) || 3,
  
  // Supported file types
  supportedImageTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  
  // Backend API Configuration
  api: {
    baseURL: import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV
      ? (() => {
          const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
          return `http://${hostname}:5001/api`;
        })()
      : '/api'),
  },
  
  // Development settings
  enableLogging: import.meta.env.VITE_ENABLE_LOGGING === 'true' || import.meta.env.DEV,
  
  // Database settings
  indexedDB: {
    name: 'ClothingExtractor',
    version: 1
  }
};

export const validateConfig = (): string[] => {
  const errors: string[] = [];
  
  if (!APP_CONFIG.api.baseURL) {
    errors.push('VITE_API_BASE_URL is required');
  }
  
  if (APP_CONFIG.maxFileSize < 1024 * 1024) {
    errors.push('VITE_MAX_FILE_SIZE should be at least 1MB');
  }
  
  return errors;
};
