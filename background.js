// Keep track of tabs with content scripts
const tabsWithContentScript = new Set();

// Listen for content script ready messages
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.action === "contentScriptReady" && sender.tab) {
    tabsWithContentScript.add(sender.tab.id);
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabsWithContentScript.delete(tabId);
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeJob") {
    handleJobAnalysis(request).then(sendResponse).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    
    // Wait for content script to be ready
    return new Promise((resolve) => {
      const checkContentScript = () => {
        if (tabsWithContentScript.has(tabId)) {
          resolve();
        } else {
          setTimeout(checkContentScript, 100);
        }
      };
      checkContentScript();
    });
  } catch (error) {
    console.error('Error injecting content script:', error);
    throw error;
  }
}

async function handleJobAnalysis(request) {
  try {
    // Get all tabs in the current window
    const tabs = await chrome.tabs.query({ 
      active: true, 
      lastFocusedWindow: true,
      url: ["https://*.linkedin.com/jobs/*"]
    });
    
    if (!tabs || tabs.length === 0) {
      throw new Error("Please open a LinkedIn job posting before analyzing");
    }

    const tab = tabs[0];
    
    // Validate required data
    const { resumeText, apiKey } = request;
    if (!resumeText || !apiKey) {
      throw new Error("Missing required data: resume or API key");
    }

    // Ensure content script is injected
    if (!tabsWithContentScript.has(tab.id)) {
      await injectContentScript(tab.id);
    }

    // Get job description with retry logic
    const jobDescriptionResponse = await new Promise((resolve, reject) => {
      let retryCount = 0;
      const maxRetries = 3;
      
      const tryGetDescription = () => {
        chrome.tabs.sendMessage(
          tab.id, 
          { action: "scrapeJobDescription" },
          (response) => {
            if (chrome.runtime.lastError) {
              if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(tryGetDescription, 500);
                return;
              }
              reject(new Error("Failed to connect to page after multiple attempts"));
              return;
            }
            if (!response || !response.success) {
              reject(new Error(response?.error || "Failed to get job description"));
              return;
            }
            resolve(response);
          }
        );
      };

      tryGetDescription();
    });

    // Get selected model from storage
    const modelData = await chrome.storage.sync.get("model");
    const modelName = modelData.model || "gpt-3.5-turbo";

    const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "system",
            content: `You are a professional resume editor. Analyze the provided resume and job description, 
                     then enhance the resume to better match the job requirements while maintaining honesty 
                     and authenticity. Highlight relevant experience and skills, improve phrasing, and 
                     suggest additions where appropriate. Output it in markdown.`
          },
          {
            role: "user",
            content: `Here's the resume:\n\n${resumeText}\n\nAnd here's the job description:\n\n${jobDescriptionResponse.jobDescription}`
          }
        ],
        temperature: 0.7
      })
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const responseData = await apiResponse.json();
    const enhancedResume = responseData.choices[0].message.content;

    // Create a data URL for the text content
    const textEncoder = new TextEncoder();
    const encodedData = textEncoder.encode(enhancedResume);
    const base64Data = btoa(String.fromCharCode.apply(null, encodedData));
    const dataUrl = `data:text/plain;base64,${base64Data}`;

    // Download the file using the data URL
    await chrome.downloads.download({
      url: dataUrl,
      filename: `enhanced_resume_${new Date().toISOString().split('T')[0]}.txt`,
      saveAs: true
    });

    return { success: true, message: "Resume enhancement completed successfully" };

  } catch (error) {
    console.error("Error in handleJobAnalysis:", error);
    throw error;
  }
}