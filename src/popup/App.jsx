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
  }, []);

  const checkCookies = () => {
    setCookieStatus('checking');
    chrome.runtime.sendMessage({action: "getCookies"}, ({cookies}) => {
      setCookieStatus(cookies ? 'available' : 'unavailable');
    });
  };

  const handleGetResponse = (editedContent) => {
    setIsLoading(true);
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
          alert(`Error: ${response.error}`);
        } else {
          chrome.tabs.sendMessage(currentTab.id, {
            action: "displayResponse",
            response: response
          });
          window.close(); // Close the popup after sending the response
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
          <QuestionEditComponent
            data={questionData}
            onGetResponse={handleGetResponse}
            isLoading={isLoading}
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