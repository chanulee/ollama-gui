let serverOnline = false;
let selectedImage = null;
let personas = JSON.parse(localStorage.getItem('personas')) || [
    {
        name: 'Default Assistant',
        model: 'mistral-nemo:latest',
        temperature: 0.7,
        systemPrompt: '',
        isDefault: true
    }
];

// Context management variables
let useFullContext = false;
let selectedContextMessages = [];
let conversationHistory = [];

// Auto-resize textarea
const textarea = document.getElementById('prompt');
textarea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    handlePromptInput();
});

// Temperature slider
const temperatureSlider = document.getElementById('temperature');
const temperatureValue = document.getElementById('temperatureValue');
temperatureSlider.addEventListener('input', function() {
    temperatureValue.textContent = this.value;
});

async function checkServerStatus() {
    const statusIndicator = document.getElementById('serverStatus');
    const statusText = document.getElementById('serverStatusText');
    const generateButton = document.getElementById('generate');

    try {
        const response = await fetch('http://localhost:11434/api/tags');
        if (response.ok) {
            statusIndicator.className = 'status-indicator status-online';
            statusText.textContent = 'Server Online';
            generateButton.disabled = false;
            serverOnline = true;
            return true;
        }
    } catch (error) {
        console.error('Server check failed:', error);
    }

    statusIndicator.className = 'status-indicator status-offline';
    statusText.textContent = 'Server Offline';
    generateButton.disabled = true;
    serverOnline = false;
    return false;
}

async function fetchModels() {
    const isOnline = await checkServerStatus();
    if (!isOnline) {
        handleOfflineState();
        return;
    }

    try {
        const response = await fetch('http://localhost:11434/api/tags');
        const data = await response.json();
        const models = data.models;

        // Populate modelList
        const modelList = document.getElementById('modelList');
        if (modelList) {
            modelList.innerHTML = models.map(model => 
                `<option value="${model.name}">${model.name}</option>`
            ).join('');
            modelList.addEventListener('change', function() {
                handleModelChange(this.options[this.selectedIndex]);
            });
        }

        // Populate personaList with optgroup
        const personaList = document.getElementById('personaList');
        if (personaList) {
            personaList.innerHTML = `
                <optgroup label="Models">
                    ${models.map(model => 
                        `<option value="${model.name}" data-is-default="true">${model.name}</option>`
                    ).join('')}
                </optgroup>
                <optgroup label="Personas">
                    ${personas.filter(p => !p.isDefault).map(p => 
                        `<option value="${p.name}">${p.name}</option>`
                    ).join('')}
                </optgroup>
            `;
            personaList.addEventListener('change', function() {
                handlePersonaChange(this.options[this.selectedIndex]);
            });
        }

        // Update model grid in settings modal
        const modelGrid = document.getElementById('modelGrid');
        if (modelGrid) {
            modelGrid.innerHTML = models.map(model => `
                <div class="model-card">
                    <h3>${model.name}</h3>
                    <div class="model-meta">
                        <div>Size: ${formatSize(model.size)}</div>
                        <div>Modified: ${formatDate(model.modified)}</div>
                    </div>
                </div>
            `).join('');
        }

        return models;
    } catch (error) {
        console.error('Error fetching models:', error);
        handleOfflineState();
        throw error;
    }
}

async function generateResponse() {
    if (!serverOnline) {
        alert('Server is offline. Please check your Ollama server.');
        return;
    }

    const promptInput = document.getElementById('prompt');
    const prompt = promptInput.value;
    const personaList = document.getElementById('personaList');
    const selectedOption = personaList.options[personaList.selectedIndex];
    const isDefault = selectedOption.getAttribute('data-is-default') === 'true';
    const selectedName = personaList.value;

    let selectedPersona;
    if (isDefault) {
        selectedPersona = {
            name: selectedName,
            model: selectedName,
            temperature: 0.7,
            systemPrompt: ''
        };
    } else {
        selectedPersona = personas.find(p => p.name === selectedName);
    }

    const button = document.getElementById('generate');
    const responseDiv = document.getElementById('response');

    if (!prompt) {
        alert('Please enter a prompt');
        return;
    }

    // Add user's prompt to the response area
    const userMessage = document.createElement('div');
    userMessage.className = 'message user-message';
    userMessage.textContent = prompt;
    responseDiv.appendChild(userMessage);

    // Create contextPrompt before adding the latest user message
    let contextMessages = [];

    if (useFullContext) {
        contextMessages = [...conversationHistory];
    } else if (selectedContextMessages.length > 0) {
        selectedContextMessages.forEach(index => {
            const userMsg = conversationHistory[index * 2];
            const assistantMsg = conversationHistory[index * 2 + 1];
            if (userMsg && assistantMsg) {
                contextMessages.push(userMsg);
                contextMessages.push(assistantMsg);
            }
        });
    }

    let contextPrompt = contextMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n');

    // Then, construct the full prompt
    const fullPrompt = (contextPrompt ? contextPrompt + '\n' : '') + 'user: ' + prompt + '\nassistant:';

    // Store the user message
    conversationHistory.push({ role: 'user', content: prompt });

    // Add system message
    const systemMessage = document.createElement('div');
    systemMessage.className = 'message system-message';
    systemMessage.textContent = 'Generating response...';
    responseDiv.appendChild(systemMessage);

    // Create a new div for the AI response
    const aiResponse = document.createElement('div');
    aiResponse.className = 'message ai-message';
    responseDiv.appendChild(aiResponse);

    // Clear input field and reset height
    promptInput.value = '';
    promptInput.style.height = 'auto';

    button.disabled = true;

    try {
        const requestBody = {
            model: selectedPersona.model,
            prompt: fullPrompt,
            temperature: selectedPersona.temperature,
            system: selectedPersona.systemPrompt
        };

        // Add image data if present
        if (selectedImage) {
            requestBody.images = [selectedImage];
        }

        console.log('Request body:', {
            ...requestBody,
            images: requestBody.images ? ['[base64 data]'] : undefined
        });

        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        let fullResponse = '';

        while (true) {
            const {value, done} = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const jsonResponse = JSON.parse(line);
                        if (jsonResponse.response) {
                            fullResponse += jsonResponse.response;
                            aiResponse.innerHTML = marked.parse(fullResponse);
                        }
                    } catch (e) {
                        console.error('Error parsing JSON:', e);
                    }
                }
            }
        }

        // After generation is complete
        systemMessage.textContent = 'Generation complete!';
        setTimeout(() => systemMessage.remove(), 1000);

        // Store the assistant's response
        conversationHistory.push({ role: 'assistant', content: fullResponse });

    } catch (error) {
        console.error('Error:', error);
        systemMessage.textContent = 'Error generating response: ' + error.message;
    } finally {
        button.disabled = false;
        // Clear the image after sending
        selectedImage = null;
        document.getElementById('imagePreview').innerHTML = '';
    }
}

// Enter key to submit
textarea.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.value.trim()) {
            generateResponse();
        }
    }
});

setInterval(checkServerStatus, 5000);
fetchModels();

// Theme initialization
function initTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Theme event listeners
document.getElementById('darkModeToggle').addEventListener('click', toggleTheme);
initTheme();

// Settings modal functions
function openSettingsModal() {
    document.getElementById('settingsModal').style.display = 'block';
    fetchModels(); // Refresh the model list when opening settings
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    const settingsModal = document.getElementById('settingsModal');
    const personaModal = document.getElementById('personaModal');
    
    if (event.target === settingsModal) {
        closeSettingsModal();
    }
    if (event.target === personaModal) {
        closePersonaModal();
    }
});

// Model management functions
function formatSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}

async function deleteModel(modelName) {
    if (!confirm(`Are you sure you want to delete ${modelName}?`)) {
        return;
    }

    try {
        const response = await fetch('http://localhost:11434/api/delete', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: modelName })
        });

        if (response.ok) {
            fetchModels();
        } else {
            throw new Error('Failed to delete model');
        }
    } catch (error) {
        console.error('Error deleting model:', error);
        alert('Error deleting model: ' + error.message);
    }
}

// Pull model functions
let currentPullController = null;

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

async function pullModel() {
    const modelNameInput = document.getElementById('modelName');
    const modelName = modelNameInput.value.trim();
    const pullButton = document.getElementById('pullButton');
    const pullProgress = document.getElementById('pullProgress');
    const progressFill = document.getElementById('progressFill');
    const pullStatus = document.getElementById('pullStatus');
    const cancelButton = document.getElementById('cancelPull');

    if (!modelName) {
        alert('Please enter a model name');
        return;
    }

    // Create new AbortController for this pull
    currentPullController = new AbortController();
    
    // Show cancel button and progress
    pullButton.disabled = true;
    cancelButton.style.display = 'inline-block';
    pullProgress.style.display = 'block';
    progressFill.style.width = '0%';
    pullStatus.textContent = 'Starting download...';

    try {
        const response = await fetch('http://localhost:11434/api/pull', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: modelName }),
            signal: currentPullController.signal
        });

        const reader = response.body.getReader();
        let receivedLength = 0;
        let totalLength = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    
                    if (data.total) {
                        totalLength = data.total;
                    }
                    
                    if (data.completed) {
                        receivedLength = data.completed;
                    }

                    // Update status message with detailed progress
                    if (totalLength > 0) {
                        const progress = (receivedLength / totalLength) * 100;
                        progressFill.style.width = `${progress}%`;
                        pullStatus.textContent = `${data.status || 'Downloading'} - ${formatBytes(receivedLength)} / ${formatBytes(totalLength)} (${progress.toFixed(1)}%)`;
                    }
                } catch (e) {
                    console.error('Error parsing JSON:', e);
                }
            }
        }

        pullStatus.textContent = 'Download completed!';
        progressFill.style.width = '100%';
        modelNameInput.value = '';
        await fetchModels();

    } catch (error) {
        if (error.name === 'AbortError') {
            pullStatus.textContent = 'Download cancelled';
            // Clean up downloaded model
            try {
                await fetch('http://localhost:11434/api/delete', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name: modelName })
                });
            } catch (deleteError) {
                console.error('Error cleaning up cancelled download:', deleteError);
            }
        } else {
            console.error('Error pulling model:', error);
            pullStatus.textContent = `Error: ${error.message}`;
        }
    } finally {
        pullButton.disabled = false;
        cancelButton.style.display = 'none';
        currentPullController = null;
        setTimeout(() => {
            pullProgress.style.display = 'none';
            pullStatus.textContent = '';
        }, 3000);
    }
}

// Cancel model pull
function cancelModelPull() {
    if (currentPullController) {
        currentPullController.abort();
    }
}

function setupImageUpload() {
    const imageUploadBtn = document.getElementById('imageUpload');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    imageUploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', handleImageUpload);
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            selectedImage = e.target.result.split(',')[1];
            displayImagePreview(e.target.result);
        };
        reader.readAsDataURL(file);
    }
}

function displayImagePreview(imageData) {
    const previewArea = document.getElementById('imagePreview');
    previewArea.innerHTML = '';

    const previewContainer = document.createElement('div');
    previewContainer.className = 'preview-container';

    const img = document.createElement('img');
    img.src = imageData;
    img.className = 'preview-image';

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-image';
    removeButton.innerHTML = '×';
    removeButton.onclick = () => {
        selectedImage = null;
        previewArea.innerHTML = '';
    };

    previewContainer.appendChild(img);
    previewContainer.appendChild(removeButton);
    previewArea.appendChild(previewContainer);
}

// Image upload initialization
setupImageUpload();

// Handle model selection changes
function handleModelChange() {
    const modelSelect = document.getElementById('modelList');
    const imageUploadBtn = document.getElementById('imageUpload');
    const imagePreview = document.getElementById('imagePreview');
    
    // Show image upload button only for llama3.2-vision model
    if (modelSelect.value === 'llama3.2-vision:latest') {
        imageUploadBtn.style.display = 'block';
    } else {
        // Hide button and clear any selected image for other models
        imageUploadBtn.style.display = 'none';
        selectedImage = null;
        imagePreview.innerHTML = '';
    }
}

// Create default personas from models
function createDefaultPersonaFromModel(model) {
    const modelName = typeof model === 'string' ? model : model.name;
    return {
        name: modelName,
        model: modelName,
        temperature: 0.7,
        systemPrompt: '',
        isDefault: true
    };
}

function handlePersonaChange(selectedOption) {
    if (!selectedOption) return;

    const isDefault = selectedOption.getAttribute('data-is-default') === 'true';
    const selectedName = selectedOption.value;

    // Update temperature if it's a persona
    if (!isDefault) {
        const persona = personas.find(p => p.name === selectedName);
        if (persona) {
            const temperatureSlider = document.getElementById('temperature');
            const temperatureValue = document.getElementById('temperatureValue');
            if (temperatureSlider && temperatureValue) {
                temperatureSlider.value = persona.temperature;
                temperatureValue.textContent = persona.temperature;
            }
        }
    }

    // Update image upload button visibility
    const imageUploadBtn = document.getElementById('imageUpload');
    if (imageUploadBtn) {
        imageUploadBtn.style.display = selectedName === 'llama3.2-vision:latest' ? 'block' : 'none';
    }
}

// Update controls row to include both models and personas
function updateControlsRow() {
    const controlsRow = document.querySelector('.controls-row');
    const modelSelect = document.getElementById('modelList');
    const models = Array.from(modelSelect?.options || []).map(option => ({
        name: option.value,
        displayName: option.text
    })).filter(model => model.name !== 'loading');

    // Create combined list of default model personas and user personas
    const defaultPersonas = models.map(createDefaultPersonaFromModel);
    const allPersonas = [
        ...defaultPersonas,
        ...personas.filter(p => !p.isDefault)  // Only include user-created personas
    ];

    // Update the persona select HTML
    const personaList = document.getElementById('personaList');
    if (personaList) {
        personaList.innerHTML = `
            <optgroup label="Models">
                ${defaultPersonas.map(p => 
                    `<option value="${p.name}" data-is-default="true">${p.name}</option>`
                ).join('')}
            </optgroup>
            <optgroup label="Personas">
                ${personas.filter(p => !p.isDefault).map(p => 
                    `<option value="${p.name}">${p.name}</option>`
                ).join('')}
            </optgroup>
        `;

        // Add event listener for persona changes
        personaList.addEventListener('change', function() {
            handlePersonaChange(this.options[this.selectedIndex]);
        });
    }

    // Trigger initial check for current selection
    if (personaList) {
        handlePersonaChange(personaList.options[personaList.selectedIndex]);
    }
}

// Open context selection modal
function openContextSelectionModal() {
    // Check if there's any conversation history
    if (conversationHistory.length === 0) {
        // If no history, disable the button and return early
        document.getElementById('selectContextButton').classList.remove('active');
        return;
    }

    // Toggle selection mode
    const isSelectionMode = document.querySelector('.context-checkbox') !== null;
    if (isSelectionMode) {
        // If already in selection mode, save and exit
        document.querySelectorAll('.context-checkbox').forEach(el => el.remove());
        document.querySelectorAll('.conversation-pair').forEach(el => {
            el.classList.remove('conversation-pair');
        });
        // Remove deselect all button
        const deselectBtn = document.querySelector('.deselect-all-button');
        if (deselectBtn) deselectBtn.remove();
        
        document.getElementById('selectContextButton').classList.toggle('active', selectedContextMessages.length > 0);
        return;
    }

    // Add deselect all button
    const controlsRow = document.querySelector('.controls-row');
    const deselectButton = document.createElement('button');
    deselectButton.className = 'deselect-all-button';
    deselectButton.innerHTML = '<span class="material-icons">remove</span>';
    deselectButton.title = "Deselect All";
    deselectButton.onclick = function() {
        document.querySelectorAll('.context-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        selectedContextMessages = [];
    };
    controlsRow.querySelector('.context-controls').appendChild(deselectButton);

    // Rest of the existing code for creating checkboxes and pairs...
    const messages = document.querySelectorAll('.message');
    let currentPair = null;
    let pairIndex = 0;

    messages.forEach((message, index) => {
        if (message.classList.contains('user-message')) {
            currentPair = document.createElement('div');
            currentPair.className = 'conversation-pair';
            message.parentNode.insertBefore(currentPair, message);
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'context-checkbox';
            checkbox.value = pairIndex;
            checkbox.checked = selectedContextMessages.includes(pairIndex);
            
            checkbox.addEventListener('change', function() {
                const pairIndex = parseInt(this.value);
                if (this.checked) {
                    if (!selectedContextMessages.includes(pairIndex)) {
                        selectedContextMessages.push(pairIndex);
                    }
                } else {
                    selectedContextMessages = selectedContextMessages.filter(i => i !== pairIndex);
                }
            });
            
            currentPair.appendChild(checkbox);
            currentPair.appendChild(message);
            
            const nextMessage = messages[index + 1];
            if (nextMessage && nextMessage.classList.contains('ai-message')) {
                currentPair.appendChild(nextMessage);
            }
            
            pairIndex++;
        }
    });

    document.getElementById('selectContextButton').classList.add('active');
}

// Persona management functions
function openPersonaModal() {
    const modal = document.getElementById('personaModal');
    modal.style.display = 'block';
    updatePersonaList();
}

function closePersonaModal() {
    document.getElementById('personaModal').style.display = 'none';
}

function updatePersonaList() {
    const personaGrid = document.getElementById('personaGrid');
    personaGrid.innerHTML = personas.map(persona => `
        <div class="persona-card">
            <h3>${persona.name}</h3>
            <div class="persona-meta">
                <span class="tag">Model: ${persona.model}</span>
                <span class="tag">Temp: ${persona.temperature}</span>
            </div>
            <div class="persona-system-prompt">
                ${persona.systemPrompt}
            </div>
            <div class="persona-actions">
                <button class="btn btn-primary" onclick="editPersona('${persona.name}')">Edit</button>
                <button class="btn btn-danger" onclick="deletePersona('${persona.name}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function addPersona(persona) {
    personas.push(persona);
    localStorage.setItem('personas', JSON.stringify(personas));
    updatePersonaList();
    updateControlsRow();
}

function deletePersona(name) {
    if (personas.length === 1) {
        alert('Cannot delete the last persona');
        return;
    }
    if (confirm(`Are you sure you want to delete ${name}?`)) {
        personas = personas.filter(p => p.name !== name);
        localStorage.setItem('personas', JSON.stringify(personas));
        updatePersonaList();
        updateControlsRow();
    }
}

function editPersona(name) {
    // Close the persona management modal first
    closePersonaModal();
    
    const persona = personas.find(p => p.name === name) || {
        name: '',
        model: 'mistral-nemo:latest',
        temperature: 0.7,
        systemPrompt: ''
    };

    document.getElementById('editPersonaName').value = persona.name;
    document.getElementById('editPersonaTemperature').value = persona.temperature;
    document.getElementById('editPersonaSystemPrompt').value = persona.systemPrompt;
    
    // Fetch and populate models
    fetchModels().then(() => {
        const modelSelect = document.getElementById('editPersonaModel');
        if (modelSelect && persona.model) {
            const option = modelSelect.querySelector(`option[value="${persona.model}"]`);
            if (option) option.selected = true;
        }
    });
    
    document.getElementById('editPersonaModal').style.display = 'block';
}

function savePersonaEdit() {
    const name = document.getElementById('editPersonaName').value;
    const model = document.getElementById('editPersonaModel').value;
    const temperature = parseFloat(document.getElementById('editPersonaTemperature').value);
    const systemPrompt = document.getElementById('editPersonaSystemPrompt').value;

    if (!name || !model || isNaN(temperature)) {
        alert('Please fill all fields correctly');
        return;
    }

    const index = personas.findIndex(p => p.name === name);
    if (index >= 0) {
        personas[index] = { name, model, temperature, systemPrompt };
    } else {
        personas.push({ name, model, temperature, systemPrompt });
    }

    localStorage.setItem('personas', JSON.stringify(personas));
    updatePersonaList();
    updateControlsRow();
    document.getElementById('editPersonaModal').style.display = 'none';
}

// Initialize UI
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize UI elements
        await initializeUI();

        // Fetch and populate models and personas
        await fetchModels();

        // Handle URL parameters after populating dropdowns
        await initializeFromURL();

        // Set up event listeners
        const textarea = document.getElementById('prompt');
        if (textarea) {
            textarea.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 200) + 'px';
                handlePromptInput();
            });
            textarea.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (this.value.trim()) {
                        generateResponse();
                    }
                }
            });
        }

        // Start periodic server status check
        setInterval(checkServerStatus, 5000);

    } catch (error) {
        console.error('Failed to initialize UI:', error);
        const statusText = document.getElementById('serverStatusText');
        if (statusText) {
            statusText.textContent = 'Failed to initialize. Please refresh the page.';
        }
    }
});

// Function to initialize UI elements
async function initializeUI() {
    // Add event listeners for persona management
    const personaButton = document.getElementById('personaButton');
    if (personaButton) {
        personaButton.addEventListener('click', openPersonaModal);
    }

    // Add settings button click handler
    const settingsButton = document.getElementById('settingsButton');
    if (settingsButton) {
        settingsButton.addEventListener('click', openSettingsModal);
    }

    // Add close button handlers
    document.querySelectorAll('.close-button').forEach(button => {
        button.addEventListener('click', e => {
            e.target.closest('.modal').style.display = 'none';
        });
    });

    // Set initial image upload button visibility
    const imageUploadBtn = document.getElementById('imageUpload');
    const personaList = document.getElementById('personaList');
    if (imageUploadBtn && personaList) {
        const selectedName = personaList.value;
        imageUploadBtn.style.display = selectedName === 'llama3.2-vision:latest' ? 'block' : 'none';
    }

    // Add context button event listeners
    const fullContextButton = document.getElementById('fullContextButton');
    if (fullContextButton) {
        fullContextButton.addEventListener('click', function() {
            useFullContext = !useFullContext;
            this.classList.toggle('active', useFullContext);
            if (useFullContext) {
                selectedContextMessages = [];
                document.getElementById('selectContextButton').classList.remove('active');
            }
        });
    }

    const selectContextButton = document.getElementById('selectContextButton');
    if (selectContextButton) {
        selectContextButton.addEventListener('click', function() {
            const isActive = this.classList.contains('active');
            if (!isActive) {
                openContextSelectionModal();
                useFullContext = false;
                fullContextButton.classList.remove('active');
            } else {
                // If already active, deactivate and clean up
                document.querySelectorAll('.context-checkbox').forEach(el => el.remove());
                document.querySelectorAll('.conversation-pair').forEach(el => {
                    el.classList.remove('conversation-pair');
                });
                selectedContextMessages = [];
            }
            this.classList.toggle('active');
        });
    }

    const clearConversationButton = document.getElementById('clearConversationButton');
    if (clearConversationButton) {
        clearConversationButton.addEventListener('click', clearConversation);
    }
}

// Function to initialize selections based on URL parameters
async function initializeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const modelFromURL = urlParams.get('model');
    const personaFromURL = urlParams.get('persona');

    const personaList = document.getElementById('personaList');
    if (!personaList) return;

    if (personaFromURL) {
        // Find and select the persona option
        const personaOption = Array.from(personaList.options).find(opt => 
            opt.value === personaFromURL && !opt.getAttribute('data-is-default')
        );
        if (personaOption) {
            personaOption.selected = true;
            handlePersonaChange(personaOption);
        }
    } else if (modelFromURL) {
        // Find and select the model option
        const modelOption = Array.from(personaList.options).find(opt => 
            opt.value === modelFromURL && opt.getAttribute('data-is-default') === 'true'
        );
        if (modelOption) {
            modelOption.selected = true;
            handlePersonaChange(modelOption);
        }
    }
}

// Handle changes in personaList
function handlePersonaChange(selectedOption) {
    if (!selectedOption) return;

    const isDefault = selectedOption.getAttribute('data-is-default') === 'true';
    const selectedName = selectedOption.value;

    // Update temperature if it's a persona
    if (!isDefault) {
        const persona = personas.find(p => p.name === selectedName);
        if (persona) {
            const temperatureSlider = document.getElementById('temperature');
            const temperatureValue = document.getElementById('temperatureValue');
            if (temperatureSlider && temperatureValue) {
                temperatureSlider.value = persona.temperature;
                temperatureValue.textContent = persona.temperature;
            }
        }
    }

    // Update image upload button visibility
    const imageUploadBtn = document.getElementById('imageUpload');
    if (imageUploadBtn) {
        imageUploadBtn.style.display = selectedName === 'llama3.2-vision:latest' ? 'block' : 'none';
    }
}

// Handle changes in modelList
function handleModelChange(selectedOption) {
    if (!selectedOption) return;
    const selectedModel = selectedOption.value;

    // Optionally, sync model selection with personaList
    const personaList = document.getElementById('personaList');
    if (personaList) {
        const modelOption = Array.from(personaList.options).find(opt => 
            opt.value === selectedModel && opt.getAttribute('data-is-default') === 'true'
        );
        if (modelOption) {
            modelOption.selected = true;
            handlePersonaChange(modelOption);
        }
    }

    // Additional logic for model selection can be added here
    console.log(`Model selected: ${selectedModel}`);
}

// Helper functions
function formatSize(sizeInBytes) {
    return `${(sizeInBytes / (1024 ** 3)).toFixed(1)} GB`;
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString();
}

// Existing functions like checkServerStatus, handleOfflineState, etc.
// Ensure these functions are properly defined elsewhere in script.js

// Remove any duplicate fetchModels or related functions to prevent conflicts

function clearConversation() {
    if (confirm('Are you sure you want to clear the conversation history?')) {
        conversationHistory = [];
        selectedContextMessages = [];
        useFullContext = false;
        document.getElementById('response').innerHTML = '';
        document.getElementById('fullContextButton').classList.remove('active');
        document.getElementById('selectContextButton').classList.remove('active');
    }
}

// Add this new function to handle prompt input changes
function handlePromptInput() {
    const promptInput = document.getElementById('prompt');
    const generateButton = document.getElementById('generate');
    generateButton.disabled = !promptInput.value.trim() || !serverOnline;
}