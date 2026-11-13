# Đăng nhập Google

1. Tạo OAuth Client loại Web application trong Google Auth Platform.
2. Thêm Authorized JavaScript origins: `http://localhost:5173` và `http://127.0.0.1:5173`. Nếu dùng origin khác, khai báo chính xác origin đó.
3. Nếu ứng dụng ở chế độ Testing, thêm tài khoản thử nghiệm trong Audience.
4. Điền `GOOGLE_CLIENT_ID` và `SOCIAL_PUBLIC_ORIGIN=http://localhost:5173` vào `.env` ở gốc repo, rồi khởi động lại backend và preview.
5. Mở preview và chọn nút Google chính thức. Luồng GIS dùng ID token, không cần Client Secret hay redirect URI. Không commit `.env` hoặc thông tin xác thực.

Backend xác minh chữ ký, audience, thời hạn và nonce. Challenge lưu trong MongoDB, gắn với cookie HttpOnly, có state và chỉ dùng một lần. Tài khoản Google được lưu theo subject Google; lần đăng nhập sau dùng lại cùng tài khoản.

Nếu email đã có tài khoản mật khẩu, hãy đăng nhập tài khoản đó trước, mở Hồ sơ rồi liên kết Google. Không tự động ghép tài khoản chỉ vì email trùng.

API: `GET /api/auth/social/config`, `POST /api/auth/social/google/challenge`, `POST /api/auth/social/google`, `GET /api/users/me`. Apple đã được gỡ theo phạm vi đã thống nhất.
