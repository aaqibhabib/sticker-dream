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
const refreshBtn = document.getElementById("refreshBtn") as HTMLButtonElement;
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
let audioChunks: Blob[] = [];
let recordingTimeout: number | null = null;

// Current generated image URL
let currentImageUrl: string | null = null;

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

// Refresh button - reload page
refreshBtn.addEventListener("click", () => {
  window.location.reload();
});

// Check for microphone access before showing the button
async function checkMicrophoneAccess() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the stream immediately, we just needed to check permission
    stream.getTracks().forEach((track) => track.stop());

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

async function initializeRecorder(): Promise<void> {
  try {
    audioChunks = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      // Clean up stream immediately
      if (mediaRecorder?.stream) {
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      }

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
        mediaRecorder = null;
        return;
      }

      await generateImage(text);
      recordBtn.classList.remove("loading");
      recordBtn.textContent = "Sticker Dream";
      mediaRecorder = null; // Clear recorder reference
    };
  } catch (error) {
    console.error("Failed to initialize recorder:", error);
    transcriptDiv.textContent = "❌ Microphone access failed.";
    recordBtn.classList.remove("recording");
    recordBtn.textContent = "Sticker Dream";
  }
}

// Initialize on load
checkApiKeyAndShowUI();

// Start recording when button is pressed down
recordBtn.addEventListener("pointerdown", async () => {
  await initializeRecorder(); // Create stream when button pressed

  if (!mediaRecorder) {
    console.error("MediaRecorder not initialized");
    return;
  }

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

// Print full page
printFullPageBtn.addEventListener("click", async () => {
  console.log('🖨️ Print full page clicked');

  // Hide sticker template, show fullpage template
  printTemplate.style.display = 'none';
  printFullpage.style.display = 'block';

  // Ensure image is fully loaded before printing (critical for iOS/Safari)
  if (printFullpageImage.src && !printFullpageImage.complete) {
    console.log('⏳ Waiting for image to load...');
    await new Promise(resolve => {
      printFullpageImage.onload = resolve;
    });
  }

  console.log('✅ Image loaded, src:', printFullpageImage.src);

  // Wait for DOM update
  await new Promise(resolve => setTimeout(resolve, 200));

  console.log('🖨️ Opening print dialog...');
  window.print();

  // Clean up after print dialog closes
  setTimeout(() => {
    printTemplate.style.display = 'none';
    printFullpage.style.display = 'none';
  }, 1000);
});

// Print sticker template
printTemplateBtn.addEventListener("click", async () => {
  console.log('🖨️ Print sticker sheet clicked');

  // Hide fullpage template, show sticker template
  printFullpage.style.display = 'none';
  printTemplate.style.display = 'block';

  // Wait for DOM update
  await new Promise(resolve => setTimeout(resolve, 200));

  console.log('🖨️ Opening print dialog...');
  window.print();

  // Clean up after print dialog closes
  setTimeout(() => {
    printTemplate.style.display = 'none';
    printFullpage.style.display = 'none';
  }, 1000);
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
