import { useState, useEffect } from 'react';
import CookieStatus from './components/CookieStatus';
import './styles/App.css';

function App() {
  const [cookieStatus, setCookieStatus] = useState('checking');

  useEffect(() => {
    checkCookies();
  }, []);

  const checkCookies = () => {
    chrome.runtime.sendMessage({ action: "getCookies" }, (response) => {
      setCookieStatus(response?.cookies ? 'available' : 'unavailable');
    });
  };

  return (
    <div className="app-container">
      <h1>
        <img 
          src="icons/AIDEN_Small.png" 
          width="24" 
          alt="AIDEN Logo" 
          style={{ marginRight: '8px' }} /* This adds the space */ 
        /> 
        AIDEN Assistant
      </h1>
      <p className="description">
        Use the <strong>✨ Get AIDEN Response</strong> button on the Piazza page to generate an answer.
      </p>
      
      <CookieStatus status={cookieStatus} onRefresh={checkCookies} />
    </div>
  );
}

export default App;