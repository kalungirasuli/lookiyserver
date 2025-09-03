"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptServiceAccountKeyInMemory = decryptServiceAccountKeyInMemory;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function decryptServiceAccountKeyInMemory(encryptedPath) {
    const password = process.env.KEY_PASSWORD;
    if (!password) {
        throw new Error('Missing KEY_PASSWORD environment variable');
    }
    const tempPath = path_1.default.join(__dirname, 'temp-decrypted.json');
    try {
        // Use OpenSSL directly via child_process
        const command = `openssl aes-256-cbc -d -salt -in "${encryptedPath}" -out "${tempPath}" -pass pass:"${password}"`;
        (0, child_process_1.execSync)(command, { stdio: 'pipe' });
        const decrypted = (0, fs_1.readFileSync)(tempPath, 'utf-8');
        const parsed = JSON.parse(decrypted);
        // Clean up temp file
        (0, fs_1.unlinkSync)(tempPath);
        return parsed;
    }
    catch (error) {
        // Clean up temp file if it exists
        try {
            (0, fs_1.unlinkSync)(tempPath);
        }
        catch (_a) { }
        throw error;
    }
}
