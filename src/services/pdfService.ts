import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { IPDFTemplate, RecordData } from '../types';
import { generateInvoiceHTML } from '../templates/InvoiceTemplate';

interface LinkPosition {
  url: string;
  x: number;  // mm
  y: number;  // mm
  width: number;  // mm
  height: number;  // mm
}

class PDFService {
  /**
   * 生成PDF Blob
   */
  async generatePDF(template: IPDFTemplate, data: RecordData, editedValues?: Record<string, string>, invoiceNumber?: string): Promise<Blob> {
    // A4尺寸 (mm)
    const a4Width = 210;
    const a4Height = 297;
    const margin = 10; // 页边距

    // 创建临时容器
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = `${a4Width - margin * 2}mm`;
    container.style.backgroundColor = 'white';
    container.style.padding = `${margin}mm`;
    container.style.boxSizing = 'border-box';
    container.style.fontFamily = 'Arial, "Microsoft YaHei", "PingFang SC", sans-serif';
    document.body.appendChild(container);

    try {
      // 生成HTML内容
      let htmlContent: string;
      if (template.id === 'invoice' && invoiceNumber) {
        // 对于 Invoice 模板，使用支持 invoiceNumber 的生成函数
        htmlContent = generateInvoiceHTML(data, editedValues, invoiceNumber);
      } else {
        htmlContent = template.generate(data, editedValues) as string;
      }
      container.innerHTML = htmlContent;

      // 等待字体加载
      await document.fonts.ready;

      // 查找支付链接元素，获取其位置
      const links: LinkPosition[] = [];
      const paymentLinkEl = container.querySelector('#payment-link') as HTMLElement;
      if (paymentLinkEl) {
        const containerRect = container.getBoundingClientRect();
        const linkRect = paymentLinkEl.getBoundingClientRect();

        // 计算相对位置（转换为 mm）
        const pxToMm = (a4Width - margin * 2) / containerRect.width;
        const linkX = margin + (linkRect.left - containerRect.left) * pxToMm;
        const linkY = margin + (linkRect.top - containerRect.top) * pxToMm;
        const linkWidth = linkRect.width * pxToMm;
        const linkHeight = linkRect.height * pxToMm;

        const href = paymentLinkEl.getAttribute('href') || 'https://stripe.com/pay';
        links.push({ url: href, x: linkX, y: linkY, width: linkWidth, height: linkHeight });
      }

      // 使用html2canvas截图
      const canvas = await html2canvas(container, {
        scale: 2,  // 保持高质量
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // 创建PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgData = canvas.toDataURL('image/png');

      // 计算尺寸
      // canvas像素 / DPI * 25.4 = mm
      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;

      // PDF中图片的宽度 = A4宽度 - 页边距
      const imgWidthMm = a4Width - margin * 2;
      // 按比例计算高度
      const imgHeightMm = (imgHeightPx / imgWidthPx) * imgWidthMm;

      // 如果内容超出页面高度，需要缩放
      const maxHeight = a4Height - margin * 2;
      let finalWidth = imgWidthMm;
      let finalHeight = imgHeightMm;
      let scaleRatio = 1;

      if (imgHeightMm > maxHeight) {
        // 内容超出，按比例缩放以适应页面
        scaleRatio = maxHeight / imgHeightMm;
        finalWidth = imgWidthMm * scaleRatio;
        finalHeight = maxHeight;
      }

      // 居中放置（水平居中）
      const x = margin;

      pdf.addImage(imgData, 'PNG', x, margin, finalWidth, finalHeight);

      // 添加可点击链接
      links.forEach(link => {
        // 调整链接位置（考虑缩放）
        const adjustedX = link.x * scaleRatio;
        const adjustedY = link.y * scaleRatio;
        const adjustedWidth = link.width * scaleRatio;
        const adjustedHeight = link.height * scaleRatio;

        pdf.link(adjustedX, adjustedY, adjustedWidth, adjustedHeight, { url: link.url });
      });

      // 返回Blob
      return pdf.output('blob');
    } finally {
      document.body.removeChild(container);
    }
  }

  /**
   * 新标签页预览PDF
   */
  async preview(template: IPDFTemplate, data: RecordData, editedValues?: Record<string, string>, invoiceNumber?: string): Promise<void> {
    try {
      const blob = await this.generatePDF(template, data, editedValues, invoiceNumber);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      console.error('PDF预览失败:', error);
      throw error;
    }
  }

  /**
   * 下载PDF文件
   */
  async download(template: IPDFTemplate, data: RecordData, filename: string = 'export.pdf', editedValues?: Record<string, string>, invoiceNumber?: string): Promise<void> {
    try {
      const blob = await this.generatePDF(template, data, editedValues, invoiceNumber);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF下载失败:', error);
      throw error;
    }
  }
}

export const pdfService = new PDFService();
