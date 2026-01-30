# AgentCore Runtime - QSR Ordering Agent

This project contains the Python-based Strands agent that handles voice and text ordering conversations for the QSR ordering system. The agent runs on Amazon Bedrock AgentCore Runtime deployed via AWS CDK.

## Team Ownership

**Team Member C** - AgentCore Runtime

## Authentication & Identity Verification

### JWT Access Token Verification

The agent implements **server-side JWT Access Token verification** using AWS Cognito's `GetUser` API. This ensures that only authenticated users can interact with the agent and provides verified user identity for personalized responses.

#### How It Works

1. **Frontend Authentication**:
   - User logs in to Cognito User Pool
   - Receives Access Token and ID Token
   - Exchanges ID Token for temporary AWS credentials (for SigV4 signing)

2. **WebSocket Connection**:
   - Frontend establishes WebSocket connection with SigV4 signature
   - Sends Access Token as first message: `{ type: 'auth', access_token: '...' }`

3. **Agent Verification**:
   - Agent intercepts first message
   - Calls `boto3.client('cognito-idp').get_user(AccessToken=token)`
   - Cognito validates token signature, expiration, and revocation
   - Returns verified user details (username, email, attributes)
   - Agent logs user info and proceeds with verified session

4. **Conversation**:
   - Subsequent messages proceed normally
   - Agent uses verified identity for personalized responses
   - No need to re-verify on each message

#### Implementation

The authentication logic is in `jwt_auth.py`:

```python
def verify_access_token(access_token, region='us-east-1'):
    """
    Verify Access Token with AWS Cognito and retrieve user details.
    
    AWS Cognito automatically validates:
    - Token signature
    - Token expiration  
    - Token revocation status
    """
    cognito_idp = boto3.client('cognito-idp', region_name=region)
    response = cognito_idp.get_user(AccessToken=access_token)
    
    return {
        'username': response.get('Username'),
        'attributes': {
            attr['Name']: attr['Value']
            for attr in response.get('UserAttributes', [])
        }
    }

def create_auth_interceptor(websocket, region='us-east-1'):
    """
    Create WebSocket interceptor that verifies Access Token on first message.
    """
    async def receive_with_auth_intercept():
        message = await websocket.receive_json()
        
        if message.get('type') == 'auth':
            access_token = message.get('access_token')
            user_info = verify_access_token(access_token, region)
            logger.info(f"✅ Verified user: {user_info['username']}")
            message = await websocket.receive_json()
        
        return message
    
    return receive_with_auth_intercept
```

The agent uses this interceptor in `qsr_agent.py`:

```python
from jwt_auth import create_auth_interceptor

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Create JWT authentication interceptor
    receive_with_auth = create_auth_interceptor(websocket)
    
    # Run agent with authenticated input
    await agent.run(inputs=[receive_with_auth], outputs=[websocket.send_json])
```

#### Benefits

- ✅ **Server-side verification**: Token validation happens on the server, not client
- ✅ **Automatic validation**: Cognito checks signature, expiration, and revocation
- ✅ **No JWT libraries needed**: No need to manage JWKS, public keys, or token parsing
- ✅ **Real-time revocation**: Cognito immediately rejects revoked tokens
- ✅ **User details included**: Get verified username, email, and attributes in one call
- ✅ **Simple implementation**: Single boto3 API call handles all verification

#### Dependencies

The agent requires `boto3` for Cognito verification:

```txt
# requirements.txt
boto3>=1.35.0  # For Cognito GetUser API
```

The flexible version constraint (`>=1.35.0`) allows pip to resolve dependency conflicts with other packages like `strands-agents` and `strands-agents-tools`.

## Architecture

The agent will connect to **AgentCore Gateway as an MCP (Model Context Protocol) client** to discover and invoke backend tools. This decoupled architecture allows:

- Backend Lambda functions to be developed independently
- Tools to be added/removed without modifying agent code
- AgentCore Gateway to handle authentication and routing
- Standard MCP protocol for tool discovery and invocation

**Note**: Currently using placeholder tools until MCP integration with AgentCore Gateway is complete.

## Project Structure

```
backend/agentcore-runtime/
├── agent/
│   ├── qsr_agent.py               # Strands agent code
│   ├── jwt_auth.py                # JWT Access Token verification
│   ├── aws_credentials.py         # AWS credential management
│   └── requirements.txt           # Python dependencies (includes boto3)
├── test-client/
│   ├── client-cognito-sigv4.py    # Test client with Cognito auth
│   └── clientUI.html              # Web UI for testing
├── cdk/                           # CDK deployment code
│   ├── bin/
│   │   └── app.ts                 # CDK app entry point
│   ├── lib/
│   │   ├── infra-stack.ts         # Build infrastructure
│   │   └── runtime-stack.ts       # AgentCore Runtime
│   ├── cdk.json
│   ├── package.json
│   └── tsconfig.json
└── README.md                      # This file
```

## Prerequisites

### Required Inputs from Other Projects

1. **From Backend Infrastructure (Project 1)**:
   - API Gateway URL (for AgentCore Gateway configuration)
   - API Gateway ID (for AgentCore Gateway configuration)
   - Cognito User Pool ID (for authentication)
   - Cognito User Pool Client ID (for authentication)
   - Region

2. **From AgentCore Gateway (Project 2)**:
   - AgentCore Gateway URL (passed as environment variable)

### Required Tools

- AWS CLI configured with appropriate credentials
- Node.js 22+ (for CDK)
- Docker (for local testing, optional)
- AWS CDK CLI: `npm install -g aws-cdk`

## Deployment via CDK

This project is deployed using AWS CDK, which handles:
- Building the Docker container image via CodeBuild
- Pushing to Amazon ECR
- Creating the AgentCore Runtime with WebSocket protocol
- Configuring Cognito JWT authentication
- Setting up IAM roles and permissions

### CDK Stack Structure

The deployment consists of 3 CDK stacks:

1. **AgentCoreInfraStack**: Creates build infrastructure
   - ECR repository for agent container
   - CodeBuild project for ARM64 builds
   - S3 bucket for build sources
   - IAM roles for AgentCore Runtime

2. **AgentCoreRuntimeStack**: Deploys the agent
   - Uploads agent source to S3
   - Triggers CodeBuild to create container image
   - Waits for build completion
   - Creates AgentCore Runtime with WebSocket protocol
   - Configures Cognito JWT authorizer
   - Sets AGENTCORE_GATEWAY_URL environment variable

3. **Frontend Stack** (separate project): Web UI

### Deployment Steps

#### Step 1: Install CDK Dependencies

```bash
cd backend/agentcore-runtime/cdk
npm install
```

#### Step 2: Bootstrap CDK (First Time Only)

```bash
cdk bootstrap
```

#### Step 3: Deploy Infrastructure Stack

```bash
cdk deploy AgentCoreInfraStack --require-approval never
```

This creates:
- ECR repository
- CodeBuild project
- IAM roles
- S3 bucket

#### Step 4: Deploy Runtime Stack

The Runtime Stack requires the AgentCore Gateway URL from Project 2. You can either:

**Option A: Using environment variable**
```bash
export GATEWAY_URL=$(cat ../../../cdk-outputs/agentcore-gateway.json | python3 -c "import sys, json; print(json.load(sys.stdin)['gateway_url'])")

cdk deploy AgentCoreRuntimeStack \
  --require-approval never \
  --parameters AgentCoreRuntimeStack:AgentCoreGatewayUrl="$GATEWAY_URL"
```

**Option B: Direct command**
```bash
cdk deploy AgentCoreRuntimeStack \
  --require-approval never \
  --parameters AgentCoreRuntimeStack:AgentCoreGatewayUrl="https://qsr-ordering-gateway-XXXXX.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
```

This will:
1. Upload agent source code to S3
2. Trigger CodeBuild to build ARM64 container
3. Wait for build to complete (~5-10 minutes)
4. Create AgentCore Runtime with WebSocket protocol
5. Configure environment variables
6. Output the Runtime ARN and WebSocket endpoint

**Note**: The RuntimeStack is conditionally created based on the `agentcoreGatewayUrl` context parameter. If you run `cdk list` without providing this context, you'll only see `AgentCoreInfraStack`.

#### Step 5: Get WebSocket URL

After deployment, the stack outputs will include:
- `AgentRuntimeArn`: ARN of the AgentCore Runtime
- `EndpointName`: DEFAULT (auto-created endpoint)
- `Region`: AWS region

To get the WebSocket URL:

```bash
aws bedrock-agentcore describe-runtime \
  --agent-runtime-arn <runtime-arn-from-output> \
  --query 'agentRuntime.endpoints[?endpointName==`DEFAULT`].endpointUrl' \
  --output text
```

The WebSocket URL will be in format:
```
wss://<runtime-id>.agentcore.<region>.amazonaws.com
```

#### Step 6: Document Outputs

Copy the **WebSocket URL** and document it for the Frontend team (Project 4).

## Local Development

### Test Agent Locally (Without Container)

```bash
cd backend/agentcore-runtime

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variable
export AGENTCORE_GATEWAY_URL="<gateway-url>"

# Run agent locally
python qsr_agent.py
```

The agent will start an HTTP server on `http://localhost:8080` for local testing.

### Test with Docker (Local)

```bash
# Build container
docker build -t qsr-agent:local .

# Run container
docker run -p 8080:8080 \
  -e AGENTCORE_GATEWAY_URL="<gateway-url>" \
  -e AWS_ACCESS_KEY_ID="<your-key>" \
  -e AWS_SECRET_ACCESS_KEY="<your-secret>" \
  -e AWS_SESSION_TOKEN="<your-token>" \
  qsr-agent:local
```

### Test Agent Invocation

```bash
# Test with curl
curl -X POST http://localhost:8080/api/invocations \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, I would like to place an order"}'
```

## Agent Features

### Current Implementation

The agent currently uses:
- **Strands Agent** framework (not BidiAgent yet)
- **Amazon Nova Sonic v2** model (`amazon.nova-2-sonic-v1:0`)
- **HTTP protocol** with streaming responses
- **Placeholder tools** (get_customer_profile, get_menu)

### Future: WebSocket + Bidirectional Streaming

The agent will be upgraded to support:
- **WebSocket protocol** for bidirectional streaming
- **BidiAgent** with Nova Sonic v2
- **Voice input**: 16kHz PCM audio from frontend
- **Voice output**: Audio responses played in frontend
- **Interruptions**: Users can interrupt agent mid-sentence
- **MCP client**: Dynamic tool discovery from AgentCore Gateway

### Tool Integration

**Current**: Placeholder tools defined with `@tool` decorator

**Future**: Tools discovered from AgentCore Gateway via MCP:
- GetCustomerProfile
- GetPreviousOrders
- GetMenu
- AddToCart
- PlaceOrder
- GetNearestLocations
- FindLocationAlongRoute
- GeocodeAddress

## Architecture Flow

```
Frontend (React)
    │
    │ WebSocket (JWT Auth)
    ▼
AgentCore Runtime (This Project)
    │
    │ MCP Protocol (Future)
    ▼
AgentCore Gateway (Project 2)
    │
    │ HTTPS
    ▼
API Gateway (Project 1)
    │
    │ Lambda Invocation
    ▼
Backend Lambda Functions (Project 1)
    │
    ▼
DynamoDB / Location Services
```

## Testing the Runtime

### Test Client with Cognito Authentication

The test client (`test-client/client-cognito-sigv4.py`) provides a complete authentication flow and WebSocket connection for testing the AgentCore Runtime.

#### Features

- **Cognito Authentication**: Full authentication flow with User Pool and Identity Pool
- **Password Change Flow**: Automatically detects and handles first-time login password changes
- **User-Friendly Error Messages**: Clear, actionable error messages for authentication issues
- **SigV4 Signing**: Automatic WebSocket URL signing with temporary AWS credentials
- **Web UI**: Browser-based interface for voice and text conversations
- **Token Management**: Access Token verification and credential regeneration

#### Usage

```bash
cd backend/agentcore-runtime/test-client

python3 client-cognito-sigv4.py \
  --username AppUser \
  --password '<password-from-email>' \
  --user-pool-id <from-outputs> \
  --client-id <from-outputs> \
  --identity-pool-id <from-outputs> \
  --runtime-arn <from-outputs> \
  --region us-east-1
```

**Note:** The temporary password is sent to the email address specified during deployment. Check your email for the initial password.

#### Password Change Flow

If this is your first login, the test client will automatically:
1. Detect the `NEW_PASSWORD_REQUIRED` challenge
2. Prompt you to enter a new password
3. Confirm the new password
4. Complete the password change
5. Continue with authentication

Password requirements:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

#### Error Handling

The test client provides user-friendly error messages:

**Incorrect Password:**
```
❌ Authentication Failed: Incorrect username or password

💡 Troubleshooting Tips:
   1. Check that you're using the correct password
   2. If you changed your password in another test, use the new password
   3. If this is your first login, use the temporary password sent to your email
   4. Verify the username is correct
```

**User Not Found:**
```
❌ Authentication Failed: User 'AppUser' not found

💡 Troubleshooting Tips:
   1. Verify the username is correct
   2. Check that the user exists in the Cognito User Pool
   3. User Pool ID: us-east-1_XXXXXXXXX
```

**Password Change Failed:**
```
❌ Password change failed: Password does not conform to policy

💡 Password requirements:
   - Minimum 8 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one number
   - At least one special character
```

#### Web Interface

After successful authentication, the test client starts a web server:

```
======================================================================
🌐 Starting Web Server
======================================================================
📍 Server URL: http://localhost:8000
🔗 Client Page: http://localhost:8000/
📊 API Endpoint: http://localhost:8000/api/connection
🔑 Token Endpoint: http://localhost:8000/api/jwt-token
🔄 Regenerate URL: http://localhost:8000/api/regenerate (POST)
======================================================================
```

Open `http://localhost:8000` in your browser to:
- Test voice conversations
- Test text conversations
- View connection status
- Regenerate presigned URLs
- View JWT tokens

## Troubleshooting

### Build Failures

**Problem**: CodeBuild fails to build container

**Solutions**:
1. Check CodeBuild logs in AWS Console
2. Verify Dockerfile syntax
3. Ensure requirements.txt has valid package versions
4. Check ECR repository permissions

### Agent Not Starting

**Problem**: AgentCore Runtime fails to start

**Solutions**:
1. Check CloudWatch Logs: `/aws/bedrock-agentcore/runtimes/<runtime-name>`
2. Verify container image exists in ECR
3. Check IAM role permissions
4. Verify environment variables are set

### Authentication Errors

**Problem**: WebSocket connection fails with 401/403

**Solutions**:
1. Verify Cognito User Pool ID and Client ID are correct
2. Check Access Token is valid and not expired
3. Verify Cognito discovery URL is accessible
4. Check IAM permissions for Cognito Identity Pool

**Problem**: JWT verification fails with "Token verification failed"

**Solutions**:
1. Ensure Access Token (not ID Token) is being sent
2. Verify token hasn't expired (check `exp` claim)
3. Check user hasn't been disabled in Cognito User Pool
4. Verify boto3 has correct AWS credentials and region
5. Check CloudWatch Logs for detailed error messages

**Problem**: "No access token provided in auth message"

**Solutions**:
1. Verify frontend is sending `{ type: 'auth', access_token: '...' }` as first message
2. Check WebSocket message format is correct JSON
3. Ensure Access Token is not empty or undefined
4. Verify test client is using correct token field name

### Tool Invocation Errors

**Problem**: Agent fails to invoke tools

**Solutions**:
1. Verify AGENTCORE_GATEWAY_URL is set correctly
2. Check AgentCore Gateway is deployed and accessible
3. Verify network connectivity between Runtime and Gateway
4. Check CloudWatch Logs for detailed error messages

## Outputs for Other Projects

### For Frontend (Project 4)

After deployment, provide:

- **WebSocket URL**: From `describe-runtime` command
- **Runtime ARN**: From CDK stack output
- **Region**: us-east-1 (or configured region)
- **Authentication**: JWT token from Cognito required

## Development Notes

### System Prompt

The agent's behavior is defined in the `SYSTEM_PROMPT` constant in `qsr_agent.py`. Key behaviors:

1. Greet customers by name when profile is available
2. Offer new order or repeat previous order options
3. Confirm pickup location before finalizing orders
4. Verify item availability at selected location
5. Handle interruptions gracefully
6. Use async tool calling for natural conversation flow

### Upgrading to WebSocket + BidiAgent

To enable bidirectional streaming:

1. Update `qsr_agent.py` to use `BidiAgent` and `BidiNovaSonicModel`
2. Implement `websocket_handler()` function
3. Update CDK stack to use WebSocket protocol
4. Test with frontend WebSocket client

### MCP Integration

To connect to AgentCore Gateway as MCP client:

1. Install MCP client library: `pip install mcp`
2. Implement MCP client connection in agent
3. Discover tools via `session.list_tools()`
4. Replace placeholder tools with discovered MCP tools

## References

- [Amazon Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/)
- [Strands Agents Framework](https://strandsagents.com/)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Amazon Nova Sonic v2 Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/nova-sonic.html)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
