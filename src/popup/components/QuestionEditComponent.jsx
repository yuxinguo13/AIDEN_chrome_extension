import { useState, useEffect } from 'react';

export default function QuestionEditComponent({ data, onGetResponse, isLoading }) {
  const [editedQuestion, setEditedQuestion] = useState('');
  
  // Initialize the edited question when data changes
  useEffect(() => {
    if (data) {
      const formattedQuestion = `Title: ${data.title}\nTags: ${data.tags.join(', ')}\nContent: ${data.content}`;
      setEditedQuestion(formattedQuestion);
    }
  }, [data]);

  return (
    <div className="question-editor">
      <h3>Edit Question</h3>
      
      <textarea
        className="question-textarea"
        value={editedQuestion}
        onChange={(e) => setEditedQuestion(e.target.value)}
        rows={8}
        placeholder="Question content will appear here..."
      />
      
      <button 
        onClick={() => onGetResponse(editedQuestion)}
        disabled={isLoading}
        className="action-button"
      >
        {isLoading ? 'Generating...' : 'Get AIDEN Response'}
      </button>
    </div>
  );
}