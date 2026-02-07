/**
 * Main App Component
 * 
 * Manages application state and routing between:
 * - Settings Screen (if not configured)
 * - Auth Screen (if configured but not authenticated)
 * - Chat Interface (if authenticated)
 */

import { useState, useEffect } from 'react';
import { signOut } from 'aws-amplify/auth';
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
    // Check if settings are configured
    const storedSettings = SettingsManager.getSettings();
    
    if (storedSettings && SettingsManager.isConfigured()) {
      setSettings(storedSettings);
      
      // Check if credentials are still valid
      const storedCredentials = SettingsManager.getCredentials();
      if (storedCredentials) {
        console.log('⚠️ Found stored credentials but NO access token - forcing re-auth');
        // Don't go to chat without access token - force re-authentication
        setAppState('auth');
      } else {
        setAppState('auth');
      }
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
