#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/cdk-stack';

const app = new cdk.App();

// Get API Gateway ID from context (passed via --context or cdk.json)
const apiGatewayId = app.node.tryGetContext('apiGatewayId') || process.env.API_GATEWAY_ID;

if (!apiGatewayId) {
  throw new Error('API Gateway ID is required. Pass via --context apiGatewayId=xxx or API_GATEWAY_ID env var');
}

new CdkStack(app, 'QSR-AgentCoreGatewayStack', {
  apiGatewayId,
  stage: 'prod',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
