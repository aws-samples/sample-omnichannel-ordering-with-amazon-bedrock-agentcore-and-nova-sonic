#!/bin/bash

################################################################################
# Cleanup All - QSR Ordering System
# 
# Deletes all components of the QSR ordering system in reverse order:
# 1. Frontend (TODO)
# 2. Synthetic Data (TODO)
# 3. AgentCore Runtime (CDK)
# 4. AgentCore Gateway (Python boto3)
# 5. Backend Infrastructure (CDK)
#
# Usage:
#   ./cleanup-all.sh [OPTIONS]
#
# Options:
#   --skip-frontend         Skip Frontend cleanup (TODO)
#   --skip-synthetic-data   Skip Synthetic Data cleanup (TODO)
#   --skip-runtime          Skip AgentCore Runtime cleanup
#   --skip-gateway          Skip AgentCore Gateway cleanup
#   --skip-backend-infra    Skip Backend Infrastructure cleanup
#   --ignore-missing-resources  Continue even if resources don't exist
#   --force                 Skip all confirmation prompts
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
STATE_FILE=".deployment-state.json"
SKIP_FRONTEND=false
SKIP_SYNTHETIC_DATA=false
SKIP_RUNTIME=false
SKIP_GATEWAY=false
SKIP_BACKEND_INFRA=false
IGNORE_MISSING=true
FORCE=false
CONTINUE_ON_ERROR=true
DRY_RUN=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-frontend)
      SKIP_FRONTEND=true
      shift
      ;;
    --skip-synthetic-data)
      SKIP_SYNTHETIC_DATA=true
      shift
      ;;
    --skip-runtime)
      SKIP_RUNTIME=true
      shift
      ;;
    --skip-gateway)
      SKIP_GATEWAY=true
      shift
      ;;
    --skip-backend-infra)
      SKIP_BACKEND_INFRA=true
      shift
      ;;
    --ignore-missing-resources)
      IGNORE_MISSING=true
      CONTINUE_ON_ERROR=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
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

# Confirmation prompt
confirm_cleanup() {
  if [ "$FORCE" = true ]; then
    return 0
  fi
  
  echo ""
  echo -e "${YELLOW}⚠️  WARNING: This will delete ALL deployed resources!${NC}"
  echo ""
  echo "This includes:"
  echo "  - AgentCore Runtime (CDK stacks)"
  echo "  - AgentCore Gateway and targets"
  echo "  - Backend Infrastructure (DynamoDB, Lambda, API Gateway, Cognito, etc.)"
  echo ""
  echo -e "${RED}This action cannot be undone!${NC}"
  echo ""
  read -p "Are you sure you want to continue? (yes/no): " response
  
  if [[ "$response" != "yes" && "$response" != "y" ]]; then
    print_info "Cleanup cancelled"
    exit 0
  fi
}

# Start cleanup
print_section "QSR Ordering System - Full Cleanup"

if [ "$DRY_RUN" = true ]; then
  print_warning "DRY RUN MODE - No resources will be deleted"
  echo ""
fi

# Show confirmation prompt
confirm_cleanup

print_info "Starting cleanup in reverse deployment order..."
echo ""

# Track overall success
OVERALL_SUCCESS=true

################################################################################
# Step 1: Cleanup Frontend (TODO)
################################################################################

if [ "$SKIP_FRONTEND" = false ]; then
  print_section "Step 1: Cleaning up Frontend (TODO)"
  print_warning "Frontend cleanup not yet implemented"
  
  # TODO: Uncomment when frontend is ready
  # cd frontend
  # 
  # print_info "Removing frontend deployment..."
  # # Add cleanup command here (e.g., S3 bucket emptying, CloudFront invalidation)
  # 
  # if [ $? -eq 0 ]; then
  #   print_success "Frontend cleaned up successfully"
  # else
  #   print_error "Frontend cleanup failed"
  #   if [ "$CONTINUE_ON_ERROR" = false ]; then
  #     cd ..
  #     exit 1
  #   fi
  #   OVERALL_SUCCESS=false
  # fi
  # 
  # cd ..
else
  print_warning "Skipping Frontend cleanup"
fi

################################################################################
# Step 2: Cleanup Synthetic Data (TODO)
################################################################################

if [ "$SKIP_SYNTHETIC_DATA" = false ]; then
  print_section "Step 2: Cleaning up Synthetic Data (TODO)"
  print_warning "Synthetic data cleanup not yet implemented"
  
  # TODO: Uncomment when synthetic-data is ready
  # cd backend/synthetic-data
  # 
  # print_info "Removing synthetic data..."
  # npm run clean:all
  # 
  # if [ $? -eq 0 ]; then
  #   print_success "Synthetic data cleaned up successfully"
  # else
  #   print_error "Synthetic data cleanup failed"
  #   if [ "$CONTINUE_ON_ERROR" = false ]; then
  #     cd ../..
  #     exit 1
  #   fi
  #   OVERALL_SUCCESS=false
  # fi
  # 
  # cd ../..
else
  print_warning "Skipping Synthetic Data cleanup"
fi

################################################################################
# Step 3: Cleanup AgentCore Runtime (CDK)
################################################################################

if [ "$SKIP_RUNTIME" = false ]; then
  print_section "Step 3: Cleaning up AgentCore Runtime (CDK)"
  
  cd backend/agentcore-runtime/cdk
  
  print_info "Destroying AgentCore Runtime stacks..."
  
  # Check if RuntimeStack exists before attempting deletion
  print_info "Checking if RuntimeStack exists..."
  RUNTIME_STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name AgentCoreRuntimeStack \
    --region us-east-1 \
    --query 'Stacks[0].StackName' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$RUNTIME_STACK_EXISTS" ]; then
    print_info "RuntimeStack found, destroying..."
    
    if [ "$FORCE" = true ]; then
      cdk destroy AgentCoreRuntimeStack --force
    else
      cdk destroy AgentCoreRuntimeStack
    fi
    
    if [ $? -eq 0 ]; then
      print_success "RuntimeStack destroyed successfully"
      
      # Wait for deletion to complete
      print_info "Waiting for RuntimeStack deletion to complete..."
      aws cloudformation wait stack-delete-complete \
        --stack-name AgentCoreRuntimeStack \
        --region us-east-1 2>/dev/null || true
    else
      print_error "RuntimeStack destruction failed"
      if [ "$CONTINUE_ON_ERROR" = false ]; then
        cd ../../..
        exit 1
      fi
      OVERALL_SUCCESS=false
    fi
  else
    print_info "RuntimeStack does not exist, skipping"
  fi
  
  # Small delay to ensure resources are released
  sleep 3
  
  # Check if InfraStack exists before attempting deletion
  print_info "Checking if InfraStack exists..."
  INFRA_STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name AgentCoreInfraStack \
    --region us-east-1 \
    --query 'Stacks[0].StackName' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$INFRA_STACK_EXISTS" ]; then
    print_info "InfraStack found, destroying..."
    print_info "Note: ECR repository will be automatically emptied by CloudFormation"
    
    if [ "$FORCE" = true ]; then
      cdk destroy AgentCoreInfraStack --force
    else
      cdk destroy AgentCoreInfraStack
    fi
    
    if [ $? -eq 0 ]; then
      print_success "InfraStack destroyed successfully"
      
      # Wait for deletion to complete
      print_info "Waiting for InfraStack deletion to complete..."
      aws cloudformation wait stack-delete-complete \
        --stack-name AgentCoreInfraStack \
        --region us-east-1 2>/dev/null || true
      
      print_success "AgentCore Runtime cleaned up successfully"
    else
      print_error "InfraStack destruction failed"
      if [ "$CONTINUE_ON_ERROR" = false ]; then
        cd ../../..
        exit 1
      fi
      OVERALL_SUCCESS=false
    fi
  else
    print_info "InfraStack does not exist, skipping"
  fi
  
  # Remove output file
  if [ -f "../../../$OUTPUTS_DIR/agentcore-runtime.json" ]; then
    rm "../../../$OUTPUTS_DIR/agentcore-runtime.json"
    print_info "Removed runtime output file"
  fi
  
  cd ../../..
else
  print_warning "Skipping AgentCore Runtime cleanup"
fi

################################################################################
# Step 4: Cleanup AgentCore Gateway (CDK)
################################################################################

if [ "$SKIP_GATEWAY" = false ]; then
  print_section "Step 4: Cleaning up AgentCore Gateway (CDK)"
  
  cd backend/agentcore-gateway/cdk
  
  print_info "Destroying AgentCore Gateway stack..."
  
  # Check if Gateway stack exists before attempting deletion
  print_info "Checking if QSR-AgentCoreGatewayStack exists..."
  GATEWAY_STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name QSR-AgentCoreGatewayStack \
    --region us-east-1 \
    --query 'Stacks[0].StackName' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$GATEWAY_STACK_EXISTS" ]; then
    print_info "Gateway stack found, destroying..."
    print_info "This will delete Gateway, Targets, and IAM service role..."
    
    # Get API Gateway ID for context
    API_GATEWAY_ID=$(cat "../../../$OUTPUTS_DIR/backend-infrastructure.json" 2>/dev/null | \
      jq -r '.["QSR-ApiGatewayStack"].ApiGatewayId // empty')
    
    if [ -z "$API_GATEWAY_ID" ]; then
      print_warning "Could not find API Gateway ID, attempting destroy without context..."
      API_GATEWAY_ID="dummy"
    fi
    
    if [ "$FORCE" = true ]; then
      cdk destroy --context apiGatewayId=$API_GATEWAY_ID --force
    else
      cdk destroy --context apiGatewayId=$API_GATEWAY_ID
    fi
    
    if [ $? -eq 0 ]; then
      print_success "Gateway stack destroyed successfully"
      
      # Wait for deletion to complete
      print_info "Waiting for Gateway stack deletion to complete..."
      aws cloudformation wait stack-delete-complete \
        --stack-name QSR-AgentCoreGatewayStack \
        --region us-east-1 2>/dev/null || true
      
      # Remove output file
      if [ -f "../../../$OUTPUTS_DIR/agentcore-gateway.json" ]; then
        rm "../../../$OUTPUTS_DIR/agentcore-gateway.json"
        print_info "Removed gateway output file"
      fi
      
      print_success "AgentCore Gateway cleaned up successfully"
    else
      print_error "Gateway stack destruction failed"
      if [ "$CONTINUE_ON_ERROR" = false ]; then
        cd ../../..
        exit 1
      fi
      OVERALL_SUCCESS=false
    fi
  else
    print_info "Gateway stack does not exist, skipping"
    if [ "$IGNORE_MISSING" = true ]; then
      print_info "Continuing due to missing stack"
    fi
  fi
  
  cd ../../..
else
  print_warning "Skipping AgentCore Gateway cleanup"
fi

################################################################################
# Step 5: Cleanup Backend Infrastructure (CDK)
################################################################################

if [ "$SKIP_BACKEND_INFRA" = false ]; then
  print_section "Step 5: Cleaning up Backend Infrastructure (CDK)"
  
  cd backend/backend-infrastructure
  
  print_info "Destroying Backend Infrastructure stacks..."
  print_warning "This will delete DynamoDB tables, Lambda functions, API Gateway, Cognito, etc."
  
  if [ "$FORCE" = true ]; then
    cdk destroy --all --force
  else
    cdk destroy --all
  fi
  
  if [ $? -eq 0 ]; then
    print_success "Backend Infrastructure cleaned up successfully"
    
    # Wait for all stacks to be deleted
    print_info "Waiting for all backend stacks to be deleted..."
    for stack in QSR-CognitoStack QSR-ApiGatewayStack QSR-LambdaStack QSR-LocationStack QSR-DynamoDBStack; do
      print_info "  Waiting for $stack..."
      aws cloudformation wait stack-delete-complete --stack-name "$stack" --region us-east-1 2>/dev/null || true
    done
    
    # Remove output file
    if [ -f "../../$OUTPUTS_DIR/backend-infrastructure.json" ]; then
      rm "../../$OUTPUTS_DIR/backend-infrastructure.json"
      print_info "Removed backend infrastructure output file"
    fi
  else
    print_error "Backend Infrastructure cleanup failed"
    if [ "$CONTINUE_ON_ERROR" = false ]; then
      cd ../..
      exit 1
    fi
    OVERALL_SUCCESS=false
  fi
  
  cd ../..
else
  print_warning "Skipping Backend Infrastructure cleanup"
fi

################################################################################
# Cleanup Complete
################################################################################

print_section "Cleanup Complete!"

# Remove state file
if [ "$DRY_RUN" = false ] && [ -f "$STATE_FILE" ]; then
  rm "$STATE_FILE"
  print_info "Removed deployment state file"
fi

# Remove outputs directory if empty
if [ -d "$OUTPUTS_DIR" ]; then
  if [ -z "$(ls -A $OUTPUTS_DIR)" ]; then
    if [ "$DRY_RUN" = false ]; then
      rmdir "$OUTPUTS_DIR"
      print_info "Removed empty outputs directory"
    fi
  else
    print_warning "Outputs directory still contains files"
  fi
fi

if [ "$DRY_RUN" = true ]; then
  print_warning "DRY RUN completed - no resources were deleted"
  echo ""
  print_info "Run without --dry-run to actually delete resources"
elif [ "$OVERALL_SUCCESS" = true ]; then
  print_success "All resources cleaned up successfully"
  echo ""
  print_info "To redeploy, run: ./deploy-all.sh --user-email your@email.com --user-name \"Your Name\""
else
  print_warning "Some resources may not have been cleaned up. Check the errors above."
  echo ""
  print_info "You can retry with --ignore-missing-resources flag to continue on errors"
  exit 1
fi
