#!/usr/bin/env python3
"""
Utility functions for AgentCore Gateway deployment scripts
"""

import json
import os
import time
import zipfile
from io import BytesIO
from typing import Dict, List, Any, Optional
import yaml


def load_config(config_file: Optional[str], cli_args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Load configuration from YAML file and merge with CLI arguments.
    CLI arguments take precedence over YAML config.
    If no config file is provided, uses CLI arguments with defaults.
    
    Args:
        config_file: Path to YAML configuration file (optional)
        cli_args: Dictionary of CLI arguments
        
    Returns:
        Merged configuration dictionary
    """
    # Start with default config structure
    config = {
        'aws': {
            'region': cli_args.get('region') or 'us-east-1',
            'profile': cli_args.get('profile') or 'default'
        },
        'backend': {
            'api_gateway_id': cli_args.get('api_gateway_id'),
            'api_gateway_stage': cli_args.get('stage') or 'prod'
        },
        'gateway': {
            'name': cli_args.get('gateway_name') or 'qsr-ordering-gateway',
            'description': 'AgentCore Gateway for QSR ordering system - exposes Backend API as MCP tools'
        },
        'lambda': {
            'function_name': 'qsr-gateway-request-interceptor',
            'runtime': 'nodejs20.x',
            'timeout': 30,
            'memory_size': 256,
            'handler': 'index.handler'
        },
        'iam': {
            'gateway_role_name': 'QSRAgentCoreGatewayRole',
            'lambda_role_name': 'QSRRequestInterceptorRole'
        },
        'output': {
            'save_to_file': True,
            'output_file': cli_args.get('output_file') or 'deployment-outputs.json'
        }
    }
    
    # Load YAML config if provided
    if config_file and os.path.exists(config_file):
        with open(config_file, 'r', encoding='utf-8') as f:
            yaml_config = yaml.safe_load(f)
        
        # Merge YAML config with defaults (YAML takes precedence over defaults)
        if 'aws' in yaml_config:
            config['aws'].update(yaml_config['aws'])
        if 'backend' in yaml_config:
            config['backend'].update(yaml_config['backend'])
        if 'gateway' in yaml_config:
            config['gateway'].update(yaml_config['gateway'])
        if 'lambda' in yaml_config:
            config['lambda'].update(yaml_config['lambda'])
        if 'iam' in yaml_config:
            config['iam'].update(yaml_config['iam'])
        if 'output' in yaml_config:
            config['output'].update(yaml_config['output'])
    
    # CLI args take final precedence
    if cli_args.get('region'):
        config['aws']['region'] = cli_args['region']
    if cli_args.get('profile'):
        config['aws']['profile'] = cli_args['profile']
    if cli_args.get('api_gateway_id'):
        config['backend']['api_gateway_id'] = cli_args['api_gateway_id']
    if cli_args.get('stage'):
        config['backend']['api_gateway_stage'] = cli_args['stage']
    if cli_args.get('gateway_name'):
        config['gateway']['name'] = cli_args['gateway_name']
    if cli_args.get('output_file'):
        config['output']['output_file'] = cli_args['output_file']
    
    return config


def parse_openapi_schema(schema: Dict[str, Any]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Parse OpenAPI schema to generate tool filters and tool overrides.
    
    Args:
        schema: OpenAPI 3.0 schema dictionary
        
    Returns:
        Tuple of (tool_filters, tool_overrides)
    """
    tool_filters = []
    tool_overrides = []
    
    if 'paths' not in schema:
        print("⚠️  Warning: No paths found in OpenAPI schema")
        return tool_filters, tool_overrides
    
    valid_methods = ['get', 'post', 'put', 'delete', 'patch']
    
    for path, path_item in schema['paths'].items():
        if not isinstance(path_item, dict):
            continue
        
        methods = []
        
        for method in valid_methods:
            if method in path_item:
                methods.append(method.upper())
                
                # Create tool override for each method
                operation = path_item[method]
                operation_id = operation.get('operationId') or generate_operation_id(path, method)
                description = operation.get('summary') or operation.get('description') or ''
                
                tool_overrides.append({
                    'name': operation_id,
                    'path': path,
                    'method': method.upper(),
                    'description': description
                })
        
        # Create tool filter if methods exist
        if methods:
            tool_filters.append({
                'filterPath': path,
                'methods': methods
            })
            print(f"  - {path}: {', '.join(methods)}")
    
    return tool_filters, tool_overrides


def generate_operation_id(path: str, method: str) -> str:
    """
    Generate an operation ID from path and method if not present in schema.
    
    Args:
        path: API path (e.g., /customers/profile)
        method: HTTP method (e.g., get)
        
    Returns:
        Generated operation ID (e.g., getCustomersProfile)
    """
    # Remove path parameters and split
    path_parts = [p for p in path.split('/') if p and not p.startswith('{')]
    
    # Convert to camelCase
    camel_case_path = ''.join(
        part.capitalize() if i > 0 else part 
        for i, part in enumerate(path_parts)
    )
    
    return f"{method}{camel_case_path.capitalize()}"


def package_lambda_code(source_dir: str) -> bytes:
    """
    Package Lambda function code into a ZIP file.
    
    Args:
        source_dir: Directory containing Lambda function code
        
    Returns:
        ZIP file contents as bytes
    """
    zip_buffer = BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, source_dir)
                zip_file.write(file_path, arcname)
    
    return zip_buffer.getvalue()


def wait_for_lambda_active(lambda_client, function_name: str, max_wait: int = 60) -> bool:
    """
    Wait for Lambda function to become active.
    
    Args:
        lambda_client: Boto3 Lambda client
        function_name: Name of the Lambda function
        max_wait: Maximum time to wait in seconds
        
    Returns:
        True if function is active, False if timeout
    """
    start_time = time.time()
    
    while time.time() - start_time < max_wait:
        try:
            response = lambda_client.get_function(FunctionName=function_name)
            state = response['Configuration']['State']
            
            if state == 'Active':
                return True
            elif state == 'Failed':
                print(f"❌ Lambda function failed to activate: {response['Configuration'].get('StateReasonCode')}")
                return False
            
            print(f"⏳ Waiting for Lambda function to become active (current state: {state})...")
            # AWS Lambda state transitions require polling with delays for eventual consistency
            time.sleep(2)
        except Exception as e:
            print(f"⚠️  Error checking Lambda function state: {e}")
            # Retry delay for transient errors during Lambda state checks
            time.sleep(2)
    
    print(f"❌ Timeout waiting for Lambda function to become active")
    return False


def save_outputs(outputs: Dict[str, Any], file_path: str) -> None:
    """
    Save deployment outputs to a JSON file.
    
    Args:
        outputs: Dictionary of deployment outputs
        file_path: Path to save the JSON file
    """
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(outputs, f, indent=2)
    
    print(f"\n✅ Outputs saved to: {file_path}")


def load_outputs(file_path: str) -> Optional[Dict[str, Any]]:
    """
    Load deployment outputs from a JSON file.
    
    Args:
        file_path: Path to the JSON file
        
    Returns:
        Dictionary of deployment outputs or None if file doesn't exist
    """
    if not os.path.exists(file_path):
        return None
    
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def format_arn(service: str, region: str, account_id: str, resource: str) -> str:
    """
    Format an AWS ARN.
    
    Args:
        service: AWS service name
        region: AWS region
        account_id: AWS account ID
        resource: Resource identifier
        
    Returns:
        Formatted ARN string
    """
    return f"arn:aws:{service}:{region}:{account_id}:{resource}"


def print_section(title: str) -> None:
    """Print a section header."""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


def print_success(message: str) -> None:
    """Print a success message."""
    print(f"✅ {message}")


def print_error(message: str) -> None:
    """Print an error message."""
    print(f"❌ {message}")


def print_warning(message: str) -> None:
    """Print a warning message."""
    print(f"⚠️  {message}")


def print_info(message: str) -> None:
    """Print an info message."""
    print(f"ℹ️  {message}")
