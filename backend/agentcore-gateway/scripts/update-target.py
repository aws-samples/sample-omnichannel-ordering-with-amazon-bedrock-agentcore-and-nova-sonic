#!/usr/bin/env python3
"""
AgentCore Gateway Target Update Script

This script updates an existing Gateway Target with a new API Gateway configuration.
This is useful when the API Gateway schema changes (e.g., new endpoints, updated parameters)
without needing to redeploy the entire AgentCore Gateway infrastructure.

Usage:
    python update-target.py --gateway-id gw-abc123xyz --target-id tgt-xyz789
    python update-target.py --output-file deployment-outputs.json
    python update-target.py --gateway-id gw-abc123xyz --target-id tgt-xyz789 --api-gateway-id abc123
"""

import argparse
import json
import os
import sys
import time

import boto3
from botocore.exceptions import ClientError

# Import utility functions
from utils import (
    load_outputs,
    parse_openapi_schema,
    save_outputs,
    print_section,
    print_success,
    print_error,
    print_warning,
    print_info
)


def parse_arguments() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description='Update AgentCore Gateway Target with new API Gateway configuration'
    )
    parser.add_argument(
        '--gateway-id',
        help='Gateway ID'
    )
    parser.add_argument(
        '--target-id',
        help='Target ID to update'
    )
    parser.add_argument(
        '--api-gateway-id',
        help='API Gateway ID (optional - uses existing if not provided)'
    )
    parser.add_argument(
        '--stage',
        default='prod',
        help='API Gateway stage name (default: prod)'
    )
    parser.add_argument(
        '--output-file',
        default='scripts/deployment-outputs.json',
        help='Path to deployment outputs file (default: scripts/deployment-outputs.json)'
    )
    parser.add_argument(
        '--region',
        help='AWS region (overrides output file)'
    )
    parser.add_argument(
        '--profile',
        default='default',
        help='AWS CLI profile (default: default)'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Skip confirmation prompt'
    )
    
    return parser.parse_args()


def confirm_update(gateway_id: str, target_id: str, api_gateway_id: str) -> bool:
    """
    Prompt user to confirm target update.
    
    Returns:
        True if user confirms, False otherwise
    """
    print_section("Target Update Confirmation")
    
    print(f"Gateway ID: {gateway_id}")
    print(f"Target ID: {target_id}")
    print(f"API Gateway ID: {api_gateway_id}")
    
    print("\n⚠️  This will delete and recreate the target with updated configuration.")
    response = input("\nAre you sure you want to update this target? (yes/no): ")
    
    return response.lower() in ['yes', 'y']


def fetch_openapi_schema(apigateway_client, api_gateway_id: str, stage_name: str) -> dict:
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


def delete_gateway_target(agentcore_client, gateway_id: str, target_id: str) -> bool:
    """
    Delete Gateway Target.
    
    Returns:
        True if successful, False otherwise
    """
    print_info(f"Deleting existing Gateway Target: {target_id}")
    
    try:
        agentcore_client.delete_gateway_target(
            gatewayIdentifier=gateway_id,
            targetId=target_id
        )
        print_success("Gateway Target deletion initiated")
        return True
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            print_warning("Gateway Target not found (may have been already deleted)")
            return True
        else:
            print_error(f"Failed to delete Gateway Target: {e}")
            return False


def wait_for_target_deletion(
    agentcore_client,
    gateway_id: str,
    target_id: str,
    max_attempts: int = 30,
    wait_seconds: int = 2
) -> bool:
    """
    Wait for Gateway Target to be fully deleted.
    
    Returns:
        True if target is deleted, False if timeout or error
    """
    print_info(f"Waiting for target {target_id} to be deleted...")
    
    for attempt in range(max_attempts):
        try:
            response = agentcore_client.get_gateway_target(
                gatewayIdentifier=gateway_id,
                targetId=target_id
            )
            
            status = response.get('status', 'UNKNOWN')
            print_info(f"   Attempt {attempt + 1}/{max_attempts}: Status = {status}")
            
            if status == 'DELETING':
                # Polling delay for AWS resource deletion (eventual consistency)
                time.sleep(wait_seconds)
                continue
            elif status == 'DELETED':
                print_success("Target deleted successfully!")
                return True
            else:
                # Target still exists in some other state
                # Polling delay for AWS resource state transitions
                time.sleep(wait_seconds)
                continue
                
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                # Target no longer exists - deletion complete
                print_success("Target deleted successfully!")
                return True
            else:
                print_error(f"Error checking target status: {e}")
                return False
    
    print_error(f"Timeout waiting for target deletion after {max_attempts * wait_seconds} seconds")
    return False


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
    print_info(f"Creating new Gateway Target: {target_name}")
    
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
        
        target_id = response.get('targetIdentifier') or response.get('targetId') or response.get('target', {}).get('targetIdentifier')
        print_success(f"Gateway Target created: {target_id}")
        
        return target_id
        
    except ClientError as e:
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
    """Main update function."""
    # Parse arguments
    args = parse_arguments()
    
    # Load resources from output file or use CLI args
    resources = {}
    gateway_id = args.gateway_id
    target_id = args.target_id
    api_gateway_id = args.api_gateway_id
    region = args.region
    stage_name = args.stage
    
    # Try to load from output file
    output_file = args.output_file
    if not os.path.isabs(output_file):
        output_file = os.path.join(os.path.dirname(__file__), args.output_file)
    
    if os.path.exists(output_file):
        resources = load_outputs(output_file)
        gateway_id = gateway_id or resources.get('gateway_id')
        target_id = target_id or resources.get('target_id')
        api_gateway_id = api_gateway_id or resources.get('api_gateway_id')
        region = region or resources.get('region')
        stage_name = stage_name or resources.get('api_gateway_stage', 'prod')
    
    # Validate required parameters
    if not gateway_id:
        print_error("Gateway ID is required. Use --gateway-id or provide deployment-outputs.json")
        sys.exit(1)
    
    if not target_id:
        print_error("Target ID is required. Use --target-id or provide deployment-outputs.json")
        sys.exit(1)
    
    if not api_gateway_id:
        print_error("API Gateway ID is required. Use --api-gateway-id or provide deployment-outputs.json")
        sys.exit(1)
    
    if not region:
        print_error("Region is required. Use --region or provide deployment-outputs.json")
        sys.exit(1)
    
    print_section("AgentCore Gateway Target Update")
    print_info(f"Gateway ID: {gateway_id}")
    print_info(f"Target ID: {target_id}")
    print_info(f"API Gateway ID: {api_gateway_id}")
    print_info(f"Stage: {stage_name}")
    print_info(f"Region: {region}")
    
    # Confirm update
    if not args.force:
        if not confirm_update(gateway_id, target_id, api_gateway_id):
            print_info("Update cancelled")
            sys.exit(0)
    
    # Initialize AWS clients
    if args.profile and args.profile != 'default':
        session = boto3.Session(profile_name=args.profile, region_name=region)
    else:
        session = boto3.Session(region_name=region)
    
    agentcore_client = session.client('bedrock-agentcore-control')
    apigateway_client = session.client('apigateway')
    
    # Step 1: Fetch updated OpenAPI schema
    print_section("Step 1: Fetching Updated OpenAPI Schema")
    
    schema = fetch_openapi_schema(apigateway_client, api_gateway_id, stage_name)
    
    # Step 2: Parse schema to generate tool filters and overrides
    print_section("Step 2: Generating Tool Filters and Overrides")
    
    tool_filters, tool_overrides = parse_openapi_schema(schema)
    print_success(f"Generated {len(tool_filters)} tool filters and {len(tool_overrides)} tool overrides")
    
    # Step 3: Delete existing target
    print_section("Step 3: Deleting Existing Target")
    
    if not delete_gateway_target(agentcore_client, gateway_id, target_id):
        print_error("Failed to delete existing target")
        sys.exit(1)
    
    # Wait for target deletion to complete
    if not wait_for_target_deletion(agentcore_client, gateway_id, target_id):
        print_error("Target deletion did not complete successfully")
        sys.exit(1)
    
    # Step 4: Create new target with updated configuration
    print_section("Step 4: Creating New Target")
    
    new_target_id = create_gateway_target(
        agentcore_client,
        gateway_id,
        'qsr-backend-api',
        api_gateway_id,
        stage_name,
        tool_filters,
        tool_overrides
    )
    
    # Step 5: Wait for new target to be ready
    print_section("Step 5: Verifying New Target Status")
    
    success, target_details = wait_for_target_ready(
        agentcore_client,
        gateway_id,
        new_target_id
    )
    
    if not success:
        print_error("New target failed to reach READY status")
        if target_details:
            display_target_status(target_details)
        sys.exit(1)
    
    # Display final status
    if not display_target_status(target_details):
        print_error("New target has errors - update may not work correctly")
        sys.exit(1)
    
    # Step 6: Update outputs file
    print_section("Update Complete!")
    
    if resources:
        # Update the target_id in the outputs
        resources['target_id'] = new_target_id
        resources['tool_filters_count'] = len(tool_filters)
        resources['tool_overrides_count'] = len(tool_overrides)
        
        # Save updated outputs
        save_outputs(resources, output_file)
        print_success(f"Updated deployment outputs: {output_file}")
    
    print_success(f"New Target ID: {new_target_id}")
    print_info(f"Tools exposed: {len(tool_filters)}")
    print("\n✅ Target updated successfully!")
    print("The agent will now use the updated API Gateway schema with new parameters.")


if __name__ == '__main__':
    main()
