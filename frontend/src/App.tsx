/**
 * Main App Component
 * 
 * Manages application state and routing between:
 * - Settings Screen (if not configured)
 * - Auth Screen (if configured but not authenticated)
 * - Chat Interface (if authenticated)
 */

import { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { SettingsManager } from './services/SettingsManager';
import { SettingsScreen } from './components/SettingsScreen';
import { AuthComponent } from './components/AuthComponent';
import { ChatInterface } from './components/ChatInterface';
import type { AppSettings, AWSCredentials } from './services/SettingsManager';

type AppState = 'settings' | 'auth' | 'chat';

function App() {
  const [appState, setAppState] = useState<AppState>('settings');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [credentials, setCredentials] = useState<AWSCredentials | null>(null);
  const [accessToken, setAccessToken] = useState<string>('');

  useEffect(() => {
    const initializeApp = async () => {
      // Check if settings are configured
      const storedSettings = SettingsManager.getSettings();
      
      if (storedSettings && SettingsManager.isConfigured()) {
        setSettings(storedSettings);
        
        // Configure Amplify with stored settings
        Amplify.configure({
          Auth: {
            Cognito: {
              userPoolId: storedSettings.cognito.userPoolId,
              userPoolClientId: storedSettings.cognito.userPoolClientId,
              identityPoolId: storedSettings.cognito.identityPoolId,
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
              clientConfig: { region: storedSettings.cognito.region },
              identityPoolId: storedSettings.cognito.identityPoolId,
              logins: {
                [`cognito-idp.${storedSettings.cognito.region}.amazonaws.com/${storedSettings.cognito.userPoolId}`]: idToken
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
      } else {
        // Try to load from environment
        const envSettings = SettingsManager.loadFromEnvironment();
        if (envSettings) {
          setSettings(envSettings);
          SettingsManager.saveSettings(envSettings);
          setAppState('auth');
        } else {
          setAppState('settings');
        }
      }
    };

    initializeApp();
  }, []);

  const handleSettingsSave = (newSettings: AppSettings) => {
    setSettings(newSettings);
    setAppState('auth');
  };

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

  const handleEditSettings = () => {
    setAppState('settings');
  };

  // Render based on app state
  if (appState === 'settings') {
    return (
      <SettingsScreen 
        onSave={handleSettingsSave}
        initialSettings={settings}
      />
    );
  }

  if (appState === 'auth' && settings) {
    return (
      <AuthComponent
        settings={settings}
        onAuthSuccess={handleAuthSuccess}
        onEditSettings={handleEditSettings}
      />
    );
  }

  if (appState === 'chat' && settings && credentials) {
    console.log('🎯 Rendering ChatInterface with access token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'EMPTY');
    return (
      <ChatInterface
        settings={settings}
        credentials={credentials}
        accessToken={accessToken}
        onSignOut={handleSignOut}
        onEditSettings={handleEditSettings}
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
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h2>Loading...</h2>
      </div>
    </div>
  );
}

export default App;
