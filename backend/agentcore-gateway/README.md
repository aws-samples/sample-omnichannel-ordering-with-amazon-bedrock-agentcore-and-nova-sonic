# AgentCore Gateway

## Overview

This project deploys an AWS Bedrock AgentCore Gateway that exposes a Backend API Gateway as MCP (Model Context Protocol) tools. The Gateway uses IAM-based authorization for secure, direct communication with the Backend API.

## Architecture

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

## Key Features

- **IAM-Based Authorization**: Secure communication using AWS Signature Version 4
- **Direct Communication**: No Lambda interceptors needed - Gateway communicates directly with API Gateway
- **Exception-Level Debugging**: Detailed exception logging enabled for troubleshooting
- **Dynamic Tool Discovery**: Automatically discovers all API Gateway endpoints as MCP tools
- **Automatic Policy Updates**: Updates IAM role policies when API Gateway changes
- **Test Client**: Comprehensive test client for verifying connectivity, tool listing, and tool calling

## Prerequisites

1. **Backend Infrastructure Deployed**: QSR-ApiGatewayStack must be deployed
2. **Python 3.9+**: Required for deployment scripts
3. **AWS CLI Configured**: With appropriate permissions
4. **Required IAM Permissions**:
   - Create and manage IAM roles and policies
   - Create and manage AgentCore Gateways and Targets
   - Read API Gateway configurations

## Quick Start

### 1. Install Dependencies

```bash
cd backend/agentcore-gateway
pip install -r scripts/requirements.txt
```

### 2. Configure Deployment

```bash
cp scripts/config.yaml.example scripts/config.yaml
```

Edit `scripts/config.yaml` with your API Gateway ID:

```yaml
backend:
  api_gateway_id: hj65he2og8  # Your API Gateway ID
  api_gateway_stage: prod
```

### 3. Deploy Gateway

```bash
python scripts/deploy-gateway.py --config scripts/config.yaml
```

### 4. Get Gateway URL

The deployment will output the Gateway URL:

```
✅ Gateway URL: https://qsr-ordering-gateway-xxxxx.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp
```

Provide this URL to the AgentCore Runtime for MCP client configuration.

## Testing the Gateway

After deployment, you can test the gateway using the provided test client:

```bash
cd test-client

# Install dependencies
pip install -r requirements.txt

# Test connection
python test_gateway.py --gateway-url <gateway-url> --test connection

# List all available tools
python test_gateway.py --gateway-url <gateway-url> --test list-tools

# Call a specific tool
python test_gateway.py --gateway-url <gateway-url> --test call-tool \
  --tool-name qsr-backend-api___GetMenu \
  --tool-args '{"locationId": "loc-van-alstyne"}'

# Or use the quick test script (automatically reads gateway URL from deployment outputs)
./quick-test.sh
```

See [test-client/README.md](test-client/README.md) for detailed testing documentation.

## Exception-Level Debugging

The gateway is configured with exception-level debugging enabled (`exceptionLevel='DEBUG'`), which provides detailed exception information in CloudWatch Logs for troubleshooting. This helps diagnose issues with:

- Tool discovery and invocation
- API Gateway communication
- IAM authorization
- MCP protocol errors

To view debug logs:

```bash
# Get gateway ID from deployment outputs
GATEWAY_ID=$(cat scripts/deployment-outputs.json | jq -r '.gateway_id')

# View CloudWatch logs
aws logs tail /aws/bedrock-agentcore/gateway/$GATEWAY_ID --follow
```

## Configuration

All resource IDs are passed as parameters - nothing is hardcoded:

- **API Gateway ID**: From config.yaml or `--api-gateway-id` CLI arg
- **Region**: From config.yaml or `--region` CLI arg
- **Gateway Name**: From config.yaml or `--gateway-name` CLI arg

## CLI Options

```bash
python scripts/deploy-gateway.py \
  --config scripts/config.yaml \
  --api-gateway-id hj65he2og8 \
  --stage prod \
  --region us-east-1 \
  --gateway-name my-gateway \
  --output-file my-outputs.json
```

## Cleanup

To delete all resources:

```bash
python scripts/delete-gateway.py --gateway-id <gateway-id>
```

## Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)**: Detailed deployment guide
- **[IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md)**: Technical implementation details

## Why Boto3 Instead of CDK?

This is a temporary workaround because AWS CDK/CloudFormation does not currently support API Gateway as a target type for AgentCore Gateway. When CDK support is available, this will be migrated to AWS CDK TypeScript.

## Security

- All communication uses AWS IAM authorization (AWS SigV4)
- No credentials stored in configuration files
- IAM policies follow principle of least privilege
- Gateway role policy automatically updates with correct API Gateway ARN

## Support

For issues or questions:
1. Check [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) for technical details
2. Review CloudWatch Logs for Gateway operations
3. Contact the Backend Infrastructure team for API Gateway issues
4. Contact the AgentCore Runtime team for integration issues
