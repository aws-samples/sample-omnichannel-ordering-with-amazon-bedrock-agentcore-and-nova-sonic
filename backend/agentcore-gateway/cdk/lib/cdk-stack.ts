import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface GatewayStackProps extends cdk.StackProps {
  apiGatewayId: string;
  stage?: string;
}

export class CdkStack extends cdk.Stack {
  public readonly gatewayId: string;
  public readonly gatewayUrl: string;

  constructor(scope: Construct, id: string, props: GatewayStackProps) {
    super(scope, id, props);

    const stage = props.stage || 'prod';
    const gatewayName = 'qsr-ordering-gateway';

    // Lambda function for Custom Resource (Node.js with esbuild bundling - no Docker needed)
    const gatewayHandlerFunction = new NodejsFunction(this, 'GatewayHandler', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../lambda/handler.mjs'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      description: 'Custom Resource handler for AgentCore Gateway',
      bundling: {
        format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        minify: false,
        sourceMap: true,
        // Bundle ALL @aws-sdk packages instead of using Lambda runtime's versions
        // The runtime's @aws-sdk/client-bedrock-agentcore-control may be outdated
        // and not support apiGateway target configuration
        externalModules: [],
      },
    });

    // Grant permissions to Lambda
    gatewayHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'bedrock-agentcore:CreateGateway',
        'bedrock-agentcore:DeleteGateway',
        'bedrock-agentcore:GetGateway',
        'bedrock-agentcore:CreateGatewayTarget',
        'bedrock-agentcore:DeleteGatewayTarget',
        'bedrock-agentcore:GetGatewayTarget',
        'bedrock-agentcore:ListGateways',
        'bedrock-agentcore:ListGatewayTargets',
        'bedrock-agentcore:SynchronizeGatewayTargets',
        'bedrock-agentcore:UpdateGateway',
        'bedrock-agentcore:UpdateGatewayTarget',
        'bedrock-agentcore:CreateWorkloadIdentity',
        'bedrock-agentcore:DeleteWorkloadIdentity',
        'bedrock-agentcore:GetWorkloadIdentity',
        'bedrock-agentcore:ListWorkloadIdentities'
      ],
      resources: ['*']
    }));

    gatewayHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'iam:CreateRole',
        'iam:GetRole',
        'iam:DeleteRole',
        'iam:PutRolePolicy',
        'iam:DeleteRolePolicy',
        'iam:ListRolePolicies',
        'iam:ListAttachedRolePolicies',
        'iam:DetachRolePolicy',
        'iam:PassRole'
      ],
      resources: [
        `arn:aws:iam::${cdk.Stack.of(this).account}:role/${gatewayName}-service-role`
      ]
    }));

    gatewayHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'apigateway:GET' // For fetching OpenAPI schema
      ],
      resources: [
        `arn:aws:apigateway:${cdk.Stack.of(this).region}::/restapis/${props.apiGatewayId}/*`
      ]
    }));

    // Custom Resource Provider
    const provider = new cr.Provider(this, 'GatewayProvider', {
      onEventHandler: gatewayHandlerFunction,
      logRetention: 7 // Keep logs for 7 days
    });

    // Custom Resource
    const gateway = new cdk.CustomResource(this, 'AgentCoreGateway', {
      serviceToken: provider.serviceToken,
      properties: {
        GatewayName: gatewayName,
        Description: 'QSR Ordering System - MCP Gateway exposing backend APIs as tools',
        ApiGatewayId: props.apiGatewayId,
        Stage: stage,
        Region: cdk.Stack.of(this).region,
        AccountId: cdk.Stack.of(this).account
      }
    });

    // Extract all outputs from Custom Resource
    this.gatewayId = gateway.getAttString('GatewayId');
    this.gatewayUrl = gateway.getAttString('GatewayUrl');

    // Outputs matching Python script format
    new cdk.CfnOutput(this, 'GatewayId', {
      value: gateway.getAttString('GatewayId'),
      description: 'AgentCore Gateway ID'
    });

    new cdk.CfnOutput(this, 'GatewayUrl', {
      value: gateway.getAttString('GatewayUrl'),
      description: 'AgentCore Gateway URL'
    });

    new cdk.CfnOutput(this, 'GatewayArn', {
      value: gateway.getAttString('GatewayArn'),
      description: 'AgentCore Gateway ARN'
    });

    new cdk.CfnOutput(this, 'GatewayRoleArn', {
      value: gateway.getAttString('GatewayRoleArn'),
      description: 'Gateway Service Role ARN'
    });

    new cdk.CfnOutput(this, 'TargetId', {
      value: gateway.getAttString('TargetId'),
      description: 'Gateway Target ID'
    });

    new cdk.CfnOutput(this, 'ApiGatewayId', {
      value: gateway.getAttString('ApiGatewayId'),
      description: 'Backend API Gateway ID'
    });

    new cdk.CfnOutput(this, 'ApiGatewayStage', {
      value: gateway.getAttString('ApiGatewayStage'),
      description: 'Backend API Gateway Stage'
    });

    new cdk.CfnOutput(this, 'Region', {
      value: gateway.getAttString('Region'),
      description: 'AWS Region'
    });

    new cdk.CfnOutput(this, 'AccountId', {
      value: gateway.getAttString('AccountId'),
      description: 'AWS Account ID'
    });

    new cdk.CfnOutput(this, 'DeploymentTimestamp', {
      value: gateway.getAttString('DeploymentTimestamp'),
      description: 'Deployment Timestamp (ISO 8601)'
    });

    new cdk.CfnOutput(this, 'ToolFiltersCount', {
      value: gateway.getAttString('ToolFiltersCount'),
      description: 'Number of Tool Filters'
    });

    new cdk.CfnOutput(this, 'ToolOverridesCount', {
      value: gateway.getAttString('ToolOverridesCount'),
      description: 'Number of Tool Overrides'
    });
  }
}
