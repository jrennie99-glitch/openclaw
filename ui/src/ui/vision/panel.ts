/**
 * Vision Panel View
 * 
 * Main UI panel for camera/image analysis functionality.
 */

import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { VisionAnalysisState, VisionImage, VisionResult } from "./types.ts";
import { formatFileSize } from "./compression.ts";
import { icons } from "../icons.js";

export interface VisionPanelProps {
  // Feature flag
  enabled: boolean;
  // Status
  adapterName: string | null;
  models: string[];
  ready: boolean;
  // State
  images: VisionImage[];
  prompt: string;
  analysisState: VisionAnalysisState;
  selectedImageId: string | null;
  // Event handlers
  onFileSelect: (files: FileList | null) => void;
  onCameraCapture: () => void;
  onPromptChange: (prompt: string) => void;
  onImageRemove: (id: string) => void;
  onImageSelect: (id: string) => void;
  onAnalyze: () => void;
  onClear: () => void;
}

export function renderVisionPanel(props: VisionPanelProps) {
  if (!props.enabled) {
    return renderDisabledState();
  }

  return html`
    <div class="vision-panel">
      <div class="vision-panel__header">
        <h2 class="vision-panel__title">
          ${icons.camera} Vision Analysis
        </h2>
        <div class="vision-panel__status">
          ${props.ready 
            ? html`<span class="status-badge status-badge--ready">${icons.check} Ready</span>`
            : html`<span class="status-badge status-badge--not-ready">${icons.alertTriangle} Not Ready</span>`
          }
          ${props.adapterName ? html`<span class="adapter-name">${props.adapterName}</span>` : nothing}
        </div>
      </div>

      <div class="vision-panel__content">
        ${renderUploadSection(props)}
        ${renderImageGallery(props)}
        ${renderAnalysisSection(props)}
        ${renderResults(props)}
      </div>
    </div>
  `;
}

function renderDisabledState() {
  return html`
    <div class="vision-panel vision-panel--disabled">
      <div class="vision-panel__header">
        <h2 class="vision-panel__title">
          ${icons.camera} Vision Analysis
        </h2>
      </div>
      <div class="vision-panel__disabled-content">
        <div class="vision-panel__disabled-icon">
          ${icons.eyeOff}
        </div>
        <h3>Vision Analysis Disabled</h3>
        <p>Camera and image analysis features are currently disabled.</p>
        <p class="vision-panel__disabled-hint">
          Enable the CAMERA_ENABLED feature flag to use this feature.
        </p>
      </div>
    </div>
  `;
}

function renderUploadSection(props: VisionPanelProps) {
  return html`
    <div class="vision-section vision-section--upload">
      <h3 class="vision-section__title">Upload Image</h3>
      <div class="vision-upload">
        <div 
          class="vision-upload__dropzone"
          @dragover=${(e: DragEvent) => { e.preventDefault(); e.stopPropagation(); }}
          @drop=${(e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer?.files) {
              props.onFileSelect(e.dataTransfer.files);
            }
          }}
        >
          <input
            type="file"
            id="vision-file-input"
            class="vision-upload__input"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            @change=${(e: Event) => {
              const input = e.target as HTMLInputElement;
              props.onFileSelect(input.files);
              input.value = "";
            }}
          />
          <label for="vision-file-input" class="vision-upload__label">
            <span class="vision-upload__icon">${icons.upload}</span>
            <span class="vision-upload__text">
              Drop images here or <span class="vision-upload__browse">browse</span>
            </span>
            <span class="vision-upload__hint">
              Supports: JPEG, PNG, GIF, WebP (max 10MB)
            </span>
          </label>
        </div>

        <div class="vision-upload__divider">
          <span>or</span>
        </div>

        <button 
          class="vision-camera-btn"
          @click=${props.onCameraCapture}
          ?disabled=${!props.enabled}
        >
          ${icons.camera} Capture from Camera
        </button>
      </div>
    </div>
  `;
}

function renderImageGallery(props: VisionPanelProps) {
  if (props.images.length === 0) {
    return nothing;
  }

  return html`
    <div class="vision-section vision-section--gallery">
      <h3 class="vision-section__title">
        Images (${props.images.length})
      </h3>
      <div class="vision-gallery">
        ${repeat(
          props.images,
          (img) => img.id,
          (img) => html`
            <div 
              class="vision-gallery__item ${props.selectedImageId === img.id ? "vision-gallery__item--selected" : ""}"
              @click=${() => props.onImageSelect(img.id)}
            >
              <img 
                src=${img.dataUrl} 
                alt="Uploaded image"
                class="vision-gallery__thumb"
              />
              <div class="vision-gallery__info">
                <span class="vision-gallery__size">${formatFileSize(img.file.size)}</span>
                ${img.compressed 
                  ? html`<span class="vision-gallery__compressed" title="Compressed">${icons.minimize}</span>` 
                  : nothing
                }
              </div>
              <button 
                class="vision-gallery__remove"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  props.onImageRemove(img.id);
                }}
                title="Remove image"
              >
                ${icons.x}
              </button>
            </div>
          `
        )}
      </div>
    </div>
  `;
}

function renderAnalysisSection(props: VisionPanelProps) {
  const canAnalyze = props.images.length > 0 && props.ready && props.analysisState.status !== "analyzing";
  
  return html`
    <div class="vision-section vision-section--analysis">
      <h3 class="vision-section__title">Analysis Prompt</h3>
      <div class="vision-prompt">
        <textarea
          class="vision-prompt__input"
          .value=${props.prompt}
          @input=${(e: Event) => props.onPromptChange((e.target as HTMLTextAreaElement).value)}
          placeholder="Optional: Describe what you'd like to know about the image (e.g., 'Describe the objects in this image', 'What text do you see?')"
          rows="3"
          ?disabled=${props.analysisState.status === "analyzing"}
        ></textarea>
        <div class="vision-prompt__actions">
          <button
            class="vision-btn vision-btn--secondary"
            @click=${props.onClear}
            ?disabled=${props.images.length === 0 && !props.prompt}
          >
            ${icons.trash} Clear
          </button>
          <button
            class="vision-btn vision-btn--primary"
            @click=${props.onAnalyze}
            ?disabled=${!canAnalyze}
          >
            ${props.analysisState.status === "analyzing" 
              ? html`${icons.loader} Analyzing...`
              : html`${icons.sparkles} Analyze Image${props.images.length > 1 ? "s" : ""}`
            }
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderResults(props: VisionPanelProps) {
  const { analysisState } = props;

  if (analysisState.status === "idle") {
    return nothing;
  }

  if (analysisState.status === "compressing") {
    return html`
      <div class="vision-section vision-section--results">
        <h3 class="vision-section__title">Processing</h3>
        <div class="vision-result vision-result--loading">
          ${icons.loader}
          <span>Compressing image...</span>
        </div>
      </div>
    `;
  }

  if (analysisState.status === "uploading") {
    return html`
      <div class="vision-section vision-section--results">
        <h3 class="vision-section__title">Processing</h3>
        <div class="vision-result vision-result--loading">
          ${icons.loader}
          <span>Uploading (${analysisState.progress}%)...</span>
          <div class="vision-progress">
            <div class="vision-progress__bar" style="width: ${analysisState.progress}%"></div>
          </div>
        </div>
      </div>
    `;
  }

  if (analysisState.status === "analyzing") {
    return html`
      <div class="vision-section vision-section--results">
        <h3 class="vision-section__title">Processing</h3>
        <div class="vision-result vision-result--loading">
          ${icons.loader}
          <span>Analyzing image...</span>
        </div>
      </div>
    `;
  }

  if (analysisState.status === "error") {
    return html`
      <div class="vision-section vision-section--results">
        <h3 class="vision-section__title">Result</h3>
        <div class="vision-result vision-result--error">
          <div class="vision-result__header">
            ${icons.alertCircle}
            <span>Analysis Failed</span>
          </div>
          <div class="vision-result__error-message">
            ${analysisState.error}
          </div>
        </div>
      </div>
    `;
  }

  if (analysisState.status === "complete") {
    const result = analysisState.result;
    return html`
      <div class="vision-section vision-section--results">
        <h3 class="vision-section__title">Result</h3>
        <div class="vision-result vision-result--success">
          <div class="vision-result__header">
            ${icons.checkCircle}
            <span>Analysis Complete</span>
            ${result.model ? html`<span class="vision-result__model">${result.model}</span>` : nothing}
          </div>
          <div class="vision-result__content">
            ${result.analysis}
          </div>
          ${result.usage ? html`
            <div class="vision-result__usage">
              <span>Tokens: ${result.usage.totalTokens.toLocaleString()}</span>
              ${result.processingTimeMs 
                ? html`<span>Time: ${(result.processingTimeMs / 1000).toFixed(2)}s</span>` 
                : nothing
              }
            </div>
          ` : nothing}
        </div>
      </div>
    `;
  }

  return nothing;
}
