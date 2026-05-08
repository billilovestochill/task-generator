import { jsonResponse, parseJsonBody, requestGroq, type NetlifyEvent } from './shared'

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

  const reqId = String(body.reqId || '').trim()
  const part = String(body.part || 'api-integration').trim()
  const taskCount = String(body.taskCount || '1').trim()
  const customInstruction = String(body.customInstruction || '').trim()
  const requirement = String(body.requirement || '').trim()

  if (!reqId || !requirement) {
    return jsonResponse(400, { error: 'Req ID and shared requirement text are required.' })
  }

  try {
    const result = await requestGroq(systemPrompt, buildPrompt(reqId, part, taskCount, customInstruction, requirement), apiKey)

    if (!result.ok) {
      return jsonResponse(result.statusCode, { error: result.error })
    }

    return jsonResponse(200, { output: result.output })
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Task generation failed.' })
  }
}
