#!/bin/bash

################################################################################
# Test Clients - QSR Ordering System
# 
# Displays ready-to-copy test commands for all deployed test clients.
# Reads deployment outputs and generates commands with actual values.
#
# Usage:
#   ./test-clients.sh --username AppUser --password YourPassword
#   ./test-clients.sh --username AppUser --password YourPassword --help
#
# Options:
#   --username USERNAME     Cognito username (default: AppUser)
#   --password PASSWORD     User password (REQUIRED)
#   --help                  Show this help message
#
################################################################################

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
OUTPUTS_DIR="cdk-outputs"
USERNAME="AppUser"
PASSWORD=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --username)
      USERNAME="$2"
      shift 2
      ;;
    --password)
      PASSWORD="$2"
      shift 2
      ;;
    --help)
      grep "^#" "$0" | grep -v "^#!/" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo -e "${RED}❌ Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Helper functions
print_section() {
  echo ""
  echo -e "${BLUE}============================================================${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}============================================================${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

# Validate required parameters
if [ -z "$PASSWORD" ]; then
  print_error "Password is required"
  echo ""
  echo "Usage: ./test-clients.sh --username AppUser --password YourPassword"
  echo ""
  exit 1
fi

# Check if deployment outputs exist
if [ ! -d "$OUTPUTS_DIR" ]; then
  print_error "Deployment outputs directory not found: $OUTPUTS_DIR/"
  print_info "Please run ./deploy-all.sh first to deploy the system"
  exit 1
fi

print_section "QSR Ordering System - Test Clients"

print_info "Reading deployment outputs from: $OUTPUTS_DIR/"
echo ""

################################################################################
# Extract values from deployment outputs
################################################################################

# Backend Infrastructure outputs
if [ -f "$OUTPUTS_DIR/backend-infrastructure.json" ]; then
  USER_POOL_ID=$(cat "$OUTPUTS_DIR/backend-infrastructure.json" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('QSR-CognitoStack', {}).get('UserPoolId', ''))")
  
  CLIENT_ID=$(cat "$OUTPUTS_DIR/backend-infrastructure.json" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('QSR-CognitoStack', {}).get('UserPoolClientId', ''))")
  
  IDENTITY_POOL_ID=$(cat "$OUTPUTS_DIR/backend-infrastructure.json" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('QSR-CognitoStack', {}).get('IdentityPoolId', ''))")
  
  REGION=$(cat "$OUTPUTS_DIR/backend-infrastructure.json" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('QSR-CognitoStack', {}).get('Region', ''))")
  
  MAP_NAME=$(cat "$OUTPUTS_DIR/backend-infrastructure.json" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('QSR-LocationStack', {}).get('MapName', ''))")
  
  PLACE_INDEX_NAME=$(cat "$OUTPUTS_DIR/backend-infrastructure.json" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('QSR-LocationStack', {}).get('PlaceIndexName', ''))")
  
  API_GATEWAY_URL=$(cat "$OUTPUTS_DIR/backend-infrastructure.json" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('QSR-ApiGatewayStack', {}).get('ApiGatewayUrl', ''))")
else
  print_error "Backend infrastructure outputs not found"
  print_info "Please run ./deploy-all.sh first to deploy the backend infrastructure"
  exit 1
fi

# AgentCore Runtime outputs
if [ -f "$OUTPUTS_DIR/agentcore-runtime.json" ]; then
  RUNTIME_ARN=$(cat "$OUTPUTS_DIR/agentcore-runtime.json" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('AgentCoreRuntimeStack', {}).get('AgentRuntimeArn', ''))")
else
  print_warning "AgentCore Runtime outputs not found"
  RUNTIME_ARN=""
fi

# AgentCore Gateway outputs
if [ -f "$OUTPUTS_DIR/agentcore-gateway.json" ]; then
  GATEWAY_URL=$(cat "$OUTPUTS_DIR/agentcore-gateway.json" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('gateway_url', ''))")
else
  print_warning "AgentCore Gateway outputs not found"
  GATEWAY_URL=""
fi

################################################################################
# Display Test Commands
################################################################################

print_section "Test Commands - Ready to Copy and Paste"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  1. AgentCore Runtime WebSocket Test Client (with UI)${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$USER_POOL_ID" ] && [ -n "$CLIENT_ID" ] && [ -n "$IDENTITY_POOL_ID" ] && [ -n "$RUNTIME_ARN" ] && [ -n "$REGION" ]; then
  echo -e "${BLUE}cd backend/agentcore-runtime/test-client && python3 client-cognito-sigv4.py \\
  --username $USERNAME \\
  --password '$PASSWORD' \\
  --user-pool-id $USER_POOL_ID \\
  --client-id $CLIENT_ID \\
  --identity-pool-id $IDENTITY_POOL_ID \\
  --runtime-arn $RUNTIME_ARN \\
  --region $REGION${NC}"
  echo ""
  print_info "Then open your browser to: http://localhost:8000"
  print_info "This client provides an interactive UI with map, location services, and WebSocket conversation"
else
  print_warning "Missing required values for AgentCore Runtime test client"
  print_info "Please ensure all components are deployed"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  2. AgentCore Gateway Test Client (MCP Tools)${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$GATEWAY_URL" ]; then
  print_info "This client lists and calls MCP tools exposed by the gateway."
  echo ""
  print_info "List available tools:"
  echo -e "${BLUE}cd backend/agentcore-gateway/test-client && python3 test_gateway.py \\
  --gateway-url $GATEWAY_URL \\
  --list-tools${NC}"
  echo ""
  print_info "Call a specific tool (example: get_menu):"
  echo -e "${BLUE}cd backend/agentcore-gateway/test-client && python3 test_gateway.py \\
  --gateway-url $GATEWAY_URL \\
  --tool-name get_menu \\
  --tool-args '{}'${NC}"
else
  print_warning "AgentCore Gateway URL not found"
  print_info "Please deploy the AgentCore Gateway first"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  3. API Gateway Test Script (AWS_IAM Authorization)${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$API_GATEWAY_URL" ] && [ -n "$USER_POOL_ID" ] && [ -n "$CLIENT_ID" ] && [ -n "$IDENTITY_POOL_ID" ] && [ -n "$REGION" ]; then
  print_info "The API Gateway uses AWS_IAM authorization with SigV4 signing."
  print_info "Use the test-api.sh script to test all endpoints:"
  echo ""
  echo -e "${BLUE}cd backend/backend-infrastructure && ./test-api.sh \\
  --username $USERNAME \\
  --password '$PASSWORD' \\
  --client-id $CLIENT_ID \\
  --identity-pool-id $IDENTITY_POOL_ID \\
  --user-pool-id $USER_POOL_ID \\
  --region $REGION \\
  --api-url $API_GATEWAY_URL${NC}"
  echo ""
  print_info "This script will:"
  echo "  1. Authenticate with Cognito User Pool (get JWT token)"
  echo "  2. Exchange JWT for temporary AWS credentials"
  echo "  3. Sign requests with SigV4 and test all 8 endpoints"
else
  print_warning "API Gateway URL or Cognito details not found"
  print_info "Please deploy the backend infrastructure first"
fi

echo ""
print_section "Notes"
print_info "Test user credentials:"
echo "  Username: $USERNAME"
echo "  Password: (provided via --password parameter)"
echo ""
print_info "Optional parameters for Runtime test client:"
echo "  --map-name (default: QSRRestaurantMap)"
echo "  --place-index-name (default: QSRRestaurantIndex)"
echo ""
print_success "All test commands generated successfully!"
echo ""
