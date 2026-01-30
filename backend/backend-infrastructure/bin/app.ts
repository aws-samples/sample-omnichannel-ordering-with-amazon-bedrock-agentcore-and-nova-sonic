#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { CognitoStack } from '../lib/cognito-stack';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { LocationStack } from '../lib/location-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { ApiGatewayStack } from '../lib/api-gateway-stack';

const app = new cdk.App();

// Add cdk-nag checks for AWS best practices
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Get environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Stack 1: DynamoDB - Data storage
const dynamoDBStack = new DynamoDBStack(app, 'QSR-DynamoDBStack', {
  env,
  description: 'DynamoDB tables for customers, orders, menu, carts, and locations',
});

// Stack 2: Location Services - Geocoding and routing
const locationStack = new LocationStack(app, 'QSR-LocationStack', {
  env,
  description: 'AWS Location Services for geocoding and route calculation',
});

// Stack 3: Lambda - Business logic functions
const lambdaStack = new LambdaStack(app, 'QSR-LambdaStack', {
  env,
  description: 'Lambda functions for customer, menu, cart, order, and location operations',
  tables: dynamoDBStack.tables,
  placeIndex: locationStack.placeIndex,
  routeCalculator: locationStack.routeCalculator,
});

// Stack 4: API Gateway - REST API endpoints (must be before Cognito to get ARN)
const apiGatewayStack = new ApiGatewayStack(app, 'QSR-ApiGatewayStack', {
  env,
  description: 'API Gateway REST API with Lambda integrations and AWS_IAM authorization',
  // Note: userPool is not needed anymore since we use AWS_IAM authorization
  userPool: undefined as any, // Temporary - will be removed in next iteration
  lambdaFunctions: lambdaStack.functions,
});

// Stack 5: Cognito - User authentication and authorization (after API Gateway to get ARN)
const cognitoStack = new CognitoStack(app, 'QSR-CognitoStack', {
  env,
  description: 'Cognito User Pool and Identity Pool for QSR ordering system',
  apiGatewayArn: `arn:aws:execute-api:${env.region}:${env.account}:${apiGatewayStack.api.restApiId}/*`,
});

// Add dependencies
lambdaStack.addDependency(dynamoDBStack);
lambdaStack.addDependency(locationStack);
apiGatewayStack.addDependency(lambdaStack);
cognitoStack.addDependency(apiGatewayStack);

// Add tags to all stacks
cdk.Tags.of(app).add('Project', 'QSR-Ordering');
cdk.Tags.of(app).add('Environment', 'Development');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('auto-delete', 'no');
