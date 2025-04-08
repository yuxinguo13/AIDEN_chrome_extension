// Constants
const OBSERVER_CONFIG = {
  childList: true,
  subtree: true,
  attributes: false,
  characterData: false
};

const BACKEND_URL = 'http://localhost:3000';
const AUTO_REQUEST_DELAY = 1500; // Delay in ms before auto-requesting (to ensure page is fully loaded)

console.log('[AIDEN] Content script successfully injected into:', window.location.href);
console.log('[AIDEN] Document readyState:', document.readyState);

// Store processed post IDs to avoid duplicate requests
const processedPosts = new Set();
// Track current status by post ID
const postStatus = new Map();

function updateAidenStatus(postId, status) {
  // Update local tracking
  postStatus.set(postId, status);
  
  // Send status update to extension popup if it's open
  chrome.runtime.sendMessage({
    action: "aidenStatusUpdate",
    postId: postId,
    status: status
  });
}

function extractQuestionData() {
  console.log('[AIDEN] Extracting question data...');
  try {
    // Get post title - more robust selector
    const titleElement = document.querySelector('#postViewSummaryId, .subject, .post-title');
    console.log('[AIDEN] Title element:', titleElement);
    const title = titleElement?.textContent?.trim() || 'Untitled Post';

    // Get post content - handles both question and note content
    const contentElement = document.querySelector('[data-id="renderHtmlId"], .render-html-content, .post-content, .question-content');
    let content = '';
    
    if (contentElement) {
      // Create a clean copy of the content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = contentElement.innerHTML;
      
      // Remove unwanted elements but preserve structure
      tempDiv.querySelectorAll('a, img, script, style, iframe, button').forEach(el => {
        // Keep LaTeX elements but remove others
        if (!el.classList.contains('latex')) {
          el.remove();
        }
      });
      
      // Get clean text with preserved line breaks
      content = tempDiv.innerText
        .replace(/\s+/g, ' ')
        .trim();
        
      // Additional cleanup for better readability
      content = content
        .replace(/\\n/g, '\n')  // Convert escaped newlines
        .replace(/\s{2,}/g, ' ') // Remove multiple spaces
        .trim();
    }

    // Get tags - handles both folders and tags
    const tags = Array.from(document.querySelectorAll('#folder_select .folder_button, .folders-list .folder, .post-tags .tag'))
      .map(el => el.textContent.trim())
      .filter(Boolean);

    // Extract post ID from URL or element
    const postIdMatch = window.location.pathname.match(/post\/(\d+)/) || 
                       window.location.href.match(/cid=(\d+)/);
    const postId = postIdMatch ? postIdMatch[1] : null;

    if (!postId) {
      console.warn('Could not extract post ID from URL:', window.location.href);
      return null;
    }

    // Extract class ID from URL
    const classIdMatch = window.location.pathname.match(/class\/([^\/]+)/);
    const classId = classIdMatch ? classIdMatch[1] : null;

    return {
      postId,
      classId,
      title,
      content,
      tags,
      url: window.location.href,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error extracting question data:', error);
    return null;
  }
}

function addAidenButton(container) {
  // Find the container if not provided
  const controls = container || document.querySelector('.post-actions, .post_action_bar, .action-bar');
  console.log('[AIDEN] Final controls container:', controls);
  
  if (!controls) {
    console.warn('[AIDEN] No container found in document:', {
      html: document.documentElement.outerHTML.substring(0, 500) + '...'
    });
    return;
  }

  if (document.getElementById('aiden-button')) {
    console.log('[AIDEN] Button already exists');
    return;
  }

  const button = document.createElement('button');
  button.id = 'aiden-button';
  button.className = 'btn btn-default';
  button.innerHTML = '<i class="icon-bolt"></i> Get AIDEN Response';
  button.style.marginLeft = '10px';
  button.style.cursor = 'pointer';
  
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.innerHTML = '<i class="icon-spinner icon-spin"></i> Processing...';
    
    try {
      const questionData = extractQuestionData();
      if (!questionData) {
        throw new Error('Could not extract question data');
      }

      requestAidenResponse(questionData, button);
    } catch (error) {
      console.error('AIDEN Error:', error);
      alert(`AIDEN Error: ${error.message}`);
      button.disabled = false;
      button.innerHTML = '<i class="icon-bolt"></i> Get AIDEN Response';
    }
  });
  
  controls.appendChild(button);
  return button;
}

async function requestAidenResponse(questionData, buttonElement = null) {
  try {
    // Update status
    updateAidenStatus(questionData.postId, 'requesting');
    
    // Send request to backend
    const response = await fetch(`${BACKEND_URL}/generate_response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Version': chrome.runtime.getManifest().version
      },
      body: JSON.stringify({
        post_id: questionData.postId,
        llm_input: `Title: ${questionData.title}\nTags: ${questionData.tags.join(', ')}\nContent: ${questionData.content}`,
        metadata: {
          tags: questionData.tags,
          url: questionData.url
        }
      })
    });
    
    // Parse initial response
    const initialData = await response.json();
    
    // Start polling
    updateAidenStatus(questionData.postId, 'thinking');
    
    // Start polling for results
    pollForResults(questionData.postId, buttonElement);
    
    return initialData;
  } catch (error) {
    console.error('[AIDEN] Error requesting response:', error);
    updateAidenStatus(questionData.postId, 'error');
    
    if (buttonElement) {
      buttonElement.disabled = false;
      buttonElement.innerHTML = '<i class="icon-warning-sign"></i> Error - Try Again';
    }
    
    throw error;
  }
}

async function pollForResults(postId, buttonElement = null, maxAttempts = 20, delay = 3000) {
  let attempts = 0;
  
  const poll = async () => {
    if (attempts >= maxAttempts) {
      const errorMsg = "Timed out waiting for AIDEN response";
      console.error(errorMsg);
      updateAidenStatus(postId, 'error');
      
      if (buttonElement) {
        buttonElement.disabled = false;
        buttonElement.innerHTML = '<i class="icon-warning-sign"></i> Timeout - Try Again';
      }
      
      return;
    }
    
    try {
      const response = await fetch(`${BACKEND_URL}/get_response/${postId}`);
      const data = await response.json();
      
      if (response.status === 200 && data.status !== 'processing') {
        console.log("Complete response from AIDEN:", data);
        updateAidenStatus(postId, 'ready');
        
        if (buttonElement) {
          buttonElement.disabled = false;
          buttonElement.innerHTML = '<i class="icon-ok"></i> Response Ready';
        }
        
        // Store the response in localStorage for later use
        try {
          localStorage.setItem(`aiden_response_${postId}`, JSON.stringify(data));
        } catch (e) {
          console.warn('[AIDEN] Failed to store response in localStorage:', e);
        }
        
        return data;
      }
      
      // If still processing, increment attempts and try again
      attempts++;
      setTimeout(poll, delay);
    } catch (error) {
      console.error('[AIDEN] Error polling for results:', error);
      attempts++;
      setTimeout(poll, delay * 2); // Wait a bit longer on error
    }
  };
  
  // Start polling
  setTimeout(poll, delay);
}

function insertAidenToInstructorAnswer(response) {
  try {
    console.log('[AIDEN] Inserting response to instructor answer section');
    
    // Find the instructor answer textarea
    const instructorTextarea = document.querySelector('textarea#i_answer_edit');
    
    if (!instructorTextarea) {
      console.error('[AIDEN] Could not find instructor answer textarea');
      alert('Could not find instructor answer section. Please make sure you are on a question page and have instructor privileges.');
      return;
    }
    
    // Get the existing content
    let existingContent = instructorTextarea.value || '';
    
    // Get the AIDEN response - handle both direct output and nested format
    let aidenResponse = '';
    if (response.output) {
      aidenResponse = response.output;
    } else if (response.full_response && response.full_response.output) {
      aidenResponse = response.full_response.output;
    } else {
      aidenResponse = "Error: Could not retrieve AIDEN response";
    }
    
    // Set the new content - just use the AIDEN response without the prefix
    const formattedResponse = existingContent.trim() ? 
      existingContent + '\n\n' + aidenResponse : // Add two newlines if there's existing content
      aidenResponse; // Just use the response if the textarea is empty
    
    // Set the new content
    instructorTextarea.value = formattedResponse;
    
    // Trigger an input event to ensure Piazza recognizes the change
    const inputEvent = new Event('input', { bubbles: true });
    instructorTextarea.dispatchEvent(inputEvent);
    
    // Focus on the textarea
    instructorTextarea.focus();
    
    // Scroll to the textarea
    instructorTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Show success message
    alert('AIDEN response has been inserted into the instructor answer section.');
  } catch (error) {
    console.error('[AIDEN] Error inserting response:', error);
    alert(`Error inserting AIDEN response: ${error.message}`);
  }
}

async function getStoredAidenResponse(postId) {
  // First check localStorage
  try {
    const storedResponse = localStorage.getItem(`aiden_response_${postId}`);
    if (storedResponse) {
      return JSON.parse(storedResponse);
    }
  } catch (e) {
    console.warn('[AIDEN] Error retrieving from localStorage:', e);
  }
  
  // If not in localStorage, check backend
  try {
    const response = await fetch(`${BACKEND_URL}/get_response/${postId}`);
    if (response.status === 200) {
      const data = await response.json();
      if (data.status !== 'processing' && !data.error) {
        return data;
      }
    }
  } catch (e) {
    console.error('[AIDEN] Error retrieving from backend:', e);
  }
  
  return null;
}

// Add message listener for communication with popup and background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getQuestionData") {
    const data = extractQuestionData();
    if (data) {
      // Check and send current status
      const status = postStatus.get(data.postId) || 'idle';
      data.aidenStatus = status;
    }
    sendResponse(data);
    return true;
  }
  
  if (request.action === "displayResponse") {
    insertAidenToInstructorAnswer(request.response);
    sendResponse({success: true});
    return true;
  }
  
  if (request.action === "insertAidenResponse") {
    getStoredAidenResponse(request.postId)
      .then(response => {
        if (response) {
          insertAidenToInstructorAnswer(response);
          sendResponse({success: true});
        } else {
          sendResponse({success: false, error: 'No response available'});
        }
      })
      .catch(error => {
        console.error('[AIDEN] Error getting stored response:', error);
        sendResponse({success: false, error: error.message});
      });
    return true;
  }
  
  if (request.action === "triggerAidenRequest") {
    const questionData = extractQuestionData();
    if (questionData) {
      requestAidenResponse(questionData)
        .then(() => sendResponse({success: true}))
        .catch(error => sendResponse({success: false, error: error.message}));
      return true;
    } else {
      sendResponse({success: false, error: 'Could not extract question data'});
      return true;
    }
  }
  
  if (request.action === "getAidenStatus") {
    const questionData = extractQuestionData();
    if (questionData) {
      const status = postStatus.get(questionData.postId) || 'idle';
      sendResponse({status: status});
    } else {
      sendResponse({status: 'error', error: 'Could not extract question data'});
    }
    return true;
  }
});

// MutationObserver to handle dynamic content loading
const observer = new MutationObserver(() => {
  // Try multiple possible container selectors
  const containerSelectors = [
    '.post-actions', // Original
    '.post_action_bar', // Alternative
    '.action-bar', // Another alternative
    '[data-testid="post-actions"]' // If Piazza uses test IDs
  ];

  const container = containerSelectors.reduce((found, selector) => 
    found || document.querySelector(selector), null);

  console.log('[AIDEN] Checking for action containers:', {
    containerSelectors,
    foundContainer: container
  });

  if (container) {
    console.log('[AIDEN] Found container:', container);
    addAidenButton(container); // Pass the container to the function
    observer.disconnect();
  }
});

// Initial setup
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  const container = document.querySelector('.post-actions, .post_action_bar, .action-bar');
  if (container) {
    addAidenButton(container);
  } else {
    observer.observe(document.body, OBSERVER_CONFIG);
  }
} else {
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.post-actions, .post_action_bar, .action-bar');
    if (container) {
      addAidenButton(container);
    } else {
      observer.observe(document.body, OBSERVER_CONFIG);
    }
  });
}

// Cleanup on page navigation (for SPA)
window.addEventListener('beforeunload', () => {
  observer.disconnect();
});