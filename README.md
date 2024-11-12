# Ollama Commands

Currently running model:
http://localhost:11434/api/ps

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

## Running the API server
1. Quit the ollama app if it's running (check on the status bar)
2. `ollama serve` in terminal, don't close this terminal.
3. visit http://localhost:11434/ to see it's running. 
4. open up new terminal, and run `http://localhost:11434/api/generate -d '{ "model": "mistral-nemo", "prompt": "What is water made of?", "stream": false }'`. get rid of the stream: false if you want to see the output word-by-word.
Reference: https://dev.to/jayantaadhikary/using-the-ollama-api-to-run-llms-and-generate-responses-locally-18b7

## Model instructions

## For future reference
- Making a custom model using huggingface model https://www.youtube.com/watch?v=bXf2Cxf3Wk0
- Customisation of existing model (llama) 
