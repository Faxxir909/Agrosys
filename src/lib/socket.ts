import { io } from 'socket.io-client';

const getBaseUrl = () => {
  return typeof window !== 'undefined' ? window.location.origin : '';
};

export const socket = io(getBaseUrl(), {
  autoConnect: true,
  reconnection: true
});
