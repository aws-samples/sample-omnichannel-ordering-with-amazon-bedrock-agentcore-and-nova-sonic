# Deployment Guide

## Overview

This document provides step-by-step deployment instructions for the AI-Powered QSR Voice Ordering System. The system consists of four independent projects that must be deployed in a specific order due to dependencies.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Architecture](#deployment-architecture)
- [Quick Start](#quick-start)
- [Detailed Deployment Steps](#detailed-deployment-steps)
- [Configuration](#configuration)
- [Validation](#validation)
- [Troubleshooting](#troubleshooting)
- [Cleanup](#cleanup)

## Prerequisites

### Required Tools

Ensure you have the following tools installed:

```bash
# Node.js 20.x or later
node --version  # Should be v20.x or higher

# Python 3.12 or later
python3 --version  # Should be 3.12 or higher

# AWS CLI configured with credentials
aws --version
aws sts get-caller-identity  # Verify credentials

# AWS CDK CLI
npm install -g aws-cdk
cdk --version  # Should be 2.x or higher

# Docker (optional, for local testing)
docker --version
```

### AWS Account Setup

1. **Bedrock Model Access**: Request access to Amazon Nova Sonic v2
   - Navigate to [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/)
   - Go to "Model access" in the left navigation
   - Request access to "Amazon Nova Sonic v2"
   - Wait for approval (usually instant)

2. **Service Quotas**: Verify sufficient quotas for:
   - Lambda concurrent executions (default: 1000)
   - DynamoDB tables (default: 2500)
   - API Gateway APIs (default: 600)
   - Cognito User Pools (default: 1000)

3. **IAM Permissions**: Ensure your AWS credentials have permissions to:
   - Create and manage CloudFormation stacks
   - Create IAM roles and policies
   - Deploy Lambda functions
   - Create DynamoDB tables
   - Configure Cognito User Pools and Identity Pools
   - Create API Gateway endpoints
   - Deploy Bedrock AgentCore Runtimes and Gateways
   - Create Location Services resources

### Environment Setup

```bash
# Clone the repository
git clone https://github.com/aws-samples/qsr-voice-ordering-agentcore.git
cd qsr-voice-ordering-agentcore

# Set AWS region (optional, defaults to us-east-1)
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
```

## Deployment Architecture

### Component Dependencies

The deployment follows a strict order due to dependencies:

```
1. Backend Infrastructure
   ├── Cognito User Pool + Identity Pool
   ├── DynamoDB Tables (5 tables)
   ├── Lambda Functions (8 functions)
   ├── API Gateway (REST API)
   └── Location Services (Place Index, Route Calculator)
        │
        │ Outputs: API Gateway URL, Cognito IDs
        ▼
2. AgentCore Gateway
   └── MCP Server (exposes backend APIs as tools)
        │
        │ Outputs: Gateway ARN
        ▼
3. AgentCore Runtime
   ├── ECR Repository
   ├── Docker Image Build
   └── Agent Deployment (with Nova Sonic v2)
        │
        │ Outputs: WebSocket URL
        ▼
4. Synthetic Data (Optional)
   └── Sample data population
```

### Deployment Time Estimates

| Component | Deployment Time | Notes |
|-----------|----------------|-------|
| Backend Infrastructure | 5-7 minutes | CloudFormation stack creation |
| AgentCore Gateway | 2-3 minutes | Python boto3 deployment |
| AgentCore Runtime | 8-12 minutes | Docker build + ECR push + deployment |
| Synthetic Data | 1-2 minutes | DynamoDB data population |
| **Total** | **16-24 minutes** | First-time deployment |

## Quick Start

### One-Command Deployment

The fastest way to deploy the entire system:

```bash
# Deploy all components in correct order (replace with your email and name)
./deploy-all.sh --user-email your-email@example.com --user-name "Your Name"
```

**Required Parameters**:
- `--user-email`: Your email address (receives temporary Cognito password for test user)
- `--user-name`: Your full name (used for the test user profile)

**Optional Parameters**:
- `--skip-backend-infra`: Skip Backend Infrastructure deployment
- `--skip-gateway`: Skip AgentCore Gateway deployment
- `--skip-runtime`: Skip AgentCore Runtime deployment
- `--skip-synthetic-data`: Skip Synthetic Data seeding
- `--help`: Show all available options

The script will:
1. Deploy Backend Infrastructure (DynamoDB, Lambda, API Gateway, Cognito)
2. Create test user "AppUser" with temporary password sent to your email
3. Save outputs to `cdk-outputs/backend-infrastructure.json`
4. Deploy AgentCore Gateway using backend outputs
5. Save Gateway URL to `cdk-outputs/agentcore-gateway.json`
6. Deploy AgentCore Runtime using Gateway URL
7. Save Runtime WebSocket URL to `cdk-outputs/agentcore-runtime.json`
8. Optionally seed synthetic data
9. Display summary of all deployment outputs with ready-to-use test commands

**Success Criteria**: All stacks deploy successfully and outputs are saved to `cdk-outputs/` directory.

### Post-Deployment Steps

1. **Check Email**: AWS Cognito sends a temporary password to your email
   - Check spam folder if not received
   - Save the temporary password for first login
   - The deployment script may prompt you to change the password immediately

2. **Review Test Commands**: The deployment script displays ready-to-use test commands at the end
   - Commands include all required parameters pre-filled
   - Copy and paste directly into your terminal

3. **Populate Sample Data** (Optional):
   ```bash
   cd backend/synthetic-data
   python populate_data.py
   ```

4. **Test the System**:
   ```bash
   cd backend/agentcore-runtime/test-client
   python client-cognito-sigv4.py --username AppUser --password <your-password>
   ```

## Detailed Deployment Steps

### Step 1: Deploy Backend Infrastructure

**Objective**: Deploy DynamoDB tables, Lambda functions, API Gateway, Cognito, and Location Services.

#### 1.1 Navigate to Backend Infrastructure

```bash
cd backend/backend-infrastructure
```

#### 1.2 Install Dependencies

```bash
npm install
```

#### 1.3 Bootstrap CDK (First Time Only)

```bash
# Only needed once per AWS account/region
cdk bootstrap
```

#### 1.4 Review Stack Changes

```bash
# Preview what will be deployed
cdk diff
```

#### 1.5 Deploy All Stacks

**Important**: You must provide user email and name for Cognito test user creation.

```bash
# Deploy all stacks in correct order (replace with your email and name)
cdk deploy --all \
  --require-approval never \
  --parameters QSR-CognitoStack:UserEmail="your-email@example.com" \
  --parameters QSR-CognitoStack:UserName="Your Name"
```

**Expected Output**:
```
✅  QSRBackendInfrastructure-CognitoStack
✅  QSRBackendInfrastructure-DynamoDBStack
✅  QSRBackendInfrastructure-LocationStack
✅  QSRBackendInfrastructure-LambdaStack
✅  QSRBackendInfrastructure-ApiGatewayStack

Outputs:
QSRBackendInfrastructure-ApiGatewayStack.ApiGatewayUrl = https://xxxxx.execute-api.us-east-1.amazonaws.com/prod
QSRBackendInfrastructure-CognitoStack.UserPoolId = us-east-1_XXXXXXXXX
QSRBackendInfrastructure-CognitoStack.UserPoolClientId = xxxxxxxxxxxxxxxxxxxx
QSRBackendInfrastructure-CognitoStack.IdentityPoolId = us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

#### 1.6 Save Outputs

```bash
# Save outputs to JSON file for next steps (replace with your email and name)
cdk deploy --all \
  --require-approval never \
  --parameters QSR-CognitoStack:UserEmail="your-email@example.com" \
  --parameters QSR-CognitoStack:UserName="Your Name" \
  --outputs-file ../../cdk-outputs/backend-infrastructure.json
```

#### 1.7 Verify Deployment

```bash
# Test API endpoints
./test-api.sh -u AppUser -p <temporary-password-from-email>
```

**Expected Output**: All 8 endpoints return successful responses.

**Troubleshooting**:
- If deployment fails, check CloudFormation console for error details
- Verify IAM permissions are sufficient
- Ensure Bedrock model access is enabled
- Check AWS service quotas

---

### Step 2: Deploy AgentCore Gateway

**Objective**: Deploy MCP server that exposes backend APIs as tools for the agent.

#### 2.1 Navigate to AgentCore Gateway

```bash
cd backend/agentcore-gateway
```

#### 2.2 Install Python Dependencies

```bash
pip install -r scripts/requirements.txt
```

#### 2.3 Configure Gateway

Create `scripts/config.yaml` from the template:

```bash
cp scripts/config.yaml.example scripts/config.yaml
```

Edit `scripts/config.yaml` with your backend outputs:

```yaml
gateway_name: "qsr-ordering-gateway"
description: "MCP Gateway for QSR Ordering System"
region: "us-east-1"

# API Gateway configuration (from Step 1 outputs)
api_gateway:
  api_id: "xxxxx"  # Extract from ApiGatewayUrl
  stage: "prod"
  region: "us-east-1"

# OAuth configuration (from Step 1 outputs)
oauth:
  cognito_user_pool_id: "us-east-1_XXXXXXXXX"
  cognito_client_id: "xxxxxxxxxxxxxxxxxxxx"
  cognito_region: "us-east-1"
```

**Tip**: Extract API Gateway ID from URL:
```
https://[api_id].execute-api.[region].amazonaws.com/[stage]
       ^^^^^^^^
```

#### 2.4 Deploy Gateway

```bash
python scripts/deploy-gateway.py
```

**Expected Output**:
```
Creating AgentCore Gateway: qsr-ordering-gateway
Gateway created successfully!
Gateway ARN: arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/qsr-ordering-gateway
Gateway Status: ACTIVE

Deployment outputs saved to: scripts/deployment-outputs.json
```

#### 2.5 Verify Gateway

```bash
cd test-client
python test_gateway.py --test list-tools
```

**Expected Output**: List of 8 MCP tools:
- GetCustomerProfile
- GetPreviousOrders
- GetMenu
- AddToCart
- PlaceOrder
- GetNearestLocations
- FindLocationAlongRoute
- GeocodeAddress

**Troubleshooting**:
- If gateway creation fails, check IAM permissions
- Verify API Gateway ID and stage are correct
- Ensure Cognito User Pool ID is correct
- Check CloudWatch Logs for detailed errors

---

### Step 3: Deploy AgentCore Runtime

**Objective**: Deploy Python agent with Nova Sonic v2 for voice conversations.

#### 3.1 Navigate to AgentCore Runtime

```bash
cd backend/agentcore-runtime/cdk
```

#### 3.2 Install Dependencies

```bash
npm install
```

#### 3.3 Configure Runtime

The runtime automatically reads Gateway ARN from `backend/agentcore-gateway/scripts/deployment-outputs.json`.

Verify the file exists:
```bash
cat ../../agentcore-gateway/scripts/deployment-outputs.json
```

#### 3.4 Deploy Infrastructure Stack

```bash
# Deploy ECR repository and build infrastructure
cdk deploy InfraStack --require-approval never
```

**Expected Output**:
```
✅  InfraStack

Outputs:
InfraStack.EcrRepositoryUri = 123456789012.dkr.ecr.us-east-1.amazonaws.com/qsr-agent
InfraStack.CodeBuildProjectName = qsr-agent-build
```

#### 3.5 Build and Push Docker Image

```bash
# Trigger CodeBuild to build and push Docker image
aws codebuild start-build --project-name qsr-agent-build
```

**Wait for build to complete** (5-8 minutes):
```bash
# Check build status
aws codebuild batch-get-builds --ids <build-id>
```

#### 3.6 Deploy Runtime Stack

```bash
# Deploy AgentCore Runtime with agent code
cdk deploy RuntimeStack --require-approval never
```

**Expected Output**:
```
✅  RuntimeStack

Outputs:
RuntimeStack.RuntimeName = qsr-ordering-runtime
RuntimeStack.RuntimeArn = arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/qsr-ordering-runtime
RuntimeStack.WebSocketUrl = wss://xxxxx.bedrock-agentcore.us-east-1.amazonaws.com
```

#### 3.7 Save Outputs

```bash
# Save outputs for frontend configuration
cdk deploy RuntimeStack --outputs-file ../../../cdk-outputs/agentcore-runtime-outputs.json
```

#### 3.8 Verify Runtime

```bash
cd ../test-client
python client-cognito-sigv4.py --username AppUser --password <your-password>
```

**Expected Output**: Web UI opens at http://localhost:8000 with working voice and text chat.

**Troubleshooting**:
- If Docker build fails, check CodeBuild logs in CloudWatch
- If runtime deployment fails, verify Gateway ARN is correct
- If WebSocket connection fails, check runtime logs in CloudWatch
- Ensure Nova Sonic v2 model access is enabled

---

### Step 4: Populate Synthetic Data (Optional)

**Objective**: Generate realistic test data for development and testing.

#### 4.1 Navigate to Synthetic Data

```bash
cd backend/synthetic-data
```

#### 4.2 Install Dependencies

```bash
pip install -r requirements.txt
```

#### 4.3 Configure Data Generation

Edit `populate_data.py` to customize:
- Number of locations (default: 5)
- Number of customers (default: 10)
- Number of menu items per location (default: 20)
- Number of orders per customer (default: 3)

#### 4.4 Populate Data

```bash
python populate_data.py
```

**Expected Output**:
```
Populating QSR ordering system with synthetic data...

Creating locations...
✓ Created 5 locations

Creating menu items...
✓ Created 100 menu items (20 per location)

Creating customers...
✓ Created 10 customers

Creating orders...
✓ Created 30 orders

Data population complete!
```

#### 4.5 Verify Data

```bash
# List locations
aws dynamodb scan --table-name QSR-Locations --max-items 5

# List customers
aws dynamodb scan --table-name QSR-Customers --max-items 5
```

#### 4.6 Cleanup Data (Optional)

```bash
# Remove all synthetic data
python cleanup_data.py
```

**Troubleshooting**:
- If data population fails, check DynamoDB table names
- Verify IAM permissions for DynamoDB access
- Check AWS credentials are configured

---

## Configuration

### Environment Variables

The system uses the following environment variables:

#### Backend Infrastructure

```bash
# AWS Region
export AWS_REGION=us-east-1

# CDK Stack Names (optional, uses defaults)
export COGNITO_STACK_NAME=QSRBackendInfrastructure-CognitoStack
export DYNAMODB_STACK_NAME=QSRBackendInfrastructure-DynamoDBStack
export LAMBDA_STACK_NAME=QSRBackendInfrastructure-LambdaStack
export API_GATEWAY_STACK_NAME=QSRBackendInfrastructure-ApiGatewayStack
```

#### AgentCore Gateway

```bash
# Gateway Configuration
export GATEWAY_NAME=qsr-ordering-gateway
export GATEWAY_REGION=us-east-1
```

#### AgentCore Runtime

```bash
# Runtime Configuration
export RUNTIME_NAME=qsr-ordering-runtime
export RUNTIME_REGION=us-east-1
export AGENT_MODEL_ID=amazon.nova-sonic-v1:0
```

### Configuration Files

#### Backend Infrastructure: `cdk.json`

```json
{
  "app": "npx ts-node bin/backend-infrastructure.ts",
  "context": {
    "stackPrefix": "QSRBackendInfrastructure",
    "tableName": {
      "customers": "QSR-Customers",
      "orders": "QSR-Orders",
      "menu": "QSR-Menu",
      "carts": "QSR-Carts",
      "locations": "QSR-Locations"
    }
  }
}
```

#### AgentCore Gateway: `config.yaml`

```yaml
gateway_name: "qsr-ordering-gateway"
description: "MCP Gateway for QSR Ordering System"
region: "us-east-1"

api_gateway:
  api_id: "xxxxx"
  stage: "prod"
  region: "us-east-1"

oauth:
  cognito_user_pool_id: "us-east-1_XXXXXXXXX"
  cognito_client_id: "xxxxxxxxxxxxxxxxxxxx"
  cognito_region: "us-east-1"
```

#### AgentCore Runtime: `cdk.json`

```json
{
  "app": "npx ts-node bin/agentcore-runtime.ts",
  "context": {
    "runtimeName": "qsr-ordering-runtime",
    "agentModelId": "amazon.nova-sonic-v1:0",
    "gatewayArn": "arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/qsr-ordering-gateway"
  }
}
```

## Validation

### Validation Checklist

After deployment, verify each component:

#### ✅ Backend Infrastructure

```bash
cd backend/backend-infrastructure

# Test all API endpoints
./test-api.sh -u AppUser -p <your-password>
```

**Expected**: All 8 endpoints return successful responses.

#### ✅ AgentCore Gateway

```bash
cd backend/agentcore-gateway/test-client

# List available tools
python test_gateway.py --test list-tools

# Test specific tool
python test_gateway.py --test get-menu --location-id loc-001
```

**Expected**: 8 tools listed, tool invocations return data.

#### ✅ AgentCore Runtime

```bash
cd backend/agentcore-runtime/test-client

# Start test client
python client-cognito-sigv4.py --username AppUser --password <your-password>
```

**Expected**: Web UI opens, voice and text chat work.

#### ✅ End-to-End Flow

1. Open test client at http://localhost:8000
2. Click microphone button
3. Say: "Hello, I would like to place an order"
4. Verify agent responds with voice
5. Say: "I want a chicken sandwich"
6. Verify agent calls GetMenu tool
7. Verify agent responds with menu options
8. Complete order and verify PlaceOrder tool is called

**Expected**: Complete voice ordering flow works end-to-end.

### Validation Scripts

#### Backend API Validation

```bash
#!/bin/bash
# test-all-endpoints.sh

ENDPOINTS=(
  "/customer-profile"
  "/previous-orders"
  "/menu"
  "/cart"
  "/order"
  "/locations/nearby"
  "/locations/route"
  "/geocode"
)

for endpoint in "${ENDPOINTS[@]}"; do
  echo "Testing $endpoint..."
  curl -X GET "$API_URL$endpoint" \
    --aws-sigv4 "aws:amz:$AWS_REGION:execute-api" \
    --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"
  echo ""
done
```

#### Gateway Tool Validation

```python
# test_all_tools.py
import boto3

tools = [
    "GetCustomerProfile",
    "GetPreviousOrders",
    "GetMenu",
    "AddToCart",
    "PlaceOrder",
    "GetNearestLocations",
    "FindLocationAlongRoute",
    "GeocodeAddress"
]

for tool in tools:
    print(f"Testing {tool}...")
    # Invoke tool via Gateway
    # Verify response
```

## Troubleshooting

### Common Issues

#### Issue: CDK Bootstrap Failed

**Symptoms**: `cdk bootstrap` command fails

**Solutions**:
1. Verify AWS credentials: `aws sts get-caller-identity`
2. Check IAM permissions for CloudFormation
3. Ensure region is set: `export AWS_REGION=us-east-1`
4. Try with explicit region: `cdk bootstrap aws://ACCOUNT-ID/REGION`

#### Issue: Lambda Deployment Failed

**Symptoms**: Lambda function creation fails during CDK deploy

**Solutions**:
1. Check Lambda concurrent execution quota
2. Verify IAM role permissions
3. Check Lambda function code for syntax errors
4. Review CloudFormation stack events for details

#### Issue: Cognito Temporary Password Not Received

**Symptoms**: Email with temporary password not received

**Solutions**:
1. Check spam/junk folder
2. Verify email address in Cognito User Pool
3. Check Cognito email configuration
4. Manually reset password via AWS Console

#### Issue: AgentCore Gateway Deployment Failed

**Symptoms**: `deploy-gateway.py` script fails

**Solutions**:
1. Verify API Gateway ID is correct
2. Check Cognito User Pool ID is correct
3. Ensure IAM permissions for Bedrock AgentCore
4. Review error message in script output
5. Check CloudWatch Logs for detailed errors

#### Issue: Docker Build Failed

**Symptoms**: CodeBuild fails to build Docker image

**Solutions**:
1. Check CodeBuild logs in CloudWatch
2. Verify Dockerfile syntax
3. Ensure Python dependencies are correct
4. Check ECR repository permissions
5. Verify Docker base image is accessible

#### Issue: WebSocket Connection Failed

**Symptoms**: Test client cannot connect to AgentCore Runtime

**Solutions**:
1. Verify WebSocket URL is correct
2. Check AWS credentials are valid
3. Ensure SigV4 signing is correct
4. Verify Cognito Identity Pool configuration
5. Check runtime logs in CloudWatch

#### Issue: Agent Not Responding

**Symptoms**: Agent doesn't respond to voice or text input

**Solutions**:
1. Verify Nova Sonic v2 model access is enabled
2. Check runtime logs in CloudWatch
3. Verify Gateway ARN is correct in runtime configuration
4. Test Gateway connectivity separately
5. Check IAM role permissions for runtime

#### Issue: Tool Invocation Failed

**Symptoms**: Agent cannot invoke backend tools

**Solutions**:
1. Verify Gateway is deployed and active
2. Check API Gateway endpoints are accessible
3. Verify Lambda functions are deployed
4. Check IAM permissions for Gateway role
5. Review Gateway logs in CloudWatch

### Debug Commands

```bash
# Check CloudFormation stack status
aws cloudformation describe-stacks --stack-name <stack-name>

# View CloudFormation stack events
aws cloudformation describe-stack-events --stack-name <stack-name>

# Check Lambda function logs
aws logs tail /aws/lambda/<function-name> --follow

# Check AgentCore Runtime logs
aws logs tail /aws/bedrock-agentcore/runtimes/<runtime-name> --follow

# Check API Gateway logs
aws logs tail /aws/apigateway/<api-id> --follow

# Test API Gateway endpoint
curl -X GET <api-url> --aws-sigv4 "aws:amz:us-east-1:execute-api"

# Check DynamoDB table
aws dynamodb describe-table --table-name QSR-Customers

# Check Cognito User Pool
aws cognito-idp describe-user-pool --user-pool-id <pool-id>
```

### Getting Help

If you encounter issues not covered here:

1. **Check CloudWatch Logs**: Most errors are logged in CloudWatch
2. **Review CloudFormation Events**: Stack deployment errors are detailed here
3. **AWS Support**: Open a support case for AWS-specific issues
4. **GitHub Issues**: Report bugs or request features
5. **AWS Documentation**: Refer to service-specific documentation

## Cleanup

### One-Command Cleanup

```bash
# Remove all deployed resources
./cleanup-all.sh
```

The script will destroy resources in reverse order:
1. AgentCore Runtime
2. AgentCore Gateway
3. Backend Infrastructure

### Manual Cleanup

If you prefer to remove components individually:

#### 1. Delete AgentCore Runtime

```bash
cd backend/agentcore-runtime/cdk
cdk destroy RuntimeStack --force
cdk destroy InfraStack --force
```

#### 2. Delete AgentCore Gateway

```bash
cd backend/agentcore-gateway
python scripts/delete-gateway.py
```

#### 3. Delete Backend Infrastructure

```bash
cd backend/backend-infrastructure
cdk destroy --all --force
```

### Verify Cleanup

Check the AWS Console to ensure all resources are removed:

- **CloudFormation**: All stacks deleted
- **Lambda**: All functions removed
- **DynamoDB**: All tables deleted
- **Cognito**: User Pool and Identity Pool removed
- **API Gateway**: REST API deleted
- **AgentCore**: Runtime and Gateway deleted
- **ECR**: Repository deleted (if desired)
- **CloudWatch**: Log groups deleted (optional)

### Cleanup Troubleshooting

#### Issue: Stack Deletion Failed

**Symptoms**: CloudFormation stack deletion fails

**Solutions**:
1. Check stack events for specific resource errors
2. Manually delete problematic resources
3. Retry stack deletion
4. Use `--force` flag with CDK destroy

#### Issue: DynamoDB Table Not Deleted

**Symptoms**: DynamoDB table remains after stack deletion

**Solutions**:
1. Check if table has deletion protection enabled
2. Manually delete table via AWS Console
3. Verify IAM permissions for deletion

#### Issue: Lambda Function Not Deleted

**Symptoms**: Lambda function remains after stack deletion

**Solutions**:
1. Check if function has event source mappings
2. Remove event source mappings manually
3. Delete function via AWS Console

### Cost Considerations

After cleanup, verify no resources are incurring charges:

- **CloudWatch Logs**: Log groups may remain (small cost)
- **S3 Buckets**: CDK bootstrap bucket remains (minimal cost)
- **ECR Images**: Docker images may remain (storage cost)

To completely remove all traces:

```bash
# Delete CloudWatch log groups
aws logs describe-log-groups --query 'logGroups[*].logGroupName' | \
  grep -E 'qsr|QSR' | \
  xargs -I {} aws logs delete-log-group --log-group-name {}

# Delete ECR repository
aws ecr delete-repository --repository-name qsr-agent --force

# Delete CDK bootstrap bucket (optional, affects other CDK projects)
# aws s3 rb s3://cdk-<qualifier>-assets-<account>-<region> --force
```

## Next Steps

After successful deployment:

1. **Populate Sample Data**: Run synthetic data generation
2. **Test Voice Ordering**: Use test client to place orders
3. **Customize Agent**: Modify agent prompts and behavior
4. **Add New Tools**: Extend backend APIs and expose via Gateway
5. **Build Frontend**: Develop production React application
6. **Configure Monitoring**: Set up CloudWatch alarms and dashboards
7. **Enable Security**: Enable MFA, WAF, GuardDuty
8. **Production Readiness**: Review security, scalability, and cost optimization

For detailed architecture and security information, see:
- [Architecture Documentation](ARCHITECTURE.md)
- [Security Documentation](SECURITY.md)
