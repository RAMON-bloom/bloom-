import { ensureSubfolder, findFileByName, readFileContent, upsertTextFile } from '../_lib/drive.js';

// 内定者台帳: 内定者の氏名・年齢・現職・オファー金額・手数料を、アプリ本体のバックアップ
// (bloom_ats_backup.json)とは別に、Drive上へ「追記・更新のみ・削除しない」で蓄積する。
// アプリ側のデータが誤操作や同期不具合で消えても、ここには最後に記録された値が残る。
//   内定者台帳/offer_ledger.json … 正本（変更履歴つき）
//   内定者台帳/内定者台帳.csv     … 閲覧用（Googleスプレッドシート/Excelで開ける。JSONから毎回再生成）
const LEDGER_SUBFOLDER = '内定者台帳';
const LEDGER_JSON = 'offer_ledger.json';
const LEDGER_CSV = '内定者台帳.csv';

interface Row {
  candidateId: string;
  name: string;
  age?: number;
  currentCompany?: string;
  jobTitle?: string;
  agencyName?: string;
  phaseLabel: string;
  joiningDate?: string;
  baseMonthlySalary?: number;
  annualSalary?: number;
  bonusGuaranteeAmount?: number;
  signOnBonusAmount?: number;
  commissionRate?: number;
  commissionAmount?: number;
}

interface StoredRow extends Row {
  firstRecordedAt: string;
  updatedAt: string;
  history: { at: string; field: string; before: unknown; after: unknown }[];
}

interface Ledger {
  rows: Record<string, StoredRow>;
}

// 空・未入力の値では、台帳に既にある値を上書きしない（アプリ側で誤って消えても台帳には残す）。
const KEEP_IF_EMPTY: (keyof Row)[] = [
  'age', 'currentCompany', 'jobTitle', 'agencyName', 'joiningDate', 'baseMonthlySalary', 'annualSalary',
  'bonusGuaranteeAmount', 'signOnBonusAmount', 'commissionRate', 'commissionAmount'
];
const TRACKED: (keyof Row)[] = ['phaseLabel', 'joiningDate', 'baseMonthlySalary', 'annualSalary', 'bonusGuaranteeAmount', 'signOnBonusAmount', 'commissionRate', 'commissionAmount'];

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || v === 0;

function mergeLedger(ledger: Ledger, incoming: Row[], now: string): boolean {
  let changed = false;
  for (const row of incoming) {
    if (!row || !row.candidateId || !row.name) continue;
    const prev = ledger.rows[row.candidateId];
    if (!prev) {
      ledger.rows[row.candidateId] = { ...row, firstRecordedAt: now, updatedAt: now, history: [] };
      changed = true;
      continue;
    }
    const next: StoredRow = { ...prev, history: [...prev.history] };
    let rowChanged = false;
    (Object.keys(row) as (keyof Row)[]).forEach((key) => {
      let value: unknown = row[key];
      if (KEEP_IF_EMPTY.includes(key) && isEmpty(value)) value = (prev as any)[key];
      if (JSON.stringify(value) !== JSON.stringify((prev as any)[key])) {
        if (TRACKED.includes(key)) next.history.push({ at: now, field: key, before: (prev as any)[key], after: value });
        (next as any)[key] = value;
        rowChanged = true;
      }
    });
    if (rowChanged) {
      next.updatedAt = now;
      ledger.rows[row.candidateId] = next;
      changed = true;
    }
  }
  return changed;
}

const CSV_HEADERS = [
  '候補者ID', '氏名', '年齢', '現職', '応募職種', 'エージェント', '状況', '入社予定日',
  '基本月給(円)', 'オファー年収(月給×支給月数・円)', '賞与保証(円)', 'サインオンボーナス(円)',
  '紹介手数料率(%)', '紹介手数料(円)', '初回記録日', '最終更新日'
];

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function ledgerToCsv(ledger: Ledger): string {
  const rows = Object.values(ledger.rows).sort((a, b) => a.firstRecordedAt.localeCompare(b.firstRecordedAt));
  const lines = rows.map((r) =>
    [
      r.candidateId, r.name, r.age, r.currentCompany, r.jobTitle, r.agencyName, r.phaseLabel, r.joiningDate,
      r.baseMonthlySalary, r.annualSalary, r.bonusGuaranteeAmount, r.signOnBonusAmount,
      r.commissionRate, r.commissionAmount, r.firstRecordedAt.slice(0, 10), r.updatedAt.slice(0, 10)
    ].map(csvCell).join(',')
  );
  // 先頭のBOMはExcelで文字化けしないため。
  return '﻿' + [CSV_HEADERS.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken, folderId, rows } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuthアクセストークンが必要です。Googleでログインしてください。' });
    }
    if (!folderId) {
      return res.status(400).json({ error: 'Drive連携フォルダIDが設定されていません。' });
    }
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: '台帳に記録する行がありません。' });
    }

    const ledgerFolderId = await ensureSubfolder(accessToken, folderId, LEDGER_SUBFOLDER);

    // 読む→マージ→版チェック付きで書く。他の人が同時に書いていたら(409)読み直して最大4回やり直す。
    let lastErr: any;
    for (let attempt = 0; attempt < 4; attempt++) {
      const existing = await findFileByName(accessToken, ledgerFolderId, LEDGER_JSON);
      let ledger: Ledger = { rows: {} };
      if (existing) {
        const text = await readFileContent(accessToken, existing);
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed.rows === 'object') ledger = parsed;
        } catch {
          // 壊れた台帳を空で上書きして履歴を失わないよう、読めない場合は書き込まず中断する。
          return res.status(500).json({ error: '内定者台帳(offer_ledger.json)が読み取れないため、上書きせず中断しました。Drive上のファイルを確認してください。' });
        }
      }
      const changed = mergeLedger(ledger, rows, new Date().toISOString());
      if (!changed && existing) {
        const csv = await findFileByName(accessToken, ledgerFolderId, LEDGER_CSV);
        return res.json({ success: true, changed: false, count: Object.keys(ledger.rows).length, csvUrl: csv?.webViewLink });
      }
      try {
        await upsertTextFile(accessToken, ledgerFolderId, LEDGER_JSON, 'application/json', JSON.stringify(ledger, null, 2), {
          expectedVersion: existing?.version
        });
      } catch (err: any) {
        if (err.status === 409) {
          lastErr = err;
          continue;
        }
        throw err;
      }
      const csvFile = await upsertTextFile(accessToken, ledgerFolderId, LEDGER_CSV, 'text/csv', ledgerToCsv(ledger));
      return res.json({ success: true, changed: true, count: Object.keys(ledger.rows).length, csvUrl: csvFile.webViewLink });
    }
    throw lastErr;
  } catch (err: any) {
    console.error('Offer ledger error:', err);
    if (err.status === 401) {
      return res.status(401).json({ error: 'Googleアクセストークンの有効期限が切れています。再度ログインしてください。' });
    }
    return res.status(500).json({ error: '内定者台帳の保存中にエラーが発生しました: ' + (err.message || '不明なエラー') });
  }
}
