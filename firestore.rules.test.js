import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, beforeAll, afterAll, afterEach } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'

const PROJECT_ID = 'focuswrite-rules-test'

let testEnv

async function seedAssignmentAndSession({
  assignmentId = 'assignmentA',
  teacherId = 'teacher-1',
  sessionId = 'assignmentA_student001',
  studentId = 'student001',
}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore()
    await setDoc(doc(adminDb, 'assignments', assignmentId), {
      teacherId,
      name: 'Test assignment',
      promptText: 'Write something.',
      strikeLimit: 3,
      createdAt: serverTimestamp(),
      activeStatus: 'active',
    })
    await setDoc(doc(adminDb, 'sessions', sessionId), {
      assignmentId,
      studentId,
      studentName: 'Test Student',
      content: 'hello world',
      wordCount: 2,
      strikeCount: 0,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
}

describe('firestore.rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      },
    })
  })

  afterEach(async () => {
    await testEnv.clearFirestore()
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  it('prevents unauthenticated users from reading sessions', async () => {
    await seedAssignmentAndSession({})
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'sessions', 'assignmentA_student001')))
  })

  it('allows assignment owner teacher to read session', async () => {
    await seedAssignmentAndSession({})
    const db = testEnv.authenticatedContext('teacher-1').firestore()
    await assertSucceeds(getDoc(doc(db, 'sessions', 'assignmentA_student001')))
  })

  it('blocks non-owner teacher from reading session', async () => {
    await seedAssignmentAndSession({})
    const db = testEnv.authenticatedContext('teacher-2').firestore()
    await assertFails(getDoc(doc(db, 'sessions', 'assignmentA_student001')))
  })

  it('allows valid unauthenticated session create', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertSucceeds(
      setDoc(doc(db, 'sessions', 'assignmentB_student002'), {
        assignmentId: 'assignmentB',
        studentId: 'student002',
        studentName: null,
        content: '',
        wordCount: 0,
        strikeCount: 0,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    )
  })

  it('rejects create when doc id does not match assignmentId_studentId', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      setDoc(doc(db, 'sessions', 'wrong-id'), {
        assignmentId: 'assignmentB',
        studentId: 'student002',
        studentName: null,
        content: '',
        wordCount: 0,
        strikeCount: 0,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    )
  })

  it('rejects updates that decrease strikeCount', async () => {
    await seedAssignmentAndSession({})
    const db = testEnv.unauthenticatedContext().firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'sessions', 'assignmentA_student001'), {
        strikeCount: 2,
        updatedAt: serverTimestamp(),
      })
    )
    await assertFails(
      updateDoc(doc(db, 'sessions', 'assignmentA_student001'), {
        strikeCount: 1,
        updatedAt: serverTimestamp(),
      })
    )
  })

  it('rejects updates that mutate studentId', async () => {
    await seedAssignmentAndSession({})
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      updateDoc(doc(db, 'sessions', 'assignmentA_student001'), {
        studentId: 'another-student',
        updatedAt: serverTimestamp(),
      })
    )
  })
})
