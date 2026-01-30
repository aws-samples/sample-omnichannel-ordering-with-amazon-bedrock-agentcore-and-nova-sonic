#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { InfraStack } from '../lib/infra-stack';
import { RuntimeStack } from '../lib/runtime-stack';

const app = new cdk.App();

// Add cdk-nag checks for AWS best practices
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Create Infrastructure Stack (ECR, CodeBuild, IAM roles, S3)
const infraStack = new InfraStack(app, 'AgentCoreInfraStack', {
  env,
  description: 'Infrastructure for AgentCore Runtime - ECR, CodeBuild, IAM roles, S3 bucket',
});

// Create Runtime Stack
const runtimeStack = new RuntimeStack(app, 'AgentCoreRuntimeStack', {
  env,
  description: 'AgentCore Runtime deployment with WebSocket protocol and Cognito JWT auth',
  
  // Dependencies from InfraStack
  ecrRepository: infraStack.ecrRepository,
  codeBuildProject: infraStack.codeBuildProject,
  sourceBucket: infraStack.sourceBucket,
  agentCoreRuntimeRole: infraStack.agentCoreRuntimeRole,
});

// Runtime stack depends on infrastructure stack
runtimeStack.addDependency(infraStack);

// Add tags to all resources
cdk.Tags.of(app).add('Project', 'QSR-Ordering-System');
cdk.Tags.of(app).add('Component', 'AgentCore-Runtime');
cdk.Tags.of(app).add('Team', 'Team-Member-C');
cdk.Tags.of(app).add('Environment', 'Development');
cdk.Tags.of(app).add('auto-delete', 'no');