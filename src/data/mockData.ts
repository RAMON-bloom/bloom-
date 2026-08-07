import { Candidate, Agency, InternalStaff, MeetingLog } from '../types';

export const INITIAL_AGENCIES: Agency[] = [
  {
    id: 'ag-1',
    name: 'A社 (ワークスエージェント)',
    contactPerson: '田中 健太',
    email: 'tanaka@works-agent.example.com',
    contacts: [
      { id: 'ac-101', name: '田中 健太', role: 'メイン窓口 (RA)', email: 'tanaka@works-agent.example.com', phone: '03-1234-5678', isPrimary: true },
      { id: 'ac-102', name: '山本 航平', role: 'キャリアアドバイザー (CA)', email: 'yamamoto@works-agent.example.com', phone: '03-1234-5679', isPrimary: false },
      { id: 'ac-103', name: '加藤 由美', role: '契約・請求担当', email: 'kato@works-agent.example.com', phone: '03-1234-5680', isPrimary: false }
    ],
    commissionRate: 35,
    monthlyTarget: 5,
    active: true,
    notes: 'IT・エンジニア領域のスペシャリスト多数',
    assignedStaffNames: ['山田 太郎', '高橋 涼子']
  },
  {
    id: 'ag-2',
    name: 'B社 (キャリアコネクト)',
    contactPerson: '佐藤 美咲',
    email: 'sato@career-connect.example.com',
    contacts: [
      { id: 'ac-201', name: '佐藤 美咲', role: '統括マネージャー (メイン窓口)', email: 'sato@career-connect.example.com', phone: '03-9876-5432', isPrimary: true },
      { id: 'ac-202', name: '中村 亮', role: 'マーケター専任RA', email: 'nakamura@career-connect.example.com', phone: '03-9876-5433', isPrimary: false }
    ],
    commissionRate: 30,
    monthlyTarget: 4,
    active: true,
    notes: '営業・マーケティング職種に強い代理店',
    assignedStaffNames: ['小林 恵美', '伊藤 雅人']
  },
  {
    id: 'ag-3',
    name: 'C社 (ヒューマンネクスト)',
    contactPerson: '鈴木 拓也',
    email: 'suzuki@human-next.example.com',
    contacts: [
      { id: 'ac-301', name: '鈴木 拓也', role: '窓口アドバイザー', email: 'suzuki@human-next.example.com', phone: '03-5555-0100', isPrimary: true },
      { id: 'ac-302', name: '斎藤 舞', role: 'アシスタント', email: 'saito@human-next.example.com', phone: '03-5555-0101', isPrimary: false }
    ],
    commissionRate: 32,
    monthlyTarget: 3,
    active: true,
    notes: '若手・ミドル層ハイクラス人材',
    assignedStaffNames: ['山田 太郎', '渡辺 一樹']
  },
  {
    id: 'ag-direct',
    name: '直接応募 (自社採用HP)',
    contactPerson: '採用チーム',
    email: 'careers@example.com',
    contacts: [
      { id: 'ac-dir-1', name: '採用チーム窓口', role: '自社採用窓口', email: 'careers@example.com', isPrimary: true }
    ],
    commissionRate: 0,
    monthlyTarget: 10,
    active: true,
    notes: 'コストゼロ・自社HPおよびWantedly経由',
    assignedStaffNames: ['山田 太郎', '小林 恵美']
  },
  {
    id: 'ag-referral',
    name: 'リファラル採用',
    contactPerson: '社員紹介窓口',
    email: 'referral@example.com',
    contacts: [
      { id: 'ac-ref-1', name: '社員紹介事務局', role: '社内リファラル担当', email: 'referral@example.com', isPrimary: true }
    ],
    commissionRate: 10,
    monthlyTarget: 2,
    active: true,
    notes: '社内インセンティブ制度適用',
    assignedStaffNames: ['山田 太郎']
  }
];

export const INITIAL_STAFF: InternalStaff[] = [
  { id: 'st-1', name: '山田 太郎', department: '人事部', role: '主担当 (人事)' },
  { id: 'st-2', name: '高橋 涼子', department: '開発部', role: 'エンジニアリングマネージャー' },
  { id: 'st-3', name: '渡辺 一樹', department: 'プロダクト部', role: 'VPoP' },
  { id: 'st-4', name: '伊藤 雅人', department: '営業部', role: '営業本部長' },
  { id: 'st-5', name: '小林 恵美', department: '人事部', role: '採用アシスタント' },
];

export const INITIAL_CANDIDATES: Candidate[] = [
  {
    id: 'CAND-0001',
    name: '佐々木 亮平',
    nameKana: 'ササキ リョウヘイ',
    age: 29,
    education: '慶應義塾大学 理工学部卒',
    currentCompany: '株式会社ワークスSaaS',
    companyCount: 2,
    email: 'sasaki.r@example.com',
    phone: '090-1234-5678',
    jobTitle: 'EC',
    appliedDate: '2026-07-15',
    appliedMonth: '2026-07',
    agencyId: 'ag-1',
    agencyName: 'A社 (ワークスエージェント)',
    assignees: ['山田 太郎', '高橋 涼子'],
    phase: 'FINAL_INTERVIEW',
    scheduleStatus: 'SCHEDULE_CONFIRMED',
    nextScheduleDate: '2026-08-03T15:00',
    nextInterviewers: ['佐々木 啓太', '山田 太郎'],
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80',
    resumeSummary: 'Webアプリケーション開発経験7年。React / TypeScript / Next.js を用いた大規模SaaSプロダクト開発・テックリード経験あり。パフォーマンス改善およびマイクロフロントエンド化の設計に強み。',
    resumeFileName: '佐々木亮平_職務経歴書.pdf',
    resumeSkills: ['React', 'TypeScript', 'Next.js', 'GraphQL', 'Tailwind CSS', 'Vite'],
    interviewRating: 'A+',
    salaryExpectation: '750万円 〜 850万円',
    joiningDate: '2026-10-01',
    preJoinDinnerStatus: 'UNPLANNED',
    resignationNegotiationStatus: 'NOT_STARTED',
    notes: '現職の退職希望時期は9月末予定。オファー面談を心待ちにしている。',
    lastUpdated: '2026-07-28',
    evaluationNotes: [
      {
        id: 'eval-0',
        createdAt: '2026-07-12 11:00',
        author: '山田 太郎',
        authorRole: '人事主担当',
        phase: 'CASUAL_INTERVIEW',
        rating: 5,
        interviewRating: 'A+',
        comment: 'カジュアル面談実施。現職でのSaaS開発における課題感や転職意向を相互確認。カルチャーマッチも高く選考応募を推奨。',
        resultStatus: 'PASS'
      },
      {
        id: 'eval-1',
        createdAt: '2026-07-18 14:30',
        author: '山田 太郎',
        authorRole: '人事主担当',
        phase: 'DOCUMENT_SCREENING',
        rating: 5,
        interviewRating: 'A+',
        comment: '経歴・スキルともに即戦力レベル。カルチャーマッチも期待できるため1次面接へ案内。',
        resultStatus: 'PASS'
      },
      {
        id: 'eval-2',
        createdAt: '2026-07-22 17:00',
        author: '高橋 涼子',
        authorRole: '開発EM',
        phase: 'FIRST_INTERVIEW',
        rating: 5,
        interviewRating: 'A+',
        comment: '技術的深さがあり、コンポーネント設計やState管理の意図が明確。チーム主導の経験も高く評価。最終面接へ推薦。',
        resultStatus: 'PASS'
      }
    ]
  },
  {
    id: 'CAND-0002',
    name: '中村 彩香',
    nameKana: 'ナカムラ アヤカ',
    age: 31,
    education: '早稲田大学 政治経済学部卒',
    currentCompany: 'クラウドプロダクト株式会社',
    companyCount: 3,
    email: 'nakamura.a@example.com',
    phone: '080-9876-5432',
    jobTitle: 'BP',
    appliedDate: '2026-07-08',
    appliedMonth: '2026-07',
    agencyId: 'ag-3',
    agencyName: 'C社 (ヒューマンネクスト)',
    assignees: ['山田 太郎', '渡辺 一樹'],
    phase: 'OFFER_ISSUED',
    scheduleStatus: 'WAITING_RESULT',
    nextScheduleDate: '2026-08-05T11:00',
    nextInterviewers: ['渡辺 一樹'],
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80',
    resumeSummary: 'B2B SaaS企業のPdMとして4年従事。ユーザーヒアリングに基づくロードマップ策定、アジャイル開発推進、KPI改善をリード。',
    resumeFileName: '中村彩香_履歴書・職務経歴書.pdf',
    resumeSkills: ['Product Management', 'SQL', 'Figma', 'Agile/Scrum', 'Data Analysis'],
    interviewRating: 'A+',
    salaryExpectation: '800万円',
    joiningDate: '2026-10-01',
    preJoinDinnerStatus: 'SCHEDULED',
    preJoinDinnerDate: '2026-08-20',
    resignationNegotiationStatus: 'IN_PROGRESS',
    onboardingNotes: '8/5回答期限。他社意向比較中。8/20に配属予定チームとのランチ会食をセッティング済み。',
    notes: '内定提示済み（想定年俸800万）。8月5日までに回答受領予定。他社選考状況をヒアリング中。',
    lastUpdated: '2026-07-30',
    evaluationNotes: [
      {
        id: 'eval-3',
        createdAt: '2026-07-10',
        author: '山田 太郎',
        authorRole: '人事主担当',
        phase: 'DOCUMENT_SCREENING',
        rating: 4,
        interviewRating: 'A-',
        comment: '数値に基づいた改善実績があり好印象。1次面接実施決定。',
        resultStatus: 'PASS'
      },
      {
        id: 'eval-4',
        createdAt: '2026-07-16',
        author: '渡辺 一樹',
        authorRole: 'VPoP',
        phase: 'FIRST_INTERVIEW',
        rating: 5,
        interviewRating: 'A+',
        comment: '定性と定量のバランスが非常によい。役員最終面接へ進むべきと判断。',
        resultStatus: 'PASS'
      },
      {
        id: 'eval-5',
        createdAt: '2026-07-25',
        author: '山田 太郎',
        authorRole: '最終面接官',
        phase: 'FINAL_INTERVIEW',
        rating: 5,
        interviewRating: 'A+',
        comment: '事業ビジョンへの共感が高く、提示年収800万で内定通知を送付。',
        resultStatus: 'PASS'
      }
    ]
  },
  {
    id: 'CAND-0003',
    name: '松本 拓海',
    nameKana: 'マツモト タクミ',
    age: 26,
    education: '明治大学 経営学部卒',
    currentCompany: 'キャリアエージェント株式会社',
    companyCount: 1,
    email: 'matsumoto.t@example.com',
    phone: '090-5555-4444',
    jobTitle: 'BP',
    appliedDate: '2026-07-20',
    appliedMonth: '2026-07',
    agencyId: 'ag-2',
    agencyName: 'B社 (キャリアコネクト)',
    assignees: ['小林 恵美', '伊藤 雅人'],
    phase: 'FIRST_INTERVIEW',
    scheduleStatus: 'SCHEDULE_CONFIRMED',
    nextScheduleDate: '2026-08-01T14:00',
    nextInterviewers: ['伊藤 雅人'],
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80',
    resumeSummary: '人材業界での新規開拓営業3年。月間目標達成率平均120%。コール数・トスアップ率の徹底的な顧客分析が得意。',
    resumeFileName: '松本拓海_職務経歴書.docx',
    resumeSkills: ['Salesforce', 'Inside Sales', 'B2B Sales', 'HubSpot'],
    interviewRating: 'B+',
    salaryExpectation: '480万円',
    notes: 'コミュニケーション能力が高く、スピード感のある営業スタイル。',
    lastUpdated: '2026-07-29',
    evaluationNotes: [
      {
        id: 'eval-6',
        createdAt: '2026-07-22',
        author: '小林 恵美',
        authorRole: '人事アシスタント',
        phase: 'DOCUMENT_SCREENING',
        rating: 4,
        interviewRating: 'B+',
        comment: '書類通過。8/1(金) 14:00〜 伊藤本部長との1次面接を確定。',
        resultStatus: 'PASS'
      }
    ]
  },
  {
    id: 'CAND-0004',
    name: '加藤 健一',
    nameKana: 'カトウ ケンイチ',
    age: 28,
    education: '東京工業大学 情報理工学院卒',
    currentCompany: 'ネクストテック株式会社',
    companyCount: 2,
    email: 'kato.k@example.com',
    phone: '070-1111-2222',
    jobTitle: 'BRE',
    appliedDate: '2026-07-12',
    appliedMonth: '2026-07',
    agencyId: 'ag-direct',
    agencyName: '直接応募 (自社採用HP)',
    assignees: ['山田 太郎', '高橋 涼子'],
    phase: 'SECOND_INTERVIEW',
    scheduleStatus: 'PROPOSING_DATES',
    nextScheduleDate: undefined,
    nextInterviewers: ['高橋 涼子', '佐々木 啓太'],
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&q=80',
    resumeSummary: 'Web業界で5年のバックエンド開発。Go/Node.js/PostgreSQLによるマイクロサービスアーキテクチャ構築経験。Docker/Kubernetesのインフラ知見もあり。',
    resumeFileName: '加藤健一_職歴詳細.pdf',
    resumeSkills: ['Go', 'Node.js', 'PostgreSQL', 'Docker', 'Kubernetes', 'AWS'],
    salaryExpectation: '680万円',
    notes: '現在2次面接の候補日を3案提示中（調整中）。本人の第一志望群。',
    lastUpdated: '2026-07-29',
    evaluationNotes: [
      {
        id: 'eval-7',
        createdAt: '2026-07-14',
        author: '山田 太郎',
        authorRole: '人事主担当',
        phase: 'DOCUMENT_SCREENING',
        rating: 4,
        comment: '自社応募者の中で群を抜いてスキルが高い。即1次へ案内。',
        resultStatus: 'PASS'
      },
      {
        id: 'eval-8',
        createdAt: '2026-07-21',
        author: '高橋 涼子',
        authorRole: '開発EM',
        phase: 'FIRST_INTERVIEW',
        rating: 4,
        comment: '設計思考が非常にしっかりしている。2次面接（VPoE面接）へ推薦。',
        resultStatus: 'PASS'
      }
    ]
  },
  {
    id: 'CAND-0005',
    name: '木村 慎吾',
    nameKana: 'キムラ シンゴ',
    age: 27,
    education: '多摩美術大学 デザイン学部卒',
    currentCompany: '株式会社デザインラボ',
    companyCount: 1,
    email: 'kimura.s@example.com',
    phone: '090-3333-7777',
    jobTitle: 'AIX',
    appliedDate: '2026-07-25',
    appliedMonth: '2026-07',
    agencyId: 'ag-referral',
    agencyName: 'リファラル採用',
    assignees: ['山田 太郎'],
    phase: 'DOCUMENT_SCREENING',
    scheduleStatus: 'UNARRANGED',
    nextScheduleDate: undefined,
    avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=256&q=80',
    resumeSummary: 'デザインプロダクションにてスマホアプリ・WebUIのUXリサーチおよびUIデザインを4年経験。Figmaを中心としたデザインシステム構築が得意。',
    resumeFileName: '木村慎吾_ポートフォリオ・職務経歴書.pdf',
    resumeSkills: ['Figma', 'UI Design', 'UX Research', 'Design Systems', 'HTML/CSS'],
    salaryExpectation: '600万円',
    notes: '開発部の佐藤さんからのリファラル推薦者。',
    lastUpdated: '2026-07-26',
    evaluationNotes: []
  },
  {
    id: 'CAND-0006',
    name: '吉田 裕介',
    nameKana: 'ヨシダ ユウスケ',
    age: 32,
    education: '同志社大学 商学部卒',
    currentCompany: '日本ITソリューションズ株式会社',
    companyCount: 2,
    email: 'yoshida.y@example.com',
    phone: '080-4444-8888',
    jobTitle: 'EC',
    appliedDate: '2026-06-18',
    appliedMonth: '2026-06',
    agencyId: 'ag-2',
    agencyName: 'B社 (キャリアコネクト)',
    assignees: ['小林 恵美', '伊藤 雅人'],
    phase: 'OFFER_ACCEPTED',
    scheduleStatus: 'SCHEDULE_CONFIRMED',
    nextScheduleDate: '2026-09-01T09:00', // 入社日予定
    avatarUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&q=80',
    resumeSummary: '大手ITディーラーでのエンタープライズ営業5年。大手顧客への提案から契約締結までを担当。年平均1.5億円の売上実績。',
    resumeFileName: '吉田裕介_履歴書.pdf',
    resumeSkills: ['Enterprise Sales', 'Negotiation', 'CRM', 'Account Management'],
    salaryExpectation: '720万円',
    joiningDate: '2026-09-01',
    preJoinDinnerStatus: 'COMPLETED',
    preJoinDinnerDate: '2026-07-28',
    resignationNegotiationStatus: 'COMPLETED',
    onboardingNotes: '退職承認受領・引継ぎ完了予定。7/28に配属チームとの入社前会食完了（好印象）。備品/PC手配完了。',
    notes: '【内定承諾完了】入社日は2026年9月1日（月）に決定。PC手配およびオンボーディング準備を開始。',
    lastUpdated: '2026-07-15',
    evaluationNotes: [
      {
        id: 'eval-9',
        createdAt: '2026-06-20',
        author: '小林 恵美',
        authorRole: '人事アシスタント',
        phase: 'DOCUMENT_SCREENING',
        rating: 5,
        comment: '実績豊富で即合格。',
        resultStatus: 'PASS'
      },
      {
        id: 'eval-10',
        createdAt: '2026-06-27',
        author: '伊藤 雅人',
        authorRole: '営業本部長',
        phase: 'FIRST_INTERVIEW',
        rating: 5,
        comment: '営業の軸がブレず優秀。役員面接へ。',
        resultStatus: 'PASS'
      },
      {
        id: 'eval-11',
        createdAt: '2026-07-05',
        author: '山田 太郎',
        authorRole: '役員',
        phase: 'FINAL_INTERVIEW',
        rating: 5,
        comment: '満場一致で内定通知。7/15承諾書を受領。',
        resultStatus: 'PASS'
      }
    ]
  },
  {
    id: 'CAND-0007',
    name: '林 麻美',
    nameKana: 'ハヤシ アサミ',
    age: 28,
    education: '東京大学大学院 情報理工学研究科修士',
    currentCompany: 'AIアナリティクス合同会社',
    companyCount: 2,
    email: 'hayashi.a@example.com',
    phone: '090-8888-1111',
    jobTitle: 'AIX',
    appliedDate: '2026-06-05',
    appliedMonth: '2026-06',
    agencyId: 'ag-1',
    agencyName: 'A社 (ワークスエージェント)',
    assignees: ['山田 太郎'],
    phase: 'REJECTED_DECLINED',
    scheduleStatus: 'UNARRANGED',
    nextScheduleDate: undefined,
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=256&q=80',
    resumeSummary: 'Python/PyTorchを用いた機械学習モデル構築、LLMチューニング経験2年。修士（情報科学）。',
    resumeFileName: '林麻美_職務経歴書.pdf',
    resumeSkills: ['Python', 'PyTorch', 'LLM', 'SQL', 'Scikit-learn'],
    rejectionReason: '他社（外資系IT企業）からの提示額が高く辞退（他社承諾）',
    salaryExpectation: '900万円',
    notes: '非常に魅力的な候補者だったが提示金額で競合負け。次回募集時にアプローチ候補。',
    lastUpdated: '2026-06-25',
    evaluationNotes: [
      {
        id: 'eval-12',
        createdAt: '2026-06-08',
        author: '山田 太郎',
        authorRole: '人事主担当',
        phase: 'DOCUMENT_SCREENING',
        rating: 5,
        comment: 'スキル文句なし。1次へ。',
        resultStatus: 'PASS'
      },
      {
        id: 'eval-13',
        createdAt: '2026-06-15',
        author: '高橋 涼子',
        authorRole: '開発EM',
        phase: 'FIRST_INTERVIEW',
        rating: 5,
        comment: '最終面接へ進めるべき。',
        resultStatus: 'PASS'
      },
      {
        id: 'eval-14',
        createdAt: '2026-06-25',
        author: '山田 太郎',
        authorRole: '人事主担当',
        phase: 'OFFER_ISSUED',
        rating: 4,
        comment: '内定提示後に辞退連絡を受領。',
        resultStatus: 'FAIL',
        failReason: '他社承諾（条件面合致せず）'
      }
    ]
  },
  {
    id: 'CAND-0008',
    name: '斉藤 大介',
    nameKana: 'サイトウ ダイスケ',
    age: 25,
    education: '法政大学 現代福祉学部卒',
    currentCompany: 'HRパートナーズ株式会社',
    companyCount: 1,
    email: 'saito.d@example.com',
    phone: '080-2222-3333',
    jobTitle: 'BP',
    appliedDate: '2026-05-10',
    appliedMonth: '2026-05',
    agencyId: 'ag-3',
    agencyName: 'C社 (ヒューマンネクスト)',
    assignees: ['山田 太郎'],
    phase: 'REJECTED_DECLINED',
    scheduleStatus: 'UNARRANGED',
    rejectionReason: '書類選考不採用（必要実務要件に一部未達）',
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=256&q=80',
    resumeSummary: '一般事務および人事アシスタント業務2年。',
    resumeFileName: '斉藤大介_履歴書.pdf',
    resumeSkills: ['Office', '人事給与計算', '勤怠管理'],
    salaryExpectation: '420万円',
    notes: '今回のシニア人事求人にはミスマッチのためお見送り。',
    lastUpdated: '2026-05-12',
    evaluationNotes: [
      {
        id: 'eval-15',
        createdAt: '2026-05-12',
        author: '山田 太郎',
        authorRole: '人事主担当',
        phase: 'DOCUMENT_SCREENING',
        rating: 2,
        comment: '求める年数の主導経験が不十分なため不採用。エージェントへ連絡済み。',
        resultStatus: 'FAIL',
        failReason: 'スキル・経歴不一致'
      }
    ]
  },
  {
    id: 'CAND-0009',
    name: '清水 健太',
    nameKana: 'シミズ ケンタ',
    age: 30,
    education: '筑波大学 理工学群卒',
    currentCompany: 'クラウドベースシステムズ株式会社',
    companyCount: 3,
    email: 'shimizu.k@example.com',
    phone: '090-6666-9999',
    jobTitle: 'BRE',
    appliedDate: '2026-07-22',
    appliedMonth: '2026-07',
    agencyId: 'ag-1',
    agencyName: 'A社 (ワークスエージェント)',
    assignees: ['山田 太郎', '高橋 涼子'],
    phase: 'FIRST_INTERVIEW',
    scheduleStatus: 'PROPOSING_DATES',
    nextScheduleDate: undefined,
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=256&q=80',
    resumeSummary: 'AWS / GCP 環境のインフラ設計・TerraformによるIaC化・SREとして障害耐性向上の運用支援を6年。',
    resumeFileName: '清水健太_職務経歴書.pdf',
    resumeSkills: ['AWS', 'GCP', 'Terraform', 'CI/CD', 'Docker', 'Linux'],
    salaryExpectation: '720万円',
    notes: '書類通過後、1次面接の候補日連絡待ち。',
    lastUpdated: '2026-07-27',
    evaluationNotes: [
      {
        id: 'eval-16',
        createdAt: '2026-07-24',
        author: '山田 太郎',
        authorRole: '人事主担当',
        phase: 'DOCUMENT_SCREENING',
        rating: 4,
        comment: 'Terraformの実績が豊富でインフラ強化にマッチ。1次面接へ案内。',
        resultStatus: 'PASS'
      }
    ]
  },
  {
    id: 'CAND-0010',
    name: '池田 まゆみ',
    nameKana: 'イケダ マユミ',
    age: 29,
    education: '立教大学 異文化コミュニケーション学部卒',
    currentCompany: 'カスタマーサクセス・ジャパン株式会社',
    companyCount: 2,
    email: 'ikeda.m@example.com',
    phone: '080-7777-1111',
    jobTitle: 'EC',
    appliedDate: '2026-05-15',
    appliedMonth: '2026-05',
    agencyId: 'ag-2',
    agencyName: 'B社 (キャリアコネクト)',
    assignees: ['小林 恵美'],
    phase: 'OFFER_ACCEPTED',
    scheduleStatus: 'SCHEDULE_CONFIRMED',
    nextScheduleDate: '2026-07-01T09:00',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&q=80',
    resumeSummary: 'SaaS企業のカスタマーサクセスとして解約率（Churn Rate）削減・アップセル提案を担当。',
    resumeFileName: '池田まゆみ_職歴書.pdf',
    resumeSkills: ['Customer Success', 'Gainsight', 'Churn Reduction', 'CRM'],
    salaryExpectation: '550万円',
    joiningDate: '2026-07-01',
    preJoinDinnerStatus: 'COMPLETED',
    preJoinDinnerDate: '2026-06-20',
    resignationNegotiationStatus: 'COMPLETED',
    onboardingNotes: '7/1に入社完了。事前会食6/20に実施済み。退職交渉も円満完了。',
    notes: '【入社済み】7月1日付でCS部へ入社完了。',
    lastUpdated: '2026-07-01',
    evaluationNotes: [
      {
        id: 'eval-17',
        createdAt: '2026-05-18',
        author: '小林 恵美',
        authorRole: '人事アシスタント',
        phase: 'DOCUMENT_SCREENING',
        rating: 4,
        comment: '合格',
        resultStatus: 'PASS'
      },
      {
        id: 'eval-18',
        createdAt: '2026-06-01',
        author: '山田 太郎',
        authorRole: '人事部長',
        phase: 'FINAL_INTERVIEW',
        rating: 5,
        comment: '内定提示。',
        resultStatus: 'PASS'
      }
    ]
  },
  {
    id: 'CAND-0011',
    name: '西村 翔太',
    nameKana: 'ニシムラ ショウタ',
    age: 33,
    education: '中央大学 法学部卒',
    currentCompany: 'オリオンアドバタイジング株式会社',
    companyCount: 3,
    email: 'nishimura.s@example.com',
    phone: '090-4444-1234',
    jobTitle: 'BP',
    appliedDate: '2026-06-10',
    appliedMonth: '2026-06',
    agencyId: 'ag-direct',
    agencyName: '直接応募 (自社採用HP)',
    assignees: ['山田 太郎'],
    phase: 'REJECTED_DECLINED',
    scheduleStatus: 'UNARRANGED',
    rejectionReason: '1次面接結果不採用（弊社が求めるデジタルマーケ領域との相違）',
    avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=256&q=80',
    resumeSummary: 'オフライン広告およびイベントマーケティング経験8年。',
    resumeFileName: '西村翔太_職務経歴書.pdf',
    resumeSkills: ['Marketing', 'Event Planning', 'PR', 'Branding'],
    salaryExpectation: '650万円',
    notes: 'Web/デジタルマーケ施策の主導経験が少なく、不採用と決定。',
    lastUpdated: '2026-06-20',
    evaluationNotes: [
      {
        id: 'eval-19',
        createdAt: '2026-06-18',
        author: '山田 太郎',
        authorRole: '人事主担当',
        phase: 'FIRST_INTERVIEW',
        rating: 2,
        comment: '人物面は好印象だが、即戦力として求めるWeb運用スキルが不足。',
        resultStatus: 'FAIL',
        failReason: 'スキル不一致'
      }
    ]
  },
  {
    id: 'CAND-0012',
    name: '安藤 エリ',
    nameKana: 'アンドウ エリ',
    age: 27,
    education: '津田塾大学 学芸学部卒',
    currentCompany: 'クオリティラボ株式会社',
    companyCount: 2,
    email: 'ando.e@example.com',
    phone: '080-3333-9999',
    jobTitle: 'AIX',
    appliedDate: '2026-07-28',
    appliedMonth: '2026-07',
    agencyId: 'ag-1',
    agencyName: 'A社 (ワークスエージェント)',
    assignees: ['小林 恵美', '高橋 涼子'],
    phase: 'DOCUMENT_SCREENING',
    scheduleStatus: 'UNARRANGED',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
    resumeSummary: '自動化テスト（Playwright / Cypress）導入およびテスト仕様書作成業務3年。',
    resumeFileName: '安藤エリ_経歴書.pdf',
    resumeSkills: ['Playwright', 'Cypress', 'QA Automation', 'Jira'],
    salaryExpectation: '520万円',
    notes: '新規応募。高橋EMと書類選考を実施中。',
    lastUpdated: '2026-07-28',
    evaluationNotes: []
  }
];

export const INITIAL_MEETING_LOGS: MeetingLog[] = [
  {
    id: 'mtg-20260801',
    title: '2026年8月1日',
    date: '2026-08-01T10:00',
    meetUrl: '',
    attendees: ['山田 太郎', '高橋 涼子', '渡辺 一樹', '伊藤 雅人', '小林 恵美'],
    overallSummary: `【採用全般メモ】
・BPポジションの応募条件（必要年数）を一部緩和し、A社・B社へリライト版JDを配布。
・1次面接後の結果連絡速度を「24時間以内」に徹底し、辞退率削減を図る。
・次回8/8の全社定例にて、各部門の年内採用枠に対する着地見込みを最終すり合わせ。`,
    overallActionNotes: `・BP職種の要件定義緩和通知をA社・B社へメール送信 (担当: 山田 太郎)
・佐々木亮平氏の2次面接リンク発行および確定通知 (担当: 小林 恵美)
・BRE評価ルーブリックのドキュメント化 (担当: 高橋 涼子)
・中村彩香氏との事前会食（プレ入社会食）の日程候補3案打診 (担当: 渡辺 一樹)`,
    fetchedOverallLog: `【取得ログ / AI議事録要約】
**主要協議事項ログ (2026-08-01 MTG)**
・BP/AIX選考結果の回答スピードを最長24時間以内へ短縮することに同意。
・A社（ワークスエージェント）経由の書類通過率が45%と絶好調。秋採用ターゲット資料を追加配布。`,
    rawTranscript: `山田: それでは8月第1週の週次採用MTGを開始します。本日のアジェンダおよび各共有事項の確認を進めます。
高橋: エンジニア（AIX/BRE）領域ですが、佐々木亮平さんの1次面接評価が非常によく、2次面接調整に入っています。
渡辺: Prod(BP)の中村彩香さんはカジュアル面談結果待ちですが、B2B SaaSでのPdM経験がかなりマッチしているため、通過想定で進めています。
伊藤: 営業(EC)の松本拓海さん、1次面接合格です。次回役員面接の実施枠を早急に確保します。
小林: A社・B社からの今週の推薦は計8件あり、書類通過率は37.5%と好調を維持しています。`,
    recruiterReports: [
      {
        recruiterName: '山田 太郎',
        progressNotes: '担当候補者5名の選考を進行中。佐々木亮平氏（AIX）の1次合格に伴い、高橋EMと次期面接枠の調整を完了。',
        progressLog: '【取得ログ】佐々木亮平氏の2次面接枠を確保。A社との月次定例で秋採用要件を共有予定。',
        recommendationNotes: 'A社（ワークスエージェント）からのシニアエンジニア推薦が増加。質・打率ともに良好。',
        yieldNotes: '書類通過率45%、1次通過率80%と非常に高い歩留まりを維持。',
        upcomingInitiatives: [
          'A社担当者（田中氏）と月次定例を実施し、秋採用ターゲットのすり合わせ',
          'オファー提示用のアトラクト面談資料（開発環境・年収モデル）の更新'
        ],
        initiativesLog: [
          '【取得ログToDo】BP要件緩和通知の展開確認',
          '【取得ログToDo】A社向け求人アトラクト資料の最新化'
        ],
        actionItemsCompleted: [true, false]
      },
      {
        recruiterName: '高橋 涼子',
        progressNotes: 'AIX/BRE技術面接を担当。加藤健一氏（BP/インフラ）の1次面接調整中。コード課題評価を24時間以内に完了させる体制を構築。',
        progressLog: '【取得ログ】BRE技術面接の評価ルーブリック改訂を進行中。',
        recommendationNotes: 'C社からのインフラ領域の推薦が手薄なため、ターゲット基準のすり合わせシートを送付。',
        yieldNotes: '技術課題通過率66%。エンジニアメンバーの面接負担を軽減するため、事前技術スクリーニングシートを活用中。',
        upcomingInitiatives: [
          'BRE（バックエンド）のライブコーディング評価ルーブリックの改訂',
          '開発部メンバー向け面接官トレーニング（オンライン）の実施'
        ],
        initiativesLog: [
          '【取得ログToDo】BRE評価ルーブリックのドキュメント化'
        ],
        actionItemsCompleted: [false, false]
      },
      {
        recruiterName: '渡辺 一樹',
        progressNotes: 'BP（プロダクトマネージャー）選考を推進。中村彩香氏（BP）の2次面接枠を確定。選考スピードを最優先。',
        progressLog: '【取得ログ】中村彩香氏のオファー面談手配。プレ入社会食の日程調整中。',
        recommendationNotes: 'B社（キャリアコネクト）よりアジャイルPM経験者の推薦が3件到着。書類選考中。',
        yieldNotes: 'BP職種のオファー承諾率が課題。内定後の面談（事前会食・チーム顔合わせ）を標準化予定。',
        upcomingInitiatives: [
          'BP候補者向けプロダクトロードマップ説明スライド作成',
          '入社前会食（オファードリンク）の候補日すり合わせ'
        ],
        initiativesLog: [
          '【取得ログToDo】プレ入社会食の候補日程調整'
        ],
        actionItemsCompleted: [true, true]
      },
      {
        recruiterName: '伊藤 雅人',
        progressNotes: 'EC（営業本部長候補・新規開拓）選考をリード。松本拓海氏（EC）の1次面接結果を即日フィードバック完了。',
        progressLog: '【取得ログ】松本拓海氏（EC営業）の役員面接枠確保。',
        recommendationNotes: '自社HP直接応募経由での営業経験者の応募が急増中。',
        yieldNotes: '営業職の一次通過率60%。ターゲット業界経験者の書類通過基準を再確認。',
        upcomingInitiatives: [
          '営業職向けの想定年収・インセンティブ制度の明文化',
          '自社採用HPの営業インタビュー記事のSNS拡散'
        ],
        initiativesLog: [
          '【取得ログToDo】役員面接枠のスケジューリング確認'
        ],
        actionItemsCompleted: [false, true]
      },
      {
        recruiterName: '小林 恵美',
        progressNotes: '木村慎吾氏（BCA/UIデザイナー）のカジュアル面談を設定。日程調整メールの返信速度を向上中。',
        progressLog: '【取得ログ】面接調整リードタイムを18時間へ短縮。',
        recommendationNotes: '全エージェントへの推薦打診リマインドを毎週月曜日に自動化。',
        yieldNotes: '面接候補日確定までの平均タイムを48時間から18時間へ大幅短縮。',
        upcomingInitiatives: [
          'エージェント向け月間推薦数インセンティブの案内作成',
          '全選考フェーズのGoogle Calendar自動連携バグの修正チェック'
        ],
        initiativesLog: [
          '【取得ログToDo】エージェント返信リマインドの運用徹底'
        ],
        actionItemsCompleted: [true, false]
      }
    ],
    actionItems: [
      { id: 'act-1', text: 'BP職種の要件定義緩和通知をA社・B社へメール送信', assignee: '山田 太郎', done: true },
      { id: 'act-2', text: '佐々木亮平氏の2次面接リンク発行および確定通知', assignee: '小林 恵美', done: true },
      { id: 'act-3', text: 'BRE評価ルーブリックのドキュメント化', assignee: '高橋 涼子', done: false },
      { id: 'act-4', text: '中村彩香氏との事前会食（プレ入社会食）の日程候補3案打診', assignee: '渡辺 一樹', done: false }
    ]
  },
  {
    id: 'mtg-20260725',
    title: '2026年7月25日',
    date: '2026-07-25T10:00',
    meetUrl: '',
    attendees: ['山田 太郎', '高橋 涼子', '渡辺 一樹', '小林 恵美'],
    overallSummary: `【採用全般メモ】
・7月度目標採用枠3名に対し、現在内定1名、最終面接2名と好調。
・エージェントC社へのフィードバック遅延を解消するため、毎週金曜夕方にリマインド自動送付を試行。`,
    recruiterReports: [],
    actionItems: [
      { id: 'act-10', text: 'C社担当者へフィードバック送付', assignee: '山田 太郎', done: true }
    ]
  }
];

