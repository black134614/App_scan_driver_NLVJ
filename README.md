# App Tracking Tài Xế Ra Vào Cổng

Web app theo dõi tài xế xuất hàng: tài xế quét QR cổng bằng camera, quét nhiều đơn hàng (đơn ghép), bắt đầu / kết thúc xuất hàng; kèm dashboard trực quan theo cổng và xe.

## Tính năng

- **Trang tài xế (`/`)** – tối ưu cho điện thoại (mobile-first), 5 bước:
  1. Nhập tên tài xế + biển số xe.
  2. Quét QR **cổng xuất hàng** bằng camera → tạo phiên.
  3. Quét nhiều **đơn hàng xuất** (đơn ghép), chặn quét trùng, có nút xóa đơn quét sai.
  4. Bấm **Bắt đầu xuất hàng** → hệ thống ước tính hoàn thành sau 30 phút và đếm ngược.
  5. Bấm **Xuất xong** → ghi lại thời điểm hoàn thành thực tế.
- **Dashboard quản lý (`/dashboard`)** – lưới các cổng và xe, đồng hồ đếm ngược 30 phút (đỏ khi quá giờ), thống kê nhanh, lịch sử phiên hoàn thành trong ngày. Tự làm mới mỗi 3 giây (polling).

## Công nghệ

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- SQLite qua `@libsql/client` — local: file `data/tracking.db`; production (Vercel): [Turso](https://turso.tech)
- Quét QR/mã vạch bằng camera trình duyệt qua `@yudiel/react-qr-scanner`

## Chạy dự án

```bash
npm install
npm run dev
```

Mở http://localhost:3000 (trang tài xế) và http://localhost:3000/dashboard (bảng theo dõi).

Build production:

```bash
npm run build
npm run start
```

## Deploy lên Vercel (database)

Vercel **không hỗ trợ** ghi file SQLite local. App dùng **Turso** (SQLite trên cloud, miễn phí tier).

### Bước 1: Tạo database Turso

1. Đăng ký tại https://turso.tech và cài CLI (hoặc tạo DB trên dashboard web).
2. Tạo database:

```bash
turso db create gate-tracking
turso db show gate-tracking --url
turso db tokens create gate-tracking
```

3. Lấy 2 giá trị:
   - **URL** dạng `libsql://gate-tracking-xxx.turso.io`
   - **Auth token** (chuỗi dài)

### Bước 2: Thêm biến môi trường trên Vercel

Vào project Vercel → **Settings → Environment Variables**, thêm:

| Tên | Giá trị |
| --- | --- |
| `TURSO_DATABASE_URL` | URL từ bước 1 |
| `TURSO_AUTH_TOKEN` | Token từ bước 1 |
| `ADMIN_SECRET` | Mã PIN trang `/ql-du-lieu` (tùy chọn) |

### Bước 3: Redeploy

Sau khi thêm biến môi trường, bấm **Redeploy** trên Vercel. Schema bảng tự tạo khi API chạy lần đầu.

**Local dev:** không cần Turso — app tự dùng file `data/tracking.db`.

## Quan trọng: camera cần HTTPS

Trình duyệt chỉ cho phép truy cập camera ở `localhost` hoặc qua **HTTPS**. Khi test trên điện thoại thật (không phải localhost), hãy chạy sau một domain/HTTPS, ví dụ dùng tunnel:

```bash
npx localtunnel --port 3000
# hoặc
ngrok http 3000
```

Rồi mở link `https://...` mà công cụ trả về trên điện thoại và cấp quyền camera.

## Định dạng QR

App dùng QR chứa **text đơn giản**, nội dung QR chính là giá trị được lưu:

- **QR cổng**: text dạng `GATE-01`, `GATE-02`, ... (dùng làm mã cổng hiển thị trên dashboard).
- **QR đơn hàng**: text là mã đơn, ví dụ `DH-2026-0001`.

### Cách tạo QR để test nhanh

- Online: vào bất kỳ trang "QR code generator" nào, nhập text `GATE-01` rồi tạo ảnh QR để in/dán tại cổng; tương tự tạo QR cho từng mã đơn.
- Hoặc dùng thư viện dòng lệnh:

```bash
npx qrcode "GATE-01" -o gate-01.png
npx qrcode "DH-2026-0001" -o don-1.png
```

Ngoài QR, scanner cũng đọc được các mã vạch phổ biến (Code 128, Code 39, EAN-13, EAN-8, Data Matrix, PDF417).

## API

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| `GET` | `/api/sessions` | Danh sách phiên (cho dashboard) |
| `POST` | `/api/sessions` | Tạo phiên (`driverName`, `vehiclePlate`, `gateCode`) |
| `GET` | `/api/sessions/:id` | Chi tiết 1 phiên |
| `POST` | `/api/sessions/:id/orders` | Thêm đơn (`orderCode`), chặn trùng (409) |
| `DELETE` | `/api/sessions/:id/orders/:orderId` | Xóa đơn quét sai |
| `POST` | `/api/sessions/:id/start-export` | Bắt đầu xuất (ước tính +30 phút) |
| `POST` | `/api/sessions/:id/finish` | Ghi nhận xuất xong |

## Cấu trúc thư mục

```
app/
  page.tsx                 # Trang tài xế (5 bước)
  dashboard/page.tsx       # Dashboard quản lý
  api/sessions/...         # Route handlers
components/
  QrScanner.tsx            # Camera scanner (dynamic, ssr:false)
  GateCard.tsx             # Thẻ hiển thị cổng/xe trên dashboard
lib/
  db.ts                    # Khởi tạo SQLite + schema
  sessions.ts              # Truy vấn nghiệp vụ
  types.ts                 # Kiểu dữ liệu dùng chung
  format.ts                # Tiện ích định dạng thời gian
data/tracking.db           # SQLite (tự tạo, đã .gitignore)
```

## Ghi chú

- File SQLite nằm trong `data/` và đã được loại khỏi git. Xóa thư mục `data/` để reset toàn bộ dữ liệu.
- Thời gian ước tính xuất hàng (30 phút) cấu hình tại `EXPORT_ESTIMATE_MINUTES` trong [lib/types.ts](lib/types.ts).
