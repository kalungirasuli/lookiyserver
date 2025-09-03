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
exports.generateCustomQR = generateCustomQR;
const qrcode_1 = __importDefault(require("qrcode"));
const canvas_1 = require("canvas");
const fs_1 = require("fs");
const path_1 = require("path");
const DEFAULT_LOGO_PATH = (0, path_1.join)(__dirname, '../../public/logo.png');
function getDefaultLogo() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return (0, fs_1.readFileSync)(DEFAULT_LOGO_PATH);
        }
        catch (error) {
            console.warn('Default logo not found:', error);
            return Buffer.from([]);
        }
    });
}
function formatDeepLink(url) {
    if (!url.includes('://')) {
        // If it's not already a URL scheme, assume it's a web URL
        return `https://${url.replace(/^[/]*/, '')}`;
    }
    return url;
}
function generateCustomQR(data_1, logoBuffer_1) {
    return __awaiter(this, arguments, void 0, function* (data, logoBuffer, options = {}) {
        // Format the URL for deep linking
        const formattedData = formatDeepLink(data);
        // Default options
        const { size = 400, dotScale = 0.8, // increased from 0.4 to 0.8
        frameColor = '#FF6B35', frameWidth = 8, frameRadius = 15, padding = 20, logoScale = 0.2, logoMargin = 4, logoDropShadow = true } = options;
        // Input validation
        if (!formattedData)
            throw new Error('Data is required');
        if (formattedData.length > 2953)
            throw new Error('Data too long for QR code');
        // Handle logo buffer
        let finalLogoBuffer;
        if (logoBuffer === 'default') {
            finalLogoBuffer = yield getDefaultLogo();
        }
        else if (logoBuffer) {
            finalLogoBuffer = logoBuffer;
        }
        // Create canvas
        const canvas = (0, canvas_1.createCanvas)(size, size);
        const ctx = canvas.getContext('2d');
        // Generate QR code with the formatted URL
        const qrData = yield qrcode_1.default.create(formattedData, {
            errorCorrectionLevel: 'H',
            // margin: 0
        });
        // Calculate dimensions
        const moduleCount = qrData.modules.size;
        const moduleSize = (size - (padding * 2) - (frameWidth * 2)) / moduleCount;
        const dotSize = moduleSize * dotScale;
        // Draw background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        // Draw frame
        drawFrame(ctx, size, frameWidth, frameRadius, frameColor);
        // Draw QR dots
        yield drawQRDots(ctx, qrData, moduleCount, moduleSize, dotSize, padding + frameWidth);
        // Add logo if provided or default
        if (finalLogoBuffer === null || finalLogoBuffer === void 0 ? void 0 : finalLogoBuffer.length) {
            yield addLogo(ctx, finalLogoBuffer, size, padding, frameWidth, logoScale, logoMargin, logoDropShadow);
        }
        return canvas.toBuffer('image/png');
    });
}
function drawFrame(ctx, size, frameWidth, radius, color) {
    ctx.fillStyle = color;
    // Top border
    ctx.fillRect(0, 0, size, frameWidth);
    // Bottom border
    ctx.fillRect(0, size - frameWidth, size, frameWidth);
    // Left border
    ctx.fillRect(0, 0, frameWidth, size);
    // Right border
    ctx.fillRect(size - frameWidth, 0, frameWidth, size);
}
function drawQRDots(ctx, qrData, moduleCount, moduleSize, dotSize, offset) {
    return __awaiter(this, void 0, void 0, function* () {
        ctx.fillStyle = '#000000';
        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (qrData.modules.get(row, col)) {
                    const x = offset + (col * moduleSize) + (moduleSize - dotSize) / 2;
                    const y = offset + (row * moduleSize) + (moduleSize - dotSize) / 2;
                    ctx.fillRect(x, y, dotSize, dotSize);
                }
            }
        }
    });
}
function addLogo(ctx, logoBuffer, size, padding, frameWidth, logoScale, logoMargin, dropShadow) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const logo = yield (0, canvas_1.loadImage)(logoBuffer);
            const logoSize = Math.min(size * logoScale, size - (padding + frameWidth) * 2);
            const logoX = (size - logoSize) / 2;
            const logoY = (size - logoSize) / 2;
            // Draw white background circle
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, logoSize / 2 + logoMargin, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            if (dropShadow) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }
            ctx.fill();
            // Reset shadow
            ctx.shadowColor = 'transparent';
            // Draw logo
            ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
        }
        catch (error) {
            console.error('Error adding logo:', error);
            // Continue without logo if there's an error
        }
    });
}
// tesithe funcion
