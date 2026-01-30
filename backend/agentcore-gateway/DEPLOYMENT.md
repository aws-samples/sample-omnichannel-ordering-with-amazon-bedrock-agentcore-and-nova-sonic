# AgentCore Gateway Deployment Guide (Boto3)

## Overview

This guide provides step-by-step instructions for deploying the AgentCore Gateway using Python boto3 scripts. The Gateway provides direct IAM-based communication with the Backend API Gateway, exposing Lambda functions as MCP tools.

## Prerequisites

### 1. Backend Infrastructure Deployed

Ensure the Backend Infrastructure (Project 1) is fully deployed:
- QSR-CognitoStack
- QSR-ApiGatewayStack (with AWS_IAM authorization)

### 2. Python Environment

- Python 3.9 or later installed
- pip package manager

### 3. AWS CLI Configured

```bash
aws configure
```

Ensure your AWS credentials are configured with appropriate permissions.

### 4. Required IAM Permissions

Your AWS credentials must have permissions to:
- Create and manage IAM roles and policies
- Create and manage AgentCore Gateways and Targets
- Read API Gateway configurations

See README.md for detailed IAM policy.

## Step-by-Step Deployment

### Step 1: Install Dependencies

Navigate to the project directory:

```bash
cd backend/agentcore-gateway
```

Install Python dependencies:

```bash
pip install -r scripts/requirements.txt
```

Or install globally:

```bash
pip3 install boto3 pyyaml
```

### Step 2: Get Backend Infrastructure Outputs

Get the required parameters from Backend Infrastructure stacks:

```bash
# Get API Gateway ID
aws cloudformation describe-stacks \
  --stack-name QSR-ApiGatewayStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayId`].OutputValue' \
  --output text

# Get API Gateway URL (optional, for reference)
aws cloudformation describe-stacks \
  --stack-name QSR-ApiGatewayStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text
```

**Example outputs**:
- API Gateway ID: `hj65he2og8`
- API Gateway URL: `https://hj65he2og8.execute-api.us-east-1.amazonaws.com/prod`

### Step 3: Configure Deployment

Copy the example configuration file:

```bash
cp scripts/config.yaml.example scripts/config.yaml
```

Edit `scripts/config.yaml` with your values:

```yaml
# AWS Configuration
aws:
  region: us-east-1  # Your AWS region
  profile: default   # Your AWS CLI profile

# Backend Infrastructure Resources
backend:
  api_gateway_id: hj65he2og8  # From Step 2
  api_gateway_stage: prod

# Gateway Configuration (can keep defaults)
gateway:
  name: qsr-ordering-gateway
  description: AgentCore Gateway for QSR ordering system - exposes Backend API as MCP tools

# IAM Configuration (can keep defaults)
iam:
  gateway_role_name: QSRAgentCoreGatewayRole

# Output Configuration (can keep defaults)
output:
  save_to_file: true
  output_file: deployment-outputs.json
```

### Step 4: Deploy the Gateway

Run the deployment script:

```bash
python scripts/deploy-gateway.py --config scripts/config.yaml
```

**Alternative with CLI overrides**:

```bash
python scripts/deploy-gateway.py \
  --config scripts/config.yaml \
  --api-gateway-id hj65he2og8 \
  --stage prod \
  --region us-east-1
```

**Expected output**:

```
============================================================
  AgentCore Gateway Deployment
============================================================

ℹ️  Region: us-east-1
ℹ️  API Gateway ID: hj65he2og8
ℹ️  Stage: prod
ℹ️  Gateway Name: qsr-ordering-gateway
ℹ️  AWS Account ID: 123456789012

============================================================
  Step 1: Creating/Updating IAM Role
============================================================

ℹ️  Creating/updating Gateway service role: QSRAgentCoreGatewayRole
✅ Gateway service role created: arn:aws:iam::123456789012:role/QSRAgentCoreGatewayRole

============================================================
  Step 2: Fetching OpenAPI Schema
============================================================

ℹ️  Fetching OpenAPI schema from API Gateway hj65he2og8...
✅ OpenAPI schema fetched successfully

============================================================
  Step 3: Generating Tool Filters and Overrides
============================================================

  - /customers/profile: GET
  - /customers/cart: POST
  - /menu: GET
  - /locations/nearest: GET
  - /locations/route: POST
  - /orders: POST
  - /orders/history: GET
✅ Generated 7 tool filters and 7 tool overrides

============================================================
  Step 4: Creating AgentCore Gateway
============================================================

ℹ️  Creating AgentCore Gateway: qsr-ordering-gateway
✅ AgentCore Gateway created: gw-abc123xyz
ℹ️  Gateway URL: https://gw-abc123xyz.gateway.bedrock-agentcore.us-east-1.amazonaws.com

============================================================
  Step 5: Creating Gateway Target
============================================================

ℹ️  Creating Gateway Target: qsr-backend-api
✅ Gateway Target created: tgt-xyz789abc

============================================================
  Step 6: Verifying Target Status
============================================================

ℹ️  Waiting for target tgt-xyz789abc to be ready...
✅ Target is READY!
✅ No errors found in target configuration

============================================================
  Deployment Complete!
============================================================

✅ Gateway URL: https://gw-abc123xyz.gateway.bedrock-agentcore.us-east-1.amazonaws.com
✅ Gateway ID: gw-abc123xyz
ℹ️  Target ID: tgt-xyz789abc
ℹ️  Tools exposed: 7

✅ Outputs saved to: scripts/deployment-outputs.json

============================================================
  Next Steps
============================================================

1. Provide the Gateway URL to the AgentCore Runtime team
2. Configure AgentCore Runtime to connect to this Gateway
3. The agent will automatically discover all tools as MCP tools

To delete all resources, run:
  python scripts/delete-gateway.py --gateway-id gw-abc123xyz
```

### Step 5: Verify Deployment

Check the deployment outputs file:

```bash
cat scripts/deployment-outputs.json
```

**Example output**:

```json
{
  "gateway_id": "gw-abc123xyz",
  "gateway_url": "https://gw-abc123xyz.gateway.bedrock-agentcore.us-east-1.amazonaws.com",
  "gateway_arn": "arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/gw-abc123xyz",
  "gateway_role_arn": "arn:aws:iam::123456789012:role/QSRAgentCoreGatewayRole",
  "target_id": "tgt-xyz789abc",
  "api_gateway_id": "hj65he2og8",
  "api_gateway_stage": "prod",
  "region": "us-east-1",
  "account_id": "123456789012",
  "deployment_timestamp": "2025-12-23T10:30:00Z",
  "tool_filters_count": 7,
  "tool_overrides_count": 7
}
```

Verify Gateway using AWS CLI:

```bash
# Get Gateway details
aws bedrock-agentcore get-gateway --gateway-identifier <gateway-id>

# List Gateway Targets
aws bedrock-agentcore list-gateway-targets --gateway-identifier <gateway-id>

# Get Target details
aws bedrock-agentcore get-gateway-target \
  --gateway-identifier <gateway-id> \
  --target-identifier <target-id>
```

### Step 6: Test Gateway Connectivity

Use the provided test client to verify the gateway is working:

```bash
cd test-client

# Install dependencies
pip install -r requirements.txt

# Run quick test (automatically reads gateway URL from deployment outputs)
./quick-test.sh

# Or test individually
python test_gateway.py --gateway-url <gateway-url> --test connection
python test_gateway.py --gateway-url <gateway-url> --test list-tools
python test_gateway.py --gateway-url <gateway-url> --test call-tool \
  --tool-name qsr-backend-api___GetMenu \
  --tool-args '{}'
```

See [test-client/README.md](test-client/README.md) for detailed testing documentation.

### Step 7: Save Outputs for AgentCore Runtime

Provide the following outputs to the AgentCore Runtime team (Project 3):

- **Gateway URL**: `https://gw-abc123xyz.agentcore.us-east-1.amazonaws.com`
- **Gateway ID**: `gw-abc123xyz`

These values are needed for the AgentCore Runtime to connect to the Gateway.

## Updating the Deployment

If you need to update the deployment (e.g., Backend API changed):

1. Delete existing resources:
   ```bash
   python scripts/delete-gateway.py --gateway-id <gateway-id>
   ```

2. Update configuration if needed:
   ```bash
   vi scripts/config.yaml
   ```

3. Deploy again:
   ```bash
   python scripts/deploy-gateway.py --config scripts/config.yaml
   ```

## Cleanup

To delete all resources:

```bash
python scripts/delete-gateway.py --gateway-id <gateway-id>
```

Or use the deployment outputs file:

```bash
python scripts/delete-gateway.py --output-file scripts/deployment-outputs.json
```

**With confirmation prompt**:

```
============================================================
  Resources to Delete
============================================================

Gateway ID: gw-abc123xyz
Gateway URL: https://gw-abc123xyz.gateway.bedrock-agentcore.us-east-1.amazonaws.com
Target ID: tgt-xyz789abc
Gateway Role: arn:aws:iam::123456789012:role/QSRAgentCoreGatewayRole

⚠️  WARNING: This action cannot be undone!

Are you sure you want to delete these resources? (yes/no):
```

**Skip confirmation**:

```bash
python scripts/delete-gateway.py --gateway-id <gateway-id> --force
```

**Keep IAM role** (only delete Gateway and Target):

```bash
python scripts/delete-gateway.py --gateway-id <gateway-id> --keep-roles
```

## Troubleshooting

### Deployment Fails: "Configuration file not found"

**Cause**: config.yaml doesn't exist

**Solution**: 
```bash
cp scripts/config.yaml.example scripts/config.yaml
# Edit config.yaml with your values
```

### Deployment Fails: "API Gateway ID is required"

**Cause**: API Gateway ID not configured or still set to placeholder

**Solution**: Update config.yaml with actual API Gateway ID from Backend Infrastructure

### Deployment Fails: "Failed to fetch OpenAPI schema"

**Cause**: Missing permissions or invalid API Gateway ID

**Solution**:
1. Verify API Gateway ID is correct
2. Ensure AWS credentials have `apigateway:GET` permission
3. Verify Backend Infrastructure is deployed
4. Check AWS region is correct

### Deployment Fails: "Failed to create/update IAM role"

**Cause**: IAM permissions issue or policy conflict

**Solution**:
1. Verify IAM permissions for role creation/update
2. Check if role exists with conflicting policies
3. Verify API Gateway ARN is correct

### Deployment Fails: "Failed to create AgentCore Gateway"

**Cause**: IAM permissions or service quota issue

**Solution**:
1. Verify IAM permissions for bedrock-agentcore service
2. Check service quotas for AgentCore Gateway
3. Verify region supports AgentCore Gateway

### Deployment Fails: "Failed to create Gateway Target"

**Cause**: API Gateway configuration issue or permissions

**Solution**:
1. Verify API Gateway ID and stage are correct
2. Check tool filters and overrides are valid
3. Verify Gateway was created successfully
4. Check error details in output

### Gateway Cannot Invoke API Gateway

**Cause**: IAM permissions or API Gateway configuration issue

**Solution**:
1. Verify Gateway service role has `execute-api:Invoke` permission
2. Check API Gateway ARN in role policy is correct
3. Verify API Gateway uses AWS_IAM authorization (not Cognito User Pool)

### Gateway Not Accessible

**Cause**: IAM permissions for AgentCore Runtime

**Solution**:
1. Verify AgentCore Runtime role has permission to invoke Gateway
2. Check Gateway authorization type is IAM
3. Verify Gateway URL is correct

### Tools Not Discovered

**Cause**: Target configuration issue or OpenAPI schema problem

**Solution**:
1. Verify Target was created successfully
2. Check tool filters and overrides in Target configuration
3. Verify OpenAPI schema has valid paths and methods
4. Check AgentCore Runtime logs for discovery errors

## Advanced Options

### Exception-Level Debugging

The gateway is deployed with exception-level debugging enabled by default (`exceptionLevel='DEBUG'`). This provides detailed exception information in CloudWatch Logs for troubleshooting.

To view debug logs:

```bash
# Get gateway ID from deployment outputs
GATEWAY_ID=$(cat scripts/deployment-outputs.json | jq -r '.gateway_id')

# View CloudWatch logs
aws logs tail /aws/bedrock-agentcore/gateway/$GATEWAY_ID --follow
```

To disable debug logging, modify `deploy-gateway.py` and remove the `exceptionLevel` parameter from the `create_gateway()` call.

### Use Different AWS Profile

```bash
python scripts/deploy-gateway.py --config scripts/config.yaml --profile my-profile
```

### Override Multiple Parameters

```bash
python scripts/deploy-gateway.py \
  --config scripts/config.yaml \
  --api-gateway-id hj65he2og8 \
  --stage prod \
  --region us-east-1 \
  --gateway-name my-custom-gateway \
  --output-file my-outputs.json
```

## Next Steps

After successful deployment:

1. **Provide Gateway URL to AgentCore Runtime team** (Project 3)
2. **Test Gateway connectivity** from AgentCore Runtime
3. **Verify tool discovery** works correctly
4. **Document any custom configurations** for your team

## Support

For issues or questions:
1. Check IMPLEMENTATION_NOTES.md for technical details
2. Review CloudWatch Logs for Lambda and Gateway
3. Contact the Backend Infrastructure team for API Gateway issues
4. Contact the AgentCore Runtime team for integration issues
