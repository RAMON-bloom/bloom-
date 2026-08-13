// Default subject/body for the 適性検査 (aptitude test) email, and the placeholder substitution
// used both by the settings screen's help text and by the actual send in CandidateDetailModal.

export const DEFAULT_APTITUDE_TEST_SUBJECT_TEMPLATE = '【bloom】適性検査のご案内';

export const DEFAULT_APTITUDE_TEST_BODY_TEMPLATE = `{{candidateName}} 様

お世話になっております。bloom採用担当です。
選考の一環として、以下2つの適性検査へのご回答をお願いいたします。

■適性検査①
{{formUrl1}}

■適性検査②
{{formUrl2}}

実施期限: {{deadline}}

ご不明点がございましたら本メールへご返信ください。
よろしくお願いいたします。`;

export interface AptitudeTestTemplateVars {
  candidateName: string;
  deadline: string;
  formUrl1: string;
  formUrl2: string;
}

export function renderAptitudeTestTemplate(template: string, vars: AptitudeTestTemplateVars): string {
  return template
    .replace(/\{\{candidateName\}\}/g, vars.candidateName)
    .replace(/\{\{deadline\}\}/g, vars.deadline)
    .replace(/\{\{formUrl1\}\}/g, vars.formUrl1)
    .replace(/\{\{formUrl2\}\}/g, vars.formUrl2);
}
