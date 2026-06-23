import type { Message, Session, SessionCost } from 'nexus-core';

export interface TUIState {
  input: string;
  messages: Message[];
  status: 'idle' | 'thinking' | 'streaming' | 'error';
  session?: Session;
  showCost: boolean;
  showCompression: boolean;
  showReasoning: boolean;
  theme: 'dark' | 'light';
}

export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  muted: string;
  text: string;
  background: string;
  border: string;
}

export const darkTheme: ThemeColors = {
  primary: '#00FFAA',
  secondary: '#5555FF',
  success: '#00FF00',
  warning: '#FFAA00',
  error: '#FF5555',
  muted: '#666666',
  text: '#EEEEEE',
  background: '#111111',
  border: '#333333',
};

export const lightTheme: ThemeColors = {
  primary: '#009955',
  secondary: '#3333CC',
  success: '#008800',
  warning: '#CC8800',
  error: '#CC3333',
  muted: '#999999',
  text: '#111111',
  background: '#FFFFFF',
  border: '#CCCCCC',
};

export { type Message, type Session, type SessionCost };
