import { useMemo, useState } from 'react'
import './App.css'

type GenerateState = 'idle' | 'loading' | 'done' | 'error'
type WorkPart = 'api-integration' | 'ui' | 'other'
type ActiveTool = 'task-generator' | 'status-generator'
type ParsedTask = {
  title: string
  successCriteria: string
}
type ParsedStatusOutput = {
  status: string
  timeLogs: string
  logs: Array<{
    title: string
    description: string
  }>
}

const defaultRequirement = ''

function toBeginnerScenario(line: string, index = 0) {
  const withoutId = line.replace(/^[A-Z]+[0-9]*:\s*/i, '').trim()
  const simpleLine = withoutId.replace(/^I will\s+/i, '').replace(/[.!?]+$/g, '').trim()

  return `SC${index + 1}: I will ${simpleLine || 'complete this requirement in the frontend'}.`
}

function normalizeSuccessCriteria(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const withoutExistingIndex = line.replace(/^SC\d+:\s*/i, '').trim()
      const withoutLeadingBullet = withoutExistingIndex.replace(/^[-*]\s*/, '').trim()
      const sentence = withoutLeadingBullet.replace(/^I will\s+/i, '').replace(/[.!?]+$/g, '').trim()

      return `SC${index + 1}: I will ${sentence || 'complete this step in the frontend'}.`
    })
    .join('\n')
}

function createFallbackTasks(
  reqId: string,
  part: string,
  taskCount: string,
  requirement: string,
  customInstruction: string,
) {
  const allLines = requirement
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const lines = taskCount === 'all' ? allLines : allLines.slice(0, Number(taskCount))

  const safeReqId = reqId.trim() || 'SHARED_REQ'
  const isCustomApi = /api|backend|endpoint|integration/i.test(customInstruction)
  const effectivePart = customInstruction.trim() && isCustomApi ? 'api-integration' : part.trim()
  const customPrefix = effectivePart
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase()
  const prefix =
    effectivePart === 'ui'
      ? `${safeReqId}_UI`
      : effectivePart === 'api-integration'
        ? `${safeReqId}_FE_API INTEGRATION`
        : `${safeReqId}_${customPrefix || 'CUSTOM'}`
  const taskType =
    customInstruction.trim() ||
    (effectivePart === 'ui'
      ? 'Build requirement UI'
      : effectivePart === 'api-integration'
        ? 'Integrate backend API in frontend'
        : `Build ${part.trim() || 'custom'} work`)

  return (lines.length > 0 ? lines : ['SC1: I will integrate the required backend API in the frontend.'])
    .map((line, index) => `Title: ${prefix} - ${taskType} ${index + 1}
Success Criteria:
${toBeginnerScenario(line, index)}`)
    .join('\n\n')
}

function parseGeneratedTasks(output: string): ParsedTask[] {
  return output
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const titleLine = lines.find((line) => /^Title:/i.test(line)) || lines[0] || 'Untitled task'
      const successIndex = lines.findIndex((line) => /^Success Criteria:/i.test(line))
      const successCriteria =
        successIndex >= 0
          ? lines.slice(successIndex + 1).join('\n')
          : lines
              .filter((line) => line !== titleLine && !/^Description:/i.test(line))
              .join('\n')

      return {
        title: titleLine.replace(/^Title:\s*/i, '').trim(),
        successCriteria: normalizeSuccessCriteria(successCriteria || 'I will complete this task in the frontend.'),
      }
    })
}

function parseStatusOutput(output: string): ParsedStatusOutput {
  const marker = 'Zoho Timesheet Logs'
  const markerIndex = output.indexOf(marker)

  if (markerIndex < 0) {
    return {
      status: output.trim(),
      timeLogs: '',
      logs: [],
    }
  }

  const timeLogs = output.slice(markerIndex).trim()
  const logMatches = Array.from(
    timeLogs.matchAll(/Log\s+\d+\s+Title:\s*(.+)\nLog\s+\d+\s+Description:\s*([\s\S]*?)(?=\n\nLog\s+\d+\s+Title:|$)/gi),
  )

  return {
    status: output.slice(0, markerIndex).trim(),
    timeLogs,
    logs: logMatches.map((match) => ({
      title: match[1].trim(),
      description: match[2].trim(),
    })),
  }
}

function App() {
  const [activeTool, setActiveTool] = useState<ActiveTool>('task-generator')
  const [reqId, setReqId] = useState('')
  const [part, setPart] = useState<WorkPart>('api-integration')
  const [customPart, setCustomPart] = useState('')
  const [taskCount, setTaskCount] = useState('1')
  const [customInstruction, setCustomInstruction] = useState('')
  const [requirement, setRequirement] = useState(defaultRequirement)
  const [output, setOutput] = useState('')
  const [state, setState] = useState<GenerateState>('idle')
  const [error, setError] = useState('')
  const [taskText, setTaskText] = useState('')
  const [workDone, setWorkDone] = useState('')
  const [statusOutput, setStatusOutput] = useState('')
  const [statusState, setStatusState] = useState<GenerateState>('idle')
  const [statusError, setStatusError] = useState('')

  const effectivePart = part === 'other' ? customPart.trim() : part
  const canGenerate = useMemo(
    () => reqId.trim() && requirement.trim() && (part !== 'other' || customPart.trim()),
    [customPart, part, reqId, requirement],
  )
  const parsedTasks = useMemo(() => parseGeneratedTasks(output), [output])
  const canGenerateStatus = useMemo(() => taskText.trim() && workDone.trim(), [taskText, workDone])
  const parsedStatusOutput = useMemo(() => parseStatusOutput(statusOutput), [statusOutput])

  async function generateTasks() {
    if (!canGenerate) {
      setState('error')
      setError(part === 'other' ? 'Req ID, custom part, and shared requirement text are required.' : 'Req ID and shared requirement text are required.')
      return
    }

    setState('loading')
    setError('')

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          part: effectivePart,
          taskCount,
          reqId: reqId.trim(),
          customInstruction: customInstruction.trim(),
          requirement: requirement.trim(),
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || `Model request failed with ${response.status}`)
      }

      const data = await response.json()
      const content = data?.output

      if (!content) {
        throw new Error('Model returned an empty response.')
      }

      setOutput(content.trim())
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Task generation failed.')
      setOutput(createFallbackTasks(reqId, effectivePart, taskCount, requirement.trim(), customInstruction.trim()))
      setState('error')
    }
  }

  async function copyOutput() {
    if (!output) return
    await navigator.clipboard.writeText(output)
  }

  async function copyText(text: string) {
    if (!text) return
    await navigator.clipboard.writeText(text)
  }

  async function generateStatus() {
    if (!canGenerateStatus) {
      setStatusState('error')
      setStatusError('Task and work done are required.')
      return
    }

    setStatusState('loading')
    setStatusError('')

    try {
      const response = await fetch('/api/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: taskText.trim(),
          workDone: workDone.trim(),
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || `Status request failed with ${response.status}`)
      }

      const data = await response.json()
      const content = data?.output

      if (!content) {
        throw new Error('Model returned an empty status response.')
      }

      setStatusOutput(content.trim())
      setStatusState('done')
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Status generation failed.')
      setStatusOutput(`Complete Status: In Progress [0% Complete]

Summary / Progress Update

SC1: Partially Completed — I need more detail to compare this task against the work done.

Pending / Blockers

- Add clearer task success criteria.
- Add clearer work done notes.

Expected Completion: <Add Date>

Zoho Timesheet Logs

Log 1 Title: Review task progress
Log 1 Description: Reviewed the completed work against the task success criteria. Identified what is complete, pending, and blocked.

Log 2 Title: Prepare status update
Log 2 Description: Prepared the progress summary and Zoho-ready time log notes. Included blockers and remaining work for follow-up.`)
      setStatusState('error')
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className={activeTool === 'task-generator' ? 'active-tab' : ''}
          onClick={() => setActiveTool('task-generator')}
        >
          Task Generator
        </button>
        <button
          type="button"
          className={activeTool === 'status-generator' ? 'active-tab' : ''}
          onClick={() => setActiveTool('status-generator')}
        >
          Status / Time Logs
        </button>
      </header>

      <section className="workspace">
        {activeTool === 'task-generator' ? (
          <div className="input-panel">
          <div className="title-row">
            <div>
              <h1>FE/API Task Generator</h1>
              <p>Carve your implementation tasks out of a shared requirement.</p>
            </div>
            <button type="button" onClick={generateTasks} disabled={!canGenerate || state === 'loading'}>
              {state === 'loading' ? 'Generating...' : 'Generate'}
            </button>
          </div>

          <div className="form-grid">
            <label>
              Req ID
              <input value={reqId} onChange={(event) => setReqId(event.target.value)} placeholder="29096" />
            </label>

            <label>
              My part
              <select value={part} onChange={(event) => setPart(event.target.value as WorkPart)}>
                <option value="api-integration">API integration</option>
                <option value="ui">UI</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label>
              Tasks wanted
              <select value={taskCount} onChange={(event) => setTaskCount(event.target.value)}>
                {Array.from({ length: 10 }, (_, index) => String(index + 1)).map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={`custom-part-row ${part === 'other' ? 'is-visible' : ''}`} aria-hidden={part !== 'other'}>
            <label>
              Custom part
              <input
                value={customPart}
                onChange={(event) => setCustomPart(event.target.value)}
                placeholder="Example: validation, bug fix, accessibility, charts"
                tabIndex={part === 'other' ? 0 : -1}
              />
            </label>
          </div>

          <label>
            Custom task shape
            <input
              value={customInstruction}
              onChange={(event) => setCustomInstruction(event.target.value)}
              placeholder="Example: write api integration of same api in alert details page, very small task"
            />
          </label>

          <label>
            Shared requirement
            <textarea value={requirement} onChange={(event) => setRequirement(event.target.value)} rows={12} />
          </label>
        </div>
        ) : (
          <div className="input-panel">
            <div className="title-row">
              <div>
                <h1>Status / Time Logs</h1>
                <p>Compare completed work and create Zoho-ready logs.</p>
              </div>
              <button type="button" onClick={generateStatus} disabled={!canGenerateStatus || statusState === 'loading'}>
                {statusState === 'loading' ? 'Generating...' : 'Generate'}
              </button>
            </div>

            <label>
              Task
              <textarea
                value={taskText}
                onChange={(event) => setTaskText(event.target.value)}
                rows={10}
                placeholder="Paste the task title and success criteria here."
              />
            </label>

            <label>
              Work done
              <textarea
                value={workDone}
                onChange={(event) => setWorkDone(event.target.value)}
                rows={10}
                placeholder="Paste what has been implemented, tested, blocked, or pending."
              />
            </label>
          </div>
        )}

        <div className="terminal-panel">
          <div className="terminal-toolbar">
            <span>{activeTool === 'task-generator' ? 'task output' : 'status output'}</span>
            {activeTool === 'task-generator' && (
              <button type="button" onClick={copyOutput} disabled={!output}>
                Copy
              </button>
            )}
          </div>

          {activeTool === 'task-generator' && error && <div className="error-line">Request issue: {error}</div>}
          {activeTool === 'status-generator' && statusError && (
            <div className="error-line">Request issue: {statusError}</div>
          )}

          {activeTool === 'task-generator' && parsedTasks.length > 0 ? (
            <div className="task-output">
              {parsedTasks.map((task, index) => (
                <div className="task-card" key={`${task.title}-${index}`}>
                  <div className="output-field">
                    <div className="output-field-header">
                      <span>Title</span>
                      <button type="button" onClick={() => copyText(task.title)}>
                        Copy
                      </button>
                    </div>
                    <div className="output-box title-box">{task.title}</div>
                  </div>

                  <div className="output-field">
                    <div className="output-field-header">
                      <span>Success Criteria</span>
                      <button type="button" onClick={() => copyText(task.successCriteria)}>
                        Copy
                      </button>
                    </div>
                    <div className="output-box criteria-box">{task.successCriteria}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : activeTool === 'status-generator' && statusOutput ? (
            <div className="task-output">
              <div className="task-card">
                <div className="output-field">
                  <div className="output-field-header">
                    <span>Status Update</span>
                    <button type="button" onClick={() => copyText(parsedStatusOutput.status)}>
                      Copy
                    </button>
                  </div>
                  <div className="output-box criteria-box">{parsedStatusOutput.status}</div>
                </div>
              </div>

              <div className="task-card">
                <div className="output-field">
                  <div className="output-field-header">
                    <span>Zoho Timesheet Logs</span>
                  </div>
                  {parsedStatusOutput.logs.length > 0 ? (
                    <div className="time-log-list">
                      {parsedStatusOutput.logs.map((log, index) => (
                        <div className="time-log-item" key={`${log.title}-${index}`}>
                          <div className="output-field">
                            <div className="output-field-header">
                              <span>Log {index + 1} Title</span>
                              <button type="button" onClick={() => copyText(log.title)}>
                                Copy
                              </button>
                            </div>
                            <div className="output-box title-box">{log.title}</div>
                          </div>

                          <div className="output-field">
                            <div className="output-field-header">
                              <span>Log {index + 1} Description</span>
                              <button type="button" onClick={() => copyText(log.description)}>
                                Copy
                              </button>
                            </div>
                            <div className="output-box criteria-box">{log.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="output-box criteria-box">{parsedStatusOutput.timeLogs}</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <pre>{activeTool === 'task-generator' ? 'Generated tasks will appear here.' : 'Generated status and time logs will appear here.'}</pre>
          )}
        </div>
      </section>
      <footer className="app-footer">This was built by Billi (Kartikey Rai)</footer>
    </main>
  )
}

export default App
