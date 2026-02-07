/**
 * Auth Component
 * 
 * Handles Cognito authentication using AWS Amplify Authenticator.
 * Automatically handles NEW_PASSWORD_REQUIRED challenge on first login.
 * Fetches temporary AWS credentials after successful authentication.
 */

import { useEffect, useState, useRef } from 'react';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { fetchAuthSession } from 'aws-amplify/auth';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import type { AppSettings, AWSCredentials } from '../services/SettingsManager';
import { SettingsManager } from '../services/SettingsManager';

interface AuthComponentProps {
  settings: AppSettings;
  onAuthSuccess: (credentials: AWSCredentials, accessToken: string) => void;
  onEditSettings: () => void;
}

// Inner component that has access to user state
function AuthenticatedContent({ 
  user, 
  signOut, 
  onAuthSuccess, 
  settings 
}: { 
  user: any; 
  signOut: () => void; 
  onAuthSuccess: (credentials: AWSCredentials, accessToken: string) => void;
  settings: AppSettings;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Only process once when user becomes available
    if (user && !hasProcessed.current && !isProcessing) {
      hasProcessed.current = true;
      handleAuthSuccess();
    }
  }, [user]);

  const handleAuthSuccess = async () => {
    setIsProcessing(true);

    try {
      console.log('🔐 Authentication successful');

      // Get the current auth session
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      const accessToken = session.tokens?.accessToken?.toString();

      if (!idToken || !accessToken) {
        throw new Error('Failed to get tokens from session');
      }

      console.log('✅ Got JWT tokens');
      console.log('🔍 Access Token length:', accessToken.length);

      // Get temporary AWS credentials from Cognito Identity Pool
      const credentialsProvider = fromCognitoIdentityPool({
        clientConfig: { region: settings.cognito.region },
        identityPoolId: settings.cognito.identityPoolId,
        logins: {
          [`cognito-idp.${settings.cognito.region}.amazonaws.com/${settings.cognito.userPoolId}`]: idToken
        }
      });

      const credentials = await credentialsProvider();

      console.log('✅ Got temporary AWS credentials');

      // Format credentials for storage
      const awsCredentials: AWSCredentials = {
        AccessKeyId: credentials.accessKeyId,
        SecretKey: credentials.secretAccessKey,
        SessionToken: credentials.sessionToken || '',
        Expiration: credentials.expiration?.toISOString() || new Date(Date.now() + 3600000).toISOString()
      };

      // Save credentials
      SettingsManager.saveCredentials(awsCredentials);

      // Call success callback with credentials and access token
      console.log('📤 Calling onAuthSuccess with access token');
      onAuthSuccess(awsCredentials, accessToken);

    } catch (error) {
      console.error('Error getting credentials:', error);
      alert('Failed to get AWS credentials. Please try again.');
      setIsProcessing(false);
      hasProcessed.current = false;
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <p>{isProcessing ? 'Configuring session...' : 'Authenticated'}</p>
      <button
        onClick={signOut}
        style={{
          marginTop: '10px',
          padding: '8px 16px',
          backgroundColor: '#dc3545',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Sign Out
      </button>
    </div>
  );
}

export function AuthComponent({ settings, onAuthSuccess, onEditSettings }: AuthComponentProps) {
  useEffect(() => {
    // Configure Amplify with Cognito settings
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: settings.cognito.userPoolId,
          userPoolClientId: settings.cognito.userPoolClientId,
          identityPoolId: settings.cognito.identityPoolId,
          loginWith: {
            email: true
          }
        }
      }
    });
  }, [settings]);

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '20px',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{ 
        maxWidth: '500px', 
        width: '100%',
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '30px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ margin: '0 0 10px 0', color: '#333' }}>🎙️ QSR Voice Ordering</h1>
          <p style={{ margin: 0, color: '#666' }}>Sign in to start ordering</p>
        </div>

        <Authenticator
          hideSignUp={true}
          components={{
            SignIn: {
              Header() {
                return (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <h3 style={{ margin: 0 }}>Sign In</h3>
                  </div>
                );
              },
              Footer() {
                return (
                  <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button
                      onClick={onEditSettings}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0066cc',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        fontSize: '14px'
                      }}
                    >
                      Edit Settings
                    </button>
                  </div>
                );
              }
            }
          }}
        >
          {({ signOut, user }) => (
            <AuthenticatedContent 
              user={user}
              signOut={signOut}
              onAuthSuccess={onAuthSuccess}
              settings={settings}
            />
          )}
        </Authenticator>

        <div style={{ 
          marginTop: '30px', 
          padding: '15px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '4px',
          fontSize: '12px',
          color: '#666'
        }}>
          <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>ℹ️ First Time Login:</p>
          <p style={{ margin: 0 }}>
            If this is your first login, you'll be prompted to change your temporary password.
            Check your email for the temporary password.
          </p>
        </div>
      </div>
    </div>
  );
}
