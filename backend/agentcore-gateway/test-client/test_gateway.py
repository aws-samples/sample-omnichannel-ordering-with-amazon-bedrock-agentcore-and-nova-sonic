#!/usr/bin/env python3
"""
AgentCore Gateway Test Client

This script tests the AgentCore Gateway by:
1. Connecting to the gateway with AWS IAM authentication
2. Listing available MCP tools
3. Calling tools with test parameters

Usage:
    python test_gateway.py --gateway-url <gateway-url>
    python test_gateway.py --gateway-url <gateway-url> --tool-name get_menu
    python test_gateway.py --gateway-url <gateway-url> --list-tools
"""

import argparse
import json
import sys
from typing import Dict, Any, List, Optional

import boto3
import requests
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.exceptions import NoCredentialsError, PartialCredentialsError, ClientError


class AgentCoreGatewayClient:
    """Client for testing AgentCore Gateway MCP endpoints."""
    
    def __init__(self, gateway_url: str, region: str = 'us-east-1', profile: Optional[str] = None):
        """
        Initialize the gateway client.
        
        Args:
            gateway_url: Full URL to the AgentCore Gateway (e.g., https://gateway-id.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp)
            region: AWS region (default: us-east-1)
            profile: AWS CLI profile (optional)
        """
        self.gateway_url = gateway_url.rstrip('/')
        self.region = region
        
        # Initialize AWS session
        try:
            if profile:
                self.session = boto3.Session(profile_name=profile, region_name=region)
                print(f"✓ Using AWS profile: {profile}")
            else:
                self.session = boto3.Session(region_name=region)
            
            # Attempt to get credentials
            self.credentials = self.session.get_credentials()
            
            if self.credentials is None:
                raise NoCredentialsError()
            
            # Verify credentials are accessible
            _ = self.credentials.access_key
            
            # Validate credentials are not expired by making a test AWS API call
            try:
                sts_client = self.session.client('sts')
                sts_client.get_caller_identity()
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', '')
                if error_code in ['ExpiredToken', 'ExpiredTokenException', 'InvalidClientTokenId']:
                    print("\n" + "="*60)
                    print("  ✗ ERROR: AWS Credentials Expired")
                    print("="*60)
                    print("\nYour AWS credentials have expired and need to be refreshed.")
                    print("\nTo fix this, refresh your credentials using one of these methods:")
                    print("\n1. For AWS CLI credentials:")
                    print("   aws configure")
                    print("\n2. For AWS SSO:")
                    print("   aws sso login --profile your-profile-name")
                    print("\n3. For temporary credentials (STS):")
                    print("   Re-run the command that generated your temporary credentials")
                    print("\n4. For environment variables:")
                    print("   Export fresh credentials:")
                    print("   export AWS_ACCESS_KEY_ID=your_new_access_key")
                    print("   export AWS_SECRET_ACCESS_KEY=your_new_secret_key")
                    print("   export AWS_SESSION_TOKEN=your_new_session_token")
                    print("\nFor more information, visit:")
                    print("https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html")
                    print("="*60 + "\n")
                    sys.exit(1)
                else:
                    # Re-raise if it's a different error
                    raise
            
        except NoCredentialsError:
            print("\n" + "="*60)
            print("  ✗ ERROR: AWS Credentials Not Found")
            print("="*60)
            print("\nNo AWS credentials were detected in your terminal session.")
            print("\nTo fix this, configure AWS credentials using one of these methods:")
            print("\n1. AWS CLI Configuration:")
            print("   aws configure")
            print("\n2. Environment Variables:")
            print("   export AWS_ACCESS_KEY_ID=your_access_key")
            print("   export AWS_SECRET_ACCESS_KEY=your_secret_key")
            print("   export AWS_SESSION_TOKEN=your_session_token  # (if using temporary credentials)")
            print("\n3. AWS Profile:")
            print("   python test_gateway.py --gateway-url <url> --profile your-profile-name")
            print("\n4. IAM Role (if running on EC2/Lambda):")
            print("   Ensure your instance/function has an IAM role attached")
            print("\nFor more information, visit:")
            print("https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html")
            print("="*60 + "\n")
            sys.exit(1)
            
        except PartialCredentialsError as e:
            print("\n" + "="*60)
            print("  ✗ ERROR: Incomplete AWS Credentials")
            print("="*60)
            print(f"\n{str(e)}")
            print("\nYour AWS credentials are incomplete. Please ensure you have:")
            print("  - AWS_ACCESS_KEY_ID")
            print("  - AWS_SECRET_ACCESS_KEY")
            print("  - AWS_SESSION_TOKEN (if using temporary credentials)")
            print("\nRun 'aws configure' to set up your credentials properly.")
            print("="*60 + "\n")
            sys.exit(1)
            
        except Exception as e:
            print("\n" + "="*60)
            print("  ✗ ERROR: Failed to Load AWS Credentials")
            print("="*60)
            print(f"\n{str(e)}")
            print("\nPlease check your AWS configuration and try again.")
            print("="*60 + "\n")
            sys.exit(1)
        
        print(f"✓ Initialized client for gateway: {self.gateway_url}")
        print(f"✓ Using region: {self.region}")
        print(f"✓ AWS credentials loaded successfully")
    
    def _sign_request(self, method: str, url: str, headers: Dict[str, str], body: Optional[str] = None) -> Dict[str, str]:
        """
        Sign an HTTP request with AWS SigV4.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            url: Full URL
            headers: Request headers
            body: Request body (optional)
        
        Returns:
            Signed headers
        """
        # Create AWS request
        request = AWSRequest(method=method, url=url, headers=headers, data=body)
        
        # Sign with SigV4
        SigV4Auth(self.credentials, 'bedrock-agentcore', self.region).add_auth(request)
        
        return dict(request.headers)
    
    def _make_request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Make an authenticated request to the gateway.
        
        Args:
            method: HTTP method
            path: API path (e.g., '/tools/list')
            body: Request body (optional)
        
        Returns:
            Response JSON
        """
        url = f"{self.gateway_url}{path}"
        
        # Prepare headers
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
        
        # Prepare body
        body_str = json.dumps(body) if body else None
        
        # Sign request
        signed_headers = self._sign_request(method, url, headers, body_str)
        
        # Make request with timeout
        # Security Note: Adding explicit timeout to prevent indefinite hangs
        # and potential resource exhaustion from slow/unresponsive endpoints
        try:
            if method == 'GET':
                response = requests.get(url, headers=signed_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, headers=signed_headers, data=body_str, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            # Security Note: Explicitly check for HTTP errors
            # This ensures we handle 4xx/5xx responses appropriately
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"✗ Request failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"✗ Response status: {e.response.status_code}")
                print(f"✗ Response body: {e.response.text}")
            sys.exit(1)
    
    def list_tools(self) -> List[Dict[str, Any]]:
        """
        List all available tools from the gateway.
        
        Returns:
            List of tool definitions
        """
        print("\n" + "="*60)
        print("  Listing Available Tools")
        print("="*60 + "\n")
        
        # MCP protocol uses JSON-RPC 2.0 format
        body = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list",
            "params": {}
        }
        
        response = self._make_request('POST', '', body=body)
        
        # Extract tools from JSON-RPC response
        result = response.get('result', {})
        tools = result.get('tools', [])
        print(f"✓ Found {len(tools)} tool(s)\n")
        
        for i, tool in enumerate(tools, 1):
            print(f"{i}. {tool.get('name', 'Unknown')}")
            print(f"   Description: {tool.get('description', 'N/A')}")
            
            # Show input schema
            input_schema = tool.get('inputSchema', {})
            if input_schema:
                properties = input_schema.get('properties', {})
                required = input_schema.get('required', [])
                
                if properties:
                    print(f"   Parameters:")
                    for param_name, param_info in properties.items():
                        param_type = param_info.get('type', 'unknown')
                        param_desc = param_info.get('description', 'N/A')
                        is_required = ' (required)' if param_name in required else ' (optional)'
                        print(f"     - {param_name}: {param_type}{is_required}")
                        print(f"       {param_desc}")
            print()
        
        return tools
    
    def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """
        Call a specific tool with arguments.
        
        Args:
            tool_name: Name of the tool to call
            arguments: Tool arguments
        
        Returns:
            Tool response
        """
        print("\n" + "="*60)
        print(f"  Calling Tool: {tool_name}")
        print("="*60 + "\n")
        
        print(f"Arguments: {json.dumps(arguments, indent=2)}\n")
        
        # MCP protocol uses JSON-RPC 2.0 format
        body = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        
        response = self._make_request('POST', '', body=body)
        
        print("✓ Tool call successful\n")
        print("Response:")
        print(json.dumps(response, indent=2))
        
        return response
    
    def test_connection(self) -> bool:
        """
        Test basic connectivity to the gateway.
        
        Returns:
            True if connection successful
        """
        print("\n" + "="*60)
        print("  Testing Gateway Connection")
        print("="*60 + "\n")
        
        try:
            # Try to list tools as a connectivity test using MCP JSON-RPC format
            body = {
                "jsonrpc": "2.0",
                "id": 0,
                "method": "tools/list",
                "params": {}
            }
            self._make_request('POST', '', body=body)
            print("✓ Connection successful!")
            return True
        except Exception as e:
            print(f"✗ Connection failed: {e}")
            return False


def parse_arguments() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description='Test AgentCore Gateway MCP endpoints'
    )
    parser.add_argument(
        '--gateway-url',
        required=True,
        help='Gateway URL (e.g., https://gateway-id.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp)'
    )
    parser.add_argument(
        '--region',
        default='us-east-1',
        help='AWS region (default: us-east-1)'
    )
    parser.add_argument(
        '--profile',
        help='AWS CLI profile (optional)'
    )
    parser.add_argument(
        '--list-tools',
        action='store_true',
        help='List all available tools'
    )
    parser.add_argument(
        '--tool-name',
        help='Name of tool to call'
    )
    parser.add_argument(
        '--tool-args',
        help='Tool arguments as JSON string (e.g., \'{"param": "value"}\')'
    )
    parser.add_argument(
        '--test-connection',
        action='store_true',
        help='Test basic connectivity'
    )
    
    return parser.parse_args()


def main():
    """Main test function."""
    args = parse_arguments()
    
    # Initialize client
    client = AgentCoreGatewayClient(
        gateway_url=args.gateway_url,
        region=args.region,
        profile=args.profile
    )
    
    # Test connection
    if args.test_connection:
        success = client.test_connection()
        sys.exit(0 if success else 1)
    
    # List tools
    if args.list_tools:
        client.list_tools()
        sys.exit(0)
    
    # Call tool
    if args.tool_name:
        if not args.tool_args:
            print("✗ Error: --tool-args required when calling a tool")
            sys.exit(1)
        
        try:
            arguments = json.loads(args.tool_args)
        except json.JSONDecodeError as e:
            print(f"✗ Error: Invalid JSON in --tool-args: {e}")
            sys.exit(1)
        
        client.call_tool(args.tool_name, arguments)
        sys.exit(0)
    
    # Default: list tools
    print("No action specified. Listing tools by default.")
    print("Use --help to see available options.\n")
    client.list_tools()


if __name__ == '__main__':
    main()
