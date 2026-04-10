/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'jspdf' {
  interface jsPDF {
    internal: {
      pageSize: {
        getWidth(): number;
        getHeight(): number;
      };
    };
    addImage(imageData: string, format: string, x: number, y: number, w: number, h: number): void;
    output(type: 'blob'): Blob;
    output(type: 'datauristring'): string;
    setTextColor(r: number, g: number, b: number): void;
    setFontSize(size: number): void;
    setFont(font: string): void;
    text(text: string, x: number, y: number, options?: { align?: 'left' | 'center' | 'right' }): void;
    setDrawColor(r: number, g: number, b: number): void;
    setLineWidth(width: number): void;
    line(x1: number, y1: number, x2: number, y2: number): void;
    getTextWidth(text: string): number;
    link(x: number, y: number, w: number, h: number, options: { url: string }): void;
  }

  interface jsPDFOptions {
    orientation?: 'portrait' | 'landscape';
    unit?: 'mm' | 'cm' | 'in' | 'pt' | 'px';
    format?: 'a4' | 'a3' | 'letter' | [number, number];
  }

  export default class jsPDF {
    constructor(options?: jsPDFOptions);
    internal: {
      pageSize: {
        getWidth(): number;
        getHeight(): number;
      };
    };
    addImage(imageData: string, format: string, x: number, y: number, w: number, h: number): void;
    output(type: 'blob'): Blob;
    output(type: 'datauristring'): string;
    setTextColor(r: number, g: number, b: number): void;
    setFontSize(size: number): void;
    setFont(font: string): void;
    text(text: string, x: number, y: number, options?: { align?: 'left' | 'center' | 'right' }): void;
    setDrawColor(r: number, g: number, b: number): void;
    setLineWidth(width: number): void;
    line(x1: number, y1: number, x2: number, y2: number): void;
    getTextWidth(text: string): number;
    link(x: number, y: number, w: number, h: number, options: { url: string }): void;
  }
}

declare module 'html2canvas' {
  interface html2canvasOptions {
    scale?: number;
    useCORS?: boolean;
    logging?: boolean;
    backgroundColor?: string;
  }

  interface HTMLCanvasElementExtended extends HTMLCanvasElement {
    toDataURL(type: string): string;
  }

  function html2canvas(element: HTMLElement, options?: html2canvasOptions): Promise<HTMLCanvasElementExtended>;
  export default html2canvas;
}
