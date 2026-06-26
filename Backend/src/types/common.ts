// Base types used across the application
export type Department = 'KIDS' | 'MENS' | 'LADIES';
export type AttributeType = 'select' | 'text' | 'number' | 'boolean';
export type ExtractionStatus = 'Pending' | 'Queued' | 'Extracting' | 'Processing' | 'Done' | 'Error';
export type ModelType =
  | 'gemini-2.5-pro'         // Latest Gemini with vision (most capable)
  | 'gemini-2.5-flash'       // Gemini 2.5 Flash (fast, cost-effective)
  | 'gemini-2.5-flash-image' // Gemini 2.5 Flash image generation
  | 'gemini-2.0-flash'       // Gemini 2.0 Flash
  | 'gemini-2.0-flash-batch' // Gemini 2.0 Flash batch mode
  | 'gemini-1.5-pro'         // Gemini 1.5 Pro
  | 'gemini-1.5-flash'       // Gemini 1.5 Flash
  | 'google-gemini'          // Generic Gemini alias
  | 'gpt-4o'                 // Latest GPT-4 with vision
  | 'gpt-4-vision-preview'   // Backup vision model
  | 'gpt-4-turbo'            // Fast text-only model for prompts
  | 'gpt-3.5-turbo'          // Legacy text model
  | 'multi-vlm-pipeline'     // Multi-VLM processing pipeline
  | 'fashion-clip+llava'     // Fashion-CLIP + LLaVA combination
  | 'llava-next'             // LLaVA-NeXT model
  | 'moondream'              // Moondream model
  | 'kosmos-2'               // Microsoft Kosmos-2 model
  | 'fashion-clip'           // Fashion-CLIP model
  | 'ollama-llava'           // Local Ollama LLaVA
  | 'huggingface-llava';     // HuggingFace LLaVA

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

// OpenAI API types
export interface OpenAIMessage {
  role: 'user' | 'system' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
      detail?: 'low' | 'high' | 'auto';
    };
  }>;
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens: number;
  temperature: number;
}

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
    index: number;
  }>;
}

export interface APIResponse {
  content: string;
  tokensUsed: number;
  modelUsed: ModelType;
  inputTokens?: number;
  outputTokens?: number;
}