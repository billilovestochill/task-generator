import { jsonResponse, parseJsonBody, requestGroq, type NetlifyEvent } from './shared'

const systemPrompt = `You create concise delivery status updates from a task and work-done notes.

Rules:
- Output plain terminal text only. No markdown fences. No commentary.
- Use this exact structure:
Complete Status: In Progress [78% Complete]

Summary / Progress Update

SC1: Partially Completed - Short reason.

Pending / Blockers

- Short blocker or pending item.

Expected Completion: <Add Date>

Zoho Timesheet Logs

Log 1 Title: Short work log title
Log 1 Description: A clear two-sentence summary of the work completed.

Log 2 Title: Short work log title
Log 2 Description: A clear two-sentence summary of the work completed.
- Choose one overall status: Not Started, In Progress, Blocked, or Completed.
- Estimate a realistic percent complete from the work done.
- Review each SC from the task and write one status line for each SC.
- Each SC line must keep the original SC number.
- Each SC line must use one label: Not Started, Partially Completed, Mostly Completed, Nearly Completed, Completed, or Blocked.
- Each SC line reason must be one short sentence.
- Pending / Blockers must include only real gaps, blockers, or pending work from the comparison.
- If no expected date is provided, keep exactly "<Add Date>".
- Always include exactly two Zoho timesheet logs.
- Each Zoho log must have one title line and one description line.
- Zoho log titles must be specific to the work done.
- Zoho log descriptions must be a bit detailed, usually two short sentences.
- Zoho log descriptions must explain what was worked on and what changed or was checked.
- Zoho log descriptions must still be easy to paste into Zoho Timesheets.
- Keep the output directly usable as copied terminal text.`

function buildPrompt(task: string, workDone: string) {
  return `Task:
${task}

Work done:
${workDone}

Create the status update and Zoho timesheet logs now.`
}

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    return jsonResponse(500, { error: 'Missing GROQ_API_KEY environment variable.' })
  }

  const body = parseJsonBody(event)

  if (!body) {
    return jsonResponse(400, { error: 'Invalid JSON body.' })
  }

  const task = String(body.task || '').trim()
  const workDone = String(body.workDone || '').trim()

  if (!task || !workDone) {
    return jsonResponse(400, { error: 'Task and work done are required.' })
  }

  try {
    const result = await requestGroq(systemPrompt, buildPrompt(task, workDone), apiKey)

    if (!result.ok) {
      return jsonResponse(result.statusCode, { error: result.error })
    }

    return jsonResponse(200, { output: result.output })
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Status generation failed.' })
  }
}
