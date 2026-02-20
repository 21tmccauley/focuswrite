export function exportSessionAsTxt(session) {
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
