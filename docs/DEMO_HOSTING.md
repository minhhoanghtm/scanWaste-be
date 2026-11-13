# Demo miễn phí: URL HTTPS và OTP email thật

Dùng file `render.demo.yaml`, không dùng cấu hình production hiện có để tự thay đổi dịch vụ của nhóm. Mục tiêu là demo ngoài mạng nội bộ; chưa phải môi trường phục vụ khách ổn định.

## Những gì code này cung cấp

- Hai web service riêng: backend/AI và giao diện web hiện có trong `tools/auth-preview`. Không đưa source React Native đã xóa trở lại BE.
- Giao diện dùng `BACKEND_URL` làm proxy cùng origin cho API, OAuth cookie và toàn bộ `/uploads`; ảnh không còn gọi cổng 5010 trên máy người xem.
- `REWARDS_PUBLIC_URL` tùy chọn: URL HTTPS của FE đổi quà do nhóm triển khai riêng. Khi chưa có, thông báo chưa kết nối thay vì gọi localhost của khách.
- `EMAIL_PROVIDER=brevo` gửi OTP bằng API HTTPS. SMTP vẫn là mặc định cho các môi trường hiện có. Không gửi email giả khi thiếu cấu hình hoặc nhà cung cấp từ chối.
- API key chỉ ở backend. File runtime-config.json của web chỉ trả URL đổi quà.

## Tài khoản cần tạo

1. Render: https://dashboard.render.com/ — đăng nhập bằng tài khoản được phép truy cập repo.
2. MongoDB Atlas: https://www.mongodb.com/cloud/atlas/register — tạo cluster free nếu tài khoản được cung cấp lựa chọn đó, tạo user database và cho phép các IP outbound của backend Render. Lưu URI có database riêng cho demo.
3. Brevo: https://www.brevo.com/ — chọn Free, xác minh tài khoản và sender theo yêu cầu nhà cung cấp, bật transactional email, tạo API key. Dịch vụ có thể yêu cầu xét duyệt sender/domain trước khi gửi. Dùng API key, không phải SMTP key.

Không gửi mật khẩu/API key vào chat, Git hoặc file frontend. Nếu bước tạo tài khoản yêu cầu đồng ý điều khoản hoặc nhập thông tin cá nhân, chủ tài khoản tự hoàn thành.

## Tạo dịch vụ từ Blueprint

Sau khi PR được review và merge vào develop:

1. Render → New → Blueprint → chọn repo → nhánh `develop` → Blueprint Path `render.demo.yaml`. Kiểm tra cả ba dịch vụ đều là free trước khi tạo.
2. Backend `scanwaste-demo-api`:
   - `MONGODB_URI`: URI Atlas của database demo.
   - `BREVO_API_KEY`: API key ở backend.
   - `BREVO_SENDER_EMAIL`: sender đã được Brevo chấp thuận.
   - `GOOGLE_CLIENT_ID`: OAuth Client Web của nhóm.
   - `SOCIAL_PUBLIC_ORIGIN`: URL HTTPS thực tế của web sau khi Render cấp.
   - JWT/OTP secrets tự sinh trong Blueprint. Redis lấy kết nối nội bộ từ dịch vụ Key Value.
3. Web `scanwaste-demo-web`: `BACKEND_URL` = URL HTTPS thực tế của backend (không thêm /api và không dùng localhost). Chỉ đặt biến backend/SMTP ở backend, không đưa API key vào web.
4. Render có thể thêm hậu tố vào tên dịch vụ nếu trùng. Điền URL thực tế, không đoán URL. Nếu quy trình tạo yêu cầu điền URL trước khi URL được cấp, tạo backend/Redis trước; sau đó tạo web và cập nhật `SOCIAL_PUBLIC_ORIGIN`, deploy lại backend/web.
5. Google Cloud → đúng OAuth Client → Authorized JavaScript origins → thêm chính xác origin HTTPS của web, không có dấu / ở cuối. Việc thêm origin cần chủ tài khoản chấp thuận. Với luồng Google Identity Services hiện tại không tự thêm redirect URI không tồn tại. Kiểm tra Audience/testing và người dùng thử theo chính sách Google.
6. Tắt auto deploy (Blueprint đã đặt false). Mỗi lần deploy chọn đúng commit đã review.

Frontend Expo đổi quà vẫn là dự án riêng; Blueprint này không tự tích hợp mobile hoặc dữ liệu mẫu của nó vào API.

## Kiểm chứng trước khi gửi link

- Mở `https://<web>/api/health`: database phải connected.
- `/api/ai/health` phải báo mô hình sẵn sàng. AI thật có thể vượt tài nguyên free; chỉ có thể xác nhận sau khi build/chạy trên hosting.
- `/api/auth/social/config`: Google enabled và đúng Client ID.
- Tạo tài khoản bằng email do người test kiểm soát; xác nhận thư đã vào Inbox/Spam, rồi nhập OTP. API nhận messageId chỉ chứng minh nhà cung cấp nhận thư, không chứng minh đã đến hộp thư.
- Thử OTP sai, đúng, gửi lại, đăng nhập và đăng xuất. Không thu thập mật khẩu hay OTP của khách trong log.
- Đăng nhập Google thật từ Safari/Chrome của người test sau khi thay đổi origin có hiệu lực.
- Upload ảnh, đọc lại lịch sử; kiểm tra URL ảnh cùng origin web. Xác nhận giới hạn lưu trữ demo bên dưới trước khi dùng dữ liệu cần giữ.

## Giới hạn đã biết

Render Free có thể sleep/cold start, hết quota giờ miễn phí hoặc restart. Web và API chia sẻ quota theo workspace. Redis Free không bảo đảm giữ session/OTP khi restart. Upload trên đĩa container có thể mất khi redeploy/restart; Atlas giữ dữ liệu nhưng không giữ các file ảnh đó. Không xem đây là cấu hình production, không dùng làm nơi lưu ảnh quan trọng. Nhắc voucher vẫn dùng SMTP cũ; nhánh này chỉ bổ sung HTTPS cho OTP. Free SMTP của Render bị chặn nên nhắc voucher chưa hoạt động qua Brevo.

Chưa triển khai trên tài khoản thật, chưa gửi email Brevo thật, chưa xác minh tài nguyên AI trên Render Free. Cần hoàn thành các bước tài khoản/cấu hình trên mới có URL hosting độc lập với MacBook. Tunnel local không thay thế bước này.

## Tài liệu nhà cung cấp

- Blueprint: https://render.com/docs/blueprint-spec
- Free hosting và giới hạn: https://render.com/docs/free
- Render chặn SMTP free: https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports
- Brevo HTTPS email: https://developers.brevo.com/docs/send-a-transactional-email
- Brevo plans: https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans
