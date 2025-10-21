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

const categoryTabs = document.querySelectorAll<HTMLButtonElement>('.category-tab');
const sharedOptionsContainer = document.querySelector('#options-container-shared') as HTMLDivElement;

// --- State Variables ---
let selectedPose: string | null = null;
let selectedScene: string | null = null;
let selectedMood: string | null = null;
let selectedArtStyle: string | null = null;
let sourceImageBase64: string | null = null;
let clothingImageBase64: string | null = null;
let systemPromptText: string = '';
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
async function generateOptions() {
  const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
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
    // Split the prompt to isolate the user-facing part after the separator
    const promptParts = fromPrompt.split('---');
    const userPrompt = promptParts[promptParts.length - 1] || fromPrompt;

    // Use the first few words of the user prompt for the filename
    const promptPart = sanitize(userPrompt.trim().split(/\s+/).slice(0, 5).join(' '));
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

/**
 * Generates an image based on the source image and a prompt.
 */
async function generateImage(prompt: string): Promise<void> {
  if (!sourceImageBase64 || !clothingImageBase64) {
    throw new Error('Source images have not been loaded.');
  }

  const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

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
      downloadButton.download = generateFilename();
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

function handleApiError(e: unknown) {
  console.error('API Error:', e);
  const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';

  let userFriendlyMessage = `Error: ${errorMessage}`;

  if (typeof errorMessage === 'string') {
    if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('permission denied') || errorMessage.includes('Requested entity was not found')) {
      userFriendlyMessage = 'The API key is invalid or not found. Please use the "Select API Key" button in the banner to provide a valid key.';
      // Keep controls disabled as no API calls can succeed
      setControlsDisabled(true); 
    } else if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('429')) {
       userFriendlyMessage = `You've exceeded your usage quota. This can happen on the free tier. <br> Please <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" class="text-blue-400 hover:underline font-semibold">enable billing</a> on your Google Cloud project.`;
    }
  }
  showStatusError(userFriendlyMessage);
}


async function initializeApp() {
  setControlsDisabled(true);
  statusEl.innerText = 'Initializing...';

  try {
    // Load local assets and system prompt
    const characterImagePromise = fileUrlToBase64('character.png');
    const clothingImagePromise = fileUrlToBase64('clothing.png');
    const systemPromptPromise = fetch('system_prompt.txt').then(res => {
        if (!res.ok) throw new Error(`Failed to fetch system_prompt.txt: ${res.statusText}`);
        return res.text();
    });

    const [characterBase64, clothingBase64, systemPrompt] = await Promise.all([
      characterImagePromise,
      clothingImagePromise,
      systemPromptPromise,
    ]);

    // Set state and update image elements
    sourceImageBase64 = characterBase64;
    sourceImage.src = `data:image/png;base64,${sourceImageBase64}`;
    clothingImageBase64 = clothingBase64;
    clothingImage.src = `data:image/png;base64,${clothingImageBase64}`;
    systemPromptText = systemPrompt;
    
    // Directly attempt to load creative options, assuming a key is present.
    await loadCreativeOptions();
    
  } catch (e) {
    // This catch is mainly for asset loading errors, as loadCreativeOptions has its own try/catch.
    console.error('Initialization failed:', e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    if (errorMessage.includes('Failed to fetch')) {
      showStatusError(
        "Error: Could not load a required asset file (character.png, clothing.png, or system_prompt.txt). Please make sure all files are uploaded.",
      );
    } else {
      showStatusError(`Error during asset loading: ${errorMessage}`);
    }
  }
}

async function loadCreativeOptions() {
    setControlsDisabled(true);
    statusEl.innerText = 'Loading creative options...';

    try {
        const options = await generateOptions();
        // Store all options in the state object
        allOptions.poses = options.poses;
        allOptions.scenes = options.scenes;
        allOptions.moods = options.moods;
        allOptions.artstyle = ["Photorealistic", "Cartoon", "Illustration"];

        // Pre-select options in the background without updating UI yet
        preselectRandomOptions();
        statusEl.innerText = 'Ready to generate!';
        setControlsDisabled(false);
    } catch (e) {
        handleApiError(e);
        // Ensure controls remain disabled if options fail to load.
        setControlsDisabled(true);
    }
}

async function performGeneration(fullPrompt: string, userPrompt: string) {
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
    await generateImage(fullPrompt);
    statusEl.innerText = ''; // Clear status on success
    promptInputEl.value = userPrompt; // Populate textarea with the user-facing prompt
    promptControlsEl.classList.remove('hidden'); // Make textarea and re-gen button visible
    setControlsDisabled(false); // Re-enable controls on success
  } catch (e) {
    handleApiError(e);
    // On failure, controls are not re-enabled.
  } finally {
    loader.classList.add('hidden');
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
  
  const variantsPrompt = `Redraw the character wearing the provided clothing, ${selectedPose}, in a ${selectedScene}, in a ${selectedMood} mood, in the style of ${selectedArtStyle}.`;
  
  // Combine the loaded system prompt with the dynamic variants prompt
  const finalPrompt = `${systemPromptText}\n\n---\n\n${variantsPrompt}`;

  await performGeneration(finalPrompt, variantsPrompt);
}

async function handleRegenerateClick() {
  const userPrompt = promptInputEl.value.trim();
  if (!userPrompt) {
    showStatusError('Please enter a prompt in the text field to re-generate.');
    return;
  }
  
  // Re-combine the user's edited prompt with the system prompt
  const fullPrompt = `${systemPromptText}\n\n---\n\n${userPrompt}`;
  await performGeneration(fullPrompt, userPrompt);
}

async function handleCategoryTabClick(event: MouseEvent) {
  const clickedButton = event.currentTarget as HTMLButtonElement;

  // If options haven't been loaded yet (e.g., due to an initial API error), 
  // try loading them again when the user interacts with the UI.
  if (!allOptions.poses) {
      await loadCreativeOptions();
      // If loading still fails, exit so the user isn't stuck.
      if (!allOptions.poses) return; 
  }

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

// Expose a function for the banner to call after API key selection
(window as any).loadCreativeOptionsForAistudio = loadCreativeOptions;

initializeApp();
