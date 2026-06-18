/**
 * User Feedback Service
 * 
 * This service handles user corrections to AI predictions.
 * Corrections are logged for analysis but DO NOT update the AI model.
 * The AI learns by storing feedback data, not by retraining.
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');

// ===========================
// TYPE DEFINITIONS
// ===========================

export interface CorrectionFeedback {
  imageId?: string;
  categoryCode?: string;
  attributeKey: string;
  aiPredicted: string;
  userCorrected: string;
  timestamp: string;
}

export interface FeedbackStats {
  totalCorrections: number;
  correctionsPerAttribute: Record<string, number>;
  mostCorrectedAttributes: Array<{
    attributeKey: string;
    count: number;
  }>;
  recentCorrections: CorrectionFeedback[];
}

// ===========================
// API CLIENT SETUP
// ===========================

const feedbackApi = axios.create({
  baseURL: `${API_BASE_URL}/user/feedback`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth interceptor
feedbackApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ===========================
// SERVICE METHODS
// ===========================

/**
 * Submit a user correction for an attribute
 * This logs the correction for analysis but does NOT update the AI model
 */
export const submitCorrection = async (feedback: CorrectionFeedback): Promise<void> => {
  try {
    await feedbackApi.post('/correction', feedback);
  } catch (error) {
    console.error('Failed to submit correction:', error);
    // Don't throw - feedback is non-critical, don't block user flow
  }
};

/**
 * Get feedback statistics (for admin dashboard)
 */
export const getFeedbackStats = async (): Promise<FeedbackStats | null> => {
  try {
    const response = await feedbackApi.get<{ success: boolean; data: FeedbackStats }>('/stats');
    return response.data.data;
  } catch (error) {
    console.error('Failed to get feedback stats:', error);
    return null;
  }
};

export const feedbackService = {
  submitCorrection,
  getFeedbackStats,
};
