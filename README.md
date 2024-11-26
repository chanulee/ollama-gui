# Persona Studio
Persona Studio is an open-source take on Meta AI Studio.  
Difference? You have the ownership on your data, personas and even modify the studio itself.

## Features
1) Basic chat features from [coreOllama](https://github.com/chanulee/coreOllama)
  - Model/persona selection, Model manager (pull, view and delete models), Image input for [llama3.2-vision:latest](https://ollama.com/library/llama3.2-vision), Server status, Dark mode, context management
2) Personas, product structure & etc still being developed

## TBD - To Be Developed
- Persona builder
- Textfield on landing instead of start chatting button
- Export and import persona
- Chat history

---

## Beginner's guide
1. Ollama setup - install ollama app for mac (You can download model or just proceed and use gui)
2. Quit the app (check on your status bar). 
3. Open terminal and enter `ollama serve`. Keep that terminal window open.
4. Check http://localhost:11434/, it should say "Ollama is running".
5. Download the repo and open `index.html`

## For future reference
- Making a custom model using huggingface model https://www.youtube.com/watch?v=bXf2Cxf3Wk0
- Customisation of existing model (llama) 
