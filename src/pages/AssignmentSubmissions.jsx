import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { exportSessionAsTxt } from '@/utils/exportSession'

const PREVIEW_LENGTH = 120

export default function AssignmentSubmissions() {
  const { assignmentId } = useParams()
  const { user } = useAuth()
  const [assignment, setAssignment] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [previewSession, setPreviewSession] = useState(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const writeLink = assignmentId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/write/${assignmentId}`
    : ''

  useEffect(() => {
    if (!assignmentId || !user) return
    getDoc(doc(db, ASSIGNMENTS, assignmentId))
      .then((snap) => {
        if (!snap.exists()) {
          setError('Assignment not found')
          setAssignment(null)
          return
        }
        const data = { id: snap.id, ...snap.data() }
        if (data.teacherId !== user.uid) {
          setError('You do not have access to this assignment')
          setAssignment(null)
          return
        }
        setAssignment(data)
        setError(null)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load assignment')
        setAssignment(null)
      })
  }, [assignmentId, user])

  useEffect(() => {
    if (!assignmentId) return
    const q = query(
      collection(db, SESSIONS),
      where('assignmentId', '==', assignmentId)
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        setError(err.message || 'Failed to load submissions')
        setLoading(false)
      }
    )
    return () => unsub()
  }, [assignmentId])

  if (error && !assignment) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard">← Back to dashboard</Link>
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const submittedCount = sessions.filter((s) => s.status === 'locked').length

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard">← Back to dashboard</Link>
        </Button>
      </div>
      {assignment && (
        <Card>
          <CardContent className="pt-6">
            <h1 className="text-xl font-semibold">{assignment.name || 'Assignment'}</h1>
            <p className="mt-2 text-sm text-muted-foreground">ID: {assignment.id}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <strong className="text-sm">Student link:</strong>
              <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                {writeLink}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(writeLink).then(() => {
                    setLinkCopied(true)
                    setTimeout(() => setLinkCopied(false), 2000)
                  })
                }}
              >
                {linkCopied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            {assignment.promptText && (
              <div className="mt-2">
                <strong className="text-sm">Prompt:</strong>
                <p className="mt-1 whitespace-pre-wrap text-sm">{assignment.promptText}</p>
              </div>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              {sessions.length} session(s) · {submittedCount} submitted
            </p>
          </CardContent>
        </Card>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div>
        <h2 className="mb-2 text-lg font-semibold">Submissions</h2>
        {loading && sessions.length === 0 ? (
          <p className="text-muted-foreground">Loading submissions...</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted-foreground">No submissions yet for this assignment.</p>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Words</TableHead>
                <TableHead>Strikes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="max-w-[280px]">Preview</TableHead>
                <TableHead className="w-[140px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => {
                const text = session.content ?? ''
                const preview = text.length <= PREVIEW_LENGTH
                  ? text
                  : text.slice(0, PREVIEW_LENGTH) + '…'
                return (
                  <TableRow key={session.id}>
                    <TableCell>{session.studentId}</TableCell>
                    <TableCell>{session.studentName || '—'}</TableCell>
                    <TableCell>{session.wordCount ?? 0}</TableCell>
                    <TableCell>{session.strikeCount ?? 0}</TableCell>
                    <TableCell>{session.status === 'locked' ? 'Submitted' : 'Writing'}</TableCell>
                    <TableCell className="max-w-[280px]">
                      <span className="line-clamp-2 text-muted-foreground text-sm">
                        {preview || '—'}
                      </span>
                      {text.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-auto p-0 text-xs font-normal text-primary"
                          onClick={() => setPreviewSession(session)}
                        >
                          View full text
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => exportSessionAsTxt(session)}
                      >
                        Export .txt
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <Dialog
            open={!!previewSession}
            onOpenChange={(isOpen) => {
              if (!isOpen) setPreviewSession(null)
            }}
          >
            <DialogContent className="max-h-[80vh] max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {previewSession?.studentName || previewSession?.studentId} — submission
                </DialogTitle>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-4">
                <p className="whitespace-pre-wrap text-sm">
                  {previewSession?.content || '(No content)'}
                </p>
              </div>
            </DialogContent>
          </Dialog>
          </>
        )}
      </div>
    </div>
  )
}
