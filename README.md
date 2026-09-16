# ScanWaste Backend - Hệ Thống Phân Loại Rác Bằng AI (Modular Monolith)

Backend API duy nhất phục vụ ứng dụng di động **"Phân loại rác bằng AI" (ScanWaste)**, được xây dựng theo kiến trúc **Modular Monolith** bằng Node.js, Express.js và MongoDB.

---

## 1. Giới thiệu Kiến trúc Modular Monolith

### Modular Monolith là gì?
**Modular Monolith** là một kiến trúc trong đó:
- Toàn bộ Backend chạy trong **một ứng dụng Node.js + Express duy nhất** và **một HTTP Server duy nhất**.
- Mã nguồn được phân chia thành các **module nghiệp vụ độc lập** (Business Modules) với ranh giới trách nhiệm rõ ràng.
- **Không sử dụng Microservices**, không chia nhỏ thành nhiều server độc lập phức tạp, giúp dễ dàng triển khai, debug và tối ưu tài nguyên nhưng vẫn đảm bảo tính module hóa và dễ mở rộng.

### Luồng xử lý chuẩn trong từng Module:
```text
Route
  ↓ (Auth Middleware / Upload Middleware / Validation)
Controller
  ↓ (Nhận request, gọi service, định dạng response)
Service
  ↓ (Xử lý toàn bộ logic nghiệp vụ)
Model / Database (MongoDB + Mongoose)
```

---

## 2. Công nghệ sử dụng

| Công nghệ | Mục đích |
|---|---|
| **Node.js (>= 20)** | Môi trường runtime JavaScript |
| **Express.js (v5)** | Web framework cho HTTP REST API |
| **MongoDB & Mongoose (v9)** | Cơ sở dữ liệu NoSQL & ODM |
| **JSON Web Token (JWT)** | Xác thực người dùng (Bearer Token) |
| **bcryptjs** | Mã hóa băm mật khẩu người dùng |
| **Multer** | Xử lý tải lên tệp tin hình ảnh |
| **dotenv** | Quản lý biến môi trường |
| **cors** | Cấu hình Cross-Origin Resource Sharing |
| **morgan** | HTTP request logger |
| **nodemon** | Tự động reload server khi phát triển |
| **Docker & Docker Compose** | Đóng gói và chạy môi trường container |

---

## 3. Cấu trúc thư mục

```text
scanWaste-be/
│
├── src/
│   ├── modules/
│   │   ├── auth/                           # Module xác thực (Register, Login, JWT)
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   ├── auth.routes.js
│   │   │   └── auth.validation.js
│   │   │
│   │   ├── users/                          # Module quản lý thông tin User
│   │   │   ├── user.model.js
│   │   │   ├── user.controller.js
│   │   │   ├── user.service.js
│   │   │   └── user.routes.js
│   │   │
│   │   ├── classifications/                # Module phân loại rác
│   │   │   ├── classification.model.js
│   │   │   ├── classification.controller.js
│   │   │   ├── classification.service.js
│   │   │   ├── classification.routes.js
│   │   │   └── classification.validation.js
│   │   │
│   │   ├── ai/                             # Module AI Engine (Adapter & Service)
│   │   │   ├── ai.service.js
│   │   │   ├── ai.adapter.js
│   │   │   └── ai.config.js
│   │   │
│   │   ├── history/                        # Module lịch sử phân loại
│   │   │   ├── history.controller.js
│   │   │   ├── history.service.js
│   │   │   └── history.routes.js
│   │   │
│   │   └── statistics/                     # Module thống kê phân loại
│   │       ├── statistics.controller.js
│   │       ├── statistics.service.js
│   │       └── statistics.routes.js
│   │
│   ├── config/
│   │   ├── database.js                     # Kết nối MongoDB qua Mongoose
│   │   └── env.js                          # Cấu hình biến môi trường
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.js              # Xác thực JWT Bearer Token
│   │   ├── upload.middleware.js            # Upload Multer (5MB, JPEG/PNG/WEBP)
│   │   ├── error.middleware.js             # Bắt và xử lý lỗi tập trung
│   │   └── notFound.middleware.js          # Xử lý 404 Route Not Found
│   │
│   ├── routes/
│   │   └── index.js                        # Root router đăng ký tất cả module routes
│   │
│   ├── utils/
│   │   ├── jwt.js                          # Ký và xác thực JWT
│   │   └── response.js                     # Chuẩn hóa JSON Response
│   │
│   ├── app.js                              # Cấu hình Express App
│   └── server.js                           # Entrypoint kết nối DB và Start Server
│
├── tests/
│   ├── unit/                               # Unit test logic độc lập
│   ├── integration/                        # Integration test toàn bộ API
│   └── e2e/                                # Kịch bản E2E
│
├── uploads/                                # Thư mục lưu trữ hình ảnh tải lên
├── .env                                    # Biến môi trường local (không commit)
├── .env.example                            # Mẫu biến môi trường
├── .gitignore
├── Dockerfile                              # Cấu hình Docker build
├── docker-compose.yml                      # Cấu hình chạy Backend + MongoDB
├── package.json
└── README.md
```

---

## 4. Danh sách các Module nghiệp vụ

1. **`auth`**: Đăng ký, đăng nhập tài khoản, băm mật khẩu bằng `bcryptjs`, sinh mã JWT Token.
2. **`users`**: Quản lý thông tin hồ sơ tài khoản người dùng (`/api/users/me`), bảo mật không lộ mật khẩu.
3. **`ai`**: Module AI độc lập nội bộ xử lý dự đoán phân loại rác dựa trên kiến trúc **AI Adapter** (có thể dễ dàng tích hợp TensorFlow, PyTorch, ONNX hoặc External API mà không làm sửa đổi Controller hay Routing). Tuyệt đối không sinh số ngẫu nhiên giả mạo.
4. **`classifications`**: Nhận tệp hình ảnh từ mobile qua Multer, điều phối sang AI Module và lưu trữ thông tin phân loại vào MongoDB.
5. **`history`**: Truy xuất lịch sử phân loại của người dùng hiện tại theo cơ chế phân trang (Pagination) và chi tiết từng lần phân loại.
6. **`statistics`**: Tổng hợp và thống kê số lượng rác đã phân loại theo từng nhóm rác (`plastic`, `paper`, `glass`, `metal`, `organic`, `cardboard`, `other`) bằng MongoDB Aggregation Pipeline.

---

## 5. Danh mục các nhóm rác hỗ trợ (AI Classes)

- `plastic` (Nhựa)
- `paper` (Giấy)
- `glass` (Thủy tinh)
- `metal` (Kim loại)
- `organic` (Rác hữu cơ)
- `cardboard` (Bìa carton)
- `other` (Khác)

---

## 6. Biến môi trường (.env)

Tạo file `.env` từ `.env.example`:

```env
PORT=5000
NODE_ENV=development

# MongoDB Connection String
MONGODB_URI=mongodb://localhost:27017/waste_classification

# JWT Configuration
JWT_SECRET=waste_classification_secret_key_2026_super_secure
JWT_EXPIRES_IN=7d

# File Upload Configuration (5MB = 5242880 bytes)
MAX_FILE_SIZE=5242880
UPLOAD_DIR=uploads
```

---

## 7. Cài đặt và Chạy ứng dụng

### 7.1 Chạy trực tiếp trên máy cục bộ (Local)

1. **Cài đặt dependencies:**
   ```bash
   npm install
   ```

2. **Khởi động server ở chế độ Development (Nodemon):**
   ```bash
   npm run dev
   ```

3. **Khởi động server ở chế độ Production:**
   ```bash
   npm start
   ```

4. **Chạy kiểm thử tích hợp tự động (Integration Test Suite):**
   ```bash
   npm test
   ```

---

### 7.2 Chạy bằng Docker & Docker Compose

Khởi chạy đồng thời cả **Backend** và **MongoDB 7.0**:

```bash
# Khởi động dịch vụ nền
docker compose up -d

# Xem logs
docker compose logs -f backend

# Dừng dịch vụ
docker compose down
```

---

## 8. Danh sách REST API Endpoints

### 8.1 Health Check
- **`GET /api/health`**
  - Response:
    ```json
    {
      "success": true,
      "message": "Backend is running",
      "data": {
        "database": "connected"
      }
    }
    ```

---

### 8.2 Authentication Module (`/api/auth`)

#### Đăng ký tài khoản
- **`POST /api/auth/register`**
- **Body (JSON):**
  ```json
  {
    "name": "Nguyen Van A",
    "email": "user@example.com",
    "password": "Password123"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "User registered successfully",
    "data": {
      "user": {
        "id": "660c1d2e...",
        "name": "Nguyen Van A",
        "email": "user@example.com",
        "role": "user",
        "createdAt": "2026-09-16T...",
        "updatedAt": "2026-09-16T..."
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

#### Đăng nhập
- **`POST /api/auth/login`**
- **Body (JSON):**
  ```json
  {
    "email": "user@example.com",
    "password": "Password123"
  }
  ```
- **Response (200 OK):** Trả về thông tin User và JWT Token.

---

### 8.3 User Module (`/api/users`)

#### Lấy thông tin tài khoản hiện tại
- **`GET /api/users/me`**
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Get profile successfully",
    "data": {
      "id": "660c1d2e...",
      "name": "Nguyen Van A",
      "email": "user@example.com",
      "role": "user"
    }
  }
  ```

---

### 8.4 Classification Module (`/api/classifications`)

#### Phân loại rác từ hình ảnh tải lên
- **`POST /api/classifications`**
- **Headers:** 
  - `Authorization: Bearer <token>`
  - `Content-Type: multipart/form-data`
- **Body (Form-Data):**
  - Key: `image` (File ảnh JPG, PNG, WEBP <= 5MB)
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Classification successfully",
    "data": {
      "id": "660c1f9a...",
      "userId": "660c1d2e...",
      "imageUrl": "/uploads/waste-1726500000000-123456789.jpg",
      "predictedClass": "plastic",
      "confidence": 0,
      "metadata": {
        "originalName": "plastic_bottle.jpg",
        "size": 245000,
        "mimetype": "image/jpeg",
        "aiDetails": {
          "mock": true,
          "provider": "mock_adapter",
          "status": "AI_MODEL_NOT_CONFIGURED"
        }
      },
      "createdAt": "2026-09-16T...",
      "updatedAt": "2026-09-16T..."
    }
  }
  ```

---

### 8.5 History Module (`/api/history`)

#### Lấy danh sách lịch sử phân loại (Có phân trang)
- **`GET /api/history?page=1&limit=10`**
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Get history successfully",
    "data": {
      "items": [
        {
          "id": "660c1f9a...",
          "userId": "660c1d2e...",
          "imageUrl": "/uploads/waste-...",
          "predictedClass": "plastic",
          "confidence": 0,
          "createdAt": "2026-09-16T..."
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 10,
        "totalCount": 25,
        "totalPages": 3
      }
    }
  }
  ```

#### Lấy chi tiết một lần phân loại
- **`GET /api/history/:id`**
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):** Chi tiết bản ghi phân loại thuộc sở hữu của người dùng.

---

### 8.6 Statistics Module (`/api/statistics`)

#### Thống kê kết quả phân loại của người dùng
- **`GET /api/statistics`**
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Get statistics successfully",
    "data": {
      "total": 15,
      "plastic": 7,
      "paper": 3,
      "glass": 2,
      "metal": 1,
      "organic": 1,
      "cardboard": 1,
      "other": 0
    }
  }
  ```

---

## 9. Hướng dẫn Test bằng Postman

1. **Health Check**: `GET http://localhost:5000/api/health`
2. **Register**: `POST http://localhost:5000/api/auth/register` với Body `raw (JSON)`.
3. **Login**: `POST http://localhost:5000/api/auth/login` -> Sao chép `data.token`.
4. **Set Token trong Postman**: Vào tab `Authorization` chọn `Bearer Token`, dán token đã copy.
5. **Get Profile**: `GET http://localhost:5000/api/users/me`.
6. **Classify Waste**: `POST http://localhost:5000/api/classifications` -> Chọn Body `form-data`, key `image` (loại File), chọn ảnh rác từ máy tính và gửi request.
7. **Get History**: `GET http://localhost:5000/api/history?page=1&limit=10`.
8. **Get Statistics**: `GET http://localhost:5000/api/statistics`.
