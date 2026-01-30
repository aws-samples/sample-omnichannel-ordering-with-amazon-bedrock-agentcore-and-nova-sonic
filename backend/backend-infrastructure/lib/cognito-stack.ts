import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface CognitoStackProps extends cdk.StackProps {
  apiGatewayArn: string;
}

export class CognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly authenticatedRole: iam.Role;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    // Parameters for initial user creation
    const userEmail = new cdk.CfnParameter(this, 'UserEmail', {
      type: 'String',
      description: 'Email address for initial AppUser creation',
      constraintDescription: 'Must be a valid email address',
    });

    const userName = new cdk.CfnParameter(this, 'UserName', {
      type: 'String',
      description: 'Full name for initial AppUser creation',
      constraintDescription: 'Must be a valid name',
    });

    // Auto-generate unique customer ID for the initial user
    const customerId = `cust-${cdk.Names.uniqueId(this).toLowerCase().substring(0, 8)}`;

    // Create User Pool with email authentication
    this.userPool = new cognito.UserPool(this, 'QSRUserPool', {
      userPoolName: 'QSR-UserPool',
      selfSignUpEnabled: false, // Admin creates users
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        fullname: {
          required: true,
          mutable: true,
        },
      },
      customAttributes: {
        customerId: new cognito.StringAttribute({
          mutable: false, // Customer ID should not change
        }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      standardThreatProtectionMode: cognito.StandardThreatProtectionMode.FULL_FUNCTION,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development
    });

    // Create User Pool Client
    this.userPoolClient = this.userPool.addClient('QSRWebClient', {
      userPoolClientName: 'QSR-WebClient',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false, // Public client for web apps
      preventUserExistenceErrors: true,
    });

    // Create Identity Pool
    this.identityPool = new cognito.CfnIdentityPool(this, 'QSRIdentityPool', {
      identityPoolName: 'QSR-IdentityPool',
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    // Create IAM role for authenticated users with AgentCore WebSocket permissions
    this.authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: 'Role for authenticated Cognito users with AgentCore access',
    });

    // Add AgentCore WebSocket permissions (SigV4 authentication)
    // Note: In production, scope this to specific agent ARN
    this.authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock-agentcore:InvokeAgent',
          'bedrock-agentcore:InvokeAgentStream',
          'bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream',
        ],
        resources: ['*'],
      })
    );

    // Add API Gateway invoke permissions
    this.authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['execute-api:Invoke'],
        resources: [props.apiGatewayArn],
      })
    );

    // Add AWS Location Service permissions for Map and Place Index access
    // Frontend will use Cognito Identity Pool credentials to access these resources
    // Note: In production, scope this to specific map and place index ARNs
    this.authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'geo:GetMapStyleDescriptor',           // Map style descriptor for rendering
          'geo:GetMapSprites',                   // Map sprites for icons
          'geo:GetMapGlyphs',                    // Map glyphs for text rendering
          'geo:GetMapTile',                      // Map tiles for rendering
          'geo:SearchPlaceIndexForText',         // Full text search for addresses
          'geo:SearchPlaceIndexForSuggestions',  // Auto-complete suggestions
          'geo:GetPlace',                        // Get place details from PlaceId
        ],
        resources: ['*'],
      })
    );

    // Attach role to Identity Pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: this.authenticatedRole.roleArn,
      },
    });

    // Create AppUsersGroup
    const appUsersGroup = new cognito.CfnUserPoolGroup(this, 'AppUsersGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'AppUsersGroup',
      description: 'Group for application users',
    });

    // Create initial AppUser with name and customerId
    const appUser = new cognito.CfnUserPoolUser(this, 'AppUser', {
      userPoolId: this.userPool.userPoolId,
      username: 'AppUser',
      userAttributes: [
        {
          name: 'email',
          value: userEmail.valueAsString,
        },
        {
          name: 'email_verified',
          value: 'true',
        },
        {
          name: 'name',
          value: userName.valueAsString,
        },
        {
          name: 'custom:customerId',
          value: customerId,
        },
      ],
      desiredDeliveryMediums: ['EMAIL'],
      forceAliasCreation: false,
    });

    // Add AppUser to AppUsersGroup
    const userToGroupAttachment = new cognito.CfnUserPoolUserToGroupAttachment(
      this,
      'AppUserToGroupAttachment',
      {
        userPoolId: this.userPool.userPoolId,
        groupName: appUsersGroup.groupName!,
        username: appUser.username!,
      }
    );

    // Ensure group is created before user attachment
    userToGroupAttachment.addDependency(appUsersGroup);
    userToGroupAttachment.addDependency(appUser);

    // Stack Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'QSR-UserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'QSR-UserPoolClientId',
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: 'QSR-IdentityPoolId',
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS Region',
      exportName: 'QSR-Region',
    });

    new cdk.CfnOutput(this, 'AuthenticatedRoleArn', {
      value: this.authenticatedRole.roleArn,
      description: 'IAM Role ARN for authenticated users',
      exportName: 'QSR-AuthenticatedRoleArn',
    });

    new cdk.CfnOutput(this, 'AppUserCustomerId', {
      value: customerId,
      description: 'Auto-generated Customer ID for AppUser (use in synthetic data)',
      exportName: 'QSR-AppUserCustomerId',
    });

    new cdk.CfnOutput(this, 'AppUserName', {
      value: userName.valueAsString,
      description: 'Name of the initial AppUser',
      exportName: 'QSR-AppUserName',
    });

    new cdk.CfnOutput(this, 'AppUserEmail', {
      value: userEmail.valueAsString,
      description: 'Email of the initial AppUser',
      exportName: 'QSR-AppUserEmail',
    });

    // Suppress cdk-nag findings
    // AwsSolutions-COG2: MFA is not enabled for this demo application
    // In production, MFA should be enabled for enhanced security
    NagSuppressions.addResourceSuppressions(
      this.userPool,
      [
        {
          id: 'AwsSolutions-COG2',
          reason: 'MFA is not enabled for this demo application. In production deployments, MFA should be enabled for enhanced security.',
        },
      ]
    );

    // AwsSolutions-IAM5: Wildcard permissions are required for AgentCore and Location Services
    // These services require wildcard permissions as specific resource ARNs are not known at deployment time
    NagSuppressions.addResourceSuppressions(
      this.authenticatedRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard permissions are required for: 1) AgentCore services (agent ARN not known at deployment), 2) AWS Location Services (map and place index ARNs not known at deployment). In production, these should be scoped to specific resource ARNs.',
        },
      ],
      true
    );
  }
}
