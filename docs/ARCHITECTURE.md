# Architecture Documentation

## Overview

This document provides detailed technical architecture for the AI-Powered QSR Voice Ordering System. The system implements a three-layer decoupled architecture using the Model Context Protocol (MCP) to separate concerns between frontend, agent, and business logic.

## Table of Contents

- [System Architecture](#system-architecture)
- [Component Interactions](#component-interactions)
- [Data Flow](#data-flow)
- [Data Models](#data-models)
- [Deployment Architecture](#deployment-architecture)
- [Network Architecture](#network-architecture)

## System Architecture

### Three-Layer Decoupled Design

```
┌─────────────────────────────────────────────────────────────────┐
│              LAYER 1: FRONTEND (React + TypeScript)              │
│  • Settings Manager (localStorage)                               │
│  • Auth Component (AWS Amplify Authenticator)                    │
│  • Chat Interface (Voice + Text modes)                           │
│  • WebSocket Client (SigV4 signed connection)                    │
│  • Geolocation API Integration                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WSS (SigV4 Auth)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       LAYER 2: AGENTCORE RUNTIME (Python + Strands)              │
│  • Python 3.12 + Strands Framework                               │
│  • BidiAgent with Nova Sonic v2                                  │
│  • Bidirectional Audio Streaming                                 │
│  • Asynchronous Tool Calling                                     │
│  • Session Isolation (microVM per user)                          │
│  • MCP tool discovery and invocation                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ MCP Protocol
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              AGENTCORE GATEWAY (MCP Server)                      │
│  • MCP-compatible tool server                                    │
│  • Tool discovery and schema management                          │
│  • OAuth credential exchange                                     │
│  • Routes to API Gateway endpoints                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (IAM SigV4)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API GATEWAY (REST API)                         │
│  /customer-profile    → GetCustomerProfile Lambda                │
│  /previous-orders     → GetPreviousOrders Lambda                 │
│  /menu                → GetMenu Lambda                            │
│  /cart                → AddToCart Lambda                          │
│  /order               → PlaceOrder Lambda                         │
│  /locations/nearby    → GetNearestLocations Lambda               │
│  /locations/route     → FindLocationAlongRoute Lambda            │
│  /geocode             → GeocodeAddress Lambda                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        LAYER 3: BACKEND SERVICES (Node.js Lambda)                │
│  • GetCustomerProfile    • GetPreviousOrders                     │
│  • GetMenu               • AddToCart                             │
│  • PlaceOrder            • GetNearestLocations                   │
│  • FindLocationAlongRoute • GeocodeAddress                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        AWS SERVICES                              │
│  • DynamoDB (Customers, Orders, Menu, Carts, Locations)          │
│  • AWS Location Services (Geocoding, Routes, Search)             │
│  • Amazon Cognito (User Pool + Identity Pool)                    │
│  • CloudWatch Logs, X-Ray (Observability)                        │
└─────────────────────────────────────────────────────────────────┘
```

### Architecture Benefits

1. **Decoupled Layers**: Frontend, Agent, and Business Logic can be developed independently
2. **Team Scalability**: Different teams can own different layers
3. **MCP Protocol**: Standard interface between agent and business logic
4. **API Gateway**: RESTful endpoints for business logic, reusable beyond agent
5. **Flexibility**: Easy to add new tools without modifying agent code
6. **Security**: IAM-based authorization with SigV4 signing throughout
7. **Observability**: CloudWatch Logs, CloudTrail, and X-Ray integration

## Component Interactions

### Authentication Flow

```
┌──────────┐
│  User    │
└────┬─────┘
     │ 1. Login (username/password)
     ▼
┌─────────────────┐
│ Cognito User    │
│ Pool            │
└────┬────────────┘
     │ 2. JWT tokens (Access + ID)
     ▼
┌─────────────────┐
│ Frontend        │
└────┬────────────┘
     │ 3. Exchange ID Token
     ▼
┌─────────────────┐
│ Cognito Identity│
│ Pool            │
└────┬────────────┘
     │ 4. Temporary AWS credentials
     ▼
┌─────────────────┐
│ Frontend        │
│ (credentials    │
│  stored)        │
└─────────────────┘
```

### Voice Ordering Flow

```
┌──────────┐
│  User    │
└────┬─────┘
     │ 1. Speak order (microphone)
     ▼
┌─────────────────┐
│ Frontend        │
│ (16kHz PCM)     │
└────┬────────────┘
     │ 2. WebSocket + SigV4
     ▼
┌─────────────────┐
│ AgentCore       │
│ Runtime         │
└────┬────────────┘
     │ 3. Nova Sonic v2 processing
     ▼
┌─────────────────┐
│ Agent           │
│ (async tools)   │
└────┬────────────┘
     │ 4. MCP tool calls
     ▼
┌─────────────────┐
│ AgentCore       │
│ Gateway         │
└────┬────────────┘
     │ 5. REST API calls
     ▼
┌─────────────────┐
│ API Gateway     │
└────┬────────────┘
     │ 6. Lambda invocation
     ▼
┌─────────────────┐
│ Lambda          │
│ Functions       │
└────┬────────────┘
     │ 7. Query data
     ▼
┌─────────────────┐
│ DynamoDB /      │
│ Location Svc    │
└────┬────────────┘
     │ 8. Return results
     ▼
     (Response flows back up the chain)
```

### Tool Invocation Flow

```
Agent needs customer profile
        │
        ▼
Agent calls GetCustomerProfile via MCP
        │
        ▼
AgentCore Gateway receives MCP request
        │
        ▼
Gateway translates to REST API call
        │
        ▼
API Gateway receives HTTPS request (SigV4)
        │
        ▼
Lambda function invoked
        │
        ▼
Lambda queries DynamoDB
        │
        ▼
DynamoDB returns customer data
        │
        ▼
Lambda formats response
        │
        ▼
Response flows back through Gateway
        │
        ▼
Agent receives customer profile
        │
        ▼
Agent incorporates into conversation
```

## Data Flow

### Request Flow (Voice Order)

1. **User Input**: User speaks "I want a chicken sandwich"
2. **Audio Capture**: Frontend captures 16kHz PCM audio
3. **WebSocket Transmission**: Audio streamed to AgentCore Runtime (SigV4 signed)
4. **Speech Processing**: Nova Sonic v2 transcribes speech
5. **Intent Recognition**: Agent determines user wants to order
6. **Tool Selection**: Agent decides to call GetMenu tool
7. **MCP Invocation**: Agent sends MCP request to Gateway
8. **API Translation**: Gateway converts to REST API call
9. **Lambda Execution**: GetMenu Lambda queries DynamoDB
10. **Data Retrieval**: Menu items returned from database
11. **Response Formation**: Lambda formats menu data
12. **MCP Response**: Gateway returns data via MCP
13. **Agent Processing**: Agent incorporates menu into response
14. **Speech Generation**: Nova Sonic v2 generates voice response
15. **Audio Streaming**: Response audio streamed to frontend
16. **Playback**: User hears "Here's our chicken sandwich menu..."

### Response Flow (Async Tool Calling)

```
User: "I want to order"
        │
        ▼
Agent: "Sure! Let me get your profile and menu"
        │
        ├─────────────────┬─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
GetCustomerProfile   GetMenu      GetPreviousOrders
        │                 │                 │
        │ (All execute in parallel)         │
        │                 │                 │
        └─────────────────┴─────────────────┘
                          │
                          ▼
        Agent: "Hi Sergio! Would you like to repeat
                your previous chicken sandwich order?"
```

## Data Models

### DynamoDB Tables

#### 1. Customers Table

**Purpose**: Store customer profiles and loyalty information

**Schema**:
```typescript
{
  PK: "CUSTOMER#<customerId>",
  SK: "PROFILE",
  customerId: string,
  name: string,
  email: string,
  phone: string,
  loyaltyTier: "Bronze" | "Silver" | "Gold" | "Platinum",
  loyaltyPoints: number,
  preferredLocationId?: string,
  dietaryPreferences?: string[],
  createdAt: string,  // ISO 8601
  updatedAt: string   // ISO 8601
}
```

**Access Patterns**:
- Get customer by ID: `GetItem(PK="CUSTOMER#<id>", SK="PROFILE")`

#### 2. Orders Table

**Purpose**: Store order history with location information

**Schema**:
```typescript
{
  PK: "CUSTOMER#<customerId>",
  SK: "ORDER#<orderId>#<timestamp>",
  GSI1PK: "LOCATION#<locationId>",
  GSI1SK: "ORDER#<timestamp>",
  orderId: string,
  customerId: string,
  locationId: string,
  locationName: string,
  items: OrderItem[],
  subtotal: number,
  tax: number,
  total: number,
  status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled",
  estimatedReadyTime: string,
  createdAt: string,
  completedAt?: string
}
```

**Access Patterns**:
- Get customer orders: `Query(PK="CUSTOMER#<id>", SK begins_with "ORDER#")`
- Get location orders: `Query(GSI1, GSI1PK="LOCATION#<id>")`

#### 3. Menu Table

**Purpose**: Store menu items with location-specific availability

**Schema**:
```typescript
{
  PK: "LOCATION#<locationId>#ITEM#<itemId>",
  itemId: string,
  locationId: string,
  name: string,
  description: string,
  price: number,
  category: string[],
  isAvailable: boolean,
  isCombo: boolean,
  availableCustomizations: Customization[],
  createdAt: string,
  updatedAt: string
}
```

**Access Patterns**:
- Get location menu: `Query(PK begins_with "LOCATION#<id>#ITEM#")`
- Get specific item: `GetItem(PK="LOCATION#<locId>#ITEM#<itemId>")`

#### 4. Carts Table

**Purpose**: Store temporary shopping carts during ordering session

**Schema**:
```typescript
{
  PK: "SESSION#<sessionId>",
  sessionId: string,
  customerId?: string,
  locationId: string,
  items: CartItem[],
  subtotal: number,
  tax: number,
  total: number,
  createdAt: string,
  updatedAt: string,
  expiresAt: number  // TTL
}
```

**Access Patterns**:
- Get cart: `GetItem(PK="SESSION#<id>")`
- Auto-cleanup: TTL on `expiresAt` field (24 hours)

#### 5. Locations Table

**Purpose**: Store restaurant location data

**Schema**:
```typescript
{
  PK: "LOCATION#<locationId>",
  locationId: string,
  name: string,
  address: string,
  city: string,
  state: string,
  zipCode: string,
  latitude: number,
  longitude: number,
  phone: string,
  taxRate: number,  // Decimal (e.g., 0.0825 for 8.25%)
  hours: {
    [day: string]: { open: string, close: string }
  },
  isActive: boolean,
  createdAt: string
}
```

**Access Patterns**:
- Get location: `GetItem(PK="LOCATION#<id>")`
- Scan all locations: `Scan()` (used with Location Services for proximity)

## Deployment Architecture

### CDK Stack Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ORDER                              │
└─────────────────────────────────────────────────────────────────┘

1. Backend Infrastructure (Project 1)
   ├── CognitoStack
   ├── DynamoDBStack
   ├── LocationStack
   ├── LambdaStack
   └── ApiGatewayStack
        │
        │ Outputs: API Gateway ID, Cognito IDs
        ▼
2. AgentCore Gateway (Project 2)
   └── Gateway Deployment (Python boto3)
        │
        │ Outputs: Gateway URL
        ▼
3. AgentCore Runtime (Project 3)
   ├── InfraStack (ECR, CodeBuild, S3)
   └── RuntimeStack (Agent deployment)
        │
        │ Outputs: WebSocket URL
        ▼
4. Synthetic Data (Optional)
   └── Data population scripts
```

### Resource Relationships

```
Cognito User Pool
    │
    ├─> Cognito Identity Pool
    │       │
    │       └─> IAM Authenticated Role
    │               │
    │               ├─> AgentCore Runtime (WebSocket)
    │               └─> API Gateway (REST)
    │
    └─> AgentCore Runtime (JWT validation)

API Gateway
    │
    ├─> Lambda Functions (8 functions)
    │       │
    │       ├─> DynamoDB Tables (5 tables)
    │       └─> Location Services (Place Index, Route Calculator)
    │
    └─> AgentCore Gateway (MCP target)

AgentCore Runtime
    │
    └─> AgentCore Gateway (MCP client)
```

## Network Architecture

### Communication Protocols

1. **Frontend ↔ AgentCore Runtime**
   - Protocol: WebSocket (WSS)
   - Authentication: AWS SigV4
   - Data: Audio (16kHz PCM) + Text (JSON)
   - Port: 443 (HTTPS/WSS)

2. **AgentCore Runtime ↔ AgentCore Gateway**
   - Protocol: MCP over Server-Sent Events (SSE)
   - Authentication: IAM Role
   - Data: JSON (tool requests/responses)
   - Port: 443 (HTTPS)

3. **AgentCore Gateway ↔ API Gateway**
   - Protocol: HTTPS REST
   - Authentication: AWS SigV4 (IAM)
   - Data: JSON
   - Port: 443 (HTTPS)

4. **API Gateway ↔ Lambda**
   - Protocol: AWS Lambda invocation
   - Authentication: IAM Role
   - Data: JSON
   - Internal AWS network

5. **Lambda ↔ DynamoDB/Location Services**
   - Protocol: AWS SDK (HTTPS)
   - Authentication: IAM Role
   - Data: JSON
   - Internal AWS network

### Security Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                    PUBLIC INTERNET                               │
│                                                                  │
│  ┌──────────────┐                                                │
│  │   Frontend   │ (User's browser)                               │
│  └──────┬───────┘                                                │
│         │ WSS + SigV4                                            │
└─────────┼──────────────────────────────────────────────────────┘
          │
          │ AWS Network Boundary
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AWS CLOUD (VPC)                               │
│                                                                  │
│  ┌──────────────────┐                                            │
│  │ AgentCore Runtime│ (microVM isolation)                        │
│  └────────┬─────────┘                                            │
│           │ MCP                                                  │
│           ▼                                                      │
│  ┌──────────────────┐                                            │
│  │ AgentCore Gateway│                                            │
│  └────────┬─────────┘                                            │
│           │ HTTPS + SigV4                                        │
│           ▼                                                      │
│  ┌──────────────────┐                                            │
│  │  API Gateway     │                                            │
│  └────────┬─────────┘                                            │
│           │ Lambda invocation                                    │
│           ▼                                                      │
│  ┌──────────────────┐                                            │
│  │  Lambda Functions│ (isolated execution)                       │
│  └────────┬─────────┘                                            │
│           │ AWS SDK                                              │
│           ▼                                                      │
│  ┌──────────────────┬──────────────────┐                         │
│  │    DynamoDB      │ Location Services│                         │
│  └──────────────────┴──────────────────┘                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Scalability Architecture

- **Frontend**: AWS Amplify CDN (global edge locations)
- **AgentCore Runtime**: Auto-scales to thousands of concurrent sessions
- **Lambda**: Concurrent execution (default 1000, can increase)
- **DynamoDB**: On-demand capacity (auto-scales)
- **API Gateway**: 10,000 requests/second (can increase)

### High Availability

- **Multi-AZ**: All AWS services deployed across multiple availability zones
- **Automatic Failover**: Managed by AWS services
- **Session Persistence**: AgentCore Runtime maintains session state
- **Data Replication**: DynamoDB automatically replicates data

## Technology Stack

### Frontend Layer
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Authentication**: AWS Amplify UI
- **Audio**: Web Audio API
- **WebSocket**: Native WebSocket with SigV4 signing
- **Storage**: localStorage (config), sessionStorage (credentials)

### Agent Layer
- **Language**: Python 3.12
- **Framework**: Strands Agents
- **Model**: Amazon Nova Sonic v2
- **Protocol**: MCP (Model Context Protocol)
- **Runtime**: Amazon Bedrock AgentCore Runtime

### Gateway Layer
- **Service**: Amazon Bedrock AgentCore Gateway
- **Protocol**: MCP Server
- **Deployment**: Python boto3 scripts (CDK support pending)

### Backend Layer
- **Language**: Node.js 20.x with TypeScript
- **Framework**: AWS Lambda
- **API**: Amazon API Gateway (REST)
- **Database**: Amazon DynamoDB
- **Location**: AWS Location Services
- **Auth**: Amazon Cognito

### Infrastructure
- **IaC**: AWS CDK with TypeScript
- **Deployment**: CloudFormation
- **Monitoring**: CloudWatch Logs, X-Ray
- **Security**: IAM, SigV4, TLS 1.2+

## Performance Characteristics

### Latency Targets

| Component | Target Latency | Typical Latency |
|-----------|----------------|-----------------|
| Voice Response (Nova Sonic v2) | < 700ms | 400-600ms |
| DynamoDB Query | < 10ms | 2-5ms |
| Lambda Cold Start | < 3s | 1-2s |
| Lambda Warm | < 100ms | 20-50ms |
| Location Services | < 500ms | 100-300ms |
| API Gateway | < 50ms | 10-30ms |
| WebSocket RTT | < 100ms | 30-80ms |

### Throughput Capacity

| Component | Capacity | Scalability |
|-----------|----------|-------------|
| AgentCore Runtime | 1000+ concurrent sessions | Auto-scales |
| Lambda | 1000 concurrent executions | Configurable |
| DynamoDB | Unlimited | On-demand |
| API Gateway | 10,000 req/sec | Configurable |
| Location Services | 100 req/sec | Configurable |

## Cost Optimization

### Cost Drivers

1. **AgentCore Runtime**: Session duration × number of sessions
2. **Nova Sonic v2**: Token usage (input + output)
3. **Lambda**: Invocations × duration × memory
4. **DynamoDB**: Read/write capacity units
5. **Location Services**: API calls

### Optimization Strategies

1. **Session Management**: Implement timeouts to reduce idle costs
2. **Token Optimization**: Keep prompts concise, use async tool calling
3. **Lambda**: Right-size memory, use ARM64 architecture
4. **DynamoDB**: Use on-demand for variable traffic, provisioned for predictable
5. **Caching**: Cache frequently accessed data (menu items, locations)

## Monitoring and Observability

### CloudWatch Metrics

- **AgentCore Runtime**: Session count, duration, errors
- **Lambda**: Invocations, duration, errors, throttles
- **DynamoDB**: Consumed capacity, throttles
- **API Gateway**: Request count, latency, errors
- **Location Services**: API calls, errors

### CloudWatch Logs

- `/aws/bedrock-agentcore/runtimes/<runtime-name>`
- `/aws/lambda/<function-name>`
- `/aws/apigateway/<api-id>`

### X-Ray Tracing

- End-to-end request tracing
- Service map visualization
- Performance bottleneck identification

## Disaster Recovery

### Backup Strategy

- **DynamoDB**: Point-in-time recovery enabled
- **Configuration**: Infrastructure as Code (CDK)
- **Secrets**: AWS Secrets Manager (if used)

### Recovery Procedures

1. **Data Loss**: Restore from DynamoDB backup
2. **Service Failure**: Redeploy via CDK
3. **Region Failure**: Deploy to alternate region (manual)

### RTO/RPO Targets

- **RTO** (Recovery Time Objective): < 1 hour
- **RPO** (Recovery Point Objective): < 5 minutes (DynamoDB PITR)
