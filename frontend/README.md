# Frontend Application

This directory contains the React web application for the AI-powered QSR ordering system.

## Technology Stack

- **React 18** with TypeScript
- **Vite** for fast development and optimized builds
- **AWS Amplify UI** for authentication components
- **Web Audio API** for microphone capture and playback
- **WebSocket** with SigV4 signing for AgentCore connection

## Expected Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── AuthComponent.tsx       # Cognito authentication UI
│   │   ├── ChatInterface.tsx       # Voice and text chat interface
│   │   └── SettingsManager.ts      # Configuration persistence
│   ├── services/
│   │   └── WebSocketClient.ts      # AgentCore WebSocket connection
│   ├── App.tsx                     # Main application with routing
│   └── main.tsx                    # Application entry point
├── public/                         # Static assets
├── tests/                          # Unit and property-based tests
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── vite.config.ts                  # Vite configuration
└── README.md                       # This file
```

## Key Features

### Settings Manager
- Persists Cognito configuration in localStorage
- Manages AWS credentials in sessionStorage
- Validates configuration completeness
- Handles credential expiration

### Auth Component
- AWS Amplify Authenticator integration
- Cognito User Pool authentication
- Identity Pool credential fetching
- Auth status notifications

### WebSocket Client
- SigV4 signed connections to AgentCore Runtime
- Bidirectional audio streaming (16kHz PCM)
- Text message transmission
- Event callbacks for transcription, responses, and audio

### Chat Interface
- Voice mode with microphone capture
- Text mode with keyboard input
- Message history display
- Audio playback for agent responses
- Voice activity detection for interruptions

### Geolocation Integration
- Browser Geolocation API
- Coordinate extraction and transmission
- Permission handling
- Manual address entry fallback

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run property-based tests
npm run test:property
```

## Configuration

The application requires the following configuration (set via Settings UI):
- Cognito User Pool ID
- Cognito User Pool Client ID
- Cognito Identity Pool ID
- AWS Region
- AgentCore WebSocket Endpoint URL

## Deployment

Deploy to AWS Amplify with environment variables:
- `VITE_WEBSOCKET_ENDPOINT`: AgentCore WebSocket URL
- `VITE_COGNITO_USER_POOL_ID`: Cognito User Pool ID
- `VITE_COGNITO_CLIENT_ID`: Cognito Client ID
- `VITE_COGNITO_IDENTITY_POOL_ID`: Cognito Identity Pool ID
- `VITE_AWS_REGION`: AWS Region (e.g., us-east-1)
