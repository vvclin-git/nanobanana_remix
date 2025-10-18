/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GoogleGenAI, Modality, Type} from '@google/genai';

// Fix: Define and use AIStudio interface for window.aistudio to resolve type conflict.
// Define the aistudio property on the window object for TypeScript
declare global {
  interface AIStudio {
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

async function openApiKeyDialog() {
  if (window.aistudio?.openSelectKey) {
    await window.aistudio.openSelectKey();
  } else {
    // This provides a fallback for environments where the dialog isn't available
    showStatusError(
      'API key selection is not available. Please configure the API_KEY environment variable.',
    );
  }
}

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

// --- Main Functions ---

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
async function generateImage(apiKey: string, prompt: string): Promise<void> {
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
      downloadButton.download = 'character-remix.png';
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
  generateButton.disabled = disabled;
  regenerateButton.disabled = disabled;
  document
    .querySelectorAll('.option-button, .category-tab')
    .forEach(button => ((button as HTMLButtonElement).disabled = disabled));
}

async function initializeApp() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    showStatusError('API key not configured. Please add your API key.');
    await openApiKeyDialog();
    return;
  }

  setControlsDisabled(true);
  statusEl.innerText = 'Loading creative options...';

  try {
    // Load images and generate creative options in parallel
    const optionsPromise = generateOptions(apiKey);
    const characterImagePromise = fileUrlToBase64('character.png');
    const clothingImagePromise = fileUrlToBase64('clothing.png');

    const [options, characterBase64, clothingBase64] = await Promise.all([
      optionsPromise,
      characterImagePromise,
      clothingImagePromise,
    ]);

    // Set state and update image elements
    sourceImageBase64 = characterBase64;
    sourceImage.src = `data:image/png;base64,${sourceImageBase64}`;
    clothingImageBase64 = clothingBase64;
    clothingImage.src = `data:image/png;base64,${clothingImageBase64}`;

    // Store all options in the state object
    allOptions.poses = options.poses;
    allOptions.scenes = options.scenes;
    allOptions.moods = options.moods;
    allOptions.artstyle = ["Photorealistic", "Cartoon", "Illustration"];

    // Pre-select options in the background without updating UI yet
    preselectRandomOptions();
    statusEl.innerText = '';
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
      showStatusError(`Error during setup: ${errorMessage}`);
    }
  } finally {
    setControlsDisabled(false);
  }
}

async function performGeneration(prompt: string) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    showStatusError('API key not configured. Please add your API key.');
    await openApiKeyDialog();
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
    await generateImage(apiKey, prompt);
    statusEl.innerText = ''; // Clear status on success
    promptInputEl.value = prompt; // Populate textarea with the prompt used
    promptControlsEl.classList.remove('hidden'); // Make textarea and re-gen button visible
  } catch (e) {
    console.error('Image generation failed:', e);
    const errorMessage =
      e instanceof Error ? e.message : 'An unknown error occurred.';

    let userFriendlyMessage = `Error: ${errorMessage}`;
    let shouldOpenDialog = false;

    if (typeof errorMessage === 'string') {
      if (errorMessage.includes('Requested entity was not found.')) {
        userFriendlyMessage =
          'Model not found. This can be caused by an invalid API key or permission issues. Please check your API key.';
        shouldOpenDialog = true;
      } else if (
        errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('API key not valid') ||
        errorMessage.toLowerCase().includes('permission denied')
      ) {
        userFriendlyMessage =
          'Your API key is invalid. Please add a valid API key.';
        shouldOpenDialog = true;
      }
    }

    showStatusError(userFriendlyMessage);

    if (shouldOpenDialog) {
      await openApiKeyDialog();
    }
  } finally {
    loader.classList.add('hidden');
    setControlsDisabled(false);
  }
}

async function handleGenerateNewClick() {
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

  await performGeneration(prompt);
}

async function handleRegenerateClick() {
  const prompt = promptInputEl.value.trim();
  if (!prompt) {
    showStatusError('Please enter a prompt in the text field to re-generate.');
    return;
  }
  await performGeneration(prompt);
}

function handleCategoryTabClick(event: MouseEvent) {
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