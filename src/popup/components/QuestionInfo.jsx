export default function QuestionInfo({ data, isLoading }) {
  return (
    <div className="question-info">
      <h3>Current Question</h3>
      <div className="question-title">{data.title}</div>
      <div className="question-tags">
        Tags: {data.tags.join(', ')}
      </div>
    </div>
  );
}