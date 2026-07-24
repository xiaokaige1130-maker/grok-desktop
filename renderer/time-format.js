/**
 * Mac-style absolute session times + human processing durations.
 * Usable in renderer (window.GrokTime) and Node tests (module.exports).
 */
(function (global) {
  function isEn(locale) {
    return String(locale || "zh").toLowerCase().startsWith("en");
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  /**
   * Absolute datetime for session lists (Finder / Messages style).
   * zh: 今天 14:32 | 昨天 09:05 | 7月22日 14:32 | 2025年7月22日 14:32
   * en: Today 2:32 PM | Yesterday 9:05 AM | Jul 22, 2:32 PM | Jul 22, 2025, 2:32 PM
   */
  function formatAbsoluteTime(iso, opts = {}) {
    if (!iso) return "";
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const locale = opts.locale || "zh";
    const now = opts.now instanceof Date ? opts.now : new Date();
    const en = isEn(locale);

    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const dayDiff = Math.round((startOf(now) - startOf(d)) / 86400000);

    const h = d.getHours();
    const m = d.getMinutes();
    let clock;
    if (en) {
      const ap = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      clock = `${h12}:${pad2(m)} ${ap}`;
    } else {
      clock = `${pad2(h)}:${pad2(m)}`;
    }

    if (dayDiff === 0) return en ? `Today ${clock}` : `今天 ${clock}`;
    if (dayDiff === 1) return en ? `Yesterday ${clock}` : `昨天 ${clock}`;

    const sameYear = d.getFullYear() === now.getFullYear();
    if (en) {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const mon = months[d.getMonth()];
      return sameYear
        ? `${mon} ${d.getDate()}, ${clock}`
        : `${mon} ${d.getDate()}, ${d.getFullYear()}, ${clock}`;
    }
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    return sameYear
      ? `${mo}月${day}日 ${clock}`
      : `${d.getFullYear()}年${mo}月${day}日 ${clock}`;
  }

  /** Full tooltip: 2026年7月22日 星期三 14:32:08 */
  function formatFullDateTime(iso, opts = {}) {
    if (!iso) return "";
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const locale = isEn(opts.locale) ? "en-US" : "zh-CN";
    try {
      return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: isEn(opts.locale),
      }).format(d);
    } catch {
      return d.toLocaleString();
    }
  }

  /**
   * Processing duration.
   * zh: 12秒 | 1分23秒 | 1小时2分 | 2小时5分12秒 (if includeSeconds for long)
   * en: 12s | 1m 23s | 1h 2m
   */
  function formatDuration(ms, opts = {}) {
    if (ms == null || Number.isNaN(ms) || ms < 0) return "";
    const locale = opts.locale || "zh";
    const en = isEn(locale);
    let sec = Math.floor(ms / 1000);
    if (sec < 1) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (en) {
      if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
      if (m > 0) return s > 0 || opts.precise ? `${m}m ${s}s` : `${m}m`;
      return `${s}s`;
    }
    if (h > 0) {
      if (m > 0 && s > 0 && opts.precise) return `${h}小时${m}分${s}秒`;
      if (m > 0) return `${h}小时${m}分`;
      return `${h}小时`;
    }
    if (m > 0) return s > 0 || opts.precise !== false ? `${m}分${s}秒` : `${m}分`;
    return `${s}秒`;
  }

  /** Compact live timer for status: 0:12 | 1:23 | 1:02:05 */
  function formatElapsedClock(ms) {
    if (ms == null || Number.isNaN(ms) || ms < 0) return "0:00";
    const sec = Math.floor(ms / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
    return `${m}:${pad2(s)}`;
  }

  const api = {
    formatAbsoluteTime,
    formatFullDateTime,
    formatDuration,
    formatElapsedClock,
  };

  global.GrokTime = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
