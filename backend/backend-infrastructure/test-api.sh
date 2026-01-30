#!/bin/bash

# Generic API Testing Script for QSR Backend Infrastructure with AWS_IAM Authorization
# Usage: ./test-api.sh [OPTIONS]
#
# Required Options:
#   -u, --username USERNAME          Cognito username (or prompt)
#   -p, --password PASSWORD          Cognito password (or prompt)
#   -c, --client-id CLIENT_ID        Cognito User Pool client ID
#   -i, --identity-pool-id POOL_ID   Cognito Identity Pool ID
#   -up, --user-pool-id POOL_ID      Cognito User Pool ID (optional, extracted from JWT if not provided)
#   -r, --region REGION              AWS region
#   -a, --api-url API_URL            API Gateway base URL
#   -h, --help                       Show help message
#
# Environment Variables (alternative to parameters):
#   AWS_REGION                       AWS region
#   COGNITO_CLIENT_ID                Cognito User Pool client ID
#   COGNITO_IDENTITY_POOL_ID         Cognito Identity Pool ID
#   COGNITO_USER_POOL_ID             Cognito User Pool ID
#   API_GATEWAY_URL                  API Gateway base URL

set -e

# Default values (empty - must be provided as parameters or environment variables)
REGION="${AWS_REGION:-}"
CLIENT_ID="${COGNITO_CLIENT_ID:-}"
IDENTITY_POOL_ID="${COGNITO_IDENTITY_POOL_ID:-}"
USER_POOL_ID="${COGNITO_USER_POOL_ID:-}"
API_URL="${API_GATEWAY_URL:-}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -u|--username)
      USERNAME="$2"
      shift 2
      ;;
    -p|--password)
      PASSWORD="$2"
      shift 2
      ;;
    -c|--client-id)
      CLIENT_ID="$2"
      shift 2
      ;;
    -i|--identity-pool-id)
      IDENTITY_POOL_ID="$2"
      shift 2
      ;;
    -up|--user-pool-id)
      USER_POOL_ID="$2"
      shift 2
      ;;
    -r|--region)
      REGION="$2"
      shift 2
      ;;
    -a|--api-url)
      API_URL="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "This script tests the QSR Backend API with AWS_IAM authorization."
      echo "It authenticates with Cognito User Pool, exchanges the JWT for temporary"
      echo "AWS credentials via Cognito Identity Pool, and signs requests with SigV4."
      echo ""
      echo "Options:"
      echo "  -u, --username USERNAME          Cognito username (required)"
      echo "  -p, --password PASSWORD          Cognito password (required)"
      echo "  -c, --client-id CLIENT_ID        Cognito User Pool client ID (required)"
      echo "  -i, --identity-pool-id POOL_ID   Cognito Identity Pool ID (required)"
      echo "  -up, --user-pool-id POOL_ID      Cognito User Pool ID (optional, extracted from JWT if not provided)"
      echo "  -r, --region REGION              AWS region (required)"
      echo "  -a, --api-url API_URL            API Gateway base URL (required)"
      echo "  -h, --help                       Show this help message"
      echo ""
      echo "Environment Variables (alternative to parameters):"
      echo "  AWS_REGION                       AWS region"
      echo "  COGNITO_CLIENT_ID                Cognito User Pool client ID"
      echo "  COGNITO_IDENTITY_POOL_ID         Cognito Identity Pool ID"
      echo "  COGNITO_USER_POOL_ID             Cognito User Pool ID"
      echo "  API_GATEWAY_URL                  API Gateway base URL"
      echo ""
      echo "Examples:"
      echo "  # Using parameters"
      echo "  $0 -u user@example.com -p MyPassword \\"
      echo "     -c abc123xyz -i us-east-1:uuid \\"
      echo "     -up us-east-1_XXXXXXXXX \\"
      echo "     -r us-east-1 -a https://abc123.execute-api.us-east-1.amazonaws.com/prod"
      echo ""
      echo "  # Using environment variables"
      echo "  export AWS_REGION=us-east-1"
      echo "  export COGNITO_CLIENT_ID=abc123xyz"
      echo "  export COGNITO_IDENTITY_POOL_ID=us-east-1:uuid"
      echo "  export COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX"
      echo "  export API_GATEWAY_URL=https://abc123.execute-api.us-east-1.amazonaws.com/prod"
      echo "  $0 -u user@example.com -p MyPassword"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use -h or --help for usage information"
      exit 1
      ;;
  esac
done

# Prompt for username if not provided
if [ -z "$USERNAME" ]; then
  read -p "Enter Cognito username: " USERNAME
fi

# Prompt for password if not provided
if [ -z "$PASSWORD" ]; then
  read -s -p "Enter Cognito password: " PASSWORD
  echo ""
fi

# Validate required parameters
if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then
  echo "Error: Username and password are required"
  exit 1
fi

if [ -z "$REGION" ]; then
  echo "Error: AWS region is required. Provide via -r/--region or AWS_REGION environment variable"
  exit 1
fi

if [ -z "$CLIENT_ID" ]; then
  echo "Error: Cognito User Pool Client ID is required. Provide via -c/--client-id or COGNITO_CLIENT_ID environment variable"
  exit 1
fi

if [ -z "$IDENTITY_POOL_ID" ]; then
  echo "Error: Cognito Identity Pool ID is required. Provide via -i/--identity-pool-id or COGNITO_IDENTITY_POOL_ID environment variable"
  exit 1
fi

if [ -z "$API_URL" ]; then
  echo "Error: API Gateway URL is required. Provide via -a/--api-url or API_GATEWAY_URL environment variable"
  exit 1
fi

echo "=========================================="
echo "QSR API Testing (AWS_IAM Authorization)"
echo "=========================================="
echo "Region: $REGION"
echo "User Pool Client ID: $CLIENT_ID"
echo "Identity Pool ID: $IDENTITY_POOL_ID"
echo "API URL: $API_URL"
echo "Username: $USERNAME"
echo "=========================================="
echo ""

# Step 1: Authenticate with Cognito User Pool to get JWT token
echo "Step 1: Authenticating with Cognito User Pool..."
AUTH_RESPONSE=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters USERNAME="$USERNAME",PASSWORD="$PASSWORD" \
  --region "$REGION" \
  2>&1)

if [ $? -ne 0 ]; then
  echo "❌ Authentication failed:"
  echo "$AUTH_RESPONSE"
  exit 1
fi

# Check if password change is required
CHALLENGE_NAME=$(echo "$AUTH_RESPONSE" | jq -r '.ChallengeName // empty')

if [ "$CHALLENGE_NAME" == "NEW_PASSWORD_REQUIRED" ]; then
  echo "⚠️  Password change required for first-time login"
  
  # Prompt for new password
  read -s -p "Enter new password: " NEW_PASSWORD
  echo ""
  read -s -p "Confirm new password: " NEW_PASSWORD_CONFIRM
  echo ""
  
  if [ "$NEW_PASSWORD" != "$NEW_PASSWORD_CONFIRM" ]; then
    echo "❌ Passwords do not match"
    exit 1
  fi
  
  # Get session token
  SESSION=$(echo "$AUTH_RESPONSE" | jq -r '.Session')
  
  # Respond to auth challenge
  echo "Changing password..."
  AUTH_RESPONSE=$(aws cognito-idp respond-to-auth-challenge \
    --client-id "$CLIENT_ID" \
    --challenge-name NEW_PASSWORD_REQUIRED \
    --session "$SESSION" \
    --challenge-responses USERNAME="$USERNAME",NEW_PASSWORD="$NEW_PASSWORD" \
    --region "$REGION" \
    2>&1)
  
  if [ $? -ne 0 ]; then
    echo "❌ Password change failed:"
    echo "$AUTH_RESPONSE"
    exit 1
  fi
  
  echo "✅ Password changed successfully"
fi

JWT_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.AuthenticationResult.IdToken')

if [ -z "$JWT_TOKEN" ] || [ "$JWT_TOKEN" == "null" ]; then
  echo "❌ Failed to obtain JWT token"
  echo "$AUTH_RESPONSE"
  exit 1
fi

echo "✅ Authentication successful"
echo "   JWT Token: ${JWT_TOKEN:0:50}..."
echo ""

# Step 2: Get Identity ID from Cognito Identity Pool
echo "Step 2: Getting Identity ID from Cognito Identity Pool..."

# Construct the identity provider string
# Format: cognito-idp.<region>.amazonaws.com/<user-pool-id>

# Extract region from Identity Pool ID
IDENTITY_POOL_REGION=$(echo "$IDENTITY_POOL_ID" | cut -d: -f1)

# If User Pool ID not provided, try to extract from JWT token
if [ -z "$USER_POOL_ID" ]; then
  echo "ℹ️  User Pool ID not provided, attempting to extract from JWT token..."
  
  # Extract the payload (second part) of the JWT
  JWT_PAYLOAD=$(echo "$JWT_TOKEN" | cut -d. -f2)
  
  # Add padding if needed for base64 decoding (base64url uses no padding)
  case $((${#JWT_PAYLOAD} % 4)) in
    2) JWT_PAYLOAD="${JWT_PAYLOAD}==" ;;
    3) JWT_PAYLOAD="${JWT_PAYLOAD}=" ;;
  esac
  
  # Decode and extract issuer (iss) field
  # Replace base64url characters with base64 characters
  JWT_PAYLOAD=$(echo "$JWT_PAYLOAD" | tr '_-' '/+')
  
  USER_POOL_ID=$(echo "$JWT_PAYLOAD" | base64 -d 2>/dev/null | jq -r '.iss' 2>/dev/null | sed 's|https://cognito-idp\.[^/]*/||')
  
  if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" == "null" ]; then
    echo "❌ Failed to extract User Pool ID from JWT token"
    echo "   Please provide User Pool ID using --user-pool-id parameter"
    exit 1
  fi
  
  echo "✅ Extracted User Pool ID from JWT: $USER_POOL_ID"
fi

IDENTITY_PROVIDER="cognito-idp.${IDENTITY_POOL_REGION}.amazonaws.com/${USER_POOL_ID}"

echo "   Identity Provider: $IDENTITY_PROVIDER"

IDENTITY_RESPONSE=$(aws cognito-identity get-id \
  --identity-pool-id "$IDENTITY_POOL_ID" \
  --logins "$IDENTITY_PROVIDER=$JWT_TOKEN" \
  --region "$REGION" \
  2>&1)

if [ $? -ne 0 ]; then
  echo "❌ Failed to get Identity ID:"
  echo "$IDENTITY_RESPONSE"
  exit 1
fi

IDENTITY_ID=$(echo "$IDENTITY_RESPONSE" | jq -r '.IdentityId')

if [ -z "$IDENTITY_ID" ] || [ "$IDENTITY_ID" == "null" ]; then
  echo "❌ Failed to obtain Identity ID"
  echo "$IDENTITY_RESPONSE"
  exit 1
fi

echo "✅ Identity ID obtained: $IDENTITY_ID"
echo ""

# Step 3: Exchange JWT for temporary AWS credentials
echo "Step 3: Exchanging JWT for temporary AWS credentials..."

CREDENTIALS_RESPONSE=$(aws cognito-identity get-credentials-for-identity \
  --identity-id "$IDENTITY_ID" \
  --logins "$IDENTITY_PROVIDER=$JWT_TOKEN" \
  --region "$REGION" \
  2>&1)

if [ $? -ne 0 ]; then
  echo "❌ Failed to get AWS credentials:"
  echo "$CREDENTIALS_RESPONSE"
  exit 1
fi

AWS_ACCESS_KEY_ID=$(echo "$CREDENTIALS_RESPONSE" | jq -r '.Credentials.AccessKeyId')
AWS_SECRET_ACCESS_KEY=$(echo "$CREDENTIALS_RESPONSE" | jq -r '.Credentials.SecretKey')
AWS_SESSION_TOKEN=$(echo "$CREDENTIALS_RESPONSE" | jq -r '.Credentials.SessionToken')
EXPIRATION=$(echo "$CREDENTIALS_RESPONSE" | jq -r '.Credentials.Expiration')

if [ -z "$AWS_ACCESS_KEY_ID" ] || [ "$AWS_ACCESS_KEY_ID" == "null" ]; then
  echo "❌ Failed to obtain AWS credentials"
  echo "$CREDENTIALS_RESPONSE"
  exit 1
fi

echo "✅ Temporary AWS credentials obtained"
echo "   Access Key ID: ${AWS_ACCESS_KEY_ID:0:20}..."
echo "   Expiration: $(date -d @$EXPIRATION 2>/dev/null || date -r $EXPIRATION 2>/dev/null || echo $EXPIRATION)"
echo ""

# Export credentials for AWS CLI to use
export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_SESSION_TOKEN

# Helper function to make SigV4 signed requests with JWT token
make_signed_request() {
  local METHOD=$1
  local PATH=$2
  local QUERY=$3
  local BODY=$4
  
  local FULL_URL="${API_URL}${PATH}"
  if [ -n "$QUERY" ]; then
    FULL_URL="${FULL_URL}?${QUERY}"
  fi
  
  # Check for Python3
  PYTHON_CMD=""
  if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
  elif command -v /opt/homebrew/bin/python3 &> /dev/null; then
    PYTHON_CMD="/opt/homebrew/bin/python3"
  elif command -v /usr/bin/python3 &> /dev/null; then
    PYTHON_CMD="/usr/bin/python3"
  fi
  
  # Use awscurl for SigV4 signing (if available) or fall back to Python with boto3
  if command -v awscurl &> /dev/null; then
    if [ -n "$BODY" ]; then
      awscurl --service execute-api --region "$REGION" \
        -X "$METHOD" \
        -H "Content-Type: application/json" \
        -d "$BODY" \
        "$FULL_URL"
    else
      awscurl --service execute-api --region "$REGION" \
        -X "$METHOD" \
        "$FULL_URL"
    fi
  elif [ -n "$PYTHON_CMD" ]; then
    # Export variables for Python script to read from environment
    export FULL_URL
    export METHOD
    export BODY
    export REGION
    
    # Fallback: Use Python with boto3 for SigV4 signing
    $PYTHON_CMD - <<'EOF'
import sys
import json
import os
from urllib.parse import urlparse, parse_qs
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.session import Session
import requests

# Get parameters from environment
url = os.environ.get('FULL_URL')
method = os.environ.get('METHOD')
body = os.environ.get('BODY')
region = os.environ.get('REGION')

# Handle empty body
if not body or body.strip() == '':
    body = None

# Parse URL to separate base URL and query parameters
parsed_url = urlparse(url)
base_url = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
query_params = parse_qs(parsed_url.query) if parsed_url.query else {}

# Convert query params from lists to single values
query_params = {k: v[0] if isinstance(v, list) and len(v) == 1 else v for k, v in query_params.items()}

# Create session with credentials from environment
session = Session()
credentials = session.get_credentials()

# Prepare headers
headers = {}
if body:
    headers["Content-Type"] = "application/json"

# Create AWS request with properly encoded query parameters
# Pass params separately so requests library handles encoding correctly
request = AWSRequest(method=method, url=base_url, data=body, headers=headers, params=query_params)

# Sign request with SigV4
SigV4Auth(credentials, "execute-api", region).add_auth(request)

# Make request using requests library with params
try:
    response = requests.request(
        method=method,
        url=base_url,
        headers=dict(request.headers),
        params=query_params,
        data=body
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
EOF
  else
    echo "❌ Error: Neither awscurl nor Python 3 with boto3 is available"
    echo "   Install one of the following:"
    echo "   - awscurl: pip install awscurl"
    echo "   - Python 3 with boto3 and requests: pip install boto3 requests"
    exit 1
  fi
}

# Test endpoints
echo "=========================================="
echo "Testing API Endpoints"
echo "=========================================="
echo ""

# Test 1: GetNearestLocations
echo "1. GetNearestLocations"
echo "   GET /locations/nearest"
make_signed_request "GET" "/locations/nearest" "latitude=47.6062&longitude=-122.3321&maxResults=5" ""
echo ""

# Test 2: FindLocationAlongRoute
echo "2. FindLocationAlongRoute"
echo "   GET /locations/route"
make_signed_request "GET" "/locations/route" "startLatitude=47.6062&startLongitude=-122.3321&endLatitude=47.6205&endLongitude=-122.3493&maxDetourMinutes=5" ""
echo ""

# Test 3: GeocodeAddress
echo "3. GeocodeAddress"
echo "   GET /locations/geocode"
make_signed_request "GET" "/locations/geocode" "address=1600+Amphitheatre+Parkway,+Mountain+View,+CA" ""
echo ""

# Test 4: GetMenu
echo "4. GetMenu"
echo "   GET /menu"
make_signed_request "GET" "/menu" "locationId=test-location-123" ""
echo ""

# Test 5: GetCustomerProfile
echo "5. GetCustomerProfile"
echo "   GET /customers/profile"
make_signed_request "GET" "/customers/profile" "customerId=test-customer-123" ""
echo ""

# Test 6: GetPreviousOrders
echo "6. GetPreviousOrders"
echo "   GET /customers/orders"
make_signed_request "GET" "/customers/orders" "customerId=test-customer-123&limit=5" ""
echo ""

# Test 7: AddToCart (POST)
echo "7. AddToCart"
echo "   POST /cart"
CART_BODY='{
  "sessionId": "test-session-123",
  "locationId": "test-location-123",
  "itemId": "test-item-456",
  "quantity": 2,
  "customizations": ["No onions", "Extra cheese"]
}'
make_signed_request "POST" "/cart" "customerId=test-customer-123" "$CART_BODY"
echo ""

# Test 8: PlaceOrder (POST)
echo "8. PlaceOrder"
echo "   POST /order"
ORDER_BODY='{
  "sessionId": "test-session-123",
  "customerId": "test-customer-123",
  "locationId": "test-location-123"
}'
make_signed_request "POST" "/order" "" "$ORDER_BODY"
echo ""

echo "=========================================="
echo "Testing Complete"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - Authentication: Cognito User Pool → JWT token"
echo "  - Authorization: Cognito Identity Pool → AWS credentials"
echo "  - Request Signing: AWS SigV4 with temporary credentials"
echo "  - User Identification: customerId query parameter"
echo "  - 6 GET endpoints tested"
echo "  - 2 POST endpoints tested"
echo "=========================================="
echo ""
echo "Note: This script requires either 'awscurl' or Python 3 with boto3 and requests"
echo "      Install awscurl: pip install awscurl"
echo "      Install Python deps: pip install boto3 requests"
