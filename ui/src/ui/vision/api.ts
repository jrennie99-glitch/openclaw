/**
 * Vision API Client
 * 
 * Client for interacting with the SSGM Vision API.
 */

import type { VisionResult, VisionStatus } from "./types.ts";

export interface VisionApiClient {
  baseUrl: string;
  token?: string;
}

/**
 * Get vision service status
 */
export async function getVisionStatus(client: VisionApiClient): Promise<VisionStatus | null> {
  try {
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };
    if (client.token) {
      headers["Authorization"] = `Bearer ${client.token}`;
    }
    
    const response = await fetch(`${client.baseUrl}/api/ssgm/vision/status`, {
      method: "GET",
      headers,
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json() as VisionStatus;
  } catch {
    return null;
  }
}

/**
 * Analyze an image using the vision API
 */
export async function analyzeImage(
  client: VisionApiClient,
  imageDataUrl: string,
  prompt?: string,
  onProgress?: (progress: number) => void,
): Promise<VisionResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (client.token) {
    headers["Authorization"] = `Bearer ${client.token}`;
  }
  
  // Simulate progress for better UX
  if (onProgress) {
    onProgress(10);
    await delay(50);
    onProgress(30);
  }
  
  try {
    const response = await fetch(`${client.baseUrl}/api/ssgm/vision/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        image: imageDataUrl,
        prompt,
      }),
    });
    
    if (onProgress) {
      onProgress(70);
    }
    
    const result = await response.json() as VisionResult;
    
    if (onProgress) {
      onProgress(100);
    }
    
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return {
      ok: false,
      error: {
        message,
        type: "network_error",
      },
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
