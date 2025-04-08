import { useState, useEffect } from 'react';
import QuestionInfo from './components/QuestionInfo';
import QuestionEditComponent from './components/QuestionEditComponent';
import CookieStatus from './components/CookieStatus';
import './styles/App.css';

function App() {
  const [questionData, setQuestionData] = useState(null);
  const [cookieStatus, setCookieStatus] = useState('checking');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aidenStatus, setAidenStatus] = useState('idle'); // 'idle', 'requesting', 'thinking', 'ready'

  useEffect(() => {
    const checkPage = async () => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        
        if (tab.url.includes('piazza.com/class')) {
          const response = await chrome.tabs.sendMessage(
            tab.id, 
            {action: "getQuestionData"}
          );
          
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
    };

    checkPage();
    checkCookies();

    // Set up listener for status updates from content script or background
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "aidenStatusUpdate") {
        setAidenStatus(message.status);
      }
    });
  }, []);

  const checkAidenStatus = async (postId) => {
    try {
      const response = await fetch(`http://localhost:3000/get_response/${postId}`);
      const data = await response.json();
      
      if (data.status === 'processing') {
        setAidenStatus('thinking');
      } else if (response.status === 200 && !data.error) {
        setAidenStatus('ready');
      }
    } catch (error) {
      console.log('Status check error or request not started yet');
    }
  };

  const checkCookies = () => {
    setCookieStatus('checking');
    chrome.runtime.sendMessage({action: "getCookies"}, ({cookies}) => {
      setCookieStatus(cookies ? 'available' : 'unavailable');
    });
  };

  const handleTriggerAiden = () => {
    setIsLoading(true);
    setAidenStatus('requesting');
    
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const currentTab = tabs[0];
      chrome.tabs.sendMessage(currentTab.id, {
        action: "triggerAidenRequest"
      }, (response) => {
        setIsLoading(false);
        if (response?.error) {
          setError(`Error: ${response.error}`);
        }
      });
    });
  };

  const handleGetResponse = (editedContent) => {
    setIsLoading(true);
    setAidenStatus('requesting');
    
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const currentTab = tabs[0];
      chrome.runtime.sendMessage({
        action: "sendToAiden",
        data: {
          type: 'piazza_question',
          post_id: questionData.postId,
          llm_input: editedContent || `Title: ${questionData.title}\nTags: ${questionData.tags.join(', ')}\nContent: ${questionData.content}`,
          metadata: {
            tags: questionData.tags,
            url: questionData.url
          }
        }
      }, (response) => {
        setIsLoading(false);
        if (response.error) {
          setError(`Error: ${response.error}`);
        } else if (response.status === 'processing') {
          setAidenStatus('thinking');
        }
      });
    });
  };

  return (
    <div className="app-container">
      <h1>AIDEN Assistant</h1>
      
      {error ? (
        <div className="error-message">
          {error}
          {questionData && <div className="hidden-data" style={{display: 'none'}}>
            {JSON.stringify(questionData)}
          </div>}
        </div>
      ) : questionData ? (
        <>
          <QuestionInfo 
            data={questionData}
            isLoading={isLoading}
          />
          
          {aidenStatus === 'idle' && (
            <div className="status-container">
              <button 
                onClick={handleTriggerAiden}
                disabled={isLoading}
                className="action-button"
              >
                Generate AIDEN Response
              </button>
            </div>
          )}
          
          {aidenStatus === 'requesting' && (
            <div className="status-container status-requesting">
              <div className="spinner"></div>
              <p>Requesting AIDEN response...</p>
            </div>
          )}
          
          {aidenStatus === 'thinking' && (
            <div className="status-container status-thinking">
              <div className="spinner"></div>
              <p>AIDEN is thinking...</p>
            </div>
          )}
          
          {aidenStatus === 'ready' && (
            <div className="status-container status-ready">
              <div className="success-icon">✓</div>
              <p>AIDEN response has been generated!</p>
              <button 
                onClick={() => {
                  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, {
                      action: "insertAidenResponse",
                      postId: questionData.postId
                    });
                  });
                }}
                className="action-button insert-button"
              >
                Insert Response
              </button>
            </div>
          )}
          
          <QuestionEditComponent
            data={questionData}
            onGetResponse={handleGetResponse}
            isLoading={isLoading}
            aidenStatus={aidenStatus}
          />
        </>
      ) : (
        <div className="no-question">
          <p>Please navigate to a Piazza question page to use this extension.</p>
        </div>
      )}
      
      <CookieStatus 
        status={cookieStatus} 
        onRefresh={checkCookies} 
      />
    </div>
  );
}

export default App;