#!/usr/bin/env python3
"""
AgentCore Gateway Deployment Script

This script deploys an AgentCore Gateway with IAM authorization that exposes
a Backend API Gateway as MCP tools. This is a temporary workaround until
AWS releases CDK/CloudFormation support for AgentCore Gateway API Gateway targets.

The Gateway uses direct IAM-based communication with the Backend API Gateway,
eliminating the need for Lambda interceptors.

Usage:
    python deploy-gateway.py --config config.yaml
    python deploy-gateway.py --config config.yaml --api-gateway-id abc123 --region us-east-1
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Dict, Any

import boto3
from botocore.exceptions import ClientError

# Import utility functions
from utils import (
    load_config,
    parse_openapi_schema,
    save_outputs,
    print_section,
    print_success,
    print_error,
    print_warning,
    print_info,
    format_arn
)


def parse_arguments() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description='Deploy AgentCore Gateway with API Gateway target'
    )
    parser.add_argument(
        '--config',
        help='Path to configuration file (optional - only loaded if specified)'
    )
    parser.add_argument(
        '--api-gateway-id',
        required=False,
        help='API Gateway ID (required if not in config file)'
    )
    parser.add_argument(
        '--stage',
        default='prod',
        help='API Gateway stage name (default: prod)'
    )
    parser.add_argument(
        '--region',
        help='AWS region (default: us-east-1)'
    )
    parser.add_argument(
        '--profile',
        help='AWS CLI profile (optional)'
    )
    parser.add_argument(
        '--gateway-name',
        help='Gateway name (default: qsr-ordering-gateway)'
    )
    parser.add_argument(
        '--output-file',
        help='Output file path (default: deployment-outputs.json)'
    )
    
    return parser.parse_args()


def get_account_id(sts_client) -> str:
    """Get AWS account ID."""
    try:
        return sts_client.get_caller_identity()['Account']
    except ClientError as e:
        print_error(f"Failed to get AWS account ID: {e}")
        sys.exit(1)


def create_or_update_gateway_service_role(iam_client, role_name: str, api_gateway_arn: str) -> str:
    """
    Create or update IAM role for AgentCore Gateway service.
    If role exists, updates the inline policy with current API Gateway ARN.
    
    Args:
        iam_client: Boto3 IAM client
        role_name: Name of the IAM role
        api_gateway_arn: ARN of the API Gateway to grant invoke permissions
    
    Returns:
        Role ARN
    """
    print_info(f"Creating/updating Gateway service role: {role_name}")
    
    # Trust policy for AgentCore Gateway
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "bedrock-agentcore.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }
    
    # Policy for API Gateway invocation
    policy_document = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "execute-api:Invoke",
                "Resource": api_gateway_arn
            }
        ]
    }
    
    try:
        # Try to create role
        response = iam_client.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description='Service role for AgentCore Gateway'
        )
        role_arn = response['Role']['Arn']
        print_success(f"Gateway service role created: {role_arn}")
        
        # Add inline policy
        iam_client.put_role_policy(
            RoleName=role_name,
            PolicyName='GatewayServicePolicy',
            PolicyDocument=json.dumps(policy_document)
        )
        print_success("Gateway service policy attached")
        
        # Wait for role to be available
        # AWS IAM role propagation requires time for the role to become available across all AWS services
        # This delay ensures the role is fully propagated before attempting to use it
        print_info("Waiting for IAM role to propagate...")
        time.sleep(10)
        
        return role_arn
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'EntityAlreadyExists':
            print_warning(f"Role {role_name} already exists, updating policy...")
            
            # Get existing role ARN
            response = iam_client.get_role(RoleName=role_name)
            role_arn = response['Role']['Arn']
            
            # Update inline policy with current API Gateway ARN
            iam_client.put_role_policy(
                RoleName=role_name,
                PolicyName='GatewayServicePolicy',
                PolicyDocument=json.dumps(policy_document)
            )
            print_success(f"Gateway service policy updated with API Gateway ARN: {api_gateway_arn}")
            print_success(f"Using existing role: {role_arn}")
            
            return role_arn
        else:
            print_error(f"Failed to create Gateway service role: {e}")
            sys.exit(1)


def fetch_openapi_schema(apigateway_client, api_gateway_id: str, stage_name: str, region: str) -> Dict[str, Any]:
    """
    Fetch OpenAPI schema from API Gateway.
    
    Returns:
        OpenAPI schema dictionary
    """
    print_info(f"Fetching OpenAPI schema from API Gateway {api_gateway_id}...")
    
    try:
        response = apigateway_client.get_export(
            restApiId=api_gateway_id,
            stageName=stage_name,
            exportType='oas30',
            accepts='application/json'
        )
        
        schema = json.loads(response['body'].read())
        print_success("OpenAPI schema fetched successfully")
        
        return schema
        
    except ClientError as e:
        print_error(f"Failed to fetch OpenAPI schema: {e}")
        sys.exit(1)


def wait_for_gateway_ready(
    agentcore_client,
    gateway_id: str,
    max_attempts: int = 30,
    wait_seconds: int = 2
) -> bool:
    """
    Wait for Gateway to reach READY status.
    
    Returns:
        True if gateway is ready, False if timeout or failed
    """
    print_info(f"Waiting for gateway {gateway_id} to be ready...")
    
    for attempt in range(max_attempts):
        try:
            response = agentcore_client.get_gateway(
                gatewayIdentifier=gateway_id
            )
            
            status = response.get('status', 'UNKNOWN')
            print_info(f"   Attempt {attempt + 1}/{max_attempts}: Status = {status}")
            
            if status == 'READY':
                print_success("Gateway is READY!")
                return True
            elif status in ['FAILED', 'DELETING', 'DELETED']:
                print_error(f"Gateway entered terminal state: {status}")
                return False
            
            # Polling delay for AWS resource state transitions (eventual consistency)
            time.sleep(wait_seconds)
            
        except ClientError as e:
            print_error(f"Error checking gateway status: {e}")
            return False
    
    print_error(f"Timeout waiting for gateway to be ready after {max_attempts * wait_seconds} seconds")
    return False


def create_agentcore_gateway(
    agentcore_client,
    gateway_name: str,
    description: str,
    gateway_role_arn: str
) -> tuple[str, str, str]:
    """
    Create AgentCore Gateway with IAM authorization.
    Uses direct communication with API Gateway (no Lambda interceptor).
    
    Args:
        agentcore_client: Boto3 AgentCore client
        gateway_name: Name for the gateway
        description: Description of the gateway
        gateway_role_arn: ARN of the IAM role for the gateway
    
    Returns:
        Tuple of (gateway_id, gateway_url, gateway_arn)
    """
    print_info(f"Creating AgentCore Gateway: {gateway_name}")
    
    try:
        response = agentcore_client.create_gateway(
            name=gateway_name,
            description=description,
            authorizerType='AWS_IAM',
            protocolType='MCP',
            protocolConfiguration={
                'mcp': {
                    'supportedVersions': ['2025-03-26'],
                    'searchType': 'SEMANTIC',
                    'instructions': description
                }
            },
            roleArn=gateway_role_arn,
            exceptionLevel='DEBUG'  # Enable debug-level exception logging
        )
        
        # Debug: print response keys
        print(f"DEBUG: Response keys: {list(response.keys())}")
        print(f"DEBUG: Full response: {response}")
        
        gateway_id = response.get('gatewayId') or response.get('gatewayIdentifier') or response.get('gateway', {}).get('gatewayIdentifier')
        gateway_url = response.get('gatewayUrl') or response.get('gateway', {}).get('gatewayUrl', '')
        gateway_arn = response.get('gatewayArn') or response.get('gateway', {}).get('gatewayArn', '')
        
        print_success(f"AgentCore Gateway created: {gateway_id}")
        print_info(f"Gateway URL: {gateway_url}")
        
        return gateway_id, gateway_url, gateway_arn
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConflictException':
            print_warning(f"Gateway {gateway_name} already exists, retrieving existing gateway")
            # List gateways and find the one with matching name
            try:
                response = agentcore_client.list_gateways()
                for gateway in response.get('items', []):
                    if gateway.get('name') == gateway_name:
                        gateway_id = gateway.get('gatewayId')
                        # Get full gateway details
                        gateway_details = agentcore_client.get_gateway(gatewayIdentifier=gateway_id)
                        gateway_url = gateway_details.get('gatewayUrl', '')
                        gateway_arn = gateway_details.get('gatewayArn', '')
                        print_success(f"Using existing gateway: {gateway_id}")
                        return gateway_id, gateway_url, gateway_arn
                print_error(f"Gateway {gateway_name} exists but could not be found")
                sys.exit(1)
            except Exception as list_error:
                print_error(f"Failed to list gateways: {list_error}")
                sys.exit(1)
        else:
            print_error(f"Failed to create AgentCore Gateway: {e}")
            sys.exit(1)


def create_gateway_target(
    agentcore_client,
    gateway_id: str,
    target_name: str,
    api_gateway_id: str,
    stage_name: str,
    tool_filters: list,
    tool_overrides: list
) -> str:
    """
    Create Gateway Target with API Gateway Service configuration.
    
    Returns:
        Target identifier
    """
    print_info(f"Creating Gateway Target: {target_name}")
    
    try:
        response = agentcore_client.create_gateway_target(
            gatewayIdentifier=gateway_id,
            name=target_name,
            description='QSR Backend API Lambda functions exposed as MCP tools',
            targetConfiguration={
                'mcp': {
                    'apiGateway': {
                        'restApiId': api_gateway_id,
                        'stage': stage_name,
                        'apiGatewayToolConfiguration': {
                            'toolFilters': tool_filters,
                            'toolOverrides': tool_overrides
                        }
                    }
                }
            },
            credentialProviderConfigurations=[
                {
                    'credentialProviderType': 'GATEWAY_IAM_ROLE'
                }
            ]
        )
        
        # Debug: print response keys
        print(f"DEBUG: Target response keys: {list(response.keys())}")
        
        target_id = response.get('targetIdentifier') or response.get('targetId') or response.get('target', {}).get('targetIdentifier')
        print_success(f"Gateway Target created: {target_id}")
        
        return target_id
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConflictException':
            print_warning(f"Target {target_name} already exists, retrieving existing target")
            # List targets and find the one with matching name
            try:
                response = agentcore_client.list_gateway_targets(
                    gatewayIdentifier=gateway_id
                )
                for target in response.get('items', []):
                    if target.get('name') == target_name:
                        target_id = target.get('targetId')
                        print_success(f"Using existing target: {target_id}")
                        return target_id
                print_error(f"Target {target_name} exists but could not be found")
                sys.exit(1)
            except Exception as list_error:
                print_error(f"Failed to list targets: {list_error}")
                sys.exit(1)
        else:
            print_error(f"Failed to create Gateway Target: {e}")
            print_error(f"Error details: {e.response}")
            sys.exit(1)


def wait_for_target_ready(
    agentcore_client,
    gateway_id: str,
    target_id: str,
    max_attempts: int = 30,
    wait_seconds: int = 2
) -> tuple[bool, dict]:
    """
    Wait for Gateway Target to reach READY status and check for errors.
    
    Returns:
        Tuple of (success: bool, target_details: dict)
    """
    print_info(f"Waiting for target {target_id} to be ready...")
    
    for attempt in range(max_attempts):
        try:
            response = agentcore_client.get_gateway_target(
                gatewayIdentifier=gateway_id,
                targetId=target_id
            )
            
            status = response.get('status')
            print_info(f"  Attempt {attempt + 1}/{max_attempts}: Status = {status}")
            
            if status == 'READY':
                print_success("Target is READY!")
                return True, response
            elif status == 'FAILED':
                print_error("Target creation FAILED!")
                return False, response
            elif status in ['CREATING', 'UPDATING']:
                # Still processing, wait and retry
                # Polling delay for AWS resource creation/update (eventual consistency)
                time.sleep(wait_seconds)
            else:
                print_warning(f"Unknown status: {status}")
                # Polling delay for unknown states during resource provisioning
                time.sleep(wait_seconds)
                
        except ClientError as e:
            print_error(f"Failed to get target status: {e}")
            return False, {}
    
    print_error(f"Target did not become READY after {max_attempts * wait_seconds} seconds")
    return False, {}


def display_target_status(target_details: dict):
    """Display detailed target status information."""
    print_section("Target Status Details")
    
    print_info(f"Target ID: {target_details.get('targetId')}")
    print_info(f"Name: {target_details.get('name')}")
    print_info(f"Status: {target_details.get('status')}")
    print_info(f"Description: {target_details.get('description', 'N/A')}")
    
    # Check for errors in the target
    if 'failureReasons' in target_details and target_details['failureReasons']:
        print_error("\n⚠️  Target has errors:")
        for reason in target_details['failureReasons']:
            print_error(f"  - {reason}")
        return False
    
    # Check for errors in metadata (some APIs return errors here)
    if 'metadata' in target_details:
        metadata = target_details['metadata']
        if 'errors' in metadata and metadata['errors']:
            print_error("\n⚠️  Target has errors in metadata:")
            for error in metadata['errors']:
                print_error(f"  - {error}")
            return False
    
    print_success("\n✅ No errors found in target configuration")
    return True


def main():
    """Main deployment function."""
    # Parse arguments
    args = parse_arguments()
    
    # Load configuration
    cli_args = {
        'api_gateway_id': args.api_gateway_id,
        'stage': args.stage,
        'region': args.region,
        'profile': args.profile,
        'gateway_name': args.gateway_name,
        'output_file': args.output_file
    }
    
    try:
        config = load_config(args.config, cli_args)
    except Exception as e:
        print_error(f"Failed to load configuration: {e}")
        sys.exit(1)
    
    # Extract configuration values
    region = config['aws']['region']
    profile = config['aws'].get('profile', 'default')
    api_gateway_id = config['backend']['api_gateway_id']
    stage_name = config['backend']['api_gateway_stage']
    gateway_name = config['gateway']['name']
    gateway_description = config['gateway']['description']
    iam_config = config['iam']
    output_config = config['output']
    
    # Validate required parameters
    if not api_gateway_id or api_gateway_id == 'YOUR_API_GATEWAY_ID_HERE':
        print_error("API Gateway ID is required. Please update config.yaml or use --api-gateway-id")
        sys.exit(1)
    
    print_section("AgentCore Gateway Deployment")
    print_info(f"Region: {region}")
    print_info(f"API Gateway ID: {api_gateway_id}")
    print_info(f"Stage: {stage_name}")
    print_info(f"Gateway Name: {gateway_name}")
    
    # Initialize AWS clients
    # Prioritize environment credentials, fall back to profile if specified
    if profile and profile != 'default':
        # Only use profile if explicitly specified and not 'default'
        session = boto3.Session(profile_name=profile, region_name=region)
    else:
        # Use environment credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
        session = boto3.Session(region_name=region)
    
    sts_client = session.client('sts')
    iam_client = session.client('iam')
    apigateway_client = session.client('apigateway')
    agentcore_client = session.client('bedrock-agentcore-control')
    
    # Get account ID
    account_id = get_account_id(sts_client)
    print_info(f"AWS Account ID: {account_id}")
    
    # Construct API Gateway ARN
    api_gateway_arn = f"arn:aws:execute-api:{region}:{account_id}:{api_gateway_id}/{stage_name}/*/*"
    
    # Step 1: Create/Update IAM Role
    print_section("Step 1: Creating/Updating IAM Role")
    
    gateway_role_arn = create_or_update_gateway_service_role(
        iam_client,
        iam_config['gateway_role_name'],
        api_gateway_arn
    )
    
    # Step 2: Fetch OpenAPI schema
    print_section("Step 2: Fetching OpenAPI Schema")
    
    schema = fetch_openapi_schema(apigateway_client, api_gateway_id, stage_name, region)
    
    # Step 3: Parse schema to generate tool filters and overrides
    print_section("Step 3: Generating Tool Filters and Overrides")
    
    tool_filters, tool_overrides = parse_openapi_schema(schema)
    print_success(f"Generated {len(tool_filters)} tool filters and {len(tool_overrides)} tool overrides")
    
    # Step 4: Create AgentCore Gateway
    print_section("Step 4: Creating AgentCore Gateway")
    
    gateway_id, gateway_url, gateway_arn = create_agentcore_gateway(
        agentcore_client,
        gateway_name,
        gateway_description,
        gateway_role_arn
    )
    
    # Wait for gateway to be ready before creating targets
    if not wait_for_gateway_ready(agentcore_client, gateway_id):
        print_error("Gateway failed to reach READY status")
        sys.exit(1)
    
    # Step 5: Create Gateway Target
    print_section("Step 5: Creating Gateway Target")
    
    target_id = create_gateway_target(
        agentcore_client,
        gateway_id,
        'qsr-backend-api',
        api_gateway_id,
        stage_name,
        tool_filters,
        tool_overrides
    )
    
    # Step 6: Wait for target to be ready and check status
    print_section("Step 6: Verifying Target Status")
    
    success, target_details = wait_for_target_ready(
        agentcore_client,
        gateway_id,
        target_id
    )
    
    if not success:
        print_error("Target failed to reach READY status")
        if target_details:
            display_target_status(target_details)
        sys.exit(1)
    
    # Display final status
    if not display_target_status(target_details):
        print_error("Target has errors - deployment may not work correctly")
        sys.exit(1)
    
    # Step 7: Save outputs
    print_section("Deployment Complete!")
    
    outputs = {
        'gateway_id': gateway_id,
        'gateway_url': gateway_url,
        'gateway_arn': gateway_arn,
        'gateway_role_arn': gateway_role_arn,
        'target_id': target_id,
        'api_gateway_id': api_gateway_id,
        'api_gateway_stage': stage_name,
        'region': region,
        'account_id': account_id,
        'deployment_timestamp': datetime.now(timezone.utc).isoformat(),
        'tool_filters_count': len(tool_filters),
        'tool_overrides_count': len(tool_overrides)
    }
    
    # Print summary
    print_success(f"Gateway URL: {gateway_url}")
    print_success(f"Gateway ID: {gateway_id}")
    print_info(f"Target ID: {target_id}")
    print_info(f"Tools exposed: {len(tool_filters)}")
    
    # Save to file
    if output_config['save_to_file']:
        output_file = os.path.join(os.path.dirname(__file__), output_config['output_file'])
        save_outputs(outputs, output_file)
    
    # Print next steps
    print("\n" + "="*60)
    print("  Next Steps")
    print("="*60 + "\n")
    print("1. Provide the Gateway URL to the AgentCore Runtime team")
    print("2. Configure AgentCore Runtime to connect to this Gateway")
    print("3. The agent will automatically discover all tools as MCP tools")
    print("\nTo delete all resources, run:")
    print(f"  python scripts/delete-gateway.py --gateway-id {gateway_id}")
    print()


if __name__ == '__main__':
    main()
