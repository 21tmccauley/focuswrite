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

function exportSessionAsTxt(session) {
  const namePart = session.studentName ? `${session.studentId}_${session.studentName}` : session.studentId
  const filename = `${namePart.replace(/\s+/g, '_')}_submission.txt`
  const body = session.content || ''
  const blob = new Blob([body], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function MonitorTable() {
  const { user } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const assignmentIds = assignments.map((a) => a.id)

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
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setSessions(list)
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return () => unsubSessions()
  }, [])

  const filteredSessions = sessions.filter((s) => assignmentIds.includes(s.assignmentId))
  const assignmentMap = Object.fromEntries(assignments.map((a) => [a.id, a]))

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

  if (filteredSessions.length === 0) {
    return (
      <p className="text-muted-foreground">
        No submissions yet. Create an assignment and share the link with students. Sessions will appear here in real time.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Assignment</TableHead>
          <TableHead>Student ID</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Words</TableHead>
          <TableHead>Strikes</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[100px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredSessions.map((session) => (
          <TableRow key={session.id}>
            <TableCell>
              {assignmentMap[session.assignmentId]?.promptText?.slice(0, 30) || session.assignmentId}
              {assignmentMap[session.assignmentId]?.promptText?.length > 30 ? '…' : ''}
            </TableCell>
            <TableCell>{session.studentId}</TableCell>
            <TableCell>{session.studentName || '—'}</TableCell>
            <TableCell>{session.wordCount ?? 0}</TableCell>
            <TableCell>{session.strikeCount ?? 0}</TableCell>
            <TableCell>{session.status === 'locked' ? 'Submitted' : 'Writing'}</TableCell>
            <TableCell>
              <Button type="button" variant="outline" size="sm" onClick={() => exportSessionAsTxt(session)}>
                Export .txt
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
