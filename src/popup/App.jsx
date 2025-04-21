import { useState, useEffect } from 'react';
import QuestionInfo from './components/QuestionInfo';
import CookieStatus from './components/CookieStatus';
import './styles/App.css';

function App() {
  const [questionData, setQuestionData] = useState(null);
  const [cookieStatus, setCookieStatus] = useState('checking');
  const [aidenStatus, setAidenStatus] = useState('idle'); // 'idle', 'thinking', 'ready', 'not_found'
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab.url.includes('piazza.com/class')) {
          const response = await chrome.tabs.sendMessage(tab.id, { action: "getQuestionData" });

          if (response?.postId) {
            setQuestionData(response);
            checkAidenStatus(response.postId);
          } else {
            setError('Could not extract question data from this page');
          }
        } else {
          setError('Please open a Piazza question page');
        }
      } catch (err) {
        setError('Error communicating with content script');
        console.error(err);
      }

      checkCookies();
    };

    init();
  }, []);

  const checkCookies = () => {
    setCookieStatus('checking');
    chrome.runtime.sendMessage({ action: "getCookies" }, (response) => {
      const cookies = response?.cookies;
      setCookieStatus(cookies ? 'available' : 'unavailable');
    });
  };

  const checkAidenStatus = async (postId) => {
    try {
      const response = await fetch(`http://localhost:3000/get_response/${postId}`);
      if (response.status === 404) {
        setAidenStatus('not_found');
        return;
      }
      const data = await response.json();

      if (data.status === 'processing') {
        setAidenStatus('thinking');
      } else if (data.response) {
        setAidenStatus('ready');
      } else {
        setAidenStatus('idle');
      }
    } catch (error) {
      console.log('Status check error:', error);
      setAidenStatus('idle');
    }
  };

  const requestAidenGeneration = async () => {
    if (!questionData?.postId) return;
  
    const payload = {
      post_id: questionData.postId,
      llm_input: `Title: ${questionData.title}\nTags: ${questionData.tags.join(', ')}\nContent: ${questionData.content}`,
      metadata: {
        tags: questionData.tags,
        url: questionData.url
      }
    };
  
    try {
      // Set to thinking **before** firing off generation
      setAidenStatus('thinking');
  
      await fetch('http://localhost:3000/generate_response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
  
      // Poll until response is ready
      const pollInterval = setInterval(async () => {
        const res = await fetch(`http://localhost:3000/get_response/${questionData.postId}`);
        const data = await res.json();
  
        if (data?.response) {
          clearInterval(pollInterval);
          setAidenStatus('ready');
        } else if (data.status === 'not_found') {
          clearInterval(pollInterval);
          setAidenStatus('not_found');
        } else {
          setAidenStatus('thinking');  // ensure rerender in loop
        }
      }, 4000);
    } catch (e) {
      console.error(e);
      setError('Failed to trigger AIDEN response generation.');
      setAidenStatus('not_found');
    }
  };

  const insertResponse = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0].id;
  
      chrome.tabs.sendMessage(tabId, {
        action: "getQuestionData"
      }, (response) => {
        if (!response || !response.postId) {
          setError("Unable to fetch question data from page.");
          return;
        }
  
        // Try fetching the response
        fetch(`http://localhost:3000/get_response/${response.postId}`)
          .then(res => res.json())
          .then(data => {
            if (data?.response) {
              // Send to content script to insert immediately
              chrome.tabs.sendMessage(tabId, {
                action: "insertAidenResponse",
                ...response
              });
            } else {
              // Start polling
              setAidenStatus("thinking");
  
              const pollInterval = setInterval(async () => {
                const res = await fetch(`http://localhost:3000/get_response/${response.postId}`);
                const updated = await res.json();
  
                if (updated?.response) {
                  clearInterval(pollInterval);
                  setAidenStatus("ready");
  
                  chrome.tabs.sendMessage(tabId, {
                    action: "insertAidenResponse",
                    ...response
                  });
                }
              }, 5000);
            }
          })
          .catch(err => {
            console.error("Error checking response:", err);
            setError("Failed to fetch or insert response.");
          });
      });
    });
  };
  

  return (
    <div className="app-container">
      <h1>AIDEN Assistant</h1>

      {error ? (
        <div className="error-message">{error}</div>
      ) : questionData ? (
        <>
          <QuestionInfo data={questionData} />

          {aidenStatus === 'thinking' && (
            <div className="status-container status-thinking">
              <div className="spinner"></div>
              <p>AIDEN is thinking...</p>
            </div>
          )}

          {aidenStatus === 'ready' && (
            <div className="status-container status-ready">
              <div className="success-icon">✓</div>
              <p>AIDEN response is ready!</p>
              <button onClick={insertResponse} className="action-button insert-button">
                Insert Response
              </button>
            </div>
          )}

          {aidenStatus === 'not_found' && (
            <div className="status-container status-requesting">
              <p>No existing AIDEN response found.</p>
              <button onClick={requestAidenGeneration} className="action-button">
                Generate and Insert Response
              </button>
            </div>
          )}

          {aidenStatus === 'idle' && (
            <p>Waiting for AIDEN to process the question. Please try again shortly.</p>
          )}
        </>
      ) : (
        <div className="no-question">
          <p>Please navigate to a Piazza question page to use this extension.</p>
        </div>
      )}

      <CookieStatus status={cookieStatus} onRefresh={checkCookies} />
    </div>
  );
}

export default App;