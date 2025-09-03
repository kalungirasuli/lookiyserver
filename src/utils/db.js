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
const postgres_1 = __importDefault(require("postgres"));
const logger_1 = __importDefault(require("./logger"));
const dotenv_1 = require("dotenv");
const process_1 = __importDefault(require("process"));
// Load environment variables
(0, dotenv_1.config)();
const sql = (0, postgres_1.default)({
    host: 'localhost',
    port: process_1.default.env.POSTGRES_PORT, //5432,
    username: process_1.default.env.POSTGRES_USERNAME, //'admin',
    password: process_1.default.env.POSTGRES_PASSWORD, //'supersecretpassword',
    database: 'lookiy',
    onnotice: msg => logger_1.default.info('Database notice', { msg }),
    debug: (connection, query, params) => {
        logger_1.default.debug('Database query', {
            query,
            params,
            connectionPid: connection.pid
        });
    },
});
function testConnection() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield sql `SELECT NOW()`;
            logger_1.default.info('Database connection successful', { timestamp: result[0].now });
        }
        catch (error) {
            logger_1.default.error('Database connection failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
}
testConnection();
exports.default = sql;
