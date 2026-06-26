/**
 * Simple API Cost Calculator
 * Calculates cost based on model and token usage
 */

interface ModelPricing {
    inputCostPer1M: number;  // Cost per 1M input tokens
    outputCostPer1M: number; // Cost per 1M output tokens
}

// Pricing as of May 2026 — verify at https://ai.google.dev/pricing
const MODEL_PRICING: Record<string, ModelPricing> = {
    'gpt-4-vision-preview': {
        inputCostPer1M: 10.00,
        outputCostPer1M: 30.00
    },
    'gpt-4-turbo': {
        inputCostPer1M: 10.00,
        outputCostPer1M: 30.00
    },
    'gpt-4': {
        inputCostPer1M: 30.00,
        outputCostPer1M: 60.00
    },
    'gpt-3.5-turbo': {
        inputCostPer1M: 0.50,
        outputCostPer1M: 1.50
    },
    'claude-3-opus': {
        inputCostPer1M: 15.00,
        outputCostPer1M: 75.00
    },
    'claude-3-sonnet': {
        inputCostPer1M: 3.00,
        outputCostPer1M: 15.00
    },
    'claude-sonnet': {
        inputCostPer1M: 3.00,
        outputCostPer1M: 15.00
    },
    'gemini-pro-vision': {
        inputCostPer1M: 0.00,  // Free tier
        outputCostPer1M: 0.00
    },
    // Gemini 2.5 Pro: $1.25/$2.50 input (≤200K/>200K ctx), $10.00/$15.00 output
    // Using the standard (≤200K) tier — most single-image extractions stay well under 200K
    'gemini-2.5-pro': {
        inputCostPer1M: 1.25,
        outputCostPer1M: 10.00  // was 5.00 — corrected to actual Google pricing
    },
    // Gemini 2.5 Flash: $0.15 input, $3.50 output (non-thinking)
    'gemini-2.5-flash': {
        inputCostPer1M: 0.15,
        outputCostPer1M: 3.50
    },
    // Gemini 2.0 Flash: $0.10 input, $0.40 output
    'gemini-2.0-flash': {
        inputCostPer1M: 0.10,
        outputCostPer1M: 0.40
    },
    // Gemini 1.5 Pro: $1.25 input, $5.00 output (≤128K ctx)
    'gemini-1.5-pro': {
        inputCostPer1M: 1.25,
        outputCostPer1M: 5.00
    },
    // Gemini 1.5 Flash: $0.075 input, $0.30 output (≤128K ctx)
    'gemini-1.5-flash': {
        inputCostPer1M: 0.075,
        outputCostPer1M: 0.30
    },
    'google-gemini': {
        inputCostPer1M: 1.25,  // alias — treated as gemini-2.5-pro
        outputCostPer1M: 10.00
    }
};

/**
 * Calculate API cost based on token usage and model
 */
export function calculateApiCost(
    inputTokens: number,
    outputTokens: number,
    modelName: string
): number {
    const pricing = MODEL_PRICING[modelName] || MODEL_PRICING['gemini-2.5-pro'];

    const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPer1M;

    return inputCost + outputCost;
}

/**
 * Calculate cost from total tokens (when input/output split not available)
 */
export function calculateApiCostFromTotal(
    totalTokens: number,
    modelName: string
): number {
    // Estimate: assume 70% input, 30% output (typical for vision tasks)
    const estimatedInput = Math.floor(totalTokens * 0.7);
    const estimatedOutput = Math.floor(totalTokens * 0.3);

    return calculateApiCost(estimatedInput, estimatedOutput, modelName);
}
