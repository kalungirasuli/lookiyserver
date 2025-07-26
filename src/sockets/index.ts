import { Server as HttpServer } from 'http';
import { NetworkSearchSocket } from './NetworkSearchSocket';
import { initializeSocketService } from '../utils/socket';

export function initializeSockets(server: HttpServer) {
  // Initialize socket service with authentication middleware
  const io = initializeSocketService(server);

  // Initialize public search socket with the same server instance
  new NetworkSearchSocket(io);
  
  return io;
}