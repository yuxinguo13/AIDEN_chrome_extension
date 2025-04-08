// Handle cookie storage and communication with AIDEN backend
const BACKEND_URL = 'http://localhost:3000';

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getCookies") {
    chrome.cookies.getAll({ domain: "piazza.com" }, (cookies) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      sendResponse({ cookies: cookieString });
    });
    return true; // Required for async response
  }
  
  if (request.action === "sendToAiden") {
    handleAidenRequest(request, sender, sendResponse);
    return true; // Required for async response
  }
});

async function handleAidenRequest(request, sender, sendResponse) {
  try {
    // Get extension version for logging
    const manifestData = chrome.runtime.getManifest();
    const extensionVersion = manifestData.version;
    
    // Get user agent for logging
    const userAgent = navigator.userAgent;
    
    // Make initial request to the backend
    const response = await fetch(`${BACKEND_URL}/generate_response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Version': extensionVersion,
        'User-Agent': userAgent
      },
      body: JSON.stringify({
        ...request.data,
        url: sender.tab?.url // Include the URL for context
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const initialData = await response.json();
    console.log("Initial response from AIDEN:", initialData);

    // Check if processing is needed
    if (initialData.status === 'processing') {
      sendResponse({ status: 'processing', message: 'Processing your request...' });
      
      // Start polling for the final result
      pollForResults(request.data.post_id, sender, sendResponse);
    } else {
      // If we got an immediate response
      console.log("Complete response from AIDEN:", initialData);
      notifyContentScript(sender, initialData);
      sendResponse(initialData);
    }
  } catch (error) {
    console.error('Error sending to AIDEN:', error);
    
    // Send error message to content script
    if (sender.tab && sender.tab.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        action: "aidenResponseError", 
        error: error.message
      });
    }
    
    sendResponse({ error: error.message });
  }
}

async function pollForResults(postId, sender, sendResponse, maxAttempts = 20) {
  let attempts = 0;
  const delay = 3000; // 3 seconds between polls
  
  const poll = async () => {
    if (attempts >= maxAttempts) {
      const errorMsg = "Timed out waiting for AIDEN response";
      console.error(errorMsg);
      
      if (sender.tab && sender.tab.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "aidenResponseError", 
          error: errorMsg
        });
      }
      
      return;
    }
    
    try {
      const response = await fetch(`${BACKEND_URL}/get_response/${postId}`);
      const data = await response.json();
      
      if (response.status === 200 && data.status !== 'processing') {
        console.log("Complete response from AIDEN:", data);
        notifyContentScript(sender, data);
        return;
      }
      
      // If still processing, increment attempts and try again
      attempts++;
      setTimeout(poll, delay);
    } catch (error) {
      console.error('Error polling for results:', error);
      attempts++;
      setTimeout(poll, delay * 2); // Wait a bit longer on error
    }
  };
  
  // Start polling
  setTimeout(poll, delay);
}

function notifyContentScript(sender, data) {
  if (sender.tab && sender.tab.id) {
    chrome.tabs.sendMessage(sender.tab.id, {
      action: "aidenResponseReady", 
      response: data
    });
  }
}

// Add error handling for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('AIDEN extension installed');
  }
});