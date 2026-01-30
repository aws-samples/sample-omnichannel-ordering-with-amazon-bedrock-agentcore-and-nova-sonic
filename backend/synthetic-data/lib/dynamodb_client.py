"""
DynamoDB client for data ingestion.
"""
import boto3
from decimal import Decimal
from typing import List, Dict, Any
from botocore.exceptions import ClientError


class DynamoDBClient:
    """Client for DynamoDB batch write operations."""
    
    def __init__(self, region: str = 'us-east-1'):
        """
        Initialize DynamoDB client.
        
        Args:
            region: AWS region
        """
        self.client = boto3.client('dynamodb', region_name=region)
        self.resource = boto3.resource('dynamodb', region_name=region)
        self.region = region
    
    def _convert_floats_to_decimal(self, obj: Any) -> Any:
        """
        Recursively convert float values to Decimal for DynamoDB compatibility.
        
        Args:
            obj: Object to convert (dict, list, or primitive)
            
        Returns:
            Converted object with Decimals instead of floats
        """
        if isinstance(obj, list):
            return [self._convert_floats_to_decimal(item) for item in obj]
        elif isinstance(obj, dict):
            return {key: self._convert_floats_to_decimal(value) for key, value in obj.items()}
        elif isinstance(obj, float):
            return Decimal(str(obj))
        else:
            return obj
    
    def batch_write_items(self, table_name: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Batch write items to DynamoDB table.
        
        Args:
            table_name: DynamoDB table name
            items: List of items to write
            
        Returns:
            Dictionary with success count and errors
        """
        if not items:
            return {'success': 0, 'failed': 0, 'errors': []}
        
        # Convert all floats to Decimal
        items = [self._convert_floats_to_decimal(item) for item in items]
        
        table = self.resource.Table(table_name)
        success_count = 0
        failed_count = 0
        errors = []
        
        # DynamoDB batch_write_item supports max 25 items per batch
        batch_size = 25
        
        for i in range(0, len(items), batch_size):
            batch = items[i:i + batch_size]
            
            try:
                with table.batch_writer() as writer:
                    for item in batch:
                        writer.put_item(Item=item)
                        success_count += 1
                
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                error_msg = e.response.get('Error', {}).get('Message', str(e))
                errors.append({
                    'batch_start': i,
                    'batch_size': len(batch),
                    'error_code': error_code,
                    'error_message': error_msg
                })
                failed_count += len(batch)
            except Exception as e:
                errors.append({
                    'batch_start': i,
                    'batch_size': len(batch),
                    'error_code': 'UnexpectedError',
                    'error_message': str(e)
                })
                failed_count += len(batch)
        
        return {
            'success': success_count,
            'failed': failed_count,
            'errors': errors
        }
    
    def verify_table_exists(self, table_name: str) -> bool:
        """
        Verify that a DynamoDB table exists.
        
        Args:
            table_name: Table name to check
            
        Returns:
            True if table exists, False otherwise
        """
        try:
            self.client.describe_table(TableName=table_name)
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                return False
            raise
    
    def get_table_item_count(self, table_name: str) -> int:
        """
        Get approximate item count in table.
        
        Args:
            table_name: Table name
            
        Returns:
            Approximate item count
        """
        try:
            response = self.client.describe_table(TableName=table_name)
            return response['Table']['ItemCount']
        except ClientError:
            return 0
