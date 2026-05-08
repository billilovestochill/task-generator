# Task Generator

Task Generator is a small React/Vite tool for turning shared requirement text into clean frontend implementation tasks.

It is built for cases where one requirement contains work for multiple people, but a frontend developer needs only their own part written as copy-ready task titles and success criteria.

## Use Case

Use this app when you need to:

- Convert a shared requirement into frontend API integration tasks.
- Convert a shared requirement into UI implementation tasks.
- Generate task titles using a specific requirement ID.
- Keep success criteria simple, numbered, and beginner-friendly.
- Create delivery status updates from a task and the work completed.
- Generate Zoho-ready timesheet log titles and descriptions.

## Features

- Task generator for API integration, UI work, or a custom frontend work area.
- Custom task shape input for small or specific task formats.
- Configurable task count.
- Copy buttons for generated titles and success criteria.
- Status generator that compares a task with work-done notes.
- Zoho timesheet log output with copyable log titles and descriptions.
- Groq-backed model calls through local Vite middleware.

## Tech Stack

- React
- TypeScript
- Vite
- Groq OpenAI-compatible chat completions API

## Setup

Install dependencies:

```bash
npm install
```

Create a `.env.local` file in the project root:

```bash
GROQ_API_KEY=your_groq_api_key_here
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## How It Works

The frontend sends task-generation and status-generation requests to local Vite middleware:

- `POST /api/generate` creates implementation tasks from requirement text.
- `POST /api/status` creates progress updates and Zoho timesheet logs.

The middleware calls Groq using the `openai/gpt-oss-120b` model and returns plain text that the UI formats into copyable fields.
