# Guidance for AI-Powered QSR Voice Ordering System on AWS

## Table of Contents
- 🏛️ [Architecture Overview](#architecture-overview)
- 📋 [Solution Overview](#solution-overview)
- 💰 [Cost](#cost)
- ✅ [Prerequisites](#prerequisites)
- 🚀 [Deployment Steps](#deployment-steps)
- 🔍 [Deployment Validation](#deployment-validation)
- 📘 [Running the Guidance](#running-the-guidance)
- 🧪 [Testing](#testing)
- 🔒 [Security Considerations](#security-considerations)
- 🚀 [Performance Optimization](#performance-optimization)
- ➡️ [Next Steps](#next-steps)
- 🧹 [Cleanup](#cleanup)
- ❓ [FAQ, Known Issues, Additional Considerations, and Limitations](#faq-known-issues-additional-considerations-and-limitations)
- 📝 [Revisions](#revisions)
- ⚠️ [Notices](#notices)
- 👥 [Authors](#authors)

## Architecture Overview

![Architecture diagram showing the three-layer decoupled architecture with MCP protocol](docs/architecture-diagram.png)
*Figure 1: Three-layer architecture showing frontend, AgentCore Runtime, and backend services connected via MCP protocol*

The architecture implements a production-ready pattern for voice-first AI ordering systems:

1. **Frontend Layer**: React application hosted on AWS Amplify with Cognito authentication
2. **Agent Layer**: Python-based agent on Amazon Bedrock AgentCore Runtime with Nova Sonic v2 for bidirectional voice streaming
3. **Gateway Layer**: AgentCore Gateway exposing backend APIs as MCP tools
4. **Backend Layer**: Node.js Lambda functions with DynamoDB and AWS Location Services

This architecture demonstrates how to build scalable, secure AI voice applications using the Model Context Protocol (MCP) for standardized tool interactions.

For detailed architecture documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Solution Overview

This guidance demonstrates how to build an AI-powered voice ordering system for quick-service restaurants (QSR) that enables customers to place hands-free orders while driving. The solution addresses the rapidly growing QSR voice ordering market, projected to reach **$1.32 billion by 2030**.

**What**: A production-ready voice ordering system using Amazon Bedrock AgentCore with Nova Sonic v2 for natural conversation, AWS Location Services for route optimization, and a three-layer decoupled architecture.

**Who**: QSR businesses, restaurant chains, and developers building voice-first AI applications.

**Why**: Transform commute time into ordering time with hands-free voice ordering, personalized recommendations, and route-optimized pickup locations. The system achieves 95%+ order accuracy and can reduce service times by 22-88 seconds.

The solution leverages:
- [Amazon Bedrock AgentCore](https://aws.amazon.com/bedrock/agents/) for agent hosting and bidirectional streaming
- [Amazon Nova Sonic v2](https://aws.amazon.com/bedrock/nova/) for speech-to-speech with async tool calling
- [AWS Location Services](https://aws.amazon.com/location/) for geocoding and route optimization
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for standardized tool interactions
- [AWS CDK](https://aws.amazon.com/cdk/) for infrastructure as code

### Demo

[Demo video placeholder - voice ordering conversation with interruptions and location-based recommendations]

### High-Level Steps

1. User authenticates via Amazon Cognito and receives temporary AWS credentials
2. Frontend establishes WebSocket connection to AgentCore Runtime with SigV4 signing
3. User speaks order via microphone (16kHz PCM audio streaming)
4. AgentCore Runtime processes voice with Nova Sonic v2 and invokes tools asynchronously
5. AgentCore Gateway translates MCP tool calls to API Gateway REST calls
6. Lambda functions query DynamoDB and Location Services for personalized responses
7. Agent responds with voice output and order confirmation

## Cost

You are responsible for the cost of the AWS services used while running this Guidance.

As of January 2025, the cost for running this Guidance with the default settings in the US East (N. Virginia) Region is approximately **$45.00** per month for 1,000 voice orders with 5 restaurant locations.

We recommend creating a [Budget](https://console.aws.amazon.com/billing/home#/budgets) through [AWS Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/) to help manage costs. Prices are subject to change. For full details, refer to the pricing webpage for each AWS service used in this Guidance.

### Sample Cost Table

| AWS Service | Dimensions | Cost (USD) |
|-------------|------------|------------|
| Amazon Bedrock AgentCore Runtime | 1,000 sessions/month, 5 min avg duration | $25.00/month |
| Amazon Bedrock (Nova Sonic v2) | 1,000 conversations, 2K input + 1K output tokens avg | $15.00/month |
| AWS Lambda | 8,000 invocations/month, 512MB memory, 1s avg duration | $2.00/month |
| Amazon DynamoDB | 5 tables, on-demand pricing, 10K reads + 5K writes/month | $1.50/month |
| AWS Location Services | 1,000 geocoding + 500 route calculations/month | $1.00/month |
| Amazon Cognito | 1,000 active users/month | $0.00/month |
| AWS Amplify | Hosting for frontend (5GB storage, 15GB bandwidth) | $0.50/month |

**Note**: Costs scale with usage. For 10,000 orders/month, estimated cost is ~$350/month.

## Prerequisites

**Development Tools**
- Node.js 20.x or later
- Python 3.12 or later
- AWS CLI configured with credentials
- AWS CDK CLI: `npm install -g aws-cdk`
- Docker (for local testing, optional)

**AWS Account Requirements**
- Access to the following services:
  - Amazon Bedrock AgentCore Runtime
  - Amazon Bedrock (Nova Sonic v2 model access)
  - AWS Lambda
  - Amazon DynamoDB
  - AWS Location Services
  - Amazon Cognito
  - AWS Amplify
  - Amazon API Gateway

- [AWS Identity and Access Management (IAM)](https://aws.amazon.com/iam/) permissions to:
  - Deploy CDK stacks and CloudFormation templates
  - Create and manage Bedrock AgentCore Runtimes and Gateways
  - Configure Cognito User Pools and Identity Pools
  - Create Lambda functions and API Gateway endpoints
  - Set up DynamoDB tables and Location Services resources

**Important**: Ensure your AWS account has Amazon Bedrock model access for Nova Sonic v2. Request access through the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock/) if needed.

## Deployment Steps

**Objective**: Deploy all components of the QSR ordering system in the correct order.

### One-Command Deployment

The fastest way to deploy the entire system:

```bash
# Clone the repository
git clone https://github.com/aws-samples/qsr-voice-ordering-agentcore.git
cd qsr-voice-ordering-agentcore

# Deploy all components
./deploy-all.sh
```

The script will:
1. Deploy Backend Infrastructure (DynamoDB, Lambda, API Gateway, Cognito)
2. Deploy AgentCore Gateway (MCP server)
3. Deploy AgentCore Runtime (Agent with Nova Sonic v2)
4. Display deployment outputs for configuration

**Success Criteria**: All stacks deploy successfully and outputs are saved to `cdk-outputs/` directory.

### Manual Deployment (Optional)

For step-by-step deployment of individual components, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

**Deployment Order**:
1. [Backend Infrastructure](backend/backend-infrastructure/README.md) - DynamoDB, Lambda, API Gateway, Cognito
2. [AgentCore Gateway](backend/agentcore-gateway/README.md) - MCP server for tool exposure
3. [AgentCore Runtime](backend/agentcore-runtime/README.md) - Agent with Nova Sonic v2
4. [Synthetic Data](backend/synthetic-data/README.md) - Sample data population (optional)

**Important - Temporary Password**: During deployment, AWS Cognito creates a test user and sends a temporary password to your email. Check your email (including spam folder) for the password. The first login will prompt you to change it.

## Deployment Validation

**Objective**: Verify that all components are working correctly together.

### 1. Verify Backend Infrastructure

```bash
# Check API Gateway endpoints
cd backend/backend-infrastructure
./test-api.sh -u AppUser -p <your-password>
```

**Expected Output**: All 8 API endpoints return successful responses.

### 2. Verify AgentCore Gateway

```bash
# List available MCP tools
cd backend/agentcore-gateway/test-client
python test_gateway.py --test list-tools
```

**Expected Output**: 8 tools listed (GetCustomerProfile, GetMenu, AddToCart, etc.)

### 3. Verify AgentCore Runtime

```bash
# Test voice conversation
cd backend/agentcore-runtime/test-client
python client-cognito-sigv4.py --username AppUser --password <your-password>
```

**Expected Output**: Web UI opens at http://localhost:8000 with working voice and text chat.

### 4. Populate Sample Data

```bash
# Generate realistic test data
cd backend/synthetic-data
python populate_data.py
```

**Expected Output**: Sample locations, menu items, and orders created in DynamoDB.

**Success Criteria**:
- All API endpoints respond correctly
- AgentCore Gateway exposes 8 MCP tools
- Voice conversation works in test client
- Sample data is populated in DynamoDB

If any validation step fails, refer to the [Troubleshooting](#troubleshooting) section.

## Running the Guidance

**Objective**: Use the deployed system to place voice orders.

### Using the Test Client

1. Start the test client:
```bash
cd backend/agentcore-runtime/test-client
python client-cognito-sigv4.py --username AppUser --password <your-password>
```

2. Open http://localhost:8000 in your browser

3. Click the microphone button and speak your order:
   - "Hello, I would like to place an order"
   - "I want a chicken sandwich combo"
   - "Find restaurants near me"

4. Observe the agent's voice response and order confirmation

### Expected Output

- **Voice Transcription**: Your speech is transcribed and displayed in the chat
- **Agent Response**: Natural voice response with order details
- **Tool Invocations**: Backend tools are called asynchronously (GetMenu, AddToCart, etc.)
- **Order Confirmation**: Order ID, total, and estimated ready time

### Example Conversation

```
User: Hello, I would like to place an order.

Agent: Hi Sergio, sure thing! Would you like to place an order at a 
       location near you, or are you looking for a specific location?

User: I would like to pick up at the place I usually go.

Agent: [Calling tools in background: GetPreviousOrders, GetMenu]
       
       Sure thing! While I'm getting the menu from your usual location,
       is there anything specific you'd like to order?

User: Yes, I want a Chicken Sandwich combo.

Agent: Alright! I see you previously ordered a Chicken Sandwich combo
       for $6.99 at Van Alstyne, Texas. Would you like to repeat that?

User: Yes.

Agent: Perfect! Your order is ready for pickup at Van Alstyne. 
       Total: $7.79. Estimated ready time: 15 minutes.
```

### Debugging and Logging

- **Frontend Logs**: Browser console (F12) shows WebSocket events and errors
- **Agent Logs**: CloudWatch Logs at `/aws/bedrock-agentcore/runtimes/<runtime-name>`
- **Lambda Logs**: CloudWatch Logs at `/aws/lambda/<function-name>`
- **API Gateway Logs**: CloudWatch Logs at `/aws/apigateway/<api-id>`

## Testing

Each component has its own test client with detailed instructions:

### Backend API Testing
Test REST API endpoints with Cognito authentication and SigV4 signing.
- See [backend/backend-infrastructure/README.md#testing](backend/backend-infrastructure/README.md#testing)
- Uses `test-api.sh` script to test all 8 endpoints

### AgentCore Gateway Testing
Test MCP tool exposure and connectivity.
- See [backend/agentcore-gateway/README.md#testing](backend/agentcore-gateway/README.md#testing)
- Uses `test_gateway.py` to list tools and invoke them

### AgentCore Runtime Testing
Test voice and text conversations with the agent.
- See [backend/agentcore-runtime/README.md#testing](backend/agentcore-runtime/README.md#testing)
- Uses `client-cognito-sigv4.py` with web UI at http://localhost:8000

## Security Considerations

This solution implements several security best practices:

1. **Authentication**: Amazon Cognito User Pool with email/password authentication
2. **Authorization**: AWS IAM with SigV4 signing for all API requests
3. **Temporary Credentials**: Cognito Identity Pool provides short-lived AWS credentials
4. **JWT Verification**: Access Token verification via Cognito GetUser API
5. **Encryption**: TLS 1.2+ for all connections, DynamoDB encryption at rest
6. **Session Isolation**: AgentCore microVMs provide per-user session isolation
7. **Least Privilege**: IAM roles with minimal required permissions

**Additional Security Recommendations**:
- Enable Multi-Factor Authentication (MFA) in Cognito User Pool
- Implement rate limiting for production deployments
- Enable AWS WAF for API Gateway protection
- Use AWS Secrets Manager for sensitive configuration
- Enable CloudTrail for audit logging

For detailed security architecture, see [docs/SECURITY.md](docs/SECURITY.md).

## Performance Optimization

To optimize the performance of your deployment:

### Voice Latency
- **Target**: Sub-700ms response latency with Nova Sonic v2
- **Optimization**: Use async tool calling to avoid blocking conversation
- **Monitoring**: Track latency metrics in CloudWatch

### Database Performance
- **DynamoDB**: Single-digit millisecond latency with on-demand capacity
- **Optimization**: Use efficient key design for common access patterns
- **Monitoring**: Track consumed capacity and throttling events

### Location Services
- **Typical Latency**: 100-500ms for geocoding and route calculations
- **Optimization**: Cache frequently accessed routes
- **Monitoring**: Track API call duration and error rates

### Scalability
- **Concurrent Users**: AgentCore Runtime auto-scales to thousands of sessions
- **Lambda**: Concurrent execution limit (default 1000, can increase)
- **DynamoDB**: On-demand capacity mode for automatic scaling

### Cost Optimization
- Use on-demand pricing for variable traffic patterns
- Implement session timeouts to reduce idle costs
- Monitor usage with CloudWatch and Cost Explorer

## Next Steps

After deploying the guidance, consider these enhancements:

### Frontend Development
- Build React web application for production use
- Implement mobile app with React Native
- Add payment integration (Stripe, Square)
- Implement real-time order status updates

### Feature Enhancements
- Multi-language support with Nova Sonic v2
- Dietary filters and allergen warnings
- Loyalty rewards and point redemption
- Delivery tracking integration
- POS system integration

### Production Readiness
- Set up CI/CD pipeline with AWS CodePipeline
- Implement comprehensive monitoring and alerting
- Add A/B testing for conversation flows
- Configure auto-scaling policies
- Set up disaster recovery procedures

### Analytics and Insights
- Build analytics dashboard for order trends
- Track popular items and peak hours
- Monitor conversation quality metrics
- Analyze customer satisfaction scores

## Cleanup

**Objective**: Remove all resources created by this guidance to avoid ongoing charges.

### One-Command Cleanup

```bash
# Remove all deployed resources
./cleanup-all.sh
```

The script will destroy resources in reverse order:
1. AgentCore Runtime
2. AgentCore Gateway
3. Backend Infrastructure

### Manual Cleanup (Optional)

If you prefer to remove components individually:

```bash
# 1. Delete AgentCore Runtime
cd backend/agentcore-runtime/cdk
cdk destroy --all

# 2. Delete AgentCore Gateway
cd backend/agentcore-gateway
python scripts/delete-gateway.py

# 3. Delete Backend Infrastructure
cd backend/backend-infrastructure
cdk destroy --all
```

### Verify Cleanup

Check the AWS Console to ensure all resources are removed:
- CloudFormation stacks deleted
- Lambda functions removed
- DynamoDB tables deleted
- Cognito User Pool and Identity Pool removed
- AgentCore Runtime and Gateway deleted

**Success Criteria**: All resources are successfully removed and no longer incurring charges.

## FAQ, Known Issues, Additional Considerations, and Limitations

### Known Issues

- **Browser Compatibility**: Some browsers may block microphone access over non-HTTPS connections
- **Token Expiration**: Cognito tokens expire after 1 hour; users must re-authenticate
- **Cold Starts**: First Lambda invocation may take 2-3 seconds (subsequent calls are faster)

### Troubleshooting

#### Authentication Issues
- **Problem**: "Incorrect username or password"
- **Solution**: Use the temporary password sent to your email on first login. Change password when prompted.

#### WebSocket Connection Fails
- **Problem**: "Failed to connect to AgentCore Runtime"
- **Solution**: Verify WebSocket URL is correct and credentials are valid. Check CloudWatch Logs for errors.

#### Agent Not Responding
- **Problem**: Agent doesn't respond to voice input
- **Solution**: Verify microphone permissions in browser. Check that Nova Sonic v2 model access is enabled.

#### Tool Invocation Errors
- **Problem**: "Tool invocation failed"
- **Solution**: Verify AgentCore Gateway is deployed and API Gateway endpoints are accessible. Check Lambda function logs.

#### Deployment Failures
- **Problem**: CDK deployment fails
- **Solution**: Check AWS credentials are configured. Verify IAM permissions. Review CloudFormation stack events for errors.

### Additional Considerations

- **Bedrock Pricing**: Nova Sonic v2 charges per token (input and output)
- **Rate Limiting**: Consider implementing rate limiting for production deployments
- **Data Retention**: Configure DynamoDB TTL for automatic data cleanup
- **Compliance**: Ensure voice recordings comply with local regulations (GDPR, CCPA, etc.)
- **Accessibility**: Test with screen readers and keyboard navigation

### Limitations

- **Voice Quality**: Requires stable internet connection for real-time streaming
- **Language Support**: Currently supports English only (Nova Sonic v2 supports multiple languages)
- **Concurrent Sessions**: Limited by AgentCore Runtime capacity (can be increased)
- **Location Services**: Accuracy depends on GPS signal quality and address data

For issues or feature requests, please use the [GitHub Issues tab](https://github.com/aws-samples/qsr-voice-ordering-agentcore/issues).

## Revisions

- **v1.0.0** – Initial release with AgentCore Runtime, Nova Sonic v2, and MCP integration

## Notices

Customers are responsible for making their own independent assessment of the information in this Guidance.

This Guidance:
(a) is for informational purposes only,
(b) represents AWS current product offerings and practices, which are subject to change without notice, and
(c) does not create any commitments or assurances from AWS and its affiliates, suppliers, or licensors.

AWS products or services are provided "as is" without warranties, representations, or conditions of any kind, whether express or implied.

AWS responsibilities and liabilities to its customers are controlled by AWS agreements, and this Guidance is not part of, nor does it modify, any agreement between AWS and its customers.

## Authors

- Sergio Barraza
- Salman Ahmed
- Ravi Kumar
- Ankush Goyal
