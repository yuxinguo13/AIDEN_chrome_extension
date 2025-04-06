import React from 'react';
import { createRoot } from 'react-dom/client';
import ResponseModal from './popup/components/ResponseModal';

// Constants
const OBSERVER_CONFIG = {
  childList: true,
  subtree: true,
  attributes: false,
  characterData: false
};

// Create a root element for React injection
const reactRoot = document.createElement('div');
reactRoot.id = 'aiden-react-root';
reactRoot.style.display = 'none'; // Hide until needed
document.body.appendChild(reactRoot);

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
      tempDiv.querySelectorAll('a, img, script, style, iframe, button, .latex').forEach(el => el.remove());
      
      // Get clean text with preserved line breaks
      content = tempDiv.innerText
        .replace(/\s+/g, ' ')
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

      const response = await chrome.runtime.sendMessage({
        action: "sendToAiden",
        data: {
          type: 'piazza_question',
          post_id: questionData.postId,
          llm_input: `Title: ${questionData.title}\nTags: ${questionData.tags.join(', ')}\nContent: ${questionData.content}`,
          metadata: {
            tags: questionData.tags,
            url: questionData.url
          }
        }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      displayAidenResponse(response);
    } catch (error) {
      console.error('AIDEN Error:', error);
      alert(`AIDEN Error: ${error.message}`);
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="icon-bolt"></i> Get AIDEN Response';
    }
  });
  
  controls.appendChild(button);
}

function displayAidenResponse(response) {
  const root = createRoot(document.getElementById('aiden-react-root'));
  reactRoot.style.display = 'block';
  
  root.render(
    <React.StrictMode>
      <ResponseModal 
        response={response} 
        onClose={() => {
          root.unmount();
          reactRoot.style.display = 'none';
        }}
        onSubmit={async (content) => {
          try {
            const { cookies } = await chrome.runtime.sendMessage({
              action: "getCookies"
            });
            
            if (cookies) {
              await submitToPiazza(content, cookies);
              root.unmount();
              reactRoot.style.display = 'none';
            } else {
              throw new Error('Failed to get authentication cookies');
            }
          } catch (error) {
            console.error('Submission error:', error);
            alert(`Submission failed: ${error.message}`);
          }
        }}
      />
    </React.StrictMode>
  );
}

async function submitToPiazza(content, cookies) {
  try {
    // Implementation would depend on Piazza's current API
    console.log('Submitting to Piazza with content:', content);
    // Here you would make the actual API call to Piazza
    // For example:
    // const response = await fetch(...);
    // if (!response.ok) throw new Error('Submission failed');
    return true;
  } catch (error) {
    console.error('Piazza submission error:', error);
    throw error;
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
    displayAidenResponse(request.response);
    sendResponse({success: true});
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
  const root = document.getElementById('aiden-react-root');
  if (root) root.style.display = 'none';
});