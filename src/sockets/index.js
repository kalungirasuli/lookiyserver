"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSockets = initializeSockets;
const NetworkSearchSocket_1 = require("./NetworkSearchSocket");
const socket_1 = require("../utils/socket");
function initializeSockets(server) {
    // Initialize socket service with authentication middleware
    const io = (0, socket_1.initializeSocketService)(server);
    // Initialize public search socket with the same server instance
    new NetworkSearchSocket_1.NetworkSearchSocket(io);
    return io;
}
