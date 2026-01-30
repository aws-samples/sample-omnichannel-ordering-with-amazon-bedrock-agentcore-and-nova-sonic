# Authentication Architecture

## Overview

The QSR Ordering System uses a multi-layered authentication approach with Cognito JWT tokens to secure the entire request flow from frontend to backend APIs.

## Authentication Flow

```
┌─────────────┐
│  Frontend   │
│   (React)   │
└──────┬──────┘
       │ 1. Login with Cognito User Pool
       │    → Receives JWT token
       │
       │ 2. Exchange JWT for temporary AWS credentials
       │    → Identity Pool provides access/secret keys
       │
       │ 3. WebSocket connection with:
       │    - SigV4 signed (WebSocket auth)
       │    - X-Cognito-JWT header (API auth)
       ▼
┌──────────────────────┐
│  AgentCore Runtime   │
│  (Strands Agent)     │
└──────┬───────────────┘
       │ 4. Extract JWT from headers
       │    jwt = event['headers']['X-Cognito-JWT']
       │
       │ 5. Store in session attributes
       │    session_attributes = {'jwtToken': jwt}
       │
       │ 6. Pass to AgentCore Gateway
       ▼
┌──────────────────────┐
│  AgentCore Gateway   │
│  (MCP Server)        │
└──────┬───────────────┘
       │ 7. Retrieve JWT from session
       │    jwt = session.attributes['jwtToken']
       │
       │ 8. Add Authorization header
       │    headers = {'Authorization': f'Bearer {jwt}'}
       │
       │ 9. Call API Gateway with JWT
       ▼
┌──────────────────────┐
│   API Gateway        │
│  (REST API)          │
└──────┬───────────────┘
       │ 10. Validate JWT with Cognito
       │     Authorizer checks:
       │     - Token signature
       │     - Token expiration
       │     - User Pool membership
       │
       │ 11. Valid → 200 OK
       │     Invalid → 401 Unauthorized
       ▼
┌──────────────────────┐
│  Lambda Functions    │
│  (Business Logic)    │
└──────────────────────┘
```

## Components

### 1. Frontend (React)

**Responsibilities:**
- Authenticate user with Cognito User Pool
- Obtain JWT token from successful login
- Exchange JWT for temporary AWS credentials
- Connect to WebSocket with both SigV4 and JWT

**Code Example:**
```typescript
// 1. Login and get JWT
const session = await Auth.signIn(username, password);
const jwtToken = session.getIdToken().getJwtToken();

// 2. Get temporary credentials
const credentials = await Auth.currentCredentials();

// 3. Connect to WebSocket
const sigV4Headers = signWebSocketRequest(websocketUrl, credentials);
const ws = new WebSocket(websocketUrl, {
  headers: {
    'Authorization': sigV4Headers,
    'X-Cognito-JWT': jwtToken  // Custom header for API auth
  }
});
```

### 2. AgentCore Runtime (Python)

**Responsibilities:**
- Extract JWT from WebSocket connection event
- Store JWT in session attributes
- Pass JWT to AgentCore Gateway via session context

**Code Example:**
```python
def websocket_handler(event, context):
    # Extract JWT from headers
    headers = event.get('headers', {})
    jwt_token = headers.get('X-Cognito-JWT') or headers.get('x-cognito-jwt')
    
    if not jwt_token:
        return {
            'statusCode': 401,
            'body': json.dumps({'error': 'Missing JWT token'})
        }
    
    # Store in session for Gateway
    session_attributes = {
        'jwtToken': jwt_token,
        'cognitoIdentityId': event['requestContext']['identity']['cognitoIdentityId']
    }
    
    # Create agent with session
    agent = BidiAgent(
        model=model,
        tools=tools,
        session_attributes=session_attributes
    )
```

### 3. AgentCore Gateway (CDK)

**Responsibilities:**
- Retrieve JWT from session attributes
- Add Authorization header to API Gateway requests
- Handle 401 responses gracefully

**Configuration:**
```typescript
// Gateway retrieves JWT from session and adds to HTTP headers
const gatewayConfig = {
  target: apiGatewayUrl,
  authType: 'JWT',
  jwtSource: 'session.attributes.jwtToken',
  headerName: 'Authorization',
  headerFormat: 'Bearer {token}'
};
```

### 4. API Gateway (CDK)

**Responsibilities:**
- Validate JWT with Cognito User Pool Authorizer
- Return 401 if JWT is invalid/expired
- Pass validated requests to Lambda

**Configuration:**
```typescript
const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
  cognitoUserPools: [userPool],
  identitySource: 'method.request.header.Authorization'
});

// Apply to all endpoints
endpoint.addMethod('GET', integration, {
  authorizer,
  authorizationType: apigateway.AuthorizationType.COGNITO
});
```

### 5. Lambda Functions (Node.js)

**Responsibilities:**
- Process authenticated requests
- Access user context from API Gateway event
- No additional authentication needed

**User Context Available:**
```typescript
export const handler = async (event: APIGatewayProxyEvent) => {
  // User info from JWT (validated by API Gateway)
  const claims = event.requestContext.authorizer?.claims;
  const userId = claims?.sub;
  const email = claims?.email;
  const username = claims?.['cognito:username'];
  
  // Process request with authenticated user context
};
```

## Security Benefits

### 1. Defense in Depth
- **Layer 1**: WebSocket authentication (SigV4)
- **Layer 2**: API Gateway authentication (JWT)
- **Layer 3**: Lambda execution role (IAM)

### 2. Stateless Authentication
- JWT contains all user information
- No session storage required
- Scales horizontally without shared state

### 3. Token Expiration
- JWT tokens expire (typically 1 hour)
- Frontend automatically refreshes tokens
- Expired tokens rejected at API Gateway

### 4. User Context Propagation
- User identity flows through entire stack
- No need to pass customer ID explicitly
- Agent can access user context automatically

## Error Handling

### 401 Unauthorized Responses

**Causes:**
- JWT token missing
- JWT token expired
- JWT token invalid (tampered)
- User not in Cognito User Pool

**Frontend Handling:**
```typescript
ws.onerror = async (error) => {
  if (error.code === 401) {
    // Refresh JWT token
    const newToken = await Auth.currentSession().getIdToken().getJwtToken();
    
    // Reconnect with new token
    reconnectWebSocket(newToken);
  }
};
```

**AgentCore Runtime Handling:**
```python
try:
    response = gateway.call_tool(tool_name, params)
except Unauthorized:
    # Notify user that session expired
    return {
        'type': 'error',
        'message': 'Your session has expired. Please log in again.'
    }
```

## Testing

### Getting Your Deployment Values

After deploying the CDK stacks, you'll need these values for testing:

1. **Cognito Client ID**: From CDK deployment output `CognitoStack.UserPoolClientId`
2. **AWS Region**: The region where you deployed (e.g., `us-east-1`)
3. **API Gateway URL**: From CDK deployment output `ApiGatewayStack.ApiGatewayUrl`

Replace `<YOUR_CLIENT_ID>`, `<YOUR_REGION>`, and `<YOUR_API_GATEWAY_URL>` in the examples below with your actual values.

### Initial Login with Temporary Password

When a user is created with a temporary password, Cognito requires a password change on first login. This is a security best practice.

**Step 1: Attempt login with temporary password**
```bash
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id <YOUR_CLIENT_ID> \
  --auth-parameters USERNAME=AppUser,PASSWORD=<temporary-password> \
  --region <YOUR_REGION>
```

**Expected Response:**
```json
{
    "ChallengeName": "NEW_PASSWORD_REQUIRED",
    "Session": "<session-token>",
    "ChallengeParameters": {
        "USER_ID_FOR_SRP": "AppUser",
        "requiredAttributes": "[]",
        "userAttributes": "{\"email_verified\":\"true\",\"email\":\"your-email@example.com\"}"
    }
}
```

**Step 2: Respond to password change challenge**
```bash
aws cognito-idp respond-to-auth-challenge \
  --client-id <YOUR_CLIENT_ID> \
  --challenge-name NEW_PASSWORD_REQUIRED \
  --session "<session-token-from-step-1>" \
  --challenge-responses USERNAME=AppUser,NEW_PASSWORD=<new-password> \
  --region <YOUR_REGION>
```

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

**Successful Response:**
```json
{
    "AuthenticationResult": {
        "AccessToken": "<access-token>",
        "ExpiresIn": 3600,
        "TokenType": "Bearer",
        "RefreshToken": "<refresh-token>",
        "IdToken": "<id-token>"
    }
}
```

The `IdToken` is the JWT token you'll use for API Gateway authentication.

### Test JWT Authentication

```bash
# 1. Get JWT token from Cognito (after password change)
JWT_TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id <YOUR_CLIENT_ID> \
  --auth-parameters USERNAME=$USERNAME,PASSWORD=$PASSWORD \
  --region <YOUR_REGION> \
  --query 'AuthenticationResult.IdToken' \
  --output text)

# 2. Test API Gateway with JWT
curl "<YOUR_API_GATEWAY_URL>/menu?locationId=loc-123" \
  -H "Authorization: Bearer $JWT_TOKEN"

# 3. Test without JWT (should return 401)
curl "<YOUR_API_GATEWAY_URL>/menu?locationId=loc-123"
# Response: {"message":"Unauthorized"}
```

## Troubleshooting

### JWT Token Not Passed

**Symptom**: All API calls return 401

**Check:**
1. Frontend sending `X-Cognito-JWT` header?
2. AgentCore Runtime extracting JWT from headers?
3. AgentCore Runtime storing JWT in session attributes?
4. AgentCore Gateway retrieving JWT from session?
5. AgentCore Gateway adding Authorization header?

### JWT Token Expired

**Symptom**: Intermittent 401 errors after ~1 hour

**Solution:**
- Frontend should refresh token before expiration
- Implement token refresh logic in WebSocket error handler

### JWT Token Invalid

**Symptom**: Consistent 401 errors with valid-looking token

**Check:**
1. Token from correct User Pool?
2. User Pool ID matches API Gateway authorizer?
3. Token not tampered with?
4. Token format is `Bearer <token>`?

## Best Practices

1. **Never log JWT tokens** - They contain sensitive user information
2. **Refresh tokens proactively** - Don't wait for 401 errors
3. **Use HTTPS everywhere** - Protect tokens in transit
4. **Validate token expiration** - Check before making requests
5. **Handle 401 gracefully** - Provide clear user feedback

## References

- [Cognito User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html)
- [API Gateway Cognito Authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html)
- [JWT Token Structure](https://jwt.io/)
- [SigV4 Signing](https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html)
