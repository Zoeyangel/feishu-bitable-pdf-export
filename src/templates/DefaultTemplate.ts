import type { IPDFTemplate, RecordData } from '../types';

export const DefaultTemplate: IPDFTemplate = {
  id: 'default',
  name: '默认',
  description: '基础记录模板，字段-值列表形式',

  generate(data: RecordData, editedValues?: Record<string, string>): string {
    const rows = data.fields.map(field => {
      const value = editedValues?.[field.fieldId] ?? field.value;
      return `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; font-weight: 500; color: #666; width: 30%;">${field.fieldName}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; width: 70%;">${value || '-'}</td>
      </tr>
    `}).join('');

    return `
      <div style="font-family: Arial, 'Microsoft YaHei', 'PingFang SC', sans-serif;">
        <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 20px; color: #333;">记录详情</h1>
        <table style="width: 100%; border-collapse: collapse;">
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  },
};
