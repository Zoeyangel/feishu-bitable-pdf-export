<template>
  <!-- 应用模式：配置状态（首次添加或编辑配置） -->
  <div v-if="isDashboard && isConfigMode" class="config-panel">
    <div class="config-header">
      <h1>PDF导出工具</h1>
      <p class="config-desc">配置 PDF 导出功能，用户选中记录后可导出为 PDF 文件</p>
    </div>
    <div class="config-content">
      <div class="config-item">
        <label>插件名称</label>
        <input v-model="configData.pluginName" type="text" placeholder="PDF导出工具" />
      </div>
      <div class="config-item">
        <label>默认模板</label>
        <select v-model="configData.defaultTemplate">
          <option value="default">默认模板</option>
          <option value="invoice">Invoice 模板</option>
        </select>
      </div>
    </div>
    <div class="config-footer">
      <button class="btn-cancel" @click="onCancel">取消</button>
      <button class="btn-confirm" @click="onConfirm">确认</button>
    </div>
  </div>

  <!-- 应用模式：查看状态 -->
  <template v-else-if="isDashboard && !isConfigMode">
    <!-- 紧凑触发按钮 -->
    <div v-if="!isExpanded" class="compact-trigger" @click="isExpanded = true">
      <span class="trigger-icon">📄</span>
      <span class="trigger-text">{{ configData.pluginName || 'PDF导出' }}</span>
      <span v-if="selection" class="trigger-badge">已选择</span>
    </div>

    <!-- 展开后的浮层面板 -->
    <template v-if="isExpanded">
      <div class="panel-overlay" @click="isExpanded = false"></div>
      <div class="floating-panel">
        <div class="panel-header">
          <h1>{{ configData.pluginName || 'PDF导出工具' }}</h1>
          <button class="btn-close" @click="isExpanded = false">✕</button>
        </div>
        <div class="panel-content">
          <!-- 应用模式：流水号搜索 -->
          <div class="search-section">
            <label>输入流水号查找记录</label>
            <div class="search-input-group">
              <input
                v-model="searchSerialNumber"
                type="text"
                placeholder="请输入流水号"
                @keyup.enter="searchBySerialNumber"
              />
              <button class="btn-search" @click="searchBySerialNumber">查找</button>
            </div>
            <p v-if="searchError" class="search-error">{{ searchError }}</p>
          </div>
          <MainContent />
        </div>
      </div>
    </template>
  </template>

  <!-- 底表模式：原有 UI -->
  <div v-else-if="!isDashboard" class="app sidebar">
    <div class="app-header">
      <h1>PDF导出工具</h1>
    </div>
    <MainContent />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, defineComponent, h } from 'vue';
import { bitable, DashboardState } from '@lark-base-open/js-sdk';
import FieldSelector from './components/FieldSelector.vue';
import DataPreview from './components/DataPreview.vue';
import ExportPanel from './components/ExportPanel.vue';
import { bitableService } from './services/bitableService';
import { pdfService } from './services/pdfService';
import { templates, getTemplateById } from './templates';
import { matchTemplateFields } from './utils/fieldMatcher';
import type { FieldMeta, RecordData, Selection } from './types';

// 环境检测
const isDashboard = ref(false);
const isConfigMode = ref(false);
const isExpanded = ref(false);

// 插件配置
const configData = ref({
  pluginName: 'PDF导出工具',
  defaultTemplate: 'default',
});

// 应用模式：流水号搜索
const searchSerialNumber = ref('');
const searchError = ref<string | null>(null);

const loading = ref(true);
const error = ref<string | null>(null);
const selection = ref<Selection | null>(null);
const fields = ref<FieldMeta[]>([]);
const record = ref<RecordData | null>(null);
const selectedTemplate = ref('default');
const templateError = ref<string | null>(null);
const editedValues = ref<Record<string, string>>({});
const cachedInvoiceNumber = ref<string | null>(null);

let unsubscribe: (() => void) | null = null;

const selectedFields = computed(() =>
  fields.value.filter(f => f.selected)
);

const onFieldsUpdate = (updated: FieldMeta[]) => {
  fields.value = updated;
};

const onEditedValuesUpdate = (updated: Record<string, string>) => {
  editedValues.value = updated;
};

const onTemplateUpdate = (templateId: string) => {
  selectedTemplate.value = templateId;
};

// 应用模式：通过流水号搜索记录
const searchBySerialNumber = async () => {
  searchError.value = null;
  const serialNum = searchSerialNumber.value.trim();
  if (!serialNum) {
    searchError.value = '请输入流水号';
    return;
  }

  console.log('[App] 搜索流水号:', serialNum);

  try {
    // 从 customConfig 获取 tableId
    const config = await bitable.dashboard.getConfig();
    const savedTableId = (config.customConfig as any)?.tableId as string | undefined;

    let tableId: string;
    if (savedTableId) {
      tableId = savedTableId;
    } else {
      const tableMetaList = await bitable.base.getTableMetaList();
      if (!tableMetaList || tableMetaList.length === 0) {
        searchError.value = '插件未正确配置，请重新添加';
        return;
      }
      tableId = tableMetaList[0].id;
    }
    console.log('[App] 使用 tableId:', tableId);

    const table = await bitable.base.getTableById(tableId);
    const fieldMetaList = await table.getFieldMetaList();

    // 查找流水号字段
    const serialField = fieldMetaList.find(f =>
      f.name === '流水号' || f.name.includes('流水号')
    );
    if (!serialField) {
      searchError.value = '未找到"流水号"字段';
      return;
    }
    console.log('[App] 找到流水号字段:', serialField.name, serialField.id);

    // 用 getRecordsByPage + stringValue:true 分页拉取，每页直接返回字符串值
    // 不需要再逐条调 getCellString，彻底避免 N 次请求
    const startTime = performance.now();
    let pageToken: string | undefined;
    let foundRecordId: string | null = null;
    let pageCount = 0;

    do {
      const resp = await table.getRecordsByPage({
        pageSize: 200,
        pageToken,
        stringValue: true,
      });
      pageCount++;
      console.log(`[App] 第 ${pageCount} 页，本页 ${resp.records.length} 条，hasMore: ${resp.hasMore}`);

      for (const record of resp.records) {
        const cellVal = record.fields[serialField.id];
        // stringValue:true 时字段值是字符串或字符串数组
        const cellStr = Array.isArray(cellVal)
          ? (cellVal as any[]).map(v => String(v ?? '')).join('')
          : String(cellVal ?? '');

        if (cellStr.trim().includes(serialNum)) {
          console.log('[App] 找到匹配记录:', record.recordId, '值:', cellStr.trim());
          foundRecordId = record.recordId;
          break;
        }
      }

      if (foundRecordId) break; // 找到即停止翻页

      pageToken = resp.pageToken as string | undefined;
    } while (pageToken);

    console.log('[App] 搜索完成，耗时:', (performance.now() - startTime).toFixed(0), 'ms，翻页:', pageCount);

    if (!foundRecordId) {
      searchError.value = `未找到流水号包含 "${serialNum}" 的记录`;
      return;
    }

    // 找到后设置选中状态并加载数据
    selection.value = { tableId, viewId: '', recordId: foundRecordId };
    fields.value = fieldMetaList.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type as any,
      selected: false,
    }));
    applyTemplateFieldSelection();
    await loadRecordData();

  } catch (e) {
    console.error('[App] 搜索失败:', e);
    searchError.value = '搜索失败: ' + (e as Error).message;
  }
};

// 查找 "✅PI号" 字段
const findPiNumberField = (): FieldMeta | undefined => {
  let piField = fields.value.find(f => f.name.includes('PI号'));
  if (piField) return piField;

  piField = fields.value.find(f => f.name.includes('✅PI'));
  if (piField) return piField;

  piField = fields.value.find(f => {
    const name = f.name.toLowerCase();
    return name.includes('pi') && !name.includes('price') && !name.includes('print');
  });
  return piField;
};

const extractInvoiceNumber = (value: string): number | null => {
  if (!value) return null;
  const match = value.trim().match(/AG-(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
};

const generateNextInvoiceNumber = async (tableId: string): Promise<string> => {
  const piField = findPiNumberField();
  if (!piField) return 'AG-001';

  const allValues = await bitableService.getAllFieldValues(tableId, piField.id);
  let maxNumber = 0;
  for (const value of allValues) {
    const num = extractInvoiceNumber(value);
    if (num !== null && num > maxNumber) maxNumber = num;
  }
  return `AG-${String(maxNumber + 1).padStart(3, '0')}`;
};

const getOrGenerateInvoiceNumber = async (): Promise<string> => {
  if (!selection.value || !record.value) return 'AG-001';

  const piField = findPiNumberField();
  if (!piField) {
    const newNum = await generateNextInvoiceNumber(selection.value.tableId);
    cachedInvoiceNumber.value = newNum;
    return newNum;
  }

  const currentValue = await bitableService.getCellValue(
    selection.value.tableId,
    piField.id,
    selection.value.recordId!
  );

  if (currentValue && currentValue.trim()) {
    cachedInvoiceNumber.value = currentValue.trim();
    return currentValue.trim();
  }

  const newNumber = await generateNextInvoiceNumber(selection.value.tableId);
  cachedInvoiceNumber.value = newNumber;
  return newNumber;
};

const writeBackInvoiceNumber = async (invoiceNumber: string): Promise<void> => {
  if (!selection.value) return;
  const piField = findPiNumberField();
  if (!piField) return;

  const currentValue = await bitableService.getCellValue(
    selection.value.tableId,
    piField.id,
    selection.value.recordId!
  );

  if (currentValue && currentValue.trim()) return;

  await bitableService.setCellValue(
    selection.value.tableId,
    piField.id,
    selection.value.recordId!,
    invoiceNumber
  );
};

const onPreview = async () => {
  const template = getTemplateById(selectedTemplate.value);
  if (!template || !record.value) return;

  try {
    let invoiceNumber: string | undefined;
    if (template.id === 'invoice') {
      invoiceNumber = await getOrGenerateInvoiceNumber();
    }
    await pdfService.preview(template, record.value, editedValues.value, invoiceNumber);
  } catch (e) {
    error.value = 'PDF预览失败，请重试';
  }
};

const onDownload = async () => {
  const template = getTemplateById(selectedTemplate.value);
  if (!template || !record.value) return;

  try {
    let invoiceNumber: string | undefined;
    if (template.id === 'invoice') {
      invoiceNumber = cachedInvoiceNumber.value || await getOrGenerateInvoiceNumber();
    }

    const filename = invoiceNumber
      ? `Invoice_${invoiceNumber}.pdf`
      : `export_${Date.now()}.pdf`;

    await pdfService.download(template, record.value, filename, editedValues.value, invoiceNumber);

    if (template.id === 'invoice' && invoiceNumber) {
      await writeBackInvoiceNumber(invoiceNumber);
    }
  } catch (e) {
    error.value = 'PDF下载失败，请重试';
  }
};

const loadRecordData = async () => {
  if (!selection.value) return;

  const selectedFieldIds = selectedFields.value.map(f => f.id);
  if (selectedFieldIds.length === 0) {
    record.value = null;
    return;
  }

  record.value = await bitableService.getRecord(
    selection.value.tableId,
    selection.value.recordId!,
    selectedFieldIds
  );

  if (record.value) {
    record.value.fields.forEach(f => {
      editedValues.value[f.fieldId] = f.value;
    });
  }
};

const applyTemplateFieldSelection = () => {
  const template = getTemplateById(selectedTemplate.value);
  templateError.value = null;

  if (!template?.fields?.required) {
    fields.value = fields.value.map(f => ({ ...f, selected: true }));
    return;
  }

  const result = matchTemplateFields(
    template.fields.required,
    template.fields.optional || [],
    fields.value
  );

  if (result.missingFields.length > 0) {
    templateError.value = `缺少必选字段：${result.missingFields.join('、')}`;
    fields.value = fields.value.map(f => ({ ...f, selected: false }));
    return;
  }

  fields.value = fields.value.map(f => ({
    ...f,
    selected: result.matchedIds.includes(f.id),
  }));
};

// 应用模式：配置确认
// 关键：saveConfig 只负责保存，不调用 setRendered；
// setRendered 应在 View 模式渲染完成后调用（由 onConfigChange 触发）
const onConfirm = async () => {
  console.log('[App] onConfirm 开始执行...');
  try {
    // 获取第一个表格的 tableId 存入 customConfig，供搜索功能使用
    let tableId: string | undefined;
    try {
      const tableMetaList = await bitable.base.getTableMetaList();
      if (tableMetaList && tableMetaList.length > 0) {
        tableId = tableMetaList[0].id;
      }
    } catch (e) {
      console.warn('[App] 获取表格列表失败，tableId 不写入配置:', e);
    }

    // 保存配置 - 本插件不依赖 dataConditions 数据绑定，传空数组
    // customConfig 存放业务配置（含 tableId 供搜索用）
    const configToSave = {
      dataConditions: [],
      customConfig: {
        pluginName: configData.value.pluginName,
        defaultTemplate: configData.value.defaultTemplate,
        ...(tableId ? { tableId } : {}),
      }
    };
    console.log('[App] 保存配置:', JSON.stringify(configToSave, null, 2));

    const saveResult = await bitable.dashboard.saveConfig(configToSave as any);
    console.log('[App] saveConfig 结果:', saveResult);
    // 注意：saveConfig 成功后宿主会自动关闭配置面板，不需要再调用 setRendered
  } catch (e) {
    console.error('[App] 保存配置失败:', e);
    alert('保存配置失败: ' + (e as Error).message);
  }
};

// 应用模式：取消配置
const onCancel = () => {
  // 取消时什么都不做，宿主会自行处理关闭
  // 不要调用 setRendered，那是 View 模式专用
};


watch(selectedTemplate, () => {
  cachedInvoiceNumber.value = null;
  applyTemplateFieldSelection();
});

watch(selectedFields, () => {
  cachedInvoiceNumber.value = null;
  loadRecordData();
}, { deep: true });

const init = async () => {
  // 检测运行环境
  isDashboard.value = bitableService.isDashboardMode();
  console.log('[App] 运行模式:', isDashboard.value ? '应用模式' : '底表模式');

  if (isDashboard.value) {
    // 检查 dashboard 状态：直接用枚举比较，不依赖字符串
    const state = bitable.dashboard.state;
    console.log('[App] Dashboard 状态:', state);
    const isCreate = state === DashboardState.Create;
    const isConfigState = state === DashboardState.Config || isCreate;
    isConfigMode.value = isConfigState;
    console.log('[App] isConfigMode:', isConfigMode.value);

    // 监听配置变化（Config 和 View 模式下都需要监听）
    // 在 View 模式下：onConfigChange 触发时说明宿主已完成截图准备，此时可以更新渲染并调用 setRendered
    bitable.dashboard.onConfigChange(async (event) => {
      console.log('[App] 配置变化事件 (onConfigChange):', event.data);
      const cfg = event.data;
      if (cfg?.customConfig) {
        configData.value = {
          pluginName: (cfg.customConfig as any).pluginName || 'PDF导出工具',
          defaultTemplate: (cfg.customConfig as any).defaultTemplate || 'default',
        };
        selectedTemplate.value = configData.value.defaultTemplate;
      }
      // View 模式下收到配置变化（saveConfig 后宿主会推送）即可告知渲染完成
      if (!isConfigMode.value) {
        console.log('[App] View 模式收到配置变化，调用 setRendered');
        await bitable.dashboard.setRendered();
      }
    });

    // Create 模式下直接显示配置界面，不调用 getConfig，也不调用 setRendered
    if (isCreate) {
      console.log('[App] Create 模式，等待用户配置');
      return;
    }

    // Config 模式下：显示配置界面，可以读取已有配置预填表单
    if (isConfigState) {
      console.log('[App] Config 模式，读取已有配置预填表单');
      try {
        const config = await bitable.dashboard.getConfig();
        console.log('[App] 已有配置:', config);
        if (config?.customConfig) {
          configData.value = {
            pluginName: (config.customConfig as any).pluginName || 'PDF导出工具',
            defaultTemplate: (config.customConfig as any).defaultTemplate || 'default',
          };
        }
      } catch (e) {
        console.error('[App] Config 模式获取已有配置失败（可忽略）:', e);
      }
      return;
    }

    // View / FullScreen 模式：初始化获取已有配置，然后渲染，最后调用 setRendered
    try {
      const config = await bitable.dashboard.getConfig();
      console.log('[App] View 模式初始配置:', config);

      if (config?.customConfig) {
        configData.value = {
          pluginName: (config.customConfig as any).pluginName || 'PDF导出工具',
          defaultTemplate: (config.customConfig as any).defaultTemplate || 'default',
        };
        selectedTemplate.value = configData.value.defaultTemplate;
      }
    } catch (e) {
      console.error('[App] 获取初始配置失败:', e);
    }

    // View 模式下告知宿主渲染完成（可截图）
    console.log('[App] View 模式，调用 setRendered');
    await bitable.dashboard.setRendered();
  }

  loading.value = true;
  error.value = null;

  // 监听选中变化（底表模式有效）
  unsubscribe = bitableService.onSelectionChange((newSelection) => {
    console.log('[App] onSelectionChange 回调:', newSelection);
    if (newSelection && newSelection.recordId) {
      selection.value = newSelection;
      bitableService.getFieldList(newSelection.tableId).then(newFields => {
        fields.value = newFields.map(f => ({ ...f, selected: false }));
        applyTemplateFieldSelection();
      });
    }
  });

  // 尝试获取初始选中状态
  try {
    const sel = await bitableService.getSelection();
    console.log('[App] 初始选中状态:', sel);

    if (sel && sel.recordId) {
      selection.value = sel;
      const fieldList = await bitableService.getFieldList(sel.tableId);
      fields.value = fieldList.map(f => ({ ...f, selected: false }));
      applyTemplateFieldSelection();
    } else {
      selection.value = null;
    }
  } catch (e) {
    console.error('[App] 获取初始选中失败:', e);
    error.value = '初始化失败，请检查网络连接';
  } finally {
    loading.value = false;
  }
};

onMounted(init);

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});

// 主内容组件
const MainContent = defineComponent({
  name: 'MainContent',
  setup() {
    return () => h('div', { class: 'main-content' }, [
      loading.value ? h('div', { class: 'loading' }, '加载中...') :
      error.value ? h('div', { class: 'error' }, [
        h('p', error.value),
        h('button', { class: 'btn-retry', onClick: init }, '重试')
      ]) :
      !selection.value ? h('div', { class: 'error' }, [
        h('p', '请先在表格中选中一行记录')
      ]) :
      [
        h(FieldSelector, {
          fields: fields.value,
          'onUpdate:fields': onFieldsUpdate
        }),
        h(ExportPanel, {
          templates: templates,
          selectedTemplate: selectedTemplate.value,
          disabled: selectedFields.value.length === 0 || !!templateError.value,
          templateError: templateError.value,
          'onUpdate:template': onTemplateUpdate,
          onPreview: onPreview,
          onDownload: onDownload
        }),
        h(DataPreview, {
          record: record.value,
          selectedFields: selectedFields.value,
          selectedTemplate: selectedTemplate.value,
          editedValues: editedValues.value,
          invoiceNumber: cachedInvoiceNumber.value,
          'onUpdate:editedValues': onEditedValuesUpdate
        })
      ]
    ]);
  }
});
</script>

<style scoped>
/* 底表模式样式 */
.app.sidebar {
  max-width: 400px;
  margin: 0 auto;
}

.main-content {
  padding: 0;
}

.app-header {
  text-align: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.app-header h1 {
  font-size: 20px;
  font-weight: 600;
  color: #333333;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #999999;
}

.error {
  text-align: center;
  padding: 20px;
  color: #f56c6c;
}

.btn-retry {
  margin-top: 12px;
  padding: 8px 16px;
  background-color: #3370ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-retry:hover {
  background-color: #2860e1;
}

/* 配置面板 */
.config-panel {
  padding: 24px;
  max-width: 480px;
  margin: 0 auto;
}

.config-header {
  margin-bottom: 24px;
  text-align: center;
}

.config-header h1 {
  font-size: 20px;
  font-weight: 600;
  color: #333333;
  margin-bottom: 8px;
}

.config-desc {
  font-size: 14px;
  color: #666666;
}

.config-content {
  margin-bottom: 24px;
}

.config-item {
  margin-bottom: 16px;
}

.config-item label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  margin-bottom: 8px;
}

.config-item input,
.config-item select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
  color: #333333;
  background: white;
}

.config-item input:focus,
.config-item select:focus {
  outline: none;
  border-color: #3370ff;
}

.config-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
}

.btn-cancel {
  padding: 10px 20px;
  background: white;
  color: #666666;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-cancel:hover {
  background: #f5f5f5;
}

.btn-confirm {
  padding: 10px 20px;
  background: #3370ff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.btn-confirm:hover {
  background: #2860e1;
}

/* 应用模式：紧凑触发按钮 */
.compact-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #3370ff;
  color: white;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(51, 112, 255, 0.3);
  transition: all 0.2s ease;
}

.compact-trigger:hover {
  background: #2860e1;
  box-shadow: 0 4px 12px rgba(51, 112, 255, 0.4);
}

.trigger-icon {
  font-size: 16px;
}

.trigger-text {
  font-size: 14px;
}

.trigger-badge {
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

/* 应用模式：浮层面板 */
.panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 999;
}

.floating-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 420px;
  max-width: 90vw;
  max-height: 85vh;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
}

.panel-header h1 {
  font-size: 18px;
  font-weight: 600;
  color: #333333;
  margin: 0;
}

.btn-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 18px;
  color: #999999;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  background: #f0f0f0;
  color: #333333;
}

.panel-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

/* 搜索区域 */
.search-section {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.search-section label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #333333;
  margin-bottom: 8px;
}

.search-input-group {
  display: flex;
  gap: 8px;
}

.search-input-group input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
  color: #333333;
}

.search-input-group input:focus {
  outline: none;
  border-color: #3370ff;
}

.btn-search {
  padding: 10px 16px;
  background: #3370ff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.btn-search:hover {
  background: #2860e1;
}

.search-error {
  margin-top: 8px;
  font-size: 13px;
  color: #f56c6c;
}
</style>
