# Trang chủ EcoSort AI

Bổ sung giao diện Trang chủ theo mẫu đã duyệt trong cùng luồng đăng nhập và Hồ sơ hiện có. Không thay thiết kế/form đăng nhập, đăng ký, OTP, quên mật khẩu hoặc Hồ sơ. Các thay đổi trong app.js chỉ mở rộng điều hướng và thông báo khi đổi màn/hồ sơ/đăng xuất.

## Chạy local trên macOS

- Khởi động MongoDB, Redis và AI như cấu hình dự án.
- Chạy backend: `npm start` (máy kiểm tra đặt PORT=5010 trong .env).
- Chạy giao diện đăng nhập/Trang chủ/Hồ sơ: `npm run preview`, mở http://localhost:5173.
- Chạy màn Cửa hàng/Đổi quà/ESG nguyên bản: từ frontend, `npm ci` rồi `npm run web -- --port 8081`. Trang chủ mở màn đó trong khung giao diện; không sửa mã frontend của nhóm.
- SMTP và Google giữ cấu hình sẵn có, không đưa tài khoản/mật khẩu vào Git. Web vẫn giữ token trong bộ nhớ như trước, tải lại trang cần đăng nhập lại.

## Phạm vi

- Điểm, chuỗi hoạt động, số lần phân loại và huy hiệu đọc từ Hồ sơ.
- Hoạt động, lịch sử phân loại, ví voucher và thống kê gọi API hiện có bằng phiên hiện tại.
- Quét ảnh và phản hồi là giao diện gọi API phân loại/feedback hiện có; không thay quy tắc cộng điểm hay AI.
- Tra cứu dùng dữ liệu WASTE_CLASSES_VI/WASTE_DISPOSAL_TIPS từ ai.config.js, được lưu thành waste-guide.json để hiển thị.
- Điểm thu gom yêu cầu quyền vị trí, hiển thị kết quả của API stations và liên kết đường đi Google Maps.
- Không dùng số điểm mẫu trên ảnh để ghi vào tài khoản.

## Giới hạn giữ nguyên của code nhóm

Cửa hàng/Đổi quà trong frontend vẫn dùng state local và 350 điểm mẫu, chưa đồng bộ API. Trang chủ có thông báo trước khi mở màn này; không tự thay logic hoặc tạo giao dịch giả. Nghiệp vụ đó được ghi riêng trong báo cáo lỗi theo phạm vi người dùng yêu cầu.

## Kiểm tra

Đã kiểm tra cú pháp JavaScript, diff và giữ nguyên nguyên văn các section đăng nhập/đăng ký/OTP/quên mật khẩu/Hồ sơ. Kiểm tra trình duyệt dùng Chrome, tài khoản QA riêng và SMTP local, không chứng minh Gmail thật hay camera Android thật. Bộ test backend/Hồ sơ đã qua trên cùng develop ea00973; PR Trang chủ không thay mã nghiệp vụ backend.

Nhánh Trang chủ được xây trên nhánh Hồ sơ, cần merge PR Hồ sơ trước rồi review/merge PR Trang chủ vào develop để diff Trang chủ chỉ còn giao diện.
