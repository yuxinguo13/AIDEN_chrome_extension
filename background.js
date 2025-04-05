// Handle cookie storage and communication with AIDEN backend
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
    fetch('http://localhost:3000/generate_response', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...request.data,
        url: sender.tab?.url // Include the URL for context
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => sendResponse(data))
    .catch(error => {
      console.error('Error sending to AIDEN:', error);
      sendResponse({ error: error.message });
    });
    return true;
  }
});

// Add error handling for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('AIDEN extension installed');
  }
});