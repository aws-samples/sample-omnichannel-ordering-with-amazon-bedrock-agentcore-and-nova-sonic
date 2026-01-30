# Backend Infrastructure

**Team Owner**: Team Member A

## Purpose

This project contains the core backend infrastructure including API Gateway, Lambda functions, DynamoDB tables, Cognito authentication, and AWS Location Services. It provides the foundational REST API that other projects depend on.

## Architecture

This project deploys:
- **Cognito**: User authentication and authorization
- **DynamoDB**: Data storage (Customers, Orders, Menu, Carts, Locations)
- **Lambda**: Business logic functions (8 functions)
- **API Gateway**: REST API endpoints
- **AWS Location Services**: Geocoding and route calculation

## Required Inputs

None - This project deploys first and has no dependencies.

## Outputs (for other projects)

After deployment, this project provides:

**For AgentCore Gateway (Team Member B)**:
- `ApiGatewayUrl`: REST API endpoint URL
- `ApiGatewayId`: API Gateway ID for IAM permissions
- `UserPoolId`: Cognito User Pool ID for JWT validation
- `Region`: AWS region

**Authentication Flow for AgentCore Gateway:**
1. AgentCore Runtime receives JWT from frontend via WebSocket custom header (`X-Cognito-JWT`)
2. AgentCore Runtime validates JWT and extracts user identity
3. AgentCore Gateway uses its IAM service role to invoke API Gateway
4. API Gateway validates AWS SigV4 signature (IAM authorization)
5. If valid, request proceeds to Lambda; if invalid, returns 403 Forbidden

**Note**: API Gateway now uses AWS_IAM authorization instead of Cognito User Pool Authorizer. This allows both:
- AgentCore Gateway (via IAM role + SigV4 signing)
- Frontend applications (via Cognito Identity Pool temporary credentials + SigV4 signing)
to access the API with a single authorization method.

**For Frontend (Team Member D)**:
- `CognitoUserPoolId`: User Pool ID
- `CognitoUserPoolClientId`: Client ID
- `CognitoIdentityPoolId`: Identity Pool ID
- `Region`: AWS region

**Frontend Authentication Flow:**
1. User logs in with Cognito User Pool → receives JWT token
2. Frontend exchanges JWT for temporary AWS credentials from Identity Pool
3. Frontend signs API requests with AWS Signature Version 4 (SigV4) using temporary credentials
4. API Gateway validates SigV4 signature (IAM authorization)
5. If valid, request proceeds to Lambda; if invalid, returns 403 Forbidden

**Note**: Frontend must use AWS SDK to sign requests with SigV4. The Cognito Identity Pool provides temporary AWS credentials (Access Key, Secret Key, Session Token) that are used for signing.

**For Synthetic Data (All Teams)**:
- `DynamoDBTableNames`: Object with all table names
- `Region`: AWS region

## Project Structure

```
backend/backend-infrastructure/
├── bin/
│   └── app.ts                      # CDK app entry point
├── lib/
│   ├── cognito-stack.ts            # User Pool + Identity Pool
│   ├── dynamodb-stack.ts           # All DynamoDB tables
│   ├── lambda-stack.ts             # Lambda functions
│   ├── api-gateway-stack.ts        # REST API with Lambda integrations
│   └── location-stack.ts           # AWS Location Services
├── lambda/                         # Lambda function code
│   ├── get-customer-profile/
│   ├── get-previous-orders/
│   ├── get-menu/
│   ├── add-to-cart/
│   ├── place-order/
│   ├── get-nearest-locations/
│   ├── find-location-along-route/
│   └── geocode-address/
├── test/                           # CDK stack tests
├── cdk.json                        # CDK configuration
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript configuration
└── README.md                       # This file
```

## Technology Stack

- **AWS CDK** with TypeScript (all CDK code in TypeScript)
- **CloudFormation** for resource provisioning (synthesized templates in JSON)
- **Node.js 20.x** runtime for Lambda functions
- **TypeScript** for Lambda function code

**Important**: All CDK infrastructure code must be written in TypeScript. When CDK synthesizes CloudFormation templates, they will be in JSON format.

## Prerequisites

- Node.js 20.x or later
- AWS CLI configured with credentials
- AWS CDK installed globally: `npm install -g aws-cdk`
- Bedrock model access for Nova Sonic v2

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the TypeScript project:
```bash
npm run build
```

3. Bootstrap CDK (first time only):
```bash
cdk bootstrap
```

4. Verify the setup by synthesizing CloudFormation templates:
```bash
npm run synth
```

## Stack Descriptions

### 1. Cognito Stack
- User Pool with email authentication
- User Pool Client for web application
- Identity Pool for temporary AWS credentials
- IAM roles for authenticated users with AgentCore WebSocket permissions
- **Initial user creation** with email parameter
- User group "AppUsersGroup" for application users
- Automatic temporary password email delivery
- Outputs: User Pool ID, Client ID, Identity Pool ID, Region

**Parameters**:
- `UserEmail` (required): Email address for initial user creation
  - Must be a valid email format
  - User will receive temporary password via email
  - Username will be set to "AppUser"

### 2. DynamoDB Stack
- **Customers** table: Customer profiles and loyalty info
- **Orders** table: Order history with GSI for location queries
- **Menu** table: Location-specific menu items
- **Carts** table: Session-based shopping carts with TTL
- **Locations** table: Restaurant location data with taxRate field
- Outputs: Table names and ARNs

### 3. Location Stack
- Place Index for geocoding
- Route Calculator for route optimization
- IAM permissions for Lambda access
- Outputs: Place Index name, Route Calculator name

### 4. Lambda Stack
- **GetCustomerProfile**: Query customer data
- **GetPreviousOrders**: Retrieve order history
- **GetMenu**: Location-specific menu items
- **AddToCart**: Cart management with availability checks
- **PlaceOrder**: Order creation with tax calculation and confirmation
- **GetNearestLocations**: Find nearest restaurants using coordinates
- **FindLocationAlongRoute**: Find restaurants along a route with detour calculation
- **GeocodeAddress**: Convert address to coordinates using AWS Location Services
- IAM roles with least-privilege permissions
- Outputs: Lambda function ARNs

### 5. API Gateway Stack
- REST API with 8 Lambda proxy integrations
- **AWS IAM Authorization** for all endpoints
- All endpoints require AWS Signature Version 4 (SigV4) signed requests
- Supports both:
  - AgentCore Gateway (via IAM service role)
  - Frontend applications (via Cognito Identity Pool temporary credentials)
- Resource paths:
  - `GET /customers/profile` - GetCustomerProfile (IAM auth)
  - `GET /customers/orders` - GetPreviousOrders (IAM auth)
  - `GET /menu` - GetMenu (IAM auth)
  - `POST /cart` - AddToCart (IAM auth)
  - `POST /order` - PlaceOrder (IAM auth)
  - `GET /locations/nearest` - GetNearestLocations (IAM auth)
  - `GET /locations/route` - FindLocationAlongRoute (IAM auth)
  - `GET /locations/geocode` - GeocodeAddress (IAM auth)
- CORS enabled for all origins
- Throttling: 100 requests/sec, burst 200
- Outputs: API Gateway URL, API Gateway ID, API Gateway ARN

## Deployment

**Important - User Creation & Temporary Password**: 

When you deploy the Cognito stack, it will automatically create a test user (`AppUser`) and send a **temporary password to the email address you specify**. 

- You must provide a valid email address via the `UserEmail` parameter
- AWS Cognito will send the temporary password to this email
- Check your email (including spam folder) for the temporary password
- The first time you authenticate with this password, you will be prompted to change it
- Both test scripts automatically handle the password change flow

1. Build the project:
```bash
npm run build
```

2. Synthesize CloudFormation templates:
```bash
cdk synth
```

3. Deploy all stacks:
```bash
cdk deploy --all --parameters CognitoStack:UserEmail=your-email@example.com
```

4. Save the outputs for other teams:
```json
{
  "BackendInfrastructure": {
    "ApiGatewayUrl": "https://abc123.execute-api.us-east-1.amazonaws.com/prod",
    "ApiGatewayId": "abc123",
    "CognitoUserPoolId": "us-east-1_XXXXXXXXX",
    "CognitoUserPoolClientId": "XXXXXXXXXXXXXXXXXXXXXXXXXX",
    "CognitoIdentityPoolId": "us-east-1:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
    "Region": "us-east-1",
    "DynamoDBTableNames": {
      "Customers": "QSR-Customers",
      "Orders": "QSR-Orders",
      "Menu": "QSR-Menu",
      "Carts": "QSR-Carts",
      "Locations": "QSR-Locations"
    }
  }
}
```

## Deployment Order (within this project)

1. **CognitoStack** → Outputs used by other stacks
2. **DynamoDBStack** → Tables for data storage
3. **LocationStack** → Location Services resources
4. **LambdaStack** → Business logic functions
5. **ApiGatewayStack** → REST API endpoints

## Testing

### Automated API Testing Script

A generic test script is provided to test **all 8 API endpoints** (6 GET + 2 POST) with AWS_IAM authorization and SigV4 signing.

**Authentication Flow:**
1. Authenticate with Cognito User Pool → JWT token
2. Exchange JWT for temporary AWS credentials via Cognito Identity Pool
3. Sign API requests with AWS SigV4 using temporary credentials
4. Include JWT token in Authorization header for user identification

**Prerequisites:**
- Python 3 with `boto3` and `requests` packages, OR
- `awscurl` tool installed (`pip install awscurl`)

**Getting Deployment Values:**

After deploying the CDK stacks, you'll receive output values. Use these values with the test script:

1. **Cognito User Pool Client ID**: From CDK output `CognitoStack.UserPoolClientId`
2. **Cognito Identity Pool ID**: From CDK output `CognitoStack.IdentityPoolId`
3. **API Gateway URL**: From CDK output `ApiGatewayStack.ApiGatewayUrl`
4. **AWS Region**: The region where you deployed (e.g., `us-east-1`)

**Example Usage:**

```bash
# Using command-line parameters (recommended)
./test-api.sh \
  -u user@example.com \
  -p YourPassword123 \
  -c <YOUR_COGNITO_CLIENT_ID> \
  -i <YOUR_IDENTITY_POOL_ID> \
  -r <YOUR_AWS_REGION> \
  -a <YOUR_API_GATEWAY_URL>

# Using environment variables + parameters
export AWS_REGION=<YOUR_AWS_REGION>
export COGNITO_CLIENT_ID=<YOUR_COGNITO_CLIENT_ID>
export COGNITO_IDENTITY_POOL_ID=<YOUR_IDENTITY_POOL_ID>
export API_GATEWAY_URL=<YOUR_API_GATEWAY_URL>
./test-api.sh -u user@example.com -p YourPassword123

# Interactive mode (prompts for username and password)
./test-api.sh \
  -c <CLIENT_ID> \
  -i <IDENTITY_POOL_ID> \
  -r <REGION> \
  -a <API_URL>

# Show help
./test-api.sh --help
```

**Endpoints Tested:**
- ✅ 6 GET endpoints: GetNearestLocations, FindLocationAlongRoute, GeocodeAddress, GetMenu, GetCustomerProfile, GetPreviousOrders
- ✅ 2 POST endpoints: AddToCart, PlaceOrder

**Required Parameters:**
- `-u, --username`: Cognito username (prompts if not provided)
- `-p, --password`: Cognito password (prompts if not provided)
- `-c, --client-id`: Cognito User Pool client ID from CDK output
- `-i, --identity-pool-id`: Cognito Identity Pool ID from CDK output
- `-r, --region`: AWS region where you deployed
- `-a, --api-url`: API Gateway base URL from CDK output
- `-h, --help`: Show help message

**Environment Variables (alternative to parameters):**
- `AWS_REGION`: AWS region
- `COGNITO_CLIENT_ID`: Cognito User Pool client ID
- `COGNITO_IDENTITY_POOL_ID`: Cognito Identity Pool ID
- `API_GATEWAY_URL`: API Gateway base URL

**Security Note**: Never commit passwords to git. The script prompts for credentials securely or accepts them as parameters.

**How It Works:**
1. Script authenticates with Cognito User Pool using username/password
2. Receives JWT token from Cognito
3. Exchanges JWT for temporary AWS credentials via Cognito Identity Pool
4. Uses temporary credentials to sign API requests with AWS SigV4
5. Includes JWT token in Authorization header for Lambda functions to identify the user
6. Makes signed requests to all 8 API endpoints

### Authentication Setup

Before testing API endpoints, you must authenticate with Cognito and obtain a JWT token. See [AUTHENTICATION.md](./AUTHENTICATION.md) for detailed authentication flow and troubleshooting.

**Quick Start:**
1. Check your email for temporary password
2. Change password on first login (see AUTHENTICATION.md)
3. Get JWT token
4. Use JWT token in API requests

### Task 1.1: Cognito Stack Testing

To test the Cognito stack implementation:

```bash
# Build the project
npm run build

# Synthesize the Cognito stack CloudFormation template
npx cdk synth QSR-CognitoStack

# Verify the template includes:
# - User Pool with email authentication
# - User Pool Client
# - Identity Pool
# - IAM role with AgentCore permissions
# - AppUsersGroup
# - AppUser with email parameter
# - All required outputs (UserPoolId, UserPoolClientId, IdentityPoolId, Region, AuthenticatedRoleArn)

# Deploy the Cognito stack (requires AWS credentials)
npx cdk deploy QSR-CognitoStack --parameters UserEmail=your-email@example.com

# After deployment, verify:
# - User Pool is created in AWS Console
# - AppUser exists with the provided email
# - AppUser is member of AppUsersGroup
# - Temporary password is sent to the email
# - Identity Pool is created
# - Authenticated role has bedrock-agentcore permissions
```

### Task 1.4: Lambda Stack Testing (Customer Operations)

To test the Lambda stack implementation for customer operations:

```bash
# Build the project
npm run build

# Synthesize the Lambda stack CloudFormation template
npx cdk synth QSR-LambdaStack

# Verify the template includes:
# - GetCustomerProfile Lambda function with DynamoDB read permissions
# - GetPreviousOrders Lambda function with DynamoDB read permissions
# - Environment variables for table names
# - IAM roles with least-privilege permissions
# - All required outputs (Lambda function ARNs)

# Deploy the Lambda stack (requires DynamoDB stack to be deployed first)
npx cdk deploy QSR-LambdaStack

# After deployment, verify:
# - Lambda functions are created in AWS Console
# - Functions have correct environment variables
# - IAM roles have DynamoDB read permissions
# - CloudWatch log groups are created

# Test Lambda functions with sample events:
# 1. GetCustomerProfile
aws lambda invoke \
  --function-name QSR-GetCustomerProfile \
  --payload '{"messageVersion":"1.0","agent":{"name":"test","id":"test","alias":"test","version":"1"},"inputText":"","sessionId":"test","actionGroup":"CustomerOperations","function":"GetCustomerProfile","parameters":[{"name":"customerId","type":"string","value":"customer-123"}],"sessionAttributes":{},"promptSessionAttributes":{}}' \
  response.json

# 2. GetPreviousOrders
aws lambda invoke \
  --function-name QSR-GetPreviousOrders \
  --payload '{"messageVersion":"1.0","agent":{"name":"test","id":"test","alias":"test","version":"1"},"inputText":"","sessionId":"test","actionGroup":"CustomerOperations","function":"GetPreviousOrders","parameters":[{"name":"customerId","type":"string","value":"customer-123"}],"sessionAttributes":{},"promptSessionAttributes":{}}' \
  response.json
```

### Task 1.6: Lambda Stack Testing (Location Services)

To test the Lambda stack implementation for location services:

```bash
# Build the project
npm run build

# Synthesize the Lambda stack CloudFormation template
npx cdk synth QSR-LambdaStack

# Verify the template includes:
# - GetNearestLocations Lambda function with DynamoDB and Location Services permissions
# - FindLocationAlongRoute Lambda function with DynamoDB and Route Calculator permissions
# - GeocodeAddress Lambda function with Place Index permissions
# - Environment variables for table names and Location Services resources
# - IAM roles with least-privilege permissions
# - All required outputs (Lambda function ARNs)

# Deploy the Lambda stack (requires DynamoDB and Location stacks to be deployed first)
npx cdk deploy QSR-LambdaStack

# After deployment, verify:
# - Lambda functions are created in AWS Console
# - Functions have correct environment variables
# - IAM roles have appropriate permissions
# - CloudWatch log groups are created

# Test Lambda functions with sample events:
# 1. GetNearestLocations
aws lambda invoke \
  --function-name QSR-GetNearestLocations \
  --payload '{"queryStringParameters":{"latitude":"47.6062","longitude":"-122.3321","maxResults":"5"}}' \
  response.json

# 2. FindLocationAlongRoute
aws lambda invoke \
  --function-name QSR-FindLocationAlongRoute \
  --payload '{"queryStringParameters":{"startLatitude":"47.6062","startLongitude":"-122.3321","endLatitude":"47.6205","endLongitude":"-122.3493","maxDetourMinutes":"10"}}' \
  response.json

# 3. GeocodeAddress
aws lambda invoke \
  --function-name QSR-GeocodeAddress \
  --payload '{"queryStringParameters":{"address":"1600 Amphitheatre Parkway, Mountain View, CA"}}' \
  response.json
```

### Task 1.7: API Gateway Stack Testing

To test the API Gateway stack implementation:

```bash
# Build the project
npm run build

# Synthesize the API Gateway stack CloudFormation template
npx cdk synth QSR-ApiGatewayStack

# Verify the template includes:
# - REST API with 8 resource paths
# - Lambda proxy integrations for all functions
# - CORS configuration
# - Throttling settings
# - All required outputs (ApiGatewayUrl, ApiGatewayId, ApiGatewayArn)

# Deploy the API Gateway stack (requires Lambda stack to be deployed first)
npx cdk deploy QSR-ApiGatewayStack

# After deployment, verify:
# - API Gateway is created in AWS Console
# - All 8 endpoints are configured
# - Lambda integrations are working
# - CORS headers are present

# Test API Gateway endpoints with curl (requires valid JWT token):
# First, get a JWT token by logging in through Cognito
# Then use it in the Authorization header

# 1. GetNearestLocations
curl "https://<api-id>.execute-api.<region>.amazonaws.com/prod/locations/nearest?latitude=47.6062&longitude=-122.3321&maxResults=5" \
  -H "Authorization: Bearer <jwt-token>"

# 2. GetMenu
curl "https://<api-id>.execute-api.<region>.amazonaws.com/prod/menu?locationId=loc-123" \
  -H "Authorization: Bearer <jwt-token>"

# 3. GetCustomerProfile
curl "https://<api-id>.execute-api.<region>.amazonaws.com/prod/customers/profile?customerId=customer-123" \
  -H "Authorization: Bearer <jwt-token>"

# 4. AddToCart (POST)
curl -X POST "https://<api-id>.execute-api.<region>.amazonaws.com/prod/cart" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{"sessionId":"session-123","locationId":"loc-123","itemId":"item-456","quantity":2}'

# 5. PlaceOrder (POST)
curl -X POST "https://<api-id>.execute-api.<region>.amazonaws.com/prod/order" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{"sessionId":"session-123","customerId":"customer-123","locationId":"loc-123"}'

# Note: Without a valid JWT token, all requests will return 401 Unauthorized
```

### General Testing

```bash
# Run CDK stack tests
npm test

# Validate CloudFormation templates
npx cdk synth --validation

# Test API Gateway endpoints (after deployment)
# Replace <api-id> and <region> with your deployment values
curl https://<api-id>.execute-api.<region>.amazonaws.com/prod/menu?locationId=loc-123
```

## Development

```bash
# Watch mode for automatic rebuilds
npm run watch

# Deploy specific stack
cdk deploy CognitoStack

# Destroy all stacks
cdk destroy --all
```

## Dependencies

- **Upstream**: None (deploys first)
- **Downstream**: 
  - AgentCore Gateway (Team Member B)
  - Frontend (Team Member D)
  - Synthetic Data (All Teams)

## Team Communication

When you update this project:
1. Notify the AgentCore Gateway team (Team Member B) if API Gateway changes
2. Notify the Frontend team (Team Member D) if Cognito configuration changes
3. Notify all teams if DynamoDB table names change
4. Document all output changes in this README

## Troubleshooting

### CDK deployment fails
- Verify AWS credentials are configured
- Check CDK bootstrap is complete
- Verify UserEmail parameter is provided

### Lambda functions fail
- Check CloudWatch Logs for error messages
- Verify IAM permissions for DynamoDB and Location Services
- Test Lambda functions individually in AWS Console

### API Gateway returns errors
- Verify Lambda integrations are configured correctly
- Check CORS configuration for frontend access
- Test endpoints with curl or Postman

## Notes

- All stacks use TypeScript for type safety
- Stacks are designed to be deployed independently
- Cross-stack references use CDK outputs and parameters
- IAM roles follow least-privilege principle
- Resources are tagged for cost tracking
- Tax rates are location-specific (stored in Locations table)
