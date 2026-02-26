#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ConnectStack } from '../lib/connect-stack';

const app = new cdk.App();

new ConnectStack(app, 'QSR-ConnectStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
