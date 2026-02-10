/**
 * SSGM Vision Adapter Interface
 * 
 * Pluggable adapter system for vision model providers.
 * No vendor lock-in - implement this interface for any provider.
 */

import type {
  VisionAnalyzeRequest,
  VisionAnalyzeResponse,
  VisionAdapterConfig,
} from "./types.js";

/** Vision adapter interface - implement for any vision provider */
export interface VisionAdapter {
  /** Adapter identifier */
  readonly name: string;
  
  /** Check if adapter is properly configured and ready */
  isReady(): boolean;
  
  /** Analyze an image and return text description/analysis */
  analyze(request: VisionAnalyzeRequest): Promise<VisionAnalyzeResponse>;
  
  /** List available models for this adapter */
  listModels(): string[];
  
  /** Validate that an image can be processed */
  validateImage(imageData: string): { valid: boolean; error?: string };
}

/** Base class with common functionality for vision adapters */
export abstract class BaseVisionAdapter implements VisionAdapter {
  abstract readonly name: string;
  protected config: VisionAdapterConfig;
  
  constructor(config: VisionAdapterConfig) {
    this.config = {
      timeoutMs: 30000,
      ...config,
    };
  }
  
  abstract isReady(): boolean;
  abstract analyze(request: VisionAnalyzeRequest): Promise<VisionAnalyzeResponse>;
  abstract listModels(): string[];
  
  validateImage(imageData: string): { valid: boolean; error?: string } {
    // Check if it's a data URL
    if (imageData.startsWith("data:")) {
      const match = imageData.match(/^data:([^;]+);base64,/);
      if (!match) {
        return { valid: false, error: "Invalid data URL format" };
      }
      const mimeType = match[1];
      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!validTypes.includes(mimeType)) {
        return { valid: false, error: `Unsupported image type: ${mimeType}` };
      }
      return { valid: true };
    }
    
    // Assume it's raw base64, validate it's decodable
    try {
      const decoded = Buffer.from(imageData, "base64");
      if (decoded.length === 0) {
        return { valid: false, error: "Empty image data" };
      }
      if (decoded.length > 10 * 1024 * 1024) {
        return { valid: false, error: "Image too large (max 10MB)" };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid base64 encoding" };
    }
  }
  
  /** Extract base64 data from data URL or return as-is */
  protected extractBase64Data(imageData: string): string {
    if (imageData.startsWith("data:")) {
      const commaIndex = imageData.indexOf(",");
      if (commaIndex === -1) return imageData;
      return imageData.slice(commaIndex + 1);
    }
    return imageData;
  }
  
  /** Get MIME type from data URL or default to jpeg */
  protected getMimeType(imageData: string): string {
    if (imageData.startsWith("data:")) {
      const match = imageData.match(/^data:([^;]+);base64,/);
      if (match) return match[1];
    }
    return "image/jpeg";
  }
}

/** Factory for creating vision adapters */
export class VisionAdapterFactory {
  private adapters = new Map<string, new (config: VisionAdapterConfig) => VisionAdapter>();
  
  /** Register an adapter class */
  register(type: string, AdapterClass: new (config: VisionAdapterConfig) => VisionAdapter): void {
    this.adapters.set(type, AdapterClass);
  }
  
  /** Create an adapter instance */
  create(config: VisionAdapterConfig): VisionAdapter | null {
    const AdapterClass = this.adapters.get(config.type);
    if (!AdapterClass) {
      return null;
    }
    return new AdapterClass(config);
  }
  
  /** List available adapter types */
  listTypes(): string[] {
    return Array.from(this.adapters.keys());
  }
}

/** Global adapter factory instance */
export const visionAdapterFactory = new VisionAdapterFactory();
