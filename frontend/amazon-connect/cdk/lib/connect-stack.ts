import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as connect from 'aws-cdk-lib/aws-connect';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as path from 'path';

export class ConnectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -------------------------------------------------------
    // Cross-stack imports
    // -------------------------------------------------------
    const customersTableName = cdk.Fn.importValue('QSR-CustomersTableName');
    const customersTableArn = cdk.Fn.importValue('QSR-CustomersTableArn');
    const runtimeRoleArn = cdk.Fn.importValue('QSRAgentCoreRuntimeRoleArn');

    const runtimeRole = iam.Role.fromRoleArn(
      this,
      'AgentCoreRuntimeRole',
      runtimeRoleArn,
    );

    // -------------------------------------------------------
    // Task 4.2: Sessions Table
    // -------------------------------------------------------
    const sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      tableName: 'QSR-Sessions',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Grant the AgentCore Runtime role read access (covers GetItem)
    // and DeleteItem for atomic single-use token consumption
    sessionsTable.grantReadData(runtimeRole);
    sessionsTable.grant(runtimeRole, 'dynamodb:DeleteItem');

    new cdk.CfnOutput(this, 'SessionsTableName', {
      value: sessionsTable.tableName,
      description: 'Sessions table name',
      exportName: 'QSR-SessionsTableName',
    });

    new cdk.CfnOutput(this, 'SessionsTableArn', {
      value: sessionsTable.tableArn,
      description: 'Sessions table ARN',
      exportName: 'QSR-SessionsTableArn',
    });

    // -------------------------------------------------------
    // Task 4.3: AppSync Events API (real-time audio bus)
    // -------------------------------------------------------
    const eventsApi = new appsync.CfnApi(this, 'EventsApi', {
      name: 'QSR-AudioBus',
      eventConfig: {
        authProviders: [
          { authType: 'API_KEY' },
        ],
        connectionAuthModes: [
          { authType: 'API_KEY' },
        ],
        defaultPublishAuthModes: [
          { authType: 'API_KEY' },
        ],
        defaultSubscribeAuthModes: [
          { authType: 'API_KEY' },
        ],
      },
    });

    new appsync.CfnChannelNamespace(this, 'SessionChannelNamespace', {
      apiId: eventsApi.attrApiId,
      name: 'session',
    });

    const eventsApiKey = new appsync.CfnApiKey(this, 'EventsApiKey', {
      apiId: eventsApi.attrApiId,
    });

    // attrDns is an IResolvable — use Fn.getAtt to extract nested properties
    const eventsHttpEndpoint = cdk.Fn.getAtt(eventsApi.logicalId, 'Dns.Http').toString();
    const eventsRealtimeEndpoint = cdk.Fn.getAtt(eventsApi.logicalId, 'Dns.Realtime').toString();

    new cdk.CfnOutput(this, 'AppSyncEventsEndpoint', {
      value: eventsHttpEndpoint,
      description: 'AppSync Events API HTTP endpoint',
      exportName: 'QSR-AppSyncEventsEndpoint',
    });

    new cdk.CfnOutput(this, 'AppSyncEventsRealtimeEndpoint', {
      value: eventsRealtimeEndpoint,
      description: 'AppSync Events API Realtime endpoint',
      exportName: 'QSR-AppSyncEventsRealtimeEndpoint',
    });

    // -------------------------------------------------------
    // Log groups — explicit creation with 1-day retention and DESTROY policy
    // Prevents orphaned log groups on failed deployments
    // -------------------------------------------------------
    const sessionLambdaLogGroup = new logs.LogGroup(this, 'SessionLambdaLogGroup', {
      logGroupName: '/aws/lambda/QSR-ConnectSessionLambda',
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const mediaBridgeLambdaLogGroup = new logs.LogGroup(this, 'MediaBridgeLambdaLogGroup', {
      logGroupName: '/aws/lambda/QSR-ConnectMediaBridgeLambda',
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // -------------------------------------------------------
    // Task 5.2: Session Lambda
    // -------------------------------------------------------
    const customersTable = dynamodb.Table.fromTableAttributes(this, 'CustomersTable', {
      tableArn: customersTableArn,
      globalIndexes: ['PhoneNumberIndex'],
    });

    const sessionLambda = new lambda.Function(this, 'SessionLambda', {
      functionName: 'QSR-ConnectSessionLambda',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/session')),
      logGroup: sessionLambdaLogGroup,
      environment: {
        CUSTOMERS_TABLE_NAME: customersTableName,
        SESSIONS_TABLE_NAME: sessionsTable.tableName,
        PHONE_NUMBER_GSI_NAME: 'PhoneNumberIndex',
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      description: 'Looks up caller by phone number, creates session token, returns session info to Connect contact flow',
    });

    // Grant read access to Customers Table (including GSI)
    customersTable.grantReadData(sessionLambda);

    // Grant read/write access to Sessions Table
    sessionsTable.grantReadWriteData(sessionLambda);

    // -------------------------------------------------------
    // Task 7.2: Media Bridge Lambda
    // -------------------------------------------------------
    const mediaBridgeLambda = new lambda.Function(this, 'MediaBridgeLambda', {
      functionName: 'QSR-ConnectMediaBridgeLambda',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/media-bridge')),
      logGroup: mediaBridgeLambdaLogGroup,
      environment: {
        APPSYNC_HTTP_ENDPOINT: eventsHttpEndpoint,
        APPSYNC_REALTIME_ENDPOINT: eventsRealtimeEndpoint,
        APPSYNC_API_KEY: eventsApiKey.attrApiKey,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      description: 'Bridges bidirectional audio between Amazon Connect media streams and AppSync Events API',
    });

    // Grant Media Bridge Lambda permission to publish/subscribe to AppSync Events API
    mediaBridgeLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'appsync:GraphQL',
        'appsync:Connect',
        'appsync:Publish',
        'appsync:Subscribe',
      ],
      resources: [
        `arn:aws:appsync:${this.region}:${this.account}:apis/${eventsApi.attrApiId}/*`,
      ],
    }));

    // -------------------------------------------------------
    // Task 4.4: Amazon Connect Instance, Phone Number, Contact Flow
    // -------------------------------------------------------
    const connectInstance = new connect.CfnInstance(this, 'ConnectInstance', {
      identityManagementType: 'CONNECT_MANAGED',
      instanceAlias: `qsr-ordering-${cdk.Aws.ACCOUNT_ID}`,
      attributes: {
        inboundCalls: true,
        outboundCalls: false,
        contactflowLogs: true,
        autoResolveBestVoices: true,
        earlyMedia: true,
      },
    });
    connectInstance.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Custom resource to ensure Connect instance cleanup on rollback/delete.
    // AWS::Connect::Instance doesn't reliably delete during CloudFormation rollback,
    // leaving orphaned instances. This custom resource calls connect:DeleteInstance
    // on Delete events (including rollback), ensuring no orphans.
    const connectCleanupLogGroup = new logs.LogGroup(this, 'ConnectCleanupFnLogGroup', {
      logGroupName: '/aws/lambda/QSR-ConnectInstanceCleanup',
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const connectCleanupFn = new lambda.Function(this, 'ConnectCleanupFn', {
      functionName: 'QSR-ConnectInstanceCleanup',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 128,
      logGroup: connectCleanupLogGroup,
      code: lambda.Code.fromInline(`
const { ConnectClient, DeleteInstanceCommand } = require("@aws-sdk/client-connect");
const https = require("https");
const url = require("url");

exports.handler = async (event, context) => {
  console.log("Event:", JSON.stringify(event));
  const instanceId = event.ResourceProperties.InstanceId;
  let status = "SUCCESS";
  let reason = "OK";

  if (event.RequestType === "Delete") {
    try {
      const client = new ConnectClient({});
      await client.send(new DeleteInstanceCommand({ InstanceId: instanceId }));
      console.log("Connect instance deleted:", instanceId);
    } catch (err) {
      console.log("Delete failed (may already be gone):", err.message);
      // Don't fail — instance may already be deleted by CloudFormation
    }
  }

  // Send response to CloudFormation
  const responseBody = JSON.stringify({
    Status: status,
    Reason: reason,
    PhysicalResourceId: instanceId || "none",
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
  });

  const parsedUrl = url.parse(event.ResponseURL);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: "PUT",
    headers: { "Content-Type": "", "Content-Length": responseBody.length },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      console.log("CFN response status:", res.statusCode);
      resolve();
    });
    req.on("error", (err) => {
      console.log("CFN response error:", err);
      resolve(); // Don't fail the Lambda
    });
    req.write(responseBody);
    req.end();
  });
};
`),
      description: 'Cleans up Connect instance on stack delete/rollback',
    });

    connectCleanupFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['connect:DeleteInstance'],
      resources: [`arn:aws:connect:${this.region}:${this.account}:instance/*`],
    }));

    const connectCleanup = new cdk.CustomResource(this, 'ConnectInstanceCleanup', {
      serviceToken: connectCleanupFn.functionArn,
      properties: {
        InstanceId: connectInstance.attrId,
      },
    });
    connectCleanup.node.addDependency(connectInstance);

    const phoneNumber = new connect.CfnPhoneNumber(this, 'PhoneNumber', {
      targetArn: connectInstance.attrArn,
      countryCode: 'US',
      type: 'TOLL_FREE',
    });

    // Contact flow JSON definition using Amazon Connect Flow Language.
    // Reference: https://docs.aws.amazon.com/connect/latest/APIReference/flow-language-example.html
    // Identifiers must be UUID-format. Transitions need NextAction, Errors[], Conditions[].
    // InvokeLambdaFunction max timeout is 8 seconds.
    const contactFlowContent = {
      Version: '2019-10-30',
      StartAction: 'ac100001-0001-0001-0001-000000000001',
      Metadata: {},
      Actions: [
        {
          Identifier: 'ac100001-0001-0001-0001-000000000001',
          Type: 'MessageParticipant',
          Parameters: {
            Text: 'Welcome to our ordering service. Please hold while we connect you.',
          },
          Transitions: {
            NextAction: 'ac100002-0002-0002-0002-000000000002',
            Errors: [
              { NextAction: 'ac100008-0008-0008-0008-000000000008', ErrorType: 'NoMatchingError' },
            ],
            Conditions: [],
          },
        },
        {
          Identifier: 'ac100002-0002-0002-0002-000000000002',
          Type: 'InvokeLambdaFunction',
          Parameters: {
            LambdaFunctionARN: sessionLambda.functionArn,
            InvocationTimeLimitSeconds: '8',
          },
          Transitions: {
            NextAction: 'ac100003-0003-0003-0003-000000000003',
            Errors: [
              { NextAction: 'ac100008-0008-0008-0008-000000000008', ErrorType: 'NoMatchingError' },
            ],
            Conditions: [],
          },
        },
        {
          Identifier: 'ac100003-0003-0003-0003-000000000003',
          Type: 'UpdateContactAttributes',
          Parameters: {
            Attributes: {
              sessionId: '$.External.sessionId',
              customerName: '$.External.customerName',
              sessionToken: '$.External.sessionToken',
            },
            TargetContact: 'Current',
          },
          Transitions: {
            NextAction: 'ac100004-0004-0004-0004-000000000004',
            Errors: [
              { NextAction: 'ac100008-0008-0008-0008-000000000008', ErrorType: 'NoMatchingError' },
            ],
            Conditions: [],
          },
        },
        {
          Identifier: 'ac100004-0004-0004-0004-000000000004',
          Type: 'InvokeLambdaFunction',
          Parameters: {
            LambdaFunctionARN: mediaBridgeLambda.functionArn,
            InvocationTimeLimitSeconds: '8',
          },
          Transitions: {
            NextAction: 'ac100007-0007-0007-0007-000000000007',
            Errors: [
              { NextAction: 'ac100007-0007-0007-0007-000000000007', ErrorType: 'NoMatchingError' },
            ],
            Conditions: [],
          },
        },
        {
          Identifier: 'ac100007-0007-0007-0007-000000000007',
          Type: 'MessageParticipant',
          Parameters: {
            Text: 'Thank you for calling. Goodbye!',
          },
          Transitions: {
            NextAction: 'ac100009-0009-0009-0009-000000000009',
            Errors: [
              { NextAction: 'ac100009-0009-0009-0009-000000000009', ErrorType: 'NoMatchingError' },
            ],
            Conditions: [],
          },
        },
        {
          Identifier: 'ac100008-0008-0008-0008-000000000008',
          Type: 'MessageParticipant',
          Parameters: {
            Text: 'We are sorry, something went wrong. Please try again later.',
          },
          Transitions: {
            NextAction: 'ac100009-0009-0009-0009-000000000009',
            Errors: [
              { NextAction: 'ac100009-0009-0009-0009-000000000009', ErrorType: 'NoMatchingError' },
            ],
            Conditions: [],
          },
        },
        {
          Identifier: 'ac100009-0009-0009-0009-000000000009',
          Type: 'DisconnectParticipant',
          Parameters: {},
          Transitions: {},
        },
      ],
    };

    const contactFlow = new connect.CfnContactFlow(this, 'ContactFlow', {
      instanceArn: connectInstance.attrArn,
      name: 'QSR-OrderingFlow',
      type: 'CONTACT_FLOW',
      content: JSON.stringify(contactFlowContent),
    });

    new cdk.CfnOutput(this, 'ConnectInstanceArn', {
      value: connectInstance.attrArn,
      description: 'Amazon Connect instance ARN',
    });

    new cdk.CfnOutput(this, 'ConnectPhoneNumber', {
      value: phoneNumber.attrAddress,
      description: 'Provisioned phone number',
    });

    new cdk.CfnOutput(this, 'ContactFlowArn', {
      value: contactFlow.attrContactFlowArn,
      description: 'Contact flow ARN',
    });

    // -------------------------------------------------------
    // Associate phone number with contact flow
    // No CloudFormation resource exists for this — use SDK call
    // -------------------------------------------------------
    new cr.AwsCustomResource(this, 'PhoneNumberContactFlowAssociation', {
      onCreate: {
        service: 'Connect',
        action: 'associatePhoneNumberContactFlow',
        parameters: {
          InstanceId: connectInstance.attrId,
          PhoneNumberId: phoneNumber.attrPhoneNumberArn,
          ContactFlowId: contactFlow.attrContactFlowArn,
        },
        physicalResourceId: cr.PhysicalResourceId.of('PhoneNumberContactFlowAssociation'),
      },
      onDelete: {
        service: 'Connect',
        action: 'disassociatePhoneNumberContactFlow',
        parameters: {
          InstanceId: connectInstance.attrId,
          PhoneNumberId: phoneNumber.attrPhoneNumberArn,
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: [
            'connect:AssociatePhoneNumberContactFlow',
            'connect:DisassociatePhoneNumberContactFlow',
          ],
          resources: ['*'],
        }),
      ]),
    });

    // -------------------------------------------------------
    // Task 5.2: Connect ↔ Session Lambda association
    // -------------------------------------------------------
    new connect.CfnIntegrationAssociation(this, 'SessionLambdaAssociation', {
      instanceId: connectInstance.attrArn,
      integrationType: 'LAMBDA_FUNCTION',
      integrationArn: sessionLambda.functionArn,
    });

    // -------------------------------------------------------
    // Task 7.2: Connect ↔ Media Bridge Lambda association
    // -------------------------------------------------------
    new connect.CfnIntegrationAssociation(this, 'MediaBridgeLambdaAssociation', {
      instanceId: connectInstance.attrArn,
      integrationType: 'LAMBDA_FUNCTION',
      integrationArn: mediaBridgeLambda.functionArn,
    });
  }
}
