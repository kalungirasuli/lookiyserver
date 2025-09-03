"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.generateAndUploadAvatar = generateAndUploadAvatar;
const jdenticon = __importStar(require("jdenticon"));
const storage_1 = require("./storage");
const logger_1 = __importDefault(require("./logger"));
/**
 * Generates a random avatar using Jdenticon and uploads it to GCS
 * @param userId - User's ID to use as seed for consistent avatar generation
 * @returns Promise<string> - URL of the uploaded avatar
 */
function generateAndUploadAvatar(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Generate a PNG avatar using Jdenticon
            const size = 400; // Size of the avatar in pixels
            const pngBuffer = jdenticon.toPng(userId, size);
            // Create a file object that matches Express.Multer.File interface
            const avatarFile = {
                fieldname: 'avatar',
                originalname: `${userId}-avatar.png`,
                encoding: '7bit',
                mimetype: 'image/png',
                buffer: pngBuffer,
                size: pngBuffer.length,
                stream: null,
                destination: '',
                filename: '',
                path: ''
            };
            // Upload to Google Cloud Storage
            const avatarUrl = yield (0, storage_1.uploadToGCS)(avatarFile);
            logger_1.default.info('Generated and uploaded avatar', { userId, avatarUrl });
            return avatarUrl;
        }
        catch (error) {
            logger_1.default.error('Failed to generate or upload avatar', {
                userId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to generate avatar');
        }
    });
}
