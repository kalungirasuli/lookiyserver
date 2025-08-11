import QRCode from 'qrcode';
import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';
import { readFileSync } from 'fs';
import { join } from 'path';

interface QROptions {
  size?: number;
  dotScale?: number;
  frameColor?: string;
  frameWidth?: number;
  frameRadius?: number;
  padding?: number;
  logoScale?: number;
  logoMargin?: number;
  logoDropShadow?: boolean;
}

const DEFAULT_LOGO_PATH = join(__dirname, '../../public/logo.png');

async function getDefaultLogo(): Promise<Buffer> {
  try {
    return readFileSync(DEFAULT_LOGO_PATH);
  } catch (error) {
    console.warn('Default logo not found:', error);
    return Buffer.from([]);
  }
}

function formatDeepLink(url: string): string {
  if (!url.includes('://')) {
    // If it's not already a URL scheme, assume it's a web URL
    return `https://${url.replace(/^[/]*/, '')}`;
  }
  return url;
}

export async function generateCustomQR(
  data: string,
  logoBuffer?: Buffer | 'default' | null,
  options: QROptions = {}
): Promise<Buffer> {
  // Format the URL for deep linking
  const formattedData = formatDeepLink(data);
  
  // Default options
  const {
    size = 400,
    dotScale = 0.8, // increased from 0.4 to 0.8
    frameColor = '#FF6B35',
    frameWidth = 8,
    frameRadius = 15,
    padding = 20,
    logoScale = 0.2,
    logoMargin = 4,
    logoDropShadow = true
  } = options;

  // Input validation
  if (!formattedData) throw new Error('Data is required');
  if (formattedData.length > 2953) throw new Error('Data too long for QR code');

  // Handle logo buffer
  let finalLogoBuffer: Buffer | undefined;
  if (logoBuffer === 'default') {
    finalLogoBuffer = await getDefaultLogo();
  } else if (logoBuffer) {
    finalLogoBuffer = logoBuffer;
  }

  // Create canvas
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Generate QR code with the formatted URL
  const qrData = await QRCode.create(formattedData, {
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
  await drawQRDots(ctx, qrData, moduleCount, moduleSize, dotSize, padding + frameWidth);

  // Add logo if provided or default
  if (finalLogoBuffer?.length) {
    await addLogo(ctx, finalLogoBuffer, size, padding, frameWidth, logoScale, logoMargin, logoDropShadow);
  }

  return canvas.toBuffer('image/png');
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  frameWidth: number,
  radius: number,
  color: string
): void {
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

async function drawQRDots(
  ctx: CanvasRenderingContext2D,
  qrData: any,
  moduleCount: number,
  moduleSize: number,
  dotSize: number,
  offset: number
): Promise<void> {
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
}

async function addLogo(
  ctx: CanvasRenderingContext2D,
  logoBuffer: Buffer,
  size: number,
  padding: number,
  frameWidth: number,
  logoScale: number,
  logoMargin: number,
  dropShadow: boolean
): Promise<void> {
  try {
    const logo = await loadImage(logoBuffer);
    const logoSize = Math.min(size * logoScale, size - (padding + frameWidth) * 2);
    const logoX = (size - logoSize) / 2;
    const logoY = (size - logoSize) / 2;

    // Draw white background circle
    ctx.beginPath();
    ctx.arc(size/2, size/2, logoSize/2 + logoMargin, 0, Math.PI * 2);
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
  } catch (error) {
    console.error('Error adding logo:', error);
    // Continue without logo if there's an error
  }
}

// tesithe funcion

