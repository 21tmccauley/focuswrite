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

const FULLSCREEN_RETURN_SECONDS = 10

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
  const [autosaveError, setAutosaveError] = useState(null)
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false)
  const [fullscreenWarningOpen, setFullscreenWarningOpen] = useState(false)
  const [fullscreenCountdown, setFullscreenCountdown] = useState(FULLSCREEN_RETURN_SECONDS)
  const [fullscreenViolationCount, setFullscreenViolationCount] = useState(0)
  const [isFullscreenActive, setIsFullscreenActive] = useState(false)
  const lastStrikeTimeRef = useRef(0)
  const strikeDebounceMs = 800
  const contentRef = useRef(content)
  const strikeCountRef = useRef(strikeCount)
  const fullscreenCountdownIntervalRef = useRef(null)
  const fullscreenViolationCountRef = useRef(0)
  const hasEnteredFullscreenRef = useRef(false)
  contentRef.current = content
  strikeCountRef.current = strikeCount
  fullscreenViolationCountRef.current = fullscreenViolationCount

  const strikeLimit = assignment?.strikeLimit ?? DEFAULT_STRIKE_LIMIT
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length

  function clearFullscreenCountdown() {
    if (!fullscreenCountdownIntervalRef.current) return
    clearInterval(fullscreenCountdownIntervalRef.current)
    fullscreenCountdownIntervalRef.current = null
  }

  function requestFullscreen() {
    if (isFullscreenActiveNow()) return Promise.resolve(true)
    if (!document.documentElement.requestFullscreen) return Promise.resolve(false)
    return document.documentElement
      .requestFullscreen()
      .then(() => isFullscreenActiveNow())
      .catch(() => false)
  }

  function isFullscreenActiveNow() {
    const domFullscreen = document.fullscreenElement != null
    const displayModeFullscreen =
      typeof window !== 'undefined' && window.matchMedia?.('(display-mode: fullscreen)').matches
    const screenWidth = window.screen?.width ?? 0
    const screenHeight = window.screen?.height ?? 0
    const viewportFullscreen =
      Math.abs(window.innerWidth - screenWidth) <= 4
      && Math.abs(window.innerHeight - screenHeight) <= 4
    return domFullscreen || displayModeFullscreen || viewportFullscreen
  }

  function lockWithWarningAndCountdown() {
    setFullscreenWarningOpen(true)
    setFullscreenCountdown(FULLSCREEN_RETURN_SECONDS)
    clearFullscreenCountdown()
    fullscreenCountdownIntervalRef.current = setInterval(() => {
      setFullscreenCountdown((seconds) => {
        if (seconds <= 1) {
          clearFullscreenCountdown()
          handleSubmitSession({
            autoSubmit: true,
            forceStrikeCount: Math.max(2, strikeCountRef.current),
          })
          return 0
        }
        return seconds - 1
      })
    }, 1000)
  }

  function handleFullscreenViolation() {
    const nextViolationCount = fullscreenViolationCountRef.current + 1
    setFullscreenViolationCount(nextViolationCount)
    setStrikeCount((prev) => {
      const next = Math.max(prev, nextViolationCount)
      updateDoc(doc(db, SESSIONS, sessionId), {
        teacherId: assignment?.teacherId ?? null,
        strikeCount: next,
        updatedAt: serverTimestamp(),
      }).catch((err) => setError(err.message || 'Failed to record fullscreen violation'))
      return next
    })

    if (nextViolationCount >= 2) {
      handleSubmitSession({
        autoSubmit: true,
        forceStrikeCount: Math.max(2, strikeCountRef.current),
      })
      return
    }

    lockWithWarningAndCountdown()
  }

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

    function maybeCountFullscreenViolation() {
      if (!hasEnteredFullscreenRef.current) return
      if (Date.now() - lastStrikeTimeRef.current < strikeDebounceMs) return
      lastStrikeTimeRef.current = Date.now()
      handleFullscreenViolation()
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') maybeCountFullscreenViolation()
    }
    function onBlur() {
      maybeCountFullscreenViolation()
    }
    function onFullscreenChange() {
      const active = isFullscreenActiveNow()
      setIsFullscreenActive(active)
      if (active) hasEnteredFullscreenRef.current = true
      if (!active && !fullscreenWarningOpen) maybeCountFullscreenViolation()
      if (active) {
        setFullscreenWarningOpen(false)
        clearFullscreenCountdown()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [phase, status, sessionId, fullscreenWarningOpen])

  useEffect(() => {
    if (phase !== 'writing' || status !== 'active') return
    requestFullscreen().then((ok) => {
      const active = isFullscreenActiveNow()
      setIsFullscreenActive(active)
      if (active) hasEnteredFullscreenRef.current = true
      if (!ok || !active) {
        lockWithWarningAndCountdown()
      }
    })
  }, [phase, status])

  useEffect(() => {
    return () => clearFullscreenCountdown()
  }, [])

  useEffect(() => {
    if (phase !== 'writing' || status !== 'active') return
    function blockClipboard(e) {
      e.preventDefault()
    }
    function blockClipboardShortcuts(e) {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'c' || key === 'v' || key === 'x') {
        e.preventDefault()
      }
    }

    document.addEventListener('copy', blockClipboard)
    document.addEventListener('cut', blockClipboard)
    document.addEventListener('paste', blockClipboard)
    document.addEventListener('keydown', blockClipboardShortcuts)
    return () => {
      document.removeEventListener('copy', blockClipboard)
      document.removeEventListener('cut', blockClipboard)
      document.removeEventListener('paste', blockClipboard)
      document.removeEventListener('keydown', blockClipboardShortcuts)
    }
  }, [phase, status])

  useEffect(() => {
    if (status !== 'active' || !sessionId) return
    const interval = setInterval(() => {
      const wc = contentRef.current.trim().split(/\s+/).filter(Boolean).length
      updateDoc(doc(db, SESSIONS, sessionId), {
        teacherId: assignment?.teacherId ?? null,
        content: contentRef.current,
        wordCount: wc,
        strikeCount: strikeCountRef.current,
        updatedAt: serverTimestamp(),
      })
        .then(() => {
          setAutosaveError(null)
        })
        .catch(() => {
          setAutosaveError((prev) => prev ?? 'Autosave is retrying. Keep writing and stay on this page.')
        })
    }, 4000)
    return () => clearInterval(interval)
  }, [status, sessionId, assignment?.teacherId])

  function handleEntrySubmit(e) {
    e?.preventDefault()
    const trimmed = studentId.trim()
    if (!trimmed) return
    setError(null)
    setSubmitting(true)
    const normalizedStudentId = trimmed.replace(/\s+/g, '')
    const sid = assignmentId + '_' + normalizedStudentId
    const sessionRef = doc(db, SESSIONS, sid)
    setSessionId(sid)
    setStudentId(normalizedStudentId)

    const startWriting = () => {
      setContent('')
      setStrikeCount(0)
      setFullscreenViolationCount(0)
      setStatus('active')
      setPhase('writing')
    }

    const tryCreateSession = () =>
      setDoc(sessionRef, {
        assignmentId,
        studentId: normalizedStudentId,
        teacherId: assignment?.teacherId ?? null,
        studentName: studentName.trim() || null,
        content: '',
        wordCount: 0,
        strikeCount: 0,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

    requestFullscreen()
      .then((enteredFullscreen) => {
        if (!enteredFullscreen) {
          setError('Fullscreen is required to begin. Please allow fullscreen and try again.')
          return
        }
        hasEnteredFullscreenRef.current = true
        return updateDoc(sessionRef, {
          teacherId: assignment?.teacherId ?? null,
          updatedAt: serverTimestamp(),
        })
          .then(() => {
            startWriting()
          })
          .catch((err) => {
            if (err?.code === 'not-found' || err?.code === 'permission-denied') {
              return tryCreateSession()
                .then(() => {
                  startWriting()
                })
                .catch((createErr) => {
                  if (createErr?.code === 'permission-denied') {
                    setPhase('submitted')
                    return
                  }
                  setError(createErr.message || 'Failed to start session')
                })
            }
            setError(err.message || 'Failed to start session')
          })
      })
      .finally(() => setSubmitting(false))
  }

  function handleSubmitSession(options = {}) {
    const { autoSubmit = false, forceStrikeCount = null } = options
    if (!sessionId || status !== 'active') return
    setSubmittingSession(true)
    setSubmitConfirmOpen(false)
    setFullscreenWarningOpen(false)
    clearFullscreenCountdown()
    const currentContent = contentRef.current
    const currentWordCount = currentContent.trim().split(/\s+/).filter(Boolean).length
    const finalStrikeCount = forceStrikeCount ?? strikeCountRef.current
    const sessionRef = doc(db, SESSIONS, sessionId)
    updateDoc(sessionRef, {
      teacherId: assignment?.teacherId ?? null,
      content: currentContent,
      wordCount: currentWordCount,
      strikeCount: finalStrikeCount,
      status: 'locked',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
      .then(() => {
        setStatus('locked')
        setPhase('submitted')
        setContent(currentContent)
        setStrikeCount(finalStrikeCount)
        if (autoSubmit) {
          setError('Session auto-submitted after leaving fullscreen twice.')
        }
        document.exitFullscreen?.()
      })
      .catch((err) => setError(err.message || 'Failed to submit'))
      .finally(() => setSubmittingSession(false))
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

      {/* Fullscreen return warning */}
      <Dialog open={fullscreenWarningOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Return to fullscreen</DialogTitle>
            <DialogDescription>
              Writing is paused. Re-enter fullscreen in {fullscreenCountdown}s or this session will auto-submit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                requestFullscreen()
              }}
            >
              Re-enter fullscreen
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
        <div className="mx-auto max-w-5xl space-y-5 text-left">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {autosaveError && (
            <Alert variant="destructive">
              <AlertDescription>{autosaveError}</AlertDescription>
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

          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm">Words: {wordCount}</span>
            <span
              className={cn(
                'text-sm',
                strikeCount > 0 && 'font-semibold text-destructive'
              )}
            >
              Fullscreen exits: {strikeCount} / 2
            </span>
            {!autosaveError && <span className="text-muted-foreground text-sm">Autosave every 4s</span>}
          </div>
          {!isFullscreenActive && (
            <Alert variant="destructive">
              <AlertDescription>
                Fullscreen is required. Writing stays locked until fullscreen is restored.
              </AlertDescription>
            </Alert>
          )}

          <Card className="bg-background">
            <CardContent className="p-0">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onPaste={(e) => e.preventDefault()}
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
                placeholder="Start writing here..."
                rows={22}
                className="min-h-[68vh] resize-none rounded-xl border-0 bg-background px-8 py-7 !text-lg leading-8 shadow-none focus-visible:ring-0"
                disabled={!isFullscreenActive || fullscreenWarningOpen || status !== 'active'}
              />
            </CardContent>
          </Card>
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
