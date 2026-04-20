#!/bin/bash
set -e

# ============================================
# Guidance for Restaurant In-App Voice AI using Amazon Bedrock AgentCore
# User-Facing Deploy Script
# ============================================

# ============================================
# CONFIGURATION
# ============================================
AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_PREFIX="QSR"
USER_EMAIL=""
USER_NAME=""
COMPANY_NAME=""
SKIP_FRONTEND=false
SKIP_SYNTHETIC_DATA=false

# ============================================
# PLATFORM DETECTION
# ============================================
detect_platform() {
    case "$(uname -s)" in
        Darwin*)  PLATFORM="macos" ;;
        Linux*)   PLATFORM="linux" ;;
        MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
        *)        PLATFORM="unknown" ;;
    esac
    echo "Detected platform: $PLATFORM"
}

# ============================================
# PARSE ARGUMENTS
# ============================================
while [[ $# -gt 0 ]]; do
    case $1 in
        --user-email) USER_EMAIL="$2"; shift 2 ;;
        --user-name) USER_NAME="$2"; shift 2 ;;
        --company-name) COMPANY_NAME="$2"; shift 2 ;;
        --region) AWS_REGION="$2"; shift 2 ;;
        --skip-frontend) SKIP_FRONTEND=true; shift ;;
        --skip-synthetic-data) SKIP_SYNTHETIC_DATA=true; shift ;;
        --help)
            echo "Usage: ./scripts/deploy.sh --user-email <email> --user-name <name> [OPTIONS]"
            echo ""
            echo "Required:"
            echo "  --user-email EMAIL       Valid email address (Cognito sends temporary password here)"
            echo "  --user-name NAME         Full name for the test user profile"
            echo ""
            echo "Optional:"
            echo "  --company-name NAME      Restaurant brand name (e.g. \"Amazing Food\")"
            echo "  --region REGION          AWS Region (default: us-east-1)"
            echo "  --skip-frontend          Skip frontend deployment"
            echo "  --skip-synthetic-data    Skip synthetic data seeding"
            echo "  --help                   Show this help"
            exit 0
            ;;
        *) echo "Unknown option: $1. Use --help for usage."; exit 1 ;;
    esac
done

# ============================================
# PREREQUISITE CHECKS
# ============================================
check_prerequisites() {
    echo "============================================"
    echo "  Checking prerequisites..."
    echo "============================================"
    local FAILED=0

    # AWS CLI
    if command -v aws >/dev/null 2>&1; then
        echo "  ✅ AWS CLI: $(aws --version 2>&1 | awk '{print $1}')"
    else
        echo "  ❌ AWS CLI not found. Install: https://aws.amazon.com/cli/"
        FAILED=1
    fi

    # Node.js
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version | sed 's/v//')
        NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
        if [ "$NODE_MAJOR" -ge 20 ]; then
            echo "  ✅ Node.js: v$NODE_VERSION"
        else
            echo "  ❌ Node.js $NODE_VERSION found, but 20.x+ required"
            FAILED=1
        fi
    else
        echo "  ❌ Node.js not found. Install: https://nodejs.org"
        FAILED=1
    fi

    # Python
    if command -v python3 >/dev/null 2>&1; then
        PYTHON_VERSION=$(python3 --version | awk '{print $2}')
        PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
        if [ "$PYTHON_MINOR" -ge 12 ]; then
            echo "  ✅ Python: $PYTHON_VERSION"
        else
            echo "  ❌ Python $PYTHON_VERSION found, but 3.12+ required"
            FAILED=1
        fi
    else
        echo "  ❌ Python 3 not found. Install: https://python.org"
        FAILED=1
    fi

    # CDK CLI
    if command -v cdk >/dev/null 2>&1; then
        echo "  ✅ AWS CDK: $(cdk --version 2>&1 | awk '{print $1}')"
    else
        echo "  ❌ AWS CDK not found. Install: npm install -g aws-cdk"
        FAILED=1
    fi

    # AWS credentials
    if aws sts get-caller-identity >/dev/null 2>&1; then
        ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
        echo "  ✅ AWS credentials configured (Account: $ACCOUNT_ID)"
    else
        echo "  ❌ AWS credentials not configured. Run: aws configure"
        FAILED=1
    fi

    if [ $FAILED -ne 0 ]; then
        echo ""
        echo "❌ Prerequisites check failed. Install missing tools and try again."
        exit 1
    fi
    echo ""
}

# ============================================
# VALIDATE REQUIRED PARAMETERS
# ============================================
validate_params() {
    if [ -z "$USER_EMAIL" ] || [ -z "$USER_NAME" ]; then
        echo "❌ Required parameters missing."
        echo "Usage: ./scripts/deploy.sh --user-email <email> --user-name <name>"
        echo ""
        echo "  --user-email   A valid email address (Cognito sends temporary password here)"
        echo "  --user-name    Full name for the test user profile"
        exit 1
    fi
}

# ============================================
# CDK BOOTSTRAP CHECK
# ============================================
check_cdk_bootstrap() {
    echo "Checking CDK bootstrap..."
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    CDK_STACK=$(aws cloudformation describe-stacks --region "$AWS_REGION" \
        --query "Stacks[?StackName=='CDKToolkit'].StackName" --output text 2>/dev/null || echo "")
    if [ -z "$CDK_STACK" ] || [ "$CDK_STACK" = "None" ]; then
        echo "CDK not bootstrapped. Running: cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION"
        cdk bootstrap "aws://$ACCOUNT_ID/$AWS_REGION"
    else
        echo "  ✅ CDK already bootstrapped in $AWS_REGION"
    fi
    echo ""
}

# ============================================
# MAIN DEPLOYMENT
# ============================================
detect_platform
validate_params
check_prerequisites
check_cdk_bootstrap

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
OUTPUTS_DIR="cdk-outputs"
mkdir -p "$OUTPUTS_DIR"

echo "============================================"
echo "  Deploying Guidance — Account: $ACCOUNT_ID, Region: $AWS_REGION"
echo "============================================"
echo ""

# Step 1: Backend Infrastructure
echo "Step 1/4: Deploying Backend Infrastructure..."
echo "  (DynamoDB, Location Services, Lambda, API Gateway, Cognito)"
cd backend/backend-infrastructure
npm install --silent
cdk deploy --all \
    --require-approval never \
    --parameters QSR-CognitoStack:UserEmail="$USER_EMAIL" \
    --parameters QSR-CognitoStack:UserName="$USER_NAME" \
    --outputs-file "../../$OUTPUTS_DIR/backend-infrastructure.json"
cd ../..
echo "  ✅ Backend Infrastructure deployed"
echo ""

# Extract API Gateway ID for next step
API_GATEWAY_ID=$(node -e "const d=JSON.parse(require('fs').readFileSync('$OUTPUTS_DIR/backend-infrastructure.json','utf8')); console.log(d['QSR-ApiGatewayStack']['ApiGatewayId']||'')")
if [ -z "$API_GATEWAY_ID" ]; then
    echo "❌ Failed to extract API Gateway ID from backend outputs."
    exit 1
fi

# Step 2: AgentCore Gateway
echo "Step 2/4: Deploying AgentCore Gateway..."
echo "  (MCP server exposing backend APIs as agent tools)"
cd backend/agentcore-gateway/cdk
npm install --silent
cdk deploy \
    --require-approval never \
    --context apiGatewayId="$API_GATEWAY_ID" \
    --outputs-file "../../../$OUTPUTS_DIR/agentcore-gateway.json"
cd ../../..
echo "  ✅ AgentCore Gateway deployed"
echo ""

# Extract Gateway URL for next step
GATEWAY_URL=$(node -e "const d=JSON.parse(require('fs').readFileSync('$OUTPUTS_DIR/agentcore-gateway.json','utf8')); console.log(d['QSR-AgentCoreGatewayStack']['GatewayUrl']||'')")
if [ -z "$GATEWAY_URL" ]; then
    echo "❌ Failed to extract Gateway URL from gateway outputs."
    exit 1
fi

# Step 3: AgentCore Runtime
echo "Step 3/4: Deploying AgentCore Runtime..."
echo "  (Agent container with Nova 2 Sonic and WebSocket protocol)"
cd backend/agentcore-runtime/cdk
npm install --silent
cdk deploy --all \
    --require-approval never \
    --parameters AgentCoreRuntimeStack:AgentCoreGatewayUrl="$GATEWAY_URL" \
    ${COMPANY_NAME:+--parameters AgentCoreRuntimeStack:CompanyName="$COMPANY_NAME"} \
    --outputs-file "../../../$OUTPUTS_DIR/agentcore-runtime.json"
cd ../../..
echo "  ✅ AgentCore Runtime deployed"
echo ""

# Step 4: Optional — Synthetic Data
if [ "$SKIP_SYNTHETIC_DATA" = false ]; then
    echo "Step 4a: Seeding synthetic data..."
    cd backend/synthetic-data
    pip3 install -r requirements.txt --quiet
    python3 populate_data.py ${COMPANY_NAME:+--company-name "$COMPANY_NAME"}
    cd ../..
    echo "  ✅ Synthetic data populated"
    echo ""
fi

# Step 4b: Optional — Frontend
if [ "$SKIP_FRONTEND" = false ]; then
    if [ -d "frontend" ]; then
        echo "Step 4b: Deploying Frontend to AWS Amplify..."
        cd frontend/cdk
        npm install --silent
        cdk deploy --require-approval never \
            --outputs-file "../../$OUTPUTS_DIR/frontend.json"
        cd ..
        npm install --silent
        npm run deploy:amplify
        cd ..
        echo "  ✅ Frontend deployed"
        echo ""
    fi
fi

# ============================================
# VALIDATION
# ============================================
echo "============================================"
echo "  Validating deployment..."
echo "============================================"

# Check CloudFormation stacks
for STACK in QSR-DynamoDBStack QSR-LocationStack QSR-LambdaStack QSR-ApiGatewayStack QSR-CognitoStack QSR-AgentCoreGatewayStack AgentCoreInfraStack AgentCoreRuntimeStack; do
    STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$AWS_REGION" \
        --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "NOT_FOUND")
    if [[ "$STATUS" == *"COMPLETE"* ]]; then
        echo "  ✅ $STACK: $STATUS"
    else
        echo "  ⚠️  $STACK: $STATUS"
    fi
done
echo ""

# ============================================
# DEPLOYMENT COMPLETE
# ============================================
echo "============================================"
echo "  ✅ Deployment Complete!"
echo "============================================"
echo ""
echo "  Account:  $ACCOUNT_ID"
echo "  Region:   $AWS_REGION"
echo ""

# Show frontend URL if deployed
if [ -f "$OUTPUTS_DIR/frontend.json" ]; then
    AMPLIFY_URL=$(node -e "const d=JSON.parse(require('fs').readFileSync('$OUTPUTS_DIR/frontend.json','utf8')); console.log(d['QSR-FrontendStack']['AmplifyAppUrl']||'')" 2>/dev/null)
    if [ -n "$AMPLIFY_URL" ]; then
        echo "  🌐 Frontend URL: $AMPLIFY_URL"
    fi
fi

echo "  👤 Username: AppUser"
echo "  🔑 Password: Check your email ($USER_EMAIL) for the temporary password"
echo ""
echo "  Outputs saved to: $OUTPUTS_DIR/"
echo ""
echo "To clean up resources:"
echo "  ./cleanup-all.sh"
echo ""
