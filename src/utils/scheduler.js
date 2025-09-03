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
exports.startScheduledJobs = startScheduledJobs;
const node_cron_1 = __importDefault(require("node-cron"));
const logger_1 = __importDefault(require("./logger"));
const authController_1 = require("../controllers/authController");
const networkController_1 = require("../controllers/networkController");
const recommendationService_1 = __importDefault(require("../services/recommendationService"));
const crossNetworkRecommendationService_1 = __importDefault(require("../services/crossNetworkRecommendationService"));
// Run account cleanup job at midnight every day
function startScheduledJobs() {
    // Schedule account deletion processing - runs at 00:00 every day
    node_cron_1.default.schedule('0 0 * * *', () => __awaiter(this, void 0, void 0, function* () {
        logger_1.default.info('Running scheduled account deletion cleanup');
        try {
            yield (0, authController_1.processPermanentDeletions)();
            logger_1.default.info('Account deletion cleanup completed successfully');
        }
        catch (error) {
            logger_1.default.error('Account deletion cleanup failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }));
    // Schedule recommendation cleanup - runs at 02:00 every day
    node_cron_1.default.schedule('0 2 * * *', () => __awaiter(this, void 0, void 0, function* () {
        logger_1.default.info('Running scheduled recommendation cleanup');
        try {
            yield recommendationService_1.default.clearOldRecommendations(7); // Clear recommendations older than 7 days
            logger_1.default.info('Recommendation cleanup completed successfully');
        }
        catch (error) {
            logger_1.default.error('Recommendation cleanup failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }));
    // Schedule expired suspension cleanup - runs at 03:00 every day
    node_cron_1.default.schedule('0 3 * * *', () => __awaiter(this, void 0, void 0, function* () {
        logger_1.default.info('Running scheduled expired suspension cleanup');
        try {
            yield (0, networkController_1.cleanupExpiredSuspensions)();
            logger_1.default.info('Expired suspension cleanup completed successfully');
        }
        catch (error) {
            logger_1.default.error('Expired suspension cleanup failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }));
    // Schedule cross-network recommendations refresh - runs at 04:00 every day
    node_cron_1.default.schedule('0 4 * * *', () => __awaiter(this, void 0, void 0, function* () {
        logger_1.default.info('Running scheduled cross-network recommendations refresh');
        try {
            yield crossNetworkRecommendationService_1.default.refreshAllRecommendations();
            logger_1.default.info('Cross-network recommendations refresh completed successfully');
        }
        catch (error) {
            logger_1.default.error('Cross-network recommendations refresh failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }));
    logger_1.default.info('Scheduled jobs initialized');
}
