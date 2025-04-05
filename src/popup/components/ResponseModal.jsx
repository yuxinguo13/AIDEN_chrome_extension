import { useState } from 'react';

export default function ResponseModal({ response, onClose, onSubmit }) {
  const [editedContent, setEditedContent] = useState(response.output);

  return (
    <div className="response-modal-overlay">
      <div className="response-modal">
        <h3>AIDEN Response</h3>
        <div className="response-content">
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="response-textarea"
          />
        </div>
        <div className="modal-actions">
          <button 
            onClick={() => onSubmit(editedContent)}
            className="submit-button"
          >
            Submit to Piazza
          </button>
          <button 
            onClick={onClose}
            className="cancel-button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}