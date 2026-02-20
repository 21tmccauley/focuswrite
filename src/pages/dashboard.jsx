import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import CreateAssignment from '@/components/CreateAssignment'
import AssignmentList from '@/components/AssignmentList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function Dashboard() {
  const { user, loading, signInWithGoogle, signOut } = useAuth()

  if (loading) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-8 text-center">
        <Card>
          <CardHeader>
            <CardTitle>Teacher dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Sign in to create assignments and monitor submissions.
            </p>
            <Button type="button" onClick={signInWithGoogle}>
              Sign in with Google
            </Button>
            <p className="pt-2">
              <Button asChild variant="link">
                <Link to="/">← Back to Home</Link>
              </Button>
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Teacher dashboard</h1>
        <nav className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Home</Link>
          </Button>
          <span className="text-muted-foreground text-sm">{user.email}</span>
          <Button type="button" variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </nav>
      </header>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Create assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateAssignment />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            <AssignmentList />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

export default Dashboard
