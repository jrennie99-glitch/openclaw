/**
 * SSGM Vision Module
 * 
 * Image analysis and vision capabilities for SSGM.
 */

export * from "./types.js";
export * from "./adapter.js";

// Register built-in adapters
import { visionAdapterFactory } from "./adapter.js";
import { OpenAIVisionAdapter } from "./adapters/openai.js";
import { MockVisionAdapter } from "./adapters/mock.js";

// Auto-register built-in adapters
visionAdapterFactory.register("openai", OpenAIVisionAdapter);
visionAdapterFactory.register("mock", MockVisionAdapter);
