// Notify background script that content script is ready
chrome.runtime.sendMessage({ action: "contentScriptReady" });

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrapeJobDescription") {
    try {
      // Wait for DOM to be fully loaded
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          scrapeAndRespond(sendResponse);
        });
      } else {
        scrapeAndRespond(sendResponse);
      }
      return true; // Required for async response
    } catch (error) {
      console.error("Error in content script:", error);
      sendResponse({ 
        success: false, 
        jobDescription: null,
        error: error.message || "Failed to scrape job description"
      });
    }
  }
  return true; // Required for async response
});

async function scrapeAndRespond(sendResponse) {
  try {
    // Try different selectors for job description
    const selectors = [
      ".jobs-box__html-content.jobs-description-content__text",
      ".jobs-description-content__text",
      ".jobs-description__content",
      "#job-details",
      // Add LinkedIn's new selectors
      "[data-job-description]",
      ".job-details",
      ".description__text",
      ".jobs-description",
      // Fallback to any element with "job" and "description" in class or id
      "[class*='job'][class*='description']"
    ];

    let jobDescriptionElem = null;
    for (const selector of selectors) {
      const elem = document.querySelector(selector);
      if (elem) {
        jobDescriptionElem = elem;
        break;
      }
    }

    if (!jobDescriptionElem) {
      // If still not found, try to find by searching through all elements
      const allElements = document.getElementsByTagName('*');
      for (const elem of allElements) {
        if (elem.textContent && 
            elem.textContent.length > 100 && 
            (elem.className.toLowerCase().includes('description') || 
             elem.id.toLowerCase().includes('description'))) {
          jobDescriptionElem = elem;
          break;
        }
      }
    }

    if (jobDescriptionElem) {
      // Clean up the text content
      const jobDescription = jobDescriptionElem.innerText
        .trim()
        .replace(/\s+/g, ' '); // Replace multiple spaces with single space

      console.log("Job description found:", jobDescription.substring(0, 100) + "..."); // Log preview
      sendResponse({ 
        success: true, 
        jobDescription,
        error: null
      });
    } else {
      throw new Error("Could not find job description on this page");
    }
  } catch (error) {
    console.error("Error scraping job description:", error);
    sendResponse({ 
      success: false, 
      jobDescription: null,
      error: error.message || "Failed to scrape job description"
    });
  }
}