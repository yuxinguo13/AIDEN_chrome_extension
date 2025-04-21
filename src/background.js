// Handle communication with AIDEN backend
const BACKEND_URL = 'http://localhost:3000';

// Track response status for posts
const responseStatusCache = new Map();

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getResponse") {
    fetchAidenResponse(request.postId, sender, sendResponse);
    return true;
  }

  if (request.action === "checkStatus") {
    checkResponseStatus(request.postId, sendResponse);
    return true;
  }

  if (request.action === "submitResponse") {
    submitResponseToPiazza(request.postId, request.content, sendResponse);
    return true;
  }

  if (request.action === "getCookies") {
    sendResponse({ cookies: true });
    return true;
  }

  if (request.action === "proxyFetch") {
    const url = `${BACKEND_URL}${request.endpoint}`;
    fetch(url, { method: request.method || "GET" })
      .then(res => res.json())
      .then(data => sendResponse(data))
      .catch(error => {
        console.error("Proxy fetch failed:", error);
        sendResponse({ error: error.message });
      });
    return true; // Required for async response
  }
  

  if (request.action === "triggerGeneration") {
    fetch(`${BACKEND_URL}/generate_response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.payload)
    })
      .then(res => res.json())
      .then(data => {
        console.log("[AIDEN] Triggered generation from background:", data);
        sendResponse(data);
      })
      .catch(err => {
        console.error("[AIDEN] Generation trigger failed:", err);
        sendResponse({ status: 'error', message: err.message });
      });
    return true;
  }
});

async function fetchAidenResponse(postId, sender, sendResponse) {
  try {
    const cachedStatus = responseStatusCache.get(postId);
    if (cachedStatus === 'ready') {
      const response = await fetch(`${BACKEND_URL}/get_response/${postId}`);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const data = await response.json();
      responseStatusCache.set(postId, data.status);
      sendResponse(data);
      if (sender.tab && sender.tab.id) {
        chrome.tabs.sendMessage(sender.tab.id, { action: "responseReady", data });
      }
      return;
    }

    const response = await fetch(`${BACKEND_URL}/get_response/${postId}`);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const data = await response.json();
    responseStatusCache.set(postId, data.status);
    sendResponse(data);
    if (data.status === 'ready' && sender.tab && sender.tab.id) {
      chrome.tabs.sendMessage(sender.tab.id, { action: "responseReady", data });
    }
  } catch (error) {
    console.error('Error fetching AIDEN response:', error);
    sendResponse({ status: 'error', message: error.message });
    if (sender.tab && sender.tab.id) {
      chrome.tabs.sendMessage(sender.tab.id, { action: "responseError", error: error.message });
    }
  }
}

async function checkResponseStatus(postId, sendResponse) {
  try {
    const response = await fetch(`${BACKEND_URL}/get_response/${postId}`);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const data = await response.json();
    responseStatusCache.set(postId, data.status);
    sendResponse({ status: data.status, data });
  } catch (error) {
    console.error('Error checking response status:', error);
    sendResponse({ status: 'error', message: error.message });
  }
}

async function submitResponseToPiazza(postId, content, sendResponse) {
  try {
    const response = await fetch(`${BACKEND_URL}/posts/${postId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const data = await response.json();
    responseStatusCache.set(postId, 'answered');
    sendResponse({ status: 'success', data });
  } catch (error) {
    console.error('Error submitting response:', error);
    sendResponse({ status: 'error', message: error.message });
  }
}

// Clear cache every 5 minutes
setInterval(() => {
  responseStatusCache.clear();
}, 5 * 60 * 1000);