/**
 * Vision UI Types
 */

export interface VisionAnalysisResult {
  ok: true;
  analysis: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  processingTimeMs?: number;
}

export interface VisionAnalysisError {
  ok: false;
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

export type VisionResult = VisionAnalysisResult | VisionAnalysisError;

export interface VisionStatus {
  ok: true;
  enabled: boolean;
  ready: boolean;
  adapter: string | null;
  models: string[];
  features: {
    clientCompression: boolean;
    maxConcurrentRequests: number;
  };
}

export interface VisionImage {
  id: string;
  dataUrl: string;
  file: File;
  compressed?: boolean;
}

export type VisionAnalysisState = 
  | { status: "idle" }
  | { status: "compressing" }
  | { status: "uploading"; progress: number }
  | { status: "analyzing" }
  | { status: "complete"; result: VisionAnalysisResult }
  | { status: "error"; error: string };

/** Client-side image compression options */
export interface CompressionOptions {
  /** Maximum width/height in pixels (default: 1920) */
  maxDimension?: number;
  /** JPEG quality 0-1 (default: 0.85) */
  quality?: number;
  /** Target format (default: jpeg) */
  format?: "jpeg" | "png" | "webp";
}

export const DEFAULT_COMPRESSION_OPTIONS: CompressionOptions = {
  maxDimension: 1920,
  quality: 0.85,
  format: "jpeg",
};
