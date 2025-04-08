// Constants
const OBSERVER_CONFIG = {
  childList: true,
  subtree: true,
  attributes: false,
  characterData: false
};

const BACKEND_URL = 'http://localhost:3000';

console.log('[AIDEN] Content script successfully injected into:', window.location.href);
console.log('[AIDEN] Document readyState:', document.readyState);

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

function showLoadingState(button) {
  button.disabled = true;
  button.innerHTML = '<i class="icon-spinner icon-spin"></i> Processing...';
  return button;
}

function updateButtonState(button, state) {
  if (state === 'waiting') {
    button.innerHTML = '<i class="icon-time"></i> Waiting for response...';
  } else if (state === 'ready') {
    button.disabled = false;
    button.innerHTML = '<i class="icon-bolt"></i> Get AIDEN Response';
  } else if (state === 'error') {
    button.disabled = false;
    button.innerHTML = '<i class="icon-warning-sign"></i> Error - Try Again';
  }
  return button;
}

async function checkResponseStatus(postId, maxAttempts = 20, delay = 3000) {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`${BACKEND_URL}/get_response/${postId}`);
      const data = await response.json();
      
      if (response.status === 200 && data.status !== 'processing') {
        return data;
      }
      
      // If still processing, wait and try again
      await new Promise(resolve => setTimeout(resolve, delay));
      attempts++;
    } catch (error) {
      console.error('[AIDEN] Error checking response status:', error);
      attempts++;
      // Wait a bit longer on error
      await new Promise(resolve => setTimeout(resolve, delay * 2));
    }
  }
  
  throw new Error('Timed out waiting for AIDEN response');
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
    try {
      // Get question data
      const questionData = extractQuestionData();
      if (!questionData) {
        throw new Error('Could not extract question data');
      }
      
      // Show loading state
      showLoadingState(button);
      
      // Start the request
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
      
      // Parse the initial response
      const initialData = await response.json();
      
      // Show waiting state
      updateButtonState(button, 'waiting');
      
      // Poll for results
      const aidenResponse = await checkResponseStatus(questionData.postId);
      
      // Update button to normal state
      updateButtonState(button, 'ready');
      
      // Insert response to instructor answer
      insertAidenToInstructorAnswer(aidenResponse);
    } catch (error) {
      console.error('[AIDEN] Error:', error);
      alert(`AIDEN Error: ${error.message}`);
      
      // Reset button to error state
      updateButtonState(button, 'error');
    }
  });
  
  controls.appendChild(button);
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
    
    // Format the response
    const formattedResponse = existingContent.trim() ? 
      existingContent + '\n\n' + aidenResponse :
      aidenResponse;
    
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

// Add message listener for communication with popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getQuestionData") {
    const data = extractQuestionData();
    sendResponse(data);
    return true;
  }
  
  if (request.action === "displayResponse") {
    insertAidenToInstructorAnswer(request.response);
    sendResponse({success: true});
    return true;
  }
  
  return false;
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