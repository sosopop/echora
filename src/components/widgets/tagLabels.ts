const ERROR_TAG_LABELS: Record<string, string> = {
  spelling: '拼写',
  word_order: '语序',
  tense: '时态',
  preposition: '介词',
  article: '冠词',
  subject_verb_agreement: '主谓一致',
  auxiliary_verb: '助动词',
  collocation: '固定搭配',
  politeness: '礼貌表达',
  literal_translation: '直译',
  missing_word: '缺少成分',
  extra_word: '多余词',
};

const ERROR_TAG_PATTERN = new RegExp(
  Object.keys(ERROR_TAG_LABELS)
    .sort((a, b) => b.length - a.length)
    .join('|'),
  'g'
);

export function labelForErrorTag(tag: string): string {
  return ERROR_TAG_LABELS[tag] ?? tag;
}

export function localizeErrorTagText(text: string): string {
  return text.replace(ERROR_TAG_PATTERN, (tag) => labelForErrorTag(tag));
}
