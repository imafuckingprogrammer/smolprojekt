import QRCode from 'qrcode';
import type { QRToken } from '../types/database';

export interface QROptions {
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  type: 'image/png' | 'image/jpeg';
  quality: number;
  margin: number;
  width: number;
  color: {
    dark: string;
    light: string;
  };
}

const defaultQROptions: QROptions = {
  errorCorrectionLevel: 'M',
  type: 'image/png',
  quality: 0.92,
  margin: 1,
  width: 256,
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  }
};

export function generateQRToken(restaurantId: string, tableNumber: number): string {
  const randomString = crypto.randomUUID().split('-')[0];
  return `${restaurantId}_table_${tableNumber}_${randomString}`;
}

export function parseQRToken(token: string): QRToken | null {
  try {
    const parts = token.split('_');
    if (parts.length < 4 || parts[1] !== 'table') {
      return null;
    }
    
    const restaurantId = parts[0];
    const tableNumber = parseInt(parts[2]);
    
    if (isNaN(tableNumber)) {
      return null;
    }
    
    return {
      restaurant_id: restaurantId,
      table_number: tableNumber,
      token
    };
  } catch {
    return null;
  }
}

export async function generateQRCode(
  token: string,
  baseUrl: string = 'https://tabledirect.com',
  options: Partial<QROptions> = {}
): Promise<string> {
  const url = `${baseUrl}/order/${token}`;
  const qrOptions = { ...defaultQROptions, ...options };
  
  try {
    return await QRCode.toDataURL(url, qrOptions);
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

export async function generateQRCodeBuffer(
  token: string,
  baseUrl: string = 'https://tabledirect.com',
  options: Partial<QROptions> = {}
): Promise<Buffer> {
  const url = `${baseUrl}/order/${token}`;
  const qrOptions = { ...defaultQROptions, ...options };
  
  try {
    return await QRCode.toBuffer(url, qrOptions);
  } catch (error) {
    console.error('Error generating QR code buffer:', error);
    throw new Error('Failed to generate QR code');
  }
}

export function downloadQRCode(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function printQRCode(dataUrl: string, tableName: string, restaurantName: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>QR Code - ${tableName}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
          }
          .qr-container {
            text-align: center;
            border: 2px solid #000;
            padding: 20px;
            border-radius: 8px;
            background: white;
          }
          .restaurant-name {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
          }
          .table-name {
            font-size: 18px;
            margin-bottom: 20px;
            color: #666;
          }
          .qr-code {
            margin: 20px 0;
          }
          .instructions {
            font-size: 14px;
            color: #666;
            margin-top: 15px;
            max-width: 300px;
          }
          @media print {
            body { background: white; }
            .qr-container { 
              border: 2px solid #000; 
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="qr-container">
          <div class="restaurant-name">${restaurantName}</div>
          <div class="table-name">${tableName}</div>
          <div class="qr-code">
            <img src="${dataUrl}" alt="QR Code" width="200" height="200" />
          </div>
          <div class="instructions">
            Scan with your phone camera to view menu and place order
          </div>
        </div>
      </body>
    </html>
  `);
  
  printWindow.document.close();
  printWindow.focus();
  
  // Wait for image to load before printing
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
} 