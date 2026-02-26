"""
JWT Authentication Handler for WebSocket Connections

This module provides utilities for intercepting and validating JWT tokens
sent as the first message over WebSocket connections.
"""
import logging
import os
import time
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


def verify_access_token(access_token, region='us-east-1'):
    """
    Verify Access Token with AWS Cognito and retrieve user details.
    
    This function uses the Cognito GetUser API to verify the token's validity.
    AWS Cognito automatically validates:
    - Token signature
    - Token expiration
    - Token revocation status
    
    Args:
        access_token (str): Cognito Access Token
        region (str): AWS region (default: us-east-1)
        
    Returns:
        dict: User details from Cognito including username and attributes
        
    Raises:
        ValueError: If token is invalid, expired, or verification fails
    """
    try:
        cognito_idp = boto3.client('cognito-idp', region_name=region)
        
        # Call GetUser API - AWS handles all verification
        response = cognito_idp.get_user(AccessToken=access_token)
        
        # Extract user information
        user_info = {
            'username': response.get('Username'),
            'email': None,
            'name': None,
            'customerId': None,
            'attributes': {}
        }
        
        # Parse user attributes
        for attr in response.get('UserAttributes', []):
            attr_name = attr['Name']
            attr_value = attr['Value']
            user_info['attributes'][attr_name] = attr_value
            
            # Extract key attributes for easy access
            if attr_name == 'email':
                user_info['email'] = attr_value
            elif attr_name == 'name':
                user_info['name'] = attr_value
            elif attr_name == 'custom:customerId':
                user_info['customerId'] = attr_value
        
        return user_info
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        logger.error(f"❌ Cognito ClientError: {error_code} - {error_message}", exc_info=True)
        
        if error_code == 'NotAuthorizedException':
            raise ValueError(f"Token verification failed: {error_message}")
        elif error_code == 'InvalidParameterException':
            raise ValueError(f"Invalid token format: {error_message}")
        else:
            raise ValueError(f"Token verification error: {error_code} - {error_message}")
    except Exception as e:
        logger.error(f"❌ Unexpected error during token verification: {str(e)}", exc_info=True)
        raise ValueError(f"Unexpected error during token verification: {str(e)}")


def log_user_info(user_info):
    """
    Log verified user information.
    
    Args:
        user_info (dict): User information from verify_access_token
    """
    logger.info("\n" + "=" * 80)
    logger.info("✅ Access Token Verified - Customer Authenticated")
    logger.info("=" * 80)
    logger.info(f"   Username: {user_info.get('username', 'N/A')}")
    logger.info(f"   Name: {user_info.get('name', 'N/A')}")
    logger.info(f"   Email: {user_info.get('email', 'N/A')}")
    logger.info(f"   Customer ID: {user_info.get('customerId', 'N/A')}")
    logger.info(f"   Email Verified: {user_info.get('attributes', {}).get('email_verified', 'N/A')}")
    logger.info("=" * 80)


class AuthInterceptor:
    """
    WebSocket message interceptor that handles JWT authentication.
    
    This class-based approach allows us to access verified user information
    after authentication completes, which is needed to build a dynamic system prompt.
    """
    
    def __init__(self, websocket, region='us-east-1'):
        self.websocket = websocket
        self.region = region
        self.access_token = None
        self.first_message_processed = False
        self.user_info = None
        self.auth_method = 'cognito'  # Default; updated during receive()
    
    async def receive(self):
        """
        Receive messages from WebSocket with JWT authentication on first message.
        
        Returns:
            dict: WebSocket message (after authentication if first message)
        """
        message = await self.websocket.receive_json()
        
        # Check if this is the first message and if it's an auth message
        if not self.first_message_processed and message.get('type') == 'auth':
            self.first_message_processed = True
            self.auth_method = message.get('auth_method', 'cognito')
            
            if self.auth_method in ('connect', 'connect_anonymous'):
                # Connect auth: verify DynamoDB session token
                session_token = message.get('session_token')
                if not session_token:
                    logger.error("❌ No session token provided in Connect auth message")
                    raise ValueError("Session token is required for Connect authentication")
                
                try:
                    self.user_info = self._verify_session_token(session_token)
                    log_user_info(self.user_info)
                except ValueError as e:
                    logger.error(f"❌ Session token verification failed: {e}")
                    raise
            else:
                # Cognito auth: verify Access Token with AWS Cognito
                self.access_token = message.get('access_token')
                
                if not self.access_token:
                    logger.error("❌ No access token provided in auth message")
                    raise ValueError("Access token is required for authentication")
                
                try:
                    self.user_info = verify_access_token(self.access_token, region=self.region)
                    log_user_info(self.user_info)
                except ValueError as e:
                    logger.error(f"❌ Token verification failed: {e}")
                    raise
            
            # Get the next message (the actual first audio/data message)
            message = await self.websocket.receive_json()
        
        self.first_message_processed = True
        return message

    def _verify_session_token(self, token):
        """
        Verify a Connect session token via atomic DynamoDB delete.

        Reads and deletes the token in a single operation to enforce single-use.
        Checks TTL to reject expired tokens. Populates self.auth_method from
        the session record.

        Args:
            token (str): Session token UUID

        Returns:
            dict: User info with username, name, email, customerId

        Raises:
            ValueError: If table name not set, token not found, or token expired
        """
        sessions_table = os.environ.get('SESSIONS_TABLE_NAME')
        if not sessions_table:
            raise ValueError("Connect auth unavailable: SESSIONS_TABLE_NAME not set")

        dynamodb = boto3.resource('dynamodb')
        table = dynamodb.Table(sessions_table)

        # Atomic read-and-delete (single-use token)
        try:
            response = table.delete_item(
                Key={'PK': f'SESSION#{token}'},
                ReturnValues='ALL_OLD',
                ConditionExpression='attribute_exists(PK)'
            )
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                raise ValueError("Invalid or expired session token")
            raise

        item = response.get('Attributes')
        if not item:
            raise ValueError("Invalid or expired session token")

        # Check TTL
        if item.get('expiresAt', 0) < int(time.time()):
            raise ValueError("Session token has expired")

        # Update auth_method from session record
        self.auth_method = item.get('authMethod', 'connect')

        return {
            'username': item.get('customerName', 'Guest'),
            'name': item.get('customerName', 'Guest'),
            'email': item.get('customerEmail', ''),
            'customerId': item.get('customerId'),
        }


def create_auth_interceptor(websocket, region='us-east-1'):
    """
    Create a WebSocket message interceptor that handles JWT authentication.
    
    The interceptor checks if the first message is an authentication message with type='auth'.
    If so, it extracts and verifies the Access Token using AWS Cognito, then returns the next message.
    All subsequent messages pass through normally.
    
    Args:
        websocket: FastAPI WebSocket connection
        region (str): AWS region for Cognito verification (default: us-east-1)
        
    Returns:
        tuple: (receive_function, user_info_dict)
            - receive_function: Async function that can be used as input to BidiAgent
            - user_info_dict: Dictionary containing verified user information
        
    Raises:
        ValueError: If token verification fails
        
    Note:
        This function is deprecated. Use AuthInterceptor class instead for better
        access to user_info after authentication.
    """
    access_token_received = None
    first_message_processed = False
    verified_user_info = None
    
    async def receive_with_auth_intercept():
        nonlocal access_token_received, first_message_processed, verified_user_info
        
        message = await websocket.receive_json()
        
        # Check if this is the first message and if it's an auth message
        if not first_message_processed and message.get('type') == 'auth':
            first_message_processed = True
            access_token_received = message.get('access_token')
            
            if not access_token_received:
                logger.error("❌ No access token provided in auth message")
                raise ValueError("Access token is required for authentication")
            
            # Verify the Access Token with AWS Cognito
            try:
                verified_user_info = verify_access_token(access_token_received, region=region)
                log_user_info(verified_user_info)
            except ValueError as e:
                logger.error(f"❌ Token verification failed: {e}")
                raise
            
            # Get the next message (the actual first audio/data message)
            message = await websocket.receive_json()
        
        first_message_processed = True
        return message
    
    return receive_with_auth_intercept, verified_user_info
