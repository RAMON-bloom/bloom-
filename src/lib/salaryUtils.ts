// 月給(万円)×か月数から希望年収の表示用文字列（例: "600万円"）を計算する。
export function computeAnnualSalaryText(monthlyManYen: number, months: number): string | null {
  if (!monthlyManYen || !months) return null;
  const annual = Math.round(monthlyManYen * months * 10) / 10;
  const formatted = Number.isInteger(annual) ? String(annual) : annual.toFixed(1);
  return `${formatted}万円`;
}
