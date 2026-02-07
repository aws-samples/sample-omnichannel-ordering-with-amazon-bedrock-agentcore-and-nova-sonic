/**
 * WebSocket Client for AgentCore Runtime
 * 
 * Handles bidirectional audio and text streaming with SigV4 authentication.
 * Based on the test client implementation in backend/agentcore-runtime/test-client/
 */

import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import type { AWSCredentials } from './SettingsManager';

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface WebSocketClientOptions {
  websocketUrl: string;
  runtimeArn: string;
  credentials: AWSCredentials;
  region: string;
  accessToken?: string; // JWT Access Token for identity verification
  userLocation?: { latitude: number; longitude: number }; // User's actual location
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private options: WebSocketClientOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  // Event callbacks
  private onTranscriptionCallback?: (text: string, role: 'user' | 'assistant') => void;
  private onResponseCallback?: (text: string) => void;
  private onAudioCallback?: (audioData: ArrayBuffer) => void;
  private onErrorCallback?: (error: Error) => void;
  private onConnectedCallback?: () => void;
  private onDisconnectedCallback?: () => void;
  private onInterruptionCallback?: () => void;

  constructor(options: WebSocketClientOptions) {
    this.options = options;
  }

  /**
   * Create SigV4 presigned WebSocket URL
   * Based on the test client's create_presigned_url function
   */
  private async createPresignedUrl(): Promise<string> {
    const { runtimeArn, credentials, region } = this.options;

    // Construct the base URL using the correct hostname format
    // Must use bedrock-agentcore.{region}.amazonaws.com, NOT the runtime-specific hostname
    const baseUrl = `wss://bedrock-agentcore.${region}.amazonaws.com/runtimes/${runtimeArn}/ws?qualifier=DEFAULT&voice_id=matthew`;

    // Convert wss:// to https:// for signing
    const httpsUrl = baseUrl.replace('wss://', 'https://');
    const url = new URL(httpsUrl);

    // Create signer
    const signer = new SignatureV4({
      service: 'bedrock-agentcore',
      region,
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretKey,
        sessionToken: credentials.SessionToken
      },
      sha256: Sha256
    });

    // Sign the request
    const signedRequest = await signer.presign({
      method: 'GET',
      protocol: 'https:',
      hostname: url.hostname,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: {
        host: url.hostname
      }
    }, {
      expiresIn: 3600 // 1 hour
    });

    // Debug: Log the signed request structure
    console.log('🔍 Signed request:', {
      hostname: signedRequest.hostname,
      path: signedRequest.path,
      query: signedRequest.query,
      hasQuery: !!signedRequest.query
    });

    // The presign method returns a HttpRequest object
    // Build the full URL with all query parameters from the signed request
    let finalUrl = `https://${signedRequest.hostname}${signedRequest.path}`;
    
    // Add query parameters if they exist
    if (signedRequest.query) {
      const queryParams = new URLSearchParams(signedRequest.query as Record<string, string>);
      finalUrl += `?${queryParams.toString()}`;
    }
    
    // Convert back to wss://
    finalUrl = finalUrl.replace('https://', 'wss://');
    
    console.log('🔐 Presigned WebSocket URL:', finalUrl.substring(0, 150) + '...');
    return finalUrl;
  }

  /**
   * Connect to AgentCore Runtime WebSocket
   */
  async connect(): Promise<void> {
    try {
      // Create presigned URL
      const presignedUrl = await this.createPresignedUrl();

      console.log('Connecting to AgentCore Runtime...');
      
      // Create WebSocket connection
      this.ws = new WebSocket(presignedUrl);

      // Set up event handlers
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.reconnectAttempts = 0;

        // Send Access Token as first message for identity verification
        // This matches the test client behavior
        console.log('🔍 Access token available:', !!this.options.accessToken);
        if (this.options.accessToken) {
          console.log('📤 Sending access token...');
          this.sendAccessToken(this.options.accessToken);
        } else {
          console.warn('⚠️ No access token provided to WebSocketClient');
        }

        if (this.onConnectedCallback) {
          this.onConnectedCallback();
        }
      };

      this.ws.onmessage = (event) => {
        console.log('📥 Received WebSocket message:', event.data.substring(0, 200));
        this.handleMessage(event);
      };

      this.ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        if (this.onErrorCallback) {
          this.onErrorCallback(new Error('WebSocket connection error'));
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.ws = null;

        if (this.onDisconnectedCallback) {
          this.onDisconnectedCallback();
        }

        // Attempt reconnection if not a normal closure
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
        }
      };

    } catch (error) {
      console.error('Failed to connect:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error as Error);
      }
      throw error;
    }
  }

  /**
   * Send Access Token as first WebSocket message
   * This is used by the agent for identity verification
   */
  private sendAccessToken(accessToken: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send access token: WebSocket not connected');
      return;
    }

    // Send auth message with access_token (snake_case, as expected by the agent)
    const authMessage = {
      type: 'auth',
      access_token: accessToken  // Must be snake_case
    };

    this.ws.send(JSON.stringify(authMessage));
    console.log('📤 Sent auth message');
    
    // Send "Hi" message to initiate conversation
    // This triggers the agent to start speaking
    setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const helloMessage = {
          type: 'bidi_text_input',
          text: 'Hi'
        };
        this.ws.send(JSON.stringify(helloMessage));
        console.log('📤 Sent bidi_text_input: Hi');
      }
    }, 100); // Small delay to ensure auth is processed first
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'bidi_transcript_stream':
          // Transcription from user or assistant
          if (this.onTranscriptionCallback) {
            this.onTranscriptionCallback(
              data.transcript || data.text,
              data.role || 'assistant'
            );
          }
          break;

        case 'bidi_audio_stream':
          // Audio response from assistant
          if (this.onAudioCallback && data.audio) {
            // Convert base64 to ArrayBuffer
            const audioData = this.base64ToArrayBuffer(data.audio);
            this.onAudioCallback(audioData);
          }
          break;

        case 'bidi_text_output':
          // Text response from assistant
          if (this.onResponseCallback) {
            this.onResponseCallback(data.text);
          }
          break;

        case 'bidi_interruption':
          // User interrupted the agent - stop audio playback
          console.log('🔇 Interruption detected - stopping audio');
          if (this.onInterruptionCallback) {
            this.onInterruptionCallback();
          }
          break;

        case 'tool_use_stream':
          // Tool invocation notification
          console.log('🔧 Tool invoked:', data.current_tool_use?.name || 'unknown');
          break;

        case 'tool_result':
          // Tool result notification
          console.log('✅ Tool result received');
          break;

        case 'location_request':
          // Agent is requesting user's location
          console.log('📍 Location requested by agent');
          this.handleLocationRequest(data.request_id);
          break;

        case 'bidi_connection_start':
        case 'bidi_usage':
          // Informational messages - just log
          console.log(`ℹ️ ${data.type}`);
          break;

        case 'error':
          console.error('Agent error:', data.message);
          if (this.onErrorCallback) {
            this.onErrorCallback(new Error(data.message));
          }
          break;

        default:
          console.log('Received message:', data.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  /**
   * Handle location request from agent
   */
  private handleLocationRequest(requestId: string): void {
    const locationResponse = {
      type: 'location_response',
      request_id: requestId,
      location: this.options.userLocation || {
        latitude: 32.7767,
        longitude: -96.7970,
        accuracy: 10.0
      }
    };
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(locationResponse));
      const loc = this.options.userLocation || { latitude: 32.7767, longitude: -96.7970 };
      console.log('📍 Sent user location:', loc.latitude, loc.longitude);
    }
  }

  /**
   * Send audio data to AgentCore
   * Audio should be 16kHz PCM format
   */
  sendAudio(audioData: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send audio: WebSocket not connected');
      return;
    }

    const message = {
      type: 'bidi_audio_input',
      audio: this.arrayBufferToBase64(audioData),
      format: 'pcm',
      sample_rate: 16000,
      channels: 1
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send text message to AgentCore
   */
  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send text: WebSocket not connected');
      return;
    }

    const message = {
      type: 'bidi_text_input',
      text
    };

    this.ws.send(JSON.stringify(message));
    console.log('📤 Sent text:', text);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // Event callback setters
  onTranscription(callback: (text: string, role: 'user' | 'assistant') => void): void {
    this.onTranscriptionCallback = callback;
  }

  onResponse(callback: (text: string) => void): void {
    this.onResponseCallback = callback;
  }

  onAudio(callback: (audioData: ArrayBuffer) => void): void {
    this.onAudioCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  onConnected(callback: () => void): void {
    this.onConnectedCallback = callback;
  }

  onDisconnected(callback: () => void): void {
    this.onDisconnectedCallback = callback;
  }

  onInterruption(callback: () => void): void {
    this.onInterruptionCallback = callback;
  }

  // Utility functions
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
