/* eslint-env browser */

(function () {
  const BASE83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

  function decode83(string) {
    let value = 0;
    for (let index = 0; index < string.length; index += 1) {
      const digit = BASE83.indexOf(string[index]);
      if (digit < 0) {
        throw new Error('Invalid blurhash character');
      }
      value = value * 83 + digit;
    }
    return value;
  }

  function sRGBToLinear(value) {
    const v = value / 255;
    if (v <= 0.04045) {
      return v / 12.92;
    }
    return Math.pow((v + 0.055) / 1.055, 2.4);
  }

  function linearToSRGB(value) {
    const v = Math.max(0, Math.min(1, value));
    if (v <= 0.0031308) {
      return Math.round(v * 12.92 * 255 + 0.5);
    }
    return Math.round((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5);
  }

  function signPow(value, exp) {
    return Math.sign(value) * Math.pow(Math.abs(value), exp);
  }

  function decodeDC(value) {
    const intR = value >> 16;
    const intG = (value >> 8) & 255;
    const intB = value & 255;
    return [sRGBToLinear(intR), sRGBToLinear(intG), sRGBToLinear(intB)];
  }

  function decodeAC(value, maximumValue) {
    const quantR = Math.floor(value / (19 * 19));
    const quantG = Math.floor(value / 19) % 19;
    const quantB = value % 19;

    const normalise = (quant) => (quant - 9) / 9;
    return [
      signPow(normalise(quantR) * maximumValue, 2),
      signPow(normalise(quantG) * maximumValue, 2),
      signPow(normalise(quantB) * maximumValue, 2),
    ];
  }

  function decode(blurhash, width, height, punch = 1) {
    if (!blurhash || blurhash.length < 6 || width <= 0 || height <= 0) {
      return new Uint8ClampedArray(Math.max(0, width * height * 4));
    }

    const sizeFlag = decode83(blurhash[0]);
    const numY = Math.floor(sizeFlag / 9) + 1;
    const numX = (sizeFlag % 9) + 1;
    const quantisedMaximumValue = decode83(blurhash[1]);
    const maximumValue = ((quantisedMaximumValue + 1) / 166) * punch;

    const colors = new Array(numX * numY);
    colors[0] = decodeDC(decode83(blurhash.slice(2, 6)));

    let hashIndex = 6;
    for (let i = 1; i < colors.length; i += 1) {
      const acValue = decode83(blurhash.slice(hashIndex, hashIndex + 2));
      colors[i] = decodeAC(acValue, maximumValue);
      hashIndex += 2;
    }

    const pixels = new Uint8ClampedArray(width * height * 4);
    let pixelIndex = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let red = 0;
        let green = 0;
        let blue = 0;

        for (let yComponent = 0; yComponent < numY; yComponent += 1) {
          for (let xComponent = 0; xComponent < numX; xComponent += 1) {
            const basis = Math.cos((Math.PI * x * xComponent) / width) * Math.cos((Math.PI * y * yComponent) / height);
            const color = colors[xComponent + yComponent * numX];
            red += color[0] * basis;
            green += color[1] * basis;
            blue += color[2] * basis;
          }
        }

        pixels[pixelIndex] = linearToSRGB(red);
        pixels[pixelIndex + 1] = linearToSRGB(green);
        pixels[pixelIndex + 2] = linearToSRGB(blue);
        pixels[pixelIndex + 3] = 255;
        pixelIndex += 4;
      }
    }

    return pixels;
  }

  function drawToCanvas(canvas, blurhash, width, height, punch = 1) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      return false;
    }

    try {
      const targetWidth = Math.max(1, Math.floor(width || 32));
      const targetHeight = Math.max(1, Math.floor(height || 32));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return false;

      const pixels = decode(blurhash, targetWidth, targetHeight, punch);
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      context.putImageData(new ImageData(pixels, targetWidth, targetHeight), 0, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  window.Blurhash = {
    decode,
    drawToCanvas,
  };
})();
