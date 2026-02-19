# QSR Voice Ordering - Frontend

React + TypeScript + Vite web application for AI-powered voice ordering.

## Features

- 🎙️ **Voice Ordering** - Hands-free ordering with 16kHz PCM audio streaming
- 💬 **Text Chat** - Alternative text-based ordering
- 🔐 **Cognito Authentication** - Secure user authentication with automatic password change on first login
- 🔄 **Bidirectional Streaming** - Real-time audio and text communication with AgentCore Runtime
- ⚙️ **Auto-Configuration** - Automatically reads deployment outputs from `cdk-outputs/` folder
- 📱 **Responsive Design** - Works on desktop and mobile browsers

## Prerequisites

- Node.js 18+ and npm
- Deployed backend infrastructure (see root README.md)
- Modern web browser with microphone access

## Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Generate Configuration

The configuration is automatically generated from your deployment outputs:

```bash
npm run predev
```

This script reads `../cdk-outputs/*.json` files and creates `.env.local` with your deployment-specific values.

### 3. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### 4. First Login

1. Open the app in your browser
2. Sign in with username `AppUser`
3. Use the temporary password sent to your email
4. You'll be prompted to change your password on first login
5. After authentication, you'll be redirected to the chat interface

## Build for Production

```bash
npm run build
```

The production build will be in the `dist/` directory.

## Configuration

### Automatic Configuration (Recommended)

The app automatically reads configuration from `cdk-outputs/` folder during build:

- `cdk-outputs/backend-infrastructure.json` - Cognito IDs, Region
- `cdk-outputs/agentcore-runtime.json` - WebSocket URL, Runtime ARN

### Manual Configuration

If automatic configuration fails, you can manually configure via the Settings screen in the app.

### Environment Variables

Configuration is stored in `.env.local` (auto-generated, git-ignored):

```env
VITE_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
VITE_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_REGION=us-east-1
VITE_WEBSOCKET_URL=wss://runtime-name.agentcore.bedrock.us-east-1.amazonaws.com
VITE_RUNTIME_ARN=arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/runtime-name
VITE_MAP_NAME=QSRRestaurantMap
VITE_PLACE_INDEX_NAME=QSRRestaurantIndex
```

**⚠️ IMPORTANT**: Never commit `.env.local` or `cdk-outputs/` to the repository!

## Project Structure

```
frontend/
├── scripts/
│   └── generate-config.js    # Reads cdk-outputs and generates .env.local
├── src/
│   ├── components/
│   │   ├── AuthComponent.tsx      # Cognito authentication
│   │   ├── ChatInterface.tsx      # Voice + text chat UI
│   │   └── SettingsScreen.tsx     # Configuration UI
│   ├── services/
│   │   ├── SettingsManager.ts     # localStorage persistence
│   │   └── WebSocketClient.ts     # WebSocket with SigV4 signing
│   ├── App.tsx                    # Main app component
│   ├── main.tsx                   # React entry point
│   └── index.css                  # Global styles
├── .env.example                   # Template for environment variables
├── .gitignore                     # Excludes sensitive files
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── vite.config.ts                 # Vite configuration
└── index.html                     # HTML entry point
```

## Usage

### Voice Ordering

1. Click the microphone button (🎤) to start recording
2. Speak your order naturally
3. Click the stop button (⏹️) to stop recording
4. The agent will respond with voice and text

### Text Ordering

1. Type your message in the text input
2. Press Enter or click Send
3. The agent will respond with text only

### Example Conversations

**Voice:**
- "Hello, I'd like to place an order"
- "I want a chicken sandwich combo"
- "Find restaurants near me"

**Text:**
- "Show me the menu"
- "Add a burger to my cart"
- "Place my order for pickup"

## Architecture

### Authentication Flow

1. User logs in with Cognito User Pool → JWT tokens (Access + ID)
2. Frontend exchanges ID Token for temporary AWS credentials (Identity Pool)
3. Credentials used for SigV4 signing of WebSocket URL
4. Access Token sent as first WebSocket message for identity verification

### WebSocket Communication

- **Connection**: SigV4-signed WebSocket URL to AgentCore Runtime
- **Audio Format**: 16kHz PCM, mono channel
- **Message Types**:
  - `bidi_audio_input` - User audio chunks
  - `bidi_text_input` - User text messages
  - `bidi_audio_stream` - Agent audio response
  - `bidi_transcript_stream` - Transcriptions
  - `tool_use_stream` - Tool invocation notifications

### State Management

- **Settings**: localStorage (`agentCoreOrderingConfig`)
- **Credentials**: sessionStorage (`agentCoreCredentials`) with expiration checking
- **App State**: React state (settings → auth → chat)

## Troubleshooting

### Configuration Not Found

**Problem**: "cdk-outputs/ directory not found"

**Solution**: Deploy the backend infrastructure first:
```bash
cd ..
./deploy-all.sh --user-email your-email@example.com --user-name "Your Name"
```

### Microphone Access Denied

**Problem**: Browser blocks microphone access

**Solution**: 
- Grant microphone permissions in browser settings
- Use HTTPS in production (required for microphone access)
- Check browser console for specific errors

### WebSocket Connection Failed

**Problem**: "Failed to connect to AgentCore Runtime"

**Solution**:
- Verify AgentCore Runtime is deployed and running
- Check WebSocket URL in settings
- Ensure AWS credentials are valid (not expired)
- Check browser console for detailed error messages

### Authentication Failed

**Problem**: "Incorrect username or password"

**Solution**:
- Use username `AppUser` (case-sensitive)
- Check email for temporary password
- If first login, you'll be prompted to change password
- Verify Cognito User Pool ID and Client ID are correct

## Security

- ✅ No sensitive data committed to repository
- ✅ Configuration auto-generated from deployment outputs
- ✅ Credentials stored in sessionStorage with expiration
- ✅ SigV4 signing for all WebSocket connections
- ✅ JWT token verification by AgentCore Runtime
- ✅ HTTPS required for production deployment

## Development

### Adding New Features

1. Create new component in `src/components/`
2. Add service logic in `src/services/`
3. Update `App.tsx` for routing if needed
4. Test with `npm run dev`

### Code Style

- TypeScript strict mode enabled
- ESLint for code quality
- Functional components with hooks
- Inline styles for simplicity (can be replaced with CSS modules)

## Deployment

### Via deploy-all.sh (Recommended)

The frontend is deployed automatically as part of the main deployment:

```bash
./deploy-all.sh --user-email your-email@example.com --user-name "Your Name" --with-frontend
```

### Manual Deployment

1. Deploy the Amplify CDK stack:
```bash
cd frontend/cdk
npm install
cdk deploy
```

2. Deploy the frontend code to Amplify:
```bash
cd frontend
npm install
npm run deploy:amplify
```

### S3 + CloudFront

1. Build the app: `npm run build`
2. Upload `dist/` to S3 bucket
3. Configure CloudFront distribution
4. Enable HTTPS (required for microphone access)

## License

See root LICENSE file.

## Support

For issues or questions, please refer to the main project README or open an issue on GitHub.
