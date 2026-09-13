import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { TaskQueueProvider } from './context/TaskQueueContext'
import { FeedbackProvider } from './context/FeedbackContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <TaskQueueProvider>
          <FeedbackProvider>
            <App />
          </FeedbackProvider>
        </TaskQueueProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)

