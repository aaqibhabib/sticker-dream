import { pipeline } from "@huggingface/transformers";
import { GoogleGenAI } from "@google/genai";

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

// Image generation using Gemini Imagen
const imageGen4 = "imagen-4.0-generate-001";

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
const transcriptDiv = document.querySelector(".transcript") as HTMLDivElement;
const audioElement = document.querySelector("#audio") as HTMLAudioElement;
const imageDisplay = document.getElementById("generatedImage") as HTMLImageElement;

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

  // Prevent any navigation events from bubbling
  iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');

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

// Check if API key exists and show appropriate UI
function checkApiKeyAndShowUI(): void {
  const apiKey = getStoredApiKey();
  if (apiKey) {
    initializeAI(apiKey);
    apiKeySetup.style.display = "none";
    mainApp.style.display = "flex";
    checkMicrophoneAccess();
  } else {
    apiKeySetup.style.display = "block";
    mainApp.style.display = "none";
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
  checkApiKeyAndShowUI();
});

// Allow Enter key to save
apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    saveApiKeyBtn.click();
  }
});

// Settings button to change API key
settingsBtn.addEventListener("click", () => {
  if (confirm("Do you want to change your API key?")) {
    clearStoredApiKey();
    checkApiKeyAndShowUI();
  }
});

// Show build timestamp
const BUILD_TIME = "__BUILD_TIME__";
if (buildInfo) {
  buildInfo.textContent = `Built: ${BUILD_TIME}`;
}

// Check for microphone access and pre-initialize recorder for instant start
async function checkMicrophoneAccess() {
  try {
    // Get and KEEP the stream for instant recording
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Pre-initialize the recorder so it's ready to go
    await setupRecorder();

    // Show the record button
    recordBtn.style.display = "block";
    transcriptDiv.textContent = "Press the button and imagine a sticker!";
  } catch (error) {
    console.error("Microphone access denied:", error);
    transcriptDiv.textContent =
      "❌ Microphone access required. Please enable microphone permissions in your browser settings.";
    recordBtn.style.display = "none";
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
checkApiKeyAndShowUI();

// Start recording when button is pressed down
recordBtn.addEventListener("pointerdown", async () => {
  if (!isRecorderReady || !mediaRecorder) {
    console.error("MediaRecorder not ready");
    transcriptDiv.textContent = "Microphone not ready. Please wait...";
    return;
  }

  // Clear previous chunks and start immediately
  audioChunks = [];
  mediaRecorder.start();
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

// Generate image from transcript
async function generateImage(prompt: string) {
  if (!prompt || prompt === "Transcribing...") {
    console.error("No valid prompt to generate");
    return;
  }

  try {
    transcriptDiv.textContent = `${prompt}\n\nGenerating...`;

    const imageUrl = await generateImageWithGemini(prompt);

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

    transcriptDiv.textContent = prompt;
    console.log("✅ Image generated!");
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

  // Reset to fullpage mode for next time
  currentPrintMode = 'fullpage';
});
