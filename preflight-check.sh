#!/bin/bash

################################################################################
# Preflight Check - QSR Ordering System
# 
# Validates prerequisites before deployment with auto-install support
################################################################################

# Don't exit on error initially - we want to check all dependencies
set +e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

CHECKS_PASSED=0
CHECKS_FAILED=0
MISSING_DEPS=()
AUTO_INSTALL=${AUTO_INSTALL:-false}

print_check() {
  echo -ne "${BLUE}⏳ Checking $1...${NC}"
}

print_pass() {
  echo -e "\r${GREEN}✅ $1${NC}"
  ((CHECKS_PASSED++))
}

print_fail() {
  echo -e "\r${RED}❌ $1${NC}"
  if [ -n "$2" ]; then
    echo -e "   ${YELLOW}→ $2${NC}"
  fi
  ((CHECKS_FAILED++))
}

print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

print_section() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo ""
}

prompt_install() {
  local tool=$1
  local install_cmd=$2
  
  if [ "$AUTO_INSTALL" = true ]; then
    return 0
  fi
  
  echo ""
  read -p "Would you like to install $tool now? (y/n): " response
  if [[ "$response" =~ ^[Yy]$ ]]; then
    return 0
  fi
  return 1
}

install_cdk() {
  print_info "Installing AWS CDK CLI..."
  if npm install -g aws-cdk; then
    print_pass "AWS CDK CLI installed successfully"
    return 0
  else
    print_fail "Failed to install AWS CDK CLI"
    return 1
  fi
}

install_aws_cli() {
  print_info "Installing AWS CLI..."
  if command -v pip3 &> /dev/null; then
    if pip3 install awscli --user; then
      print_pass "AWS CLI installed successfully"
      print_info "You may need to add ~/.local/bin to your PATH"
      return 0
    fi
  fi
  print_fail "Failed to install AWS CLI"
  print_info "Please install manually: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  return 1
}

# Check Node.js
print_check "Node.js version"
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version | sed 's/v//')
  NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    print_pass "Node.js $NODE_VERSION (>= 20.x required)"
  else
    print_fail "Node.js $NODE_VERSION" "Version 20.x or higher required"
    MISSING_DEPS+=("nodejs")
  fi
else
  print_fail "Node.js not found" "Install from https://nodejs.org"
  MISSING_DEPS+=("nodejs")
fi

# Check AWS CLI
print_check "AWS CLI"
AWS_CLI_MISSING=false
if command -v aws &> /dev/null; then
  AWS_VERSION=$(aws --version 2>&1 | awk '{print $1}' | cut -d/ -f2)
  print_pass "AWS CLI $AWS_VERSION"
else
  print_fail "AWS CLI not found" "Can auto-install with pip"
  MISSING_DEPS+=("awscli")
  AWS_CLI_MISSING=true
fi

# Check AWS credentials
print_check "AWS credentials"
AWS_CREDS_MISSING=false
if aws sts get-caller-identity &> /dev/null 2>&1; then
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
  REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")
  print_pass "AWS credentials configured (Account: $ACCOUNT_ID, Region: $REGION)"
else
  print_fail "AWS credentials not configured" "Run: aws configure"
  AWS_CREDS_MISSING=true
fi

# Check CDK CLI
print_check "AWS CDK CLI"
CDK_MISSING=false
if command -v cdk &> /dev/null; then
  CDK_VERSION=$(cdk --version 2>&1 | awk '{print $1}')
  print_pass "AWS CDK $CDK_VERSION"
else
  print_fail "AWS CDK not found" "Can auto-install with npm"
  MISSING_DEPS+=("cdk")
  CDK_MISSING=true
fi

# Check CDK Bootstrap (only if CDK and AWS creds exist)
if [ "$CDK_MISSING" = false ] && [ "$AWS_CREDS_MISSING" = false ]; then
  print_check "CDK Bootstrap"
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
  REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")
  
  # The SSM parameter is the real source of truth — CDK deploy checks this, not the CloudFormation stack.
  # Minimum required version is 6 (stable since CDK v2).
  MIN_BOOTSTRAP_VERSION=6
  BOOTSTRAP_VERSION=$(aws ssm get-parameter \
    --name /cdk-bootstrap/hnb659fds/version \
    --region "$REGION" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$BOOTSTRAP_VERSION" ] && [ "$BOOTSTRAP_VERSION" -ge "$MIN_BOOTSTRAP_VERSION" ] 2>/dev/null; then
    print_pass "CDK bootstrapped in $REGION (version $BOOTSTRAP_VERSION)"
  else
    # Determine what went wrong for a clear message
    STACK_EXISTS=$(aws cloudformation describe-stacks --stack-name CDKToolkit --region "$REGION" --query 'Stacks[0].StackName' --output text 2>/dev/null || echo "")
    
    if [ -n "$STACK_EXISTS" ] && [ -z "$BOOTSTRAP_VERSION" ]; then
      # Stack exists but SSM parameter is missing — old bootstrap
      echo ""
      print_fail "CDK Bootstrap is outdated"
      echo ""
      echo -e "   ${YELLOW}What happened:${NC} Your account was bootstrapped with an older version of CDK"
      echo -e "   that doesn't include the version tracking CDK needs to deploy."
      echo ""
      echo -e "   ${YELLOW}How to fix:${NC} Re-run the bootstrap command to update it."
      echo -e "   This is safe — it updates the existing setup without affecting your resources."
      echo ""
    elif [ -n "$BOOTSTRAP_VERSION" ] && [ "$BOOTSTRAP_VERSION" -lt "$MIN_BOOTSTRAP_VERSION" ] 2>/dev/null; then
      # SSM parameter exists but version is too old
      echo ""
      print_fail "CDK Bootstrap version too old (v${BOOTSTRAP_VERSION}, need v${MIN_BOOTSTRAP_VERSION}+)"
      echo ""
      echo -e "   ${YELLOW}What happened:${NC} Your bootstrap version ($BOOTSTRAP_VERSION) is older than what CDK requires ($MIN_BOOTSTRAP_VERSION)."
      echo ""
      echo -e "   ${YELLOW}How to fix:${NC} Re-run the bootstrap command to update it."
      echo -e "   This is safe — it updates the existing setup without affecting your resources."
      echo ""
    else
      # No stack at all
      echo ""
      print_fail "CDK not bootstrapped in $REGION"
      echo ""
      echo -e "   ${YELLOW}What is this?${NC} CDK bootstrap creates a small set of resources in your account"
      echo -e "   (an S3 bucket and IAM roles) that CDK needs to deploy CloudFormation stacks."
      echo -e "   This is a one-time setup per account/region."
      echo ""
    fi
    
    # Offer to auto-fix
    echo -ne "   ${CYAN}Would you like to fix this now? (y/n): ${NC}"
    read -r FIX_BOOTSTRAP
    
    if [[ "$FIX_BOOTSTRAP" =~ ^[Yy]$ ]]; then
      echo ""
      print_info "Running: npx cdk bootstrap aws://$ACCOUNT_ID/$REGION"
      echo ""
      if npx cdk bootstrap "aws://$ACCOUNT_ID/$REGION"; then
        # Auto-fix succeeded — correct the counters since print_fail already incremented CHECKS_FAILED
        ((CHECKS_FAILED--))
        print_pass "CDK bootstrapped successfully in $REGION"
      else
        print_fail "Bootstrap failed" "Try running manually: npx cdk bootstrap aws://$ACCOUNT_ID/$REGION"
        MISSING_DEPS+=("cdk-bootstrap")
      fi
    else
      MISSING_DEPS+=("cdk-bootstrap")
    fi
  fi
fi

# Check Bedrock model access (only if AWS CLI and creds exist)
if [ "$AWS_CLI_MISSING" = false ] && [ "$AWS_CREDS_MISSING" = false ]; then
  print_check "Bedrock Nova Sonic v2 access"
  REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")
  if aws bedrock list-foundation-models --region "$REGION" --query "modelSummaries[?contains(modelId, 'nova-sonic')].modelId" --output text 2>/dev/null | grep -q "nova-sonic"; then
    print_pass "Bedrock Nova Sonic v2 access granted"
  else
    print_fail "Bedrock Nova Sonic v2 access not granted" "Request access in Bedrock console"
  fi
fi

# Check IAM permissions (basic check)
if [ "$AWS_CREDS_MISSING" = false ]; then
  print_check "IAM permissions"
  if aws iam get-user &> /dev/null || aws sts get-caller-identity &> /dev/null; then
    print_pass "IAM permissions available"
  else
    print_fail "Insufficient IAM permissions" "Ensure you have CloudFormation, Lambda, DynamoDB, etc."
  fi
fi

# Summary
print_section "Preflight Check Summary"
echo -e "${GREEN}Passed: $CHECKS_PASSED${NC}"
echo -e "${RED}Failed: $CHECKS_FAILED${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed! Ready to deploy.${NC}"
  echo ""
  echo "Run: ./deploy-all.sh --user-email your@email.com --user-name \"Your Name\""
  exit 0
fi

# Offer to auto-install missing dependencies
print_section "Auto-Install Missing Dependencies"

CAN_AUTO_INSTALL=false

# Check if we can auto-install anything
if [ "$CDK_MISSING" = true ] || [ "$AWS_CLI_MISSING" = true ]; then
  CAN_AUTO_INSTALL=true
fi

if [ "$CAN_AUTO_INSTALL" = true ]; then
  echo -e "${YELLOW}Some dependencies can be installed automatically:${NC}"
  echo ""
  
  if [ "$CDK_MISSING" = true ]; then
    echo "  • AWS CDK CLI (via npm install -g aws-cdk)"
  fi
  
  if [ "$AWS_CLI_MISSING" = true ]; then
    echo "  • AWS CLI (via pip3 install awscli)"
  fi
  
  echo ""
  read -p "Would you like to install missing dependencies automatically? (y/n): " response
  
  if [[ "$response" =~ ^[Yy]$ ]]; then
    echo ""
    print_info "Installing missing dependencies..."
    
    INSTALL_SUCCESS=true
    
    if [ "$CDK_MISSING" = true ]; then
      install_cdk || INSTALL_SUCCESS=false
    fi
    
    if [ "$AWS_CLI_MISSING" = true ]; then
      install_aws_cli || INSTALL_SUCCESS=false
    fi
    
    if [ "$INSTALL_SUCCESS" = true ]; then
      echo ""
      print_info "Re-running preflight checks..."
      echo ""
      exec "$0" "$@"
    else
      echo ""
      print_warning "Some installations failed. Please install manually."
      exit 1
    fi
  else
    echo ""
    print_info "Skipping auto-install."
  fi
fi

# Print manual installation instructions
echo ""
print_section "Manual Installation Required"
echo ""
echo -e "${YELLOW}Please install the following manually:${NC}"
echo ""

for dep in "${MISSING_DEPS[@]}"; do
  case $dep in
    nodejs)
      echo "  • Node.js 20.x+: https://nodejs.org"
      ;;
    awscli)
      echo "  • AWS CLI: pip3 install awscli"
      echo "    Or: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
      ;;
    cdk)
      echo "  • AWS CDK: npm install -g aws-cdk"
      ;;
    cdk-bootstrap)
      echo "  • CDK Bootstrap: npx cdk bootstrap aws://ACCOUNT/REGION"
      echo "    (or re-run this script and answer 'y' when prompted)"
      ;;
  esac
done

if [ "$AWS_CREDS_MISSING" = true ]; then
  echo "  • AWS Credentials: aws configure"
  echo "    Or set environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
fi

echo ""
print_info "After installation, run this script again to verify."
echo ""

exit 1
