import { useState } from 'react'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { nanoid } from 'nanoid'
import { db } from '@/firebase'
import { ASSIGNMENTS } from '@/firebase-collections'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function CreateAssignment() {
  const { user } = useAuth()
  const [promptText, setPromptText] = useState('')
  const [strikeLimit, setStrikeLimit] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [createdUrl, setCreatedUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setCreatedUrl(null)
    setLoading(true)
    const assignmentId = nanoid(10)
    const url = window.location.origin + '/write/' + assignmentId
    try {
      await setDoc(doc(db, ASSIGNMENTS, assignmentId), {
        teacherId: user.uid,
        promptText: promptText.trim(),
        strikeLimit: Number(strikeLimit) || 3,
        createdAt: serverTimestamp(),
        activeStatus: 'active',
      })
      setCreatedUrl(url)
      setPromptText('')
    } catch (err) {
      setError(err.message || 'Failed to create assignment')
    } finally {
      setLoading(false)
    }
  }

  function copyLink() {
    if (!createdUrl) return
    navigator.clipboard.writeText(createdUrl).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => {}
    )
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt</Label>
          <Textarea
            id="prompt"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Writing prompt for students..."
            rows={4}
            className="max-w-[500px]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="strikeLimit">Strike limit (default 3)</Label>
          <Input
            id="strikeLimit"
            type="number"
            min={1}
            max={10}
            value={strikeLimit}
            onChange={(e) => setStrikeLimit(Number(e.target.value) || 3)}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create assignment'}
        </Button>
      </form>
      {createdUrl && (
        <Card className="max-w-[500px]">
          <CardContent className="pt-6">
            <p className="mb-2 font-semibold">Assignment link (share with students):</p>
            <code className="mb-2 block break-all rounded bg-muted px-2 py-1 text-sm">{createdUrl}</code>
            <Button type="button" variant="secondary" onClick={copyLink}>
              {copied ? 'Copied!' : 'Copy link'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
