# Usage Example: Cognito + SigV4 Test Client

This document provides example commands for testing the AgentCore Runtime with Cognito authentication.

## Prerequisites

1. **Install Python dependencies:**
   ```bash
   pip3 install boto3 --break-system-packages
   ```

2. **Deploy the infrastructure:**
   - Backend infrastructure with Cognito (User Pool + Identity Pool)
   - AgentCore Runtime without JWT authorizer

3. **Create a test user in Cognito User Pool:**
   - Username: `AppUser`
   - Password: `$Test123$` (or your chosen password)

## Example Command

Replace the placeholder values with your actual deployment values:

```bash
cd backend/agentcore-runtime/test-client

python3 client-cognito-sigv4.py \
  --username AppUser \
  --password '$Test123$' \
  --user-pool-id us-east-1_XXXXXXXXX \
  --client-id YOUR_CLIENT_ID \
  --identity-pool-id us-east-1:YOUR-IDENTITY-POOL-UUID \
  --runtime-arn arn:aws:bedrock-agentcore:us-east-1:ACCOUNT_ID:runtime/RUNTIME_ID \
  --region us-east-1
```

## Using Environment Variables

For convenience, you can set environment variables:

```bash
export AWS_REGION=us-east-1
export COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
export COGNITO_CLIENT_ID=YOUR_CLIENT_ID
export COGNITO_IDENTITY_POOL_ID=us-east-1:YOUR-IDENTITY-POOL-UUID

python3 client-cognito-sigv4.py \
  --username AppUser \
  --password '$Test123$' \
  --runtime-arn arn:aws:bedrock-agentcore:us-east-1:ACCOUNT_ID:runtime/RUNTIME_ID
```

## Getting Your Deployment Values

### 1. Get Cognito User Pool ID and Client ID

From the backend-infrastructure deployment outputs:

```bash
cd backend/backend-infrastructure
aws cloudformation describe-stacks \
  --stack-name QSR-CognitoStack \
  --query 'Stacks[0].Outputs' \
  --output table
```

Look for:
- `UserPoolId`: us-east-1_XXXXXXXXX
- `UserPoolClientId`: YOUR_CLIENT_ID

### 2. Get Cognito Identity Pool ID

From the backend-infrastructure deployment outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name QSR-CognitoStack \
  --query 'Stacks[0].Outputs[?OutputKey==`IdentityPoolId`].OutputValue' \
  --output text
```

### 3. Get Runtime ARN

From the agentcore-runtime deployment outputs:

```bash
cd backend/agentcore-runtime/cdk
aws cloudformation describe-stacks \
  --stack-name AgentCoreRuntimeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`RuntimeArn`].OutputValue' \
  --output text
```

## Expected Output

When you run the client, you should see:

```
======================================================================
🎙️ Cognito + SigV4 AgentCore Test Client
======================================================================
🌍 Region: us-east-1
🔑 Runtime ARN: arn:aws:bedrock-agentcore:us-east-1:ACCOUNT_ID:runtime/RUNTIME_ID
👤 Username: AppUser
🏊 User Pool ID: us-east-1_XXXXXXXXX
📱 Client ID: YOUR_CLIENT_ID
🆔 Identity Pool ID: us-east-1:YOUR-IDENTITY-POOL-UUID
⏰ URL expires in: 3600 seconds (60.0 minutes)
======================================================================

======================================================================
🔐 Cognito Authentication Flow
======================================================================

📝 Step 1: Authenticating with Cognito User Pool...
   User Pool ID: us-east-1_XXXXXXXXX
   Client ID: YOUR_CLIENT_ID
   Username: AppUser
✅ Authentication successful
   JWT Token: eyJraWQiOiJxxx...

🔍 Step 2: Extracting User Pool ID from JWT token...
✅ User Pool ID extracted: us-east-1_XXXXXXXXX

🆔 Step 3: Getting Identity ID from Cognito Identity Pool...
   Identity Pool ID: us-east-1:YOUR-IDENTITY-POOL-UUID
   Identity Provider: cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXXXX
✅ Identity ID obtained: us-east-1:xxx-xxx-xxx

🔑 Step 4: Exchanging JWT for temporary AWS credentials...
✅ Temporary AWS credentials obtained
   Access Key ID: ASIAXXXXXXXXXXX...
   Expiration: 2025-01-15 12:34:56+00:00

======================================================================
✅ Cognito Authentication Complete
======================================================================

🔐 Step 5: Creating SigV4 presigned WebSocket URL...
   Base URL: wss://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn:aws:bedrock-agentcore:us-east-1:ACCOUNT_ID:runtime/RUNTIME_ID/ws?qualifier=DEFAULT&voice_id=matthew
   Session ID: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
✅ Presigned WebSocket URL created
   URL: wss://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn:aws:bedrock-agentcore:us-east-1:ACCOUNT_ID:runtime/RUNTIME_ID/ws?qualifier=DEFAULT&voice_id=matthew&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...

======================================================================
🌐 Starting Web Server
======================================================================
📍 Server URL: http://localhost:8000
🔗 Client Page: http://localhost:8000/
📊 API Endpoint: http://localhost:8000/api/connection
🔄 Regenerate URL: http://localhost:8000/api/regenerate (POST)

💡 The presigned WebSocket URL is pre-populated in the client
💡 Click 'Regenerate URL' in the client to get fresh credentials
💡 Press Ctrl+C to stop the server
======================================================================

🌐 Opening browser...
```

The browser will automatically open with the HTML client interface, and the WebSocket URL will be pre-populated.

## Testing the Connection

1. **In the browser client:**
   - The WebSocket URL should be pre-filled
   - Click "Connect" to establish the WebSocket connection
   - You should see connection status messages
   - Try sending a test message to the agent

2. **If the URL expires:**
   - Click the "Regenerate URL" button in the client
   - The client will automatically re-authenticate with Cognito
   - A fresh presigned URL will be generated
   - The new URL will be populated in the input field

## Troubleshooting

### "Authentication failed"
- Verify username and password are correct
- Check User Pool ID and Client ID match your deployment
- Ensure user exists in the User Pool

### "Failed to get Identity ID"
- Verify Identity Pool ID is correct
- Check Identity Pool has User Pool configured as identity provider

### "Failed to get AWS credentials"
- Verify Identity Pool authenticated role has `bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream` permission
- Check role trust relationship allows Cognito Identity Pool

### "Connection refused" or "403 Forbidden"
- Verify Runtime ARN is correct
- Check region matches Runtime deployment
- Ensure Runtime is deployed and active
- Try regenerating the URL with fresh credentials

## Security Notes

⚠️ **Never commit actual credentials or resource IDs to the repository**

This example file uses placeholder values. Always use your actual deployment values when running the client locally.
