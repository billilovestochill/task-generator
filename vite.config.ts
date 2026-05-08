import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const model = 'openai/gpt-oss-120b'

const systemPrompt = `You create implementation tasks for a frontend engineer.

Rules:
- Output plain terminal text only. No markdown fences. No commentary.
- Output each task in this exact format:
Title: requirement_id_FE_API INTEGRATION - short task title
Success Criteria:
SC1: I will do one simple frontend action.
- The shared requirement may contain work for many people. Carve out only the selected frontend work.
- Use the provided Req ID in every task title.
- If the Req ID is also inside the shared requirement, still use the provided Req ID field.
- If the selected part is "api-integration", create only tasks for integrating backend APIs in the frontend.
- API integration tasks must cover frontend request wiring, response mapping, state updates, validation, and loading/empty/error handling where relevant.
- If the selected part is "ui", create only frontend UI implementation tasks.
- If the selected part is anything else, create only frontend tasks for that named work area.
- If custom task shape is provided, follow it even when it overrides the selected part.
- Custom task shape has higher priority than selected part and shared requirement wording.
- If custom task shape asks for a very small task, keep the task title and Success Criteria short.
- Always create one task for each requirement or scenario item used.
- If requested task count is "all", create one task for every requirement or scenario item in the shared requirement.
- If requested task count is a number, create exactly that many tasks by using that many requirement or scenario items.
- Never split one requirement item into multiple tasks.
- Every API integration task title must begin with "requirement_id_FE_API INTEGRATION".
- Every UI task title must begin with "requirement_id_UI".
- For any other selected part, begin the title with "requirement_id_" followed by a short uppercase label for that part.
- Replace requirement_id with the ID from the matching shared requirement item.
- Do not wrap the requirement ID in square brackets.
- Each task must include a short task title and Success Criteria.
- Do not write a Description field.
- Put all description text only under Success Criteria.
- Each task must include Success Criteria lines for the work.
- Every SC line must be indexed as "SC1:", "SC2:", "SC3:", and so on.
- After the SC index, every SC line must start exactly with "I will".
- Every SC line must be no longer than one sentence.
- Every SC line must be easy to understand for a zero-level beginner developer.
- Do not use jargon in SC lines unless the shared requirement uses that exact word.
- Include the matching shared requirement or scenario idea in simple words under Success Criteria.
- Exclude backend-only, QA-only, DevOps-only, design-only, and database-only work.
- Keep the output directly usable as copied terminal text.`

const statusSystemPrompt = `You create concise delivery status updates from a task and work-done notes.

Rules:
- Output plain terminal text only. No markdown fences. No commentary.
- Use this exact structure:
Complete Status: In Progress [78% Complete]

Summary / Progress Update

SC1: Partially Completed — Short reason.

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

function buildPrompt(reqId: string, part: string, taskCount: string, customInstruction: string, requirement: string) {
  const selectedPart = part.trim() || 'api-integration'

  return `Req ID: ${reqId}
Selected part: ${selectedPart}
Requested task count: ${taskCount}
Custom task shape:
${customInstruction || 'None'}

Shared requirement:
${requirement}

Create the tasks now.`
}

function buildStatusPrompt(task: string, workDone: string) {
  return `Task:
${task}

Work done:
${workDone}

Create the status update and Zoho timesheet logs now.`
}

function readJsonBody(request: IncomingMessage) {
  return new Promise<Record<string, string>>((resolve, reject) => {
    let body = ''

    request.on('data', (chunk) => {
      body += chunk
    })

    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch (error) {
        reject(error)
      }
    })

    request.on('error', reject)
  })
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      {
        name: 'task-generator-api',
        configureServer(server) {
          server.middlewares.use('/api/generate', async (request, response) => {
            if (request.method !== 'POST') {
              sendJson(response, 405, { error: 'Method not allowed' })
              return
            }

            if (!env.GROQ_API_KEY) {
              sendJson(response, 500, { error: 'Missing GROQ_API_KEY in .env.local' })
              return
            }

            try {
              const body = await readJsonBody(request)
              const reqId = String(body.reqId || '').trim()
              const part = String(body.part || 'api-integration').trim()
              const taskCount = String(body.taskCount || '1').trim()
              const customInstruction = String(body.customInstruction || '').trim()
              const requirement = String(body.requirement || '').trim()

              if (!reqId || !requirement) {
                sendJson(response, 400, { error: 'Req ID and shared requirement text are required.' })
                return
              }

              const modelResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${env.GROQ_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model,
                  temperature: 0.2,
                  messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: buildPrompt(reqId, part, taskCount, customInstruction, requirement) },
                  ],
                }),
              })

              if (!modelResponse.ok) {
                const message = await modelResponse.text()
                sendJson(response, modelResponse.status, { error: message || 'Model request failed.' })
                return
              }

              const data = (await modelResponse.json()) as {
                choices?: Array<{ message?: { content?: string } }>
              }
              const output = data?.choices?.[0]?.message?.content?.trim()

              if (!output) {
                sendJson(response, 502, { error: 'Model returned an empty response.' })
                return
              }

              sendJson(response, 200, { output })
            } catch (error) {
              sendJson(response, 500, { error: error instanceof Error ? error.message : 'Task generation failed.' })
            }
          })

          server.middlewares.use('/api/status', async (request, response) => {
            if (request.method !== 'POST') {
              sendJson(response, 405, { error: 'Method not allowed' })
              return
            }

            if (!env.GROQ_API_KEY) {
              sendJson(response, 500, { error: 'Missing GROQ_API_KEY in .env.local' })
              return
            }

            try {
              const body = await readJsonBody(request)
              const task = String(body.task || '').trim()
              const workDone = String(body.workDone || '').trim()

              if (!task || !workDone) {
                sendJson(response, 400, { error: 'Task and work done are required.' })
                return
              }

              const modelResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${env.GROQ_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model,
                  temperature: 0.2,
                  messages: [
                    { role: 'system', content: statusSystemPrompt },
                    { role: 'user', content: buildStatusPrompt(task, workDone) },
                  ],
                }),
              })

              if (!modelResponse.ok) {
                const message = await modelResponse.text()
                sendJson(response, modelResponse.status, { error: message || 'Model request failed.' })
                return
              }

              const data = (await modelResponse.json()) as {
                choices?: Array<{ message?: { content?: string } }>
              }
              const output = data?.choices?.[0]?.message?.content?.trim()

              if (!output) {
                sendJson(response, 502, { error: 'Model returned an empty response.' })
                return
              }

              sendJson(response, 200, { output })
            } catch (error) {
              sendJson(response, 500, { error: error instanceof Error ? error.message : 'Status generation failed.' })
            }
          })
        },
      },
    ],
  }
})
