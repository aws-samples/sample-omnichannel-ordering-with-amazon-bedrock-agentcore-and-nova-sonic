#!/usr/bin/env python3
"""
AgentCore Gateway Cleanup Script

This script deletes all resources created by deploy-gateway.py.

Usage:
    python delete-gateway.py --gateway-id gw-abc123xyz
    python delete-gateway.py --output-file deployment-outputs.json
    python delete-gateway.py --gateway-id gw-abc123xyz --force
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
    print_section,
    print_success,
    print_error,
    print_warning,
    print_info
)


def parse_arguments() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description='Delete AgentCore Gateway and all associated resources'
    )
    parser.add_argument(
        '--gateway-id',
        help='Gateway ID to delete'
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
    parser.add_argument(
        '--keep-roles',
        action='store_true',
        help='Keep IAM roles (only delete Gateway and Target)'
    )
    
    return parser.parse_args()


def confirm_deletion(gateway_id: str, resources: dict) -> bool:
    """
    Prompt user to confirm deletion.
    
    Returns:
        True if user confirms, False otherwise
    """
    print_section("Resources to Delete")
    
    print(f"Gateway ID: {gateway_id}")
    if resources.get('gateway_url'):
        print(f"Gateway URL: {resources['gateway_url']}")
    if resources.get('target_id'):
        print(f"Target ID: {resources['target_id']}")
    if resources.get('gateway_role_arn'):
        print(f"Gateway Role: {resources['gateway_role_arn']}")
    
    print("\n⚠️  WARNING: This action cannot be undone!")
    response = input("\nAre you sure you want to delete these resources? (yes/no): ")
    
    return response.lower() in ['yes', 'y']


def list_gateway_targets(agentcore_client, gateway_id: str) -> list:
    """
    List all targets for a gateway.
    
    Returns:
        List of target dictionaries
    """
    print_info(f"Listing targets for gateway: {gateway_id}")
    
    try:
        response = agentcore_client.list_gateway_targets(
            gatewayIdentifier=gateway_id
        )
        targets = response.get('items', [])
        print_success(f"Found {len(targets)} target(s)")
        return targets
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            print_warning("Gateway not found")
            return []
        else:
            print_error(f"Failed to list gateway targets: {e}")
            return []


def confirm_target_deletion(target: dict) -> bool:
    """
    Prompt user to confirm target deletion.
    
    Returns:
        True if user confirms, False otherwise
    """
    print("\n" + "="*60)
    print(f"Target ID: {target.get('targetId')}")
    print(f"Name: {target.get('name')}")
    print(f"Status: {target.get('status')}")
    print(f"Description: {target.get('description', 'N/A')}")
    print("="*60)
    
    response = input("\nDo you want to delete this target? (Y/N): ")
    return response.lower() in ['y', 'yes']


def delete_gateway_target(agentcore_client, gateway_id: str, target_id: str) -> bool:
    """
    Delete Gateway Target.
    
    Returns:
        True if successful, False otherwise
    """
    print_info(f"Deleting Gateway Target: {target_id}")
    
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


def delete_gateway(agentcore_client, gateway_id: str) -> bool:
    """
    Delete AgentCore Gateway.
    
    Returns:
        True if successful, False otherwise
    """
    print_info(f"Deleting AgentCore Gateway: {gateway_id}")
    
    try:
        agentcore_client.delete_gateway(gatewayIdentifier=gateway_id)
        print_success("AgentCore Gateway deleted")
        return True
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            print_warning("Gateway not found (may have been already deleted)")
            return True
        else:
            print_error(f"Failed to delete Gateway: {e}")
            return False


def delete_iam_role(iam_client, role_name: str) -> bool:
    """
    Delete IAM role and its policies.
    
    Returns:
        True if successful, False otherwise
    """
    print_info(f"Deleting IAM role: {role_name}")
    
    try:
        # Delete inline policies
        try:
            response = iam_client.list_role_policies(RoleName=role_name)
            for policy_name in response['PolicyNames']:
                iam_client.delete_role_policy(RoleName=role_name, PolicyName=policy_name)
                print_info(f"  Deleted inline policy: {policy_name}")
        except ClientError:
            pass
        
        # Detach managed policies
        try:
            response = iam_client.list_attached_role_policies(RoleName=role_name)
            for policy in response['AttachedPolicies']:
                iam_client.detach_role_policy(RoleName=role_name, PolicyArn=policy['PolicyArn'])
                print_info(f"  Detached managed policy: {policy['PolicyName']}")
        except ClientError:
            pass
        
        # Delete role
        iam_client.delete_role(RoleName=role_name)
        print_success(f"IAM role deleted: {role_name}")
        return True
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchEntity':
            print_warning(f"IAM role not found: {role_name} (may have been already deleted)")
            return True
        else:
            print_error(f"Failed to delete IAM role {role_name}: {e}")
            return False


def extract_role_name_from_arn(role_arn: str) -> str:
    """Extract role name from IAM role ARN."""
    # ARN format: arn:aws:iam::account:role/role-name
    return role_arn.split('/')[-1]


def main():
    """Main cleanup function."""
    # Parse arguments
    args = parse_arguments()
    
    # Load resources from output file or use CLI args
    resources = {}
    gateway_id = args.gateway_id
    region = args.region
    
    if not gateway_id:
        # Try to load from output file
        output_file = args.output_file
        if not os.path.isabs(output_file):
            output_file = os.path.join(os.path.dirname(__file__), args.output_file)
        
        resources = load_outputs(output_file)
        if not resources:
            print_error(f"Output file not found: {output_file}")
            print_error("Please provide --gateway-id or ensure deployment-outputs.json exists")
            sys.exit(1)
        
        gateway_id = resources.get('gateway_id')
        region = region or resources.get('region')
    
    if not gateway_id:
        print_error("Gateway ID is required. Use --gateway-id or provide deployment-outputs.json")
        sys.exit(1)
    
    if not region:
        print_error("Region is required. Use --region or provide deployment-outputs.json")
        sys.exit(1)
    
    print_section("AgentCore Gateway Cleanup")
    print_info(f"Gateway ID: {gateway_id}")
    print_info(f"Region: {region}")
    
    # Confirm deletion
    if not args.force:
        if not confirm_deletion(gateway_id, resources):
            print_info("Deletion cancelled")
            sys.exit(0)
    
    # Initialize AWS clients
    # Prioritize environment credentials, fall back to profile if specified
    if args.profile and args.profile != 'default':
        # Only use profile if explicitly specified and not 'default'
        session = boto3.Session(profile_name=args.profile, region_name=region)
    else:
        # Use environment credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
        session = boto3.Session(region_name=region)
    agentcore_client = session.client('bedrock-agentcore-control')
    iam_client = session.client('iam')
    
    success = True
    
    # Step 1: Delete Gateway Targets
    print_section("Step 1: Discovering and Deleting Gateway Targets")
    
    # Always list targets from the gateway as the source of truth
    print_info("Discovering all targets from gateway...")
    all_targets = list_gateway_targets(agentcore_client, gateway_id)
    
    target_ids_to_delete = []
    
    if all_targets:
        print_info(f"\nFound {len(all_targets)} target(s) associated with gateway {gateway_id}")
        
        # Ask for confirmation for each target (unless --force is used)
        for target in all_targets:
            target_id = target.get('targetId')
            if args.force or confirm_target_deletion(target):
                target_ids_to_delete.append(target_id)
            else:
                print_warning(f"Skipping target: {target_id}")
    else:
        print_warning("No targets found for this gateway")
    
    # Delete all confirmed targets
    if target_ids_to_delete:
        for target_id in target_ids_to_delete:
            if not delete_gateway_target(agentcore_client, gateway_id, target_id):
                success = False
                continue
            
            # Wait for target deletion to complete
            if not wait_for_target_deletion(agentcore_client, gateway_id, target_id):
                print_warning(f"Target {target_id} may not be fully deleted")
                success = False
    else:
        print_warning("No targets to delete")
    
    # Step 2: Delete Gateway
    print_section("Step 2: Deleting AgentCore Gateway")
    
    # Add extra wait time to ensure targets are fully dissociated
    if target_ids_to_delete:
        # AWS resource dissociation requires time for eventual consistency
        # This delay ensures targets are fully removed before attempting gateway deletion
        print_info("Waiting for targets to fully dissociate from gateway...")
        time.sleep(10)  # Increased from 5 to 10 seconds
    
    # Retry gateway deletion if it fails due to targets still being associated
    max_retries = 5  # Increased from 3 to 5
    retry_delay = 10  # Increased from 5 to 10 seconds
    gateway_deleted = False
    
    for attempt in range(max_retries):
        if delete_gateway(agentcore_client, gateway_id):
            gateway_deleted = True
            break
        else:
            if attempt < max_retries - 1:
                print_warning(f"Retry {attempt + 1}/{max_retries - 1} in {retry_delay} seconds...")
                # Retry delay for gateway deletion when targets are still dissociating
                time.sleep(retry_delay)
            else:
                print_error("Failed to delete gateway after all retries")
                success = False
    
    if not gateway_deleted:
        success = False
    
    # Wait for gateway deletion to complete
    # AWS resource cleanup requires time for eventual consistency
    time.sleep(2)
    
    # Step 3: Delete IAM role
    if not args.keep_roles:
        print_section("Step 3: Deleting IAM Role")
        
        if resources.get('gateway_role_arn'):
            role_name = extract_role_name_from_arn(resources['gateway_role_arn'])
            if not delete_iam_role(iam_client, role_name):
                success = False
        else:
            print_warning("No Gateway role ARN found, skipping Gateway role deletion")
    else:
        print_info("Keeping IAM role (--keep-roles flag)")
    
    # Summary
    print_section("Cleanup Complete")
    
    if success:
        print_success("All resources deleted successfully")
        
        # Delete output file if it exists
        if resources:
            output_file = args.output_file
            if not os.path.isabs(output_file):
                output_file = os.path.join(os.path.dirname(__file__), args.output_file)
            
            if os.path.exists(output_file):
                try:
                    os.remove(output_file)
                    print_info(f"Deleted output file: {output_file}")
                except Exception as e:
                    print_warning(f"Failed to delete output file: {e}")
    else:
        print_warning("Some resources may not have been deleted. Check the errors above.")
        sys.exit(1)


if __name__ == '__main__':
    main()
