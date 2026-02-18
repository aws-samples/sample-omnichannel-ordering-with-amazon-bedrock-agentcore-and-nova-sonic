#!/usr/bin/env python3
"""
Cleanup Script for Synthetic Data

Removes all synthetic data from DynamoDB tables.

Usage:
    python cleanup_data.py
"""
import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Optional

# Add lib directory to path
sys.path.insert(0, str(Path(__file__).parent / 'lib'))

import boto3
from botocore.exceptions import ClientError


# Color codes for terminal output
class Colors:
    BLUE = '\033[0;34m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    RED = '\033[0;31m'
    CYAN = '\033[0;36m'
    NC = '\033[0m'  # No Color


def print_header(text: str):
    """Print section header."""
    print(f"\n{Colors.BLUE}{'=' * 80}{Colors.NC}")
    print(f"{Colors.BLUE}  {text}{Colors.NC}")
    print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}\n")


def print_success(text: str):
    """Print success message."""
    print(f"{Colors.GREEN}✅ {text}{Colors.NC}")


def print_error(text: str):
    """Print error message."""
    print(f"{Colors.RED}❌ {text}{Colors.NC}")


def print_warning(text: str):
    """Print warning message."""
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.NC}")


def print_info(text: str):
    """Print info message."""
    print(f"{Colors.CYAN}ℹ️  {text}{Colors.NC}")


def load_deployment_outputs() -> Optional[Dict]:
    """
    Load deployment outputs from CDK.
    
    Returns:
        Deployment outputs dictionary or None if not found
    """
    outputs_path = Path(__file__).parent.parent.parent / 'cdk-outputs' / 'backend-infrastructure.json'
    
    if not outputs_path.exists():
        print_error(f"Deployment outputs not found at: {outputs_path}")
        return None
    
    try:
        with open(outputs_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print_error(f"Failed to load deployment outputs: {e}")
        return None


def extract_table_names(outputs: Dict) -> Optional[Dict[str, str]]:
    """
    Extract DynamoDB table names from deployment outputs.
    
    Args:
        outputs: Deployment outputs dictionary
        
    Returns:
        Dictionary of table names or None if extraction fails
    """
    try:
        dynamodb_stack = outputs.get('QSR-DynamoDBStack', {})
        
        tables = {
            'locations': dynamodb_stack.get('LocationsTableName'),
            'customers': dynamodb_stack.get('CustomersTableName'),
            'menu': dynamodb_stack.get('MenuTableName'),
            'orders': dynamodb_stack.get('OrdersTableName')
        }
        
        if not all(tables.values()):
            print_error("Missing table names in deployment outputs")
            return None
        
        return tables
        
    except Exception as e:
        print_error(f"Failed to extract table names: {e}")
        return None


def get_table_item_count(dynamodb_client, table_name: str) -> int:
    """
    Get approximate item count in table.
    
    Args:
        dynamodb_client: Boto3 DynamoDB client
        table_name: Table name
        
    Returns:
        Approximate item count
    """
    try:
        response = dynamodb_client.describe_table(TableName=table_name)
        return response['Table']['ItemCount']
    except ClientError:
        return 0


def scan_and_delete_items(table_name: str, region: str = 'us-east-1') -> Dict[str, int]:
    """
    Scan table and delete all items.
    
    Args:
        table_name: DynamoDB table name
        region: AWS region
        
    Returns:
        Dictionary with deleted count and errors
    """
    dynamodb = boto3.resource('dynamodb', region_name=region)
    table = dynamodb.Table(table_name)
    
    deleted_count = 0
    error_count = 0
    
    try:
        # Get table key schema
        response = table.meta.client.describe_table(TableName=table_name)
        key_schema = response['Table']['KeySchema']
        key_names = [key['AttributeName'] for key in key_schema]
        
        # Scan and delete in batches
        scan_kwargs = {}
        
        while True:
            response = table.scan(**scan_kwargs)
            items = response.get('Items', [])
            
            if not items:
                break
            
            # Delete items in batches of 25
            with table.batch_writer() as batch:
                for item in items:
                    try:
                        # Extract only key attributes for deletion
                        key = {k: item[k] for k in key_names if k in item}
                        batch.delete_item(Key=key)
                        deleted_count += 1
                    except Exception as e:
                        print_error(f"Failed to delete item: {e}")
                        error_count += 1
            
            # Check if there are more items to scan
            if 'LastEvaluatedKey' not in response:
                break
            
            scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
        
        return {'deleted': deleted_count, 'errors': error_count}
        
    except ClientError as e:
        print_error(f"Error scanning table {table_name}: {e}")
        return {'deleted': deleted_count, 'errors': error_count + 1}
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        return {'deleted': deleted_count, 'errors': error_count + 1}


def confirm_cleanup(force: bool = False) -> bool:
    """
    Ask user to confirm cleanup operation.
    
    Args:
        force: Skip confirmation prompt
    
    Returns:
        True if user confirms, False otherwise
    """
    if force:
        return True
    
    print_warning("This will DELETE ALL DATA from the following tables:")
    print_warning("  - QSR-Locations")
    print_warning("  - QSR-Customers")
    print_warning("  - QSR-Menu")
    print_warning("  - QSR-Orders")
    print()
    print_warning("This operation CANNOT be undone!")
    print()
    
    while True:
        choice = input(f"{Colors.CYAN}Are you sure you want to proceed? (yes/no): {Colors.NC}").strip().lower()
        
        if choice in ['yes', 'y']:
            return True
        elif choice in ['no', 'n']:
            return False
        else:
            print_warning("Please enter 'yes' or 'no'")


def main():
    """Main execution flow."""
    force = '--force' in sys.argv
    
    print_header("QSR Ordering System - Cleanup Synthetic Data")
    
    # Step 1: Load deployment outputs
    print_info("Loading deployment outputs...")
    outputs = load_deployment_outputs()
    if not outputs:
        return 1
    
    table_names = extract_table_names(outputs)
    if not table_names:
        return 1
    
    print_success("Deployment outputs loaded")
    print()
    
    # Step 2: Show current item counts
    print_header("Current Table Status")
    
    dynamodb_client = boto3.client('dynamodb', region_name='us-east-1')
    
    for table_type, table_name in table_names.items():
        count = get_table_item_count(dynamodb_client, table_name)
        print(f"{Colors.CYAN}{table_type.capitalize()}:{Colors.NC} {count} items in {table_name}")
    
    print()
    
    # Step 3: Confirm cleanup
    if not confirm_cleanup(force):
        print_warning("Cleanup cancelled")
        return 0
    
    print()
    
    # Step 4: Delete all items
    print_header("Deleting Data")
    
    total_deleted = 0
    total_errors = 0
    
    for table_type, table_name in table_names.items():
        print_info(f"Cleaning {table_name}...")
        result = scan_and_delete_items(table_name)
        
        if result['errors'] > 0:
            print_error(f"Deleted {result['deleted']} items with {result['errors']} errors")
        else:
            print_success(f"Deleted {result['deleted']} items")
        
        total_deleted += result['deleted']
        total_errors += result['errors']
        print()
    
    # Final summary
    print_header("Cleanup Complete!")
    
    if total_errors > 0:
        print_warning(f"Deleted {total_deleted} items with {total_errors} errors")
    else:
        print_success(f"Successfully deleted {total_deleted} items")
    
    print()
    print_info("All synthetic data has been removed from DynamoDB tables")
    print()
    
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
        print_warning("Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
