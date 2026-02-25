"""
Prompt Loader — Loads and renders system prompt templates.

Supports loading from:
1. Local files (default) — prompts/ directory bundled with the agent
2. AWS Systems Manager Parameter Store (future) — for production editing without redeployment
3. DynamoDB (future) — for versioned prompt management

Templates use {{variable}} tags that are replaced with customer context at runtime.
"""
import os
import re
import logging
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Prompt directory relative to this file
PROMPTS_DIR = Path(__file__).parent / 'prompts'

# Channel to prompt file mapping
CHANNEL_PROMPTS = {
    'cognito': 'mobile_web_prompt.txt',
    'connect': 'connect_prompt.txt',
    'connect_anonymous': 'connect_anonymous_prompt.txt',
}


def load_prompt_template(channel: str = 'cognito') -> str:
    """
    Load a prompt template for the given channel.
    
    Tries loading in order:
    1. Environment variable override (PROMPT_TEMPLATE_{CHANNEL})
    2. SSM Parameter Store (if PROMPT_SSM_PREFIX env var is set)
    3. Local file from prompts/ directory
    
    Args:
        channel: Auth channel — 'cognito' for web/mobile, 'connect' for phone
        
    Returns:
        Raw prompt template string with {{variable}} tags
        
    Raises:
        FileNotFoundError: If no prompt template found for the channel
    """
    # 1. Check for environment variable override (useful for testing)
    env_key = f"PROMPT_TEMPLATE_{channel.upper()}"
    env_value = os.environ.get(env_key)
    if env_value:
        logger.info(f"📝 Loaded prompt from environment variable: {env_key}")
        return env_value
    
    # 2. Check for SSM Parameter Store (future — when PROMPT_SSM_PREFIX is set)
    ssm_prefix = os.environ.get('PROMPT_SSM_PREFIX')
    if ssm_prefix:
        template = _load_from_ssm(f"{ssm_prefix}/{channel}")
        if template:
            return template
    
    # 3. Load from local file
    filename = CHANNEL_PROMPTS.get(channel)
    if not filename:
        raise FileNotFoundError(f"No prompt template configured for channel: {channel}")
    
    filepath = PROMPTS_DIR / filename
    if not filepath.exists():
        raise FileNotFoundError(f"Prompt template not found: {filepath}")
    
    template = filepath.read_text(encoding='utf-8').strip()
    logger.info(f"📝 Loaded prompt from file: {filepath.name} ({len(template)} chars)")
    return template


def render_prompt(template: str, variables: Dict[str, str]) -> str:
    """
    Render a prompt template by replacing {{variable}} tags with values.
    
    Args:
        template: Prompt template with {{variable.name}} tags
        variables: Dictionary of variable values (e.g., {'customer.name': 'Sergio'})
        
    Returns:
        Rendered prompt string
    """
    result = template
    for key, value in variables.items():
        result = result.replace(f'{{{{{key}}}}}', str(value))
    
    # Warn about any unreplaced tags
    remaining = re.findall(r'\{\{[^}]+\}\}', result)
    if remaining:
        logger.warning(f"⚠️ Unreplaced prompt variables: {remaining}")
    
    return result


def build_system_prompt(
    channel: str,
    customer_name: str,
    customer_email: str,
    customer_id: str
) -> str:
    """
    Load and render a system prompt for the given channel and customer.
    
    Args:
        channel: Auth channel — 'cognito' or 'connect'
        customer_name: Verified customer name
        customer_email: Verified customer email
        customer_id: Verified customer ID
        
    Returns:
        Fully rendered system prompt
    """
    template = load_prompt_template(channel)
    
    return render_prompt(template, {
        'customer.name': customer_name,
        'customer.email': customer_email,
        'customer.id': customer_id,
    })


def _load_from_ssm(parameter_name: str) -> Optional[str]:
    """
    Load a prompt template from AWS Systems Manager Parameter Store.
    
    Args:
        parameter_name: Full SSM parameter name
        
    Returns:
        Parameter value or None if not found
    """
    try:
        import boto3
        ssm = boto3.client('ssm')
        response = ssm.get_parameter(Name=parameter_name, WithDecryption=False)
        template = response['Parameter']['Value']
        logger.info(f"📝 Loaded prompt from SSM: {parameter_name} ({len(template)} chars)")
        return template
    except Exception as e:
        logger.warning(f"⚠️ Could not load prompt from SSM ({parameter_name}): {e}")
        return None
