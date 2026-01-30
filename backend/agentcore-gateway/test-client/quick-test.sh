#!/bin/bash
# Quick test script for AgentCore Gateway
# Uses the gateway URL from deployment-outputs.json

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get gateway URL from deployment outputs
GATEWAY_URL=$(python3 -c "import json; print(json.load(open('../scripts/deployment-outputs.json'))['gateway_url'])" 2>/dev/null)

if [ -z "$GATEWAY_URL" ]; then
    echo -e "${RED}✗ Could not find gateway URL in deployment-outputs.json${NC}"
    echo "Please deploy the gateway first or provide --gateway-url manually"
    exit 1
fi

echo -e "${BLUE}Using Gateway URL: ${GATEWAY_URL}${NC}\n"

# Test 1: Connection
echo -e "${BLUE}Test 1: Testing Connection${NC}"
if python3 test_gateway.py --gateway-url "$GATEWAY_URL" --test-connection; then
    echo -e "${GREEN}✓ Connection test passed${NC}\n"
else
    echo -e "${RED}✗ Connection test failed${NC}"
    exit 1
fi

# Test 2: List Tools
echo -e "${BLUE}Test 2: Listing Tools${NC}"
python3 test_gateway.py --gateway-url "$GATEWAY_URL" --list-tools
echo -e "${GREEN}✓ Tool listing completed${NC}\n"

# Test 3: Call a simple tool (get menu)
echo -e "${BLUE}Test 3: Calling GetMenu tool${NC}"
if python3 test_gateway.py --gateway-url "$GATEWAY_URL" --tool-name 'qsr-backend-api___GetMenu' --tool-args '{"locationId": "store-001"}'; then
    echo -e "${GREEN}✓ Tool call successful${NC}\n"
else
    echo -e "${RED}✗ Tool call failed${NC}"
    exit 1
fi

echo -e "${GREEN}All tests passed!${NC}"
