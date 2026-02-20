import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase'
import { ASSIGNMENTS, SESSIONS } from '@/firebase-collections'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function AssignmentList() {
  const { user } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, ASSIGNMENTS), where('teacherId', '==', user.uid))
    const unsubAssignments = onSnapshot(
      q,
      (snap) => {
        setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return () => unsubAssignments()
  }, [user])

  useEffect(() => {
    const unsubSessions = onSnapshot(
      collection(db, SESSIONS),
      (snap) => {
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return () => unsubSessions()
  }, [])

  const assignmentIds = new Set(assignments.map((a) => a.id))
  const sessionsByAssignment = sessions
    .filter((s) => assignmentIds.has(s.assignmentId))
    .reduce((acc, s) => {
      acc[s.assignmentId] = (acc[s.assignmentId] || 0) + 1
      return acc
    }, {})

  const sortedAssignments = [...assignments].sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() ?? 0
    const bTime = b.createdAt?.toMillis?.() ?? 0
    return bTime - aTime
  })

  if (loading && assignments.length === 0) {
    return <p className="text-muted-foreground">Loading assignments...</p>
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }
  if (sortedAssignments.length === 0) {
    return (
      <p className="text-muted-foreground">
        No assignments yet. Create one above and share the link with students.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Assignment</TableHead>
          <TableHead>Submissions</TableHead>
          <TableHead className="w-[140px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedAssignments.map((assignment) => {
          const count = sessionsByAssignment[assignment.id] ?? 0
          const label =
            assignment.promptText?.slice(0, 50) || assignment.id
          const truncated = (assignment.promptText?.length ?? 0) > 50 ? label + '…' : label
          return (
            <TableRow key={assignment.id}>
              <TableCell className="font-medium">{truncated}</TableCell>
              <TableCell>{count}</TableCell>
              <TableCell>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/dashboard/assignment/${assignment.id}`}>View submissions</Link>
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
