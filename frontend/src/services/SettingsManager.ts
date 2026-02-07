/**
 * Settings Manager
 * 
 * Manages application configuration persistence using localStorage.
 * Handles Cognito configuration and AWS credentials with expiration checking.
 */

export interface CognitoConfig {
  userPoolId: string;
  userPoolClientId: string;
  region: string;
  identityPoolId: string;
}

export interface AgentCoreConfig {
  websocketUrl: string;
  runtimeArn: string;
  mapName?: string;
  placeIndexName?: string;
}

export interface AppSettings {
  cognito: CognitoConfig;
  agentCore: AgentCoreConfig;
}

export interface AWSCredentials {
  AccessKeyId: string;
  SecretKey: string;
  SessionToken: string;
  Expiration: string;
}

const SETTINGS_KEY = 'agentCoreOrderingConfig';
const CREDENTIALS_KEY = 'agentCoreCredentials';

export class SettingsManager {
  /**
   * Get stored settings from localStorage
   */
  static getSettings(): AppSettings | null {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (error) {
      console.error('Error reading settings:', error);
      return null;
    }
  }

  /**
   * Save settings to localStorage
   */
  static saveSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  }

  /**
   * Clear all settings from localStorage
   */
  static clearSettings(): void {
    localStorage.removeItem(SETTINGS_KEY);
    this.clearCredentials();
  }

  /**
   * Check if settings are configured
   */
  static isConfigured(): boolean {
    const settings = this.getSettings();
    if (!settings) return false;

    const errors = this.validateCognitoConfig(settings.cognito);
    return errors.length === 0;
  }

  /**
   * Validate Cognito configuration
   */
  static validateCognitoConfig(cognito: CognitoConfig): string[] {
    const errors: string[] = [];

    if (!cognito.userPoolId || !cognito.userPoolId.trim()) {
      errors.push('User Pool ID is required');
    }
    if (!cognito.userPoolClientId || !cognito.userPoolClientId.trim()) {
      errors.push('User Pool Client ID is required');
    }
    if (!cognito.identityPoolId || !cognito.identityPoolId.trim()) {
      errors.push('Identity Pool ID is required');
    }
    if (!cognito.region || !cognito.region.trim()) {
      errors.push('Region is required');
    }

    return errors;
  }

  /**
   * Save AWS credentials to sessionStorage
   */
  static saveCredentials(credentials: AWSCredentials): void {
    try {
      sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
    } catch (error) {
      console.error('Error saving credentials:', error);
      throw error;
    }
  }

  /**
   * Get AWS credentials from sessionStorage
   * Returns null if expired or not found
   */
  static getCredentials(): AWSCredentials | null {
    try {
      const stored = sessionStorage.getItem(CREDENTIALS_KEY);
      if (!stored) return null;

      const credentials = JSON.parse(stored);
      
      // Check expiration
      const expiration = new Date(credentials.Expiration);
      const now = new Date();
      
      if (expiration <= now) {
        // Credentials expired
        this.clearCredentials();
        return null;
      }

      return credentials;
    } catch (error) {
      console.error('Error reading credentials:', error);
      return null;
    }
  }

  /**
   * Clear credentials from sessionStorage
   */
  static clearCredentials(): void {
    sessionStorage.removeItem(CREDENTIALS_KEY);
  }

  /**
   * Load configuration from environment variables
   * This is used as the default configuration if no settings are stored
   */
  static loadFromEnvironment(): AppSettings | null {
    const userPoolId = import.meta.env.VITE_USER_POOL_ID;
    const clientId = import.meta.env.VITE_CLIENT_ID;
    const identityPoolId = import.meta.env.VITE_IDENTITY_POOL_ID;
    const region = import.meta.env.VITE_REGION;
    const websocketUrl = import.meta.env.VITE_WEBSOCKET_URL;
    const runtimeArn = import.meta.env.VITE_RUNTIME_ARN;

    // Check if all required values are present
    if (!userPoolId || !clientId || !identityPoolId || !region || !websocketUrl || !runtimeArn) {
      return null;
    }

    return {
      cognito: {
        userPoolId,
        userPoolClientId: clientId,
        identityPoolId,
        region
      },
      agentCore: {
        websocketUrl,
        runtimeArn,
        mapName: import.meta.env.VITE_MAP_NAME || 'QSRRestaurantMap',
        placeIndexName: import.meta.env.VITE_PLACE_INDEX_NAME || 'QSRRestaurantIndex'
      }
    };
  }
}
