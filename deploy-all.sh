#!/bin/bash

################################################################################
# Deploy All - QSR Ordering System
# 
# Deploys all components of the QSR ordering system in the correct order:
# 1. Backend Infrastructure (CDK)
# 2. AgentCore Gateway (Python boto3)
# 3. AgentCore Runtime (CDK)
# 4. Synthetic Data (TODO)
# 5. Frontend (TODO)
#
# Usage:
#   ./deploy-all.sh [OPTIONS]
#
# Options:
#   --skip-backend-infra    Skip Backend Infrastructure deployment
#   --skip-gateway          Skip AgentCore Gateway deployment
#   --skip-runtime          Skip AgentCore Runtime deployment
#   --skip-synthetic-data   Skip Synthetic Data seeding (TODO)
#   --skip-frontend         Skip Frontend deployment (TODO)
#   --user-email EMAIL      Email for initial Cognito user (required for first deployment)
#   --user-name NAME        Full name for initial Cognito user (required for first deployment)
#   --help                  Show this help message
#
################################################################################

set -e  # Exit on error (can be overridden with --ignore-errors)

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
OUTPUTS_DIR="cdk-outputs"
SKIP_BACKEND_INFRA=false
SKIP_GATEWAY=false
SKIP_RUNTIME=false
SKIP_SYNTHETIC_DATA=false
SKIP_FRONTEND=false
USER_EMAIL=""
USER_NAME=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-backend-infra)
      SKIP_BACKEND_INFRA=true
      shift
      ;;
    --skip-gateway)
      SKIP_GATEWAY=true
      shift
      ;;
    --skip-runtime)
      SKIP_RUNTIME=true
      shift
      ;;
    --skip-synthetic-data)
      SKIP_SYNTHETIC_DATA=true
      shift
      ;;
    --skip-frontend)
      SKIP_FRONTEND=true
      shift
      ;;
    --user-email)
      USER_EMAIL="$2"
      shift 2
      ;;
    --user-name)
      USER_NAME="$2"
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

# Create outputs directory
mkdir -p "$OUTPUTS_DIR"

# Start deployment
print_section "QSR Ordering System - Full Deployment"
print_info "Outputs will be saved to: $OUTPUTS_DIR/"
echo ""

################################################################################
# Step 1: Deploy Backend Infrastructure (CDK)
################################################################################

if [ "$SKIP_BACKEND_INFRA" = false ]; then
  print_section "Step 1: Deploying Backend Infrastructure (CDK)"
  
  cd backend/backend-infrastructure
  
  # Check if user email and name are provided (REQUIRED)
  if [ -z "$USER_EMAIL" ]; then
    print_error "User email is required for Cognito user creation"
    print_info "Use: ./deploy-all.sh --user-email your-email@example.com --user-name \"Your Name\""
    cd ../..
    exit 1
  fi
  
  if [ -z "$USER_NAME" ]; then
    print_error "User name is required for Cognito user creation"
    print_info "Use: ./deploy-all.sh --user-email your-email@example.com --user-name \"Your Name\""
    cd ../..
    exit 1
  fi
  
  print_info "Installing dependencies..."
  npm install
  
  print_info "Building CDK project..."
  npm run build
  
  print_info "Deploying all stacks..."
  cdk deploy --all \
    --require-approval never \
    --parameters QSR-CognitoStack:UserEmail="$USER_EMAIL" \
    --parameters QSR-CognitoStack:UserName="$USER_NAME" \
    --outputs-file "../../$OUTPUTS_DIR/backend-infrastructure.json"
  
  if [ $? -eq 0 ]; then
    print_success "Backend Infrastructure deployed successfully"
  else
    print_error "Backend Infrastructure deployment failed"
    cd ../..
    exit 1
  fi
  
  cd ../..
else
  print_warning "Skipping Backend Infrastructure deployment"
fi

################################################################################
# Step 2: Deploy AgentCore Gateway (Python boto3)
################################################################################

if [ "$SKIP_GATEWAY" = false ]; then
  print_section "Step 2: Deploying AgentCore Gateway (Python boto3)"
  
  # Extract API Gateway ID from backend infrastructure outputs
  if [ -f "$OUTPUTS_DIR/backend-infrastructure.json" ]; then
    API_GATEWAY_ID=$(cat "$OUTPUTS_DIR/backend-infrastructure.json" | \
      python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('QSR-ApiGatewayStack', {}).get('ApiGatewayId', ''))")
    
    if [ -z "$API_GATEWAY_ID" ]; then
      print_error "Could not extract API Gateway ID from backend infrastructure outputs"
      exit 1
    fi
    
    print_info "Using API Gateway ID: $API_GATEWAY_ID"
  else
    print_error "Backend infrastructure outputs not found. Deploy backend infrastructure first."
    exit 1
  fi
  
  cd backend/agentcore-gateway
  
  print_info "Installing Python dependencies..."
  pip3 install -r scripts/requirements.txt --break-system-packages
  
  print_info "Deploying AgentCore Gateway..."
  python3 scripts/deploy-gateway.py \
    --config scripts/config.yaml.example \
    --api-gateway-id "$API_GATEWAY_ID" \
    --stage prod \
    --output-file "$(pwd)/../../$OUTPUTS_DIR/agentcore-gateway.json"
  
  if [ $? -eq 0 ]; then
    print_success "AgentCore Gateway deployed successfully"
  else
    print_error "AgentCore Gateway deployment failed"
    cd ../..
    exit 1
  fi
  
  cd ../..
else
  print_warning "Skipping AgentCore Gateway deployment"
fi

################################################################################
# Step 3: Deploy AgentCore Runtime (CDK)
################################################################################

if [ "$SKIP_RUNTIME" = false ]; then
  print_section "Step 3: Deploying AgentCore Runtime (CDK)"
  
  # Extract Gateway URL from gateway outputs
  if [ -f "$OUTPUTS_DIR/agentcore-gateway.json" ]; then
    GATEWAY_URL=$(cat "$OUTPUTS_DIR/agentcore-gateway.json" | \
      python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('gateway_url', ''))")
    
    if [ -z "$GATEWAY_URL" ]; then
      print_error "Could not extract Gateway URL from gateway outputs"
      exit 1
    fi
    
    print_info "Using Gateway URL: $GATEWAY_URL"
  else
    print_error "AgentCore Gateway outputs not found. Deploy gateway first."
    exit 1
  fi
  
  cd backend/agentcore-runtime/cdk
  
  print_info "Installing dependencies..."
  npm install
  
  print_info "Building CDK project..."
  npm run build
  
  print_info "Deploying Infrastructure Stack..."
  cdk deploy AgentCoreInfraStack \
    --require-approval never \
    --outputs-file "../../../$OUTPUTS_DIR/agentcore-runtime.json"
  
  print_info "Deploying Runtime Stack..."
  cdk deploy AgentCoreRuntimeStack \
    --require-approval never \
    --parameters AgentCoreRuntimeStack:AgentCoreGatewayUrl="$GATEWAY_URL" \
    --outputs-file "../../../$OUTPUTS_DIR/agentcore-runtime.json"
  
  if [ $? -eq 0 ]; then
    print_success "AgentCore Runtime deployed successfully"
  else
    print_error "AgentCore Runtime deployment failed"
    cd ../../..
    exit 1
  fi
  
  cd ../../..
else
  print_warning "Skipping AgentCore Runtime deployment"
fi

################################################################################
# Step 4: Seed Synthetic Data
################################################################################

if [ "$SKIP_SYNTHETIC_DATA" = false ]; then
  print_section "Step 4: Seeding Synthetic Data"
  
  cd backend/synthetic-data
  
  print_info "Installing Python dependencies..."
  pip3 install -r requirements.txt --break-system-packages
  
  print_info "Running interactive data population script..."
  print_warning "You will be prompted for location and business information"
  echo ""
  
  python3 populate_data.py
  
  if [ $? -eq 0 ]; then
    print_success "Synthetic data seeded successfully"
  else
    print_error "Synthetic data seeding failed"
    cd ../..
    exit 1
  fi
  
  cd ../..
else
  print_warning "Skipping Synthetic Data seeding"
fi

################################################################################
# Step 5: Deploy Frontend (TODO)
################################################################################

if [ "$SKIP_FRONTEND" = false ]; then
  print_section "Step 5: Deploying Frontend (TODO)"
  print_warning "Frontend deployment not yet implemented"
  
  # TODO: Uncomment when frontend is ready
  # cd frontend
  # 
  # print_info "Installing dependencies..."
  # npm install
  # 
  # print_info "Building frontend..."
  # npm run build
  # 
  # print_info "Deploying frontend..."
  # # Add deployment command here (e.g., S3 + CloudFront)
  # 
  # if [ $? -eq 0 ]; then
  #   print_success "Frontend deployed successfully"
  # else
  #   print_error "Frontend deployment failed"
  #   cd ..
  #   exit 1
  # fi
  # 
  # cd ..
else
  print_warning "Skipping Frontend deployment"
fi

################################################################################
# Deployment Complete
################################################################################

print_section "Deployment Complete!"

print_success "All components deployed successfully"
echo ""
print_info "Deployment outputs saved to: $OUTPUTS_DIR/"
echo ""

# Display key outputs
if [ -f "$OUTPUTS_DIR/backend-infrastructure.json" ]; then
  echo -e "${BLUE}Backend Infrastructure Outputs:${NC}"
  cat "$OUTPUTS_DIR/backend-infrastructure.json" | python3 -m json.tool | head -20
  echo ""
fi

if [ -f "$OUTPUTS_DIR/agentcore-gateway.json" ]; then
  echo -e "${BLUE}AgentCore Gateway Outputs:${NC}"
  cat "$OUTPUTS_DIR/agentcore-gateway.json" | python3 -m json.tool
  echo ""
fi

if [ -f "$OUTPUTS_DIR/agentcore-runtime.json" ]; then
  echo -e "${BLUE}AgentCore Runtime Outputs:${NC}"
  cat "$OUTPUTS_DIR/agentcore-runtime.json" | python3 -m json.tool | head -20
  echo ""
fi

print_info "To clean up all resources, run: ./cleanup-all.sh"

################################################################################
# Password Setup for Test User
################################################################################

# Only prompt for password change if backend infrastructure was deployed
if [ "$SKIP_BACKEND_INFRA" = false ]; then
  print_section "Password Setup for Test User"

  # Extract CLIENT_ID and REGION first (needed for password change)
  if [ -f "$OUTPUTS_DIR/backend-infrastructure.json" ]; then
    CLIENT_ID=$(cat "$OUTPUTS_DIR/backend-infrastructure.json" | \
      python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('QSR-CognitoStack', {}).get('UserPoolClientId', ''))")
    
    REGION=$(cat "$OUTPUTS_DIR/backend-infrastructure.json" | \
      python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('QSR-CognitoStack', {}).get('Region', ''))")
  fi

  echo ""
  print_info "The test user 'AppUser' was created with a temporary password sent to: $USER_EMAIL"
  print_info "This temporary password must be changed on first login."
  echo ""
  print_info "You can change it now to save time and get ready-to-use test commands,"
  print_info "or you can change it later when you first use a test client."
  echo ""

  # Ask if user wants to change password now
  read -p "Would you like to change the password now? (yes/no): " CHANGE_PASSWORD_NOW

  FINAL_PASSWORD=""

  if [[ "$CHANGE_PASSWORD_NOW" =~ ^[Yy]([Ee][Ss])?$ ]]; then
    echo ""
    print_info "Changing password for AppUser..."
    echo ""
    
    # Get temporary password
    read -sp "Enter the temporary password from email: " TEMP_PASSWORD
    echo ""
    
    # Get new password
    read -sp "Enter new permanent password: " NEW_PASSWORD
    echo ""
    read -sp "Confirm new password: " NEW_PASSWORD_CONFIRM
    echo ""
    
    # Check if passwords match
    if [ "$NEW_PASSWORD" != "$NEW_PASSWORD_CONFIRM" ]; then
      print_error "Passwords do not match. Skipping password change."
      print_warning "You will need to change the password on first login to a test client."
      FINAL_PASSWORD="<temporary-password-from-email>"
    else
      # Change password using AWS CLI
      print_info "Changing password..."
      
      # First, authenticate with temporary password to get session
      AUTH_RESPONSE=$(aws cognito-idp initiate-auth \
        --auth-flow USER_PASSWORD_AUTH \
        --client-id "$CLIENT_ID" \
        --auth-parameters USERNAME=AppUser,PASSWORD="$TEMP_PASSWORD" \
        --region "$REGION" 2>&1)
      
      if echo "$AUTH_RESPONSE" | grep -q "ChallengeName"; then
        # Extract session token
        SESSION=$(echo "$AUTH_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('Session', ''))")
        
        # Respond to NEW_PASSWORD_REQUIRED challenge
        aws cognito-idp respond-to-auth-challenge \
          --client-id "$CLIENT_ID" \
          --challenge-name NEW_PASSWORD_REQUIRED \
          --session "$SESSION" \
          --challenge-responses USERNAME=AppUser,NEW_PASSWORD="$NEW_PASSWORD" \
          --region "$REGION" > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
          print_success "Password changed successfully!"
          FINAL_PASSWORD="$NEW_PASSWORD"
        else
          print_error "Failed to change password. You will need to change it on first login."
          FINAL_PASSWORD="<temporary-password-from-email>"
        fi
      else
        print_error "Failed to authenticate with temporary password."
        print_warning "Please verify the temporary password and try changing it manually."
        FINAL_PASSWORD="<temporary-password-from-email>"
      fi
    fi
  else
    print_info "Skipping password change. You will need to change it on first login to a test client."
    FINAL_PASSWORD="<temporary-password-from-email>"
  fi

  echo ""
else
  # Backend infrastructure was skipped, use placeholder password
  FINAL_PASSWORD="<your-password>"
fi

################################################################################
# Test Commands - Ready to Copy and Paste
################################################################################

print_section "Test Commands - Ready to Copy and Paste"

# Extract values from deployment outputs
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
fi

# Extract Runtime ARN from agentcore-runtime outputs
if [ -f "$OUTPUTS_DIR/agentcore-runtime.json" ]; then
  RUNTIME_ARN=$(cat "$OUTPUTS_DIR/agentcore-runtime.json" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('AgentCoreRuntimeStack', {}).get('AgentRuntimeArn', ''))")
fi

# Extract Gateway URL from agentcore-gateway outputs
if [ -f "$OUTPUTS_DIR/agentcore-gateway.json" ]; then
  GATEWAY_URL=$(cat "$OUTPUTS_DIR/agentcore-gateway.json" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('gateway_url', ''))")
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  1. AgentCore Runtime WebSocket Test Client (with UI)${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$USER_POOL_ID" ] && [ -n "$CLIENT_ID" ] && [ -n "$IDENTITY_POOL_ID" ] && [ -n "$RUNTIME_ARN" ] && [ -n "$REGION" ]; then
  echo -e "${BLUE}cd backend/agentcore-runtime/test-client && python3 client-cognito-sigv4.py \\
  --username AppUser \\
  --password '$FINAL_PASSWORD' \\
  --user-pool-id $USER_POOL_ID \\
  --client-id $CLIENT_ID \\
  --identity-pool-id $IDENTITY_POOL_ID \\
  --runtime-arn $RUNTIME_ARN \\
  --region $REGION${NC}"
  echo ""
  print_info "Then open your browser to: http://localhost:8000"
  print_info "This client provides an interactive UI with map, location services, and WebSocket conversation"
  
  if [ "$FINAL_PASSWORD" == "<temporary-password-from-email>" ]; then
    echo ""
    print_warning "Note: You will be prompted to change the temporary password on first login"
  fi
else
  print_warning "Missing required values for AgentCore Runtime test client"
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
  print_warning "AgentCore Gateway URL not found. Deploy gateway first or check outputs."
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
  --username AppUser \\
  --password '$FINAL_PASSWORD' \\
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
  
  if [ "$FINAL_PASSWORD" == "<temporary-password-from-email>" ]; then
    echo ""
    print_warning "Note: You will be prompted to change the temporary password on first run"
  fi
else
  print_warning "API Gateway URL or Cognito details not found. Deploy backend infrastructure first."
fi

echo ""
print_section "Notes"
print_info "Test user credentials:"
echo "  Username: AppUser"
if [ "$FINAL_PASSWORD" == "<temporary-password-from-email>" ]; then
  echo "  Password: <temporary-password-from-email>"
  echo ""
  print_warning "You will need to change the temporary password on first login to any test client"
else
  echo "  Password: (set during deployment)"
  echo ""
  print_success "Password has been changed and is ready to use!"
fi
echo ""
print_info "Optional parameters for Runtime test client:"
echo "  --map-name (default: QSRRestaurantMap)"
echo "  --place-index-name (default: QSRRestaurantIndex)"
echo ""
