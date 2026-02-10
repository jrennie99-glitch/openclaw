/**
 * Mock Vision Adapter
 * 
 * A mock adapter for testing and development.
 * Returns simulated responses without calling external APIs.
 */

import { BaseVisionAdapter } from "../adapter.js";
import type { VisionAnalyzeRequest, VisionAnalyzeResponse } from "../types.js";

export class MockVisionAdapter extends BaseVisionAdapter {
  readonly name = "mock";
  
  isReady(): boolean {
    return true;
  }
  
  async analyze(request: VisionAnalyzeRequest): Promise<VisionAnalyzeResponse> {
    const startTime = Date.now();
    
    // Simulate network delay (100-500ms)
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));
    
    const prompts = [
      "I can see what appears to be an image. Based on the visual content, " +
        "this seems to show a scene with various elements.",
      "The image contains several notable features that stand out. " +
        "The composition suggests it may be related to technology or workspace.",
      "Looking at this image, I can identify the main subjects and their arrangement. " +
        "The lighting and colors provide good contrast.",
      "This appears to be a digital capture showing content that could be " +
        "related to documentation, interface design, or visual reference material.",
    ];
    
    const analysis = request.prompt 
      ? `Analysis for "${request.prompt}": ${prompts[Math.floor(Math.random() * prompts.length)]}`
      : prompts[Math.floor(Math.random() * prompts.length)];
    
    return {
      ok: true,
      analysis,
      model: "mock-vision-v1",
      usage: {
        promptTokens: Math.floor(Math.random() * 500) + 100,
        completionTokens: Math.floor(Math.random() * 200) + 50,
        totalTokens: Math.floor(Math.random() * 700) + 150,
      },
      processingTimeMs: Date.now() - startTime,
    };
  }
  
  listModels(): string[] {
    return ["mock-vision-v1", "mock-vision-lite"];
  }
}
