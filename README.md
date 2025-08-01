# MiniApp Creator

A Next.js 15-based developer tool that mimics the core functionality of [v0.dev](https://v0.dev). Generate React components and pages with AI, then preview them in real-time with live dev servers.

## Features

- 🚀 **AI-Powered Code Generation**: Generate Farcaster miniapps using Claude AI
- 🔄 **Live Preview**: Real-time preview hosted on Railway infrastructure
- 🏗️ **Boilerplate Integration**: Uses a Farcaster miniapp boilerplate for consistent structure
- 🌐 **External Hosting**: No local Docker required - previews hosted externally
- 🧹 **Automatic Cleanup**: Clean up generated projects and previews when done
- 📁 **File Management**: Edit files directly in the browser with real-time updates

## How It Works

1. **Enter a Prompt**: Describe what you want to build (e.g., "Create a Farcaster miniapp with user authentication")
2. **Generate Code**: The system uses Claude AI to generate React/Next.js code based on your prompt
3. **Clone Boilerplate**: A copy of the Farcaster miniapp boilerplate is created with a unique ID
4. **Create Preview**: Files are sent to an external preview host on Railway
5. **Live Preview**: View your generated application at the preview URL
6. **Real-time Updates**: Make changes and see them reflected immediately

## Prerequisites

- Node.js 18+ and pnpm
- The `farcaster-miniapp` boilerplate project in the parent directory
- Claude API key (set as `CLAUDE_API_KEY` environment variable)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Make sure the `miniapp-boilerplate` project is available in the parent directory

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Enter a Prompt**: Use the textarea to describe what you want to build
2. **Generate**: Click "Generate & Preview" to create a new project
3. **Preview**: View the live preview in the iframe
4. **Cleanup**: Click "Stop Server" when you're done to clean up resources

## Example Prompts

- "Create a beautiful landing page with a hero section, features, and contact form"
- "Build a card-based layout with feature highlights"
- "Make a contact form with name, email, and message fields"

## Project Structure

```
createminiapp/
├── app/
│   ├── api/
│   │   ├── generate/route.ts    # API endpoint for project generation
│   │   └── files/route.ts       # API endpoint for file management
│   ├── components/
│   │   └── CodeEditor.tsx       # Main UI component
│   └── page.tsx                 # Home page
├── lib/
│   ├── previewManager.ts        # External preview API integration
│   └── llmOptimizer.ts         # Multi-stage LLM pipeline
└── generated/                   # Generated projects (created at runtime)
    └── <project-id>/
        └── ... (cloned boilerplate)
```

## API Endpoints

### POST /api/generate

Generates a new Farcaster miniapp from a prompt.

**Request Body:**

```json
{
  "prompt": "Create a Farcaster miniapp with user authentication"
}
```

**Response:**

```json
{
  "projectId": "uuid",
  "url": "https://minidev-preview-host-production.up.railway.app/p/uuid",
  "success": true,
  "generatedFiles": ["src/app/page.tsx", "src/components/Button.tsx"],
  "pipeline": "multi-stage",
  "changesApplied": true,
  "totalFiles": 25
}
```

### GET /api/files?projectId=xxx&listFiles=true

Lists all files in a project.

### GET /api/files?projectId=xxx&file=src/app/page.tsx

Gets the content of a specific file.

### PUT /api/files

Updates a file in the project.

### DELETE /api/files?projectId=xxx&filename=src/app/page.tsx

Deletes a file from the project.

### DELETE /api/generate

Stops a dev server and cleans up the generated project.

**Request Body:**

```json
{
  "projectId": "uuid"
}
```

## Development

### Adding LLM Integration

To integrate with a real LLM (like Claude or GPT), replace the `generateSampleCode` function in `CodeGenerator.tsx` with an API call:

```typescript
async function generateCodeWithLLM(prompt: string): Promise<string> {
  const response = await fetch("/api/generate-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  const { code } = await response.json();
  return code;
}
```

### Customizing the Boilerplate

Modify the `miniapp-boilerplate` project to include your preferred:

- Styling framework (Tailwind CSS, styled-components, etc.)
- Component libraries
- Development tools
- Project structure

## Troubleshooting

### Port Already in Use

The system automatically finds available ports. If you encounter port conflicts, the system will retry with different ports.

### Dev Server Not Starting

- Check that pnpm is installed globally
- Ensure the boilerplate project has all required dependencies
- Check the console for detailed error messages

### Cleanup Issues

If servers don't stop properly, you can manually kill processes:

```bash
# Find processes on specific ports
lsof -i :<port>

# Kill the process
kill -9 <PID>
```

## License

MIT
