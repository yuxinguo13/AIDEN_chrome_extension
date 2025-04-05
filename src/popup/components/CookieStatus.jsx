export default function CookieStatus({ status, onRefresh }) {
    const statusMessages = {
      checking: 'Checking cookie status...',
      available: 'Piazza cookies are available',
      unavailable: 'No Piazza cookies found. Please log in to Piazza.'
    };
  
    const statusColors = {
      checking: '#666',
      available: 'green',
      unavailable: 'red'
    };
  
    return (
      <div className="cookie-status">
        <h3>Piazza Cookies</h3>
        <p style={{ color: statusColors[status] }}>
          {statusMessages[status]}
        </p>
        <button 
          onClick={onRefresh}
          className="refresh-button"
        >
          Refresh Cookie Status
        </button>
      </div>
    );
  }