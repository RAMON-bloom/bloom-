import { downloadFileBase64, getFileMetadata } from '../_lib/drive.js';
import { getAi } from '../_lib/gemini.js';

const SUPPORTED_MIME_PREFIXES = ['application/pdf', 'image/'];

// Uses Gemini's native document/image understanding to locate the JIS-style photo box
// (or any headshot) inside a resume file, returning a normalized (0-1) bounding box that
// the client can apply to whatever resolution it independently renders that page/image at.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, fileId } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!fileId) {
      return res.status(400).json({ error: '対象の履歴書ファイルが指定されていません。' });
    }

    const meta = await getFileMetadata(accessToken, fileId);
    const mimeType = meta.mimeType || '';
    if (!SUPPORTED_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) {
      return res.status(400).json({
        error: `このファイル形式（${mimeType || '不明'}）はAI自動切り抜きに対応していません。PDFまたは画像ファイルのみ対応しています。`
      });
    }

    const fileBase64 = await downloadFileBase64(accessToken, fileId);

    const ai = getAi();
    if (!ai) {
      return res.status(503).json({ error: 'Gemini APIキーが設定されていないため、自動検出は利用できません。' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          inlineData: { data: fileBase64, mimeType }
        },
        {
          text: `この履歴書・応募書類ファイル（複数ページの場合あり。履歴書と職務経歴書が1つのPDFにまとめられているケースも多い）の中から、貼付・埋め込まれている証明写真（顔写真）を探してください。
1ページ目とは限りません。全ページを確認し、見つかったページ番号（1始まり）も返してください。
見つかった場合、その写真領域のバウンディングボックスを、そのページ全体を1000x1000とした正規化座標で返してください。
見つからない場合は found を false にしてください。
JSON形式のみで出力してください:
{
  "found": true または false,
  "page": 写真が見つかったページ番号（1始まりの整数）,
  "yMin": 0-1000の整数,
  "xMin": 0-1000の整数,
  "yMax": 0-1000の整数,
  "xMax": 0-1000の整数
}`
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const parsed = JSON.parse(response.text || '{"found":false}');

    if (!parsed.found) {
      return res.json({ found: false, fileBase64, mimeType });
    }

    const box = {
      xMin: Math.max(0, Math.min(1000, parsed.xMin)) / 1000,
      yMin: Math.max(0, Math.min(1000, parsed.yMin)) / 1000,
      xMax: Math.max(0, Math.min(1000, parsed.xMax)) / 1000,
      yMax: Math.max(0, Math.min(1000, parsed.yMax)) / 1000
    };

    // Guards against a hallucinated/degenerate box — e.g. the whole page, or a sliver with near-
    // zero area — which would otherwise get cropped and saved as an obviously-wrong "photo" with
    // no indication anything went wrong. A real JIS-style ID photo box is a small fraction of the
    // page, never most of it.
    const width = box.xMax - box.xMin;
    const height = box.yMax - box.yMin;
    const area = width * height;
    if (!(width > 0) || !(height > 0) || area > 0.35 || area < 0.005) {
      return res.json({ found: false, fileBase64, mimeType });
    }

    return res.json({
      found: true,
      box,
      page: Number.isFinite(parsed.page) && parsed.page > 0 ? Math.round(parsed.page) : 1,
      fileBase64,
      mimeType
    });
  } catch (err: any) {
    console.error('Drive detect-photo-crop error:', err);
    return res.status(500).json({ error: '顔写真の自動検出中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}
