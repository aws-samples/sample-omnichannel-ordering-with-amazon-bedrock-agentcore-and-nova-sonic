import * as cdk from 'aws-cdk-lib';
import * as bedrockagentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface RuntimeStackProps extends cdk.StackProps {
  // Dependencies from InfraStack
  ecrRepository: ecr.Repository;
  codeBuildProject: codebuild.Project;
  sourceBucket: s3.Bucket;
  agentCoreRuntimeRole: iam.Role;
}

export class RuntimeStack extends cdk.Stack {
  public readonly runtimeArn: string;
  public readonly webSocketEndpointUrl: string;

  constructor(scope: Construct, id: string, props: RuntimeStackProps) {
    super(scope, id, props);

    // Parameter for AgentCore Gateway URL
    const agentcoreGatewayUrl = new cdk.CfnParameter(this, 'AgentCoreGatewayUrl', {
      type: 'String',
      description: 'URL of the AgentCore Gateway for MCP tool discovery',
      constraintDescription: 'Must be a valid HTTPS URL',
    });

    // Optional parameter for Sessions Table (set when deploying with --with-connect)
    const sessionsTableName = new cdk.CfnParameter(this, 'SessionsTableName', {
      type: 'String',
      default: '',
      description: 'Name of the DynamoDB Sessions Table for Connect auth. Leave empty to disable Connect auth.',
    });

    // Condition: true when SessionsTableName is provided
    const hasSessionsTableName = new cdk.CfnCondition(this, 'HasSessionsTableName', {
      expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(sessionsTableName.valueAsString, '')),
    });

    // Upload agent directory to S3 bucket for CodeBuild access
    const sourceDeployment = new s3deploy.BucketDeployment(this, 'AgentSourceDeployment', {
      sources: [s3deploy.Source.asset('../agent', {
        exclude: [
          'venv/**',           // Python virtual environment
          '__pycache__/**',    // Python cache files
          '*.pyc',             // Compiled Python files
          '.git/**',           // Git files
          'node_modules/**',   // Node modules if any
          '.DS_Store',         // macOS files
          '*.log',             // Log files
          'build/**',          // Build artifacts
          'dist/**',           // Distribution files
        ]
      })], // Upload agent/ directory
      destinationBucket: props.sourceBucket,
      destinationKeyPrefix: 'agent-source/', // Use trailing slash for directory
      extract: true, // Extract files so CodeBuild can access them directly
      prune: false, // Don't delete existing objects
      retainOnDelete: false, // Clean up on stack deletion
      memoryLimit: 512, // Increase memory for deployment
    });

    // Step 2: Trigger CodeBuild to build the Docker image
    const buildTrigger = new cr.AwsCustomResource(this, 'TriggerCodeBuild', {
      onCreate: {
        service: 'CodeBuild',
        action: 'startBuild',
        parameters: {
          projectName: props.codeBuildProject.projectName,
        },
        physicalResourceId: cr.PhysicalResourceId.of(`build-${Date.now()}`),
      },
      onUpdate: {
        service: 'CodeBuild',
        action: 'startBuild',
        parameters: {
          projectName: props.codeBuildProject.projectName,
        },
        physicalResourceId: cr.PhysicalResourceId.of(`build-${Date.now()}`),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds'],
          resources: [props.codeBuildProject.projectArn],
        }),
      ]),
      // Add timeout to prevent hanging
      timeout: cdk.Duration.minutes(5),
    });

    // Ensure build happens after source upload
    buildTrigger.node.addDependency(sourceDeployment);

    // Step 3: Wait for build to complete using a custom Lambda
    const buildWaiterFunction = new lambda.Function(this, 'BuildWaiterFunction', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const { CodeBuildClient, BatchGetBuildsCommand } = require('@aws-sdk/client-codebuild');

        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event));
          
          if (event.RequestType === 'Delete') {
            return sendResponse(event, 'SUCCESS', { Status: 'DELETED' });
          }
          
          const buildId = event.ResourceProperties.BuildId;
          const maxWaitMinutes = 14; // Lambda timeout is 15 min, leave 1 min buffer
          const pollIntervalSeconds = 30;
          
          console.log('Waiting for build:', buildId);
          
          const client = new CodeBuildClient({});
          const startTime = Date.now();
          const maxWaitMs = maxWaitMinutes * 60 * 1000;
          
          while (Date.now() - startTime < maxWaitMs) {
            try {
              const response = await client.send(new BatchGetBuildsCommand({ ids: [buildId] }));
              const build = response.builds[0];
              const status = build.buildStatus;
              
              console.log(\`Build status: \${status}\`);
              
              if (status === 'SUCCEEDED') {
                return await sendResponse(event, 'SUCCESS', { Status: 'SUCCEEDED' });
              } else if (['FAILED', 'FAULT', 'TIMED_OUT', 'STOPPED'].includes(status)) {
                return await sendResponse(event, 'FAILED', {}, \`Build failed with status: \${status}\`);
              }
              
              await new Promise(resolve => setTimeout(resolve, pollIntervalSeconds * 1000));
              
            } catch (error) {
              console.error('Error:', error);
              return await sendResponse(event, 'FAILED', {}, error.message);
            }
          }
          
          return await sendResponse(event, 'FAILED', {}, \`Build timeout after \${maxWaitMinutes} minutes\`);
        };

        async function sendResponse(event, status, data, reason) {
          const responseBody = JSON.stringify({
            Status: status,
            Reason: reason || \`See CloudWatch Log Stream: \${event.LogStreamName}\`,
            PhysicalResourceId: event.PhysicalResourceId || event.RequestId,
            StackId: event.StackId,
            RequestId: event.RequestId,
            LogicalResourceId: event.LogicalResourceId,
            Data: data
          });
          
          console.log('Response:', responseBody);
          
          const https = require('https');
          const url = require('url');
          const parsedUrl = url.parse(event.ResponseURL);
          
          return new Promise((resolve, reject) => {
            const options = {
              hostname: parsedUrl.hostname,
              port: 443,
              path: parsedUrl.path,
              method: 'PUT',
              headers: {
                'Content-Type': '',
                'Content-Length': responseBody.length
              }
            };
            
            const request = https.request(options, (response) => {
              console.log(\`Status: \${response.statusCode}\`);
              resolve(data);
            });
            
            request.on('error', (error) => {
              console.error('Error:', error);
              reject(error);
            });
            
            request.write(responseBody);
            request.end();
          });
        }
      `),
      timeout: cdk.Duration.minutes(15), // Lambda max timeout is 15 minutes
      memorySize: 256,
    });

    buildWaiterFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['codebuild:BatchGetBuilds'],
      resources: [props.codeBuildProject.projectArn],
    }));

    // Custom resource that invokes the waiter Lambda
    const buildWaiter = new cdk.CustomResource(this, 'BuildWaiter', {
      serviceToken: buildWaiterFunction.functionArn,
      properties: {
        BuildId: buildTrigger.getResponseField('build.id'),
      },
    });

    buildWaiter.node.addDependency(buildTrigger);

    // Create the AgentCore Runtime with HTTP protocol and Cognito authentication
    const agentRuntime = new bedrockagentcore.CfnRuntime(this, 'AgentRuntime', {
      agentRuntimeName: 'qsr_ordering_agent_runtime',
      description: 'QSR ordering agent with Nova Sonic v2 and WebSocket protocol',
      roleArn: props.agentCoreRuntimeRole.roleArn,

      // Container configuration
      agentRuntimeArtifact: {
        containerConfiguration: {
          containerUri: `${props.ecrRepository.repositoryUri}:latest`,
        },
      },

      // Network configuration - PUBLIC for internet access
      networkConfiguration: {
        networkMode: 'PUBLIC',
      },

      // Protocol configuration - HTTP for WebSocket support
      protocolConfiguration: 'HTTP',

      // Environment variables for agent configuration
      environmentVariables: {
        LOG_LEVEL: 'INFO',
        AGENTCORE_GATEWAY_URL: agentcoreGatewayUrl.valueAsString,
        IMAGE_VERSION: new Date().toISOString(),
        SESSIONS_TABLE_NAME: cdk.Fn.conditionIf(hasSessionsTableName.logicalId, sessionsTableName.valueAsString, cdk.Aws.NO_VALUE).toString(),
      },

      tags: {
        Environment: 'dev',
        Application: 'qsr-ordering-agent',
        Protocol: 'WebSocket',
      },
    });

    // Ensure AgentCore runtime is created after build completes
    agentRuntime.node.addDependency(buildWaiter);

    // Store outputs for access
    this.runtimeArn = agentRuntime.attrAgentRuntimeArn;
    // For WebSocket protocol, the endpoint URL is constructed differently
    this.webSocketEndpointUrl = `wss://${agentRuntime.agentRuntimeName}.agentcore.bedrock.${cdk.Aws.REGION}.amazonaws.com`;

    // Stack Outputs
    new cdk.CfnOutput(this, 'AgentRuntimeArn', {
      value: this.runtimeArn,
      description: 'ARN of the AgentCore Runtime',
      exportName: 'QSRAgentRuntimeArn',
    });

    new cdk.CfnOutput(this, 'WebSocketEndpointUrl', {
      value: this.webSocketEndpointUrl,
      description: 'WebSocket endpoint URL for frontend connections',
      exportName: 'QSRWebSocketEndpointUrl',
    });

    new cdk.CfnOutput(this, 'EndpointName', {
      value: 'DEFAULT',
      description: 'Endpoint name for WebSocket connections',
      exportName: 'QSREndpointName',
    });

    new cdk.CfnOutput(this, 'Region', {
      value: cdk.Aws.REGION,
      description: 'AWS region for the deployment',
      exportName: 'QSRRegion',
    });

    // Suppress cdk-nag findings for CDK-managed resources
    // These are Lambda functions and roles created by CDK for custom resources (BucketDeployment, AwsCustomResource)
    // Using stack-level suppressions with wildcard patterns to work across all deployments
    
    // Suppress findings for all CDK-managed Lambda functions in this stack
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'CDK-managed Lambda functions use AWS managed policy AWSLambdaBasicExecutionRole. These are CDK internal resources for custom resources (BucketDeployment, AwsCustomResource).',
        appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'CDK-managed Lambda functions require wildcard permissions for S3 operations (BucketDeployment) and other AWS service operations. These are CDK internal resources with permissions scoped as narrowly as possible.',
        appliesTo: [
          'Action::s3:GetBucket*',
          'Action::s3:GetObject*',
          'Action::s3:List*',
          'Action::s3:Abort*',
          'Action::s3:DeleteObject*',
          {
            regex: '/^Resource::arn:aws:s3:::cdk-.*-assets-.*$/g',
          },
          {
            regex: '/^Resource::<.*Bucket.*\\.Arn>/\\*$/g',
          },
        ],
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'CDK-managed Lambda functions use the runtime version specified by CDK. These are CDK internal resources that will be updated when CDK updates its managed runtimes.',
      },
    ]);
  }
}