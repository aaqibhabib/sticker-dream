import { pipeline } from "@huggingface/transformers";
import { GoogleGenAI, SafetyFilterLevel } from "@google/genai";
import { loadModel, generateImage as localGenerateImage, isModelLoaded, detectCapabilities } from "web-txt2img";
import type { LoadProgress, GenerationProgressEvent } from "web-txt2img";

// API Key Management
const API_KEY_STORAGE_KEY = "sticker-dream-gemini-api-key";

function getStoredApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

function setStoredApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

function clearStoredApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

// Google AI client (initialized when API key is available)
let ai: GoogleGenAI | null = null;

function initializeAI(apiKey: string): void {
  ai = new GoogleGenAI({ apiKey });
}

// Generation mode: 'gemini' (cloud) or 'local' (on-device SD-Turbo)
type GenerationMode = 'gemini' | 'local';
let currentMode: GenerationMode = 'local';
let localModelLoaded = false;
let localModelLoading = false;
let deviceSupportsLocal = false;
let detectedBackend: 'webgpu' | 'wasm' | null = null;

// Image generation using Gemini Imagen
const imageGen4 = "imagen-4.0-fast-generate-001";

async function generateImageWithGemini(prompt: string): Promise<string | null> {
  if (!ai) {
    throw new Error("API key not configured");
  }

  console.log(`🎨 Generating image: "${prompt}"`);
  console.time("generation");

  const response = await ai.models.generateImages({
    model: imageGen4,
    prompt: `A simple black and white kids coloring page sticker design.
    Style: very simple, bold thick outlines, minimal details, large shapes, easy to color.
    Perfect for small 2 inch round stickers.
    <image-description>
    ${prompt}
    </image-description>
    ${prompt}

    Keep it simple with thick bold lines and large clear shapes. Minimal fine details.`,
    config: {
      numberOfImages: 1,
      aspectRatio: "1:1", // Square for round labels
      safetyFilterLevel: SafetyFilterLevel.BLOCK_LOW_AND_ABOVE
    },
  });

  console.timeEnd("generation");

  if (!response.generatedImages || response.generatedImages.length === 0) {
    console.error("No images generated");
    return null;
  }

  const imgBytes = response.generatedImages[0].image?.imageBytes;
  if (!imgBytes) {
    console.error("No image bytes returned");
    return null;
  }

  // Convert base64 to data URL for browser display
  return `data:image/png;base64,${imgBytes}`;
}

// Local model loading
async function loadLocalModel(onProgress?: (p: LoadProgress) => void): Promise<boolean> {
  if (localModelLoaded) return true;
  if (localModelLoading) return false;
  localModelLoading = true;

  try {
    const caps = await detectCapabilities();
    const backendPreference: ('webgpu' | 'wasm')[] = caps.webgpu ? ['webgpu', 'wasm'] : ['wasm'];

    const result = await loadModel('sd-turbo', {
      backendPreference,
      onProgress,
    });

    if (result.ok) {
      localModelLoaded = true;
      console.log(`✅ SD-Turbo loaded via ${result.backendUsed}`);
      return true;
    } else {
      console.error('Failed to load SD-Turbo:', result.message);
      alert(`Failed to load local model: ${result.message}`);
      return false;
    }
  } catch (error) {
    console.error('Error loading local model:', error);
    alert('Failed to load local model: ' + (error instanceof Error ? error.message : String(error)));
    return false;
  } finally {
    localModelLoading = false;
  }
}

// Image generation using local SD-Turbo
async function generateImageLocally(prompt: string, onProgress?: (e: GenerationProgressEvent) => void): Promise<string | null> {
  if (!localModelLoaded) {
    throw new Error("Local model not loaded");
  }

  console.log(`🎨 Generating image locally: "${prompt}"`);
  console.time("local-generation");

  const result = await localGenerateImage({
    model: 'sd-turbo',
    prompt: `A simple black and white kids coloring page sticker design, bold thick outlines, minimal details, large shapes, easy to color. ${prompt}`,
    seed: Math.floor(Math.random() * 2147483647),
    onProgress,
  });

  console.timeEnd("local-generation");

  if (!result.ok) {
    console.error("Local generation failed:", result.message);
    return null;
  }

  return URL.createObjectURL(result.blob);
}

// Initialize the transcriber
const transcriber = await pipeline(
  "automatic-speech-recognition",
  "Xenova/whisper-tiny.en",
  {
    progress_callback: (event) => {
      // console.log(event);
    },
  }
);

// Get DOM elements
const apiKeySetup = document.getElementById("apiKeySetup") as HTMLDivElement;
const mainApp = document.getElementById("mainApp") as HTMLDivElement;
const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement;
const saveApiKeyBtn = document.getElementById("saveApiKey") as HTMLButtonElement;
const settingsBtn = document.getElementById("settingsBtn") as HTMLButtonElement;
const buildInfo = document.getElementById("buildInfo") as HTMLParagraphElement;
const recordBtn = document.querySelector(".record") as HTMLButtonElement;
const transcriptDiv = document.getElementById("transcript") as HTMLParagraphElement;
const audioElement = document.querySelector("#audio") as HTMLAudioElement;
const imageDisplay = document.getElementById("generatedImage") as HTMLImageElement;
const textInput = document.getElementById("textInput") as HTMLInputElement;
const generateBtn = document.getElementById("generateBtn") as HTMLButtonElement;
const inputSection = document.getElementById("inputSection") as HTMLDivElement;

// Model toggle elements
const geminiModeBtn = document.getElementById("geminiModeBtn") as HTMLButtonElement;
const geminiModeDesc = document.getElementById("geminiModeDesc") as HTMLSpanElement;
const localModeBtn = document.getElementById("localModeBtn") as HTMLButtonElement;
const localModeDesc = document.getElementById("localModeDesc") as HTMLSpanElement;
const localModelStatus = document.getElementById("localModelStatus") as HTMLDivElement;
const timingBadge = document.getElementById("timingBadge") as HTMLDivElement;
const timingSource = document.getElementById("timingSource") as HTMLSpanElement;
const timingMs = document.getElementById("timingMs") as HTMLSpanElement;
const skipApiKey = document.getElementById("skipApiKey") as HTMLParagraphElement;
const skipApiKeyLink = document.getElementById("skipApiKeyLink") as HTMLAnchorElement;

// Download card elements
const downloadCard = document.getElementById("downloadCard") as HTMLDivElement;
const downloadTitle = document.getElementById("downloadTitle") as HTMLSpanElement;
const downloadNote = document.getElementById("downloadNote") as HTMLSpanElement;
const downloadSteps = document.getElementById("downloadSteps") as HTMLDivElement;
const downloadProgress = document.getElementById("downloadProgress") as HTMLDivElement;
const progressFill = document.getElementById("progressFill") as HTMLDivElement;
const downloadSize = document.getElementById("downloadSize") as HTMLSpanElement;
const downloadSpeed = document.getElementById("downloadSpeed") as HTMLSpanElement;
const downloadStatus = document.getElementById("downloadStatus") as HTMLParagraphElement;
const stepEncoder = document.getElementById("stepEncoder") as HTMLDivElement;
const stepUnet = document.getElementById("stepUnet") as HTMLDivElement;
const stepVae = document.getElementById("stepVae") as HTMLDivElement;

// Template elements
const templateSection = document.getElementById("templateSection") as HTMLDivElement;
const templateGrid = document.getElementById("templateGrid") as HTMLDivElement;
const templateCells = templateGrid.querySelectorAll(".template-cell") as NodeListOf<HTMLDivElement>;
const fillAllBtn = document.getElementById("fillAllBtn") as HTMLButtonElement;
const clearAllBtn = document.getElementById("clearAllBtn") as HTMLButtonElement;
const printTemplateBtn = document.getElementById("printTemplateBtn") as HTMLButtonElement;
const newStickerBtn = document.getElementById("newStickerBtn") as HTMLButtonElement;

// Print mode elements
const fullPageModeBtn = document.getElementById("fullPageMode") as HTMLButtonElement;
const stickerModeBtn = document.getElementById("stickerMode") as HTMLButtonElement;
const fullpagePreview = document.getElementById("fullpagePreview") as HTMLDivElement;
const stickerPreview = document.getElementById("stickerPreview") as HTMLDivElement;
const fullpageImage = document.getElementById("fullpageImage") as HTMLImageElement;
const printFullPageBtn = document.getElementById("printFullPageBtn") as HTMLButtonElement;

// Print template elements
const printTemplate = document.getElementById("printTemplate") as HTMLDivElement;
const printCells = printTemplate.querySelectorAll(".print-cell") as NodeListOf<HTMLDivElement>;
const printFullpage = document.getElementById("printFullpage") as HTMLDivElement;
const printFullpageImage = document.getElementById("printFullpageImage") as HTMLImageElement;

// Current print mode: 'fullpage' or 'sticker'
let currentPrintMode: 'fullpage' | 'sticker' = 'fullpage';

let mediaRecorder: MediaRecorder | null = null;
let audioStream: MediaStream | null = null;
let audioChunks: Blob[] = [];
let recordingTimeout: number | null = null;
let isRecorderReady = false;

// Current generated image URL
let currentImageUrl: string | null = null;

// ========== iOS-RELIABLE PRINT UTILITIES ==========
// Uses canvas pre-rendering and dedicated print windows for iOS Safari compatibility

/**
 * Load an image and return a promise that resolves when fully loaded
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Render image to canvas - ensures content is actually rendered
 * Returns a blob URL which is more reliable than data URLs on iOS
 */
async function imageToCanvasBlob(
  imageUrl: string,
  width: number,
  height: number,
  fit: 'contain' | 'cover' = 'contain'
): Promise<string> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Fill white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  // Calculate dimensions to fit/cover
  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  const imgRatio = img.width / img.height;
  const canvasRatio = width / height;

  if (fit === 'contain') {
    if (imgRatio > canvasRatio) {
      drawWidth = width;
      drawHeight = width / imgRatio;
      offsetY = (height - drawHeight) / 2;
    } else {
      drawHeight = height;
      drawWidth = height * imgRatio;
      offsetX = (width - drawWidth) / 2;
    }
  }

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

  // Convert to blob URL (more reliable on iOS than data URL)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        reject(new Error('Canvas toBlob failed'));
      }
    }, 'image/png');
  });
}

/**
 * Create a sticker sheet canvas with images positioned for Avery 22877 labels
 */
async function createStickerSheetCanvas(
  imageUrl: string,
  filledCells: number[]
): Promise<string> {
  // Letter size at 150 DPI for good print quality
  const DPI = 150;
  const pageWidth = 8.5 * DPI;  // 1275px
  const pageHeight = 11 * DPI;  // 1650px

  // Avery 22877 measurements (in inches, converted to pixels)
  const topMargin = 0.618 * DPI;
  const leftMargin = 0.618 * DPI;
  const hPitch = 2.63 * DPI;  // horizontal spacing
  const vPitch = 2.59 * DPI;  // vertical spacing
  const labelSize = 2 * DPI;   // 2" diameter

  const canvas = document.createElement('canvas');
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const ctx = canvas.getContext('2d')!;

  // White background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, pageWidth, pageHeight);

  // Load the sticker image
  const img = await loadImage(imageUrl);

  // Draw each filled cell
  for (const cellIndex of filledCells) {
    const col = cellIndex % 3;
    const row = Math.floor(cellIndex / 3);

    const x = leftMargin + (col * hPitch);
    const y = topMargin + (row * vPitch);

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + labelSize / 2, y + labelSize / 2, labelSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Draw image to fill the circle
    ctx.drawImage(img, x, y, labelSize, labelSize);
    ctx.restore();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        reject(new Error('Canvas toBlob failed'));
      }
    }, 'image/png');
  });
}

/**
 * Print using an iframe - avoids popup blockers on iOS Safari
 * Falls back to in-page printing if iframe approach fails
 */
function printViaIframe(imageBlobUrl: string): void {
  // Create hidden iframe for printing
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    console.warn('Could not access iframe document, falling back to overlay print');
    document.body.removeChild(iframe);
    printViaOverlay(imageBlobUrl);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; background: white; }
        img {
          width: 100%;
          height: auto;
          display: block;
        }
        @page { margin: 0; size: letter portrait; }
      </style>
    </head>
    <body>
      <img src="${imageBlobUrl}" />
    </body>
    </html>
  `);
  iframeDoc.close();

  // Wait for image to load in iframe, then print
  const iframeImg = iframeDoc.querySelector('img') as HTMLImageElement;

  const cleanupIframe = () => {
    // Use longer delay and check if iframe still exists
    setTimeout(() => {
      try {
        if (iframe && iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      } catch (e) {
        console.warn('Iframe cleanup error:', e);
      }
      // Revoke the blob URL after printing is done
      setTimeout(() => {
        try {
          URL.revokeObjectURL(imageBlobUrl);
        } catch (e) {
          // Ignore errors
        }
      }, 5000);
    }, 2000);
  };

  const doPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      cleanupIframe();
    } catch (e) {
      console.warn('Iframe print failed, falling back to overlay:', e);
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
      printViaOverlay(imageBlobUrl);
    }
  };

  if (iframeImg.complete) {
    setTimeout(doPrint, 100);
  } else {
    iframeImg.onload = () => setTimeout(doPrint, 100);
    iframeImg.onerror = () => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
      printViaOverlay(imageBlobUrl);
    };
  }
}

/**
 * Fallback: Print via fullscreen overlay
 * Shows image in overlay, uses main window print with CSS hiding other content
 */
function printViaOverlay(imageBlobUrl: string): void {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'print-overlay';
  overlay.innerHTML = `
    <div class="print-overlay-content">
      <img src="${imageBlobUrl}" class="print-overlay-image" />
      <div class="print-overlay-buttons">
        <button class="print-overlay-btn print-now">Print Now</button>
        <button class="print-overlay-btn cancel">Cancel</button>
      </div>
    </div>
  `;

  // Add styles for overlay (will be added to head)
  const style = document.createElement('style');
  style.id = 'print-overlay-styles';
  style.textContent = `
    #print-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.9);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .print-overlay-content {
      background: white;
      border-radius: 12px;
      padding: 20px;
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .print-overlay-image {
      max-width: 100%;
      max-height: 60vh;
      object-fit: contain;
    }
    .print-overlay-buttons {
      margin-top: 20px;
      display: flex;
      gap: 15px;
    }
    .print-overlay-btn {
      padding: 15px 30px;
      font-size: 18px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    .print-overlay-btn.print-now {
      background: #4CAF50;
      color: white;
    }
    .print-overlay-btn.cancel {
      background: #e0e0e0;
      color: #333;
    }

    @media print {
      body > *:not(#print-overlay) { display: none !important; }
      #print-overlay {
        position: static;
        background: white;
        padding: 0;
      }
      .print-overlay-content {
        padding: 0;
        max-width: none;
        max-height: none;
      }
      .print-overlay-image {
        max-width: 100%;
        max-height: none;
        width: 100%;
      }
      .print-overlay-buttons { display: none !important; }
    }
    @page { margin: 0; size: letter portrait; }
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlay);

  // Cleanup function
  const cleanup = () => {
    try {
      overlay.remove();
      style.remove();
      // Revoke blob URL after a delay
      setTimeout(() => {
        try {
          URL.revokeObjectURL(imageBlobUrl);
        } catch (e) {
          // Ignore errors
        }
      }, 5000);
    } catch (e) {
      console.warn('Overlay cleanup error:', e);
    }
  };

  // Handle print button
  overlay.querySelector('.print-now')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.print();
  });

  // Handle cancel
  overlay.querySelector('.cancel')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    cleanup();
  });

  // Clean up after print (using afterprint event)
  const afterPrint = () => {
    // Delay cleanup to let iOS finish
    setTimeout(() => {
      cleanup();
    }, 500);
    window.removeEventListener('afterprint', afterPrint);
  };
  window.addEventListener('afterprint', afterPrint);
}

/**
 * Main print function for full page mode - iOS reliable
 */
async function printFullPageReliable(imageUrl: string): Promise<void> {
  console.log('🖨️ Preparing full page print (iOS-reliable mode)...');

  try {
    // Render to canvas at letter size (8.5 x 11 inches at 150 DPI)
    const blobUrl = await imageToCanvasBlob(imageUrl, 1275, 1650, 'contain');
    console.log('✅ Canvas rendered, printing via iframe...');

    printViaIframe(blobUrl);
  } catch (error) {
    console.error('Print preparation failed:', error);
    alert('Failed to prepare print. Please try again.');
  }
}

/**
 * Main print function for sticker sheet mode - iOS reliable
 */
async function printStickerSheetReliable(
  imageUrl: string,
  filledCells: number[]
): Promise<void> {
  console.log('🖨️ Preparing sticker sheet print (iOS-reliable mode)...');

  if (filledCells.length === 0) {
    alert('Please fill at least one cell before printing.');
    return;
  }

  try {
    const blobUrl = await createStickerSheetCanvas(imageUrl, filledCells);
    console.log('✅ Sticker sheet rendered, printing via iframe...');

    printViaIframe(blobUrl);
  } catch (error) {
    console.error('Print preparation failed:', error);
    alert('Failed to prepare print. Please try again.');
  }
}

// ========== APP INITIALIZATION ==========
// Detects capabilities, checks API key, and decides what UI to show.
// Key principle: users should never be blocked if their device supports local mode.

function hasApiKey(): boolean {
  return !!getStoredApiKey();
}

// Update Gemini toggle and settings button based on whether an API key is present
function updateGeminiToggleState(): void {
  if (hasApiKey()) {
    geminiModeBtn.disabled = false;
    geminiModeDesc.textContent = 'Cloud';
    settingsBtn.textContent = 'Gemini API Key';
  } else {
    geminiModeBtn.disabled = true;
    geminiModeDesc.textContent = 'Needs API Key';
    settingsBtn.textContent = deviceSupportsLocal ? 'Add Gemini (Optional)' : 'Add API Key';
  }
}

// Show the main app (hide API key setup)
function showMainApp(): void {
  apiKeySetup.style.display = "none";
  mainApp.style.display = "flex";
  recordBtn.style.display = "block";
}

// Show the API key setup screen (hide main app)
const apiKeyTitle = document.getElementById("apiKeyTitle") as HTMLHeadingElement;
const apiKeySubtitle = document.getElementById("apiKeySubtitle") as HTMLParagraphElement;

function showApiKeySetup(): void {
  apiKeySetup.style.display = "block";
  mainApp.style.display = "none";

  if (deviceSupportsLocal) {
    // Local works — framing is optional/additive
    apiKeyTitle.textContent = 'Add Gemini Cloud (Optional)';
    apiKeySubtitle.textContent = 'Add a Gemini API key to enable higher-quality cloud generation alongside on-device mode.';
    skipApiKey.style.display = 'block';
  } else {
    // No local — API key is required
    apiKeyTitle.textContent = 'Setup Required';
    apiKeySubtitle.textContent = 'Enter your Google Gemini API key to get started.';
    skipApiKey.style.display = 'none';
  }
}

// Device capability detection
async function checkDeviceCapabilities(): Promise<void> {
  try {
    const caps = await detectCapabilities();
    console.log('Device capabilities:', caps);

    if (caps.webgpu) {
      deviceSupportsLocal = true;
      detectedBackend = 'webgpu';
      localModeBtn.disabled = false;
      localModeDesc.textContent = 'On-Device (WebGPU)';
    } else if (caps.wasm) {
      deviceSupportsLocal = true;
      detectedBackend = 'wasm';
      localModeBtn.disabled = false;
      localModeDesc.textContent = 'On-Device (Slow)';
    } else {
      deviceSupportsLocal = false;
      detectedBackend = null;
      localModeBtn.disabled = true;
      localModeDesc.textContent = 'Not Supported';
      localModeBtn.title = 'Your browser does not support WebGPU or WASM for on-device inference.';
    }
  } catch (error) {
    console.error('Capability detection failed:', error);
    deviceSupportsLocal = false;
    localModeBtn.disabled = true;
    localModeDesc.textContent = 'Unavailable';
    localModeBtn.title = 'Could not detect device capabilities.';
  }
}

// Main initialization — runs once on page load
// Priority: Local on-device is the primary experience. Gemini is an optional cloud upgrade.
async function initApp(): Promise<void> {
  // 1. Detect device capabilities (async — determines if local mode is viable)
  await checkDeviceCapabilities();

  // 2. Check for stored API key
  const apiKey = getStoredApiKey();
  if (apiKey) {
    initializeAI(apiKey);
  }

  // 3. Update toggle states
  updateGeminiToggleState();

  // 4. Decide initial UI — always prefer Local when available
  if (deviceSupportsLocal) {
    // Device supports local — show app, default to Local (primary experience)
    showMainApp();
    setLocalMode();
  } else if (apiKey) {
    // No local support but has API key — fall back to Gemini
    showMainApp();
    setGeminiMode();
  } else {
    // No local support AND no API key — must get API key to proceed
    showApiKeySetup();
  }
}

// Save API key handler
saveApiKeyBtn.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    alert("Please enter an API key");
    return;
  }
  setStoredApiKey(apiKey);
  initializeAI(apiKey);
  apiKeyInput.value = "";
  updateGeminiToggleState();
  showMainApp();
  // Stay in current mode — adding a key just unlocks Gemini as an option
  if (!deviceSupportsLocal && currentMode !== 'gemini') {
    setGeminiMode();
  }
});

// Allow Enter key to save
apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    saveApiKeyBtn.click();
  }
});

// Skip API key — go straight to local mode
skipApiKeyLink.addEventListener("click", (e) => {
  e.preventDefault();
  showMainApp();
  setLocalMode();
});

// Settings button — add or change API key
settingsBtn.addEventListener("click", () => {
  if (hasApiKey()) {
    if (confirm("Do you want to change your API key?")) {
      clearStoredApiKey();
      ai = null;
      updateGeminiToggleState();
      // If on Gemini mode, switch to local (if available) or show setup
      if (currentMode === 'gemini') {
        if (deviceSupportsLocal) {
          setLocalMode();
        } else {
          showApiKeySetup();
        }
      }
    }
  } else {
    // No key yet — show the setup screen to add one
    showApiKeySetup();
  }
});

// Model toggle handlers
function setGeminiMode() {
  if (!hasApiKey()) return;

  currentMode = 'gemini';
  geminiModeBtn.classList.add('active');
  localModeBtn.classList.remove('active');
  localModelStatus.style.display = 'none';
}

// Friendly names for model components
const ASSET_FRIENDLY: Record<string, { label: string; stepEl: HTMLDivElement }> = {
  'text_encoder/model.onnx': { label: 'Text Encoder', stepEl: stepEncoder },
  'unet/model.onnx': { label: 'Image Engine', stepEl: stepUnet },
  'vae_decoder/model.onnx': { label: 'Decoder', stepEl: stepVae },
};

// Speed tracking for download
let lastBytesDownloaded = 0;
let lastSpeedTime = 0;
let smoothedSpeed = 0; // bytes per second, smoothed

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1e6) return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1e3) return `${(bytesPerSec / 1e3).toFixed(0)} KB/s`;
  return '';
}

function formatEta(remainingBytes: number, bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '';
  const secs = remainingBytes / bytesPerSec;
  if (secs < 60) return `~${Math.ceil(secs)}s left`;
  if (secs < 3600) return `~${Math.ceil(secs / 60)}m left`;
  return `~${(secs / 3600).toFixed(1)}h left`;
}

// Check if model is already in browser cache
async function isModelCached(): Promise<boolean> {
  try {
    const cache = await caches.open('web-txt2img-v1');
    // Check for the smallest file (vae_decoder) as a proxy
    const resp = await cache.match('https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main/vae_decoder/model.onnx');
    return !!resp;
  } catch {
    return false;
  }
}

function setLocalMode() {
  if (!deviceSupportsLocal) return;

  currentMode = 'local';
  localModeBtn.classList.add('active');
  geminiModeBtn.classList.remove('active');
  localModelStatus.style.display = 'flex';

  if (localModelLoaded) {
    showModelReady();
  } else if (!localModelLoading) {
    // Auto-start loading
    startModelDownload();
  }
}

function showModelReady() {
  downloadCard.classList.add('ready');
  downloadCard.classList.remove('downloading');
  downloadTitle.textContent = 'On-device AI ready';
  downloadNote.textContent = 'cached locally';
  downloadSteps.style.display = 'none';
  downloadProgress.style.display = 'none';
  downloadStatus.textContent = 'Generate stickers without an internet connection';
  downloadStatus.classList.add('ready');
}

async function startModelDownload() {
  if (localModelLoaded || localModelLoading) return;

  // Check cache first for instant feedback
  const cached = await isModelCached();
  if (cached) {
    downloadTitle.textContent = 'Loading from cache';
    downloadNote.textContent = 'already downloaded';
    downloadStatus.textContent = 'Restoring model from browser cache...';
    downloadCard.classList.add('from-cache');
  } else {
    downloadTitle.textContent = 'Downloading AI model';
    downloadNote.textContent = 'one-time download, ~2.3 GB';
    downloadStatus.textContent = 'Starting download...';
  }

  downloadCard.classList.add('downloading');
  downloadProgress.style.display = 'block';
  downloadSteps.style.display = 'flex';
  progressFill.style.width = '0%';

  // Reset speed tracking
  lastBytesDownloaded = 0;
  lastSpeedTime = performance.now();
  smoothedSpeed = 0;

  let currentAsset = '';

  const success = await loadLocalModel((p: LoadProgress) => {
    const now = performance.now();

    // Update progress bar
    if (p.pct !== undefined) {
      progressFill.style.width = `${p.pct}%`;
    }

    // Update size counter
    if (p.bytesDownloaded !== undefined && p.totalBytesExpected) {
      downloadSize.textContent = `${formatBytes(p.bytesDownloaded)} / ${formatBytes(p.totalBytesExpected)}`;

      // Calculate speed (update every 500ms to avoid flicker)
      const timeDelta = now - lastSpeedTime;
      if (timeDelta > 500) {
        const bytesDelta = p.bytesDownloaded - lastBytesDownloaded;
        const instantSpeed = (bytesDelta / timeDelta) * 1000;
        // Exponential moving average
        smoothedSpeed = smoothedSpeed === 0 ? instantSpeed : smoothedSpeed * 0.7 + instantSpeed * 0.3;
        lastBytesDownloaded = p.bytesDownloaded;
        lastSpeedTime = now;

        if (smoothedSpeed > 0 && !cached) {
          const remaining = p.totalBytesExpected - p.bytesDownloaded;
          downloadSpeed.textContent = `${formatSpeed(smoothedSpeed)} · ${formatEta(remaining, smoothedSpeed)}`;
        }
      }
    }

    // Track asset changes and update step indicators
    if (p.asset && p.asset !== currentAsset) {
      // Mark previous asset as complete
      if (currentAsset) {
        const prev = ASSET_FRIENDLY[currentAsset];
        if (prev) {
          prev.stepEl.classList.remove('active');
          prev.stepEl.classList.add('complete');
        }
      }
      currentAsset = p.asset;

      // Mark current asset as active
      const curr = ASSET_FRIENDLY[currentAsset];
      if (curr) {
        curr.stepEl.classList.add('active');
        downloadStatus.textContent = cached
          ? `Loading ${curr.label}...`
          : `Downloading ${curr.label}...`;
      }
    }

    // Handle "ready" messages (asset completed)
    if (p.message?.includes('ready in')) {
      const curr = ASSET_FRIENDLY[currentAsset];
      if (curr) {
        curr.stepEl.classList.remove('active');
        curr.stepEl.classList.add('complete');
      }
    }
  });

  downloadCard.classList.remove('downloading');

  if (success) {
    // Mark all steps complete
    [stepEncoder, stepUnet, stepVae].forEach(s => {
      s.classList.remove('active');
      s.classList.add('complete');
    });
    progressFill.style.width = '100%';

    // Brief celebration before collapsing to ready state
    downloadStatus.textContent = 'Model loaded successfully!';
    downloadStatus.classList.add('ready');
    downloadCard.classList.add('celebrate');

    setTimeout(() => {
      downloadCard.classList.remove('celebrate', 'from-cache');
      showModelReady();
    }, cached ? 800 : 1500);
  } else {
    downloadCard.classList.remove('from-cache');
    downloadStatus.textContent = 'Download failed. Tap to retry.';
    downloadStatus.classList.add('error');
    downloadCard.classList.add('error');
    downloadCard.addEventListener('click', retryDownload, { once: true });
  }
}

function retryDownload() {
  downloadCard.classList.remove('error');
  downloadStatus.classList.remove('error');
  [stepEncoder, stepUnet, stepVae].forEach(s => {
    s.classList.remove('active', 'complete');
  });
  startModelDownload();
}

geminiModeBtn.addEventListener("click", () => {
  if (!geminiModeBtn.disabled) setGeminiMode();
});
localModeBtn.addEventListener("click", () => {
  if (!localModeBtn.disabled) setLocalMode();
});

// Load local model - now auto-triggered by setLocalMode()

// Show build timestamp (replaced at build time by Vite)
declare const __BUILD_TIME__: string;
if (buildInfo) {
  buildInfo.textContent = `Built: ${__BUILD_TIME__}`;
}

// Request microphone access and initialize recorder (called on first voice use)
async function initializeMicrophone(): Promise<boolean> {
  if (audioStream && isRecorderReady) {
    return true; // Already initialized
  }

  try {
    transcriptDiv.textContent = "Requesting microphone access...";
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await setupRecorder();
    return true;
  } catch (error) {
    console.error("Microphone access denied:", error);
    transcriptDiv.textContent =
      "Microphone access denied. Use the text input below instead, or enable microphone in settings.";
    return false;
  }
}

// Setup recorder with existing stream - called once on init and after each recording
async function setupRecorder(): Promise<void> {
  if (!audioStream) {
    console.error("No audio stream available");
    return;
  }

  try {
    audioChunks = [];
    mediaRecorder = new MediaRecorder(audioStream);
    isRecorderReady = true;

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      isRecorderReady = false;
      recordBtn.classList.remove("recording");
      recordBtn.classList.add("loading");
      recordBtn.textContent = "Imagining...";

      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const audioUrl = URL.createObjectURL(audioBlob);
      audioElement.src = audioUrl;

      transcriptDiv.textContent = "Transcribing...";
      const output = await transcriber(audioUrl);
      const text = Array.isArray(output) ? output[0].text : output.text;
      transcriptDiv.textContent = text;

      recordBtn.textContent = "Dreaming Up...";

      const abortWords = ["BLANK", "NO IMAGE", "NO STICKER", "CANCEL", "ABORT", "START OVER"];
      if (!text || abortWords.some((word) => text.toUpperCase().includes(word))) {
        transcriptDiv.textContent = "No image generated.";
        recordBtn.classList.remove("loading");
        recordBtn.textContent = "Cancelled";
        setTimeout(() => recordBtn.textContent = "Sticker Dream", 1000);
        // Re-setup recorder for next use
        await setupRecorder();
        return;
      }

      await generateImage(text);
      recordBtn.classList.remove("loading");
      recordBtn.textContent = "Sticker Dream";

      // Re-setup recorder for next use
      await setupRecorder();
    };
  } catch (error) {
    console.error("Failed to setup recorder:", error);
    isRecorderReady = false;
  }
}

// Initialize on load
initApp();

// Start recording when button is pressed down
recordBtn.addEventListener("pointerdown", async () => {
  // Initialize microphone on first use
  if (!isRecorderReady || !mediaRecorder) {
    const success = await initializeMicrophone();
    if (!success) {
      return;
    }
  }

  // Clear previous chunks and start immediately
  audioChunks = [];
  mediaRecorder!.start();
  recordBtn.classList.add("recording");
  recordBtn.textContent = "Listening...";

  recordingTimeout = window.setTimeout(() => {
    if (mediaRecorder?.state === "recording") {
      mediaRecorder.stop();
    }
  }, 15000);
});

// Stop recording when button is released
recordBtn.addEventListener("pointerup", () => {
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    // Stream cleanup happens in onstop handler
  }
});

// Also stop if pointer leaves the button while held
recordBtn.addEventListener("pointerleave", () => {
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    // Stream cleanup happens in onstop handler
  }
});

// Prevent context menu on long press
recordBtn.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// Text input generate button handler
async function handleTextGenerate() {
  const text = textInput.value.trim();
  if (!text) {
    textInput.focus();
    return;
  }

  // Disable inputs while generating
  generateBtn.disabled = true;
  textInput.disabled = true;
  recordBtn.style.display = "none";

  transcriptDiv.textContent = text;
  recordBtn.classList.add("loading");

  try {
    await generateImage(text);
  } finally {
    generateBtn.disabled = false;
    textInput.disabled = false;
    textInput.value = "";
    recordBtn.style.display = "block";
    recordBtn.classList.remove("loading");
  }
}

generateBtn.addEventListener("click", handleTextGenerate);

// Allow Enter key to generate
textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !generateBtn.disabled) {
    e.preventDefault();
    handleTextGenerate();
  }
});

// Generate image from transcript - routes to correct backend
async function generateImage(prompt: string) {
  if (!prompt || prompt === "Transcribing...") {
    console.error("No valid prompt to generate");
    return;
  }

  try {
    const startTime = performance.now();

    if (currentMode === 'local') {
      if (!localModelLoaded) {
        alert("Local model is still downloading. Please wait for it to finish.");
        return;
      }
      transcriptDiv.textContent = `${prompt}\n\nGenerating locally...`;
    } else {
      transcriptDiv.textContent = `${prompt}\n\nGenerating...`;
    }

    let imageUrl: string | null;

    if (currentMode === 'local') {
      imageUrl = await generateImageLocally(prompt, (e: GenerationProgressEvent) => {
        if (e.phase !== 'complete') {
          transcriptDiv.textContent = `${prompt}\n\n${e.phase}... ${e.pct ? Math.round(e.pct) + '%' : ''}`;
        }
      });
    } else {
      imageUrl = await generateImageWithGemini(prompt);
    }

    const elapsed = performance.now() - startTime;

    if (!imageUrl) {
      throw new Error("Failed to generate image");
    }

    // Store current image URL
    currentImageUrl = imageUrl;

    // Display the preview image
    imageDisplay.src = imageUrl;
    imageDisplay.style.display = "block";

    // Set up full page images
    fullpageImage.src = imageUrl;
    printFullpageImage.src = imageUrl;

    // Show template section with full page mode as default
    templateSection.style.display = "flex";
    setFullPageMode();

    // Hide record button when template is shown
    recordBtn.style.display = "none";

    // Show timing badge
    timingBadge.style.display = 'flex';
    timingSource.textContent = currentMode === 'local' ? 'Local SD-Turbo' : 'Gemini Cloud';
    timingMs.textContent = `${(elapsed / 1000).toFixed(1)}s`;

    transcriptDiv.textContent = prompt;
    console.log(`✅ Image generated via ${currentMode} in ${(elapsed / 1000).toFixed(1)}s`);
  } catch (error) {
    console.error("Error:", error);
    transcriptDiv.textContent = `${prompt}\n\nError: Failed to generate image`;
    alert(
      "Failed to generate image: " +
      (error instanceof Error ? error.message : "Unknown error")
    );
  }
}

// Template cell click handler - toggle image in cell
function toggleCell(cell: HTMLDivElement, printCell: HTMLDivElement) {
  if (!currentImageUrl) return;

  if (cell.classList.contains("filled")) {
    // Remove image
    cell.style.backgroundImage = "";
    cell.classList.remove("filled");
    printCell.style.backgroundImage = "";
  } else {
    // Add image
    cell.style.backgroundImage = `url(${currentImageUrl})`;
    cell.classList.add("filled");
    printCell.style.backgroundImage = `url(${currentImageUrl})`;
  }
}

// Add click handlers to template cells
templateCells.forEach((cell, index) => {
  cell.addEventListener("click", () => {
    toggleCell(cell, printCells[index]);
  });
});

// Fill all cells
fillAllBtn.addEventListener("click", () => {
  if (!currentImageUrl) return;

  templateCells.forEach((cell, index) => {
    cell.style.backgroundImage = `url(${currentImageUrl})`;
    cell.classList.add("filled");
    printCells[index].style.backgroundImage = `url(${currentImageUrl})`;
  });
});

// Clear all cells
clearAllBtn.addEventListener("click", () => {
  templateCells.forEach((cell, index) => {
    cell.style.backgroundImage = "";
    cell.classList.remove("filled");
    printCells[index].style.backgroundImage = "";
  });
});

// Print mode selection handlers
function setFullPageMode() {
  currentPrintMode = 'fullpage';
  fullPageModeBtn.classList.add('active');
  stickerModeBtn.classList.remove('active');
  fullpagePreview.style.display = 'flex';
  stickerPreview.style.display = 'none';

  // Update fullpage preview image
  if (currentImageUrl) {
    fullpageImage.src = currentImageUrl;
    printFullpageImage.src = currentImageUrl;
  }
}

function setStickerMode() {
  currentPrintMode = 'sticker';
  stickerModeBtn.classList.add('active');
  fullPageModeBtn.classList.remove('active');
  fullpagePreview.style.display = 'none';
  stickerPreview.style.display = 'flex';
}

fullPageModeBtn.addEventListener("click", setFullPageMode);
stickerModeBtn.addEventListener("click", setStickerMode);

// Print full page - using iOS-reliable canvas + print window approach
printFullPageBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  console.log('🖨️ Print full page clicked');

  if (!currentImageUrl) {
    alert('No image to print');
    return;
  }

  await printFullPageReliable(currentImageUrl);
});

// Print sticker template - using iOS-reliable canvas + print window approach
printTemplateBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  console.log('🖨️ Print sticker sheet clicked');

  if (!currentImageUrl) {
    alert('No image to print');
    return;
  }

  // Get filled cell indices
  const filledCells: number[] = [];
  templateCells.forEach((cell, index) => {
    if (cell.classList.contains('filled')) {
      filledCells.push(index);
    }
  });

  await printStickerSheetReliable(currentImageUrl, filledCells);
});

// New sticker - reset and go back to recording
newStickerBtn.addEventListener("click", () => {
  // Clear all cells
  templateCells.forEach((cell, index) => {
    cell.style.backgroundImage = "";
    cell.classList.remove("filled");
    printCells[index].style.backgroundImage = "";
  });

  // Clear fullpage images
  fullpageImage.src = "";
  printFullpageImage.src = "";

  // Hide template section
  templateSection.style.display = "none";

  // Hide preview image
  imageDisplay.style.display = "none";

  // Show record button
  recordBtn.style.display = "block";

  // Reset transcript
  transcriptDiv.textContent = "Press the button and imagine a sticker!";

  // Clear current image
  currentImageUrl = null;

  // Hide timing badge
  timingBadge.style.display = 'none';

  // Reset to fullpage mode for next time
  currentPrintMode = 'fullpage';
});
