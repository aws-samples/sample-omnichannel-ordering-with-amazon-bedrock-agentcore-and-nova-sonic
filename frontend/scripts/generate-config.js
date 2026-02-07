#!/usr/bin/env node
/**
 * Generate .env.local from CDK deployment outputs
 * 
 * This script reads the cdk-outputs/ folder and extracts configuration values
 * to create a .env.local file for the frontend build.
 * 
 * This ensures:
 * - No sensitive data is committed to the repository
 * - Configuration is automatically synced with deployment
 * - Each deployment has its own unique configuration
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CDK_OUTPUTS_DIR = join(__dirname, '../../cdk-outputs');
const ENV_FILE = join(__dirname, '../.env.local');

console.log('🔧 Generating frontend configuration from CDK outputs...\n');

try {
  // Check if cdk-outputs directory exists
  if (!existsSync(CDK_OUTPUTS_DIR)) {
    console.warn('⚠️  Warning: cdk-outputs/ directory not found');
    console.warn('   Please deploy the backend infrastructure first');
    console.warn('   Run: ./deploy-all.sh --user-email your-email@example.com --user-name "Your Name"\n');
    process.exit(1);
  }

  // Read backend infrastructure outputs
  const backendOutputsPath = join(CDK_OUTPUTS_DIR, 'backend-infrastructure.json');
  if (!existsSync(backendOutputsPath)) {
    console.error('❌ Error: backend-infrastructure.json not found');
    console.error('   Please deploy the backend infrastructure first\n');
    process.exit(1);
  }

  const backendOutputs = JSON.parse(readFileSync(backendOutputsPath, 'utf-8'));

  // Read AgentCore runtime outputs
  const runtimeOutputsPath = join(CDK_OUTPUTS_DIR, 'agentcore-runtime.json');
  if (!existsSync(runtimeOutputsPath)) {
    console.error('❌ Error: agentcore-runtime.json not found');
    console.error('   Please deploy the AgentCore runtime first\n');
    process.exit(1);
  }

  const runtimeOutputs = JSON.parse(readFileSync(runtimeOutputsPath, 'utf-8'));

  // Extract configuration values
  const cognitoStack = backendOutputs['QSR-CognitoStack'] || {};
  const locationStack = backendOutputs['QSR-LocationStack'] || {};
  const runtimeStack = runtimeOutputs['AgentCoreRuntimeStack'] || {};

  const config = {
    VITE_USER_POOL_ID: cognitoStack.UserPoolId,
    VITE_CLIENT_ID: cognitoStack.UserPoolClientId,
    VITE_IDENTITY_POOL_ID: cognitoStack.IdentityPoolId,
    VITE_REGION: cognitoStack.Region || 'us-east-1',
    VITE_WEBSOCKET_URL: runtimeStack.WebSocketEndpointUrl,
    VITE_RUNTIME_ARN: runtimeStack.AgentRuntimeArn,
    VITE_MAP_NAME: locationStack.MapName || 'QSRRestaurantMap',
    VITE_PLACE_INDEX_NAME: locationStack.PlaceIndexName || 'QSRRestaurantIndex'
  };

  // Validate all required values are present
  const missingValues = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingValues.length > 0) {
    console.error('❌ Error: Missing required configuration values:');
    missingValues.forEach(key => console.error(`   - ${key}`));
    console.error('\n   Please ensure all stacks are deployed correctly\n');
    process.exit(1);
  }

  // Generate .env.local content
  const envContent = `# Auto-generated from CDK outputs - DO NOT COMMIT
# Generated at: ${new Date().toISOString()}

# AWS Cognito Configuration
VITE_USER_POOL_ID=${config.VITE_USER_POOL_ID}
VITE_CLIENT_ID=${config.VITE_CLIENT_ID}
VITE_IDENTITY_POOL_ID=${config.VITE_IDENTITY_POOL_ID}
VITE_REGION=${config.VITE_REGION}

# AgentCore Runtime Configuration
VITE_WEBSOCKET_URL=${config.VITE_WEBSOCKET_URL}
VITE_RUNTIME_ARN=${config.VITE_RUNTIME_ARN}

# AWS Location Services
VITE_MAP_NAME=${config.VITE_MAP_NAME}
VITE_PLACE_INDEX_NAME=${config.VITE_PLACE_INDEX_NAME}
`;

  // Write .env.local file
  writeFileSync(ENV_FILE, envContent, 'utf-8');

  console.log('✅ Configuration generated successfully!');
  console.log(`   File: ${ENV_FILE}\n`);
  console.log('📋 Configuration values:');
  console.log(`   User Pool ID: ${config.VITE_USER_POOL_ID}`);
  console.log(`   Client ID: ${config.VITE_CLIENT_ID}`);
  console.log(`   Identity Pool ID: ${config.VITE_IDENTITY_POOL_ID}`);
  console.log(`   Region: ${config.VITE_REGION}`);
  console.log(`   WebSocket URL: ${config.VITE_WEBSOCKET_URL}`);
  console.log(`   Runtime ARN: ${config.VITE_RUNTIME_ARN}`);
  console.log(`   Map Name: ${config.VITE_MAP_NAME}`);
  console.log(`   Place Index: ${config.VITE_PLACE_INDEX_NAME}\n`);

} catch (error) {
  console.error('❌ Error generating configuration:', error.message);
  process.exit(1);
}
