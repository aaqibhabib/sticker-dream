import { pipeline } from "@huggingface/transformers";
import { GoogleGenAI, SafetyFilterLevel } from "@google/genai";

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

// Current print mode: 'fullpage' or 'sticker'
let currentPrintMode: 'fullpage' | 'sticker' = 'fullpage';

let mediaRecorder: MediaRecorder | null = null;
let audioStream: MediaStream | null = null;
let audioChunks: Blob[] = [];
let recordingTimeout: number | null = null;
let isRecorderReady = false;

// Current generated image URL
let currentImageUrl: string | null = null;

// ========== PRINT / SHARE UTILITIES ==========

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function renderCanvas(
  imageUrl: string,
  width: number,
  height: number,
  fit: 'contain' | 'cover' = 'contain'
): Promise<HTMLCanvasElement> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  let drawWidth = width, drawHeight = height, offsetX = 0, offsetY = 0;
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
  return canvas;
}

async function createStickerSheetCanvas(
  imageUrl: string,
  filledCells: number[]
): Promise<HTMLCanvasElement> {
  const DPI = 150;
  const pageWidth = 8.5 * DPI;
  const pageHeight = 11 * DPI;

  // Avery 22877 measurements
  const topMargin = 0.618 * DPI;
  const leftMargin = 0.618 * DPI;
  const hPitch = 2.63 * DPI;
  const vPitch = 2.59 * DPI;
  const labelSize = 2 * DPI;

  const canvas = document.createElement('canvas');
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, pageWidth, pageHeight);

  const img = await loadImage(imageUrl);

  for (const cellIndex of filledCells) {
    const col = cellIndex % 3;
    const row = Math.floor(cellIndex / 3);
    const x = leftMargin + col * hPitch;
    const y = topMargin + row * vPitch;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x + labelSize / 2, y + labelSize / 2, labelSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, labelSize, labelSize);
    ctx.restore();
  }

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')), 'image/png');
  });
}

/**
 * Share via iOS/Android share sheet (includes Print option), or fall back to
 * downloading a PDF on desktop browsers that don't support file sharing.
 */
async function shareOrDownloadPdf(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  if (typeof navigator.canShare === 'function') {
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], `${filename}.png`, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Sticker Dream' });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Fall through to PDF on other errors
      }
    }
  }

  // Fallback: embed in a letter-sized PDF and download
  const { jsPDF } = await import('jspdf');
  const dataUrl = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
  pdf.addImage(dataUrl, 'PNG', 0, 0, 8.5, 11);
  pdf.save(`${filename}.pdf`);
}

async function printFullPageReliable(imageUrl: string): Promise<void> {
  console.log('🖨️ Preparing full page...');
  try {
    const canvas = await renderCanvas(imageUrl, 1275, 1650, 'contain');
    await shareOrDownloadPdf(canvas, 'sticker');
  } catch (error) {
    console.error('Export failed:', error);
    alert('Failed to prepare. Please try again.');
  }
}

async function printStickerSheetReliable(
  imageUrl: string,
  filledCells: number[]
): Promise<void> {
  console.log('🖨️ Preparing sticker sheet...');
  if (filledCells.length === 0) {
    alert('Please fill at least one cell before printing.');
    return;
  }
  try {
    const canvas = await createStickerSheetCanvas(imageUrl, filledCells);
    await shareOrDownloadPdf(canvas, 'sticker-sheet');
  } catch (error) {
    console.error('Export failed:', error);
    alert('Failed to prepare. Please try again.');
  }
}

// Check if API key exists and show appropriate UI
function checkApiKeyAndShowUI(): void {
  const apiKey = getStoredApiKey();
  if (apiKey) {
    initializeAI(apiKey);
    apiKeySetup.style.display = "none";
    mainApp.style.display = "flex";
    // Show record button - mic permission requested on first use
    recordBtn.style.display = "block";
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
checkApiKeyAndShowUI();

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

    // Set up full page preview
    fullpageImage.src = imageUrl;

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
