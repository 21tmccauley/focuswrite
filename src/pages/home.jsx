import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

function Home() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-4xl font-bold">Focus Write</h1>
      <p className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild variant="default">
          <Link to="/dashboard">Teacher</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/write/demo123">Student</Link>
        </Button>
      </p>
    </div>
  )
}

export default Home
