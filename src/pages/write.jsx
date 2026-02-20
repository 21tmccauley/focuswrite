import { useParams } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase'
import { ASSIGNMENTS, SESSIONS, DEFAULT_STRIKE_LIMIT } from '@/firebase-collections'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

function Write() {
  const { assignmentId } = useParams()
  const [phase, setPhase] = useState('loading') // 'loading' | 'entry' | 'writing' | 'submitted'
  const [error, setError] = useState(null)

  const [assignment, setAssignment] = useState(null)
  const [studentId, setStudentId] = useState('')
  const [studentName, setStudentName] = useState('')

  const [sessionId, setSessionId] = useState(null)
  const [content, setContent] = useState('')
  const [strikeCount, setStrikeCount] = useState(0)
  const [status, setStatus] = useState('active')

  const [submitting, setSubmitting] = useState(false)
  const [submittingSession, setSubmittingSession] = useState(false)
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false)
  const [strikeModalOpen, setStrikeModalOpen] = useState(false)
  const [pendingStrikeConfirmOpen, setPendingStrikeConfirmOpen] = useState(false)
  const lastStrikeTimeRef = useRef(0)
  const strikeDebounceMs = 800
  const contentRef = useRef(content)
  const strikeCountRef = useRef(strikeCount)
  const applyStrikeRef = useRef(null)
  contentRef.current = content
  strikeCountRef.current = strikeCount

  const strikeLimit = assignment?.strikeLimit ?? DEFAULT_STRIKE_LIMIT
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length

  useEffect(() => {
    if (!assignmentId) {
      setError('Missing assignment ID')
      setPhase('entry')
      return
    }
    getDoc(doc(db, ASSIGNMENTS, assignmentId))
      .then((snap) => {
        if (!snap.exists()) {
          setError('Invalid assignment')
          setPhase('entry')
          return
        }
        setAssignment({ id: snap.id, ...snap.data() })
        setError(null)
        setPhase('entry')
      })
      .catch((err) => {
        setError(err.message || 'Failed to load assignment')
        setPhase('entry')
      })
  }, [assignmentId])

  useEffect(() => {
    if (phase !== 'writing' || status !== 'active' || !sessionId) return

    function applyStrike() {
      if (Date.now() - lastStrikeTimeRef.current < strikeDebounceMs) return
      lastStrikeTimeRef.current = Date.now()
      const currentStrike = strikeCountRef.current
      const currentContent = contentRef.current
      const currentWordCount = currentContent.trim().split(/\s+/).filter(Boolean).length
      const limit = assignment?.strikeLimit ?? DEFAULT_STRIKE_LIMIT

      if (currentStrike + 1 >= limit) {
        const sessionRef = doc(db, SESSIONS, sessionId)
        updateDoc(sessionRef, {
          content: currentContent,
          wordCount: currentWordCount,
          strikeCount: limit,
          status: 'locked',
          submittedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
          .then(() => {
            setStatus('locked')
            setStrikeCount(limit)
            setPhase('submitted')
            setContent(currentContent)
            document.exitFullscreen?.()
          })
          .catch((err) => setError(err.message || 'Failed to submit'))
        return
      }

      setStrikeCount((c) => c + 1)
      updateDoc(doc(db, SESSIONS, sessionId), {
        strikeCount: currentStrike + 1,
        updatedAt: serverTimestamp(),
      }).catch((err) => setError(err.message || 'Strike not saved'))
      setStrikeModalOpen(true)
    }

    applyStrikeRef.current = applyStrike

    function maybeShowConfirm() {
      if (Date.now() - lastStrikeTimeRef.current < strikeDebounceMs) return
      lastStrikeTimeRef.current = Date.now()
      setPendingStrikeConfirmOpen(true)
    }

    function onVisibilityOrBlur() {
      if (document.visibilityState === 'hidden') maybeShowConfirm()
    }
    function onBlur() {
      maybeShowConfirm()
    }
    function onFullscreenChange() {
      if (document.fullscreenElement != null) return
      maybeShowConfirm()
    }

    document.addEventListener('visibilitychange', onVisibilityOrBlur)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityOrBlur)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      applyStrikeRef.current = null
    }
  }, [phase, status, sessionId, assignment?.strikeLimit])

  useEffect(() => {
    if (status !== 'active' || !sessionId) return
    const interval = setInterval(() => {
      const wc = contentRef.current.trim().split(/\s+/).filter(Boolean).length
      updateDoc(doc(db, SESSIONS, sessionId), {
        content: contentRef.current,
        wordCount: wc,
        strikeCount: strikeCountRef.current,
        updatedAt: serverTimestamp(),
      }).catch(() => {})
    }, 4000)
    return () => clearInterval(interval)
  }, [status, sessionId])

  function handleEntrySubmit(e) {
    e?.preventDefault()
    const trimmed = studentId.trim()
    if (!trimmed) return
    setError(null)
    setSubmitting(true)
    const normalizedStudentId = trimmed.replace(/\s+/g, '')
    const sid = assignmentId + '_' + normalizedStudentId
    setSessionId(sid)

    getDoc(doc(db, SESSIONS, sid))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data()
          if (data.status === 'locked') {
            setPhase('submitted')
            return
          }
          if (data.status === 'active') {
            setContent(data.content ?? '')
            setStrikeCount(data.strikeCount ?? 0)
            setStatus(data.status)
            setPhase('writing')
            requestFullscreen()
            return
          }
        }
        return setDoc(doc(db, SESSIONS, sid), {
          assignmentId,
          studentId: trimmed,
          studentName: studentName.trim() || null,
          content: '',
          wordCount: 0,
          strikeCount: 0,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).then(() => {
          setContent('')
          setStrikeCount(0)
          setStatus('active')
          setPhase('writing')
          requestFullscreen()
        })
      })
      .catch((err) => {
        setError(err.message || 'Failed to start session')
      })
      .finally(() => setSubmitting(false))
  }

  function handleSubmitSession() {
    if (!sessionId || status !== 'active') return
    setSubmittingSession(true)
    setSubmitConfirmOpen(false)
    const currentContent = contentRef.current
    const currentWordCount = currentContent.trim().split(/\s+/).filter(Boolean).length
    const sessionRef = doc(db, SESSIONS, sessionId)
    updateDoc(sessionRef, {
      content: currentContent,
      wordCount: currentWordCount,
      strikeCount: strikeCountRef.current,
      status: 'locked',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
      .then(() => {
        setStatus('locked')
        setPhase('submitted')
        setContent(currentContent)
        document.exitFullscreen?.()
      })
      .catch((err) => setError(err.message || 'Failed to submit'))
      .finally(() => setSubmittingSession(false))
  }

  function requestFullscreen() {
    document.documentElement.requestFullscreen().catch(() => {})
  }

  if (phase === 'loading') {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Loading assignment...</p>
      </div>
    )
  }

  if (phase === 'submitted') {
    return (
      <div className="space-y-2 py-8 text-center">
        <h1 className="text-2xl font-semibold">Already submitted</h1>
        <p className="text-muted-foreground">You have already been submitted for this assignment.</p>
      </div>
    )
  }

  if (phase === 'entry' && error && !assignment) {
    return (
      <div className="space-y-2 py-8 text-center">
        <h1 className="text-2xl font-semibold">Invalid assignment</h1>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div>
      {/* Student entry modal */}
      <Dialog open={phase === 'entry' && !!assignment}>
        <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Enter your details</DialogTitle>
          </DialogHeader>
          {error && (
            <Alert variant="destructive" className="mb-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleEntrySubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="studentId">Student ID (required)</Label>
              <Input
                id="studentId"
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Student ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studentName">Name (optional, for display)</Label>
              <Input
                id="studentName"
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <Button type="submit" disabled={!studentId.trim() || submitting}>
              {submitting ? 'Starting...' : 'Continue'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm before counting strike */}
      <Dialog open={pendingStrikeConfirmOpen} onOpenChange={setPendingStrikeConfirmOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Leave testing environment?</DialogTitle>
            <DialogDescription>
              Did you leave the testing environment? This will count as a strike. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPendingStrikeConfirmOpen(false)
                requestFullscreen()
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setPendingStrikeConfirmOpen(false)
                applyStrikeRef.current?.()
              }}
            >
              Count as strike
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Strike warning modal */}
      <Dialog open={strikeModalOpen} onOpenChange={setStrikeModalOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">Strike recorded</DialogTitle>
            <DialogDescription>
              You left the tab or window. This is strike {strikeCount} of {strikeLimit}. Stay in this window.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setStrikeModalOpen(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit confirmation */}
      <Dialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Submit your work?</DialogTitle>
            <DialogDescription>
              Your response will be locked and you won&apos;t be able to edit it after submitting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setSubmitConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmitSession} disabled={submittingSession}>
              {submittingSession ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Writing room */}
      {phase === 'writing' && (
        <div className="space-y-4 text-left">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <h1 className="text-2xl font-semibold">Writing room</h1>
          <p className="text-muted-foreground">Assignment: {assignmentId}</p>
          {studentName.trim() ? (
            <p className="text-muted-foreground">Welcome, {studentName.trim()}!</p>
          ) : (
            <p className="text-muted-foreground">Student ID: {studentId}</p>
          )}

          {assignment?.promptText && (
            <Card>
              <CardContent className="pt-6">
                <strong>Prompt:</strong>
                <p className="mt-2 whitespace-pre-wrap text-sm">{assignment.promptText}</p>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-4">
            <span className="text-sm">Words: {wordCount}</span>
            <span
              className={cn(
                'text-sm',
                strikeCount > 0 && 'font-semibold text-destructive'
              )}
            >
              Strikes: {strikeCount} / {strikeLimit}
            </span>
          </div>

          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={(e) => e.preventDefault()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
            placeholder="Start writing here..."
            rows={10}
            className="max-w-[600px]"
          />
          <Button
            type="button"
            onClick={() => setSubmitConfirmOpen(true)}
            disabled={submittingSession || status !== 'active'}
          >
            {submittingSession ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      )}
    </div>
  )
}

export default Write
