# Kiểm tra trước khi push — 27/10/2026

Môi trường local: macOS, Node.js 22.23.2, MongoDB 8.2.7.

## Kết quả thực thi

- `npm test`: thành công. Unit AI/Auth đạt; auth integration 10/10; social security/persistence 8/8; API integration 47 assertions đạt, 0 thất bại.
- `npm audit --omit=dev`: 0 lỗ hổng được báo tại thời điểm kiểm tra.
- `git diff --check`, cú pháp JavaScript của preview: đạt.
- Preview trong repo chạy bằng `npm run preview`, kết nối backend/MongoDB thật; quan sát Trang chủ sau đăng nhập, chuyển sang Hồ sơ hiển thị tài khoản đã xác thực.
- Các test social tự động dùng fixture ở ranh giới service cho kiểm tra lưu trữ/liên kết; không giả mạo thành công OAuth trong ứng dụng. Google OAuth thật đã được kiểm tra riêng trên môi trường local có cấu hình.

Các trường hợp auth gồm chuẩn hóa email/SĐT, băm bcrypt, JWT 15 phút, chặn tự gán admin, tài khoản trùng và đăng ký đồng thời, dữ liệu sai, operator injection, sai mật khẩu, token hết hạn/sai, tài khoản cũ và rate limit. Social test kiểm tra cookie HttpOnly, state, hết hạn, token giả, lưu subject và ngăn tự ghép email.

Lệnh kiểm tra (thay cổng MongoDB theo máy):

```bash
NODE_ENV=test \
MONGODB_URI=mongodb://127.0.0.1:27187/scanwaste_system_test \
TEST_MONGODB_URI=mongodb://127.0.0.1:27187/scanwaste_auth_test \
JWT_SECRET=local-system-test-secret JWT_EXPIRES_IN=15m \
npm test
```

Dùng database test riêng. API integration tạo dữ liệu và ảnh test; không chạy bộ test trên database thật.

## Giới hạn

Kết quả trên không chứng minh toàn bộ plan UC001 đã hoàn tất. Chưa triển khai refresh token, thu hồi phiên server, OTP/quên mật khẩu, sinh trắc học, điểm/referral hay dashboard admin. Trang chủ là khung, Hồ sơ là thông tin tài khoản cơ bản. Tải lại trang cần đăng nhập lại.

Chưa chạy Docker build hoặc GitHub Actions trong lượt kiểm tra local. Mongoose có cảnh báo deprecation cho tùy chọn `new` ở thao tác liên kết Google; test vẫn đạt. Cấu hình Google và dữ liệu tài khoản phải được thiết lập riêng trên máy khác.
