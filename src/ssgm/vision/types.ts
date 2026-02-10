/**
 * SSGM Vision Types
 * 
 * Type definitions for image analysis and vision capabilities.
 */

export interface VisionAnalyzeRequest {
  /** Base64-encoded image data or data URL */
  image: string;
  /** Optional prompt/guide for the analysis */
  prompt?: string;
  /** Maximum tokens for the response */
  maxTokens?: number;
  /** Model identifier (adapter-specific) */
  model?: string;
}

export interface VisionAnalyzeResponse {
  ok: true;
  /** Analysis result text */
  analysis: string;
  /** Model used for analysis */
  model: string;
  /** Token usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Processing time in milliseconds */
  processingTimeMs?: number;
}

export interface VisionErrorResponse {
  ok: false;
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

export type VisionAnalyzeResult = VisionAnalyzeResponse | VisionErrorResponse;

/** Supported image MIME types */
export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/** Maximum image size in bytes (10MB) */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Image compression options for client-side preprocessing */
export interface ImageCompressionOptions {
  /** Maximum width/height in pixels */
  maxDimension?: number;
  /** JPEG quality (0-1) */
  quality?: number;
  /** Target format */
  format?: "jpeg" | "png" | "webp";
}

export interface VisionAdapterConfig {
  /** Adapter type identifier */
  type: string;
  /** API key or credentials */
  apiKey?: string;
  /** Base URL for API (if different from default) */
  baseUrl?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/** Feature flag configuration */
export interface VisionFeatureFlags {
  /** Enable camera/vision functionality */
  CAMERA_ENABLED: boolean;
  /** Enable client-side image compression */
  CLIENT_COMPRESSION_ENABLED: boolean;
  /** Maximum number of concurrent analysis requests */
  MAX_CONCURRENT_REQUESTS: number;
}

export const DEFAULT_VISION_FEATURE_FLAGS: VisionFeatureFlags = {
  CAMERA_ENABLED: false,
  CLIENT_COMPRESSION_ENABLED: true,
  MAX_CONCURRENT_REQUESTS: 3,
};
