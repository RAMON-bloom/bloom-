import React, { useState } from 'react';
import {
  X,
  Crop,
  Sparkles,
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Check,
  UserCheck,
  Scan,
  RefreshCw,
  ImageOff
} from 'lucide-react';
import { detectResumePhotoCrop } from '../lib/driveApi';
import { renderAndCrop, bakeAdjustedCrop } from '../lib/photoCrop';

interface ResumePhotoCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateName: string;
  currentAvatarUrl?: string;
  resumeFileName?: string;
  resumeDriveFileId?: string;
  driveAccessToken?: string | null;
  onSavePhoto: (newAvatarUrl: string) => void;
}

export const ResumePhotoCropperModal: React.FC<ResumePhotoCropperModalProps> = ({
  isOpen,
  onClose,
  candidateName,
  currentAvatarUrl,
  resumeFileName,
  resumeDriveFileId,
  driveAccessToken,
  onSavePhoto,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(currentAvatarUrl || null);
  const [zoom, setZoom] = useState<number>(100);
  const [aspectRatio, setAspectRatio] = useState<'3:4' | '1:1' | 'circle'>('3:4');
  const [isAiScanning, setIsAiScanning] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string>('');
  const [scanFailed, setScanFailed] = useState<boolean>(false);
  const [rotation, setRotation] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setSelectedImage(event.target.result as string);
          setZoom(100);
          setRotation(0);
          setScanFailed(false);
          setScanMessage('アップロード画像を読み込みました');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAiAutoCrop = async () => {
    if (!resumeDriveFileId || !driveAccessToken) {
      setScanFailed(true);
      setScanMessage('この候補者にはDrive上の履歴書原本が紐づいていないため、自動検出できません。「写真アップロード」から手動で選択してください。');
      return;
    }

    setIsAiScanning(true);
    setScanFailed(false);
    setScanMessage('履歴書ファイルをDriveから取得し、Geminiで顔写真枠を解析中...');

    try {
      const result = await detectResumePhotoCrop(driveAccessToken, resumeDriveFileId);
      if (!result.found || !result.box) {
        setScanFailed(true);
        setScanMessage('履歴書内に証明写真枠を検出できませんでした。「写真アップロード」から手動で選択してください。');
        return;
      }

      const croppedDataUrl = await renderAndCrop(result.fileBase64, result.mimeType, result.box, result.page);
      setSelectedImage(croppedDataUrl);
      setZoom(100);
      setRotation(0);
      setScanMessage('AIが履歴書の顔写真枠を自動検出・切り抜きしました');
    } catch (err: any) {
      setScanFailed(true);
      setScanMessage(`自動検出に失敗しました: ${err.message || '不明なエラー'}`);
    } finally {
      setIsAiScanning(false);
    }
  };

  const handleSave = async () => {
    if (!selectedImage) return;
    setIsSaving(true);
    try {
      const baked = await bakeAdjustedCrop(selectedImage, zoom, rotation, aspectRatio);
      onSavePhoto(baked);
      onClose();
    } catch {
      // Falls back to the unadjusted image rather than blocking the save entirely.
      onSavePhoto(selectedImage);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                履歴書からの顔写真切り抜き
              </h3>
              <p className="text-xs text-slate-500">
                候補者: <strong className="text-slate-800">{candidateName}</strong> 様 （原本: {resumeFileName || '未登録'}）
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
          {/* AI Auto Crop Banner */}
          <div className="bg-indigo-600 text-white rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm">履歴書AI顔写真検出・自動切り抜き</p>
                <p className="text-xs text-indigo-200">
                  Driveに保存された履歴書原本（PDF/画像）をGeminiが解析し、証明写真エリアを自動検出・抽出します
                </p>
              </div>
            </div>
            <button
              onClick={handleAiAutoCrop}
              disabled={isAiScanning}
              className="bg-white text-indigo-900 hover:bg-indigo-50 font-bold text-xs px-4 py-2.5 rounded-lg transition-all cursor-pointer shadow-sm shrink-0 flex items-center gap-2 disabled:opacity-50"
            >
              {isAiScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>スキャン解析中...</span>
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4 text-indigo-600" />
                  <span>AI顔写真自動抽出を実行</span>
                </>
              )}
            </button>
          </div>

          {scanMessage && (
            <div className={`text-xs font-semibold p-2.5 rounded-lg flex items-center gap-2 border ${
              scanFailed
                ? 'text-amber-800 bg-amber-50 border-amber-200'
                : 'text-emerald-800 bg-emerald-50 border-emerald-200'
            }`}>
              <Check className="w-4 h-4 shrink-0" />
              <span>{scanMessage}</span>
            </div>
          )}

          {/* Main Workspace (Resume Preview Sheet + Crop Box) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

            {/* Left: Interactive Resume Canvas simulator (7 cols) */}
            <div className="md:col-span-7 bg-slate-200/70 p-4 rounded-2xl border border-slate-300 flex flex-col items-center justify-center relative overflow-hidden min-h-[320px]">

              {/* Simulated Japanese JIS Resume Sheet Background */}
              <div className="w-full bg-white rounded-lg shadow-md p-4 border border-slate-300 relative text-[9px] text-slate-400 select-none">
                <div className="flex justify-between items-start border-b border-slate-200 pb-2 mb-2">
                  <div className="space-y-1">
                    <p className="font-serif text-slate-800 text-xs font-bold">履 歴 書 （JIS規格）</p>
                    <p className="text-slate-900 font-bold text-sm pt-1">{candidateName}</p>
                  </div>

                  {/* Resume Photo Target Box (Upper Right) */}
                  <div className="w-24 h-32 border-2 border-dashed border-indigo-500 bg-indigo-50/50 rounded-md relative flex flex-col items-center justify-center p-1 overflow-hidden shadow-inner group">
                    <span className="absolute top-1 left-1 bg-indigo-600 text-white font-mono font-bold text-[8px] px-1 rounded z-10">
                      証明写真枠
                    </span>

                    {/* Scanner Effect when AI is running */}
                    {isAiScanning && (
                      <div className="absolute inset-0 bg-indigo-500/20 animate-pulse z-20 border-t-2 border-indigo-400"></div>
                    )}

                    {/* Cropped Photo inside resume box */}
                    <div className="w-full h-full overflow-hidden flex items-center justify-center rounded">
                      {selectedImage ? (
                        <img
                          src={selectedImage}
                          alt="Resume Headshot"
                          referrerPolicy="no-referrer"
                          style={{
                            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                            transition: 'transform 0.15s ease-out'
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageOff className="w-6 h-6 text-slate-300" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1 opacity-60">
                  <div className="h-2 bg-slate-200 rounded w-3/4"></div>
                  <div className="h-2 bg-slate-200 rounded w-1/2"></div>
                  <div className="h-2 bg-slate-200 rounded w-5/6"></div>
                  <div className="h-2 bg-slate-200 rounded w-2/3"></div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 mt-3 font-medium">
                ※ 履歴書の右上「写真貼付欄」から顔写真を切り抜いて自動抽出しています
              </p>
            </div>

            {/* Right: Controls & Preview (5 cols) */}
            <div className="md:col-span-5 space-y-4">

              {/* Cropped Preview Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <label className="block text-slate-800 font-bold text-xs">
                  切り抜き後プレビュー (アイコン表示)
                </label>

                <div className="flex items-center gap-4">
                  {/* Square / ID ratio preview */}
                  <div className="flex flex-col items-center gap-1">
                    <div className={`overflow-hidden border-2 border-indigo-500 shadow-md bg-slate-100 flex items-center justify-center ${
                      aspectRatio === 'circle' ? 'w-16 h-16 rounded-full' :
                      aspectRatio === '1:1' ? 'w-16 h-16 rounded-xl' :
                      'w-14 h-18 rounded-lg'
                    }`}>
                      {selectedImage ? (
                        <img
                          src={selectedImage}
                          alt="Crop Preview"
                          referrerPolicy="no-referrer"
                          style={{
                            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageOff className="w-4 h-4 text-slate-300" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">カード表示</span>
                  </div>

                  {/* Header circle preview */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-indigo-200 shadow-md bg-slate-100 flex items-center justify-center">
                      {selectedImage ? (
                        <img
                          src={selectedImage}
                          alt="Header Avatar"
                          referrerPolicy="no-referrer"
                          style={{
                            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageOff className="w-3.5 h-3.5 text-slate-300" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">詳細ヘッダー</span>
                  </div>
                </div>
              </div>

              {/* Adjustments */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1 text-slate-700 font-bold">
                    <span>ズーム / 倍率</span>
                    <span className="text-slate-500 font-mono">{zoom}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ZoomOut className="w-4 h-4 text-slate-400" />
                    <input
                      type="range"
                      min="80"
                      max="250"
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <ZoomIn className="w-4 h-4 text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    アスペクト比 / 枠形状
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => setAspectRatio('3:4')}
                      className={`py-1 px-2 rounded font-bold text-xs cursor-pointer border transition-colors ${
                        aspectRatio === '3:4' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      3:4 (標準)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAspectRatio('1:1')}
                      className={`py-1 px-2 rounded font-bold text-xs cursor-pointer border transition-colors ${
                        aspectRatio === '1:1' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      正方形 1:1
                    </button>
                    <button
                      type="button"
                      onClick={() => setAspectRatio('circle')}
                      className={`py-1 px-2 rounded font-bold text-xs cursor-pointer border transition-colors ${
                        aspectRatio === 'circle' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      円形
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setRotation((prev) => (prev + 90) % 360)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>回転 (90°)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setZoom(100);
                      setRotation(0);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    リセット
                  </button>
                </div>
              </div>

              {/* Upload a photo manually */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <label className="block text-slate-800 font-bold text-xs">
                  画像ファイルを手動でアップロード
                </label>

                <div className="flex gap-2">
                  <label className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-300 border-dashed rounded-lg p-2.5 text-center cursor-pointer transition-colors flex items-center justify-center gap-1 text-slate-700 font-bold text-xs">
                    <Upload className="w-4 h-4 text-indigo-600" />
                    <span>写真アップロード</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500">
            ※ 顔写真を保存すると、Kanbanカードや一覧テーブル、詳細情報に反映されます。
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={!selectedImage || isSaving}
              className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <UserCheck className="w-4 h-4" />
              )}
              <span>{isSaving ? '適用中...' : '切り抜き顔写真を保存・適用'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
