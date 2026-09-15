const counts = new Intl.NumberFormat('zh-CN');
export function detectionSummary(detection) {
  if (!detection || !Number.isSafeInteger(detection.runs) || detection.runs <= 0
    || !Number.isSafeInteger(detection.passed) || detection.passed < 0 || detection.passed > detection.runs) return null;
  const rate = detection.passed / detection.runs * 100;
  // A rounded display must not turn a dataset containing failures into 100% success.
  const percent = rate === 100 ? '100' : rate === 0 ? '0' : Math.min(99.9, rate).toFixed(1);
  return {
    text: `检测成功率 ${percent}%；累计检测 ${counts.format(detection.runs)} 次，成功 ${counts.format(detection.passed)} 次。`,
    date: /^\d{4}-\d{2}-\d{2}/.test(detection.latestAt || '') ? detection.latestAt.slice(0, 10) : null,
  };
}
