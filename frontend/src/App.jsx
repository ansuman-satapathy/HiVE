import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Register from './pages/Register'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import WorkspaceHome from './pages/WorkspaceHome'
import DocumentHub from './pages/DocumentHub'
import RetrievalPlayground from './pages/RetrievalPlayground'
import ChatWorkspace from './pages/ChatWorkspace'
import ProtectedRoute from './components/ProtectedRoute'
import PublicOnlyRoute from './components/PublicOnlyRoute'
import DashboardLayout from './components/DashboardLayout'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
          {/* Public auth routes - redirect to /workspace if already logged in */}
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
          <Route path="/onboarding" element={<Onboarding />} />
          
          {/* Protected workspace */}
          <Route 
            path="/workspace" 
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <WorkspaceHome />
                </DashboardLayout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/workspace/documents" 
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <DocumentHub />
                </DashboardLayout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/workspace/chat" 
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ChatWorkspace />
                </DashboardLayout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/workspace/retrieval" 
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <RetrievalPlayground />
                </DashboardLayout>
              </ProtectedRoute>
            } 
          />
          
          {/* Default routes */}
          <Route path="/" element={<Navigate to="/workspace" replace />} />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Routes>
    </Router>
  )
}

export default App
