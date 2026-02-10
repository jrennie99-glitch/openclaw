/**
 * Camera Capture Modal
 * 
 * Modal for capturing images from the device camera.
 */

import { html, nothing } from "lit";
import { icons } from "../icons.js";

export interface CameraCaptureProps {
  open: boolean;
  videoStream: MediaStream | null;
  error: string | null;
  // Event handlers
  onClose: () => void;
  onCapture: () => void;
  onRequestCamera: () => void;
  videoRef?: (el: HTMLVideoElement | null) => void;
}

export function renderCameraCapture(props: CameraCaptureProps) {
  if (!props.open) {
    return nothing;
  }

  return html`
    <div class="camera-modal-overlay" @click=${props.onClose}>
      <div class="camera-modal" @click=${(e: Event) => e.stopPropagation()}>
        <div class="camera-modal__header">
          <h3>${icons.camera} Camera Capture</h3>
          <button class="camera-modal__close" @click=${props.onClose}>
            ${icons.x}
          </button>
        </div>

        <div class="camera-modal__content">
          ${props.error 
            ? renderError(props.error, props.onRequestCamera)
            : renderPreview(props)
          }
        </div>

        <div class="camera-modal__footer">
          <button class="vision-btn vision-btn--secondary" @click=${props.onClose}>
            Cancel
          </button>
          <button 
            class="vision-btn vision-btn--primary"
            @click=${props.onCapture}
            ?disabled=${!props.videoStream}
          >
            ${icons.camera} Capture
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderError(error: string, onRetry: () => void) {
  return html`
    <div class="camera-error">
      <div class="camera-error__icon">${icons.alertCircle}</div>
      <div class="camera-error__message">${error}</div>
      <button class="vision-btn vision-btn--secondary" @click=${onRetry}>
        ${icons.refreshCw} Try Again
      </button>
    </div>
  `;
}

function renderPreview(props: CameraCaptureProps) {
  if (!props.videoStream) {
    return html`
      <div class="camera-preview camera-preview--loading">
        ${icons.loader}
        <span>Requesting camera access...</span>
      </div>
    `;
  }

  return html`
    <div class="camera-preview">
      <video
        ${props.videoRef ? (el: HTMLVideoElement) => { props.videoRef!(el); } : ""}
        class="camera-preview__video"
        autoplay
        playsinline
        .srcObject=${props.videoStream}
      ></video>
      <div class="camera-preview__guide">
        <div class="camera-preview__guide-frame"></div>
      </div>
    </div>
  `;
}

/**
 * Request camera access
 */
export async function requestCameraAccess(): Promise<{ stream: MediaStream } | { error: string }> {
  try {
    // Check for camera support
    if (!navigator.mediaDevices?.getUserMedia) {
      return { error: "Camera not supported in this browser" };
    }

    // Request camera with ideal constraints
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    return { stream };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return { error: "Camera permission denied. Please allow camera access and try again." };
    }
    if (error.name === "NotFoundError") {
      return { error: "No camera found on this device." };
    }
    if (error.name === "NotReadableError") {
      return { error: "Camera is already in use by another application." };
    }
    
    return { error: `Camera error: ${error.message}` };
  }
}

/**
 * Capture a frame from the video stream
 */
export function captureFrame(video: HTMLVideoElement, format = "jpeg", quality = 0.9): string | null {
  if (!video.videoWidth || !video.videoHeight) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  // Flip horizontally if using front camera (mirror effect)
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);

  const mimeType = format === "png" ? "image/png" : "image/jpeg";
  return canvas.toDataURL(mimeType, quality);
}
