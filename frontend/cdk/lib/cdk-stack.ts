import * as cdk from 'aws-cdk-lib';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import { Construct } from 'constructs';

export interface FrontendStackProps extends cdk.StackProps {
  backendApiUrl?: string;
  userPoolId?: string;
  userPoolClientId?: string;
  identityPoolId?: string;
  runtimeArn?: string;
}

export class CdkStack extends cdk.Stack {
  public readonly amplifyAppId: string;
  public readonly amplifyAppUrl: string;

  constructor(scope: Construct, id: string, props?: FrontendStackProps) {
    super(scope, id, props);

    // Create Amplify App for manual deployment
    const amplifyApp = new amplify.CfnApp(this, 'FrontendApp', {
      name: 'qsr-ordering-frontend',
      description: 'QSR Voice Ordering Frontend Application',
      platform: 'WEB',
      
      // Environment variables for the app (optional)
      environmentVariables: props?.backendApiUrl ? [
        { name: 'VITE_API_URL', value: props.backendApiUrl },
        { name: 'VITE_USER_POOL_ID', value: props.userPoolId || '' },
        { name: 'VITE_CLIENT_ID', value: props.userPoolClientId || '' },
        { name: 'VITE_IDENTITY_POOL_ID', value: props.identityPoolId || '' },
        { name: 'VITE_RUNTIME_ARN', value: props.runtimeArn || '' }
      ] : undefined,
    });

    // Create main branch
    const mainBranch = new amplify.CfnBranch(this, 'MainBranch', {
      appId: amplifyApp.attrAppId,
      branchName: 'main',
      enableAutoBuild: false, // Manual deployment via CLI
      stage: 'PRODUCTION'
    });

    this.amplifyAppId = amplifyApp.attrAppId;
    this.amplifyAppUrl = `https://main.${amplifyApp.attrDefaultDomain}`;

    // Outputs
    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: this.amplifyAppId,
      description: 'Amplify App ID for manual deployment',
      exportName: 'FrontendAmplifyAppId'
    });

    new cdk.CfnOutput(this, 'AmplifyAppUrl', {
      value: this.amplifyAppUrl,
      description: 'Amplify Application URL',
      exportName: 'FrontendUrl'
    });

    new cdk.CfnOutput(this, 'DeploymentCommand', {
      value: `npm run deploy:amplify`,
      description: 'Command to deploy frontend to Amplify'
    });
  }
}
