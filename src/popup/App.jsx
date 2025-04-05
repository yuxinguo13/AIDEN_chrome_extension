import { useState, useEffect } from 'react';
import QuestionInfo from './components/QuestionInfo';
import CookieStatus from './components/CookieStatus';
import './styles/App.css';

function App() {
  const [questionData, setQuestionData] = useState(null);
  const [cookieStatus, setCookieStatus] = useState('checking');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Get current tab info
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab.url.includes('piazza.com/class')) {
        chrome.tabs.sendMessage(
          currentTab.id, 
          {action: "getQuestionData"}, 
          (response) => setQuestionData(response)
        );
      }
    });

    // Check cookie status
    checkCookies();
  }, []);

  const checkCookies = () => {
    setCookieStatus('checking');
    chrome.runtime.sendMessage({action: "getCookies"}, ({cookies}) => {
      setCookieStatus(cookies ? 'available' : 'unavailable');
    });
  };

  const handleGetResponse = () => {
    setIsLoading(true);
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const currentTab = tabs[0];
      chrome.tabs.sendMessage(
        currentTab.id, 
        {action: "getQuestionData"}, 
        (questionData) => {
          chrome.runtime.sendMessage({
            action: "sendToAiden",
            data: {
              post_id: questionData.postId,
              llm_input: `Regarding ${questionData.tags.join(', ')}, ${questionData.title}. ${questionData.content}`,
              tags: questionData.tags
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
            }
          });
        }
      );
    });
  };

  return (
    <div className="app-container">
      <h1>AIDEN Assistant</h1>
      
      {questionData ? (
        <QuestionInfo 
          data={questionData} 
          onGetResponse={handleGetResponse}
          isLoading={isLoading}
        />
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