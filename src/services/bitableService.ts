import { bitable } from '@lark-base-open/js-sdk';
import type { FieldMeta, RecordData, Selection, FieldType } from '../types';

class BitableService {
  /**
   * 获取当前选中信息
   */
  async getSelection(): Promise<Selection | null> {
    try {
      console.log('[bitableService] 正在获取选中信息...');
      const selection = await bitable.base.getSelection();
      console.log('[bitableService] 选中信息:', selection);

      if (!selection) {
        console.log('[bitableService] selection 为空');
        return null;
      }

      if (!selection.recordId) {
        console.log('[bitableService] recordId 为空，当前可能未选中记录');
        return null;
      }

      return {
        tableId: selection.tableId!,
        viewId: selection.viewId!,
        recordId: selection.recordId,
      };
    } catch (error) {
      console.error('[bitableService] 获取选中信息失败:', error);
      return null;
    }
  }

  /**
   * 监听选中变化
   */
  onSelectionChange(callback: (selection: Selection | null) => void): () => void {
    console.log('[bitableService] 注册选中变化监听...');
    return bitable.base.onSelectionChange((e) => {
      console.log('[bitableService] 选中变化:', e.data);
      const selection = e.data;
      if (selection && selection.recordId) {
        callback({
          tableId: selection.tableId!,
          viewId: selection.viewId!,
          recordId: selection.recordId,
        });
      } else {
        callback(null);
      }
    });
  }

  /**
   * 获取表格字段列表
   */
  async getFieldList(tableId: string): Promise<FieldMeta[]> {
    try {
      const table = await bitable.base.getTableById(tableId);
      const fieldMetaList = await table.getFieldMetaList();

      return fieldMetaList.map(field => ({
        id: field.id,
        name: field.name,
        type: field.type as unknown as FieldType,
        selected: false,
      }));
    } catch (error) {
      console.error('获取字段列表失败:', error);
      return [];
    }
  }

  /**
   * 获取单条记录数据
   */
  async getRecord(
    tableId: string,
    recordId: string,
    fieldIds: string[]
  ): Promise<RecordData | null> {
    try {
      const table = await bitable.base.getTableById(tableId);
      const fieldMetaList = await table.getFieldMetaList();
      const fields: { fieldId: string; fieldName: string; value: string }[] = [];

      for (const fieldId of fieldIds) {
        const fieldMeta = fieldMetaList.find(f => f.id === fieldId);
        const value = await table.getCellString(fieldId, recordId);
        fields.push({
          fieldId,
          fieldName: fieldMeta?.name || '',
          value: value || '',
        });
      }

      return { recordId, fields };
    } catch (error) {
      console.error('获取记录数据失败:', error);
      return null;
    }
  }

  /**
   * 获取单个单元格的值
   */
  async getCellValue(tableId: string, fieldId: string, recordId: string): Promise<string> {
    try {
      const table = await bitable.base.getTableById(tableId);
      const value = await table.getCellString(fieldId, recordId);
      console.log(`[bitableService] getCellValue: tableId=${tableId}, fieldId=${fieldId}, recordId=${recordId}, value="${value}"`);
      return value || '';
    } catch (error) {
      console.error('[bitableService] 获取单元格值失败:', error);
      return '';
    }
  }

  /**
   * 获取指定字段在所有记录中的值列表
   * 用于统计 PI 号最大值
   * 优化：使用 Promise.all 并行获取，避免串行等待
   */
  async getAllFieldValues(tableId: string, fieldId: string): Promise<string[]> {
    try {
      console.log('[bitableService] getAllFieldValues 开始, tableId:', tableId, 'fieldId:', fieldId);
      const table = await bitable.base.getTableById(tableId);
      const records = await table.getRecordIdList();
      console.log('[bitableService] 获取到记录数:', records.length);

      // 并行获取所有记录的值（性能优化）
      const valuePromises = records.map(recordId =>
        table.getCellString(fieldId, recordId).catch(() => '')
      );
      const allResults = await Promise.all(valuePromises);

      // 过滤非空值
      const values = allResults
        .filter(value => value && value.trim())
        .map(value => value.trim());

      console.log('[bitableService] 最终返回的非空值:', values);
      return values;
    } catch (error) {
      console.error('[bitableService] 获取所有记录字段值失败:', error);
      return [];
    }
  }

  /**
   * 写入单元格值
   * 用于导出后回填 Invoice number
   */
  async setCellValue(
    tableId: string,
    fieldId: string,
    recordId: string,
    value: string
  ): Promise<boolean> {
    try {
      const table = await bitable.base.getTableById(tableId);
      await table.setCellValue(fieldId, recordId, value);
      console.log('[bitableService] 写入单元格成功:', { fieldId, recordId, value });
      return true;
    } catch (error) {
      console.error('[bitableService] 写入单元格失败:', error);
      return false;
    }
  }
}

export const bitableService = new BitableService();
