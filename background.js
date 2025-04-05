// Handle cookie storage and communication with AIDEN backend
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getCookies") {
    chrome.cookies.getAll({domain: "piazza.com"}, (cookies) => {
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      sendResponse({cookies: cookieString});
    });
    return true; // Required for async response
  }
  
  if (request.action === "sendToAiden") {
    fetch('http://localhost:3000/generate_response', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.data)
    })
    .then(response => response.json())
    .then(data => sendResponse(data))
    .catch(error => sendResponse({error: error.message}));
    return true;
  }
});