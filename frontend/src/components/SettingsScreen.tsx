/**
 * Settings Screen Component
 * 
 * Allows users to configure Cognito and AgentCore settings manually.
 * Provides validation and saves to localStorage.
 */

import { useState, useEffect } from 'react';
import type { AppSettings } from '../services/SettingsManager';
import { SettingsManager } from '../services/SettingsManager';

interface SettingsScreenProps {
  onSave: (settings: AppSettings) => void;
  initialSettings?: AppSettings | null;
}

export function SettingsScreen({ onSave, initialSettings }: SettingsScreenProps) {
  const [userPoolId, setUserPoolId] = useState('');
  const [clientId, setClientId] = useState('');
  const [identityPoolId, setIdentityPoolId] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [websocketUrl, setWebsocketUrl] = useState('');
  const [runtimeArn, setRuntimeArn] = useState('');
  const [mapName, setMapName] = useState('QSRRestaurantMap');
  const [placeIndexName, setPlaceIndexName] = useState('QSRRestaurantIndex');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    // Try to load from environment variables first
    const envSettings = SettingsManager.loadFromEnvironment();
    if (envSettings && !initialSettings) {
      setUserPoolId(envSettings.cognito.userPoolId);
      setClientId(envSettings.cognito.userPoolClientId);
      setIdentityPoolId(envSettings.cognito.identityPoolId);
      setRegion(envSettings.cognito.region);
      setWebsocketUrl(envSettings.agentCore.websocketUrl);
      setRuntimeArn(envSettings.agentCore.runtimeArn);
      setMapName(envSettings.agentCore.mapName || 'QSRRestaurantMap');
      setPlaceIndexName(envSettings.agentCore.placeIndexName || 'QSRRestaurantIndex');
    } else if (initialSettings) {
      setUserPoolId(initialSettings.cognito.userPoolId);
      setClientId(initialSettings.cognito.userPoolClientId);
      setIdentityPoolId(initialSettings.cognito.identityPoolId);
      setRegion(initialSettings.cognito.region);
      setWebsocketUrl(initialSettings.agentCore.websocketUrl);
      setRuntimeArn(initialSettings.agentCore.runtimeArn);
      setMapName(initialSettings.agentCore.mapName || 'QSRRestaurantMap');
      setPlaceIndexName(initialSettings.agentCore.placeIndexName || 'QSRRestaurantIndex');
    }
  }, [initialSettings]);

  const handleSave = () => {
    const settings: AppSettings = {
      cognito: {
        userPoolId: userPoolId.trim(),
        userPoolClientId: clientId.trim(),
        identityPoolId: identityPoolId.trim(),
        region: region.trim()
      },
      agentCore: {
        websocketUrl: websocketUrl.trim(),
        runtimeArn: runtimeArn.trim(),
        mapName: mapName.trim(),
        placeIndexName: placeIndexName.trim()
      }
    };

    // Validate
    const validationErrors = SettingsManager.validateCognitoConfig(settings.cognito);
    
    if (!settings.agentCore.websocketUrl) {
      validationErrors.push('WebSocket URL is required');
    }
    if (!settings.agentCore.runtimeArn) {
      validationErrors.push('Runtime ARN is required');
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    // Save and notify parent
    SettingsManager.saveSettings(settings);
    onSave(settings);
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '20px',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{ 
        maxWidth: '600px', 
        width: '100%',
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '30px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ margin: '0 0 10px 0', color: '#333' }}>⚙️ Configuration</h1>
        <p style={{ margin: '0 0 30px 0', color: '#666' }}>
          Configure AWS Cognito and AgentCore Runtime settings
        </p>

        {errors.length > 0 && (
          <div style={{
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '15px',
            borderRadius: '4px',
            marginBottom: '20px'
          }}>
            <strong>⚠️ Please fix the following errors:</strong>
            <ul style={{ margin: '10px 0 0 0', paddingLeft: '20px' }}>
              {errors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '16px' }}>
            AWS Cognito Configuration
          </h3>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
              User Pool ID *
            </label>
            <input
              type="text"
              value={userPoolId}
              onChange={(e) => setUserPoolId(e.target.value)}
              placeholder="us-east-1_XXXXXXXXX"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
              Client ID *
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxxxxx"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
              Identity Pool ID *
            </label>
            <input
              type="text"
              value={identityPoolId}
              onChange={(e) => setIdentityPoolId(e.target.value)}
              placeholder="us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
              Region *
            </label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="us-east-1"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '16px' }}>
            AgentCore Runtime Configuration
          </h3>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
              WebSocket URL *
            </label>
            <input
              type="text"
              value={websocketUrl}
              onChange={(e) => setWebsocketUrl(e.target.value)}
              placeholder="wss://runtime-name.agentcore.bedrock.us-east-1.amazonaws.com"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
              Runtime ARN *
            </label>
            <input
              type="text"
              value={runtimeArn}
              onChange={(e) => setRuntimeArn(e.target.value)}
              placeholder="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/runtime-name"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
              Map Name
            </label>
            <input
              type="text"
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
              placeholder="QSRRestaurantMap"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
              Place Index Name
            </label>
            <input
              type="text"
              value={placeIndexName}
              onChange={(e) => setPlaceIndexName(e.target.value)}
              placeholder="QSRRestaurantIndex"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Save Configuration
        </button>

        <div style={{ 
          marginTop: '20px', 
          padding: '15px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '4px',
          fontSize: '12px',
          color: '#666'
        }}>
          <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>ℹ️ Configuration Source:</p>
          <p style={{ margin: 0 }}>
            These values are automatically loaded from your deployment outputs.
            You can also configure them manually if needed.
          </p>
        </div>
      </div>
    </div>
  );
}
