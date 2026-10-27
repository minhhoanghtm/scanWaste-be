# Hướng Dẫn Tích Hợp ScanWaste Mobile (React Native) Với Backend API

Tài liệu kỹ thuật chi tiết dành cho kỹ sư Mobile phát triển ứng dụng **ScanWaste** (React Native / Expo / Bare React Native) kết nối với hệ thống Backend Node.js và AI Inference Engine.

---

## 1. Cấu Hình Địa Chỉ Máy Chủ (`API_BASE_URL`)

Tùy thuộc vào môi trường chạy ứng dụng Mobile, hãy cấu hình `API_BASE_URL` chính xác:

| Môi trường chạy Mobile | Giá trị `API_BASE_URL` | Lưu ý quan trọng |
|---|---|---|
| **Android Emulator** | `http://10.0.2.2:5000` | Android Virtual Device (AVD) trỏ về `10.0.2.2` để truy cập `localhost` của máy tính phát triển. Không dùng `http://localhost:5000` trên Android! |
| **iOS Simulator** | `http://localhost:5000` | iOS Simulator dùng chung network loopback với macOS. |
| **Thiết bị thật (Physical Device)** | `http://192.168.1.X:5000` | Máy tính chạy Backend và điện thoại phải kết nối chung mạng Wi-Fi LAN. Thay `192.168.1.X` bằng IP LAN thực tế của máy tính. |
| **Production / Cloud Server** | `https://api.scanwaste.vn` | Domain HTTPS thực tế có chứng chỉ SSL hợp lệ. |

### Cấu hình trong React Native (`src/config/api.ts`):
```typescript
import { Platform } from 'react-native';

const getBaseUrl = (): string => {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:5000';
    }
    return 'http://localhost:5000';
  }
  return 'https://api.scanwaste.vn';
};

export const API_BASE_URL = getBaseUrl();
```

---

## 2. Quản Lý Phiên Xác Thực JWT Bearer Token

Tất cả các API nghiệp vụ đều yêu cầu truyền header `Authorization: Bearer <TOKEN>`:

### 2.1. Đăng ký & Đăng nhập
```typescript
// src/services/authService.ts
export const login = async (email: string, password: string) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (data.success && data.data?.token) {
    // Lưu token vào Keychain / EncryptedStorage / AsyncStorage
    await AsyncStorage.setItem('USER_TOKEN', data.data.token);
    return data.data;
  }
  throw new Error(data.message || 'Login failed');
};
```

### 2.2. Axios / Fetch Interceptor tự động gắn Bearer Token
```typescript
// src/services/httpClient.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export const authorizedFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = await AsyncStorage.getItem('USER_TOKEN');
  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Xử lý token hết hạn -> chuyển màn hình Login
    await AsyncStorage.removeItem('USER_TOKEN');
  }

  return response;
};
```

---

## 3. Upload Hình Ảnh Phân Loại Rác Trực Tuyến (`POST /api/ai/classify`)

Khi thiết bị có kết nối mạng Internet, ảnh chụp từ camera hoặc thư viện ảnh sẽ được gửi lên Backend để MobileNetV2 V3 thực hiện phân loại thời gian thực:

```typescript
// src/services/aiService.ts
export interface ClassificationResult {
  classificationId: string;
  imageUrl: string;
  predictedClass: 'organic' | 'cardboard' | 'glass' | 'metal' | 'paper' | 'plastic' | 'other';
  predictedClassVi: string;
  confidence: number;
  topPredictions: Array<{ class: string; classVi: string; score: number }>;
  disposalTips: string[];
  modelVersion: string;
  inferenceTimeMs: number;
}

export const classifyImageOnline = async (imageUri: string): Promise<ClassificationResult> => {
  const token = await AsyncStorage.getItem('USER_TOKEN');
  
  const formData = new FormData();
  // Định dạng file chuẩn multipart/form-data cho React Native
  formData.append('image', {
    uri: Platform.OS === 'android' ? imageUri : imageUri.replace('file://', ''),
    name: `waste_${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as any);

  const response = await fetch(`${API_BASE_URL}/api/ai/classify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // Không đặt 'Content-Type': 'multipart/form-data' thủ công, để fetch tự động chèn boundary!
    },
    body: formData,
  });

  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.message || 'Classification failed');
  }

  return json.data;
};
```

---

## 4. Cơ Chế Offline AI Inference & Hàng Đợi Đồng Bộ (Sync Queue)

Khi người dùng ở khu vực không có sóng mạng (hầm gửi xe, vùng sâu vùng xa), ứng dụng Mobile chạy mô hình TFLite đóng gói sẵn trên máy (`scanwaste_mobilenetv2_v3.tflite`).

### 4.1. Cấu trúc lưu trữ bản ghi Offline trong AsyncStorage
Mỗi lần phân loại offline, ứng dụng sinh một UUID định danh bất biến (`clientClassificationId`):

```typescript
export interface OfflineClassificationRecord {
  clientClassificationId: string; // UUID v4, ví dụ: 'c9bf9e57-1685-4c89-bafb-ff5af830be8a'
  predictedClass: 'organic' | 'cardboard' | 'glass' | 'metal' | 'paper' | 'plastic' | 'other';
  confidence: number;
  offlineTimestamp: string; // ISO 8601
  modelVersion: string;
  synced: boolean;
}
```

### 4.2. Lưu vào hàng đợi Offline
```typescript
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export const saveOfflineClassification = async (
  predictedClass: string,
  confidence: number
): Promise<OfflineClassificationRecord> => {
  const newRecord: OfflineClassificationRecord = {
    clientClassificationId: uuidv4(),
    predictedClass: predictedClass as any,
    confidence,
    offlineTimestamp: new Date().toISOString(),
    modelVersion: 'v3-mobile',
    synced: false,
  };

  const existingRaw = await AsyncStorage.getItem('OFFLINE_QUEUE');
  const queue: OfflineClassificationRecord[] = existingRaw ? JSON.parse(existingRaw) : [];
  queue.push(newRecord);
  await AsyncStorage.setItem('OFFLINE_QUEUE', JSON.stringify(queue));

  return newRecord;
};
```

### 4.3. Tự động đồng bộ khi có kết nối mạng (`POST /api/ai/sync`)
Ứng dụng dùng thư viện `@react-native-community/netinfo` để lắng nghe trạng thái kết nối mạng:

```typescript
import NetInfo from '@react-native-community/netinfo';

export const syncOfflineClassifications = async (): Promise<void> => {
  const queueRaw = await AsyncStorage.getItem('OFFLINE_QUEUE');
  if (!queueRaw) return;

  const queue: OfflineClassificationRecord[] = JSON.parse(queueRaw);
  const pendingItems = queue.filter((item) => !item.synced);
  if (pendingItems.length === 0) return;

  const token = await AsyncStorage.getItem('USER_TOKEN');

  try {
    const response = await fetch(`${API_BASE_URL}/api/ai/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        items: pendingItems.map((item) => ({
          clientClassificationId: item.clientClassificationId,
          predictedClass: item.predictedClass,
          confidence: item.confidence,
          offlineTimestamp: item.offlineTimestamp,
          modelVersion: item.modelVersion,
        })),
      }),
    });

    const data = await response.json();
    if (data.success) {
      // Đánh dấu các bản ghi đã đồng bộ thành công
      const syncedIds = new Set(data.data.results.map((r: any) => r.clientClassificationId));
      const updatedQueue = queue.map((item) =>
        syncedIds.has(item.clientClassificationId) ? { ...item, synced: true } : item
      );
      // Giữ lại hoặc dọn sạch bản ghi đã sync
      await AsyncStorage.setItem('OFFLINE_QUEUE', JSON.stringify(updatedQueue));
      console.log(`[Sync] Đã đồng bộ ${data.data.syncedCount} lượt offline (bỏ qua ${data.data.duplicateCount} trùng lặp).`);
    }
  } catch (error) {
    console.warn('[Sync] Đồng bộ thất bại, sẽ tự động thử lại khi có mạng:', error);
  }
};

// Đăng ký listener mạng trong App.tsx
NetInfo.addEventListener((state) => {
  if (state.isConnected && state.isInternetReachable) {
    syncOfflineClassifications();
  }
});
```

### 4.4. Xử lý Trùng lặp (Idempotency)
Backend sử dụng `clientClassificationId` với Unique Index trên MongoDB. Do đó, nếu thiết bị gửi lại nhiều lần do timeout mạng, Backend sẽ **bỏ qua bản ghi trùng lặp và trả về danh sách ID cũ**, tuyệt đối không tạo dữ liệu trùng lặp trong hệ thống.

---

## 5. Gửi Phản Hồi Phân Loại Sai (`POST /api/ai/feedback`)

Khi người dùng thấy kết quả nhận diện chưa đúng, ứng dụng hiển thị popup để chọn nhãn đúng:

```typescript
export const submitFeedback = async (
  classificationId: string,
  correctClass: string,
  comment?: string,
  consentGiven: boolean = true
) => {
  const token = await AsyncStorage.getItem('USER_TOKEN');

  const response = await fetch(`${API_BASE_URL}/api/ai/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      classificationId,
      correctClass,
      comment,
      consentGiven,
    }),
  });

  return await response.json();
};
```

---

## 6. Hiển Thị Lịch Sử Phân Loại (`GET /api/history`)

Hỗ trợ phân trang và Pull-to-Refresh mượt mà trong `FlatList`:

```typescript
export const fetchHistory = async (page: number = 1, limit: number = 10) => {
  const token = await AsyncStorage.getItem('USER_TOKEN');

  const response = await fetch(`${API_BASE_URL}/api/history?page=${page}&limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return await response.json();
};
```

---

## 7. Kiểm Tra Phiên Bản Mô Hình Mobile (`GET /api/ai/models/current`)

Trước khi thực hiện phân loại, ứng dụng có thể kiểm tra phiên bản mô hình server/mobile hiện hành để thông báo cho người dùng nếu có bản cập nhật model mới:

```typescript
export const checkLatestModel = async () => {
  const response = await fetch(`${API_BASE_URL}/api/ai/models/current?platform=mobile_bundled`);
  const data = await response.json();
  if (data.success && data.data) {
    const serverVersion = data.data.version;
    const localVersion = 'v3'; // Phiên bản bundled trong app
    if (serverVersion !== localVersion) {
      console.log(`[Model] Đã có phiên bản mô hình mới: ${serverVersion}. Cần cập nhật app!`);
    }
  }
};
```

---

## 8. Danh Mục 7 Loại Rác và Màu Sắc Giao Diện

Thứ tự 7 nhãn và mã màu chuẩn hiển thị trên UI ứng dụng ScanWaste:

| Key | Tên Tiếng Việt | Mã Màu UI Khuyên Dùng | Biểu Tượng |
|---|---|---|---|
| `organic` | Rác hữu cơ | `#16A34A` (Xanh lá cây) | 🍏 / 🥬 |
| `cardboard` | Bìa carton | `#B45309` (Nâu đất) | 📦 |
| `glass` | Thủy tinh | `#0284C7` (Xanh da trời) | 🍾 / 🍶 |
| `metal` | Kim loại | `#64748B` (Xám ánh bạc) | 🥫 / 🧲 |
| `paper` | Giấy | `#0D9488` (Xanh mòng két) | 📄 / 📰 |
| `plastic` | Nhựa | `#F59E0B` (Vàng hổ phách) | 🧴 / 🥤 |
| `other` | Khác | `#6B7280` (Xám trung tính) | 🗑️ |
