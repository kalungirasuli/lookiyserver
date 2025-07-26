import { Server, Socket, Namespace } from 'socket.io';
import sql from '../utils/db';
import logger from '../utils/logger';
import { Network } from '../models/database';

export class NetworkSearchSocket {
  private io: Server;
  private searchNamespace: Namespace;

  constructor(io: Server) {
    this.io = io;
    this.searchNamespace = io.of('/network-search');
    this.initialize();
  }

  private initialize() {
    this.searchNamespace.on('connection', (socket: Socket) => {
      logger.info('Client connected to network search');

      socket.on('search', async (query: { term?: string; link?: string }) => {
        try {
        logger.info('Network search query received', { query });
          let networks: Network[] = [];
          
          if (query.link) {
            // Extract tagname from link (last part after /)
            const tagName = query.link.split('/').pop();
            networks = await this.searchByTagName(tagName || '');
          } else if (query.term) {
            networks = await this.searchNetworks(query.term);
          }

          // Map networks to public view (excluding sensitive data)
          const publicNetworks = networks.map(network => ({
            id: network.id,
            name: network.name,
            tagName: network.tag_name,
            description: network.description,
            type: network.is_private ? 'private' : 'public',
            approvalMode: network.approval_mode,
            memberCount: network.member_count,
            createdAt: network.created_at,
            avatar: network.avatar
          }));
          logger.info('Network search results', publicNetworks);
          socket.emit('searchResults', publicNetworks);
        } catch (error) {
          logger.error('Network search error', {
            error: error instanceof Error ? error.message : 'Unknown error',
            query
          });
          socket.emit('searchError', { message: 'Search failed' });
        }
      });

      socket.on('disconnect', () => {
        logger.info('Client disconnected from network search');
      });
    });
  }

  private async searchNetworks(term: string): Promise<Network[]> {
    // Search in networks table using ILIKE for case-insensitive partial matching
    return await sql<Network[]>`
      SELECT 
        n.*,
        COUNT(nm.user_id) as member_count
      FROM networks n
      LEFT JOIN network_members nm ON nm.network_id = n.id
      WHERE 
        (n.name ILIKE ${'%' + term + '%'}
        OR n.tag_name ILIKE ${'%' + term + '%'}
        OR n.description ILIKE ${'%' + term + '%'})
        AND n.is_deleted = false
      GROUP BY n.id
      ORDER BY n.created_at DESC
      LIMIT 20
    `;
  }

  private async searchByTagName(tagName: string): Promise<Network[]> {
    return await sql<Network[]>`
      SELECT 
        n.*,
        COUNT(nm.user_id) as member_count
      FROM networks n
      LEFT JOIN network_members nm ON nm.network_id = n.id
      WHERE 
        n.tag_name = ${tagName}
        AND n.is_deleted = false
      GROUP BY n.id
    `;
  }
}