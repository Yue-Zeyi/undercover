import qrcode from 'qrcode-generator';

/**
 * Render a QR code into a crisp, reusable H5 canvas.
 *
 * The payloads used by the app are URLs, so Byte mode is sufficient and
 * keeps the generated matrix stable across browsers.
 */
export function createQrCanvas(value: string): HTMLCanvasElement {
  if (!value) throw new Error('二维码内容为空');
  const code = qrcode(0, 'M');
  code.addData(value, 'Byte');
  code.make();

  const moduleCount = code.getModuleCount();
  const margin = 4;
  const cellSize = Math.max(4, Math.floor(480 / (moduleCount + margin * 2)));
  const size = (moduleCount + margin * 2) * cellSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法生成二维码');
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#172923';
  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (code.isDark(row, column)) {
        context.fillRect((column + margin) * cellSize, (row + margin) * cellSize, cellSize, cellSize);
      }
    }
  }
  return canvas;
}

export function createQrDataUrl(value: string): string {
  return createQrCanvas(value).toDataURL('image/png');
}
