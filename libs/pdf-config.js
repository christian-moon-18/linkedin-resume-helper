// pdf-config.js
async function initPdfLib() {
    // Set worker source path
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');
  }
  
  async function readPdfFile(file) {
    try {
      await initPdfLib();
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;
      let fullText = '';
      
      // Extract text from all pages
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map(item => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }
      
      return { success: true, text: fullText.trim() };
    } catch (error) {
      console.error('Error reading PDF:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Make functions available globally
  window.readPdfFile = readPdfFile;
  window.initPdfLib = initPdfLib;