// 字段类型枚举（与飞书FieldType对应）
export enum FieldType {
  Text = 1,
  Number = 2,
  SingleSelect = 3,
  MultiSelect = 4,
  DateTime = 5,
  Checkbox = 7,
  User = 11,
  Phone = 13,
  Url = 15,
  Attachment = 17,
  SingleLink = 18,
  Lookup = 19,
  Formula = 20,
  DuplexLink = 21,
  Location = 22,
  GroupChat = 23,
  CreatedTime = 1001,
  ModifiedTime = 1002,
  CreatedUser = 1003,
  ModifiedUser = 1004,
  AutoNumber = 1005,
}

// 字段元数据
export interface FieldMeta {
  id: string;
  name: string;
  type: FieldType;
  selected: boolean;
}

// 字段值
export interface FieldValue {
  fieldId: string;
  fieldName: string;
  value: string;
}

// 记录数据
export interface RecordData {
  recordId: string;
  fields: FieldValue[];
}

// 模板字段配置
export interface TemplateFieldConfig {
  required: string[];
  optional?: string[];
  editable?: string[];
  fixed?: Record<string, string>;
  // 金额相关字段（只读）
  amountFields?: string[];
}

// PDF模板接口
export interface IPDFTemplate {
  id: string;
  name: string;
  description: string;
  fields?: TemplateFieldConfig;
  generate(data: RecordData, editedValues?: Record<string, string>): string;
  getLinks?(data: RecordData): PDFAirLink[];
}

// PDF中的链接
export interface PDFAirLink {
  url: string;
  text: string; // 链接显示文字
}

// 飞书选中信息
export interface Selection {
  tableId: string;
  viewId: string;
  recordId?: string;
}
