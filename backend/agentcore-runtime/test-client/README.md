# AgentCore Runtime Test Client

This directory contains a test client for connecting to AWS Bedrock AgentCore Runtime with Cognito + SigV4 authentication.

## Client: `client-cognito-sigv4.py`

**Complete authentication flow for production use:**
- Authenticates with Cognito User Pool → JWT IdToken
- Exchanges JWT for temporary AWS credentials via Cognito Identity Pool
- Creates SigV4 presigned WebSocket URL
- Opens browser with HTML client pre-configured

**Use this client when:**
- Testing the complete authentication flow that the frontend will use
- Simulating real user authentication
- Testing with Cognito-managed users

**Usage:**
```bash
cd backend/agentcore-runtime/test-client

python3 client-cognito-sigv4.py \
  --username AppUser \
  --password '$Test123$' \
  --user-pool-id us-east-1_XXXXXXXXX \
  --client-id 1avtmgfmlga01ecigptie85u5v \
  --identity-pool-id us-east-1:7c5c3e3a-8f4a-4b5e-9d2a-1c3b5e7f9a2b \
  --runtime-arn arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/RUNTIMEID \
  --region us-east-1
```

**Note:** The `--map-name` and `--place-index-name` parameters are optional and default to `QSRRestaurantMap` and `QSRRestaurantIndex` respectively. Only specify them if you're using different resource names.

**Using environment variables:**
```bash
export AWS_REGION=us-east-1
export COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
export COGNITO_CLIENT_ID=1avtmgfmlga01ecigptie85u5v
export COGNITO_IDENTITY_POOL_ID=us-east-1:7c5c3e3a-8f4a-4b5e-9d2a-1c3b5e7f9a2b

python3 client-cognito-sigv4.py \
  --username AppUser \
  --password '$Test123$' \
  --runtime-arn arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/RUNTIMEID
```

**Features:**
- ✅ Complete Cognito authentication flow
- ✅ Automatic JWT token extraction and validation
- ✅ Temporary AWS credentials management
- ✅ SigV4 presigned URL generation (built-in, no external dependencies)
- ✅ URL regeneration with fresh credentials (via API endpoint)
- ✅ Handles NEW_PASSWORD_REQUIRED challenge for first-time login
- ✅ Browser-based HTML client interface with interactive map
- ✅ AWS Location Service integration for address search and geocoding
- ✅ Real-time address auto-complete suggestions
- ✅ Browser geolocation API with fallback to default location
- ✅ Step-by-step authentication progress output

---

## Command-Line Parameters

### Required Parameters

- `--username` - Cognito username
- `--password` - Cognito password
- `--user-pool-id` - Cognito User Pool ID (e.g., `us-east-1_XXXXXXXXX`)
- `--client-id` - Cognito User Pool Client ID
- `--identity-pool-id` - Cognito Identity Pool ID (e.g., `us-east-1:uuid`)
- `--runtime-arn` - AgentCore Runtime ARN

### Optional Parameters

- `--region` - AWS region (default: `us-east-1`, can use `AWS_REGION` env var)
- `--service` - AWS service name (default: `bedrock-agentcore`)
- `--expires` - URL expiration time in seconds (default: `3600` = 1 hour)
- `--qualifier` - Runtime qualifier (default: `DEFAULT`)
- `--port` - Web server port (default: `8000`)
- `--no-browser` - Don't automatically open browser
- `--map-name` - AWS Location Service Map name (default: `QSRRestaurantMap`)
- `--place-index-name` - AWS Location Service Place Index name (default: `QSRRestaurantIndex`)

### Environment Variables

The following environment variables can be used instead of command-line parameters:
- `AWS_REGION` - AWS region
- `COGNITO_USER_POOL_ID` - Cognito User Pool ID
- `COGNITO_CLIENT_ID` - Cognito User Pool Client ID
- `COGNITO_IDENTITY_POOL_ID` - Cognito Identity Pool ID

---

## Files

- **`client-cognito-sigv4.py`** - Main test client with integrated Cognito + SigV4 authentication
- **`clientUI.html`** - HTML/JavaScript WebSocket client interface
- **`README.md`** - This documentation file
- **`USAGE_EXAMPLE.md`** - Detailed usage examples with placeholder values

---

## Authentication Flow
## Authentication Flow

```
User Credentials (username/password)
    ↓
Cognito User Pool Authentication
    ↓
JWT IdToken
    ↓
Cognito Identity Pool
    ↓
Temporary AWS Credentials (AccessKeyId, SecretKey, SessionToken)
    ↓
SigV4 Presigned WebSocket URL
    ↓
AgentCore Runtime WebSocket Connection
```

---

## Prerequisites

### Python Dependencies
```bash
pip3 install boto3 --break-system-packages
```

### AWS Configuration

- Cognito User Pool with users
- Cognito Identity Pool configured with User Pool as identity provider
- Identity Pool authenticated role with permissions:
  - `bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream`
  - `geo:GetMapStyleDescriptor`, `geo:GetMapSprites`, `geo:GetMapGlyphs`, `geo:GetMapTile`
  - `geo:SearchPlaceIndexForText`, `geo:SearchPlaceIndexForSuggestions`, `geo:GetPlace`
- AgentCore Runtime deployed without JWT authorizer
- AWS Location Service Map (e.g., `QSRRestaurantMap`)
- AWS Location Service Place Index (e.g., `QSRRestaurantIndex`)

---

## Helper Utilities

The client includes built-in SigV4 signing functionality:
- `create_presigned_url()` - Creates SigV4 presigned WebSocket URL using temporary AWS credentials

No external helper modules required - everything is self-contained in `client-cognito-sigv4.py`.

---

## Troubleshooting

### Authentication Errors

**"Authentication failed" with Cognito:**
- Verify username and password are correct
- Check User Pool ID and Client ID match your deployment
- Ensure user exists in the User Pool
- Check if password change is required (first-time login)

**"Failed to get Identity ID":**
- Verify Identity Pool ID is correct
- Check Identity Pool has User Pool configured as identity provider
- Ensure User Pool ID in Identity Provider matches your User Pool

**"Failed to get AWS credentials":**
- Verify Identity Pool authenticated role has correct permissions
- Check role has `bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream` permission
- Verify trust relationship allows Cognito Identity Pool

### Connection Errors

**"Connection refused" or "Connection timeout":**
- Verify Runtime ARN is correct
- Check region matches Runtime deployment
- Ensure Runtime is deployed and active
- Verify network connectivity to AWS

**"403 Forbidden" or "401 Unauthorized":**
- Check presigned URL hasn't expired (default 1 hour)
- Verify AWS credentials are valid
- Ensure IAM permissions are correct
- Try regenerating the URL with fresh credentials

### URL Expiration

Presigned URLs expire after the specified time (default 1 hour). To get a fresh URL:

**In the browser client:**
- Click the "Regenerate URL" button
- The client will automatically re-authenticate with Cognito and generate a new URL

**Via API:**
```bash
curl -X POST http://localhost:8000/api/regenerate
```

---

## Security Notes

⚠️ **Never commit credentials to the repository:**
- Don't hardcode passwords in scripts
- Don't commit files with actual AWS resource IDs
- Use environment variables or command-line arguments for sensitive data
- Don't commit test results with real credentials or tokens

✅ **Best practices:**
- Use strong passwords for Cognito users
- Rotate credentials regularly
- Use short expiration times for presigned URLs (1 hour default)
- Monitor CloudWatch logs for unauthorized access attempts
- Use least-privilege IAM permissions

---

## Additional Resources

- [AWS Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [Cognito User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html)
- [Cognito Identity Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-identity.html)
- [AWS Signature Version 4](https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html)
- [WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)
