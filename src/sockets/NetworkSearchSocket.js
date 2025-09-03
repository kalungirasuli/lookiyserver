"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkSearchSocket = void 0;
const db_1 = __importDefault(require("../utils/db"));
const logger_1 = __importDefault(require("../utils/logger"));
class NetworkSearchSocket {
    constructor(io) {
        this.io = io;
        this.searchNamespace = io.of('/network-search');
        this.initialize();
    }
    initialize() {
        this.searchNamespace.on('connection', (socket) => {
            logger_1.default.info('Client connected to network search');
            socket.on('search', (query) => __awaiter(this, void 0, void 0, function* () {
                try {
                    logger_1.default.info('Network search query received', { query });
                    let networks = [];
                    if (query.link) {
                        // Extract tagname from link (last part after /)
                        const tagName = query.link.split('/').pop();
                        networks = yield this.searchByTagName(tagName || '');
                    }
                    else if (query.term) {
                        networks = yield this.searchNetworks(query.term);
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
                    logger_1.default.info('Network search results', publicNetworks);
                    socket.emit('searchResults', publicNetworks);
                }
                catch (error) {
                    logger_1.default.error('Network search error', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        query
                    });
                    socket.emit('searchError', { message: 'Search failed' });
                }
            }));
            socket.on('disconnect', () => {
                logger_1.default.info('Client disconnected from network search');
            });
        });
    }
    searchNetworks(term) {
        return __awaiter(this, void 0, void 0, function* () {
            // Search in networks table using ILIKE for case-insensitive partial matching
            return yield (0, db_1.default) `
      SELECT 
        n.*,
        COUNT(nm.user_id) as member_count
      FROM networks n
      LEFT JOIN network_members nm ON nm.network_id = n.id
      WHERE 
        (n.name ILIKE ${'%' + term + '%'}
        OR n.tag_name ILIKE ${'%' + term + '%'}
        OR n.description ILIKE ${'%' + term + '%'})
      GROUP BY n.id
      ORDER BY n.created_at DESC
      LIMIT 20
    `;
        });
    }
    searchByTagName(tagName) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield (0, db_1.default) `
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
        });
    }
}
exports.NetworkSearchSocket = NetworkSearchSocket;
