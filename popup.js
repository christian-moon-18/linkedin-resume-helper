// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById("api-key");
    const saveApiKeyButton = document.getElementById("save-api-key");
    const apiKeyContentDiv = document.getElementById("api-key-content");
    const resumeFileInput = document.getElementById("resume-file");
    const uploadButton = document.getElementById("upload-button");
    const analyzeJobButton = document.getElementById("analyze-job");
    const analysisStatusDiv = document.getElementById("analysis-status");
    const resumeStatusDiv = document.getElementById("resume-status");
    const modelSelect = document.getElementById("model-select");
  
    // Initialize UI state
    function updateUIState() {
      chrome.storage.sync.get(["apiKey"], (data) => {
        apiKeyContentDiv.textContent = data.apiKey ? "API Key is saved" : "No API Key saved yet.";
      });
  
      chrome.storage.local.get(["resumeText"], (data) => {
        resumeStatusDiv.textContent = data.resumeText ? "Resume is uploaded" : "No resume uploaded yet";
        analyzeJobButton.disabled = !data.resumeText;
      });
    }
  
    // Initialize UI
    updateUIState();
  
    // Save selected model
    modelSelect.addEventListener('change', () => {
      chrome.storage.sync.set({ model: modelSelect.value });
    });
  
    // Initialize model selection
    chrome.storage.sync.get(["model"], (data) => {
      if (data.model) {
        modelSelect.value = data.model;
      }
    });
  
    // Save API Key
    saveApiKeyButton.addEventListener('click', () => {
      const apiKey = apiKeyInput.value.trim();
      if (apiKey) {
        chrome.storage.sync.set({ apiKey }, () => {
          apiKeyContentDiv.textContent = "API Key saved";
          apiKeyInput.value = "";
          updateUIState();
        });
      } else {
        alert("Please enter an API key");
      }
    });
  
    // Handle file upload
    uploadButton.addEventListener('click', async () => {
      const file = resumeFileInput.files[0];
      if (!file) {
        alert("Please select a file to upload");
        return;
      }
  
      resumeStatusDiv.textContent = "Reading file...";
      
      try {
        let resumeText;
        
        if (file.type === "application/pdf") {
          const result = await window.readPdfFile(file);
          if (!result.success) {
            throw new Error(result.error);
          }
          resumeText = result.text;
        } else {
          // Handle text files
          resumeText = await file.text();
        }
  
        chrome.storage.local.set({ resumeText }, () => {
          resumeStatusDiv.textContent = "Resume uploaded successfully";
          analyzeJobButton.disabled = false;
        });
      } catch (error) {
        console.error("Error processing file:", error);
        resumeStatusDiv.textContent = `Error: ${error.message}`;
        analyzeJobButton.disabled = true;
      }
    });
  
    // Handle analyze job button
    analyzeJobButton.addEventListener('click', async () => {
      analysisStatusDiv.textContent = "Analyzing job description...";
      analyzeJobButton.disabled = true;
  
      try {
        const storage = await Promise.all([
          chrome.storage.local.get(["resumeText"]),
          chrome.storage.sync.get(["apiKey"])
        ]);
        
        const resumeText = storage[0].resumeText;
        const apiKey = storage[1].apiKey;
  
        if (!resumeText || !apiKey) {
          throw new Error("Missing resume or API key");
        }
  
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { action: "analyzeJob", resumeText, apiKey },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            }
          );
        });
  
        if (response.success) {
          analysisStatusDiv.textContent = "Analysis complete! Check your downloads.";
        } else {
          throw new Error(response.error || "Analysis failed");
        }
  
      } catch (error) {
        console.error("Error during analysis:", error);
        analysisStatusDiv.textContent = `Error: ${error.message}`;
      } finally {
        analyzeJobButton.disabled = false;
      }
    });
  
    // Clear configs
    document.getElementById("clear-api-key").addEventListener('click', () => {
      chrome.storage.sync.remove("apiKey", () => {
        apiKeyContentDiv.textContent = "No API Key saved yet.";
        updateUIState();
      });
    });
  
    document.getElementById("clear-resume").addEventListener('click', () => {
      chrome.storage.local.remove("resumeText", () => {
        resumeStatusDiv.textContent = "No resume uploaded yet";
        analyzeJobButton.disabled = true;
        resumeFileInput.value = ''; // Clear the file input
        updateUIState();
      });
    });
  });