import { useState, useEffect } from 'react';
import QuestionInfo from './components/QuestionInfo';
import QuestionEditComponent from './components/QuestionEditComponent'; // Import the new component
import CookieStatus from './components/CookieStatus';
import './styles/App.css';

function App() {
  const [questionData, setQuestionData] = useState(null);
  const [cookieStatus, setCookieStatus] = useState('checking');
  const [aidenStatus, setAidenStatus] = useState('idle'); // 'idle', 'thinking', 'ready', 'not_found'
  const [error, setError] = useState(null);
  const [tabId, setTabId] = useState(null);

  // This effect runs once to initialize the extension popup
  useEffect(() => {
    const init = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        setTabId(tab.id);

        if (tab.url && tab.url.includes('piazza.com/class')) {
          const response = await chrome.tabs.sendMessage(tab.id, { action: "getQuestionData" });
          if (response?.postId) {
            setQuestionData(response);
            checkAidenStatus(response.postId); // Check if a response already exists
          } else {
            setError('Could not extract question data from the page. Make sure you are on a specific post.');
          }
        } else {
          setError('This extension only works on a Piazza class question page.');
        }
      } catch (err) {
        setError('Failed to communicate with the Piazza page. Please refresh the page and try again.');
        console.error("Initialization error:", err);
      }
      checkCookies();
    };

    init();
  }, []);

  const checkCookies = () => {
    setCookieStatus('checking');
    chrome.runtime.sendMessage({ action: "getCookies" }, (response) => {
      setCookieStatus(response?.cookies ? 'available' : 'unavailable');
    });
  };

  const checkAidenStatus = async (postId) => {
    try {
      const response = await fetch(`http://localhost:3000/get_response/${postId}`);
      if (response.status === 404) {
        setAidenStatus('not_found');
      } else if (response.ok) {
        const data = await response.json();
        setAidenStatus(data?.response ? 'ready' : 'not_found');
      } else {
        setAidenStatus('not_found');
      }
    } catch (error) {
      setError('Could not connect to the AIDEN backend.');
      setAidenStatus('idle');
    }
  };

  const handleGetResponse = (editedQuestionText) => {
    if (!questionData?.postId) return;

    const payload = {
      post_id: questionData.postId,
      llm_input: editedQuestionText, // Use the edited text from the component
      metadata: {
        tags: questionData.tags,
        url: questionData.url
      }
    };
    
    setAidenStatus('thinking');
    
    chrome.runtime.sendMessage({ action: "triggerGeneration", payload }, () => {
        // After triggering, start polling for the result
        const pollInterval = setInterval(async () => {
            const res = await fetch(`http://localhost:3000/get_response/${questionData.postId}`);
            if(res.ok) {
                const data = await res.json();
                if (data?.response) {
                    clearInterval(pollInterval);
                    setAidenStatus('ready');
                }
            }
        }, 3000); // Poll every 3 seconds
    });
  };

  const insertResponse = () => {
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        action: "insertAidenResponse",
        postId: questionData.postId
      });
    }
  };

  const renderContent = () => {
    if (error) {
      return <div className="error-message">{error}</div>;
    }
    if (!questionData) {
      return <div className="no-question"><div className="spinner"></div><p>Loading question data...</p></div>;
    }

    return (
      <>
        <QuestionInfo data={questionData} />

        {aidenStatus === 'ready' ? (
          <div className="status-container status-ready">
            <div className="success-icon">✓</div>
            <p>AIDEN response is ready!</p>
            <button onClick={insertResponse} className="action-button insert-button">
              Insert Response into Piazza
            </button>
          </div>
        ) : (
          <QuestionEditComponent 
            data={questionData} 
            onGetResponse={handleGetResponse} 
            isLoading={aidenStatus === 'thinking'}
          />
        )}
      </>
    );
  };

  return (
    <div className="app-container">
      <h1>AIDEN Assistant</h1>
      {renderContent()}
      <CookieStatus status={cookieStatus} onRefresh={checkCookies} />
    </div>
  );
}

export default App;