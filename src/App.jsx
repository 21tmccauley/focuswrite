import { Routes, Route } from 'react-router-dom'
import Home from '@/pages/home'
import Dashboard from '@/pages/dashboard'
import Write from '@/pages/write'
import AssignmentSubmissions from '@/pages/AssignmentSubmissions'

function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/assignment/:assignmentId" element={<AssignmentSubmissions />} />
        <Route path="/write/:assignmentId" element={<Write />} />
      </Routes>
    </div>
  )
}

export default App