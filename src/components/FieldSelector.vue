<template>
  <div class="field-selector">
    <div class="header">
      <span class="step">步骤1:</span>
      <span class="title">选择字段</span>
      <div class="actions">
        <button class="btn-link" @click="selectAll">全选</button>
        <button class="btn-link" @click="deselectAll">取消全选</button>
      </div>
    </div>
    <div class="field-list">
      <label
        v-for="field in fields"
        :key="field.id"
        class="field-item"
      >
        <input
          type="checkbox"
          :checked="field.selected"
          @change="toggleField(field.id)"
        />
        <span class="field-name">{{ field.name }}</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FieldMeta } from '../types';

interface Props {
  fields: FieldMeta[];
}

interface Emits {
  (e: 'update:fields', fields: FieldMeta[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const toggleField = (fieldId: string) => {
  const updated = props.fields.map(f =>
    f.id === fieldId ? { ...f, selected: !f.selected } : f
  );
  emit('update:fields', updated);
};

const selectAll = () => {
  const updated = props.fields.map(f => ({ ...f, selected: true }));
  emit('update:fields', updated);
};

const deselectAll = () => {
  const updated = props.fields.map(f => ({ ...f, selected: false }));
  emit('update:fields', updated);
};
</script>

<style scoped>
.field-selector {
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
  flex: 1;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn-link {
  background: none;
  border: none;
  color: #3370ff;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.btn-link:hover {
  text-decoration: underline;
}

.field-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 8px;
}

.field-item {
  display: flex;
  align-items: center;
  padding: 4px 0;
  cursor: pointer;
}

.field-item:hover {
  background-color: #f5f5f5;
}

.field-name {
  margin-left: 8px;
}
</style>
