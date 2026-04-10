<template>
  <div class="export-panel">
    <div class="template-selector">
      <div class="header">
        <span class="step">步骤2:</span>
        <span class="title">选择模板</span>
      </div>
      <div class="template-list">
        <label
          v-for="template in templates"
          :key="template.id"
          class="template-item"
        >
          <input
            type="radio"
            :value="template.id"
            :checked="selectedTemplate === template.id"
            @change="emit('update:template', template.id)"
          />
          <span class="template-name">{{ template.name }}</span>
          <span class="template-desc">{{ template.description }}</span>
        </label>
      </div>
    </div>

    <!-- 模板错误提示 -->
    <div v-if="templateError" class="template-error">
      <p class="error-text">{{ templateError }}</p>
      <p class="error-hint">请检查多维表格是否包含所需字段，或联系管理员添加</p>
    </div>

    <div class="actions">
      <button
        class="btn btn-preview"
        :disabled="disabled"
        @click="emit('preview')"
      >
        预览PDF
      </button>
      <button
        class="btn btn-download"
        :disabled="disabled"
        @click="emit('download')"
      >
        下载PDF
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { IPDFTemplate } from '../types';

interface Props {
  templates: IPDFTemplate[];
  selectedTemplate: string;
  disabled: boolean;
  templateError?: string | null;
}

defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:template', templateId: string): void;
  (e: 'preview'): void;
  (e: 'download'): void;
}>();
</script>

<style scoped>
.export-panel {
  margin-bottom: 16px;
}

.template-selector {
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

.template-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.template-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  cursor: pointer;
}

.template-item:hover {
  background-color: #f5f5f5;
}

.template-item input {
  margin-right: 8px;
}

.template-name {
  font-weight: 500;
  margin-right: 8px;
}

.template-desc {
  color: #999999;
  font-size: 12px;
}

.template-error {
  background-color: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 16px;
}

.error-text {
  color: #f56c6c;
  margin: 0 0 8px 0;
  font-size: 14px;
}

.error-hint {
  color: #999;
  margin: 0;
  font-size: 12px;
}

.actions {
  display: flex;
  gap: 12px;
}

.btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.btn-preview {
  background-color: #3370ff;
  color: white;
}

.btn-preview:hover:not(:disabled) {
  background-color: #2860e1;
}

.btn-download {
  background-color: #67c23a;
  color: white;
}

.btn-download:hover:not(:disabled) {
  background-color: #5daf34;
}
</style>
