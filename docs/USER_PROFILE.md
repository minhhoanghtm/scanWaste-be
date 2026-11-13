# Hồ sơ người dùng

Mở giao diện web đang dùng backend thật: chạy `npm start`, sau đó `npm run preview`.
Mặc định web ở http://localhost:5173. Trên macOS có thể đặt PORT=5010 trong .env nếu cổng 5000 đã được dùng.
MongoDB và Redis cần đang chạy. OTP giữ nguyên cơ chế xác thực có sẵn; SMTP cần được cấu hình riêng.

## Thay đổi

- GET /api/users/me: bổ sung avatarUrl, spentPoints, availablePoints; giữ nguyên totalPoints là tổng điểm đã tích.
- Điểm đã dùng bằng tổng pointsUsed trong ví voucher của chính tài khoản. Voucher hết hạn hoặc đã dùng không hoàn điểm. Điểm có thể đổi là max(0, totalPoints - spentPoints).
- PATCH /api/users/me: chỉnh tên/email/SĐT; chuẩn hóa SĐT Việt Nam; đổi email làm mất trạng thái đã xác minh. Không cho chỉnh điểm, vai trò hoặc đường dẫn avatar qua API này.
- POST /api/users/me/avatar: multipart/form-data, trường avatar, JPG/PNG/WEBP, tối đa MAX_FILE_SIZE; tên tệp do server tạo, kiểm tra chữ ký nhị phân.
- DELETE /api/users/me/avatar: xóa ảnh và trở lại chữ cái đại diện.
- GET /api/users/me/points/history?page=1&limit=10&type=all: lịch sử có phân trang, type là all/earned/redeemed, chỉ thuộc tài khoản đang đăng nhập.
- Giao diện Hồ sơ: sửa thông tin, đổi/xóa ảnh, ba số điểm, lịch sử tích/đổi điểm và quà đã đổi.

Lịch sử được đọc từ bản ghi phân loại có pointsEarned và ví voucher đang lưu; không tạo dữ liệu lịch sử giả cho các bản ghi cũ đã bị xóa. Chưa bổ sung nghiệp vụ đổi quà hay thay đổi quy tắc cộng điểm.

## Kiểm tra

`npm run test:profile`: 12 test tích hợp trên MongoDB/Redis thật, dùng tài khoản test riêng rồi dọn dữ liệu test; kiểm tra phân quyền, điểm cũ, voucher hết hạn/đã dùng, phân trang, dữ liệu nhập, upload ảnh, thay/xóa ảnh và giữ nguyên số điểm.
`npm test`: chạy bộ test hiện có cùng test hồ sơ. Bộ API/AI cần môi trường Python theo cấu hình PYTHON_BIN.
