import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Register from './pages/Register'
import Login from './pages/Login'
import WorkspaceHome from './pages/WorkspaceHome'
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
          
          {/* Default routes */}
          <Route path="/" element={<Navigate to="/workspace" replace />} />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  )
}

export default App
