#!/bin/bash

################################################################################
# Deployment State Manager
# 
# Tracks deployment state for idempotent operations
################################################################################

STATE_FILE=".deployment-state.json"

# Initialize state file if it doesn't exist
init_state() {
  if [ ! -f "$STATE_FILE" ]; then
    cat > "$STATE_FILE" <<EOF
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
  
  python3 -c "
import json
import sys

with open('$STATE_FILE', 'r') as f:
    state = json.load(f)

state['last_updated'] = '$timestamp'
state['components']['$component']['deployed'] = ('$deployed'.lower() == 'true')
state['components']['$component']['timestamp'] = '$timestamp'

if '$extra_data':
    extra = json.loads('$extra_data')
    state['components']['$component'].update(extra)

with open('$STATE_FILE', 'w') as f:
    json.dump(state, f, indent=2)
"
}

# Check if component is deployed
is_deployed() {
  local component=$1
  
  if [ ! -f "$STATE_FILE" ]; then
    echo "false"
    return
  fi
  
  python3 -c "
import json
try:
    with open('$STATE_FILE', 'r') as f:
        state = json.load(f)
    print('true' if state['components']['$component']['deployed'] else 'false')
except:
    print('false')
"
}

# Get component data
get_state_data() {
  local component=$1
  local key=$2
  
  if [ ! -f "$STATE_FILE" ]; then
    echo ""
    return
  fi
  
  python3 -c "
import json
try:
    with open('$STATE_FILE', 'r') as f:
        state = json.load(f)
    print(state['components']['$component'].get('$key', ''))
except:
    print('')
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

# Check if AgentCore Gateway exists
gateway_exists() {
  local gateway_id=$1
  
  if [ -z "$gateway_id" ]; then
    echo "false"
    return
  fi
  
  aws bedrock-agent-runtime describe-agent-gateway \
    --gateway-id "$gateway_id" \
    --query 'gateway.gatewayId' \
    --output text 2>/dev/null || echo ""
}

# Export functions
export -f init_state
export -f update_state
export -f is_deployed
export -f get_state_data
export -f stack_exists
export -f gateway_exists
