import { getAi } from '../_lib/gemini';
import { readFileContent } from '../_lib/drive';

interface MeetingSummary {
  overview: string;
  keyHighlights: string[];
  interviewFeedback: string;
  candidateQuestions: string;
  nextAction: string;
  summaryMarkdown: string;
}

function fallbackSummary(fileName: string, content: string): MeetingSummary {
  const overview = `Drive議事録「${fileName}」を取得しました（Gemini APIキー未設定のため簡易要約）。`;
  return {
    overview,
    keyHighlights: ['本文の先頭部分を下記に抜粋しています。詳細は元ファイルをご確認ください。'],
    interviewFeedback: content.slice(0, 300) || '本文が取得できませんでした。',
    candidateQuestions: '（Gemini APIキー未設定のため自動抽出できません）',
    nextAction: '（Gemini APIキー未設定のため自動抽出できません）',
    summaryMarkdown: `### 📄 Drive議事録取込 (${fileName})\n\n${content.slice(0, 1000) || '（本文なし）'}`
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, fileId, fileName, mimeType } = req.body || {};
    if (!accessToken || !fileId) {
      return res.status(400).json({ error: 'accessTokenとfileIdが必要です。' });
    }

    const content = await readFileContent(accessToken, {
      id: fileId,
      name: fileName || 'ドキュメント',
      mimeType: mimeType || 'text/plain'
    });

    const ai = getAi();
    let summary = fallbackSummary(fileName || 'ドキュメント', content);

    if (ai) {
      try {
        const prompt = `以下は採用チームのGoogle Drive上の議事録ファイル「${fileName}」の全文です。採用担当者が一目で把握できる形式のJSONで要約してください。

議事録本文:
${content.slice(0, 12000)}

返却JSONフォーマット:
{
  "overview": "全体概要 (100文字程度)",
  "keyHighlights": ["重要ポイント1", "重要ポイント2", "重要ポイント3"],
  "interviewFeedback": "選考・面接に関する評価やフィードバックの要約",
  "candidateQuestions": "候補者からの質問や希望・懸念点（なければ「特になし」）",
  "nextAction": "推奨される次アクション",
  "summaryMarkdown": "見やすいマークダウン形式の議事録サマリ全文 (日本語)"
}`;

        const geminiRes = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });

        if (geminiRes.text) {
          const parsed = JSON.parse(geminiRes.text);
          summary = {
            overview: parsed.overview || summary.overview,
            keyHighlights: Array.isArray(parsed.keyHighlights) ? parsed.keyHighlights : summary.keyHighlights,
            interviewFeedback: parsed.interviewFeedback || summary.interviewFeedback,
            candidateQuestions: parsed.candidateQuestions || summary.candidateQuestions,
            nextAction: parsed.nextAction || summary.nextAction,
            summaryMarkdown: parsed.summaryMarkdown || summary.summaryMarkdown
          };
        }
      } catch (geminiErr) {
        console.error('Gemini summary error:', geminiErr);
      }
    }

    return res.json({ success: true, rawContent: content, summary });
  } catch (err: any) {
    console.error('Drive summarize-log error:', err);
    return res.status(500).json({ error: 'Drive議事録の取得・要約中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}
