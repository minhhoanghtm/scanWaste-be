# EcoSort: giao diện kiểm tra xác thực

Giao diện web responsive theo mẫu đăng nhập/đăng ký EcoSort: nền sáng tím/xanh, thẻ trắng bo góc, nút xanh. Dùng API và MongoDB thật, không tự tạo phiên giả. Đây là bản web phục vụ tích hợp, chưa phải ứng dụng React Native/Flutter.

## Chạy trên macOS

Từ thư mục gốc repo, dùng Node.js 20.19 trở lên và MongoDB đang chạy:

```bash
npm ci
cp .env.example .env  # chỉ khi chưa có .env
```

Điền `MONGODB_URI`, một `JWT_SECRET` riêng và `PORT` phù hợp trong `.env`. Trên macOS có thể dùng `PORT=5010` nếu cổng 5000 đã bị chiếm.

Terminal thứ nhất (gốc repo): `npm start`.
Terminal thứ hai (gốc repo): `npm run preview`.
Mở http://localhost:5173. Preview đọc cổng backend từ `.env` và proxy `/api`. Không cần cài dependency riêng cho giao diện.

Google cần cấu hình theo [hướng dẫn](../../docs/AUTH_GOOGLE.md). Dữ liệu local và `.env` không đi kèm Git; mỗi máy cần database/cấu hình riêng. Tạo tài khoản qua form rồi đăng xuất và đăng nhập lại bằng email hoặc SĐT để kiểm tra lưu trữ.

## Phạm vi

- Đăng ký, đăng nhập email/SĐT hoặc Google → Trang chủ khung → Hồ sơ thật từ `/api/users/me`.
- Đăng nhập xong mặc định vào Trang chủ. Liên kết Google từ Hồ sơ sẽ giữ nguyên màn Hồ sơ.
- Hiển thị lỗi nhập liệu, email/SĐT trùng, sai mật khẩu; hiện/ẩn mật khẩu và độ mạnh mật khẩu.
- Chỉ Google và email/SĐT; đã bỏ Apple.
- Trang chủ là khung để test điều hướng, chưa tích hợp trang chủ của nhóm. Hồ sơ hiển thị thông tin tài khoản, chưa có huy hiệu/voucher/thống kê như thiết kế đầy đủ.
- Access token chỉ ở bộ nhớ; tải lại trang cần đăng nhập lại. Ghi nhớ chỉ lưu email/SĐT. Đăng xuất xóa token tại trình duyệt, chưa thu hồi token trên server.
- Chưa có refresh token, quên mật khẩu, xác minh email bằng OTP, sinh trắc học, referral/điểm thưởng, hoặc dashboard admin. Các phần chưa có được vô hiệu hóa/ghi chú trong giao diện.
