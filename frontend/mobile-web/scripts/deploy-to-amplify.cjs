#!/usr/bin/env node

/**
 * Deploy Frontend to AWS Amplify
 * 
 * This script:
 * 1. Reads Amplify App ID from CDK outputs
 * 2. Builds the frontend (npm run build)
 * 3. Creates a zip of the dist folder
 * 4. Deploys to Amplify using AWS CLI
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  yellow: '\x1b[33m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, 'red');
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Read Amplify App ID from CDK outputs
const outputsPath = path.join(__dirname, '../../../cdk-outputs/frontend.json');

if (!fs.existsSync(outputsPath)) {
  error('CDK outputs not found. Please run CDK deploy first.');
}

let amplifyAppId;
let amplifyUrl;
let region;

try {
  const outputs = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
  const stackOutputs = outputs['QSR-FrontendStack'];
  
  if (!stackOutputs) {
    error('Frontend stack outputs not found in CDK outputs file.');
  }
  
  amplifyAppId = stackOutputs.AmplifyAppId;
  amplifyUrl = stackOutputs.AmplifyAppUrl;
  
  if (!amplifyAppId) {
    error('Amplify App ID not found in outputs.');
  }

  // Get region from backend outputs
  const backendOutputsPath = path.join(__dirname, '../../../cdk-outputs/backend-infrastructure.json');
  if (fs.existsSync(backendOutputsPath)) {
    const backendOutputs = JSON.parse(fs.readFileSync(backendOutputsPath, 'utf8'));
    region = (backendOutputs['QSR-CognitoStack'] || {}).Region || 'us-east-1';
  } else {
    region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  }
  
  info(`Using Amplify App ID: ${amplifyAppId}`);
  info(`Using Region: ${region}`);
} catch (err) {
  error(`Failed to read CDK outputs: ${err.message}`);
}

// Build the frontend
info('Building frontend...');
try {
  execSync('npm run build', { 
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit' 
  });
  success('Frontend built successfully');
} catch (err) {
  error(`Build failed: ${err.message}`);
}

// Check if dist folder exists
const distPath = path.join(__dirname, '../dist');
if (!fs.existsSync(distPath)) {
  error('dist/ folder not found after build');
}

// Create zip file
info('Creating deployment package...');
const zipPath = path.join(__dirname, '../dist.zip');

// Remove old zip if exists
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

try {
  execSync(`cd ${distPath} && zip -r ../dist.zip . -q`, { 
    stdio: 'inherit' 
  });
  success('Deployment package created');
} catch (err) {
  error(`Failed to create zip: ${err.message}`);
}

// Start deployment
info('Starting Amplify deployment...');
try {
  const deploymentOutput = execSync(
    `aws amplify create-deployment --app-id ${amplifyAppId} --branch-name main --region ${region}`,
    { encoding: 'utf8' }
  );
  
  const deployment = JSON.parse(deploymentOutput);
  const jobId = deployment.jobId;
  const uploadUrl = deployment.zipUploadUrl;
  
  info(`Deployment Job ID: ${jobId}`);
  
  // Upload zip file
  info('Uploading deployment package...');
  execSync(`curl -X PUT -H "Content-Type: application/zip" --data-binary "@${zipPath}" "${uploadUrl}"`, {
    stdio: 'inherit'
  });
  
  success('Deployment package uploaded');
  
  // Start deployment job
  info('Starting deployment job...');
  execSync(
    `aws amplify start-deployment --app-id ${amplifyAppId} --branch-name main --job-id ${jobId} --region ${region}`,
    { stdio: 'inherit' }
  );
  
  success('Deployment started successfully!');
  info(`View your app at: ${amplifyUrl}`);
  info(`Monitor deployment: https://console.aws.amazon.com/amplify/home?region=${region}#/${amplifyAppId}/main/${jobId}`);
  
} catch (err) {
  error(`Deployment failed: ${err.message}`);
}

// Cleanup
info('Cleaning up...');
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

success('Deployment complete! 🎉');