import React from 'react';
import { createRoot } from 'react-dom/client';
import ResponseModal from '../src/popup/components/ResponseModal';

// Create a root element for React injection
const reactRoot = document.createElement('div');
reactRoot.id = 'aiden-react-root';
document.body.appendChild(reactRoot);

function extractQuestionData() {
  const postContent = document.querySelector('.question-content');
  if (!postContent) return null;

  const title = document.querySelector('.subject')?.textContent || '';
  const tags = Array.from(document.querySelectorAll('.folders-list .folder'))
    .map(el => el.textContent.trim());
  
  // Clean HTML content
  const content = postContent.innerHTML
    .replace(/<a[^>]*>([^<]*)<\/a>/g, '$1')
    .replace(/<img[^>]*>/g, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\n+/g, '\n')
    .trim();

  const postIdMatch = window.location.href.match(/cid=(\d+)/);
  const postId = postIdMatch ? postIdMatch[1] : null;

  return {
    postId,
    title,
    content,
    tags,
    url: window.location.href
  };
}

function addAidenButton() {
  const controls = document.querySelector('.post-actions');
  if (!controls || document.getElementById('aiden-button')) return;

  const button = document.createElement('button');
  button.id = 'aiden-button';
  button.className = 'btn btn-default';
  button.innerHTML = '<i class="icon-bolt"></i> Get AIDEN Response';
  button.style.marginLeft = '10px';
  
  button.addEventListener('click', () => {
    const questionData = extractQuestionData();
    chrome.runtime.sendMessage({
      action: "sendToAiden",
      data: {
        post_id: questionData.postId,
        llm_input: `Regarding ${questionData.tags.join(', ')}, ${questionData.title}. ${questionData.content}`,
        tags: questionData.tags
      }
    }, (response) => {
      if (response.error) {
        alert(`Error: ${response.error}`);
      } else {
        displayAidenResponse(response);
      }
    });
  });
  
  controls.appendChild(button);
}

function displayAidenResponse(response) {
  const root = createRoot(document.getElementById('aiden-react-root'));
  root.render(
    <React.StrictMode>
      <ResponseModal 
        response={response} 
        onClose={() => root.unmount()}
        onSubmit={(content) => {
          chrome.runtime.sendMessage({
            action: "getCookies"
          }, ({cookies}) => {
            if (cookies) {
              submitToPiazza(content, cookies);
            }
          });
        }}
      />
    </React.StrictMode>
  );
}

function submitToPiazza(content, cookies) {
  // Implementation would depend on Piazza's current API
  console.log('Submitting to Piazza with cookies:', cookies);
}

// Initialize
setTimeout(addAidenButton, 2000);