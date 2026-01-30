#!/usr/bin/env python3
"""
Cognito + SigV4 Integrated Test Client for AWS Bedrock AgentCore

This client demonstrates the complete authentication flow:
1. Authenticate with Cognito User Pool → JWT IdToken
2. Extract User Pool ID from JWT token
3. Get Identity ID from Cognito Identity Pool
4. Exchange JWT for temporary AWS credentials
5. Create SigV4 presigned WebSocket URL
6. Connect to AgentCore Runtime via WebSocket

Usage:
    python client-cognito-sigv4.py \\
        --username AppUser \\
        --password $Test123$ \\
        --user-pool-id us-east-1_XXXXXXXXX \\
        --client-id 1avtmgfmlga01ecigptie85u5v \\
        --identity-pool-id us-east-1:7c5c3e3a-8f4a-4b5e-9d2a-1c3b5e7f9a2b \\
        --runtime-arn arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/RUNTIMEID \\
        --region us-east-1
"""
import argparse
import base64
import json
import os
import sys
import webbrowser
import secrets
import string
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

import boto3
from botocore.auth import SigV4QueryAuth
from botocore.awsrequest import AWSRequest
from botocore.exceptions import ClientError


# ============================================================================
# WebSocket Helper Functions
# ============================================================================

def create_presigned_url(url, session, region, service='bedrock-agentcore', expires=300):
    """
    Create AWS SigV4 presigned URL for WebSocket connection
    
    Args:
        url: WebSocket URL (wss://)
        session: boto3.Session with credentials
        region: AWS region
        service: AWS service name (default: bedrock-agentcore)
        expires: URL expiration time in seconds (default: 300)
    
    Returns:
        Presigned WebSocket URL
    """
    credentials = session.get_credentials()
    
    # Convert wss:// to https:// for signing
    https_url = url.replace("wss://", "https://")
    parsed_url = urlparse(https_url)
    
    # Create AWS request
    request = AWSRequest(
        method='GET',
        url=https_url,
        headers={'Host': parsed_url.netloc}
    )
    
    # Sign request with SigV4
    SigV4QueryAuth(credentials, service, region, expires=expires).add_auth(request)
    
    # Convert back to wss://
    return request.url.replace("https://", "wss://")


class CognitoSigV4ClientHandler(BaseHTTPRequestHandler):
    """HTTP request handler that serves the Strands client with Cognito auth"""

    # Class variables to store connection details
    websocket_url = None
    session_id = None
    credentials_expiration = None
    access_token = None  # Store Access Token (for API authentication)
    id_token = None  # Store ID Token (for debugging/identity claims)
    
    # Store config for regenerating URLs
    runtime_arn = None
    region = None
    service = None
    expires = None
    qualifier = None
    
    # Cognito credentials for re-authentication
    username = None
    password = None
    user_pool_id = None
    client_id = None
    identity_pool_id = None
    
    # AWS Location Service config
    map_name = None
    place_index_name = None

    def log_message(self, format, *args):
        """Override to provide cleaner logging"""
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)

        if parsed_path.path == "/" or parsed_path.path == "/index.html":
            self.serve_client_page()
        elif parsed_path.path == "/api/connection":
            self.serve_connection_info()
        elif parsed_path.path == "/api/jwt-token":
            self.serve_jwt_token()
        elif parsed_path.path == "/api/config":
            self.serve_config()
        else:
            self.send_error(404, "File not found")

    def do_POST(self):
        """Handle POST requests"""
        parsed_path = urlparse(self.path)

        if parsed_path.path == "/api/regenerate":
            self.regenerate_url()
        else:
            self.send_error(404, "Endpoint not found")

    def serve_client_page(self):
        """Serve the HTML client with pre-configured connection"""
        try:
            # Read the HTML template
            html_path = os.path.join(os.path.dirname(__file__), "clientUI.html")
            with open(html_path, "r", encoding="utf-8") as f:
                html_content = f.read()

            # Inject the WebSocket URL if provided
            if self.websocket_url:
                html_content = html_content.replace(
                    'id="presignedUrl" placeholder="wss://endpoint/runtimes/arn/ws?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Signature=..."',
                    f'id="presignedUrl" placeholder="wss://endpoint/runtimes/arn/ws?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Signature=..." value="{self.websocket_url}"',
                )

            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.send_header("Content-Length", len(html_content.encode()))
            self.end_headers()
            self.wfile.write(html_content.encode())

        except FileNotFoundError:
            self.send_error(404, "clientUI.html not found")
        except Exception as e:
            self.send_error(500, f"Internal server error: {str(e)}")

    def serve_connection_info(self):
        """Serve the connection information as JSON"""
        response = {
            "websocket_url": self.websocket_url or "",
            "session_id": self.session_id,
            "is_presigned": True,
            "can_regenerate": self.runtime_arn is not None,
            "credentials_expiration": self.credentials_expiration,
            "has_access_token": self.access_token is not None,
            "has_id_token": self.id_token is not None,
            "status": "ok" if self.websocket_url else "no_connection",
        }

        response_json = json.dumps(response, indent=2)

        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.send_header("Content-Length", len(response_json.encode()))
        self.end_headers()
        self.wfile.write(response_json.encode())

    def serve_jwt_token(self):
        """Serve the Access Token and ID Token for debugging"""
        if not self.access_token and not self.id_token:
            error_response = {
                "status": "error",
                "message": "No tokens available"
            }
            response_json = json.dumps(error_response)
            self.send_response(404)
            self.send_header("Content-type", "application/json")
            self.send_header("Content-Length", len(response_json.encode()))
            self.end_headers()
            self.wfile.write(response_json.encode())
            return

        response = {
            "status": "ok",
            "access_token": self.access_token if self.access_token else None,
            "id_token": self.id_token if self.id_token else None,
            "access_token_preview": f"{self.access_token[:50]}..." if self.access_token and len(self.access_token) > 50 else self.access_token,
            "id_token_preview": f"{self.id_token[:50]}..." if self.id_token and len(self.id_token) > 50 else self.id_token
        }

        response_json = json.dumps(response, indent=2)

        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.send_header("Content-Length", len(response_json.encode()))
        self.end_headers()
        self.wfile.write(response_json.encode())

    def serve_config(self):
        """Serve AWS configuration for map initialization"""
        if not self.identity_pool_id or not self.user_pool_id or not self.region:
            error_response = {
                "status": "error",
                "message": "Configuration not available"
            }
            response_json = json.dumps(error_response)
            self.send_response(404)
            self.send_header("Content-type", "application/json")
            self.send_header("Content-Length", len(response_json.encode()))
            self.end_headers()
            self.wfile.write(response_json.encode())
            return

        response = {
            "status": "ok",
            "identity_pool_id": self.identity_pool_id,
            "user_pool_id": self.user_pool_id,
            "region": self.region,
            "map_name": self.map_name if self.map_name else "QSRRestaurantMap",
            "place_index_name": self.place_index_name if self.place_index_name else "QSRRestaurantIndex"
        }

        response_json = json.dumps(response, indent=2)

        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.send_header("Content-Length", len(response_json.encode()))
        self.end_headers()
        self.wfile.write(response_json.encode())


    def regenerate_url(self):
        """Regenerate the presigned URL with fresh Cognito credentials"""
        try:
            if not self.runtime_arn:
                error_response = {
                    "status": "error",
                    "message": "Cannot regenerate URL - missing runtime configuration",
                }
                response_json = json.dumps(error_response)
                self.send_response(400)
                self.send_header("Content-type", "application/json")
                self.send_header("Content-Length", len(response_json.encode()))
                self.end_headers()
                self.wfile.write(response_json.encode())
                return

            print("\n🔄 Regenerating presigned URL with fresh Cognito credentials...")
            
            # Re-authenticate with Cognito to get fresh credentials
            credentials, access_token, id_token = authenticate_with_cognito(
                self.username,
                self.password,
                self.user_pool_id,
                self.client_id,
                self.identity_pool_id,
                self.region
            )
            
            # Update tokens
            CognitoSigV4ClientHandler.access_token = access_token
            CognitoSigV4ClientHandler.id_token = id_token
            
            # Generate new presigned URL with fresh credentials (JWT sent as WebSocket message)
            base_url = f"wss://bedrock-agentcore.{self.region}.amazonaws.com/runtimes/{self.runtime_arn}/ws?qualifier={self.qualifier}&voice_id=matthew"
            
            # Create boto3 session with temporary credentials
            session = boto3.Session(
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretKey'],
                aws_session_token=credentials['SessionToken'],
                region_name=self.region
            )
            
            # Create presigned URL with temporary credentials
            new_url = create_presigned_url(
                base_url, 
                session=session,
                region=self.region, 
                service=self.service, 
                expires=self.expires
            )
            
            # Update the class variables
            CognitoSigV4ClientHandler.websocket_url = new_url
            CognitoSigV4ClientHandler.credentials_expiration = credentials['Expiration']

            response = {
                "status": "ok",
                "websocket_url": new_url,
                "expires_in": self.expires,
                "credentials_expiration": credentials['Expiration'].isoformat(),
                "message": "URL regenerated successfully with fresh Cognito credentials",
            }

            response_json = json.dumps(response, indent=2)

            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Content-Length", len(response_json.encode()))
            self.end_headers()
            self.wfile.write(response_json.encode())

            print(f"✅ Regenerated presigned URL (expires in {self.expires} seconds)")
            print(f"   Credentials expire: {credentials['Expiration']}")

        except Exception as e:
            error_response = {"status": "error", "message": str(e)}
            response_json = json.dumps(error_response)
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.send_header("Content-Length", len(response_json.encode()))
            self.end_headers()
            self.wfile.write(response_json.encode())
            print(f"❌ Error regenerating URL: {e}")


def authenticate_with_cognito(username, password, user_pool_id, client_id, identity_pool_id, region):
    """
    Complete Cognito authentication flow to obtain temporary AWS credentials
    
    Returns:
        tuple: (credentials dict, access_token string, id_token string)
            credentials: Temporary AWS credentials with AccessKeyId, SecretKey, SessionToken, Expiration
            access_token: JWT Access Token from Cognito User Pool (for API authentication)
            id_token: JWT ID Token from Cognito User Pool (for identity claims)
    """
    print("\n" + "=" * 70)
    print("🔐 Cognito Authentication Flow")
    print("=" * 70)
    
    # Step 1: Authenticate with Cognito User Pool
    print("\n📝 Step 1: Authenticating with Cognito User Pool...")
    print(f"   User Pool ID: {user_pool_id}")
    print(f"   Client ID: {client_id}")
    print(f"   Username: {username}")
    
    cognito_idp = boto3.client('cognito-idp', region_name=region)
    
    try:
        auth_response = cognito_idp.initiate_auth(
            AuthFlow='USER_PASSWORD_AUTH',
            ClientId=client_id,
            AuthParameters={
                'USERNAME': username,
                'PASSWORD': password
            }
        )
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', '')
        error_message = e.response.get('Error', {}).get('Message', '')
        
        if error_code == 'NotAuthorizedException':
            print("\n❌ Authentication Failed: Incorrect username or password")
            print("\n💡 Troubleshooting Tips:")
            print("   1. Check that you're using the correct password")
            print("   2. If you changed your password in another test, use the new password")
            print("   3. If this is your first login, use the temporary password sent to your email")
            print("   4. Verify the username is correct")
            print(f"\n   Error details: {error_message}")
            sys.exit(1)
        elif error_code == 'UserNotFoundException':
            print(f"\n❌ Authentication Failed: User '{username}' not found")
            print("\n💡 Troubleshooting Tips:")
            print("   1. Verify the username is correct")
            print("   2. Check that the user exists in the Cognito User Pool")
            print(f"   3. User Pool ID: {user_pool_id}")
            sys.exit(1)
        else:
            print(f"\n❌ Authentication failed: {error_message}")
            print(f"   Error code: {error_code}")
            sys.exit(1)
    
    # Handle NEW_PASSWORD_REQUIRED challenge
    if 'ChallengeName' in auth_response and auth_response['ChallengeName'] == 'NEW_PASSWORD_REQUIRED':
        print("⚠️  Password change required for first-time login")
        
        new_password = input("Enter new password: ")
        new_password_confirm = input("Confirm new password: ")
        
        if new_password != new_password_confirm:
            print("❌ Passwords do not match")
            sys.exit(1)
        
        print("Changing password...")
        try:
            auth_response = cognito_idp.respond_to_auth_challenge(
                ClientId=client_id,
                ChallengeName='NEW_PASSWORD_REQUIRED',
                Session=auth_response['Session'],
                ChallengeResponses={
                    'USERNAME': username,
                    'NEW_PASSWORD': new_password
                }
            )
            print("✅ Password changed successfully")
        except ClientError as e:
            error_message = e.response.get('Error', {}).get('Message', '')
            print(f"\n❌ Password change failed: {error_message}")
            print("\n💡 Password requirements:")
            print("   - Minimum 8 characters")
            print("   - At least one uppercase letter")
            print("   - At least one lowercase letter")
            print("   - At least one number")
            print("   - At least one special character")
            sys.exit(1)
    
    # Extract tokens from authentication result
    id_token = auth_response['AuthenticationResult']['IdToken']
    access_token = auth_response['AuthenticationResult']['AccessToken']
    
    print(f"✅ Authentication successful")
    print(f"   ID Token: {id_token[:50]}...")
    print(f"   Access Token: {access_token[:50]}...")
    
    # Step 2: Extract User Pool ID from ID Token
    print("\n🔍 Step 2: Extracting User Pool ID from ID Token...")
    
    # Decode ID Token (second part is the payload)
    jwt_parts = id_token.split('.')
    if len(jwt_parts) < 2:
        raise ValueError("Invalid ID Token format")
    
    # Add padding if needed for base64 decoding
    payload = jwt_parts[1]
    padding = 4 - len(payload) % 4
    if padding != 4:
        payload += '=' * padding
    
    try:
        decoded_payload = json.loads(base64.b64decode(payload))
        issuer = decoded_payload.get('iss', '')
        extracted_user_pool_id = issuer.split('/')[-1]
        print(f"✅ User Pool ID extracted: {extracted_user_pool_id}")
        
        # Verify it matches the provided user_pool_id
        if extracted_user_pool_id != user_pool_id:
            print(f"⚠️  Warning: Extracted User Pool ID ({extracted_user_pool_id}) doesn't match provided ({user_pool_id})")
    except Exception as e:
        print(f"⚠️  Warning: Could not extract User Pool ID from ID Token: {e}")
        extracted_user_pool_id = user_pool_id
    
    # Step 3: Get Identity ID from Cognito Identity Pool
    print("\n🆔 Step 3: Getting Identity ID from Cognito Identity Pool...")
    print(f"   Identity Pool ID: {identity_pool_id}")
    
    # Construct identity provider string
    identity_provider = f"cognito-idp.{region}.amazonaws.com/{extracted_user_pool_id}"
    print(f"   Identity Provider: {identity_provider}")
    
    cognito_identity = boto3.client('cognito-identity', region_name=region)
    
    try:
        identity_response = cognito_identity.get_id(
            IdentityPoolId=identity_pool_id,
            Logins={
                identity_provider: id_token
            }
        )
    except ClientError as e:
        print(f"❌ Failed to get Identity ID: {e}")
        raise
    
    identity_id = identity_response['IdentityId']
    print(f"✅ Identity ID obtained: {identity_id}")
    
    # Step 4: Exchange ID Token for temporary AWS credentials
    print("\n🔑 Step 4: Exchanging ID Token for temporary AWS credentials...")
    
    try:
        credentials_response = cognito_identity.get_credentials_for_identity(
            IdentityId=identity_id,
            Logins={
                identity_provider: id_token
            }
        )
    except ClientError as e:
        print(f"❌ Failed to get AWS credentials: {e}")
        raise
    
    credentials = credentials_response['Credentials']
    
    print(f"✅ Temporary AWS credentials obtained")
    print(f"   Access Key ID: {credentials['AccessKeyId'][:20]}...")
    print(f"   Expiration: {credentials['Expiration']}")
    
    print("\n" + "=" * 70)
    print("✅ Cognito Authentication Complete")
    print("=" * 70)
    
    return credentials, access_token, id_token


def main():
    parser = argparse.ArgumentParser(
        description="Cognito + SigV4 Integrated Test Client for AWS Bedrock AgentCore",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
This client demonstrates the complete authentication flow:
1. Authenticate with Cognito User Pool → JWT IdToken
2. Extract User Pool ID from JWT token
3. Get Identity ID from Cognito Identity Pool
4. Exchange JWT for temporary AWS credentials
5. Create SigV4 presigned WebSocket URL
6. Connect to AgentCore Runtime via WebSocket

Examples:
  # Full authentication flow
  python client-cognito-sigv4.py \\
    --username AppUser \\
    --password $Test123$ \\
    --user-pool-id us-east-1_XXXXXXXXX \\
    --client-id 1avtmgfmlga01ecigptie85u5v \\
    --identity-pool-id us-east-1:7c5c3e3a-8f4a-4b5e-9d2a-1c3b5e7f9a2b \\
    --runtime-arn arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/RUNTIMEID \\
    --region us-east-1
  
  # Using environment variables
  export AWS_REGION=us-east-1
  export COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
  export COGNITO_CLIENT_ID=1avtmgfmlga01ecigptie85u5v
  export COGNITO_IDENTITY_POOL_ID=us-east-1:7c5c3e3a-8f4a-4b5e-9d2a-1c3b5e7f9a2b
  python client-cognito-sigv4.py \\
    --username AppUser \\
    --password $Test123$ \\
    --runtime-arn arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/RUNTIMEID
""",
    )

    parser.add_argument(
        "--username",
        help="Cognito username (required)",
        required=True
    )

    parser.add_argument(
        "--password",
        help="Cognito password (required)",
        required=True
    )

    parser.add_argument(
        "--user-pool-id",
        default=os.getenv("COGNITO_USER_POOL_ID"),
        help="Cognito User Pool ID (e.g., us-east-1_XXXXXXXXX)",
        required=not os.getenv("COGNITO_USER_POOL_ID")
    )

    parser.add_argument(
        "--client-id",
        default=os.getenv("COGNITO_CLIENT_ID"),
        help="Cognito User Pool Client ID",
        required=not os.getenv("COGNITO_CLIENT_ID")
    )

    parser.add_argument(
        "--identity-pool-id",
        default=os.getenv("COGNITO_IDENTITY_POOL_ID"),
        help="Cognito Identity Pool ID (e.g., us-east-1:uuid)",
        required=not os.getenv("COGNITO_IDENTITY_POOL_ID")
    )

    parser.add_argument(
        "--runtime-arn",
        help="Runtime ARN for AWS Bedrock connection (required)",
        required=True
    )

    parser.add_argument(
        "--region",
        default=os.getenv("AWS_REGION", "us-east-1"),
        help="AWS region (default: us-east-1, from AWS_REGION env var)"
    )

    parser.add_argument(
        "--service",
        default="bedrock-agentcore",
        help="AWS service name (default: bedrock-agentcore)"
    )

    parser.add_argument(
        "--expires",
        type=int,
        default=3600,
        help="URL expiration time in seconds for presigned URLs (default: 3600 = 1 hour)"
    )

    parser.add_argument(
        "--qualifier",
        default="DEFAULT",
        help="Runtime qualifier (default: DEFAULT)"
    )

    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Web server port (default: 8000)"
    )

    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not automatically open browser"
    )

    parser.add_argument(
        "--map-name",
        default="QSRRestaurantMap",
        help="AWS Location Service Map name (default: QSRRestaurantMap)"
    )

    parser.add_argument(
        "--place-index-name",
        default="QSRRestaurantIndex",
        help="AWS Location Service Place Index name (default: QSRRestaurantIndex)"
    )

    args = parser.parse_args()

    # Extract region from runtime ARN if provided
    if args.runtime_arn:
        arn_parts = args.runtime_arn.split(":")
        if len(arn_parts) >= 4:
            arn_region = arn_parts[3]
            if arn_region and arn_region != args.region:
                args.region = arn_region

    print("=" * 70)
    print("🎙️ Cognito + SigV4 AgentCore Test Client")
    print("=" * 70)
    print(f"🌍 Region: {args.region}")
    print(f"🔑 Runtime ARN: {args.runtime_arn}")
    print(f"👤 Username: {args.username}")
    print(f"🏊 User Pool ID: {args.user_pool_id}")
    print(f"📱 Client ID: {args.client_id}")
    print(f"🆔 Identity Pool ID: {args.identity_pool_id}")
    print(f"⏰ URL expires in: {args.expires} seconds ({args.expires / 60:.1f} minutes)")
    print("=" * 70)

    session_id = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(50))

    try:
        # Authenticate with Cognito and get temporary AWS credentials
        credentials, access_token, id_token = authenticate_with_cognito(
            args.username,
            args.password,
            args.user_pool_id,
            args.client_id,
            args.identity_pool_id,
            args.region
        )

        # Step 5: Create SigV4 presigned WebSocket URL
        print("\n🔐 Step 5: Creating SigV4 presigned WebSocket URL...")
        
        # Create base URL (Access Token will be sent as WebSocket message)
        base_url = f"wss://bedrock-agentcore.{args.region}.amazonaws.com/runtimes/{args.runtime_arn}/ws?qualifier={args.qualifier}&voice_id=matthew"
        
        print(f"   Base URL: {base_url}")
        print(f"   Session ID: {session_id}")
        print(f"   Access Token will be sent as first WebSocket message")
        
        # Create boto3 session with temporary credentials
        session = boto3.Session(
            aws_access_key_id=credentials['AccessKeyId'],
            aws_secret_access_key=credentials['SecretKey'],
            aws_session_token=credentials['SessionToken'],
            region_name=args.region
        )
        
        # Create presigned URL with temporary credentials
        websocket_url = create_presigned_url(
            base_url, 
            session=session,
            region=args.region, 
            service=args.service, 
            expires=args.expires
        )
        
        print(f"✅ Presigned WebSocket URL created")
        print(f"   URL: {websocket_url[:100]}...")

        # Set connection details in the handler class
        CognitoSigV4ClientHandler.websocket_url = websocket_url
        CognitoSigV4ClientHandler.session_id = session_id
        CognitoSigV4ClientHandler.credentials_expiration = credentials['Expiration']
        CognitoSigV4ClientHandler.access_token = access_token  # Store Access Token
        CognitoSigV4ClientHandler.id_token = id_token  # Store ID Token
        
        # Store config for regenerating URLs
        CognitoSigV4ClientHandler.runtime_arn = args.runtime_arn
        CognitoSigV4ClientHandler.region = args.region
        CognitoSigV4ClientHandler.service = args.service
        CognitoSigV4ClientHandler.expires = args.expires
        CognitoSigV4ClientHandler.qualifier = args.qualifier
        
        # Store Cognito credentials for re-authentication
        CognitoSigV4ClientHandler.username = args.username
        CognitoSigV4ClientHandler.password = args.password
        CognitoSigV4ClientHandler.user_pool_id = args.user_pool_id
        CognitoSigV4ClientHandler.client_id = args.client_id
        CognitoSigV4ClientHandler.identity_pool_id = args.identity_pool_id
        
        # Store AWS Location Service config
        CognitoSigV4ClientHandler.map_name = args.map_name
        CognitoSigV4ClientHandler.place_index_name = args.place_index_name

        # Start web server
        print("\n" + "=" * 70)
        print("🌐 Starting Web Server")
        print("=" * 70)
        
        server_address = ("", args.port)
        httpd = HTTPServer(server_address, CognitoSigV4ClientHandler)

        server_url = f"http://localhost:{args.port}"

        print(f"📍 Server URL: {server_url}")
        print(f"🔗 Client Page: {server_url}/")
        print(f"📊 API Endpoint: {server_url}/api/connection")
        print(f"🔑 Token Endpoint: {server_url}/api/jwt-token")
        print(f"⚙️  Config Endpoint: {server_url}/api/config")
        print(f"🔄 Regenerate URL: {server_url}/api/regenerate (POST)")
        print()
        print("💡 The presigned WebSocket URL is pre-populated in the client")
        print("💡 Access Token is available via /api/jwt-token endpoint")
        print("💡 AWS config is available via /api/config endpoint")
        print("💡 Click 'Regenerate URL' in the client to get fresh credentials")
        print("💡 Press Ctrl+C to stop the server")
        print("=" * 70)
        print()

        # Open browser automatically
        if not args.no_browser:
            print("🌐 Opening browser...")
            webbrowser.open(server_url)
            print()

        # Start serving
        httpd.serve_forever()

    except KeyboardInterrupt:
        print("\n\n👋 Shutting down server...")
        return 0
    except ClientError as e:
        # Handle AWS/Cognito errors without stack trace
        error_code = e.response.get('Error', {}).get('Code', '')
        error_message = e.response.get('Error', {}).get('Message', '')
        print(f"\n❌ AWS Error: {error_message}", file=sys.stderr)
        print(f"   Error code: {error_code}", file=sys.stderr)
        return 1
    except Exception as e:
        # For unexpected errors, show the error but not full stack trace
        print(f"\n❌ Unexpected error: {e}", file=sys.stderr)
        print("\n💡 For detailed debugging, you can run with Python's -v flag", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
