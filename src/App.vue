<template>
  <div class="app">
    <div class="app-header">
      <h1>PDF导出工具</h1>
    </div>

    <div v-if="loading" class="loading">
      加载中...
    </div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button class="btn-retry" @click="init">重试</button>
    </div>

    <div v-else-if="!selection" class="error">
      <p>请先在表格中选中一行记录</p>
    </div>

    <template v-else>
      <FieldSelector
        :fields="fields"
        @update:fields="onFieldsUpdate"
      />

      <ExportPanel
        :templates="templates"
        :selected-template="selectedTemplate"
        :disabled="selectedFields.length === 0 || !!templateError"
        :template-error="templateError"
        @update:template="onTemplateUpdate"
        @preview="onPreview"
        @download="onDownload"
      />

      <DataPreview
        :record="record"
        :selected-fields="selectedFields"
        :selected-template="selectedTemplate"
        :edited-values="editedValues"
        :invoice-number="cachedInvoiceNumber"
        @update:edited-values="onEditedValuesUpdate"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import FieldSelector from './components/FieldSelector.vue';
import DataPreview from './components/DataPreview.vue';
import ExportPanel from './components/ExportPanel.vue';
import { bitableService } from './services/bitableService';
import { pdfService } from './services/pdfService';
import { templates, getTemplateById } from './templates';
import { matchTemplateFields } from './utils/fieldMatcher';
import type { FieldMeta, RecordData, Selection } from './types';

const loading = ref(true);
const error = ref<string | null>(null);
const selection = ref<Selection | null>(null);
const fields = ref<FieldMeta[]>([]);
const record = ref<RecordData | null>(null);
const selectedTemplate = ref('default');
const templateError = ref<string | null>(null);
const editedValues = ref<Record<string, string>>({});
// 缓存生成的 PI号
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

// 查找 "✅PI号" 字段
const findPiNumberField = (): FieldMeta | undefined => {
  console.log('[App] findPiNumberField - 所有字段:', fields.value.map(f => ({ name: f.name, id: f.id, selected: f.selected })));

  // 优先精确匹配包含 PI号 的字段
  let piField = fields.value.find(f => f.name.includes('PI号'));
  if (piField) {
    console.log('[App] 找到 PI号 字段 (精确匹配):', piField.name, 'id:', piField.id);
    return piField;
  }

  // 其次匹配包含 ✅PI 的字段
  piField = fields.value.find(f => f.name.includes('✅PI'));
  if (piField) {
    console.log('[App] 找到 PI号 字段 (✅PI匹配):', piField.name, 'id:', piField.id);
    return piField;
  }

  // 最后模糊匹配
  piField = fields.value.find(f => {
    const name = f.name.toLowerCase();
    return name.includes('pi') && !name.includes('price') && !name.includes('print');
  });
  if (piField) {
    console.log('[App] 找到 PI号 字段 (模糊匹配):', piField.name, 'id:', piField.id);
  } else {
    console.warn('[App] 未找到 PI号 字段');
  }
  return piField;
};

// 从 AG-XXX 格式中提取数字
const extractInvoiceNumber = (value: string): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  // 更宽松的匹配：允许前后有空格，AG大小写不敏感
  const match = trimmed.match(/AG-(\d+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    console.log(`[App] extractInvoiceNumber: "${trimmed}" -> ${num}`);
    return num;
  }
  return null;
};

// 生成下一个 Invoice number
const generateNextInvoiceNumber = async (tableId: string): Promise<string> => {
  const piField = findPiNumberField();
  if (!piField) {
    console.warn('[App] 未找到 PI号 字段，使用默认编号 AG-001');
    return 'AG-001';
  }

  console.log('[App] 找到 PI号 字段:', piField.name, 'id:', piField.id);

  // 获取所有记录中该字段的值
  const allValues = await bitableService.getAllFieldValues(tableId, piField.id);
  console.log('[App] getAllFieldValues 返回:', allValues);
  console.log('[App] 返回值数量:', allValues.length);

  // 找出最大的 AG-XXX 编号
  let maxNumber = 0;
  for (let i = 0; i < allValues.length; i++) {
    const value = allValues[i];
    const num = extractInvoiceNumber(value);
    console.log(`[App] [${i}] 值: "${value}" -> 提取数字: ${num}`);
    if (num !== null && num > maxNumber) {
      maxNumber = num;
      console.log(`[App] 更新最大值为: ${maxNumber}`);
    }
  }

  // 生成下一个编号（当前最大值 + 1）
  const nextNumber = maxNumber + 1;
  const result = `AG-${String(nextNumber).padStart(3, '0')}`;
  console.log(`[App] 最终结果: maxNumber=${maxNumber} + 1 = ${nextNumber} -> "${result}"`);
  return result;
};

// 检查当前记录的 PI号 字段是否有值（需要单独查询）
const getOrGenerateInvoiceNumber = async (): Promise<string> => {
  if (!selection.value || !record.value) return 'AG-001';

  const piField = findPiNumberField();
  if (!piField) {
    console.warn('[App] 未找到 PI号 字段');
    const newNum = await generateNextInvoiceNumber(selection.value.tableId);
    cachedInvoiceNumber.value = newNum;
    return newNum;
  }

  // 单独查询当前记录的 PI号 值（因为可能不在 selectedFields 中）
  const currentValue = await bitableService.getCellValue(
    selection.value.tableId,
    piField.id,
    selection.value.recordId!
  );
  console.log('[App] 当前记录 PI号 值:', currentValue);

  if (currentValue && currentValue.trim()) {
    // 已有值，直接使用（不查询所有记录）
    console.log('[App] 当前记录已有 PI号，直接使用:', currentValue.trim());
    cachedInvoiceNumber.value = currentValue.trim();
    return currentValue.trim();
  }

  // 没有值，才需要查询所有记录并生成新编号
  console.log('[App] 当前记录无 PI号，需要查询表格生成新编号...');
  const newNumber = await generateNextInvoiceNumber(selection.value.tableId);
  console.log('[App] 生成新的 PI号:', newNumber);
  cachedInvoiceNumber.value = newNumber;
  return newNumber;
};

// 回填 Invoice Number 到多维表格（仅在 PI号为空时）
const writeBackInvoiceNumber = async (invoiceNumber: string): Promise<void> => {
  if (!selection.value) return;

  const piField = findPiNumberField();
  if (!piField) {
    console.warn('[App] 未找到 PI号 字段，无法回填');
    return;
  }

  // 单独查询当前记录的 PI号 值
  const currentValue = await bitableService.getCellValue(
    selection.value.tableId,
    piField.id,
    selection.value.recordId!
  );

  if (currentValue && currentValue.trim()) {
    // 已有值，不需要回填
    console.log('[App] PI号 已有值，跳过回填:', currentValue);
    return;
  }

  // 回填新值
  console.log('[App] 开始回填 PI号:', invoiceNumber);
  const success = await bitableService.setCellValue(
    selection.value.tableId,
    piField.id,
    selection.value.recordId!,
    invoiceNumber
  );

  if (success) {
    console.log('[App] PI号 回填成功:', invoiceNumber);
    editedValues.value[piField.id] = invoiceNumber;
  } else {
    console.error('[App] PI号 回填失败');
  }
};

const onPreview = async () => {
  const template = getTemplateById(selectedTemplate.value);
  if (!template || !record.value) return;

  try {
    // Invoice 模板需要动态 invoiceNumber
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
    // Invoice 模板需要动态 invoiceNumber
    let invoiceNumber: string | undefined;
    if (template.id === 'invoice') {
      // 使用缓存的 PI号，如果没有则重新生成
      if (cachedInvoiceNumber.value) {
        invoiceNumber = cachedInvoiceNumber.value;
        console.log('[App] 使用缓存的 PI号:', invoiceNumber);
      } else {
        invoiceNumber = await getOrGenerateInvoiceNumber();
      }
    }

    const filename = invoiceNumber
      ? `Invoice_${invoiceNumber}.pdf`
      : `export_${Date.now()}.pdf`;

    await pdfService.download(template, record.value, filename, editedValues.value, invoiceNumber);
    console.log('[App] PDF 下载完成');

    // 回填 Invoice Number（仅 Invoice 模板，且仅在 PI号为空时）
    if (template.id === 'invoice' && invoiceNumber) {
      await writeBackInvoiceNumber(invoiceNumber);
    }
  } catch (e) {
    console.error('[App] 下载失败:', e);
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
    // 不再预计算 PI号，避免阻塞 UI
    // PI号会在用户点击预览/下载时按需计算
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

watch(selectedTemplate, () => {
  cachedInvoiceNumber.value = null;  // 切换模板时重置
  applyTemplateFieldSelection();
});

watch(selectedFields, () => {
  cachedInvoiceNumber.value = null;  // 字段变化时重置
  loadRecordData();
}, { deep: true });

const init = async () => {
  loading.value = true;
  error.value = null;

  unsubscribe = bitableService.onSelectionChange((newSelection) => {
    if (newSelection && newSelection.recordId) {
      selection.value = newSelection;
      bitableService.getFieldList(newSelection.tableId).then(newFields => {
        fields.value = newFields.map(f => ({ ...f, selected: false }));
        applyTemplateFieldSelection();
      });
    }
  });

  try {
    const sel = await bitableService.getSelection();

    if (!sel || !sel.recordId) {
      selection.value = null;
      loading.value = false;
      return;
    }

    selection.value = sel;
    const fieldList = await bitableService.getFieldList(sel.tableId);
    fields.value = fieldList.map(f => ({ ...f, selected: false }));
    applyTemplateFieldSelection();

  } catch (e) {
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
</script>

<style scoped>
.app {
  max-width: 400px;
  margin: 0 auto;
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
</style>
