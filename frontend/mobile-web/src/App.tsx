/**
 * Main App Component
 * 
 * Manages application state and routing between:
 * - Auth Screen (if not authenticated)
 * - Chat Interface (if authenticated)
 * 
 * Settings are loaded from environment variables at build time.
 */

import { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { SettingsManager } from './services/SettingsManager';
import { AuthComponent } from './components/AuthComponent';
import { ChatInterface } from './components/ChatInterface';
import type { AppSettings, AWSCredentials } from './services/SettingsManager';

type AppState = 'auth' | 'chat' | 'error';

function App() {
  const [appState, setAppState] = useState<AppState>('auth');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [credentials, setCredentials] = useState<AWSCredentials | null>(null);
  const [accessToken, setAccessToken] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const initializeApp = async () => {
      // Load settings from environment (build-time configuration)
      const envSettings = SettingsManager.loadFromEnvironment();
      
      if (!envSettings) {
        setError('Application not configured. Please check environment variables.');
        setAppState('error');
        return;
      }

      setSettings(envSettings);
      SettingsManager.saveSettings(envSettings);
      
      // Configure Amplify with environment settings
      Amplify.configure({
        Auth: {
          Cognito: {
            userPoolId: envSettings.cognito.userPoolId,
            userPoolClientId: envSettings.cognito.userPoolClientId,
            identityPoolId: envSettings.cognito.identityPoolId,
            loginWith: {
              email: true
            }
          }
        }
      });

      // Check if there's an existing Amplify session
      try {
        const currentUser = await getCurrentUser();
        console.log('✅ Found existing Amplify session for user:', currentUser.username);

        // Get the auth session with tokens
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        const accessToken = session.tokens?.accessToken?.toString();

        if (idToken && accessToken) {
          console.log('✅ Valid session tokens found, restoring session');

          // Get temporary AWS credentials from Cognito Identity Pool
          const credentialsProvider = fromCognitoIdentityPool({
            clientConfig: { region: envSettings.cognito.region },
            identityPoolId: envSettings.cognito.identityPoolId,
            logins: {
              [`cognito-idp.${envSettings.cognito.region}.amazonaws.com/${envSettings.cognito.userPoolId}`]: idToken
            }
          });

          const awsCredentials = await credentialsProvider();

          // Format credentials
          const formattedCredentials: AWSCredentials = {
            AccessKeyId: awsCredentials.accessKeyId,
            SecretKey: awsCredentials.secretAccessKey,
            SessionToken: awsCredentials.sessionToken || '',
            Expiration: awsCredentials.expiration?.toISOString() || new Date(Date.now() + 3600000).toISOString()
          };

          // Save credentials
          SettingsManager.saveCredentials(formattedCredentials);

          // Restore session state
          setCredentials(formattedCredentials);
          setAccessToken(accessToken);
          setAppState('chat');
          console.log('✅ Session restored successfully');
          return;
        }
      } catch (error) {
        // No existing session or session expired
        console.log('ℹ️ No valid session found, showing auth screen');
      }

      // No valid session, show auth screen
      setAppState('auth');
    };

    initializeApp();
  }, []);

  const handleAuthSuccess = (newCredentials: AWSCredentials, newAccessToken: string) => {
    console.log('📤 App.handleAuthSuccess called');
    console.log('🔍 Access token received:', newAccessToken ? `${newAccessToken.substring(0, 20)}...` : 'EMPTY');
    setCredentials(newCredentials);
    setAccessToken(newAccessToken);
    setAppState('chat');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      SettingsManager.clearCredentials();
      setCredentials(null);
      setAccessToken('');
      setAppState('auth');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Error state
  if (appState === 'error') {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#1A1A1A',
        color: '#F5F5F5',
        padding: '20px'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <h2 style={{ color: '#E4002B', marginBottom: '20px' }}>⚠️ Configuration Error</h2>
          <p>{error}</p>
          <p style={{ marginTop: '20px', fontSize: '14px', opacity: 0.8 }}>
            Please ensure the application is built with proper environment variables.
          </p>
        </div>
      </div>
    );
  }

  // Auth screen
  if (appState === 'auth' && settings) {
    return (
      <AuthComponent
        settings={settings}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  // Chat interface
  if (appState === 'chat' && settings && credentials) {
    console.log('🎯 Rendering ChatInterface with access token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'EMPTY');
    return (
      <ChatInterface
        settings={settings}
        credentials={credentials}
        accessToken={accessToken}
        onSignOut={handleSignOut}
      />
    );
  }

  // Loading state
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#1A1A1A'
    }}>
      <div style={{ textAlign: 'center', color: '#F5F5F5' }}>
        <h2>Loading...</h2>
      </div>
    </div>
  );
}

export default App;
