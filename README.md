# Ollama GUI
ollama-gui is a simple gui for ollama, local llm.  
No need for Docker, nodejs - just ollama, terminal and web browser.  

## Features
1) Basic prompting - model selection, temperature
2) Model manager - pull new model, view and delete models
3) Image input for [llama3.2-vision:latest](https://ollama.com/library/llama3.2-vision)
4) Server status
5) Dark mode
6) User defined personas

---

## Beginner's guide
1. Ollama setup - install ollama app for mac (You can download model or just proceed and use gui)
2. Quit the app (check on your status bar). 
3. Open terminal and enter `ollama serve`. Keep that terminal window open.
4. Check http://localhost:11434/, it should say "Ollama is running".
5. Download the repo and open `1-chat/index.html`

## Ollama terminal commands
Start server
```bash
ollama serve
```
List models
```bash
ollama list
```
Remove model
```bash
ollama rm llama3
```
Run model
```bash
ollama run mistral-nemo
```
While ollama server running, this is API command. Get rid of the stream: false if you want to see the output word-by-word. [Ref](https://dev.to/jayantaadhikary/using-the-ollama-api-to-run-llms-and-generate-responses-locally-18b7)
```bash
http://localhost:11434/api/generate -d '{ "model": "mistral-nemo", "prompt": "What is water made of?", "stream": false }'
```
---
## For future reference
- Making a custom model using huggingface model https://www.youtube.com/watch?v=bXf2Cxf3Wk0
- Customisation of existing model (llama) 
