#!/bin/bash

################################################################################
# Deployment State Manager
# 
# Tracks deployment state for idempotent operations
# Uses Node.js for JSON manipulation (no Python dependency)
################################################################################

STATE_FILE=".deployment-state.json"
# Resolve to absolute path so it works from any subdirectory
STATE_FILE_ABS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$STATE_FILE"

# Initialize state file if it doesn't exist
init_state() {
  if [ ! -f "$STATE_FILE_ABS" ]; then
    cat > "$STATE_FILE_ABS" <<EOF
{
  "version": "1.0",
  "last_updated": "",
  "components": {
    "backend-infrastructure": {
      "deployed": false,
      "timestamp": "",
      "stacks": []
    },
    "agentcore-gateway": {
      "deployed": false,
      "timestamp": "",
      "gateway_id": ""
    },
    "agentcore-runtime": {
      "deployed": false,
      "timestamp": "",
      "stacks": []
    },
    "synthetic-data": {
      "deployed": false,
      "timestamp": "",
      "location_count": 0,
      "customer_count": 0,
      "menu_item_count": 0,
      "order_count": 0
    },
    "frontend": {
      "deployed": false,
      "timestamp": "",
      "amplify_app_id": "",
      "url": ""
    }
  }
}
EOF
  fi
}

# Update component state
update_state() {
  local component=$1
  local deployed=$2
  local extra_data=$3
  
  init_state
  
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  node -e "
const fs = require('fs');
const state = JSON.parse(fs.readFileSync('$STATE_FILE_ABS', 'utf8'));
state.last_updated = '$timestamp';
if (!state.components['$component']) { state.components['$component'] = {}; }
state.components['$component'].deployed = ('$deployed'.toLowerCase() === 'true');
state.components['$component'].timestamp = '$timestamp';
if ('$extra_data') {
  Object.assign(state.components['$component'], JSON.parse('$extra_data'));
}
fs.writeFileSync('$STATE_FILE_ABS', JSON.stringify(state, null, 2));
"
}

# Check if component is deployed
is_deployed() {
  local component=$1
  
  if [ ! -f "$STATE_FILE_ABS" ]; then
    echo "false"
    return
  fi
  
  node -e "
try {
  const state = JSON.parse(require('fs').readFileSync('$STATE_FILE_ABS', 'utf8'));
  console.log(state.components['$component'].deployed ? 'true' : 'false');
} catch(e) { console.log('false'); }
"
}

# Get component data
get_state_data() {
  local component=$1
  local key=$2
  
  if [ ! -f "$STATE_FILE_ABS" ]; then
    echo ""
    return
  fi
  
  node -e "
try {
  const state = JSON.parse(require('fs').readFileSync('$STATE_FILE_ABS', 'utf8'));
  console.log(state.components['$component']['$key'] || '');
} catch(e) { console.log(''); }
"
}

# Check if CloudFormation stack exists
stack_exists() {
  local stack_name=$1
  local region=${2:-us-east-1}
  
  aws cloudformation describe-stacks \
    --stack-name "$stack_name" \
    --region "$region" \
    --query 'Stacks[0].StackName' \
    --output text 2>/dev/null || echo ""
}

# Export functions
export -f init_state
export -f update_state
export -f is_deployed
export -f get_state_data
export -f stack_exists
