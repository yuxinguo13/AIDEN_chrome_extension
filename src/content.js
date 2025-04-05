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

function extractQuestionData() {
  try {
    const postContent = document.querySelector('.question-content');
    if (!postContent) return null;

    const title = document.querySelector('.subject')?.textContent?.trim() || 'Untitled Post';
    const tags = Array.from(document.querySelectorAll('.folders-list .folder'))
      .map(el => el.textContent.trim())
      .filter(Boolean);

    // Clean HTML content more thoroughly
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = postContent.innerHTML;
    
    // Remove unwanted elements
    tempDiv.querySelectorAll('a, img, script, style, iframe').forEach(el => el.remove());
    
    // Get clean text content
    const content = tempDiv.textContent
      .replace(/\s+/g, ' ')
      .trim();

    const postIdMatch = window.location.href.match(/cid=(\d+)/);
    const postId = postIdMatch ? postIdMatch[1] : null;

    if (!postId) {
      console.warn('Could not extract post ID from URL');
      return null;
    }

    return {
      postId,
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

function addAidenButton() {
  const controls = document.querySelector('.post-actions');
  if (!controls || document.getElementById('aiden-button')) return;

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

// MutationObserver to handle dynamic content loading
const observer = new MutationObserver((mutations) => {
  if (document.querySelector('.post-actions')) {
    addAidenButton();
    observer.disconnect();
  }
});

// Initial setup
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  if (document.querySelector('.post-actions')) {
    addAidenButton();
  } else {
    observer.observe(document.body, OBSERVER_CONFIG);
  }
} else {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.post-actions')) {
      addAidenButton();
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