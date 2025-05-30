import { useEffect, useState } from 'react';
import { AppLogs } from 'applogs-sdk';
import './App.css';

interface LogMessage {
  id: number;
  text: string;
  timestamp: string;
}

function App() {
  const [logs, setLogs] = useState<LogMessage[]>([]);

  useEffect(() => {
    // Initialize AppLogs SDK
    const appLogs = new AppLogs({
      apiKey: import.meta.env.VITE_APP_LOGS_API_KEY,
      endpoint: import.meta.env.VITE_APP_LOGS_ENDPOINT
    });

    // Add some test logs
    const addLog = (text: string) => {
      setLogs((prev: LogMessage[]) => [...prev, {
        id: Date.now(),
        text,
        timestamp: new Date().toISOString()
      }]);
    };

    addLog('Application started');
    appLogs.info('Application started');
    
    addLog('Debug message');
    appLogs.debug('Debug message', { timestamp: new Date().toISOString() });
    
    addLog('Warning message');
    appLogs.warn('Warning message', { component: 'App' });
    
    // Simulate an error
    try {
      throw new Error('Test error');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Error: ${errorMessage}`);
      appLogs.error('Error occurred', { error });
    }
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>AppLogs SDK Browser Demo</h1>
      </header>
      <main className="app-main">
        <div className="log-container">
          <h2>Log Messages</h2>
          <div className="log-list">
            {logs.map((log: LogMessage) => (
              <div key={log.id} className="log-item">
                <span className="log-timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className="log-text">{log.text}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App; 