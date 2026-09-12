import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Register from './pages/Register'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import WorkspaceHome from './pages/WorkspaceHome'
import DocumentHub from './pages/DocumentHub'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './components/DashboardLayout'
import './App.css'

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
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
          
          {/* Default routes */}
          <Route path="/" element={<Navigate to="/workspace" replace />} />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  )
}

export default App
