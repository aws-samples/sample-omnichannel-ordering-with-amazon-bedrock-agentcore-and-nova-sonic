#!/bin/bash

################################################################################
# Deployment Status Dashboard
################################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

STATE_FILE=".deployment-state.json"
OUTPUTS_DIR="cdk-outputs"

print_section() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo ""
}

check_stack() {
  local stack_name=$1
  aws cloudformation describe-stacks \
    --stack-name "$stack_name" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND"
}

print_component_status() {
  local name=$1
  local status=$2
  
  if [ "$status" = "CREATE_COMPLETE" ] || [ "$status" = "UPDATE_COMPLETE" ]; then
    echo -e "  ${GREEN}✅${NC} $name: ${GREEN}$status${NC}"
  elif [ "$status" = "NOT_FOUND" ]; then
    echo -e "  ${RED}❌${NC} $name: ${RED}Not Deployed${NC}"
  else
    echo -e "  ${YELLOW}⚠️${NC}  $name: ${YELLOW}$status${NC}"
  fi
}

print_section "QSR Ordering System - Deployment Status"

# Check if deployed
if [ ! -f "$STATE_FILE" ]; then
  echo -e "${YELLOW}No deployment found${NC}"
  echo ""
  echo "Run: ./deploy-all.sh --user-email your@email.com --user-name \"Your Name\""
  exit 0
fi

# Backend Infrastructure
echo -e "${BLUE}Backend Infrastructure:${NC}"
print_component_status "DynamoDB Stack" "$(check_stack QSR-DynamoDBStack)"
print_component_status "Location Stack" "$(check_stack QSR-LocationStack)"
print_component_status "Lambda Stack" "$(check_stack QSR-LambdaStack)"
print_component_status "API Gateway Stack" "$(check_stack QSR-ApiGatewayStack)"
print_component_status "Cognito Stack" "$(check_stack QSR-CognitoStack)"

echo ""
echo -e "${BLUE}AgentCore Components:${NC}"
print_component_status "Gateway" "$(check_stack AgentCoreGatewayStack 2>/dev/null || echo 'DEPLOYED')"
print_component_status "Runtime Infra Stack" "$(check_stack AgentCoreInfraStack)"
print_component_status "Runtime Stack" "$(check_stack AgentCoreRuntimeStack)"

# Outputs
if [ -f "$OUTPUTS_DIR/backend-infrastructure.json" ]; then
  echo ""
  echo -e "${BLUE}Key Resources:${NC}"
  
  API_URL=$(node -e "const d=JSON.parse(require('fs').readFileSync('$OUTPUTS_DIR/backend-infrastructure.json','utf8')); console.log((d['QSR-ApiGatewayStack']||{})['ApiGatewayUrl']||'N/A')" 2>/dev/null || echo "N/A")
  
  USER_POOL_ID=$(node -e "const d=JSON.parse(require('fs').readFileSync('$OUTPUTS_DIR/backend-infrastructure.json','utf8')); console.log((d['QSR-CognitoStack']||{})['UserPoolId']||'N/A')" 2>/dev/null || echo "N/A")
  
  echo "  API Gateway URL: $API_URL"
  echo "  User Pool ID: $USER_POOL_ID"
fi

if [ -f "$OUTPUTS_DIR/agentcore-runtime.json" ]; then
  RUNTIME_ARN=$(node -e "const d=JSON.parse(require('fs').readFileSync('$OUTPUTS_DIR/agentcore-runtime.json','utf8')); console.log((d['AgentCoreRuntimeStack']||{})['AgentRuntimeArn']||'N/A')" 2>/dev/null || echo "N/A")
  
  echo "  Runtime ARN: $RUNTIME_ARN"
fi

# Last updated
if [ -f "$STATE_FILE" ]; then
  LAST_UPDATED=$(node -e "const d=JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8')); console.log(d.last_updated||'Unknown')" 2>/dev/null || echo "Unknown")
  echo ""
  echo -e "${BLUE}Last Updated:${NC} $LAST_UPDATED"
fi

echo ""
print_section "Quick Actions"
echo "  Update deployment:  ./deploy-all.sh"
echo "  Test runtime:       cd backend/agentcore-runtime/test-client && python3 client-cognito-sigv4.py"
echo "  Cleanup:            ./cleanup-all.sh"
echo ""
