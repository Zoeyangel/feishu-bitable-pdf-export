import type { IPDFTemplate } from '../types';
import { DefaultTemplate } from './DefaultTemplate';
import { InvoiceTemplate } from './InvoiceTemplate';

export const templates: IPDFTemplate[] = [
  DefaultTemplate,
  InvoiceTemplate,
];

export function getTemplateById(id: string): IPDFTemplate | undefined {
  return templates.find(t => t.id === id);
}

export { DefaultTemplate, InvoiceTemplate };
