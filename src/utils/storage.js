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
exports.avatarUpload = void 0;
exports.uploadToGCS = uploadToGCS;
const storage_1 = require("@google-cloud/storage");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = __importDefault(require("./logger"));
const keyDecrypt_1 = require("./keyDecrypt");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables at the start
dotenv_1.default.config();
// Initialize Google Cloud Storage with decrypted credentials
console.log('Google Cloud Storage initializing with project ID:', process.env.KEY_PASSWORD);
const credentials = process.env.KEY_PASSWORD ?
    (0, keyDecrypt_1.decryptServiceAccountKeyInMemory)(path_1.default.resolve(__dirname, 'service-account.enc')) : undefined;
logger_1.default.info('Google Cloud Storage initializing with:', {
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    bucket: process.env.GOOGLE_CLOUD_BUCKET,
    hasCredentials: !!credentials
});
const storage = new storage_1.Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    credentials: credentials, // Use decrypted credentials instead of keyFilename
});
const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET || '');
// Configure Multer
const multerStorage = multer_1.default.memoryStorage();
// File filter to allow only images
const fileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF and WEBP are allowed.'), false);
    }
};
// Configure multer for avatar upload
exports.avatarUpload = (0, multer_1.default)({
    storage: multerStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1 * 1024 * 1024, // 1MB limit
    },
}).single('avatar');
// Function to upload file to Google Cloud Storage
function uploadToGCS(file) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const fileName = `avatars/${crypto_1.default.randomUUID()}${path_1.default.extname(file.originalname)}`;
            const blob = bucket.file(fileName);
            const blobStream = blob.createWriteStream({
                resumable: false,
                metadata: {
                    contentType: file.mimetype,
                },
            });
            return new Promise((resolve, reject) => {
                blobStream.on('error', (err) => {
                    logger_1.default.error('Failed to upload file to GCS', { error: err });
                    reject(err);
                });
                blobStream.on('finish', () => __awaiter(this, void 0, void 0, function* () {
                    // Make the file public
                    yield blob.makePublic();
                    // Get the public URL
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                    resolve(publicUrl);
                }));
                blobStream.end(file.buffer);
            });
        }
        catch (error) {
            logger_1.default.error('Error in uploadToGCS', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    });
}
