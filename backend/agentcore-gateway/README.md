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
- **Direct Communication**: Gateway communicates directly with API Gateway — no interceptors needed
- **CDK Deployment**: Fully automated via CDK with a Node.js Custom Resource Lambda
- **Dynamic Tool Discovery**: Automatically discovers all API Gateway endpoints as MCP tools
- **In-Place Updates**: Adding new API endpoints triggers a gateway target update on the next deploy

## Prerequisites

1. **Backend Infrastructure Deployed**: QSR-ApiGatewayStack must be deployed
2. **Node.js 20+**: Required for CDK
3. **AWS CLI Configured**: With appropriate permissions

## Quick Start

The gateway is deployed via CDK as part of the main deployment script:

```bash
# From the project root
./deploy-all.sh --user-email your-email@example.com --user-name "Your Name"
```

Or deploy the gateway CDK stack directly:

```bash
cd cdk
npm install
cdk deploy --context apiGatewayId=<your-api-gateway-id>
```

## Testing the Gateway

After deployment, test the gateway using the provided test client:

```bash
cd test-client

# Install dependencies
pip install -r requirements.txt

# List all available tools
python test_gateway.py --gateway-url <gateway-url> --list-tools

# Call a specific tool
python test_gateway.py --gateway-url <gateway-url> \
  --tool-name get_menu --tool-args '{}'
```

See [test-client/README.md](test-client/README.md) for detailed testing documentation.

## Cleanup

```bash
# Via CDK
cd cdk
cdk destroy --context apiGatewayId=<your-api-gateway-id>
```

Or use the main cleanup script from the project root:

```bash
./cleanup-all.sh
```

## Implementation

The gateway is deployed as a CDK stack (`cdk/`) with a Node.js Custom Resource Lambda that:
- Creates an IAM service role for the gateway
- Fetches the OpenAPI schema from API Gateway
- Parses endpoints into MCP tool filters and overrides
- Creates/updates the AgentCore Gateway and target
- Handles full lifecycle (Create/Update/Delete)

See [cdk/DEVELOPER_NOTES.md](cdk/DEVELOPER_NOTES.md) for implementation details and workarounds.

## Security

- All communication uses AWS IAM authorization (AWS SigV4)
- No credentials stored in configuration files
- IAM policies follow principle of least privilege
- Gateway role policy automatically updates with correct API Gateway ARN
