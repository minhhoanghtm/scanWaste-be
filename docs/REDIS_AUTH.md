# Refresh token, thu hồi phiên và Redis — hướng dẫn test

Ngày: 29/10/2026. Nhánh local: `feature/auth-refresh-redis`, tách từ `develop` tại `4a2d272`. Chưa commit/push/merge. Đích tích hợp sau khi được đồng ý: PR feature → develop; không main.

Bản code riêng: `/Users/ryo/Downloads/scanWaste/scanWaste-be-redis-auth`.
Không sửa bản gốc `/Users/ryo/scanWaste-be` hoặc merge dang dở trong `scanWaste-be-login`.

## Đã bổ sung

- Hoàn tất OTP đăng nhập email/SĐT, hoàn tất OTP đăng ký và Google đều cấp access JWT + refresh token qua cùng session service. POST register chỉ gửi mã và trả 202; chưa tạo tài khoản.
- Access JWT mặc định 15 phút, có `sid`, `jti`, `av`, `type=access`. Mỗi request kiểm tra user, phiên Redis và blacklist.
- Refresh token ngẫu nhiên; Redis chỉ giữ SHA-256, không giữ token gốc. Dùng một lần, xoay bằng Lua atomic; thời hạn tuyệt đối 7 ngày từ lúc tạo phiên, không tự kéo dài mãi.
- Dùng lại refresh token đã tiêu thụ sẽ thu hồi toàn bộ phiên đó. Token sai ngẫu nhiên không đủ để thu hồi phiên của người khác. Client phải xếp hàng các request refresh (single flight); retry token cũ sau lỗi mạng có thể buộc đăng nhập lại.
- Logout xóa phiên Redis và blacklist access token hiện tại đến hết hạn. Mọi access token khác cùng `sid` cũng bị chặn vì phiên đã bị xóa.
- Logout-all và đổi mật khẩu tăng `authVersion` trong MongoDB; mọi phiên cũ mất hiệu lực ngay ở request xác thực kế tiếp, kể cả sau restart. Redis vẫn lưu record cũ đến TTL để tự dọn; record đó không còn được chấp nhận. Account vẫn thuộc MongoDB, không chuyển account vào Redis.
- OTP email 6 số: xác minh email và đặt lại mật khẩu có namespace khác nhau; HMAC digest, TTL 5 phút, tối đa 5 lần thử sai, resend sau 60 giây, tiêu thụ atomic một lần.
- Rate limit API, login, register, Google challenge, refresh và OTP dùng Redis dùng chung giữa các process. Redis không sẵn sàng thì trả 503, không hạ xuống session/rate limit trong RAM.
- Challenge Google hiện hữu vẫn dùng MongoDB; nó không phải refresh session hoặc OTP email. Không thay đổi luồng xác minh ID token Google.
- Giao diện EcoSort hiện hữu đã tích hợp xác minh email bằng OTP, quên/đặt lại mật khẩu, tự refresh khi access token hết hạn, đăng xuất phiên hiện tại và đăng xuất tất cả thiết bị. Giữ thiết kế đăng nhập/đăng ký/Hồ sơ cũ. Token chỉ trong RAM: tải lại trang phải login lại.

## Chạy trên macOS

Cần Node 22, MongoDB, Redis. Đã cài Redis bằng Homebrew, chưa bật `brew services` tự chạy lúc đăng nhập. MongoDB/Redis dùng cổng và thư mục dữ liệu riêng.

Mở các terminal riêng:

```bash
# Terminal 1: Redis
mkdir -p ~/Downloads/scanWaste/local-data/redis-auth
redis-server --bind 127.0.0.1 --port 6389 --appendonly yes \
  --maxmemory-policy noeviction \
  --dir ~/Downloads/scanWaste/local-data/redis-auth
```

```bash
# Terminal 2: MongoDB
mkdir -p ~/Downloads/scanWaste/local-data/mongodb-redis-auth
mongod --bind_ip 127.0.0.1 --port 27389 \
  --dbpath ~/Downloads/scanWaste/local-data/mongodb-redis-auth
```

```bash
# Chỉ dùng khi kiểm thử SMTP local, không dùng cho cấu hình Gmail hiện tại
cd ~/Downloads/scanWaste/scanWaste-be-redis-auth
npm ci
npm run mail:local
```

```bash
# Terminal 4: backend
cd ~/Downloads/scanWaste/scanWaste-be-redis-auth
npm start
```

```bash
# Terminal 5: giao diện EcoSort
cd ~/Downloads/scanWaste/scanWaste-be-redis-auth
npm run preview
```

- Backend: http://localhost:5010/api/health
- Swagger: http://localhost:5010/api/docs (chọn **Current server**).
- Giao diện để test: http://localhost:5173 khi chạy `npm run preview`. Cũng có thể chạy `npm start` tại `../scanWaste-auth-preview`; launcher này phục vụ cùng mã UI trong repo mới. Chỉ chạy một launcher trên cổng 5173.
- SMTP local: `127.0.0.1:2526`; không chuyển tiếp ra Internet.
- Email nhận được: `/Users/ryo/Downloads/scanWaste/scanWaste-be-redis-auth/local-mailbox/*.eml`. Mở file bằng Mail để đọc OTP. Đây là email thử trên máy, không phải email đã đến Gmail của người nhận.

Nếu cổng đang chạy thì không khởi động thêm một tiến trình trùng cổng. Ctrl+C trong từng terminal để dừng. `.env` local đã có secret ngẫu nhiên và được Git ignore; không chia sẻ file này.

## Gửi email thật

Đổi các biến trong `.env`, rồi restart backend:

```dotenv
SMTP_HOST=smtp-provider-cua-ban
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tai-khoan-smtp
SMTP_PASS=mat-khau-ung-dung-hoac-credential-smtp
SMTP_FROM=EcoSort AI <dia-chi-da-duoc-provider-cho-phep>
```

Cổng 465 dùng `SMTP_SECURE=true`. Production yêu cầu TLS/STARTTLS, `JWT_SECRET` và `OTP_SECRET` riêng. Không gửi password/private credential vào chat hoặc Git. Khi dùng Gmail, cần cơ chế SMTP được tài khoản cho phép; Google OAuth Client ID của đăng nhập ứng dụng không tự cấp quyền gửi email.

Tài liệu transport: [Nodemailer SMTP](https://nodemailer.com/smtp). Redis client: [node-redis](https://redis.io/docs/latest/develop/clients/nodejs/connect/). Store rate limit: [express-rate-limit data stores](https://express-rate-limit.mintlify.app/reference/stores).

Chưa kiểm chứng gửi email qua nhà cung cấp bên ngoài trong lượt này. Local SMTP và lỗi SMTP đã được kiểm thử.

## API và cách test bằng Postman

Import `docs/REDIS_AUTH.postman_collection.json`. Collection mặc định `baseUrl=http://localhost:5010/api`; điền email, SĐT Việt Nam, mật khẩu của tài khoản test. Register lưu registrationId; script sau login/register-verify/refresh tự cập nhật biến `accessToken`, `refreshToken`. Không chia sẻ collection đã export kèm token thật.

| Thao tác | Method và path (sau /api) | Body | Bearer |
|---|---|---|---|
| Đăng ký | POST /auth/register | name, email, phone, password, confirmPassword | Không |
| Hoàn tất đăng ký | POST /auth/register/verify | registrationId, otp | Không |
| Gửi lại mã đăng ký | POST /auth/register/resend | registrationId | Không |
| Đăng nhập | POST /auth/login | identifier hoặc email hoặc phone; password | Không |
| Hoàn tất đăng nhập | POST /auth/login/verify | loginChallengeId, otp | Không |
| Gửi lại OTP đăng nhập | POST /auth/login/resend | loginChallengeId | Không |
| Refresh | POST /auth/refresh | refreshToken | Không |
| Logout hiện tại | POST /auth/logout | {} | Có |
| Logout mọi thiết bị | POST /auth/logout-all | {} | Có |
| Hồ sơ | GET /users/me | — | Có |
| Gửi lại OTP xác minh | POST /auth/email/send-otp | {} | Có |
| Xác minh email | POST /auth/email/verify | otp (chuỗi 6 số) | Có |
| Quên mật khẩu | POST /auth/password/forgot | email | Không |
| Đặt lại mật khẩu | POST /auth/password/reset | email, otp, password, confirmPassword (tùy chọn) | Không |

**Luồng test refresh/revoke:** Register → Register Verify (hoặc Login → Login Verify) → GET me = 200 → Refresh (lưu cặp mới) → GET me = 200 → Logout → GET me và Refresh đều = 401. Để kiểm tra replay, giữ lại refresh token cũ trước khi gọi refresh; gửi lại nó sẽ nhận `REFRESH_TOKEN_REUSED` và phiên đó bị thu hồi.

**Luồng đăng ký:** Register → 202/pending_verification (chưa có user/token) → đọc OTP email → điền biến `otp` → Register Verify → 201, tạo tài khoản đã xác minh và phiên đăng nhập. registrationId gắn riêng với dữ liệu đăng ký; API verify không nhận lại tên/email/mật khẩu từ client. Gửi lại cùng OTP bị từ chối. Gửi lại mã trong 60 giây bị 429.

**Luồng reset:** Forgot → đọc email mới → Reset → password cũ không login được, password mới login được; token và refresh token của những phiên trước reset đều bị từ chối. Email chưa tồn tại hoặc account chỉ Google nhận cùng phản hồi public 202, không gửi mã đặt mật khẩu cho account Google-only.

**Trạng thái gửi:** Register chỉ trả 202 sau khi SMTP chấp nhận thư. SMTP lỗi hoặc chưa cấu hình trả 503 và không tạo tài khoản; dữ liệu OTP gửi lỗi bị xóa. Public Forgot vẫn trả thông báo chung để tránh lộ sự tồn tại của tài khoản.

**Chính sách hiện tại:** Tài khoản đăng ký mới bằng form bắt buộc xác minh OTP trước khi tạo trong MongoDB. Tài khoản cũ được giữ nguyên; API `/email/*` vẫn hỗ trợ xác minh email cho chúng. Google dùng email đã xác minh từ ID token, không yêu cầu OTP đăng ký form. Đăng ký chờ hết hạn hoặc nhập sai 5 lần thì quay lại form; không giữ dữ liệu chờ vô thời hạn. Nếu tạo user thành công nhưng cấp phiên lỗi, người dùng có thể đăng nhập lại.

## Migration và vận hành

1. Backend nay bắt buộc có Redis. JWT cũ không có session sẽ bị từ chối: người dùng phải đăng nhập lại một lần sau nâng cấp. Account cũ không bị xóa; `authVersion` chưa có được hiểu là 0.
2. Client nhận thêm `refreshToken`, `expiresIn`, `refreshExpiresIn`, `tokenType`; trường `token` cũ vẫn là access token. Mobile lưu refresh trong secure storage; bản web production cần đánh giá BFF/cookie HttpOnly, không copy token vào localStorage. Preview dùng RAM để test.
3. Redis session/OTP/blacklist không dùng chung vùng cache có eviction. Compose thêm Redis nội bộ, AOF và noeviction. Backup/restore toàn bộ trạng thái auth cần kiểm soát, không phục hồi bản Redis cũ làm sống lại phiên đã revoke. Thiết kế hiện nhắm Redis standalone, chưa cam kết Redis Cluster/failover.
4. Khi chạy nhiều backend, dùng cùng Redis namespace và cùng JWT/OTP secrets. Môi trường test/staging/production dùng namespace hoặc Redis riêng. Không dùng `FLUSHALL` để dọn test.
5. Giới hạn hiện tại: API 300/15 phút/IP; login 20 lần thất bại/15 phút/IP; register 20/15 phút/IP; challenge Google 20/15 phút/IP; refresh 120/15 phút/IP; OTP 30/15 phút/IP, thêm cooldown theo email và purpose. Không tin X-Forwarded-For mặc định; nếu đặt reverse proxy phải cấu hình đúng số proxy tin cậy, không bật trust proxy tùy tiện.
6. Đã khôi phục Google Client ID local từ cấu hình ứng dụng cũ, dùng origin đã đăng ký http://localhost:5173. Chưa kiểm thử đăng nhập Google trực tiếp trong lần tích hợp Redis này. Các test social dùng fixture ở ranh giới identity đã xác minh, không thay cho đăng nhập Google thật.
7. Chưa chạy Docker build vì Docker daemon chưa hoạt động. `docker compose config --quiet` cho cả hai file đạt. Lưu ý nền repo có vấn đề build context/đường dẫn model của container AI; chưa sửa phần AI ngoài phạm vi auth, không coi toàn bộ Compose đã chạy được.

## Kiểm thử đã thực hiện

Ngày 29/10/2026, Node 22.23.2, Redis 8.10.3, MongoDB riêng trên 27389:

- Unit AI và Auth: đạt.
- Auth integration: 10/10.
- Google security/persistence integration: 8/8 (không phải OAuth live).
- Redis session/OTP integration: 13/13, SMTP receiver thật trên loopback.
- API/AI integration: 196 assertions đạt, 0 lỗi; chạy FastAPI/TFLite thật ở môi trường test.
- `npm audit --omit=dev`: 0 lỗ hổng được báo tại thời điểm kiểm tra.
- Compose config và syntax JavaScript/JSON: đã kiểm tra; chưa build/chạy Docker và chưa chạy GitHub Actions.

Các test mới kiểm tra hash/TTL, rotation, replay và refresh đồng thời; logout một/toàn bộ thiết bị; session hết hạn/legacy JWT; OTP dùng một lần, sai 5 lần, hết hạn, resend, tiêu thụ đồng thời; reset mật khẩu thu hồi phiên; SMTP lỗi; rate limit dùng chung hai HTTP server; Redis lỗi ở service và HTTP.

Chạy riêng bộ mới:

```bash
REDIS_URL=redis://127.0.0.1:6389 \
TEST_MONGODB_URI=mongodb://127.0.0.1:27389/scanwaste_session_test \
npm run test:session
```

Bộ này tự mở SMTP test trên cổng ngẫu nhiên, không dùng SMTP cá nhân, tạo user riêng và dọn user/key thuộc namespace test của nó. Các bộ auth/social/API đã tắt SMTP cá nhân khi chạy test.

Chạy hồi quy toàn bộ (cần Python venv có dependency AI):

```bash
NODE_ENV=test REDIS_URL=redis://127.0.0.1:6389 \
MONGODB_URI=mongodb://127.0.0.1:27389/scanwaste_api_test \
TEST_MONGODB_URI=mongodb://127.0.0.1:27389/scanwaste_auth_test \
PYTHON_BIN=/Users/ryo/Downloads/scanWaste/ai-merge-test-venv/bin/python \
npm test
```

Không trỏ các lệnh test vào database tài khoản thật. GitHub CI đã bổ sung Redis và bộ session/OTP, nhưng chỉ chạy trên remote sau khi bạn cho phép push.

## Kiểm thử trực tiếp trên giao diện — 29/10/2026

Đã chạy trình duyệt Chrome ở 390 × 844 với backend, MongoDB, Redis và SMTP local thật:

- Đăng ký mở màn xác minh email; OTP sai hiện lỗi, OTP đúng mở Trang chủ.
- Access token hết hạn được làm mới tự động khi lấy Hồ sơ (dùng token hết hạn có chữ ký của tài khoản test để kích hoạt nhánh này).
- Đăng xuất thu hồi phiên ở backend.
- Quên mật khẩu → đọc OTP trong hộp thư local → đặt mật khẩu mới → đăng nhập.
- Mật khẩu cũ bị từ chối, mật khẩu mới hoạt động; đăng xuất tất cả từ Hồ sơ hoạt động.
- Không tràn ngang ở 390px, không có lỗi JavaScript pageerror.

Tài khoản và email thử của lượt kiểm tra đã được dọn. Form đăng ký mới bắt buộc OTP trước khi tạo user; tài khoản cũ vẫn được hỗ trợ qua luồng xác minh email riêng. Database test riêng không tự chứa tài khoản của bản preview cũ.

## Gửi Gmail thật — cập nhật cấu hình

Cấu hình local đã chuyển từ SMTP loopback sang `smtp.gmail.com:465` với TLS. Địa chỉ gửi mặc định là minhtris221@gmail.com. Chưa có Mật khẩu ứng dụng nên chưa thể xác thực hoặc gửi email thật; backend trả lỗi cấu hình thay vì báo gửi thành công. Các hướng dẫn hộp thư local phía trên chỉ còn áp dụng cho kiểm thử local.

1. Bật xác minh 2 bước cho tài khoản Google: https://myaccount.google.com/security.
2. Mở https://myaccount.google.com/apppasswords và tạo Mật khẩu ứng dụng tên EcoSort AI.
3. Trong Terminal trên máy:

```bash
cd ~/Downloads/scanWaste/scanWaste-be-redis-auth
npm run mail:setup
```

Lệnh hỏi Gmail và mật khẩu ứng dụng (nhập ẩn), kiểm tra xác thực SMTP trước khi lưu `.env`, sau đó gửi một email kiểm tra đến chính Gmail vừa nhập. Không gửi mật khẩu vào chat. Không dùng mật khẩu đăng nhập Gmail thông thường. Nếu Google không cho tạo App password, cần kiểm tra chính sách tài khoản hoặc chuyển sang OAuth SMTP/dịch vụ gửi thư được cấp quyền.

4. Khởi động lại backend sau khi cấu hình thành công; bấm Gửi lại mã trong giao diện. Mã cũ không dùng lại.
5. Test cả xác minh email lẫn quên mật khẩu bằng OTP nhận trên điện thoại. SMTP chấp nhận thư chưa đảm bảo thư vào Inbox, cần kiểm tra Spam và việc nhận thực tế.

Nguồn Google: https://support.google.com/accounts/answer/185833 và https://support.google.com/mail/answer/7104828.

## Kiểm chứng thay đổi đăng ký trước OTP

- 6/6 ca đăng ký với SMTP loopback thật: chưa có user/token, sai 5 lần, hết hạn, resend/cooldown, xác minh đồng thời chỉ tạo một user, lỗi SMTP và thiếu cấu hình không tạo user.
- 10/10 auth, 13/13 session/OTP, unit tests đạt; API/AI hồi quy 196 assertions đạt.
- Chrome 390px: form → mã sai không có user → mã đúng mới tạo user và vào Trang chủ → logout/login; không pageerror hoặc tràn ngang. Browser kiểm thử dùng backend/SMTP riêng, không thay cấu hình Gmail của app.
- Chưa kiểm chứng nhận Gmail thật vì chưa có App Password. Không commit/push/merge.

## OTP đăng nhập — 30/10/2026

Email/SĐT + mật khẩu đúng → `POST /auth/login` trả 202 và gửi mã đến email tài khoản. Redis chỉ lưu challenge gồm userId, email, authVersion, HMAC OTP và TTL 5 phút; chưa tạo session, chưa cấp JWT/refresh token. `POST /auth/login/verify` đúng mã mới cấp phiên. OTP dùng một lần, sai 5 lần bị hủy; gửi lại sau 60 giây. Password reset hoặc logout-all làm challenge cũ mất hiệu lực nhờ authVersion. Google không thêm OTP email theo lựa chọn của người dùng.

Giao diện dùng lại màn OTP với tiêu đề Xác nhận đăng nhập. Nếu SMTP thiếu cấu hình hoặc gửi lỗi, ứng dụng báo lỗi và không cấp token. Gmail thật hiện vẫn cần App Password của tài khoản gửi.

Đã kiểm thử trên màn hình bản riêng cổng 5175 cùng code, Mongo/Redis và SMTP local thật; chỉ access TTL rút xuống 10 giây để quan sát, app chính 5173 vẫn 15 phút. Quan sát: OTP sai bị từ chối; đúng mã vào Hồ sơ; `/users/me` 401 TOKEN_EXPIRED → `/auth/refresh` 200 → `/users/me` 200; logout xóa Redis session, blacklist có TTL và cả token cũ/refresh cũ trả 401; đăng nhập sai vượt hạn trả 429 và hiển thị thông báo. Bằng chứng ở `../kiem-thu-auth-20261030/`. Đây không phải bằng chứng nhận Gmail thật.
