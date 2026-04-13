import { bitable } from '@lark-base-open/js-sdk';
import type { FieldMeta, RecordData, Selection, FieldType } from '../types';

class BitableService {
  /**
   * 异步检测是否在应用模式（dashboard）中运行
   * 通过实际调用 bitable.dashboard.getConfig() 来判断：
   *   - 应用模式下调用会成功（或抛出业务错误）
   *   - 底表模式下 dashboard 对象不支持该调用，会抛出特定错误
   * 同步的 state 属性在底表插件中也可能返回合法值，不可靠
   */
  async isDashboardMode(): Promise<boolean> {
    try {
      const state = bitable.dashboard?.state;
      if (state === undefined || state === null) return false;
      const validStates = ['Create', 'Config', 'View', 'FullScreen'];
      if (!validStates.includes(state as string)) return false;
      // Create 模式无法调 getConfig，但 state 合法即可确认是应用模式
      if (state === 'Create') return true;

      // 底表环境中 getConfig() 既不 resolve 也不 reject（永久挂起）
      // 应用模式宿主会迅速响应（<100ms），超过 1000ms 即判定为底表模式
      const result = await Promise.race([
        bitable.dashboard.getConfig().then(() => true).catch(() => false),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1000)),
      ]);
      return result;
    } catch {
      return false;
    }
  }

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
   * 优化：使用分页 API 获取所有记录，避免 200 条限制
   */
  async getAllFieldValues(tableId: string, fieldId: string): Promise<string[]> {
    try {
      console.log('[bitableService] getAllFieldValues 开始, tableId:', tableId, 'fieldId:', fieldId);
      const table = await bitable.base.getTableById(tableId);

      // 用 getRecordsByPage + stringValue:true，一次请求拿一整页所有字段的字符串值
      // 不再逐条 getCellString
      const values: string[] = [];
      let pageToken: string | undefined;

      do {
        const response = await table.getRecordsByPage({
          pageSize: 200,
          pageToken,
          stringValue: true,
        });

        for (const record of response.records) {
          const cellVal = record.fields[fieldId];
          const str = Array.isArray(cellVal)
            ? (cellVal as any[]).map(v => String(v ?? '')).join('')
            : String(cellVal ?? '');
          const trimmed = str.trim();
          if (trimmed) values.push(trimmed);
        }

        pageToken = response.hasMore ? (response.pageToken as string | undefined) : undefined;
        console.log('[bitableService] 分页获取，当前累计非空值:', values.length, 'hasMore:', response.hasMore);
      } while (pageToken);

      console.log('[bitableService] 最终返回的非空值数量:', values.length);
      return values;
    } catch (error) {
      console.error('[bitableService] 获取所有记录字段值失败:', error);
      return [];
    }
  }

  /**
   * 分页获取所有记录 ID
   * 用于应用模式下搜索记录
   */
  async getAllRecordIds(tableId: string): Promise<string[]> {
    try {
      console.log('[bitableService] getAllRecordIds 开始, tableId:', tableId);
      const table = await bitable.base.getTableById(tableId);

      const allRecordIds: string[] = [];
      let pageToken: string | undefined;
      let pageCount = 0;

      do {
        const response = await table.getRecordIdListByPage({
          pageToken,
          pageSize: 200,
        });
        allRecordIds.push(...response.recordIds);
        pageToken = response.hasMore ? (response.pageToken as string | undefined) : undefined;
        pageCount++;
        console.log(`[bitableService] 分页 ${pageCount}: 获取 ${response.recordIds.length} 条，累计 ${allRecordIds.length} 条，hasMore: ${response.hasMore}`);
      } while (pageToken);

      console.log('[bitableService] 总记录数:', allRecordIds.length);
      return allRecordIds;
    } catch (error) {
      console.error('[bitableService] 获取所有记录 ID 失败:', error);
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
