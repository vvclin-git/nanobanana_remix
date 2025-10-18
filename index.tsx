/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GoogleGenAI, Modality, Type} from '@google/genai';

// --- DOM Element Selection ---
const statusEl = document.querySelector('#status') as HTMLParagraphElement;
const generateButton = document.querySelector(
  '#generate-button',
) as HTMLButtonElement;
const regenerateButton = document.querySelector(
  '#regenerate-button',
) as HTMLButtonElement;
const outputImage = document.querySelector('#output-image') as HTMLImageElement;
const sourceImage = document.querySelector('#source-image') as HTMLImageElement;
const clothingImage = document.querySelector(
  '#clothing-image',
) as HTMLImageElement;
const loader = document.querySelector('#loader') as HTMLDivElement;
const downloadButton = document.querySelector(
  '#download-button',
) as HTMLAnchorElement;
const promptControlsEl = document.querySelector(
  '#prompt-controls',
) as HTMLDivElement;
const promptInputEl = document.querySelector(
  '#prompt-input',
) as HTMLTextAreaElement;
const mainView = document.querySelector('#main-view') as HTMLDivElement;
const assetsView = document.querySelector('#assets-view') as HTMLDivElement;
const viewAssetsButton = document.querySelector(
  '#view-assets-button',
) as HTMLButtonElement;
const backButton = document.querySelector('#back-button') as HTMLButtonElement;

// New selectors for tabbed UI
const categoryTabs = document.querySelectorAll<HTMLButtonElement>('.category-tab');
const sharedOptionsContainer = document.querySelector('#options-container-shared') as HTMLDivElement;

// New selectors for API Key UI
const apiKeyInput = document.querySelector('#api-key-input') as HTMLInputElement;
const validateKeyButton = document.querySelector('#validate-key-button') as HTMLButtonElement;
const apiKeyStatus = document.querySelector('#api-key-status') as HTMLParagraphElement;


// --- State Variables ---
let selectedPose: string | null = null;
let selectedScene: string | null = null;
let selectedMood: string | null = null;
let selectedArtStyle: string | null = null;
let sourceImageBase64: string | null = null;
let clothingImageBase64: string | null = null;
let activeCategory: string | null = null;
let allOptions: Record<string, string[]> = {};
let lastGenerationTime = 0;
const API_CALL_COOLDOWN_MS = 10000; // 10 seconds
let isApiKeyValid = false;

// --- Utility Functions ---
async function fileUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Generates a descriptive filename for the downloaded image.
 */
function generateFilename(fromPrompt?: string): string {
  const now = new Date();
  const datePart = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const sanitize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, '') // remove special chars except space
      .trim()
      .replace(/\s+/g, '-'); // replace spaces with dashes

  if (fromPrompt) {
    // Use the first few words of the prompt for the filename
    const promptPart = sanitize(fromPrompt.split(/\s+/).slice(0, 5).join(' '));
    return `${datePart}_${promptPart}.png`;
  }

  const parts = [
    datePart,
    sanitize(selectedPose || ''),
    sanitize(selectedScene || ''),
    sanitize(selectedMood || ''),
    sanitize(selectedArtStyle || ''),
  ].filter(Boolean);

  if (parts.length > 1) {
    return `${parts.join('_')}.png`;
  }

  // Fallback
  return `${datePart}_character-remix.png`;
}

// --- Main Functions ---

/**
 * Validates the API key by making a lightweight call.
 */
async function validateApiKey(apiKey: string): Promise<boolean> {
    if (!apiKey) return false;
    apiKeyStatus.textContent = 'Checking...';
    apiKeyStatus.className = 'text-sm text-gray-500';
    try {
        const ai = new GoogleGenAI({ apiKey });
        await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'hello' });
        apiKeyStatus.textContent = '✅ Valid';
        apiKeyStatus.className = 'text-sm text-green-400';
        localStorage.setItem('gemini-api-key', apiKey);
        isApiKeyValid = true;
        setControlsDisabled(false); // Enable controls on valid key
        statusEl.innerText = 'API key is valid. Ready to generate!';
        return true;
    } catch (e) {
        console.error('API Key validation failed', e);
        apiKeyStatus.textContent = '❌ Invalid';
        apiKeyStatus.className = 'text-sm text-red-400';
        localStorage.removeItem('gemini-api-key');
        isApiKeyValid = false;
        setControlsDisabled(true); // Keep controls disabled
        statusEl.innerText = '';
        return false;
    }
}

/**
 * Calls Gemini to generate creative options for poses, scenes, and moods.
 */
async function generateOptions(apiKey: string) {
  const ai = new GoogleGenAI({apiKey});
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents:
      "Generate creative options for a cartoon character. Return a JSON object with three arrays of strings: 'poses', 'scenes', and 'moods'. Each array must contain exactly 3 unique options. The 'moods' array options must be single words that are positive, cheerful, or happy.",
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          poses: {type: Type.ARRAY, items: {type: Type.STRING}},
          scenes: {type: Type.ARRAY, items: {type: Type.STRING}},
          moods: {type: Type.ARRAY, items: {type: Type.STRING}},
        },
      },
    },
  });

  const jsonText = response.text.trim();
  return JSON.parse(jsonText);
}

/**
 * Renders the options for a given category into the shared container.
 */
function renderOptionsForCategory(category: string) {
  sharedOptionsContainer.innerHTML = '';
  const options = allOptions[category] || [];

  // Determine which state variable is currently selected for this category
  let currentlySelectedValue: string | null = null;
  if (category === 'poses') currentlySelectedValue = selectedPose;
  if (category === 'scenes') currentlySelectedValue = selectedScene;
  if (category === 'moods') currentlySelectedValue = selectedMood;
  if (category === 'artstyle') currentlySelectedValue = selectedArtStyle;

  for (const option of options) {
    const button = document.createElement('button');
    button.textContent = option;
    button.className = 'option-button';

    if (option === currentlySelectedValue) {
      button.classList.add('selected');
    }

    button.onclick = () => {
      // Update state variable
      if (category === 'poses') selectedPose = option;
      if (category === 'scenes') selectedScene = option;
      if (category === 'moods') selectedMood = option;
      if (category === 'artstyle') selectedArtStyle = option;

      // Update UI for option buttons within the container
      const siblings = sharedOptionsContainer.querySelectorAll('.option-button');
      siblings.forEach(sib => sib.classList.remove('selected'));
      button.classList.add('selected');
    };
    sharedOptionsContainer.appendChild(button);
  }
}


/**
 * Generates an image based on the source image and a prompt.
 */
async function generateImage(apiKey: string, prompt: string, filename: string): Promise<void> {
  if (!sourceImageBase64 || !clothingImageBase64) {
    throw new Error('Source images have not been loaded.');
  }

  const ai = new GoogleGenAI({apiKey});

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: sourceImageBase64,
            mimeType: 'image/png', // Assuming source is PNG
          },
        },
        {
          inlineData: {
            data: clothingImageBase64,
            mimeType: 'image/png', // Assuming clothing is PNG
          },
        },
        {text: prompt},
      ],
    },
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const base64ImageBytes = part.inlineData.data;
      const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
      outputImage.src = imageUrl;
      outputImage.style.display = 'block';
      downloadButton.href = imageUrl;
      downloadButton.download = filename;
      downloadButton.classList.remove('hidden');
      return;
    }
  }

  throw new Error('No image was generated. The prompt may have been blocked.');
}

/**
 * Randomly selects one option from each category in the background.
 */
function preselectRandomOptions() {
  if (allOptions.poses?.length) {
    selectedPose = allOptions.poses[Math.floor(Math.random() * allOptions.poses.length)];
  }
  if (allOptions.scenes?.length) {
    selectedScene = allOptions.scenes[Math.floor(Math.random() * allOptions.scenes.length)];
  }
  if (allOptions.moods?.length) {
    selectedMood = allOptions.moods[Math.floor(Math.random() * allOptions.moods.length)];
  }
  if (allOptions.artstyle?.length) {
    selectedArtStyle = allOptions.artstyle[Math.floor(Math.random() * allOptions.artstyle.length)];
  }
}

// --- UI Functions ---
function showStatusError(message: string) {
  statusEl.innerHTML = `<span class="text-red-400">${message}</span>`;
}

function setControlsDisabled(disabled: boolean) {
  // Always keep API key controls enabled
  apiKeyInput.disabled = false;
  validateKeyButton.disabled = false;
    
  // Toggle main app controls
  generateButton.disabled = disabled;
  regenerateButton.disabled = disabled;
  document
    .querySelectorAll('.option-button, .category-tab')
    .forEach(button => ((button as HTMLButtonElement).disabled = disabled));
}

async function initializeApp() {
  setControlsDisabled(true);
  statusEl.innerText = 'Please add your Gemini API key to begin.';

  try {
    // Load local assets first, they don't depend on the API key
    const characterImagePromise = fileUrlToBase64('character.png');
    const clothingImagePromise = fileUrlToBase64('clothing.png');

    const [characterBase64, clothingBase64] = await Promise.all([
      characterImagePromise,
      clothingImagePromise,
    ]);

    // Set state and update image elements
    sourceImageBase64 = characterBase64;
    sourceImage.src = `data:image/png;base64,${sourceImageBase64}`;
    clothingImageBase64 = clothingBase64;
    clothingImage.src = `data:image/png;base64,${clothingImageBase64}`;
    
    // Load API key from localStorage if it exists
    const savedApiKey = localStorage.getItem('gemini-api-key');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
        await validateApiKey(savedApiKey); // Auto-validate on load
    }
  } catch (e) {
    console.error('Initialization failed:', e);
    const errorMessage =
      e instanceof Error ? e.message : 'An unknown error occurred.';
    if (
      errorMessage.includes('404') ||
      errorMessage.includes('Failed to fetch image')
    ) {
      showStatusError(
        "Error: Could not load 'character.png' or 'clothing.png'. Please make sure both are uploaded.",
      );
    } else {
      showStatusError(`Error during asset loading: ${errorMessage}`);
    }
  }
}

async function loadCreativeOptions() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey || !isApiKeyValid) {
        showStatusError('Please validate your API key to load creative options.');
        return;
    }
    
    setControlsDisabled(true);
    statusEl.innerText = 'Loading creative options...';

    try {
        const options = await generateOptions(apiKey);
        // Store all options in the state object
        allOptions.poses = options.poses;
        allOptions.scenes = options.scenes;
        allOptions.moods = options.moods;
        allOptions.artstyle = ["Photorealistic", "Cartoon", "Illustration"];

        // Pre-select options in the background without updating UI yet
        preselectRandomOptions();
        statusEl.innerText = 'Ready to generate!';
    } catch (e) {
        console.error('Failed to generate options:', e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        showStatusError(`Error loading options: ${errorMessage}`);
    } finally {
        setControlsDisabled(false);
    }
}


async function performGeneration(prompt: string, filename: string) {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey || !isApiKeyValid) {
    showStatusError('Please enter and validate a valid API key first.');
    return;
  }
  
  const now = Date.now();
  if (now - lastGenerationTime < API_CALL_COOLDOWN_MS) {
    const timeLeft = Math.ceil((API_CALL_COOLDOWN_MS - (now - lastGenerationTime)) / 1000);
    showStatusError(`Please wait ${timeLeft} seconds before generating again.`);
    return;
  }
  lastGenerationTime = now;

  statusEl.innerText = 'Generating image...';
  outputImage.style.display = 'none';
  downloadButton.classList.add('hidden');
  loader.classList.remove('hidden');
  setControlsDisabled(true);

  try {
    await generateImage(apiKey, prompt, filename);
    statusEl.innerText = ''; // Clear status on success
    promptInputEl.value = prompt; // Populate textarea with the prompt used
    promptControlsEl.classList.remove('hidden'); // Make textarea and re-gen button visible
  } catch (e) {
    console.error('Image generation failed:', e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';

    let userFriendlyMessage = `Error: ${errorMessage}`;

    if (typeof errorMessage === 'string') {
      if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('permission denied')) {
        userFriendlyMessage = 'The API key became invalid. Please check and re-validate it.';
        // Invalidate the key state
        isApiKeyValid = false;
        apiKeyStatus.textContent = '❌ Invalid';
        apiKeyStatus.className = 'text-sm text-red-400';
      } else if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('429')) {
         userFriendlyMessage = `You've exceeded your usage quota. This can happen on the free tier even with low usage. <br> Please <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" class="text-blue-400 hover:underline font-semibold">enable billing</a> on your Google Cloud project to continue.`;
      }
    }
    showStatusError(userFriendlyMessage);
  } finally {
    loader.classList.add('hidden');
    // Re-enable controls, but check if the key is still considered valid
    setControlsDisabled(!isApiKeyValid);
  }
}

async function handleGenerateNewClick() {
  // Lazy-load options if they haven't been loaded yet
  if (!allOptions.poses) {
      await loadCreativeOptions();
      // If loading fails, allOptions will still be empty, so we exit.
      if (!allOptions.poses) return;
  }

  if (!selectedPose || !selectedScene || !selectedMood || !selectedArtStyle) {
    showStatusError('Please select an option from each category.');
    return;
  }
  
  let prompt = `A cartoon character wearing the provided clothing, ${selectedPose}, in a ${selectedScene}, in a ${selectedMood} mood, in the style of ${selectedArtStyle}.`;

  // Add special instruction for laughing expressions
  if (
    selectedMood.toLowerCase().includes('laugh') ||
    selectedPose.toLowerCase().includes('laugh')
  ) {
    prompt +=
      " The character's mouth is closed, with their eyes crinkling to show laughter.";
  }

  const filename = generateFilename();
  await performGeneration(prompt, filename);
}

async function handleRegenerateClick() {
  const prompt = promptInputEl.value.trim();
  if (!prompt) {
    showStatusError('Please enter a prompt in the text field to re-generate.');
    return;
  }
  const filename = generateFilename(prompt);
  await performGeneration(prompt, filename);
}

function handleCategoryTabClick(event: MouseEvent) {
  // If options haven't been loaded, load them first.
  if (!allOptions.poses) {
      loadCreativeOptions();
      // Prevent tab from opening until options are loaded.
      return; 
  }

  const clickedButton = event.currentTarget as HTMLButtonElement;
  const category = clickedButton.dataset.category!;
  const isClosing = activeCategory === category;

  if (isClosing) {
    // If the active tab is clicked again, close the options tray.
    sharedOptionsContainer.style.display = 'none';
    clickedButton.classList.remove('selected');
    activeCategory = null;
  } else {
    // If a new tab is clicked, or switching tabs.
    // First, deselect any currently active tab.
    categoryTabs.forEach(tab => tab.classList.remove('selected'));

    // Then, select the new tab and show its options.
    clickedButton.classList.add('selected');
    activeCategory = category;
    renderOptionsForCategory(category);
    sharedOptionsContainer.style.display = 'flex';
  }
}


// --- Event Listeners & Initialization ---
generateButton.addEventListener('click', handleGenerateNewClick);
regenerateButton.addEventListener('click', handleRegenerateClick);

validateKeyButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    validateApiKey(apiKey);
});

apiKeyInput.addEventListener('input', () => {
    // When user types, reset status if it was valid
    if (isApiKeyValid) {
        isApiKeyValid = false;
        apiKeyStatus.textContent = 'Unchecked';
        apiKeyStatus.className = 'text-sm text-gray-500';
        setControlsDisabled(true); // Disable controls until re-validated
    }
});

viewAssetsButton.addEventListener('click', () => {
  mainView.classList.add('hidden');
  assetsView.classList.remove('hidden');
});

backButton.addEventListener('click', () => {
  assetsView.classList.add('hidden');
  mainView.classList.remove('hidden');
});

categoryTabs.forEach(tab => tab.addEventListener('click', handleCategoryTabClick));

initializeApp();