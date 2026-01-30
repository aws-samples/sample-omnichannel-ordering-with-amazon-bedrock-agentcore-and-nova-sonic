# Security Documentation

## Overview

This document provides comprehensive security documentation for the AI-Powered QSR Voice Ordering System. The system implements defense-in-depth security with multiple layers of authentication, authorization, and encryption.

## Table of Contents

- [Security Architecture](#security-architecture)
- [Authentication](#authentication)
- [Authorization](#authorization)
- [Encryption](#encryption)
- [Network Security](#network-security)
- [Data Protection](#data-protection)
- [Security Best Practices](#security-best-practices)
- [Compliance Considerations](#compliance-considerations)
- [Security Monitoring](#security-monitoring)
- [Incident Response](#incident-response)

## Security Architecture

### Defense-in-Depth Model

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Network Security (TLS 1.2+, VPC, Security Groups)      │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: Authentication (Cognito User Pool, JWT tokens)         │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: Authorization (IAM, SigV4, Least Privilege)            │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4: Application Security (Input validation, rate limiting) │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Layer 5: Data Security (Encryption at rest, in transit)         │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Layer 6: Monitoring (CloudWatch, CloudTrail, GuardDuty)         │
└─────────────────────────────────────────────────────────────────┘
```

## Authentication

### Dual-Layer Authentication Model

The system implements a two-layer security model that separates authorization (security) from identification (user context):

#### Layer 1: Authorization (AWS_IAM + SigV4)

**Purpose**: Authorize that requests are allowed to proceed through the system

**Flow**:
1. User authenticates with Cognito User Pool → receives JWT tokens (Access Token + ID Token)
2. Frontend exchanges ID Token for temporary AWS credentials via Cognito Identity Pool
3. All requests signed with AWS Signature Version 4 (SigV4) using temporary credentials
4. AgentCore Gateway validates IAM credentials
5. Backend API Gateway validates IAM credentials

**Why AWS_IAM?**: AgentCore Gateway only supports `AWS_IAM`, `API_KEY`, or no authorization for API Gateway targets. It does NOT support `cognito_user_pools` authorization type.

#### Layer 2: Identity Verification (JWT Access Token)

**Purpose**: Verify user identity and retrieve user details for personalized responses

**Flow**:
1. Frontend sends **Access Token** (not ID Token) as first WebSocket message
2. AgentCore Runtime intercepts and verifies Access Token with AWS Cognito
3. Cognito's `GetUser` API validates token signature, expiration, and revocation
4. Agent retrieves verified user details (username, email, attributes)
5. Agent uses verified identity for personalized conversation
6. Subsequent messages proceed normally with verified session

**Why Access Token?**: Access Tokens are designed for API authentication and can be verified server-side using Cognito's `GetUser` API, which automatically validates signature, expiration, and revocation status.

### Complete Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND APPLICATION                          │
│  1. User logs in → Cognito User Pool → JWT tokens               │
│     • Access Token (for API authentication)                     │
│     • ID Token (for identity claims)                            │
│  2. Exchange ID Token → Cognito Identity Pool → AWS credentials │
│  3. Sign WebSocket with SigV4 (authorization)                   │
│  4. Send Access Token as first WebSocket message                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ WSS + SigV4 + Access Token
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AGENTCORE RUNTIME                              │
│  • Validates SigV4 signature (authorization) ✅                  │
│  • Intercepts first WebSocket message with Access Token         │
│  • Calls Cognito GetUser API to verify Access Token ✅          │
│  • Cognito validates: signature, expiration, revocation         │
│  • Retrieves verified user details (username, email, etc.)      │
│  • Logs user info and proceeds with verified session            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ MCP Protocol
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AGENTCORE GATEWAY                              │
│  • Validates SigV4 signature (authorization) ✅                  │
│  • Routes tool calls to Backend API Gateway                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTPS + SigV4
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND API GATEWAY                            │
│  • Validates SigV4 signature (authorization) ✅                  │
│  • Passes request to Lambda functions                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Lambda invocation
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND LAMBDA FUNCTIONS                       │
│  • Use verified customer identity from agent context            │
│  • Execute personalized business logic                          │
│  • Return personalized responses                                │
└─────────────────────────────────────────────────────────────────┘
```

### Cognito Configuration

#### User Pool Settings

```typescript
{
  passwordPolicy: {
    minimumLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: true
  },
  mfaConfiguration: "OPTIONAL",  // Recommended: "ON" for production
  advancedSecurityMode: "ENFORCED",
  accountRecoverySetting: {
    recoveryMechanisms: [
      { name: "verified_email", priority: 1 }
    ]
  },
  emailVerificationRequired: true
}
```

#### Identity Pool Settings

```typescript
{
  allowUnauthenticatedIdentities: false,
  cognitoIdentityProviders: [{
    clientId: "<user-pool-client-id>",
    providerName: "<user-pool-provider-name>"
  }],
  authenticatedRole: {
    // Permissions for authenticated users
    policies: [
      "bedrock-agentcore:InvokeRuntime",
      "execute-api:Invoke"
    ]
  }
}
```

## Authorization

### IAM Roles and Policies

#### 1. Cognito Authenticated Role

**Purpose**: Allows authenticated users to access AgentCore Runtime and API Gateway

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:InvokeRuntime"
      ],
      "Resource": "arn:aws:bedrock-agentcore:*:*:runtime/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "execute-api:Invoke"
      ],
      "Resource": "arn:aws:execute-api:*:*:*/prod/*"
    }
  ]
}
```

#### 2. AgentCore Runtime Role

**Purpose**: Allows agent to invoke Bedrock models and access Gateway

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/amazon.nova-sonic-v1:0"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:InvokeGateway"
      ],
      "Resource": "arn:aws:bedrock-agentcore:*:*:gateway/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:GetUser"
      ],
      "Resource": "*"
    }
  ]
}
```

#### 3. AgentCore Gateway Role

**Purpose**: Allows gateway to invoke API Gateway endpoints

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "execute-api:Invoke"
      ],
      "Resource": "arn:aws:execute-api:*:*:*/prod/*"
    }
  ]
}
```

#### 4. Lambda Execution Roles

**Purpose**: Allows Lambda functions to access DynamoDB and Location Services

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:UpdateItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/QSR-Customers",
        "arn:aws:dynamodb:*:*:table/QSR-Orders",
        "arn:aws:dynamodb:*:*:table/QSR-Menu",
        "arn:aws:dynamodb:*:*:table/QSR-Carts",
        "arn:aws:dynamodb:*:*:table/QSR-Locations"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "geo:SearchPlaceIndexForText",
        "geo:SearchPlaceIndexForPosition",
        "geo:CalculateRoute"
      ],
      "Resource": [
        "arn:aws:geo:*:*:place-index/QSRRestaurantIndex",
        "arn:aws:geo:*:*:route-calculator/QSRRouteCalculator"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/lambda/*"
    }
  ]
}
```

### AWS Signature Version 4 (SigV4)

All API requests use SigV4 signing for authentication:

```typescript
// Example: Signing a WebSocket URL
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";

const signer = new SignatureV4({
  service: "bedrock-agentcore",
  region: "us-east-1",
  credentials: {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretKey,
    sessionToken: credentials.SessionToken
  },
  sha256: Sha256
});

const signedUrl = await signer.presign({
  method: "GET",
  protocol: "wss",
  hostname: runtimeEndpoint,
  path: "/",
  headers: {
    host: runtimeEndpoint
  }
});
```

## Encryption

### Encryption in Transit

- **TLS 1.2+**: All connections use TLS 1.2 or higher
- **WebSocket**: WSS (WebSocket Secure) for voice streaming
- **HTTPS**: All REST API calls use HTTPS
- **Certificate Management**: AWS Certificate Manager (ACM)

### Encryption at Rest

#### DynamoDB
- **Encryption**: AWS managed keys (default)
- **Option**: Customer managed keys (CMK) via AWS KMS
- **Scope**: All tables encrypted

#### S3 (if used for artifacts)
- **Encryption**: SSE-S3 (server-side encryption)
- **Option**: SSE-KMS for customer managed keys

#### CloudWatch Logs
- **Encryption**: AWS managed keys (default)
- **Option**: Customer managed keys via AWS KMS

### Key Management

```typescript
// Example: Using customer managed KMS key for DynamoDB
const table = new dynamodb.Table(this, 'CustomersTable', {
  encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
  encryptionKey: new kms.Key(this, 'TableKey', {
    enableKeyRotation: true,
    description: 'KMS key for DynamoDB table encryption'
  })
});
```

## Network Security

### VPC Configuration (Optional)

For enhanced security, deploy Lambda functions in VPC:

```typescript
const vpc = new ec2.Vpc(this, 'QSR-VPC', {
  maxAzs: 2,
  natGateways: 1,
  subnetConfiguration: [
    {
      name: 'Private',
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
    }
  ]
});

const lambdaFunction = new lambda.Function(this, 'Function', {
  vpc: vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  securityGroups: [securityGroup]
});
```

### Security Groups

```typescript
const securityGroup = new ec2.SecurityGroup(this, 'LambdaSG', {
  vpc: vpc,
  description: 'Security group for Lambda functions',
  allowAllOutbound: true
});

// Allow HTTPS outbound to DynamoDB and Location Services
securityGroup.addEgressRule(
  ec2.Peer.anyIpv4(),
  ec2.Port.tcp(443),
  'Allow HTTPS outbound'
);
```

### API Gateway Security

#### Throttling
```typescript
const api = new apigateway.RestApi(this, 'QSR-API', {
  deployOptions: {
    throttlingRateLimit: 100,      // requests per second
    throttlingBurstLimit: 200      // burst capacity
  }
});
```

#### CORS Configuration
```typescript
const corsOptions = {
  allowOrigins: apigateway.Cors.ALL_ORIGINS,  // Restrict in production
  allowMethods: apigateway.Cors.ALL_METHODS,
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Amz-Date',
    'X-Api-Key',
    'X-Amz-Security-Token'
  ]
};
```

#### AWS WAF (Recommended for Production)
```typescript
const webAcl = new wafv2.CfnWebACL(this, 'ApiWAF', {
  scope: 'REGIONAL',
  defaultAction: { allow: {} },
  rules: [
    {
      name: 'RateLimitRule',
      priority: 1,
      statement: {
        rateBasedStatement: {
          limit: 2000,
          aggregateKeyType: 'IP'
        }
      },
      action: { block: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'RateLimitRule'
      }
    }
  ]
});
```

## Data Protection

### Personally Identifiable Information (PII)

#### Data Classification

| Data Type | Classification | Storage | Encryption |
|-----------|----------------|---------|------------|
| Customer Name | PII | DynamoDB | At rest + in transit |
| Email Address | PII | DynamoDB | At rest + in transit |
| Phone Number | PII | DynamoDB | At rest + in transit |
| Order History | Sensitive | DynamoDB | At rest + in transit |
| Voice Recordings | Sensitive | Not stored | In transit only |
| Location Data | Sensitive | DynamoDB | At rest + in transit |

#### Data Retention

- **Customer Profiles**: Retained until account deletion
- **Order History**: Retained for 7 years (configurable)
- **Session Data**: Auto-deleted after 24 hours (TTL)
- **Voice Audio**: Not stored (streamed only)
- **CloudWatch Logs**: Retained for 30 days (configurable)

#### Data Deletion

```typescript
// DynamoDB TTL for automatic cleanup
const cartsTable = new dynamodb.Table(this, 'Carts', {
  timeToLiveAttribute: 'expiresAt'
});

// Manual deletion via Lambda
async function deleteCustomerData(customerId: string) {
  // Delete customer profile
  await dynamodb.deleteItem({
    TableName: 'QSR-Customers',
    Key: { PK: `CUSTOMER#${customerId}`, SK: 'PROFILE' }
  });
  
  // Delete order history
  const orders = await dynamodb.query({
    TableName: 'QSR-Orders',
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `CUSTOMER#${customerId}` }
  });
  
  for (const order of orders.Items) {
    await dynamodb.deleteItem({
      TableName: 'QSR-Orders',
      Key: { PK: order.PK, SK: order.SK }
    });
  }
}
```

### Input Validation

All Lambda functions validate input:

```typescript
function validateOrderInput(event: any): void {
  const schema = {
    sessionId: { type: 'string', required: true, pattern: /^[a-zA-Z0-9-]+$/ },
    customerId: { type: 'string', required: true, pattern: /^cust-[a-zA-Z0-9]+$/ },
    locationId: { type: 'string', required: true, pattern: /^loc-[a-zA-Z0-9-]+$/ }
  };
  
  // Validate against schema
  // Throw error if validation fails
}
```

## Security Best Practices

### 1. Enable Multi-Factor Authentication (MFA)

```typescript
const userPool = new cognito.UserPool(this, 'UserPool', {
  mfa: cognito.Mfa.REQUIRED,
  mfaSecondFactor: {
    sms: true,
    otp: true
  }
});
```

### 2. Implement Rate Limiting

```typescript
// API Gateway throttling
const api = new apigateway.RestApi(this, 'API', {
  deployOptions: {
    throttlingRateLimit: 100,
    throttlingBurstLimit: 200
  }
});

// Lambda reserved concurrency
const lambdaFunction = new lambda.Function(this, 'Function', {
  reservedConcurrentExecutions: 10
});
```

### 3. Enable CloudTrail Logging

```typescript
const trail = new cloudtrail.Trail(this, 'CloudTrail', {
  isMultiRegionTrail: true,
  includeGlobalServiceEvents: true,
  managementEvents: cloudtrail.ReadWriteType.ALL
});
```

### 4. Use AWS Secrets Manager

```typescript
const secret = new secretsmanager.Secret(this, 'ApiKey', {
  secretName: 'qsr-api-key',
  generateSecretString: {
    secretStringTemplate: JSON.stringify({ username: 'admin' }),
    generateStringKey: 'password'
  }
});

// Access in Lambda
const secretValue = await secretsManager.getSecretValue({
  SecretId: 'qsr-api-key'
}).promise();
```

### 5. Enable GuardDuty

```bash
# Enable GuardDuty for threat detection
aws guardduty create-detector --enable
```

### 6. Regular Security Audits

- Run AWS Security Hub
- Use AWS Config for compliance checks
- Perform penetration testing (with AWS approval)
- Review IAM policies quarterly
- Rotate credentials regularly

## Compliance Considerations

### GDPR Compliance

- **Right to Access**: Provide customer data export
- **Right to Deletion**: Implement data deletion procedures
- **Data Portability**: Export data in machine-readable format
- **Consent Management**: Track user consent for data processing
- **Data Breach Notification**: 72-hour notification requirement

### CCPA Compliance

- **Consumer Rights**: Access, deletion, opt-out
- **Privacy Policy**: Clear disclosure of data collection
- **Do Not Sell**: Implement opt-out mechanism
- **Data Inventory**: Maintain record of data categories

### PCI DSS (if handling payments)

- **Scope**: Payment data handling
- **Requirements**: Encryption, access control, monitoring
- **Recommendation**: Use AWS-compliant payment gateway (Stripe, Square)

### HIPAA (if handling health data)

- **BAA Required**: Business Associate Agreement with AWS
- **Encryption**: All data encrypted at rest and in transit
- **Access Logs**: Comprehensive audit trails
- **Note**: Current implementation does not handle PHI

## Security Monitoring

### CloudWatch Alarms

```typescript
// Failed authentication attempts
const failedAuthAlarm = new cloudwatch.Alarm(this, 'FailedAuthAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/Cognito',
    metricName: 'UserAuthenticationFailure',
    statistic: 'Sum'
  }),
  threshold: 10,
  evaluationPeriods: 1,
  alarmDescription: 'Alert on multiple failed authentication attempts'
});

// Lambda errors
const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
  metric: lambdaFunction.metricErrors(),
  threshold: 5,
  evaluationPeriods: 1,
  alarmDescription: 'Alert on Lambda function errors'
});
```

### CloudTrail Monitoring

Monitor for suspicious activities:
- Unauthorized API calls
- IAM policy changes
- Resource deletions
- Failed authentication attempts
- Unusual access patterns

### GuardDuty Findings

- **Reconnaissance**: Port scanning, unusual API calls
- **Instance Compromise**: Malware, backdoor communication
- **Account Compromise**: Credential exfiltration, unusual behavior
- **Bucket Compromise**: Data exfiltration, policy changes

## Incident Response

### Incident Response Plan

1. **Detection**: CloudWatch, GuardDuty, Security Hub
2. **Analysis**: Review logs, identify scope
3. **Containment**: Isolate affected resources
4. **Eradication**: Remove threat, patch vulnerabilities
5. **Recovery**: Restore services, verify integrity
6. **Lessons Learned**: Document incident, improve controls

### Emergency Contacts

- **AWS Support**: https://console.aws.amazon.com/support/
- **Security Team**: [Your security team contact]
- **On-Call Engineer**: [Your on-call rotation]

### Runbooks

#### Suspected Credential Compromise

1. Rotate all affected credentials immediately
2. Review CloudTrail logs for unauthorized access
3. Revoke active sessions in Cognito
4. Force password reset for affected users
5. Review and update IAM policies
6. Enable MFA if not already enabled

#### DDoS Attack

1. Enable AWS Shield Standard (automatic)
2. Consider AWS Shield Advanced for enhanced protection
3. Implement AWS WAF rate limiting
4. Scale resources to handle load
5. Contact AWS Support for assistance

#### Data Breach

1. Isolate affected systems
2. Preserve evidence (logs, snapshots)
3. Notify security team and legal counsel
4. Assess scope of breach
5. Notify affected users (GDPR: 72 hours)
6. Implement remediation measures
7. Document incident and lessons learned

## Security Checklist

### Pre-Deployment

- [ ] Enable MFA for all IAM users
- [ ] Review and minimize IAM permissions
- [ ] Enable CloudTrail in all regions
- [ ] Configure CloudWatch alarms
- [ ] Enable GuardDuty
- [ ] Enable AWS Config
- [ ] Review security group rules
- [ ] Enable encryption at rest for all data stores
- [ ] Configure backup and recovery procedures
- [ ] Document incident response procedures

### Post-Deployment

- [ ] Verify all endpoints use HTTPS/WSS
- [ ] Test authentication and authorization
- [ ] Verify encryption in transit and at rest
- [ ] Review CloudWatch logs for errors
- [ ] Test rate limiting and throttling
- [ ] Perform security scanning
- [ ] Conduct penetration testing
- [ ] Review and update documentation
- [ ] Train team on security procedures
- [ ] Schedule regular security audits

### Ongoing

- [ ] Monitor CloudWatch alarms daily
- [ ] Review GuardDuty findings weekly
- [ ] Rotate credentials quarterly
- [ ] Review IAM policies quarterly
- [ ] Update dependencies monthly
- [ ] Perform security audits annually
- [ ] Review and update incident response plan annually
- [ ] Conduct security training annually
