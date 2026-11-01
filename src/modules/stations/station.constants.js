/**
 * Station Module Constants (UC005, UC006, UC012)
 * Ngưỡng nghiệp vụ lấy từ đặc tả trong báo cáo; giữ đồng bộ với
 * scanWaste-mobile: src/features/collection-points/constants.ts
 */

/** ACTIVE: đang nhận rác · FULL: đầy 100% · OFFLINE: ngừng hoạt động · SERVICING: đã điều xe, đang xử lý */
const STATION_STATUSES = ['ACTIVE', 'FULL', 'OFFLINE', 'SERVICING'];

/** Smart RVM (máy thu hồi tự động) hoặc thùng/điểm thu gom thường */
const STATION_TYPES = ['SMART_RVM', 'STANDARD_BIN'];

const STATION_THRESHOLDS = {
  /** UC005: bán kính tìm kiếm mặc định (km) */
  DEFAULT_RADIUS_KM: 5,
  /** UC005 luồng 4a: các mức nới bán kính khi không có trạm (km) */
  EXPANDED_RADIUS_STEPS_KM: [10, 20],
  /** Bán kính lớn nhất client được phép yêu cầu (km) */
  MAX_RADIUS_KM: 50,
  /** UC012: chạm ngưỡng này thì cảnh báo */
  WARNING_PERCENT: 95,
  /** UC006: đầy 100% thì không dẫn đường */
  FULL_PERCENT: 100,
  DEFAULT_PAGE_SIZE: 5,
  MAX_PAGE_SIZE: 100,
};

/** Thao tác admin được ghi vào StationLog (audit) */
const STATION_ACTIONS = ['DISPATCH', 'COMPLETE', 'CAPACITY'];

module.exports = {
  STATION_STATUSES,
  STATION_TYPES,
  STATION_THRESHOLDS,
  STATION_ACTIONS,
};
