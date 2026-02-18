# AgentCore Gateway CDK Stack

Deploys an AgentCore Gateway as a CloudFormation stack using a Node.js Custom Resource Lambda.

## What It Does

- Creates an IAM service role for the gateway
- Fetches the OpenAPI schema from the backend API Gateway
- Parses endpoints into MCP tool filters and overrides
- Creates the AgentCore Gateway and target
- Outputs Gateway URL, ID, ARN, and other deployment details

## Prerequisites

- Backend Infrastructure deployed (`QSR-ApiGatewayStack`)
- Node.js 20+ and npm
- AWS CDK CLI
- `esbuild` (installed automatically via `npm install`)

## Deploy

```bash
npm install
cdk deploy --context apiGatewayId=<your-api-gateway-id>
```

## Destroy

```bash
cdk destroy --context apiGatewayId=<your-api-gateway-id>
```

## Key Design Decisions

- Uses `NodejsFunction` with esbuild bundling (no Docker required)
- Bundles all `@aws-sdk` packages instead of using Lambda runtime versions, since `@aws-sdk/client-bedrock-agentcore-control` may not be available in the runtime yet
- Custom Resource returns data via `cr.Provider` framework (not manual CF response)
