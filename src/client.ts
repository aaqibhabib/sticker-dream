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
    prompt: `A black and white kids coloring page.
    <image-description>
    ${prompt}
    </image-description>
    ${prompt}`,
    config: {
      numberOfImages: 1,
      aspectRatio: "9:16",
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
const recordBtn = document.querySelector(".record") as HTMLButtonElement;
const transcriptDiv = document.querySelector(".transcript") as HTMLDivElement;
const audioElement = document.querySelector("#audio") as HTMLAudioElement;
const imageDisplay = document.querySelector(
  ".image-display"
) as HTMLImageElement;
const printBtn = document.querySelector(".print-btn") as HTMLButtonElement;

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let recordingTimeout: number | null = null;

// Check if API key exists and show appropriate UI
function checkApiKeyAndShowUI(): void {
  const apiKey = getStoredApiKey();
  if (apiKey) {
    initializeAI(apiKey);
    apiKeySetup.style.display = "none";
    mainApp.style.display = "flex";
    checkMicrophoneAccess();
    resetRecorder();
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

async function resetRecorder() {
  audioChunks = [];
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => {
    console.log(`Data available`, event);
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    console.log(`Media recorder stopped`);
    // Remove recording class
    recordBtn.classList.remove("recording");
    recordBtn.classList.add("loading");
    recordBtn.textContent = "Imagining...";

    // Create audio blob and URL
    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    const audioUrl = URL.createObjectURL(audioBlob);
    audioElement.src = audioUrl;

    // Transcribe
    transcriptDiv.textContent = "Transcribing...";
    const output = await transcriber(audioUrl);
    const text = Array.isArray(output) ? output[0].text : output.text;
    transcriptDiv.textContent = text;

    console.log(output);
    recordBtn.textContent = "Dreaming Up...";

    const abortWords = ["BLANK", "NO IMAGE", "NO STICKER", "CANCEL", "ABORT", "START OVER"];
    if (!text || abortWords.some((word) => text.toUpperCase().includes(word))) {
      transcriptDiv.textContent = "No image generated.";
      recordBtn.classList.remove("loading");
      recordBtn.textContent = "Cancelled";
      setTimeout(() => {
        recordBtn.textContent = "Sticker Dream";
      }, 1000);
      resetRecorder();
      return;
    }

    // Generate the image
    await generateImage(text);

    // Stop loading state
    recordBtn.classList.remove("loading");
    recordBtn.textContent = "Sticker Dream";
    resetRecorder();
  };
}

// Initialize on load
checkApiKeyAndShowUI();

// Start recording when button is pressed down
recordBtn.addEventListener("pointerdown", async () => {
  // Reset audio chunks
  audioChunks = [];
  console.log(`Media recorder`, mediaRecorder);
  // Start recording
  mediaRecorder.start();
  console.log(`Media recorder started`);
  recordBtn.classList.add("recording");
  recordBtn.textContent = "Listening...";

  // Auto-stop after 15 seconds
  recordingTimeout = window.setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
  }, 15000);
});

// Stop recording when button is released
recordBtn.addEventListener("pointerup", () => {
  console.log(`Media recorder pointerup`);
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  }
});

// Also stop if pointer leaves the button while held
recordBtn.addEventListener("pointerleave", () => {
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
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

    // Display the image
    imageDisplay.src = imageUrl;
    imageDisplay.style.display = "block";

    // Show the print button
    printBtn.style.display = "block";

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

// Print the current image using native OS print dialog
function printImage() {
  window.print();
}

// Print button click handler
printBtn.addEventListener("click", printImage);
