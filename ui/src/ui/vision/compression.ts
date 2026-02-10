/**
 * Image Compression Utility
 * 
 * Client-side image compression before upload to reduce bandwidth.
 */

import type { CompressionOptions } from "./types.ts";
import { DEFAULT_COMPRESSION_OPTIONS } from "./types.ts";

/**
 * Compress an image file client-side
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<{ dataUrl: string; compressed: boolean; originalSize: number; compressedSize: number }> {
  const opts = { ...DEFAULT_COMPRESSION_OPTIONS, ...options };
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      // Calculate new dimensions
      let { width, height } = img;
      const maxDim = opts.maxDimension ?? 1920;
      
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      
      // Skip compression if image is already small enough
      if (width === img.width && height === img.height && file.size < 500 * 1024) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve({
            dataUrl,
            compressed: false,
            originalSize: file.size,
            compressedSize: file.size,
          });
        };
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.readAsDataURL(file);
        return;
      }
      
      // Draw to canvas and compress
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      
      // Use better quality scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to data URL
      const mimeType = `image/${opts.format ?? "jpeg"}`;
      const quality = opts.quality ?? 0.85;
      const dataUrl = canvas.toDataURL(mimeType, quality);
      
      // Calculate sizes
      const base64Data = dataUrl.split(",")[1];
      const compressedSize = Math.ceil((base64Data.length * 3) / 4);
      
      resolve({
        dataUrl,
        compressed: true,
        originalSize: file.size,
        compressedSize,
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    
    img.src = url;
  });
}

/**
 * Check if file is a valid image type
 */
export function isValidImageType(file: File): boolean {
  const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  return validTypes.includes(file.type);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Generate unique ID for images
 */
export function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
