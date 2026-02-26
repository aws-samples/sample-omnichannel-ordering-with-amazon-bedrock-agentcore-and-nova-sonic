# Implementation Notes — Amazon Connect Integration

## Reference Architecture

This integration is inspired by the [sample-serverless-nova-sonic-chat](https://github.com/aws-samples/sample-serverless-nova-sonic-chat) project, which demonstrates a serverless architecture for real-time voice conversations using AppSync Events as a bidirectional audio bus.

The key insight from that architecture is using **AppSync Events as the audio bus** — it decouples the client (whether it's a browser, mobile app, or Amazon Connect) from the AgentCore Runtime. A Lambda function in the middle handles session management and bridges everything together.

## Planned Flow

```
1. Caller dials in → Connect receives the call

2. Connect contact flow → Invokes a Lambda that creates a session
   (POST /session), using the caller's phone number as the identity

3. Lambda → Looks up the customer by phone number in DynamoDB
   (new field: phoneNumber on the customer record),
   gets the customerId, stores the sessionId

4. Lambda → Invokes the AgentCore Runtime agent, which subscribes
   to the AppSync Events channel for that sessionId

5. Connect → Streams caller audio to AppSync Events
   via a media streaming Lambda

6. AgentCore Runtime → Receives audio from AppSync,
   processes with Nova 2 Sonic, sends audio responses back to AppSync

7. Connect → Receives agent audio from AppSync
   and plays it to the caller
```

## Why This Approach Works

- **Minimal agent code changes** — the existing agent just listens on AppSync instead of a direct WebSocket
- **Authentication adapts per channel** — Cognito JWT for web/mobile, phone number lookup for Connect. Either way, the agent receives the same verified customer context in its system prompt
- **Same agent, same tools, same MCP gateway** serves both channels — that's the "omnichannel" in this repo's name
- **AppSync Events** handles the real-time bidirectional audio streaming, removing the need for custom WebSocket infrastructure

## Handling the Two Pre-Conversation Messages

The current agent requires two messages before the conversation starts:

1. **Authentication message** — The Lambda bridge handles this. For Connect, it maps caller ID → customerId via a DynamoDB lookup. For web/mobile, it uses Cognito JWT. Either way, the agent receives the same verified customer context (name, email, customerId) in its system prompt.

2. **Initial greeting trigger** — The Lambda sends the initial greeting trigger to AppSync after the agent subscribes to the session channel, same as the current WebSocket flow where the frontend sends a greeting message to make the agent speak first.

## New Infrastructure Required

This is a significant architecture addition:

- **AppSync Events API** — Real-time event bus for bidirectional audio streaming between clients and the agent
- **Session Management Lambda** — Creates sessions, maps caller ID to customer, invokes the agent
- **Media Streaming Lambda** — Bridges Connect's audio stream to/from AppSync Events
- **Amazon Connect Instance** — Contact flow, phone number, media streaming configuration
- **DynamoDB Updates** — Add `phoneNumber` field to customer records for caller ID lookup

## Impact on Existing Code

| Component | Change Required |
|-----------|----------------|
| AgentCore Runtime agent | Modify to listen on AppSync Events instead of (or in addition to) direct WebSocket |
| AgentCore Runtime auth (`jwt_auth.py`) | Support a second auth method (see above) |
| AgentCore Runtime prompts | Externalize system prompts into template files (see below) |
| DynamoDB Customer table | Add `phoneNumber` attribute and GSI for lookup |
| Cognito / Auth flow | No change — Connect path bypasses Cognito entirely |
| AgentCore Gateway | No change — same MCP tools serve both channels |
| Backend Lambda functions | No change — same APIs regardless of channel |
| Frontend (mobile-web) | No change — continues using direct WebSocket |

## System Prompt Architecture

The current agent has a single hardcoded system prompt in `qsr_agent.py` that assumes the customer is using a mobile/web app (e.g., it instructs the agent to get the customer's GPS location). For phone calls, there is no GPS — the agent needs a different workflow based on previous orders and known addresses.

### Design

1. **Separate prompt templates per channel:**
   - `prompts/cognito.txt` — For web/mobile (has GPS location, direct WebSocket)
   - `prompts/connect.txt` — For phone calls (no GPS, uses previous orders for location context)

2. **Template files with variable tags:**
   ```
   You are a friendly quick-service restaurant ordering assistant.
   Always respond in English regardless of the customer's name or background.

   CUSTOMER CONTEXT (VERIFIED):
   Customer Name: {{customer.name}}
   Customer Email: {{customer.email}}
   Customer ID: {{customer.id}}
   ```

3. **Loading strategy (in priority order):**
   - **AWS Systems Manager Parameter Store** — For production: prompts stored as SSM parameters, editable without redeployment
   - **DynamoDB** — Alternative: prompts stored in a prompts table, versioned
   - **Local files** — Fallback: prompt templates bundled with the agent code in `prompts/` directory

4. **Channel selection in the agent:**
   ```python
   # After authentication, select prompt based on auth method
   auth_method = auth_interceptor.auth_method  # 'cognito' or 'connect'
   prompt_template = load_prompt(channel=auth_method)
   system_prompt = render_prompt(prompt_template, {
       'customer.name': customer_name,
       'customer.email': customer_email,
       'customer.id': customer_id,
   })
   ```

### Key Differences Between Prompts

| Aspect | Cognito (web/mobile) | Connect (known caller) | Connect (anonymous) |
|--------|---------------------|----------------------|---------------------|
| Identity | Cognito JWT verified | Phone number → DynamoDB lookup | Phone number (new caller) |
| Customer ID | From Cognito attributes | From DynamoDB customer record | Phone number as ID (`anon-+1555...`) |
| Greeting | Greet by name | Greet by name | Ask for their name |
| Location | GPS from device | Inferred from previous orders | Ask the caller |
| Previous orders | Available | Available | None |
| Available tools | All including `get_customer_location` | All MCP tools except `get_customer_location` | All MCP tools except `get_customer_location` |
| Post-order | — | — | Suggest creating an account |

### Anonymous Caller Flow

When a caller's phone number is not found in the Customers table:

1. Session Lambda creates an anonymous customer record: `customerId: "anon-+15551234567"`
2. Session sets `isAnonymous: true` and `auth_method: "connect_anonymous"`
3. Agent loads `connect_anonymous_prompt.txt`
4. Agent asks for the caller's name, helps them order without prior context
5. After the order, suggests creating an account for faster service next time
6. The anonymous customer record and order history are preserved — if they call again, they'll be recognized by phone number and upgraded to the known caller flow

### Session Table Schema

```json
{
  "PK": "SESSION#<token>",
  "callerNumber": "+1-555-123-4567",
  "customerName": "Sergio Barraza",
  "customerEmail": "user@example.com",
  "customerId": "cust-abc123",
  "isAnonymous": false,
  "authMethod": "connect",
  "expiresAt": 1740000000
}
```

For anonymous callers:
```json
{
  "PK": "SESSION#<token>",
  "callerNumber": "+1-555-999-8888",
  "customerName": "Guest",
  "customerEmail": "",
  "customerId": "anon-+15559998888",
  "isAnonymous": true,
  "authMethod": "connect_anonymous",
  "expiresAt": 1740000000
}
```

### Benefits

- **No code changes to update prompts** — Edit in SSM or DynamoDB without redeploying the agent
- **A/B testing** — Store multiple prompt versions and select dynamically
- **Channel-specific behavior** — Each channel gets optimized instructions
- **Clean agent code** — `qsr_agent.py` stays focused on orchestration, not prompt text

## Authentication Changes Required

The current agent's `AuthInterceptor` expects a Cognito Access Token as the first WebSocket message and calls `cognito_idp.get_user()` to extract user info (name, email, customerId). This won't work for Connect because there's no Cognito Access Token — the caller is identified by phone number only.

**What the agent actually needs from authentication:**
- `customer_name` — for the greeting and system prompt
- `customer_email` — for the system prompt
- `customer_id` — for all backend API calls (GetPreviousOrders, AddToCart, etc.)

**Proposed solution — dual auth method:**

The `AuthInterceptor` needs to support two auth methods:

1. **Cognito** (existing, for web/mobile) — receives Access Token, calls `get_user()`, extracts user info
2. **Pre-verified context** (new, for Connect) — receives customer context directly from the trusted session Lambda

For the Connect path, the session Lambda looks up the customer by phone number in DynamoDB, then sends the first message as:

```json
{
  "type": "auth",
  "auth_method": "connect",
  "customer_name": "Sergio Barraza",
  "customer_email": "user@example.com",
  "customer_id": "cust-abc123"
}
```

**Trust model:** For Cognito, the Access Token proves identity (cryptographic verification). For Connect, the session Lambda is the trusted party — but the auth message must be secured to prevent impersonation from untrusted clients.

**Security requirement:** The Connect auth flow MUST include a verification mechanism to prevent a web/mobile client from sending `auth_method: "connect"` with a forged customer ID.

**Recommended approach — DynamoDB session token:**

1. Session Lambda generates a cryptographically random token (`crypto.randomUUID()`)
2. Writes it to a DynamoDB sessions table with the customer context and a 5-minute TTL:
   ```json
   {
     "PK": "SESSION#<token>",
     "customerName": "Sergio Barraza",
     "customerEmail": "user@example.com",
     "customerId": "cust-abc123",
     "expiresAt": 1740000000
   }
   ```
3. Auth message includes only the token: `{ "type": "auth", "auth_method": "connect", "session_token": "<token>" }`
4. Agent reads and deletes the token in one atomic DynamoDB operation (single-use)
5. If the token doesn't exist or is expired → reject authentication

This approach:
- No secrets to manage (no KMS, no Secrets Manager)
- No crypto libraries needed in the agent
- Single-use by design — once consumed, the token is gone
- Short TTL prevents replay attacks
- Only the session Lambda (running in your AWS account) can write to the sessions table

**Alternative — KMS-signed JWT:** The session Lambda signs a JWT with a KMS asymmetric key, and the agent verifies with the public key. More complex (requires KMS access, adds latency per verification call) but avoids the DynamoDB lookup.

**Code change in `AuthInterceptor.receive()`:**

```python
if message.get('type') == 'auth':
    auth_method = message.get('auth_method', 'cognito')
    
    if auth_method == 'cognito':
        # Existing flow: verify Access Token with Cognito
        access_token = message.get('access_token')
        self.user_info = verify_access_token(access_token, region=self.region)
    
    elif auth_method == 'connect':
        # New flow: trust pre-verified context from session Lambda
        self.user_info = {
            'username': message.get('customer_name'),
            'name': message.get('customer_name'),
            'email': message.get('customer_email'),
            'customerId': message.get('customer_id'),
        }
```

This keeps the existing Cognito flow untouched while adding Connect support with minimal code changes.

## Reference

- [sample-serverless-nova-sonic-chat](https://github.com/aws-samples/sample-serverless-nova-sonic-chat) — Reference architecture for AppSync Events + Nova Sonic
- [Amazon Connect Documentation](https://docs.aws.amazon.com/connect/) — Contact flows, media streaming
- [AppSync Events Documentation](https://docs.aws.amazon.com/appsync/latest/eventapi/) — Real-time event APIs

## CDK Deployment

The entire Connect integration can be deployed via CDK under `frontend/amazon-connect/cdk/`, following the same pattern as the other CDK projects in this repo.

### CDK Resources

| Resource | CDK Construct | Purpose |
|----------|--------------|---------|
| Connect Instance | `aws-connect.CfnInstance` | The Connect instance for handling calls |
| Phone Number | `aws-connect.CfnPhoneNumber` | Provisioned phone number for inbound calls |
| Contact Flow | `aws-connect.CfnContactFlow` | Call flow logic (answer → Lambda → stream → disconnect) |
| Session Lambda | `aws-lambda.Function` | Creates sessions, maps caller ID → customer, invokes agent |
| Media Streaming Lambda | `aws-lambda.Function` | Bridges Connect audio to/from AppSync Events |
| AppSync Events API | `aws-appsync.CfnApi` | Real-time audio bus between Connect and AgentCore |
| DynamoDB Sessions Table | `aws-dynamodb.Table` | Short-lived session tokens for secure auth |

### Contact Flow Definition

The contact flow is defined as JSON and deployed via `CfnContactFlow`. The flow handles:

1. Answer the incoming call
2. Invoke the session Lambda with the caller's phone number
3. Stream audio bidirectionally through AppSync Events
4. Handle disconnection and cleanup

```json
{
  "Version": "2019-10-30",
  "StartAction": "answer-call",
  "Actions": [
    {
      "Identifier": "answer-call",
      "Type": "AnswerCall",
      "Transitions": {
        "NextAction": "invoke-session-lambda"
      }
    },
    {
      "Identifier": "invoke-session-lambda",
      "Type": "InvokeLambdaFunction",
      "Parameters": {
        "LambdaFunctionARN": "<session-lambda-arn>",
        "InvocationTimeLimitSeconds": "8",
        "ResponseValidation": {
          "ResponseType": "JSON"
        }
      },
      "Transitions": {
        "NextAction": "set-session-attributes",
        "Errors": [
          {
            "NextAction": "play-error-message",
            "ErrorType": "NoMatchingError"
          }
        ]
      }
    },
    {
      "Identifier": "set-session-attributes",
      "Type": "UpdateContactAttributes",
      "Parameters": {
        "Attributes": {
          "sessionId": "$.External.sessionId",
          "customerName": "$.External.customerName"
        }
      },
      "Transitions": {
        "NextAction": "start-media-streaming"
      }
    },
    {
      "Identifier": "start-media-streaming",
      "Type": "StartMediaStreaming",
      "Parameters": {
        "MediaStreamTypes": ["AUDIO"],
        "Participants": ["CUSTOMER"]
      },
      "Transitions": {
        "NextAction": "invoke-media-bridge-lambda"
      }
    },
    {
      "Identifier": "invoke-media-bridge-lambda",
      "Type": "InvokeLambdaFunction",
      "Parameters": {
        "LambdaFunctionARN": "<media-bridge-lambda-arn>",
        "InvocationTimeLimitSeconds": "300"
      },
      "Transitions": {
        "NextAction": "stop-media-streaming",
        "Errors": [
          {
            "NextAction": "stop-media-streaming",
            "ErrorType": "NoMatchingError"
          }
        ]
      }
    },
    {
      "Identifier": "stop-media-streaming",
      "Type": "StopMediaStreaming",
      "Transitions": {
        "NextAction": "play-goodbye"
      }
    },
    {
      "Identifier": "play-goodbye",
      "Type": "MessageParticipant",
      "Parameters": {
        "Text": "Thank you for your order. Goodbye!",
        "SSML": "<speak>Thank you for your order. Goodbye!</speak>"
      },
      "Transitions": {
        "NextAction": "disconnect"
      }
    },
    {
      "Identifier": "play-error-message",
      "Type": "MessageParticipant",
      "Parameters": {
        "Text": "Sorry, we're having trouble connecting you. Please try again later.",
        "SSML": "<speak>Sorry, we're having trouble connecting you. Please try again later.</speak>"
      },
      "Transitions": {
        "NextAction": "disconnect"
      }
    },
    {
      "Identifier": "disconnect",
      "Type": "DisconnectParticipant"
    }
  ]
}
```

### Contact Flow Summary

```
Answer Call
    ↓
Invoke Session Lambda (caller ID → customer lookup → create session)
    ↓
Set Session Attributes (sessionId, customerName)
    ↓
Start Media Streaming (customer audio)
    ↓
Invoke Media Bridge Lambda (bridges audio ↔ AppSync Events ↔ AgentCore)
    ↓
Stop Media Streaming
    ↓
Play Goodbye Message
    ↓
Disconnect
```

### Deployment Order

1. Deploy the DynamoDB Sessions Table
2. Deploy the AppSync Events API
3. Deploy the Session Lambda and Media Bridge Lambda
4. Deploy the Connect Instance, Phone Number, and Contact Flow
5. Test with a phone call
