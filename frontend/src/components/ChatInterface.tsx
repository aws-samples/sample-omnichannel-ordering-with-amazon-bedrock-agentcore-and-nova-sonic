/**
 * Chat Interface Component
 * 
 * Main ordering interface with voice and text modes.
 * Handles audio capture, playback, and message history.
 */

import { useState, useEffect, useRef } from 'react';
import { WebSocketClient } from '../services/WebSocketClient';
import type { AWSCredentials, AppSettings } from '../services/SettingsManager';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isAudio?: boolean;
  isComplete?: boolean; // Flag to indicate if message is finished streaming
}

interface ChatInterfaceProps {
  settings: AppSettings;
  credentials: AWSCredentials;
  accessToken: string;
  onSignOut: () => void;
  onEditSettings: () => void;
}

export function ChatInterface({ 
  settings, 
  credentials, 
  accessToken,
  onSignOut, 
  onEditSettings 
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const wsClientRef = useRef<WebSocketClient | null>(null);
  const recordingContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Get user's location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          console.log('📍 User location obtained:', position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.warn('⚠️ Geolocation permission denied or unavailable:', error.message);
          // Use default location if permission denied
          setUserLocation({ latitude: 32.7767, longitude: -96.7970 });
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
    } else {
      // Geolocation not supported
      setUserLocation({ latitude: 32.7767, longitude: -96.7970 });
    }
  }, []);

  // Initialize WebSocket connection
  const initWebSocket = async () => {
    if (wsClientRef.current?.isConnected()) {
      console.log('Already connected');
      return;
    }

    try {
      const client = new WebSocketClient({
        websocketUrl: settings.agentCore.websocketUrl,
        runtimeArn: settings.agentCore.runtimeArn,
        credentials,
        region: settings.cognito.region,
        accessToken,
        userLocation: userLocation || undefined
      });

      // Set up event handlers
      client.onConnected(() => {
        setIsConnected(true);
        setError(null);
        console.log('✅ Connected to AgentCore Runtime');
      });

      client.onDisconnected(() => {
        setIsConnected(false);
        console.log('❌ Disconnected from AgentCore Runtime');
      });

      client.onTranscription((text, role) => {
        addMessage(role, text, false, true); // User transcriptions are always complete
      });

      client.onResponse((text) => {
        addMessage('assistant', text, false, false); // Assistant responses stream, not complete yet
      });

      client.onAudio((audioData) => {
        playAudio(audioData);
      });

      client.onError((err) => {
        setError(err.message);
        console.error('WebSocket error:', err);
      });

      client.onInterruption(() => {
        // Stop all queued audio playback when interrupted
        if (playbackContextRef.current) {
          playbackContextRef.current.close();
          playbackContextRef.current = null;
          nextPlayTimeRef.current = 0;
        }
        // Mark current assistant message as complete when interrupted
        markLastAssistantMessageComplete();
        addMessage('assistant', '[Interrupted]', false, true);
      });

      client.onTurnComplete(() => {
        // Mark current assistant message as complete when turn ends
        markLastAssistantMessageComplete();
      });

      wsClientRef.current = client;

      // Connect
      await client.connect();

    } catch (err) {
      setError('Failed to connect to AgentCore Runtime');
      console.error('Connection error:', err);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (role: 'user' | 'assistant', content: string, isAudio: boolean, isComplete: boolean = true) => {
    setMessages(prev => {
      // If this is an assistant message and the last message is also an incomplete assistant message,
      // append to it instead of creating a new one
      if (role === 'assistant' && prev.length > 0) {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage.role === 'assistant' && !lastMessage.isComplete) {
          // Append to existing message with a space separator
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...lastMessage,
            content: lastMessage.content + ' ' + content,
            isComplete
          };
          return updated;
        }
      }
      
      // Otherwise, create a new message
      return [...prev, {
        role,
        content,
        timestamp: new Date(),
        isAudio,
        isComplete
      }];
    });
  };

  const markLastAssistantMessageComplete = () => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const lastMessage = prev[prev.length - 1];
      if (lastMessage.role === 'assistant' && !lastMessage.isComplete) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...lastMessage,
          isComplete: true
        };
        return updated;
      }
      return prev;
    });
  };

  const handleSendText = () => {
    if (!inputText.trim() || !wsClientRef.current?.isConnected()) return;

    addMessage('user', inputText, false);
    wsClientRef.current.sendText(inputText);
    setInputText('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const startRecording = async () => {
    try {
      // Request wake lock to keep screen on during voice interaction
      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('🔒 Screen wake lock acquired');
          
          // Listen for wake lock release
          wakeLockRef.current.addEventListener('release', () => {
            console.log('🔓 Screen wake lock released');
          });
        } catch (err) {
          console.warn('⚠️ Wake lock request failed:', err);
          // Continue anyway - wake lock is a nice-to-have, not critical
        }
      }

      // Connect WebSocket if not connected
      if (!wsClientRef.current?.isConnected()) {
        await initWebSocket();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });

      // Create AudioContext for raw PCM processing
      const audioContext = new AudioContext();
      recordingContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (wsClientRef.current?.isConnected()) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Downsample to 16kHz
          const downsampleRatio = audioContext.sampleRate / 16000;
          const outputLength = Math.floor(inputData.length / downsampleRatio);
          const int16Data = new Int16Array(outputLength);
          
          for (let i = 0; i < outputLength; i++) {
            const sourceIndex = Math.floor(i * downsampleRatio);
            int16Data[i] = Math.max(-32768, Math.min(32767, inputData[sourceIndex] * 32768));
          }
          
          // Send as ArrayBuffer
          wsClientRef.current.sendAudio(int16Data.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      addMessage('user', '🎤 Recording...', true);

    } catch (err) {
      setError('Failed to access microphone');
      console.error('Microphone error:', err);
    }
  };

  const stopRecording = () => {
    // Release wake lock
    if (wakeLockRef.current) {
      wakeLockRef.current.release()
        .then(() => {
          console.log('🔓 Screen wake lock released manually');
          wakeLockRef.current = null;
        })
        .catch((err) => {
          console.warn('⚠️ Failed to release wake lock:', err);
        });
    }

    // Stop audio recording
    if (recordingContextRef.current && isRecording) {
      recordingContextRef.current.close();
      recordingContextRef.current = null;
      setIsRecording(false);
    }

    // Stop audio playback
    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }

    // Disconnect WebSocket gracefully
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
      setIsConnected(false);
    }

    // Reset audio playback state
    nextPlayTimeRef.current = 0;

    console.log('🛑 Stopped recording, playback, and disconnected');
  };

  const playAudio = async (audioData: ArrayBuffer) => {
    try {
      // Create or recreate audio context if needed
      if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
        playbackContextRef.current = new AudioContext({ sampleRate: 16000 });
        nextPlayTimeRef.current = playbackContextRef.current.currentTime;
      }

      // Resume if suspended
      if (playbackContextRef.current.state === 'suspended') {
        await playbackContextRef.current.resume();
      }

      // The audio is raw PCM Int16 data at 16kHz mono
      // Convert Int16 to Float32 for Web Audio API
      const int16Array = new Int16Array(audioData);
      const float32Array = new Float32Array(int16Array.length);
      
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0; // Convert to -1.0 to 1.0 range
      }

      // Create AudioBuffer manually for PCM data
      const audioBuffer = playbackContextRef.current.createBuffer(
        1, // mono
        float32Array.length,
        16000 // sample rate
      );
      
      audioBuffer.getChannelData(0).set(float32Array);

      // Queue audio for sequential playback without gaps
      const currentTime = playbackContextRef.current.currentTime;
      if (nextPlayTimeRef.current < currentTime) {
        nextPlayTimeRef.current = currentTime;
      }

      // Play the audio
      const source = playbackContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackContextRef.current.destination);
      source.start(nextPlayTimeRef.current);
      
      // Update next play time
      nextPlayTimeRef.current += audioBuffer.duration;

    } catch (err) {
      console.error('Audio playback error:', err);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh',
      backgroundColor: '#f5f5f5'
    }}>
      {/* Header */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '15px 20px',
        borderBottom: '1px solid #ddd',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px' }}>🎙️ QSR Voice Ordering</h2>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
            {isConnected ? (
              <span style={{ color: '#28a745' }}>● Connected</span>
            ) : (
              <span style={{ color: '#dc3545' }}>● Disconnected</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onEditSettings}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ⚙️ Settings
          </button>
          <button
            onClick={onSignOut}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '10px 20px',
          borderBottom: '1px solid #f5c6cb'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Messages */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '15px'
      }}>
        {messages.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            color: '#999', 
            marginTop: '50px' 
          }}>
            <p style={{ fontSize: '18px', marginBottom: '10px' }}>👋 Welcome!</p>
            <p>Start a conversation by typing or using voice</p>
            <p style={{ fontSize: '14px', marginTop: '20px' }}>
              Try saying: "I'd like to place an order"
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '70%'
            }}
          >
            <div style={{
              backgroundColor: msg.role === 'user' ? '#007bff' : 'white',
              color: msg.role === 'user' ? 'white' : '#333',
              padding: '12px 16px',
              borderRadius: '12px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </div>
              <div style={{ 
                fontSize: '11px', 
                marginTop: '5px',
                opacity: 0.7
              }}>
                {msg.timestamp.toLocaleTimeString()}
                {msg.isAudio && ' 🎤'}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '15px 20px',
        borderTop: '1px solid #ddd'
      }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Voice Button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: isRecording ? '#dc3545' : '#28a745',
              color: 'white',
              fontSize: '24px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title={isRecording ? 'Stop recording' : 'Start recording'}
          >
            {isRecording ? '⏹️' : '🎤'}
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            disabled={!isConnected}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '1px solid #ddd',
              borderRadius: '25px',
              fontSize: '14px',
              outline: 'none'
            }}
          />

          {/* Send Button */}
          <button
            onClick={handleSendText}
            disabled={!isConnected || !inputText.trim()}
            style={{
              padding: '12px 24px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '25px',
              cursor: isConnected && inputText.trim() ? 'pointer' : 'not-allowed',
              opacity: isConnected && inputText.trim() ? 1 : 0.5,
              fontSize: '14px'
            }}
          >
            Send
          </button>
        </div>

        <div style={{ 
          marginTop: '10px', 
          fontSize: '12px', 
          color: '#666',
          textAlign: 'center'
        }}>
          {isRecording ? (
            <span style={{ color: '#dc3545' }}>🔴 Recording... Click to stop</span>
          ) : (
            <span>Click the microphone to start voice ordering</span>
          )}
        </div>
      </div>
    </div>
  );
}
