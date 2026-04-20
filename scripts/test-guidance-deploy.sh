#!/bin/bash
set -e

# ============================================
# Guidance for Restaurant In-App Voice AI using Amazon Bedrock AgentCore
# Internal Test Deploy Script (CodeBuild — Unattended)
# ============================================
# Target: CodeBuild Amazon Linux 2023 (aws/codebuild/amazonlinux-x86_64-standard:5.0)
# Privileged mode, us-east-1
# Fully unattended — no interactive prompts
# ============================================

# ============================================
# CONFIGURATION
# ============================================
export AWS_REGION="us-east-1"
EMAIL_ADDRESS="wwso-guidance-deployments-ignore@amazon.com"
USER_NAME="Test User"
OUTPUTS_DIR="cdk-outputs"
TIMESTAMP=$(date +%s)

# ============================================
# ENVIRONMENT SETUP
# ============================================
echo "============================================"
echo "  Environment Setup"
echo "============================================"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Account ID: $ACCOUNT_ID"
echo "Region: $AWS_REGION"
echo "Timestamp: $TIMESTAMP"
echo ""

# ============================================
# INSTALL DEPENDENCIES
# ============================================
echo "============================================"
echo "  Installing Dependencies"
echo "============================================"

echo "Installing AWS CDK CLI..."
npm install -g aws-cdk

echo "Installing Python packages..."
python3 -m pip install --upgrade boto3 botocore --quiet
python3 -m pip install email-validator pyyaml --quiet

echo "Verifying installations..."
echo "  Node.js: $(node --version)"
echo "  Python: $(python3 --version)"
echo "  CDK: $(cdk --version)"
echo "  AWS CLI: $(aws --version 2>&1 | awk '{print $1}')"
echo ""

# ============================================
# CDK BOOTSTRAP CHECK
# ============================================
echo "============================================"
echo "  CDK Bootstrap Check"
echo "============================================"
CDK_BOOTSTRAP_STACK=$(aws cloudformation describe-stacks --region "$AWS_REGION" \
    --query "Stacks[?StackName=='CDKToolkit'].StackName" --output text 2>/dev/null || echo "")
if [ -z "$CDK_BOOTSTRAP_STACK" ] || [ "$CDK_BOOTSTRAP_STACK" = "None" ]; then
    echo "Running CDK bootstrap..."
    cdk bootstrap "aws://$ACCOUNT_ID/$AWS_REGION"
else
    echo "CDK already bootstrapped"
fi
echo ""

mkdir -p "$OUTPUTS_DIR"

# ============================================
# STEP 1: Backend Infrastructure
# ============================================
echo "============================================"
echo "  Step 1: Deploying Backend Infrastructure"
echo "============================================"
cd backend/backend-infrastructure
npm install
cdk deploy --all \
    --require-approval never \
    --parameters QSR-CognitoStack:UserEmail="$EMAIL_ADDRESS" \
    --parameters QSR-CognitoStack:UserName="$USER_NAME" \
    --outputs-file "../../$OUTPUTS_DIR/backend-infrastructure.json"
cd ../..
echo "✅ Backend Infrastructure deployed"
echo ""

# Extract API Gateway ID
API_GATEWAY_ID=$(node -e "const d=JSON.parse(require('fs').readFileSync('$OUTPUTS_DIR/backend-infrastructure.json','utf8')); console.log(d['QSR-ApiGatewayStack']['ApiGatewayId']||'')")
echo "API Gateway ID: $API_GATEWAY_ID"

# ============================================
# STEP 2: AgentCore Gateway
# ============================================
echo "============================================"
echo "  Step 2: Deploying AgentCore Gateway"
echo "============================================"
cd backend/agentcore-gateway/cdk
npm install
cdk deploy \
    --require-approval never \
    --context apiGatewayId="$API_GATEWAY_ID" \
    --outputs-file "../../../$OUTPUTS_DIR/agentcore-gateway.json"
cd ../../..
echo "✅ AgentCore Gateway deployed"
echo ""

# Extract Gateway URL
GATEWAY_URL=$(node -e "const d=JSON.parse(require('fs').readFileSync('$OUTPUTS_DIR/agentcore-gateway.json','utf8')); console.log(d['QSR-AgentCoreGatewayStack']['GatewayUrl']||'')")
echo "Gateway URL: $GATEWAY_URL"

# ============================================
# STEP 3: AgentCore Runtime
# ============================================
echo "============================================"
echo "  Step 3: Deploying AgentCore Runtime"
echo "============================================"
cd backend/agentcore-runtime/cdk
npm install
cdk deploy --all \
    --require-approval never \
    --parameters AgentCoreRuntimeStack:AgentCoreGatewayUrl="$GATEWAY_URL" \
    --outputs-file "../../../$OUTPUTS_DIR/agentcore-runtime.json"
cd ../../..
echo "✅ AgentCore Runtime deployed"
echo ""

# ============================================
# STEP 4: Synthetic Data
# ============================================
echo "============================================"
echo "  Step 4: Seeding Synthetic Data"
echo "============================================"
cd backend/synthetic-data
pip3 install -r requirements.txt --quiet
python3 populate_data.py
cd ../..
echo "✅ Synthetic data populated"
echo ""

# ============================================
# VALIDATION
# ============================================
echo "============================================"
echo "  Validating Deployment"
echo "============================================"

VALIDATION_PASSED=true

for STACK in QSR-DynamoDBStack QSR-LocationStack QSR-LambdaStack QSR-ApiGatewayStack QSR-CognitoStack QSR-AgentCoreGatewayStack AgentCoreInfraStack AgentCoreRuntimeStack; do
    STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$AWS_REGION" \
        --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "NOT_FOUND")
    if [[ "$STATUS" == *"COMPLETE"* ]]; then
        echo "  ✅ $STACK: $STATUS"
    else
        echo "  ❌ $STACK: $STATUS"
        VALIDATION_PASSED=false
    fi
done

echo ""
if [ "$VALIDATION_PASSED" = true ]; then
    echo "✅ All stacks deployed successfully"
else
    echo "❌ Some stacks failed validation"
    exit 1
fi

echo ""
echo "============================================"
echo "  Deployment completed successfully!"
echo "============================================"
echo "  Account: $ACCOUNT_ID"
echo "  Region: $AWS_REGION"
echo "  Outputs: $OUTPUTS_DIR/"
echo ""
