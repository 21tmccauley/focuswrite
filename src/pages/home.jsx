import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function Home() {
  const navigate = useNavigate()
  const [assignmentId, setAssignmentId] = useState('')

  function handleStudentSubmit(e) {
    e.preventDefault()
    const trimmedId = assignmentId.trim()
    if (!trimmedId) return
    navigate(`/write/${trimmedId}`)
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-4xl font-bold">Focus Write</h1>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild variant="default">
          <Link to="/dashboard">Teacher</Link>
        </Button>
      </div>

      <form onSubmit={handleStudentSubmit} className="w-full max-w-sm space-y-2 text-left">
        <label htmlFor="assignmentId" className="text-sm font-medium">
          Student assignment ID
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="assignmentId"
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
            placeholder="Paste assignment ID"
          />
          <Button type="submit" variant="secondary" disabled={!assignmentId.trim()}>
            Join
          </Button>
        </div>
      </form>
    </div>
  )
}

export default Home
