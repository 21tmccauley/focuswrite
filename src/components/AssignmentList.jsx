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
  const [assignmentsLoading, setAssignmentsLoading] = useState(true)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) {
      setAssignments([])
      setAssignmentsLoading(false)
      return
    }
    setAssignmentsLoading(true)
    const q = query(collection(db, ASSIGNMENTS), where('teacherId', '==', user.uid))
    const unsubAssignments = onSnapshot(
      q,
      (snap) => {
        setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setAssignmentsLoading(false)
      },
      (err) => {
        setError(err.message)
        setAssignmentsLoading(false)
      }
    )
    return () => unsubAssignments()
  }, [user])

  useEffect(() => {
    if (assignmentsLoading) return
    if (assignments.length === 0) {
      setSessions([])
      setSessionsLoading(false)
      return
    }

    setSessionsLoading(true)
    const assignmentIds = assignments.map((a) => a.id)
    const chunkSize = 10
    const idChunks = []
    for (let i = 0; i < assignmentIds.length; i += chunkSize) {
      idChunks.push(assignmentIds.slice(i, i + chunkSize))
    }

    const sessionsById = new Map()
    const initializedChunkIndexes = new Set()

    const unsubs = idChunks.map((chunk, chunkIndex) =>
      onSnapshot(
        query(collection(db, SESSIONS), where('assignmentId', 'in', chunk)),
        (snap) => {
          for (const [id, session] of sessionsById.entries()) {
            if (chunk.includes(session.assignmentId)) {
              sessionsById.delete(id)
            }
          }
          snap.docs.forEach((d) => {
            sessionsById.set(d.id, { id: d.id, ...d.data() })
          })
          setSessions(Array.from(sessionsById.values()))

          if (!initializedChunkIndexes.has(chunkIndex)) {
            initializedChunkIndexes.add(chunkIndex)
            if (initializedChunkIndexes.size === idChunks.length) {
              setSessionsLoading(false)
            }
          }
        },
        (err) => {
          setError(err.message)
          setSessionsLoading(false)
        }
      )
    )

    return () => {
      unsubs.forEach((unsub) => unsub())
    }
  }, [assignments, assignmentsLoading])

  const loading = assignmentsLoading || sessionsLoading

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
            assignment.name || assignment.promptText?.slice(0, 50) || assignment.id
          const truncated = (assignment.name ? false : (assignment.promptText?.length ?? 0) > 50) ? label + '…' : label
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
