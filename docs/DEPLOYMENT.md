# Hướng Dẫn Triển Khai ScanWaste Backend (Production Deployment Guide)

Tài liệu này hướng dẫn chi tiết quy trình triển khai Backend và AI Inference Microservice của **ScanWaste** lên môi trường Production, cùng với cấu hình CI/CD tự động trên GitHub Actions.

---

## 1. Kiến Trúc Triển Khai Production

```text
[Internet / Client App / Web]
               │ HTTPS (Port 443) / HTTP (Port 80)
               ▼
      ┌─────────────────┐
      │   Nginx Proxy   │ (Rate Limiting, Gzip, SSL/TLS Termination, Security Headers)
      └────────┬────────┘
               │ Internal Bridge Network (scanwaste-prod-network)
       ┌───────┴────────────────────────┬────────────────────────┐
       ▼                                ▼                        ▼
┌──────────────┐                 ┌──────────────┐         ┌──────────────┐
│ Node Backend │◄───────────────►│ AI Inference │         │ Uploads Data │
│ (Port 5000)  │ (HTTP :5005)    │ (FastAPI :5005)│       │ (/uploads)   │
└──────┬───────┘                 └──────────────┘         └──────────────┘
       │
       ├────────────────────────────────┐
       ▼                                ▼
┌──────────────┐                 ┌──────────────┐
│  Redis 7.0   │                 │ MongoDB 7.0  │
│ (Port 6379)  │                 │(Port 27017)  │
└──────────────┘                 └──────────────┘
```

> **Bảo mật mạng:** Các dịch vụ `MongoDB`, `Redis` và `AI Inference` hoàn toàn không expose cổng ra Internet công cộng. Mọi truy cập từ bên ngoài đều phải đi qua Nginx Reverse Proxy.

---

## 2. Chuẩn Bị Server Production (VPS / Cloud)

### 2.1 Yêu Cầu Cấu Hình
- **Hệ điều hành:** Ubuntu 22.04 LTS / 24.04 LTS hoặc Debian 12
- **Tài nguyên tối thiểu:** 2 vCPU, 4GB RAM, 25GB SSD
- **Phần mềm:** Docker Engine >= 24.0 và Docker Compose v2 (`docker compose`)

### 2.2 Cài Đặt Docker & Docker Compose
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

---

## 3. Các Bước Triển Khai Thủ Công Bằng Docker Compose

### Bước 1: Clone Repository
```bash
sudo mkdir -p /opt/scanWaste-be
sudo chown -R $USER:$USER /opt/scanWaste-be
git clone https://github.com/minhhoanghtm/scanWaste-be.git /opt/scanWaste-be
cd /opt/scanWaste-be
```

### Bước 2: Tạo File Cấu Hình Biến Môi Trường
```bash
cp .env.production.example .env.production
nano .env.production
```
Tạo các khóa bảo mật ngẫu nhiên:
```bash
openssl rand -hex 32  # Dùng cho JWT_SECRET
openssl rand -hex 32  # Dùng cho OTP_SECRET
```

### Bước 3: Khởi Động Hệ Thống
Chạy script triển khai tự động:
```bash
chmod +x scripts/deploy-prod.sh scripts/backup-db.sh
./scripts/deploy-prod.sh
```

Hoặc khởi chạy trực tiếp qua Docker Compose:
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

### Bước 4: Kiểm Tra Trạng Thái Sức Khỏe (Health Check)
```bash
curl http://127.0.0.1/api/health
# Hoặc
curl http://127.0.0.1:5000/api/health
```
Kết quả mong muốn:
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

## 4. Cấu Hình Tự Động Hóa CI/CD (GitHub Actions)

File workflow: `.github/workflows/ci-cd.yml`

### 4.1 Quy Trình Pipeline
1. **Quality & Test Gate (`test`):**
   - Kích hoạt khi tạo PR hoặc push vào `main`, `master`, `develop`.
   - Khởi động Redis và MongoDB service containers.
   - Kiểm thử toàn diện: Unit tests, Auth, Social, Session OTP, Stations, User Profile, và E2E Integration tests.
2. **Container Build Verification (`docker-check`):**
   - Build thử `Dockerfile` backend và `ai_service/Dockerfile`.
   - Kiểm tra suy luận TFLite bên trong container AI.
   - Xác thực cú pháp `docker-compose.yml` và `docker-compose.prod.yml`.
3. **Build & Publish Images (`publish-images`):**
   - Tự động đóng gói và push Docker Image lên GitHub Container Registry (`ghcr.io`).
4. **Continuous Deployment (`deploy`):**
   - Tự động kích hoạt khi merge code vào nhánh `main`.
   - Hỗ trợ triển khai qua SSH (VPS) hoặc Webhook (Render / Railway / Koyeb).

### 4.2 Các Secrets Cần Cấu Hình Trên GitHub Repository
Vào mục **Settings -> Secrets and variables -> Actions** trên GitHub và thiết lập:

| Tên Secret | Bắt buộc | Mô tả |
|---|---|---|
| `SSH_HOST` | Tùy chọn (Cách 1) | IP hoặc Domain của Server Production |
| `SSH_USER` | Tùy chọn (Cách 1) | User SSH (ví dụ: `ubuntu` hoặc `root`) |
| `SSH_PRIVATE_KEY` | Tùy chọn (Cách 1) | Khóa riêng RSA/Ed25519 để SSH vào Server |
| `SSH_PORT` | Tùy chọn (Cách 1) | Cổng SSH (mặc định: `22`) |
| `DEPLOY_DIR` | Tùy chọn (Cách 1) | Thư mục mã nguồn trên server (mặc định: `/opt/scanWaste-be`) |
| `DEPLOY_WEBHOOK_URL`| Tùy chọn (Cách 2) | URL Webhook tự động deploy của Cloud Platform (Render/Railway/CapRover) |

---

## 5. Sao Lưu & Phục Hồi Dữ Liệu (Backup & Restore)

### 5.1 Sao Lưu Tự Động
Script `scripts/backup-db.sh` tự động dump cơ sở dữ liệu `waste_classification` với nén gzip và tự động dọn dẹp các bản backup cũ hơn 7 ngày.
```bash
./scripts/backup-db.sh
```

Cấu hình Cron job sao lưu hàng ngày lúc 02:00 sáng:
```bash
0 2 * * * /opt/scanWaste-be/scripts/backup-db.sh >> /var/log/scanwaste-backup.log 2>&1
```

### 5.2 Phục Hồi Dữ Liệu
```bash
docker exec -i scanwaste-mongodb-prod mongorestore --archive --gzip --drop < ./backups/mongo/scanwaste_backup_YYYYMMDD_HHMMSS.gz
```
