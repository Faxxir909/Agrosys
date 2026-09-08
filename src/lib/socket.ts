import { io } from 'socket.io-client';

const getBaseUrl = () => {
  return typeof window !== 'undefined' ? window.location.origin : '';
};

function getAuthToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem('agro_jwt_token') || undefined;
}

export const socket = io(getBaseUrl(), {
  autoConnect: false,
  reconnection: true,
  auth: (cb) => {
    cb({ token: getAuthToken() });
  }
});

export function connectSocket() {
  const token = getAuthToken();
  if (!token) {
    if (socket.connected) socket.disconnect();
    return;
  }
  socket.auth = { token };
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect();
  }
}
