let serverOnline = false;
let selectedImage = null;
let personas = JSON.parse(localStorage.getItem('personas')) || [
    {
        name: 'Default Assistant',
        model: 'mistral-nemo:latest',
        temperature: 0.7,
        systemPrompt: ''
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
        const modelGrid = document.getElementById('modelGrid');
        const editPersonaModel = document.getElementById('editPersonaModel');
        const personaList = document.getElementById('personaList');
        
        if (modelGrid) modelGrid.innerHTML = '<div>Server offline</div>';
        if (editPersonaModel) editPersonaModel.innerHTML = '<option value="">Server offline</option>';
        if (personaList) {
            personaList.innerHTML = '<option value="">Server offline</option>';
        }
        return;
    }

    try {
        const response = await fetch('http://localhost:11434/api/tags');
        const data = await response.json();
        
        // Update model grid in settings
        const modelGrid = document.getElementById('modelGrid');
        if (modelGrid) {
            modelGrid.innerHTML = '';
            data.models.forEach(model => {
                const card = document.createElement('div');
                card.className = 'model-card';
                card.innerHTML = `
                    <h3>${model.name}</h3>
                    <div class="model-meta">
                        <span class="tag">Size: ${formatSize(model.size)}</span>
                        <span class="tag">Modified: ${formatDate(model.modified_at)}</span>
                    </div>
                    <div class="model-actions">
                        <button class="btn btn-danger" onclick="deleteModel('${model.name}')">
                            Delete
                        </button>
                    </div>
                `;
                modelGrid.appendChild(card);
            });
        }

        // Update persona selector
        const personaList = document.getElementById('personaList');
        if (personaList) {
            const defaultPersonas = data.models.map(createDefaultPersonaFromModel);
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
            
            // After updating the list, trigger the persona change handler
            handlePersonaChange(personaList.options[personaList.selectedIndex]);
        }

        // Update model select in persona editor
        const editPersonaModel = document.getElementById('editPersonaModel');
        if (editPersonaModel) {
            editPersonaModel.innerHTML = data.models
                .map(model => `<option value="${model.name}">${model.name}</option>`)
                .join('');
        }

    } catch (error) {
        console.error('Error fetching models:', error);
        const modelGrid = document.getElementById('modelGrid');
        const editPersonaModel = document.getElementById('editPersonaModel');
        const personaList = document.getElementById('personaList');
        
        if (modelGrid) modelGrid.innerHTML = '<div>Error loading models</div>';
        if (editPersonaModel) editPersonaModel.innerHTML = '<option value="">Error loading models</option>';
        if (personaList) personaList.innerHTML = '<option value="">Error loading models</option>';
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
        generateResponse();
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
    const modal = document.getElementById('settingsModal');
    if (event.target === modal) {
        closeSettingsModal();
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
    return {
        name: model.name,
        model: model.name,
        temperature: 0.7,
        systemPrompt: '',
        isDefault: true
    };
}

function handlePersonaChange(selectedOption) {
    const isDefault = selectedOption.getAttribute('data-is-default') === 'true';
    const selectedName = selectedOption.value;
    const imageUploadBtn = document.getElementById('imageUpload');
    
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

    if (selectedPersona) {
        // Update image upload button visibility based on model
        imageUploadBtn.style.display = 
            selectedPersona.model === 'llama3.2-vision:latest' ? 'block' : 'none';

        // Update other controls...
        document.getElementById('modelList').value = selectedPersona.model;
        const temperatureSlider = document.getElementById('temperature');
        const temperatureValue = document.getElementById('temperatureValue');
        if (temperatureSlider && temperatureValue) {
            temperatureSlider.value = selectedPersona.temperature;
            temperatureValue.textContent = selectedPersona.temperature;
        }
    }
}

// Update controls row to include both models and personas
function updateControlsRow() {
    const controlsRow = document.querySelector('.controls-row');
    const modelSelect = document.getElementById('modelList');
    const models = Array.from(modelSelect.options).map(option => ({
        name: option.value,
        displayName: option.text
    })).filter(model => model.name !== 'loading');

    // Create combined list of default model personas and user personas
    const defaultPersonas = models.map(createDefaultPersonaFromModel);
    const allPersonas = [
        ...defaultPersonas,
        ...personas.filter(p => !p.isDefault)  // Only include user-created personas
    ];

    // Update the controls row HTML
    controlsRow.innerHTML = `
        <div class="model-select-container">
            <select id="modelList" style="display: none;">
                ${models.map(m => `<option value="${m.name}">${m.displayName}</option>`).join('')}
            </select>
        </div>
        <div class="persona-select-container">
            <div class="context-controls">
                <button class="context-button" id="clearConversationButton" title="Clear Conversation">
                    <svg viewBox="0 0 24 24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
                <button class="context-button" id="fullContextButton" title="Use Full History">
                    <svg viewBox="0 0 24 24">
                        <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                    </svg>
                </button>
                <button class="context-button" id="selectContextButton" title="Select Context">
                    <svg viewBox="0 0 24 24">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/>
                    </svg>
                </button>
            </div>
            <select id="personaList">
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
            </select>
            <button id="personaButton" class="icon-button" title="Manage Personas">
                <svg class="persona-icon" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
            </button>
        </div>
    `;

    // Add event listener for the persona button
    document.getElementById('personaButton').addEventListener('click', openPersonaModal);

    // Add event listener for persona selection
    document.getElementById('personaList').addEventListener('change', function() {
        handlePersonaChange(this.options[this.selectedIndex]);
    });

    // Add event listeners for context buttons
    const fullContextButton = document.getElementById('fullContextButton');
    fullContextButton.addEventListener('click', function() {
        useFullContext = !useFullContext;
        this.classList.toggle('active', useFullContext);
        // When fullContext is enabled, clear selectedContextMessages
        if (useFullContext) {
            selectedContextMessages = [];
            document.getElementById('selectContextButton').classList.remove('active');
        }
    });

    const selectContextButton = document.getElementById('selectContextButton');
    selectContextButton.addEventListener('click', function() {
        openContextSelectionModal();
        // Disable fullContext when selecting context
        useFullContext = false;
        fullContextButton.classList.remove('active');
    });

    // Add event listener for clear conversation button
    document.getElementById('clearConversationButton').addEventListener('click', clearConversation);

    // Trigger initial check for current selection
    const personaList = document.getElementById('personaList');
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
    deselectButton.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M19 13H5v-2h14v2z"/>
        </svg>
    `;
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
document.addEventListener('DOMContentLoaded', initializeUI);

// Initialize tabs and controls
function initializeUI() {
    initTabs();
    updateControlsRow();
    
    // Add event listeners for persona management
    document.getElementById('personaButton').addEventListener('click', openPersonaModal);
    document.querySelectorAll('.close-button').forEach(button => {
        button.addEventListener('click', e => {
            e.target.closest('.modal').style.display = 'none';
        });
    });

    // Set initial image upload button visibility
    const imageUploadBtn = document.getElementById('imageUpload');
    const personaList = document.getElementById('personaList');
    if (personaList && personaList.value === 'llama3.2-vision:latest') {
        imageUploadBtn.style.display = 'block';
    } else {
        imageUploadBtn.style.display = 'none';
    }
}

// Initialize tabs
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked tab
            button.classList.add('active');
            document.getElementById(`${button.dataset.tab}-tab`).classList.add('active');
        });
    });
}

// Add the clearConversation function
function clearConversation() {
    if (confirm('Are you sure you want to clear the conversation?')) {
        const responseDiv = document.getElementById('response');
        responseDiv.innerHTML = '';
        conversationHistory = [];
        selectedContextMessages = [];
        useFullContext = false;
        
        // Reset context buttons
        document.getElementById('fullContextButton').classList.remove('active');
        document.getElementById('selectContextButton').classList.remove('active');
    }
}