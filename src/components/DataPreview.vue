<template>
  <div class="data-preview">
    <div class="header">
      <span class="step">步骤3:</span>
      <span class="title">数据预览</span>
    </div>
    <div class="preview-content">
      <div v-if="selectedFields.length === 0" class="empty">
        请先选择字段
      </div>
      <div v-else-if="!record" class="empty">
        加载中...
      </div>
      <div v-else>
        <!-- Invoice Number 显示（仅 Invoice 模板） -->
        <div v-if="selectedTemplate === 'invoice' && invoiceNumber" class="invoice-number-section">
          <div class="section-title">Invoice Number</div>
          <div class="preview-item">
            <span class="label">PI号:</span>
            <span class="value invoice-number">{{ invoiceNumber }}</span>
          </div>
        </div>

        <!-- 固定信息 -->
        <div v-if="fixedFields && Object.keys(fixedFields).length > 0" class="fixed-section">
          <div class="section-title">固定信息</div>
          <div
            v-for="(value, key) in fixedFields"
            :key="key"
            class="preview-item"
          >
            <span class="label">{{ getFieldLabel(key) }}:</span>
            <span class="value fixed">{{ value }}</span>
          </div>
        </div>

        <!-- 金额区域（只读） -->
        <div v-if="amountFieldList.length > 0" class="amount-section">
          <div class="section-title">金额信息</div>
          <div
            v-for="field in amountFieldList"
            :key="field.id"
            class="preview-item"
          >
            <span class="label">{{ field.name }}:</span>
            <span class="value amount">{{ getFieldValue(field.id) }}</span>
          </div>
        </div>

        <!-- 可编辑字段 -->
        <div v-if="editableFieldList.length > 0" class="editable-section">
          <div class="section-title">可编辑字段</div>
          <div
            v-for="field in editableFieldList"
            :key="field.id"
            class="preview-item"
          >
            <span class="label">{{ field.name }}:</span>
            <textarea
              v-if="field.name === 'Bill to' || field.name === 'Ship to'"
              v-model="localEditedValues[field.id]"
              class="editable-textarea"
              rows="3"
              @input="emitUpdate"
            ></textarea>
            <input
              v-else
              v-model="localEditedValues[field.id]"
              class="editable-input"
              @input="emitUpdate"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { FieldMeta, RecordData } from '../types';
import { getTemplateById } from '../templates';

interface Props {
  record: RecordData | null;
  selectedFields: FieldMeta[];
  selectedTemplate: string;
  editedValues: Record<string, string>;
  invoiceNumber?: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:edited-values', values: Record<string, string>): void;
}>();

const localEditedValues = ref<Record<string, string>>({});

const getFieldValue = (fieldId: string): string => {
  if (!props.record) return '-';
  if (localEditedValues.value[fieldId] !== undefined) {
    return localEditedValues.value[fieldId];
  }
  const field = props.record.fields.find(f => f.fieldId === fieldId);
  return field?.value || '-';
};

const getFieldLabel = (key: string): string => {
  const labels: Record<string, string> = {
    companyName: '公司名称',
    companyAddress: '公司地址',
    invoiceNumber: 'Invoice Number',
  };
  return labels[key] || key;
};

const fixedFields = computed(() => {
  const template = getTemplateById(props.selectedTemplate);
  return template?.fields?.fixed;
});

// 金额字段列表
const amountFieldList = computed(() => {
  const template = getTemplateById(props.selectedTemplate);
  const amountFieldNames = template?.fields?.amountFields || [];
  // 标准化比较（忽略大小写和空格）
  const normalizedAmountFields = amountFieldNames.map(name =>
    name.toLowerCase().replace(/\s+/g, '')
  );
  return props.selectedFields.filter(f => {
    const normalizedFieldName = f.name.toLowerCase().replace(/\s+/g, '');
    return normalizedAmountFields.includes(normalizedFieldName);
  });
});

// 可编辑字段列表
const editableFieldList = computed(() => {
  const template = getTemplateById(props.selectedTemplate);
  const editableFieldNames = template?.fields?.editable || [];
  const amountFieldNames = template?.fields?.amountFields || [];
  // 标准化比较
  const normalizedEditable = editableFieldNames.map(name =>
    name.toLowerCase().replace(/\s+/g, '')
  );
  const normalizedAmount = amountFieldNames.map(name =>
    name.toLowerCase().replace(/\s+/g, '')
  );
  return props.selectedFields.filter(f => {
    const normalizedFieldName = f.name.toLowerCase().replace(/\s+/g, '');
    return normalizedEditable.includes(normalizedFieldName) &&
           !normalizedAmount.includes(normalizedFieldName);
  });
});

const emitUpdate = () => {
  emit('update:edited-values', { ...localEditedValues.value });
};

watch(() => props.editedValues, (newValues) => {
  localEditedValues.value = { ...newValues };
}, { immediate: true, deep: true });

watch(() => props.record, (newRecord) => {
  if (newRecord) {
    newRecord.fields.forEach(f => {
      if (localEditedValues.value[f.fieldId] === undefined) {
        localEditedValues.value[f.fieldId] = f.value;
      }
    });
  }
}, { immediate: true });

onMounted(() => {
  localEditedValues.value = { ...props.editedValues };
});
</script>

<style scoped>
.data-preview {
  margin-bottom: 16px;
}

.header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.step {
  font-weight: bold;
  color: #3370ff;
  margin-right: 8px;
}

.title {
  font-weight: 500;
}

.preview-content {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 12px;
  min-height: 100px;
  background-color: #fafafa;
}

.empty {
  color: #999999;
  text-align: center;
  padding: 20px;
}

.section-title {
  font-size: 12px;
  color: #3370ff;
  font-weight: 500;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e8e8e8;
}

.fixed-section,
.amount-section,
.editable-section {
  margin-bottom: 12px;
}

.fixed-section:last-child,
.amount-section:last-child,
.editable-section:last-child {
  margin-bottom: 0;
}

.preview-item {
  display: flex;
  align-items: center;
  padding: 4px 0;
}

.label {
  font-weight: 500;
  color: #666666;
  min-width: 120px;
  flex-shrink: 0;
}

.value {
  color: #333333;
}

.value.fixed {
  color: #666666;
}

.value.amount {
  color: #3370ff;
  font-weight: bold;
}

.value.invoice-number {
  color: #ff6b00;
  font-weight: bold;
  font-size: 14px;
}

.invoice-number-section {
  margin-bottom: 12px;
  padding: 8px;
  background-color: #fff8f0;
  border-radius: 4px;
  border: 1px solid #ffd9b3;
}

.editable-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  background: white;
}

.editable-input:focus {
  border-color: #3370ff;
  outline: none;
}

.editable-textarea {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  background: white;
  resize: vertical;
  font-family: inherit;
}

.editable-textarea:focus {
  border-color: #3370ff;
  outline: none;
}
</style>
