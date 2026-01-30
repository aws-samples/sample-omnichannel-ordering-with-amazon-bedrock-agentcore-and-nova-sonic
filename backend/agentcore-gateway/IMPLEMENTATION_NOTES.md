# AgentCore Gateway Implementation Notes (Boto3)

## Overview

This document provides technical implementation details for the AgentCore Gateway deployment using Python boto3 scripts.

## Why Boto3 Instead of CDK?

This is a **temporary workaround** because:

1. **CDK/CloudFormation Limitation**: AWS CDK and CloudFormation do not currently support API Gateway as a target type for AgentCore Gateway
2. **Service Team ETA**: AWS AgentCore service team estimates 1-2 months for CDK/CloudFormation support
3. **Boto3 Advantages**: 
   - Full control over all API calls
   - Follows official AWS blog guidance
   - Direct SDK access to all features
   - No dependency on CDK library updates
4. **Easy Migration**: When CDK support is available, we can rewrite using AWS CDK TypeScript

## Implementation Approach

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     AgentCore Runtime                           │
│                   (IAM credentials)                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ AWS SigV4 (IAM Authorization)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AgentCore Gateway                             │
│                   (AWS_IAM authorization)                       │
│                   (MCP protocol)                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ AWS SigV4 (IAM Authorization)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                Backend API Gateway                              │
│              (AWS_IAM authorization)                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ Lambda Functions│
                    └────────────────┘
```

**Key Architecture Features**:
- Direct IAM-based communication between Gateway and API Gateway
- No Lambda interceptor needed
- Both AgentCore Gateway and Backend API Gateway use AWS Signature Version 4 (SigV4)
- Frontend applications use Cognito Identity Pool to get temporary AWS credentials
- All requests are signed with AWS SigV4

### Phase 1: Resource Creation (deploy-gateway.py)

The deployment script creates resources in the following order:

#### 1. IAM Role

**Gateway Service Role**:
- Trust policy: bedrock-agentcore service
- Inline policy: API Gateway invocation permissions
- Automatically updates policy if role exists (fixes manual fix issue)

#### 2. OpenAPI Schema Fetching

- Uses `apigateway.get_export()` to fetch OpenAPI 3.0 schema
- Parses schema to extract paths and methods
- Generates tool filters (path + methods)
- Generates tool overrides (name, description from operationId)

#### 3. AgentCore Gateway Creation

- Creates Gateway with IAM authorization (inbound)
- Configures MCP protocol (version 2025-03-26)
- Enables exception-level debugging with `exceptionLevel='DEBUG'`
- No Lambda interceptor configuration (direct IAM communication)
- Returns Gateway ID and URL

#### 4. Gateway Target Creation

- Creates Target with API Gateway Service configuration
- Configures tool filters and overrides
- Sets credential provider to GATEWAY_IAM_ROLE
- Returns Target ID

#### 5. Target Status Verification

- Waits for target to reach READY status (up to 60 seconds)
- Polls target status every 2 seconds
- Checks for errors in target configuration
- Displays detailed status information
- Fails deployment if target has errors

#### 6. Output Generation

- Saves all resource ARNs to JSON file
- Prints deployment summary
- Provides next steps

### Phase 2: Resource Cleanup (delete-gateway.py)

The cleanup script deletes resources in reverse order:

1. **Discover and Delete Gateway Targets**
   - Lists all targets for the gateway
   - Shows target details (ID, name, status, description)
   - Asks for Y/N confirmation for each target (unless --force)
   - Deletes confirmed targets
2. Delete Gateway
3. Delete IAM role (optional with --keep-roles)

**Enhanced Features**:
- Automatic target discovery (works without deployment-outputs.json)
- User confirmation prompts for safety
- Handles missing resources gracefully

## Key Boto3 Operations

### AgentCore Gateway Operations

```python
# Create Gateway
bedrock_agentcore.create_gateway(
    name='qsr-ordering-gateway',
    description='...',
    authorizerType='IAM',  # IAM-based inbound auth
    protocolType='MCP',
    protocolConfiguration={
        'mcp': {
            'supportedVersions': ['2025-03-26'],
            'searchType': 'SEMANTIC',
            'instructions': '...'
        }
    },
    exceptionLevel='DEBUG',  # Enable detailed exception logging
    roleArn=gateway_role_arn
)

# Create Gateway Target
bedrock_agentcore.create_gateway_target(
    gatewayIdentifier=gateway_id,
    name='qsr-backend-api',
    description='...',
    targetConfiguration={
        'mcp': {
            'apiGateway': {  # API Gateway Service target
                'restApiId': api_gateway_id,
                'stage': stage_name,
                'apiGatewayToolConfiguration': {
                    'toolFilters': tool_filters,
                    'toolOverrides': tool_overrides
                }
            }
        }
    },
    credentialProviderConfigurations=[
        {
            'credentialProviderType': 'GATEWAY_IAM_ROLE'
        }
    ]
)
```

### API Gateway Operations

```python
# Fetch OpenAPI schema
apigateway.get_export(
    restApiId=api_gateway_id,
    stageName=stage_name,
    exportType='oas30',
    accepts='application/json'
)
```

### IAM Operations

```python
# Create IAM role
iam.create_role(
    RoleName=role_name,
    AssumeRolePolicyDocument=json.dumps(trust_policy),
    Description='...'
)

# Attach managed policy
iam.attach_role_policy(
    RoleName=role_name,
    PolicyArn='arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
)

# Add inline policy
iam.put_role_policy(
    RoleName=role_name,
    PolicyName='PolicyName',
    PolicyDocument=json.dumps(policy_document)
)
```

## Authorization Flow

### Inbound Authentication (AgentCore Runtime → Gateway)

**Type**: AWS_IAM authorization

**Flow**:
1. AgentCore Runtime uses IAM credentials (role or user)
2. Runtime signs requests using AWS Signature Version 4 (SigV4)
3. Gateway validates IAM credentials
4. Gateway authorizes based on IAM policies

**Required IAM Policy for AgentCore Runtime**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock-agentcore:InvokeGateway",
      "Resource": "arn:aws:bedrock-agentcore:region:account:gateway/gateway-id"
    }
  ]
}
```

### Outbound Authentication (Gateway → Backend API)

**Type**: AWS_IAM authorization (AWS SigV4)

**Flow**:
1. Gateway receives request from Runtime
2. Gateway service role has permissions to invoke Backend API Gateway
3. Gateway signs requests with AWS SigV4 using its IAM role
4. Backend API Gateway validates IAM credentials
5. Backend API invokes Lambda functions

**Why This Changed from Cognito User Pool**:

AgentCore Gateway does NOT support Cognito User Pool authorization for API Gateway targets. The supported authorization types are:
- `AWS_IAM` (AWS Signature Version 4)
- `API_KEY`
- No authorization

**Frontend Application Flow**:

For frontend applications that need to call the Backend API:
1. User authenticates with Cognito User Pool
2. Frontend exchanges Cognito token for temporary AWS credentials via Cognito Identity Pool
3. Frontend signs API requests with AWS SigV4 using temporary credentials
4. Backend API Gateway validates IAM credentials

## Tool Discovery

### Tool Filters

Tool filters define which API paths and HTTP methods are exposed as tools:

```python
{
    'filterPath': '/customers/profile',
    'methods': ['GET']
}
```

### Tool Overrides

Tool overrides provide custom names and descriptions for each tool:

```python
{
    'name': 'getCustomersProfile',
    'path': '/customers/profile',
    'method': 'GET',
    'description': 'Get customer profile information'
}
```

### Generation Logic

1. Parse OpenAPI schema paths
2. For each path, extract HTTP methods
3. Create tool filter with path + methods
4. For each method, create tool override with:
   - Name: operationId or generated from path
   - Path: API path
   - Method: HTTP method
   - Description: summary or description from OpenAPI

## Script Enhancements

### Deployment Script (deploy-gateway.py)

**Key Features**:
1. **Automatic Resource Reuse**: Detects and reuses existing resources (IAM role, Gateway, Target)
2. **Automatic Policy Update**: Updates IAM role policy with correct API Gateway ARN if role exists
3. **Target Status Verification**: Waits for target to reach READY status before completing
4. **Error Detection**: Checks for errors in target configuration and fails deployment if found
5. **Exception-Level Debugging**: Enables detailed exception logging with `exceptionLevel='DEBUG'`
6. **Environment Credentials**: Supports AWS credentials from environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
7. **CLI Overrides**: All configuration values can be overridden via command-line arguments

**Usage Examples**:
```bash
# Deploy with config file
python3 scripts/deploy-gateway.py --config scripts/config.yaml.example

# Override API Gateway ID
python3 scripts/deploy-gateway.py \
  --config scripts/config.yaml.example \
  --api-gateway-id hj65he2og8 \
  --region us-east-1
```

### Delete Script (delete-gateway.py)

**Key Features**:
1. **Automatic Target Discovery**: Lists all targets for a gateway automatically
2. **User Confirmation**: Shows target details and asks for Y/N confirmation before deletion
3. **Force Mode**: Skip confirmations with `--force` flag
4. **Graceful Handling**: Handles missing resources without errors
5. **Keep Roles Option**: Optionally keep IAM roles with `--keep-roles` flag

**Usage Examples**:
```bash
# Delete with confirmation prompts
python3 scripts/delete-gateway.py \
  --gateway-id qsr-ordering-gateway-2ze43yjwqr \
  --region us-east-1

# Delete without confirmation
python3 scripts/delete-gateway.py \
  --gateway-id qsr-ordering-gateway-2ze43yjwqr \
  --region us-east-1 \
  --force

# Delete but keep IAM roles
python3 scripts/delete-gateway.py \
  --gateway-id qsr-ordering-gateway-2ze43yjwqr \
  --region us-east-1 \
  --keep-roles
```

### Status Indicators

Both scripts use clear status indicators:
- ✅ Success (green)
- ❌ Error (red)
- ⚠️ Warning (yellow)
- ℹ️ Info (blue)

## Configuration Management

### YAML Configuration

Configuration is managed via `config.yaml`:

```yaml
aws:
  region: us-east-1
  profile: default

backend:
  api_gateway_id: 2evdqnd12j
  api_gateway_stage: prod

gateway:
  name: qsr-ordering-gateway
  description: ...

iam:
  gateway_role_name: QSRAgentCoreGatewayRole

output:
  save_to_file: true
  output_file: deployment-outputs.json
```

### CLI Overrides

CLI arguments override YAML configuration:

```bash
python scripts/deploy-gateway.py \
  --config scripts/config.yaml \
  --api-gateway-id abc123 \
  --region us-west-2
```

## Error Handling

### Idempotency

The deployment script handles existing resources gracefully:

- **IAM Role**: If role exists, updates inline policy with current API Gateway ARN
- **Gateway**: If gateway with same name exists, uses existing gateway
- **Target**: If target with same name exists, uses existing target

**Enhanced Error Handling**:
- Automatic retry logic for target status checks
- Clear error messages with status indicators
- Graceful handling of missing resources in delete script
- User confirmation prompts before destructive operations

### Rollback

The script does not automatically rollback on failure. To clean up:

```bash
python scripts/delete-gateway.py --gateway-id <gateway-id>
```

### Error Messages

The script provides clear error messages with:
- ✅ Success indicators
- ❌ Error indicators
- ⚠️ Warning indicators
- ℹ️ Info indicators

## Security Considerations

### IAM Permissions

**Principle of Least Privilege**: The IAM role has only the permissions it needs:

- Gateway service role: API Gateway invocation only

### Secrets Management

- No secrets stored in configuration files
- IAM credentials managed by AWS

## Monitoring and Logging

### CloudWatch Logs

**Gateway Logs**: Not directly available, monitor via API Gateway logs if needed

### Metrics

Monitor API Gateway metrics:
- Request count
- Errors
- Latency

## Testing

### Verify Gateway

```bash
aws bedrock-agentcore get-gateway --gateway-identifier <gateway-id>
```

### Verify Target Status

```bash
aws bedrock-agentcore-control get-gateway-target \
  --gateway-identifier <gateway-id> \
  --target-id <target-id> \
  --region us-east-1
```

**Check for errors**:
- Status should be `READY`
- No `failureReasons` in response
- No errors in metadata

**Note**: The deployment script now automatically verifies target status and fails if errors are detected.

### Test Tool Discovery

Connect AgentCore Runtime to Gateway and verify tools are discovered.

### Test Client

A comprehensive test client is provided in `test-client/` for verifying gateway functionality:

**Features**:
- Connection testing with AWS SigV4 signing
- Tool listing via MCP JSON-RPC protocol
- Tool invocation with parameter support
- Automatic gateway URL detection from deployment outputs
- Quick test script for automated testing

**Usage**:
```bash
cd test-client

# Install dependencies
pip install -r requirements.txt

# Test connection
python test_gateway.py --gateway-url <gateway-url> --test connection

# List tools
python test_gateway.py --gateway-url <gateway-url> --test list-tools

# Call tool
python test_gateway.py --gateway-url <gateway-url> --test call-tool \
  --tool-name qsr-backend-api___GetMenu \
  --tool-args '{}'

# Quick test (auto-detects gateway URL)
./quick-test.sh
```

See `test-client/README.md` for detailed documentation.

## Exception-Level Debugging

The gateway is configured with `exceptionLevel='DEBUG'` to provide detailed exception information in CloudWatch Logs. This helps diagnose:

- Tool discovery and invocation errors
- API Gateway communication issues
- IAM authorization failures
- MCP protocol errors

**Viewing Debug Logs**:
```bash
# Get gateway ID from deployment outputs
GATEWAY_ID=$(cat scripts/deployment-outputs.json | jq -r '.gateway_id')

# View CloudWatch logs
aws logs tail /aws/bedrock-agentcore/gateway/$GATEWAY_ID --follow
```

**Log Information Includes**:
- Request/response payloads
- Exception stack traces
- IAM authorization details
- Tool invocation parameters
- Error messages and codes

## Migration to CDK (Future)

When AWS releases CDK/CloudFormation support:

### Migration Steps

1. **Create CDK Stack**
   - Use L2 constructs when available
   - Implement same functionality
   - Add CloudFormation outputs

2. **Delete Boto3 Resources**
   ```bash
   python scripts/delete-gateway.py --gateway-id <gateway-id>
   ```

3. **Deploy CDK Stack**
   ```bash
   cdk deploy QSR-AgentCoreGatewayStack
   ```

4. **Update Documentation**
   - Update README.md
   - Update DEPLOYMENT.md
   - Archive boto3 scripts

### Expected CDK Code

```typescript
// Future CDK implementation (when supported)
const gateway = new agentcore.Gateway(this, 'Gateway', {
  name: 'qsr-ordering-gateway',
  authorizerType: agentcore.AuthorizerType.IAM,
  protocolType: agentcore.ProtocolType.MCP,
  // ... other properties
});

const target = new agentcore.GatewayTarget(this, 'Target', {
  gateway: gateway,
  name: 'qsr-backend-api',
  targetType: agentcore.TargetType.API_GATEWAY,
  apiGateway: {
    restApiId: apiGatewayId,
    stage: stageName,
    // ... other properties
  }
});
```

## Troubleshooting

### Common Issues

1. **IAM Role Propagation Delay**
   - Solution: Script waits 10 seconds after role creation

2. **Lambda Function Not Active**
   - Solution: Script waits for function to become active

3. **OpenAPI Schema Fetch Fails**
   - Solution: Verify API Gateway ID and permissions

4. **Gateway Target Creation Fails**
   - Solution: Check tool filters and overrides are valid

5. **Target Status Shows Errors**
   - Common error: "Operation at path X method Y has unsupported auth type 'cognito_user_pools'"
   - Solution: Backend API Gateway must use AWS_IAM authorization, not Cognito User Pool
   - Fix: Update API Gateway to use AWS_IAM authorization for all methods

6. **Target Not Reaching READY Status**
   - Solution: Check target status for error messages
   - Common cause: OpenAPI schema validation errors
   - Fix: Ensure all endpoints have proper `responses` configuration

### Debug Mode

Add verbose logging to scripts:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Performance Considerations

### Deployment Time

Typical deployment time: 1-2 minutes

Breakdown:
- IAM role: 10-20 seconds (includes propagation delay if creating new)
- OpenAPI schema fetch: 5-10 seconds
- Gateway creation: 30-60 seconds
- Target creation: 10-20 seconds
- Target status verification: 5-60 seconds (waits for READY status)

## Limitations

### Current Limitations

1. **No CloudFormation**: Cannot use CloudFormation change sets or drift detection
2. **Manual Deployment**: User must run Python scripts manually
3. **No Automatic Rollback**: Must manually clean up on failure (though delete script is provided)
4. **Authorization Constraint**: Backend API Gateway must use AWS_IAM authorization (Cognito User Pool not supported by AgentCore Gateway)

### Workarounds

1. **Version Control**: Track config.yaml in git
2. **Output Files**: Save deployment-outputs.json for reference
3. **Documentation**: Maintain detailed deployment logs
4. **Testing**: Test in non-production environment first

## Future Improvements

When CDK support is available:

1. **Infrastructure as Code**: Full CloudFormation support
2. **Type Safety**: TypeScript type checking
3. **Automated Rollback**: CloudFormation automatic rollback
4. **Change Sets**: Preview changes before deployment
5. **Drift Detection**: Detect manual changes
6. **Stack Outputs**: Automatic output management
7. **Cross-Stack References**: Easy integration with other stacks

## References

- [AWS Blog: Connect API Gateway to AgentCore Gateway with MCP](https://aws.amazon.com/blogs/machine-learning/streamline-ai-agent-tool-interactions-connect-api-gateway-to-agentcore-gateway-with-mcp/)
- [AgentCore Gateway Documentation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-api-gateway.html)
- [Boto3 Documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/index.html)

## Important Notes

### AgentCore Gateway Authorization Constraints

**CRITICAL**: AgentCore Gateway only supports the following authorization types for API Gateway targets:
- `AWS_IAM` (AWS Signature Version 4) ✅
- `API_KEY` ✅
- No authorization ✅

**NOT SUPPORTED**:
- `cognito_user_pools` ❌
- Custom authorizers ❌
- Lambda authorizers ❌

This is why the Backend Infrastructure was updated to use AWS_IAM authorization instead of Cognito User Pool authorization.

### Frontend Application Integration

For frontend applications that need to call the Backend API:

1. **User Authentication**: Users authenticate with Cognito User Pool
2. **Credential Exchange**: Frontend exchanges Cognito token for temporary AWS credentials via Cognito Identity Pool
3. **Request Signing**: Frontend signs API requests with AWS SigV4 using temporary credentials
4. **Authorization**: Backend API Gateway validates IAM credentials

**Required Setup**:
- Cognito Identity Pool configured with Cognito User Pool as identity provider
- IAM role for authenticated users with permissions to invoke API Gateway
- Frontend SDK to sign requests (e.g., AWS Amplify, aws4fetch)

### Security Considerations

**AWS_IAM Authorization Benefits**:
- Fine-grained access control via IAM policies
- No token expiration management (AWS handles it)
- Works seamlessly with AWS services
- Supports both user and service-to-service authentication

**Trade-offs**:
- Frontend must implement AWS SigV4 signing
- Requires Cognito Identity Pool for user authentication
- More complex frontend setup compared to JWT tokens
