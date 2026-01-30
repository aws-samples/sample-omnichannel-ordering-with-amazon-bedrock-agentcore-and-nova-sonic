import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export class InfraStack extends cdk.Stack {
  public readonly ecrRepository: ecr.Repository;
  public readonly codeBuildProject: codebuild.Project;
  public readonly sourceBucket: s3.Bucket;
  public readonly agentCoreRuntimeRole: iam.Role;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ECR Repository for agent container images
    this.ecrRepository = new ecr.Repository(this, 'QSRAgentRepository', {
      repositoryName: 'qsr-agent-repository',
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development
      emptyOnDelete: true, // Automatically empty repository on stack deletion
    });

    // S3 Bucket for agent source code uploads
    this.sourceBucket = new s3.Bucket(this, 'AgentSourceBucket', {
      bucketName: `qsr-agent-source-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true, // Require SSL/TLS for all requests
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development
      autoDeleteObjects: true, // For development
    });

    // IAM Role for CodeBuild with ECR push permissions
    const codeBuildRole = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: 'IAM role for CodeBuild to build and push agent container images',
      inlinePolicies: {
        CloudWatchLogsPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [
                `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/codebuild/*`,
              ],
            }),
          ],
        }),
        ECRPushPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ecr:BatchCheckLayerAvailability',
                'ecr:GetDownloadUrlForLayer',
                'ecr:BatchGetImage',
                'ecr:GetAuthorizationToken',
                'ecr:PutImage',
                'ecr:InitiateLayerUpload',
                'ecr:UploadLayerPart',
                'ecr:CompleteLayerUpload',
              ],
              resources: [this.ecrRepository.repositoryArn],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['ecr:GetAuthorizationToken'],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:GetObjectVersion',
              ],
              resources: [this.sourceBucket.arnForObjects('*')],
            }),
          ],
        }),
      },
    });

    // CodeBuild Project for ARM64 container builds
    this.codeBuildProject = new codebuild.Project(this, 'AgentBuildProject', {
      projectName: 'qsr-agent-build',
      description: 'Build ARM64 container image for QSR ordering agent',
      source: codebuild.Source.s3({
        bucket: this.sourceBucket,
        path: 'agent-source/', // Look in agent-source directory
      }),
      environment: {
        buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0, // Use ARM64 build environment
        computeType: codebuild.ComputeType.SMALL,
        privileged: true, // Required for Docker builds
        environmentVariables: {
          AWS_DEFAULT_REGION: {
            value: cdk.Aws.REGION,
          },
          AWS_ACCOUNT_ID: {
            value: cdk.Aws.ACCOUNT_ID,
          },
          IMAGE_REPO_NAME: {
            value: this.ecrRepository.repositoryName,
          },
          IMAGE_TAG: {
            value: 'latest',
          },
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
            ],
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'echo Building the Docker image for ARM64...',
              'docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG .', // Native ARM64 build, no platform flag needed
              'docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
            ],
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              'echo Pushing the Docker image...',
              'docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
              'echo Image pushed successfully',
            ],
          },
        },
      }),
      role: codeBuildRole,
      timeout: cdk.Duration.minutes(30),
    });

    // IAM Role for AgentCore Runtime with required permissions
    // Based on reference: samples/BidirectionalVoiceAgent/cdk/lib/backend.ts
    this.agentCoreRuntimeRole = new iam.Role(this, 'AgentCoreRuntimeRole', {
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'IAM role for AgentCore Runtime with permissions for Bedrock models, ECR, CloudWatch, X-Ray',
    });

    const region = cdk.Aws.REGION;
    const accountId = cdk.Aws.ACCOUNT_ID;

    // ECR Token Access
    this.agentCoreRuntimeRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECRTokenAccess',
        effect: iam.Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      })
    );

    // ECR Image Access
    this.agentCoreRuntimeRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECRImageAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:BatchGetImage',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchCheckLayerAvailability',
        ],
        resources: [this.ecrRepository.repositoryArn],
      })
    );

    // CloudWatch Logs - Describe Log Groups
    this.agentCoreRuntimeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:DescribeLogGroups'],
        resources: [`arn:aws:logs:${region}:${accountId}:log-group:*`],
      })
    );

    // CloudWatch Logs - Create Log Group and Describe Streams
    this.agentCoreRuntimeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup'],
        resources: [
          `arn:aws:logs:${region}:${accountId}:log-group:/aws/bedrock-agentcore/runtimes/*`,
        ],
      })
    );

    // CloudWatch Logs - Create Stream and Put Events
    this.agentCoreRuntimeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [
          `arn:aws:logs:${region}:${accountId}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*`,
        ],
      })
    );

    // CloudWatch Metrics
    this.agentCoreRuntimeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'bedrock-agentcore',
          },
        },
      })
    );

    // X-Ray Tracing
    this.agentCoreRuntimeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets',
        ],
        resources: ['*'],
      })
    );

    // Bedrock Model Invocation - All foundation models (including bidirectional streaming)
    this.agentCoreRuntimeRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BedrockModelInvocation',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:InvokeModelWithBidirectionalStream',
        ],
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          `arn:aws:bedrock:${region}:${accountId}:*`,
        ],
      })
    );

    // AgentCore Gateway Invocation - Required for MCP client to connect to Gateway
    this.agentCoreRuntimeRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowGatewayInvocation',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock-agentcore:InvokeGateway'],
        resources: [`arn:aws:bedrock-agentcore:${region}:${accountId}:gateway/*`],
      })
    );

    // Stack Outputs
    new cdk.CfnOutput(this, 'ECRRepositoryURI', {
      value: this.ecrRepository.repositoryUri,
      description: 'ECR Repository URI for agent container images',
      exportName: 'QSRAgentECRRepositoryURI',
    });

    new cdk.CfnOutput(this, 'CodeBuildProjectName', {
      value: this.codeBuildProject.projectName,
      description: 'CodeBuild project name for building agent containers',
      exportName: 'QSRAgentCodeBuildProjectName',
    });

    new cdk.CfnOutput(this, 'SourceBucketName', {
      value: this.sourceBucket.bucketName,
      description: 'S3 bucket name for agent source code uploads',
      exportName: 'QSRAgentSourceBucketName',
    });

    new cdk.CfnOutput(this, 'AgentCoreRuntimeRoleArn', {
      value: this.agentCoreRuntimeRole.roleArn,
      description: 'IAM role ARN for AgentCore Runtime',
      exportName: 'QSRAgentCoreRuntimeRoleArn',
    });

    // Suppress cdk-nag findings
    // AwsSolutions-S1: Server access logging is not enabled for this demo application
    // In production, enable server access logging for audit trails
    NagSuppressions.addResourceSuppressions(
      this.sourceBucket,
      [
        {
          id: 'AwsSolutions-S1',
          reason: 'Server access logging is not enabled for this demo application to minimize costs and complexity. In production deployments, server access logging should be enabled for audit trails.',
        },
      ]
    );

    // AwsSolutions-IAM5: Wildcard permissions are required for CodeBuild operations
    NagSuppressions.addResourceSuppressions(
      codeBuildRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard permissions are required for: 1) ECR GetAuthorizationToken (account-level operation), 2) S3 object access within the source bucket, 3) CloudWatch Logs for CodeBuild project logs, 4) CodeBuild report groups. These are scoped as narrowly as possible.',
          appliesTo: [
            'Resource::*',
            {
              regex: '/^Resource::<.*Bucket.*\\.Arn>/\\*$/g',
            },
            'Resource::arn:aws:logs:<AWS::Region>:<AWS::AccountId>:log-group:/aws/codebuild/*',
            'Action::s3:GetBucket*',
            'Action::s3:GetObject*',
            'Action::s3:List*',
            {
              regex: '/^Resource::arn:aws:logs:.*:log-group:/aws/codebuild/.*:\\*$/g',
            },
            {
              regex: '/^Resource::arn:aws:codebuild:.*:report-group/.*-\\*$/g',
            },
          ],
        },
      ],
      true
    );

    // AwsSolutions-CB4: KMS encryption is not enabled for this demo application
    // In production, enable KMS encryption for build artifacts
    NagSuppressions.addResourceSuppressions(
      this.codeBuildProject,
      [
        {
          id: 'AwsSolutions-CB4',
          reason: 'KMS encryption is not enabled for this demo application to minimize costs. In production deployments, KMS encryption should be enabled for build artifacts.',
        },
      ]
    );

    // AwsSolutions-IAM5: Wildcard permissions are required for AgentCore Runtime operations
    NagSuppressions.addResourceSuppressions(
      this.agentCoreRuntimeRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard permissions are required for: 1) ECR GetAuthorizationToken (account-level), 2) CloudWatch Logs operations (runtime creates log groups dynamically), 3) CloudWatch Metrics (namespace-scoped), 4) X-Ray tracing (account-level), 5) Bedrock foundation models (cross-region access), 6) AgentCore Gateway invocation (gateway ARN not known at deployment). These are scoped as narrowly as possible with conditions where applicable.',
          appliesTo: [
            'Resource::*',
            'Resource::arn:aws:logs:<AWS::Region>:<AWS::AccountId>:log-group:*',
            'Resource::arn:aws:logs:<AWS::Region>:<AWS::AccountId>:log-group:/aws/bedrock-agentcore/runtimes/*',
            'Resource::arn:aws:logs:<AWS::Region>:<AWS::AccountId>:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*',
            'Resource::arn:aws:bedrock:*::foundation-model/*',
            'Resource::arn:aws:bedrock:<AWS::Region>:<AWS::AccountId>:*',
            'Resource::arn:aws:bedrock-agentcore:<AWS::Region>:<AWS::AccountId>:gateway/*',
          ],
        },
      ],
      true
    );
  }
}