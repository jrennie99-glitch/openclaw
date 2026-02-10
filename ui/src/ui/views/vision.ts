/**
 * Vision View
 * 
 * View component for the Vision tab in the UI.
 */

import { html } from "lit";
import type { OpenClawApp } from "../app.ts";
import { renderVisionPanel } from "../vision/panel.ts";
import { renderCameraCapture, requestCameraAccess, captureFrame } from "../vision/camera.ts";
import { compressImage, isValidImageType, generateImageId } from "../vision/compression.ts";
import { analyzeImage, getVisionStatus } from "../vision/api.ts";
import type { VisionImage, VisionAnalysisState } from "../vision/types.ts";

interface VisionViewState {
  enabled: boolean;
  adapterName: string | null;
  models: string[];
  ready: boolean;
  images: VisionImage[];
  prompt: string;
  analysisState: VisionAnalysisState;
  selectedImageId: string | null;
  cameraOpen: boolean;
  cameraStream: MediaStream | null;
  cameraError: string | null;
}

export function renderVision(app: OpenClawApp) {
  const state = getVisionState(app);

  return html`
    <div class="view-container">
      <div class="view-header">
        <h1>Vision Analysis</h1>
        <p class="view-subtitle">Camera capture and image analysis with AI vision models.</p>
      </div>
      <div class="view-content">
        ${renderVisionPanel({
          enabled: state.enabled,
          adapterName: state.adapterName,
          models: state.models,
          ready: state.ready,
          images: state.images,
          prompt: state.prompt,
          analysisState: state.analysisState,
          selectedImageId: state.selectedImageId,
          onFileSelect: (files) => handleFileSelect(app, files),
          onCameraCapture: () => openCamera(app),
          onPromptChange: (prompt) => updatePrompt(app, prompt),
          onImageRemove: (id) => removeImage(app, id),
          onImageSelect: (id) => selectImage(app, id),
          onAnalyze: () => analyze(app),
          onClear: () => clearAll(app),
        })}
        ${renderCameraCapture({
          open: state.cameraOpen,
          videoStream: state.cameraStream,
          error: state.cameraError,
          onClose: () => closeCamera(app),
          onCapture: () => captureFromCamera(app),
          onRequestCamera: () => requestCamera(app),
        })}
      </div>
    </div>
  `;
}

function getVisionState(app: OpenClawApp): VisionViewState {
  // Get from app state or initialize defaults
  return {
    enabled: app.settings.CAMERA_ENABLED,
    adapterName: (app as unknown as Record<string, unknown>).visionAdapterName as string | null ?? null,
    models: (app as unknown as Record<string, unknown>).visionModels as string[] ?? [],
    ready: (app as unknown as Record<string, unknown>).visionReady as boolean ?? false,
    images: (app as unknown as Record<string, unknown>).visionImages as VisionImage[] ?? [],
    prompt: (app as unknown as Record<string, unknown>).visionPrompt as string ?? "",
    analysisState: ((app as unknown as Record<string, unknown>).visionAnalysisState as VisionAnalysisState) ?? { status: "idle" },
    selectedImageId: (app as unknown as Record<string, unknown>).visionSelectedImageId as string | null ?? null,
    cameraOpen: (app as unknown as Record<string, unknown>).cameraOpen as boolean ?? false,
    cameraStream: (app as unknown as Record<string, unknown>).cameraStream as MediaStream | null ?? null,
    cameraError: (app as unknown as Record<string, unknown>).cameraError as string | null ?? null,
  };
}

function setVisionState(app: OpenClawApp, updates: Partial<VisionViewState>) {
  const appAny = app as unknown as Record<string, unknown>;
  if (updates.adapterName !== undefined) appAny.visionAdapterName = updates.adapterName;
  if (updates.models !== undefined) appAny.visionModels = updates.models;
  if (updates.ready !== undefined) appAny.visionReady = updates.ready;
  if (updates.images !== undefined) appAny.visionImages = updates.images;
  if (updates.prompt !== undefined) appAny.visionPrompt = updates.prompt;
  if (updates.analysisState !== undefined) appAny.visionAnalysisState = updates.analysisState;
  if (updates.selectedImageId !== undefined) appAny.visionSelectedImageId = updates.selectedImageId;
  if (updates.cameraOpen !== undefined) appAny.cameraOpen = updates.cameraOpen;
  if (updates.cameraStream !== undefined) appAny.cameraStream = updates.cameraStream;
  if (updates.cameraError !== undefined) appAny.cameraError = updates.cameraError;
  app.requestUpdate();
}

async function handleFileSelect(app: OpenClawApp, files: FileList | null) {
  if (!files) return;

  const state = getVisionState(app);
  const newImages: VisionImage[] = [];

  for (const file of Array.from(files)) {
    if (!isValidImageType(file)) {
      // Could show error toast here
      continue;
    }

    try {
      const { dataUrl, compressed } = await compressImage(file);
      newImages.push({
        id: generateImageId(),
        dataUrl,
        file,
        compressed,
      });
    } catch (error) {
      console.error("Failed to compress image:", error);
    }
  }

  if (newImages.length > 0) {
    setVisionState(app, {
      images: [...state.images, ...newImages],
      selectedImageId: newImages[0].id,
    });
  }
}

async function openCamera(app: OpenClawApp) {
  setVisionState(app, { cameraOpen: true, cameraError: null });
  await requestCamera(app);
}

async function requestCamera(app: OpenClawApp) {
  const result = await requestCameraAccess();
  if ("error" in result) {
    setVisionState(app, { cameraError: result.error });
  } else {
    setVisionState(app, { cameraStream: result.stream, cameraError: null });
  }
}

function closeCamera(app: OpenClawApp) {
  const state = getVisionState(app);
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(track => track.stop());
  }
  setVisionState(app, { cameraOpen: false, cameraStream: null, cameraError: null });
}

function captureFromCamera(app: OpenClawApp) {
  const state = getVisionState(app);
  if (!state.cameraStream) return;

  // Find video element - in a real implementation, we'd use a ref
  // For now, we'll look it up by the video element in the camera modal
  const video = document.querySelector(".camera-preview__video") as HTMLVideoElement;
  if (!video) return;

  const dataUrl = captureFrame(video);
  if (!dataUrl) return;

  // Create a synthetic file
  const byteString = atob(dataUrl.split(",")[1]);
  const mimeString = dataUrl.split(",")[0].split(":")[1].split(";")[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mimeString });
  const file = new File([blob], `camera_capture_${Date.now()}.jpg`, { type: mimeString });

  const newImage: VisionImage = {
    id: generateImageId(),
    dataUrl,
    file,
    compressed: true,
  };

  setVisionState(app, {
    images: [...state.images, newImage],
    selectedImageId: newImage.id,
    cameraOpen: false,
  });
  closeCamera(app);
}

function updatePrompt(app: OpenClawApp, prompt: string) {
  setVisionState(app, { prompt });
}

function removeImage(app: OpenClawApp, id: string) {
  const state = getVisionState(app);
  const newImages = state.images.filter(img => img.id !== id);
  setVisionState(app, {
    images: newImages,
    selectedImageId: state.selectedImageId === id 
      ? (newImages[0]?.id ?? null)
      : state.selectedImageId,
  });
}

function selectImage(app: OpenClawApp, id: string) {
  setVisionState(app, { selectedImageId: id });
}

async function analyze(app: OpenClawApp) {
  const state = getVisionState(app);
  if (state.images.length === 0) return;

  // Use the selected image or the first one
  const imageToAnalyze = state.images.find(img => img.id === state.selectedImageId) ?? state.images[0];

  setVisionState(app, { analysisState: { status: "uploading", progress: 0 } });

  try {
    const result = await analyzeImage(
      {
        baseUrl: getBaseUrl(app),
        token: app.settings.token,
      },
      imageToAnalyze.dataUrl,
      state.prompt || undefined,
      (progress) => {
        setVisionState(app, { analysisState: { status: "uploading", progress } });
      }
    );

    if (result.ok) {
      setVisionState(app, { analysisState: { status: "complete", result } });
    } else {
      setVisionState(app, { analysisState: { status: "error", error: result.error.message } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    setVisionState(app, { analysisState: { status: "error", error: message } });
  }
}

function clearAll(app: OpenClawApp) {
  setVisionState(app, {
    images: [],
    prompt: "",
    analysisState: { status: "idle" },
    selectedImageId: null,
  });
}

function getBaseUrl(app: OpenClawApp): string {
  const wsUrl = app.settings.gatewayUrl;
  if (wsUrl.startsWith("wss://")) {
    return `https://${wsUrl.slice(6)}`;
  }
  if (wsUrl.startsWith("ws://")) {
    return `http://${wsUrl.slice(5)}`;
  }
  return wsUrl;
}

/**
 * Load vision status from the server
 */
export async function loadVisionStatus(app: OpenClawApp): Promise<void> {
  if (!app.settings.CAMERA_ENABLED) return;

  const status = await getVisionStatus({
    baseUrl: getBaseUrl(app),
    token: app.settings.token,
  });

  if (status) {
    setVisionState(app, {
      adapterName: status.adapter,
      models: status.models,
      ready: status.ready,
    });
  }
}
